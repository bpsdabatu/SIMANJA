-- =====================================================================
-- 0002_budget_realization_documents.sql
-- Data master, anggaran, anggaran kas, pengadaan, realisasi, dokumen, impor
-- Phase 1 membuat struktur + integritas inti. Logika bisnis lengkap: Phase 2-7.
-- =====================================================================

-- ---------- tahun anggaran & tahapan ----------
create table public.fiscal_years (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  year            int  not null check (year between 2000 and 2100),
  is_open         boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (organization_id, year)
);

create table public.budget_stages (
  code text primary key check (code in ('murni','pergeseran','perubahan')),
  name text not null,
  seq  int  not null unique
);
insert into public.budget_stages (code, name, seq) values
  ('murni','Murni',1), ('pergeseran','Pergeseran',2), ('perubahan','Perubahan',3);

create table public.budget_versions (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id),
  fiscal_year_id    uuid not null references public.fiscal_years(id),
  stage_code        text not null references public.budget_stages(code),
  version_no        int  not null default 1 check (version_no >= 1),
  status            text not null default 'draft'
                      check (status in ('draft','active','final','superseded')),
  parent_version_id uuid references public.budget_versions(id),
  note              text,
  finalized_by      uuid references public.profiles(id),
  finalized_at      timestamptz,
  created_by        uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (fiscal_year_id, stage_code, version_no)
);
create index budget_versions_lookup_idx on public.budget_versions (organization_id, fiscal_year_id, stage_code, status);
create trigger trg_budget_versions_touch before update on public.budget_versions
  for each row execute function app.touch_updated_at();

-- Hanya pemegang budget.finalize yang boleh memfinalkan; versi final tidak dapat dibuka kembali.
create or replace function app.guard_version_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('final','superseded') then
      raise exception 'Versi anggaran final tidak dapat dihapus' using errcode = '42501';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.status = 'final' and new.status not in ('final','superseded') then
    raise exception 'Versi anggaran final tidak dapat dibuka kembali' using errcode = '42501';
  end if;
  if new.status = 'final' and (tg_op = 'INSERT' or old.status <> 'final') then
    if auth.uid() is not null and not app.has_permission('budget.finalize') then
      raise exception 'Tidak berwenang memfinalkan versi anggaran' using errcode = '42501';
    end if;
    new.finalized_at := now();
    new.finalized_by := coalesce(auth.uid(), new.finalized_by);
  end if;
  return new;
end $$;
create trigger trg_budget_versions_guard before insert or update or delete on public.budget_versions
  for each row execute function app.guard_version_status();

-- ---------- klasifikasi anggaran & master ----------
create table public.programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  code text not null, name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, code)
);
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  program_id uuid not null references public.programs(id),
  code text not null, name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, code)
);
create table public.sub_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  activity_id uuid not null references public.activities(id),
  code text not null, name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, code)
);
create table public.expenditure_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  code text not null, name text not null,
  parent_id uuid references public.expenditure_accounts(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, code)
);
create table public.funding_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  code text not null, name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, code)
);
create table public.procurement_methods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  code text not null, name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, code)
);
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null, npwp text, address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.rup_references (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  fiscal_year_id uuid not null references public.fiscal_years(id),
  rup_code text not null, package_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, fiscal_year_id, rup_code)
);

