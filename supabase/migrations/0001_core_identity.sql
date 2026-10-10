-- =====================================================================
-- 0001_core_identity.sql
-- SIMASPRAJA Phase 1: organisasi, profil, peran/izin, scope, audit, pengaturan
-- =====================================================================
create extension if not exists pgcrypto;

create schema if not exists app;
grant usage on schema app to authenticated;

-- ---------- utilitas umum ----------
create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Blokir UPDATE/DELETE/TRUNCATE (tabel append-only)
create or replace function app.block_modification() returns trigger
language plpgsql as $$
begin
  raise exception 'Tabel % bersifat append-only; perubahan dan penghapusan tidak diizinkan', tg_table_name
    using errcode = '42501';
end $$;

-- ---------- organisasi ----------
create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name       text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_organizations_touch before update on public.organizations
  for each row execute function app.touch_updated_at();

-- ---------- peran & izin (data referensi global) ----------
create table public.roles (
  code        text primary key check (code in ('admin','ppk','pptk','ppbj')),
  name        text not null,
  description text
);

create table public.permissions (
  code        text primary key,
  module      text not null,
  description text not null
);

create table public.role_permissions (
  role_code       text not null references public.roles(code) on delete cascade,
  permission_code text not null references public.permissions(code) on delete cascade,
  primary key (role_code, permission_code)
);

-- ---------- profil pengguna ----------
create table public.profiles (
  id                   uuid primary key references auth.users(id) on delete restrict,
  organization_id      uuid not null references public.organizations(id),
  username             text not null,
  full_name            text not null,
  nip                  text,
  position_title       text,
  phone                text,
  status               text not null default 'active'
                         check (status in ('active','suspended','disabled')),
  must_change_password boolean not null default true,
  mfa_required         boolean not null default false,
  last_login_at        timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9._-]{3,32}$')
);
create unique index profiles_username_uk on public.profiles (username);
create index profiles_org_idx on public.profiles (organization_id);
create trigger trg_profiles_touch before update on public.profiles
  for each row execute function app.touch_updated_at();

-- Email internal Supabase Auth. TIDAK PERNAH dapat dibaca browser:
-- RLS aktif tanpa kebijakan + semua hak akses dicabut. Hanya service role (server).
create table public.auth_identities (
  profile_id     uuid primary key references public.profiles(id) on delete cascade,
  internal_email text not null unique,
  created_at     timestamptz not null default now()
);

-- Percobaan login (throttling & forensik). Hanya service role.
create table public.auth_attempts (
  id            bigint generated always as identity primary key,
  username_hash text not null,
  ip_hash       text not null,
  succeeded     boolean not null,
  attempted_at  timestamptz not null default now()
);
create index auth_attempts_user_idx on public.auth_attempts (username_hash, attempted_at desc);
create index auth_attempts_ip_idx   on public.auth_attempts (ip_hash, attempted_at desc);

-- ---------- penugasan peran ----------
create table public.user_roles (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role_code  text not null references public.roles(code),
  granted_by uuid references public.profiles(id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role_code)
);