do $$
declare t text;
begin
  foreach t in array array['fiscal_years','programs','activities','sub_activities','expenditure_accounts',
    'funding_sources','procurement_methods','suppliers','rup_references'] loop
    execute format('create trigger trg_audit_%1$s after insert or update or delete on public.%1$s
      for each row execute function app.audit_trigger()', t);
  end loop;
  foreach t in array array['programs','activities','sub_activities','expenditure_accounts',
    'funding_sources','procurement_methods','suppliers','rup_references'] loop
    execute format('create trigger trg_touch_%1$s before update on public.%1$s
      for each row execute function app.touch_updated_at()', t);
  end loop;
end $$;

-- ---------- butir anggaran (identitas) & snapshot per versi (pagu) ----------
create table public.budget_items (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id),
  fiscal_year_id         uuid not null references public.fiscal_years(id),
  sub_activity_id        uuid not null references public.sub_activities(id),
  expenditure_account_id uuid not null references public.expenditure_accounts(id),
  funding_source_id      uuid not null references public.funding_sources(id),
  pptk_id                uuid references public.profiles(id),
  rup_reference_id       uuid references public.rup_references(id),
  description            text,
  notes                  text,
  is_active              boolean not null default true,
  created_by             uuid references public.profiles(id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
-- Pencegahan duplikasi butir anggaran (kunci komposit logis)
create unique index budget_items_dedup_uk on public.budget_items
  (organization_id, fiscal_year_id, sub_activity_id, expenditure_account_id, funding_source_id,
   coalesce(rup_reference_id, '00000000-0000-0000-0000-000000000000'::uuid),
   coalesce(description, ''));
create index budget_items_pptk_idx on public.budget_items (pptk_id);
create index budget_items_sub_idx  on public.budget_items (sub_activity_id);
create trigger trg_budget_items_touch before update on public.budget_items
  for each row execute function app.touch_updated_at();

create table public.budget_item_versions (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id),
  budget_version_id uuid not null references public.budget_versions(id),
  budget_item_id    uuid not null references public.budget_items(id),
  pagu              numeric(18,2) not null check (pagu >= 0),
  adjustment_note   text,
  created_by        uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  unique (budget_version_id, budget_item_id)
);
create index biv_item_idx on public.budget_item_versions (budget_item_id);

-- Snapshot versi final/superseded tidak boleh diubah atau dihapus
create or replace function app.guard_final_version_children() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_status text; v_ver uuid;
begin
  v_ver := coalesce(new.budget_version_id, old.budget_version_id);
  select status into v_status from public.budget_versions where id = v_ver;
  if v_status in ('final','superseded') then
    raise exception 'Snapshot anggaran pada versi % tidak dapat diubah', v_status using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
create trigger trg_biv_guard before insert or update or delete on public.budget_item_versions
  for each row execute function app.guard_final_version_children();

-- ---------- anggaran kas ----------
create table public.cash_budget_plans (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id),
  budget_version_id uuid not null,
  budget_item_id    uuid not null,
  status            text not null default 'draft' check (status in ('draft','submitted','returned','final')),
  revision_no       int  not null default 1,
  change_reason     text,
  updated_by        uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (budget_version_id, budget_item_id),
  foreign key (budget_version_id, budget_item_id)
    references public.budget_item_versions (budget_version_id, budget_item_id)
);
create trigger trg_cash_plans_touch before update on public.cash_budget_plans
  for each row execute function app.touch_updated_at();

create table public.cash_budget_periods (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.cash_budget_plans(id) on delete cascade,
  period_type text not null check (period_type in ('quarter','month')),
  period_no   int  not null,
  amount      numeric(18,2) not null default 0 check (amount >= 0),
  unique (plan_id, period_type, period_no),
  check ((period_type = 'quarter' and period_no between 1 and 4)
      or (period_type = 'month'   and period_no between 1 and 12))
);

-- ---------- pengadaan: paket & kontrak (KOMITMEN) ----------
create table public.procurement_packages (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id),
  budget_item_id        uuid not null references public.budget_items(id),
  rup_reference_id      uuid references public.rup_references(id),
  procurement_method_id uuid references public.procurement_methods(id),
  package_name          text not null,
  classification        text,
  created_by            uuid references public.profiles(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create trigger trg_pkg_touch before update on public.procurement_packages
  for each row execute function app.touch_updated_at();

-- Tabel KOMITMEN. Nilai kontrak TIDAK pernah dihitung sebagai realisasi.
create table public.procurement_contracts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  package_id      uuid not null references public.procurement_packages(id),
  supplier_id     uuid references public.suppliers(id),
  contract_number text not null,
  contract_date   date not null,
  contract_value  numeric(18,2) not null check (contract_value >= 0),
  status          text not null default 'active' check (status in ('active','completed','cancelled')),
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, contract_number)
);
create trigger trg_contract_touch before update on public.procurement_contracts
  for each row execute function app.touch_updated_at();

-- ---------- realisasi: transaksi, pembayaran, SP2D ----------
create table public.realization_transactions (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id),
  budget_version_id     uuid not null,
  budget_item_id        uuid not null,
  transaction_date      date not null,
  description           text not null,
  supplier_id           uuid references public.suppliers(id),
  procurement_method_id uuid references public.procurement_methods(id),
  package_id            uuid references public.procurement_packages(id),
  contract_id           uuid references public.procurement_contracts(id),
  status                text not null default 'draft' check (status in
    ('draft','submitted','contracted','payment_processing','realisasi','returned','cancelled')),
  cancel_reason         text,
  created_by            uuid not null references public.profiles(id),
  updated_by            uuid references public.profiles(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  foreign key (budget_version_id, budget_item_id)
    references public.budget_item_versions (budget_version_id, budget_item_id),
  constraint rt_cancel_reason_ck check (status <> 'cancelled' or coalesce(length(trim(cancel_reason)),0) > 0)
);
create index rt_item_idx   on public.realization_transactions (budget_version_id, budget_item_id, status);
create index rt_date_idx   on public.realization_transactions (transaction_date);
create trigger trg_rt_touch before update on public.realization_transactions
  for each row execute function app.touch_updated_at();

create table public.payment_records (
  id             uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  transaction_id uuid not null references public.realization_transactions(id),
  amount         numeric(18,2) not null check (amount > 0),
  payment_note   text,
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now()
);
create index pay_tx_idx on public.payment_records (transaction_id);

create table public.sp2d_records (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id),
  fiscal_year_id    uuid not null references public.fiscal_years(id),
  payment_record_id uuid not null unique references public.payment_records(id),
  sp2d_number       text not null,
  sp2d_date         date,
  voided_at         timestamptz,
  void_reason       text,
  created_by        uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  constraint sp2d_void_reason_ck check (voided_at is null or coalesce(length(trim(void_reason)),0) > 0)
);
-- Nomor SP2D unik per OPD per tahun anggaran (yang tidak dibatalkan)
create unique index sp2d_number_uk on public.sp2d_records (organization_id, fiscal_year_id, sp2d_number)
  where voided_at is null;

create table public.transaction_attachments (
  id             uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  transaction_id uuid not null references public.realization_transactions(id),
  storage_path   text not null unique,
  file_name      text not null,
  mime_type      text not null,
  size_bytes     bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  verification   text not null default 'pending' check (verification in ('pending','verified','rejected')),
  uploaded_by    uuid references public.profiles(id),
  created_at     timestamptz not null default now()
);

-- ---- integritas: batas pagu secara concurrency-safe ----
create or replace function app.check_pagu_on_payment() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ver uuid; v_item uuid; v_org uuid; v_status text;
        v_pagu numeric(18,2); v_used numeric(18,2); v_block boolean;
begin
  select budget_version_id, budget_item_id, organization_id, status
    into v_ver, v_item, v_org, v_status
  from public.realization_transactions where id = new.transaction_id;
  if v_status = 'cancelled' then
    raise exception 'Transaksi dibatalkan; pembayaran tidak dapat ditambahkan' using errcode = '23514';
  end if;
  -- Kunci baris pagu: mengserialkan pembayaran bersamaan pada butir yang sama
  select pagu into v_pagu from public.budget_item_versions
   where budget_version_id = v_ver and budget_item_id = v_item for update;
  select coalesce(sum(p.amount), 0) into v_used
    from public.payment_records p
    join public.realization_transactions t on t.id = p.transaction_id
   where t.budget_version_id = v_ver and t.budget_item_id = v_item
     and t.status <> 'cancelled' and p.id is distinct from new.id;
  select coalesce((value->>'enabled')::boolean, true) into v_block
    from public.application_settings
   where organization_id = v_org and key = 'realization.block_over_pagu';
  if coalesce(v_block, true) and v_used + new.amount > v_pagu then
    raise exception 'Realisasi melebihi pagu (pagu %, terpakai %, diajukan %)', v_pagu, v_used, new.amount
      using errcode = '23514';
  end if;
  return new;