-- Scope berbasis penugasan. scope_id NULL hanya untuk scope_type='organization'.
create table public.user_scopes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  scope_type text not null check (scope_type in
               ('organization','program','activity','sub_activity','budget_item')),
  scope_id   uuid,
  granted_by uuid references public.profiles(id),
  granted_at timestamptz not null default now(),
  constraint user_scopes_id_ck check
    ((scope_type = 'organization' and scope_id is null)
  or (scope_type <> 'organization' and scope_id is not null))
);
create unique index user_scopes_uk on public.user_scopes
  (user_id, scope_type, coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ---------- pengaturan aplikasi ----------
create table public.application_settings (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  key             text not null,
  value           jsonb not null,
  description     text,
  updated_by      uuid references public.profiles(id),
  updated_at      timestamptz not null default now(),
  unique (organization_id, key)
);
create trigger trg_settings_touch before update on public.application_settings
  for each row execute function app.touch_updated_at();

-- ---------- log audit (append-only) ----------
create table public.audit_logs (
  id              bigint generated always as identity primary key,
  organization_id uuid,
  occurred_at timestamptz not null default now(),
  actor_id    uuid,
  action      text not null,           -- INSERT/UPDATE/DELETE atau peristiwa (LOGIN_SUCCESS, dst.)
  table_name  text,
  record_id   text,
  old_data    jsonb,
  new_data    jsonb,
  context     jsonb,
  ip_hash     text
);
create index audit_logs_time_idx  on public.audit_logs (occurred_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, occurred_at desc);
create index audit_logs_rec_idx   on public.audit_logs (table_name, record_id);

create trigger trg_audit_logs_immutable before update or delete on public.audit_logs
  for each row execute function app.block_modification();
create trigger trg_audit_logs_no_truncate before truncate on public.audit_logs
  for each statement execute function app.block_modification();

-- Pemicu audit generik
create or replace function app.audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare o jsonb; n jsonb;
begin
  if tg_op = 'DELETE' then o := to_jsonb(old); n := null;
  elsif tg_op = 'INSERT' then o := null; n := to_jsonb(new);
  else o := to_jsonb(old); n := to_jsonb(new);
  end if;
  insert into public.audit_logs (organization_id, actor_id, action, table_name, record_id, old_data, new_data)
  values (coalesce((n->>'organization_id')::uuid, (o->>'organization_id')::uuid, app.current_org()),
          auth.uid(), tg_op, tg_table_name, coalesce(n->>'id', o->>'id'), o, n);
  return coalesce(new, old);
end $$;

-- ---------- fungsi bantu otorisasi ----------
create or replace function app.current_org() returns uuid
language sql stable security definer set search_path = public as $$
  select organization_id from public.profiles
  where id = auth.uid() and status = 'active'
$$;

create or replace function app.has_role(p_role text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles ur
    join public.profiles pr on pr.id = ur.user_id and pr.status = 'active'
    where ur.user_id = auth.uid() and ur.role_code = p_role)
$$;

create or replace function app.has_permission(p_permission text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles ur
    join public.profiles pr on pr.id = ur.user_id and pr.status = 'active'
    join public.role_permissions rp on rp.role_code = ur.role_code
    where ur.user_id = auth.uid() and rp.permission_code = p_permission)
$$;

-- ---------- pencegahan eskalasi peran ----------
create or replace function app.guard_role_assignment() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_target uuid; v_org_actor uuid; v_org_target uuid;
begin
  -- Service role (auth.uid() null) dipakai server setelah pemeriksaan eksplisit.
  if auth.uid() is null then return coalesce(new, old); end if;
  v_target := coalesce(new.user_id, old.user_id);
  if not app.has_permission('users.manage') then
    raise exception 'Tidak berwenang mengelola peran' using errcode = '42501';
  end if;
  if v_target = auth.uid() then
    raise exception 'Tidak diizinkan mengubah peran atau scope milik sendiri' using errcode = '42501';
  end if;
  select organization_id into v_org_actor  from public.profiles where id = auth.uid();
  select organization_id into v_org_target from public.profiles where id = v_target;
  if v_org_actor is distinct from v_org_target then
    raise exception 'Pengguna berada di luar organisasi' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;

create trigger trg_user_roles_guard before insert or update or delete on public.user_roles
  for each row execute function app.guard_role_assignment();
create trigger trg_user_scopes_guard before insert or update or delete on public.user_scopes
  for each row execute function app.guard_role_assignment();

-- ---------- audit pada tabel identitas ----------
create trigger trg_audit_profiles   after insert or update or delete on public.profiles
  for each row execute function app.audit_trigger();
create trigger trg_audit_user_roles after insert or update or delete on public.user_roles
  for each row execute function app.audit_trigger();
create trigger trg_audit_user_scopes after insert or update or delete on public.user_scopes
  for each row execute function app.audit_trigger();
create trigger trg_audit_settings   after insert or update or delete on public.application_settings
  for each row execute function app.audit_trigger();

-- ---------- data referensi: peran & izin ----------
insert into public.roles (code, name, description) values
  ('admin','Admin','Administrator sistem dan data master'),
  ('ppk','PPK','Pejabat Pembuat Komitmen'),
  ('pptk','PPTK','Pejabat Pelaksana Teknis Kegiatan'),
  ('ppbj','PPBJ','Pejabat Pengadaan Barang/Jasa');

insert into public.permissions (code, module, description) values
  ('dashboard.view','dashboard','Melihat dasbor'),
  ('dashboard.export','dashboard','Mengekspor data dasbor'),
  ('budget.view','budget','Melihat anggaran'),
  ('budget.edit','budget','Membuat/mengubah anggaran'),
  ('budget.import','budget','Mengimpor anggaran'),
  ('budget.finalize','budget','Memfinalkan versi anggaran'),
  ('cashplan.view','cashplan','Melihat anggaran kas'),
  ('cashplan.edit','cashplan','Menyusun anggaran kas'),
  ('cashplan.submit','cashplan','Mengajukan anggaran kas'),
  ('cashplan.finalize','cashplan','Memfinalkan anggaran kas'),
  ('realization.view','realization','Melihat realisasi'),
  ('realization.edit','realization','Menyusun transaksi realisasi'),
  ('realization.submit','realization','Mengajukan transaksi realisasi'),
  ('realization.verify','realization','Memverifikasi transaksi dan SP2D'),
  ('realization.correct','realization','Mengoreksi/membatalkan transaksi final dengan alasan'),
  ('recap.view','recap','Melihat rekapitulasi'),
  ('recap.export','recap','Mengekspor rekapitulasi'),
  ('lra.view','lra','Melihat LRA'),
  ('lra.export','lra','Mengekspor LRA'),
  ('lra.configure','lra','Mengonfigurasi template LRA'),
  ('document.view','document','Melihat dokumen pengadaan'),
  ('document.create_pptk','document','Menyusun Nota Dinas PPTK dan DPP'),
  ('document.create_ppk','document','Menyusun Nota Dinas PPK'),
  ('document.review','document','Mereviu DPP dan mencatat temuan'),
  ('document.return','document','Mengembalikan dokumen untuk perbaikan'),
  ('document.issue_ba','document','Menerbitkan Berita Acara Reviu'),
  ('master.view','master','Melihat data master'),
  ('master.manage','master','Mengelola data master'),
  ('users.manage','admin','Mengelola pengguna, peran, scope'),
  ('audit.view','admin','Melihat log audit'),
  ('settings.manage','admin','Mengelola pengaturan aplikasi');

-- Izin default. Izin berstatus "C" (bergantung alur persetujuan OPD) TIDAK diberikan
-- ke PPK secara default: realization.verify/correct, cashplan.finalize. Admin dapat
-- menambahkannya lewat role_permissions setelah alur resmi dikonfirmasi.
insert into public.role_permissions (role_code, permission_code) values
  -- admin
  ('admin','dashboard.view'),('admin','dashboard.export'),
  ('admin','budget.view'),('admin','budget.edit'),('admin','budget.import'),('admin','budget.finalize'),
  ('admin','cashplan.view'),('admin','cashplan.finalize'),
  ('admin','realization.view'),('admin','realization.verify'),('admin','realization.correct'),
  ('admin','recap.view'),('admin','recap.export'),
  ('admin','lra.view'),('admin','lra.export'),('admin','lra.configure'),
  ('admin','document.view'),
  ('admin','master.view'),('admin','master.manage'),
  ('admin','users.manage'),('admin','audit.view'),('admin','settings.manage'),
  -- ppk
  ('ppk','dashboard.view'),('ppk','dashboard.export'),
  ('ppk','budget.view'),('ppk','cashplan.view'),('ppk','realization.view'),
  ('ppk','recap.view'),('ppk','recap.export'),('ppk','lra.view'),('ppk','lra.export'),
  ('ppk','document.view'),('ppk','document.create_ppk'),('ppk','document.return'),
  ('ppk','master.view'),
  -- pptk
  ('pptk','dashboard.view'),('pptk','dashboard.export'),
  ('pptk','budget.view'),
  ('pptk','cashplan.view'),('pptk','cashplan.edit'),('pptk','cashplan.submit'),
  ('pptk','realization.view'),('pptk','realization.edit'),('pptk','realization.submit'),
  ('pptk','recap.view'),
  ('pptk','document.view'),('pptk','document.create_pptk'),
  ('pptk','master.view'),
  -- ppbj
  ('ppbj','dashboard.view'),
  ('ppbj','document.view'),('ppbj','document.review'),('ppbj','document.return'),('ppbj','document.issue_ba'),
  ('ppbj','master.view');