end $$;
create trigger trg_payment_pagu before insert or update of amount, transaction_id on public.payment_records
  for each row execute function app.check_pagu_on_payment();

-- ---- integritas: status 'realisasi' hanya bila setiap pembayaran memiliki SP2D bertanggal ----
create or replace function app.guard_transaction_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_reason text := nullif(trim(coalesce(current_setting('app.correction_reason', true), '')), '');
begin
  if tg_op = 'DELETE' then
    raise exception 'Transaksi realisasi tidak dapat dihapus; gunakan pembatalan dengan alasan'
      using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.status = 'realisasi' and v_reason is null then
    raise exception 'Transaksi berstatus realisasi hanya dapat dikoreksi dengan alasan tercatat'
      using errcode = '42501';
  end if;
  if new.status = 'realisasi' and (tg_op = 'INSERT' or old.status <> 'realisasi') then
    if not exists (select 1 from public.payment_records where transaction_id = new.id)
       or exists (
         select 1 from public.payment_records p
          where p.transaction_id = new.id
            and not exists (select 1 from public.sp2d_records s
                             where s.payment_record_id = p.id
                               and s.sp2d_date is not null and s.voided_at is null)) then
      raise exception 'Status realisasi memerlukan SP2D bertanggal untuk seluruh pembayaran'
        using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger trg_rt_guard before insert or update or delete on public.realization_transactions
  for each row execute function app.guard_transaction_status();

-- Pembayaran/SP2D milik transaksi 'realisasi' hanya berubah dengan alasan koreksi
create or replace function app.guard_final_children() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_tx uuid; v_status text;
        v_reason text := nullif(trim(coalesce(current_setting('app.correction_reason', true), '')), '');
begin
  if tg_table_name = 'payment_records' then
    v_tx := coalesce(new.transaction_id, old.transaction_id);
  else
    select transaction_id into v_tx from public.payment_records
     where id = coalesce(new.payment_record_id, old.payment_record_id);
  end if;
  select status into v_status from public.realization_transactions where id = v_tx;
  if v_status = 'realisasi' and v_reason is null then
    raise exception 'Data pembayaran/SP2D transaksi final hanya dapat dikoreksi dengan alasan tercatat'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Data pembayaran/SP2D tidak dihapus; gunakan pembatalan (void) dengan alasan'
      using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_pay_guard before update or delete on public.payment_records
  for each row execute function app.guard_final_children();
create trigger trg_sp2d_guard before update or delete on public.sp2d_records
  for each row execute function app.guard_final_children();

-- ---------- dokumen pengadaan ----------
create table public.document_templates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  doc_type        text not null check (doc_type in ('nota_dinas_pptk','nota_dinas_ppk','dpp','berita_acara_reviu')),
  name            text not null,
  version         int  not null default 1,
  body            jsonb not null default '{}'::jsonb,
  is_approved     boolean not null default false,  -- PDF resmi hanya dari template yang disetujui
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  unique (organization_id, doc_type, version)
);

create table public.procurement_documents (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  doc_type        text not null check (doc_type in ('nota_dinas_pptk','nota_dinas_ppk','dpp','berita_acara_reviu')),
  budget_item_id  uuid not null references public.budget_items(id),
  package_id      uuid references public.procurement_packages(id),
  template_id     uuid references public.document_templates(id),
  title           text not null,
  status          text not null default 'draft' check (status in
    ('draft','submitted','under_review','returned_for_correction','resubmitted',
     'review_completed','approved','issued','archived','cancelled')),
  cancel_reason   text,
  created_by      uuid not null references public.profiles(id),
  assigned_ppk_id uuid references public.profiles(id),
  assigned_ppbj_id uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint pd_cancel_ck check (status <> 'cancelled' or coalesce(length(trim(cancel_reason)),0) > 0)
);
create index pd_status_idx on public.procurement_documents (organization_id, status);
create index pd_assignee_idx on public.procurement_documents (assigned_ppbj_id, assigned_ppk_id, created_by);
create trigger trg_pd_touch before update on public.procurement_documents
  for each row execute function app.touch_updated_at();

create table public.document_revisions (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.procurement_documents(id) on delete cascade,
  revision_no int  not null,
  content     jsonb not null default '{}'::jsonb,
  change_note text,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  unique (document_id, revision_no)
);
create table public.document_reviews (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.procurement_documents(id) on delete cascade,
  revision_id uuid not null references public.document_revisions(id),
  reviewer_id uuid not null references public.profiles(id),
  outcome     text check (outcome in ('returned','completed')),
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);
create table public.review_findings (
  id          uuid primary key default gen_random_uuid(),
  review_id   uuid not null references public.document_reviews(id) on delete cascade,
  finding     text not null,
  required_correction text,
  is_resolved boolean not null default false,
  created_at  timestamptz not null default now()
);
create table public.review_minutes (   -- Berita Acara Reviu
  id          uuid primary key default gen_random_uuid(),
  review_id   uuid not null unique references public.document_reviews(id),
  minutes_no  text,
  content     jsonb not null default '{}'::jsonb,
  issued_by   uuid references public.profiles(id),
  issued_at   timestamptz,
  created_at  timestamptz not null default now()
);

-- ---------- impor ----------
create table public.import_batches (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id),
  budget_version_id uuid references public.budget_versions(id),
  kind              text not null check (kind in ('xlsx','csv','pdf')),
  file_path         text,
  status            text not null default 'uploaded' check (status in
    ('uploaded','parsed','needs_review','confirmed','committed','failed','cancelled')),
  summary           jsonb not null default '{}'::jsonb,
  created_by        uuid not null references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger trg_import_touch before update on public.import_batches
  for each row execute function app.touch_updated_at();
create table public.import_rows (
  id         uuid primary key default gen_random_uuid(),
  batch_id   uuid not null references public.import_batches(id) on delete cascade,
  row_no     int  not null,
  raw        jsonb not null,
  mapped     jsonb,
  status     text not null default 'pending' check (status in
    ('pending','valid','invalid','duplicate','uncertain','skipped','accepted')),
  errors     jsonb not null default '[]'::jsonb,
  confidence numeric(5,2) check (confidence between 0 and 100),
  reviewed   boolean not null default false,
  unique (batch_id, row_no)
);

-- ---------- riwayat transisi (append-only) ----------
create table public.workflow_events (
  id              bigint generated always as identity primary key,
  organization_id uuid,
  entity_type     text not null,
  entity_id       uuid not null,
  from_status     text,
  to_status       text not null,
  reason          text,
  actor_id        uuid,
  occurred_at     timestamptz not null default now()
);
create index we_entity_idx on public.workflow_events (entity_type, entity_id, occurred_at);
create trigger trg_we_immutable before update or delete on public.workflow_events
  for each row execute function app.block_modification();
create trigger trg_we_no_truncate before truncate on public.workflow_events
  for each statement execute function app.block_modification();

create or replace function app.log_status_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_reason text := nullif(trim(coalesce(current_setting('app.correction_reason', true), '')), '');
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.workflow_events (organization_id, entity_type, entity_id, from_status, to_status, reason, actor_id)
    values (new.organization_id, tg_table_name, new.id,
            case when tg_op = 'UPDATE' then old.status end, new.status,
            coalesce(v_reason, new.cancel_reason), auth.uid());
  end if;
  return new;
end $$;
create trigger trg_rt_events after insert or update on public.realization_transactions
  for each row execute function app.log_status_change();
create trigger trg_pd_events after insert or update on public.procurement_documents
  for each row execute function app.log_status_change();

-- ---------- audit pada tabel sensitif ----------
do $$
declare t text;
begin
  foreach t in array array['budget_versions','budget_items','budget_item_versions','cash_budget_plans',
    'cash_budget_periods','procurement_packages','procurement_contracts','realization_transactions',
    'payment_records','sp2d_records','transaction_attachments','document_templates',
    'procurement_documents','document_revisions','document_reviews','review_findings',
    'review_minutes','import_batches'] loop
    execute format('create trigger trg_audit_%1$s after insert or update or delete on public.%1$s
      for each row execute function app.audit_trigger()', t);
  end loop;
end $$;
