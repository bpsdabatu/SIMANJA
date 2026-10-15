-- =====================================================================
-- 0009 — Tanggal penetapan DPA per versi anggaran
-- Tahapan anggaran yang berlaku pada suatu tanggal ditentukan oleh tanggal DPA (mis. Murni 2 Jan 2026,
-- Pergeseran I 16 Mar 2026, Perubahan 26 Okt 2026). Tanggal dapat dikoreksi; setiap perubahan tercatat
-- pada audit_logs (trigger audit budget_versions menyimpan data lama & baru) beserta alasannya.
-- Aditif: tidak mengubah data/logika yang ada. Versi tanpa tanggal tetap berfungsi (LRA memakai konteks).
-- =====================================================================
alter table public.budget_versions
  add column if not exists dpa_date date,
  add column if not exists dpa_note text;

comment on column public.budget_versions.dpa_date is 'Tanggal penetapan DPA (DPA Murni / Pergeseran ke-n / Perubahan) — penentu tahapan berlaku.';
comment on column public.budget_versions.dpa_note is 'Keterangan / alasan perubahan tanggal DPA terakhir.';

create or replace function app.guard_version_dpa() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_year int;
begin
  if new.dpa_date is not distinct from old.dpa_date then return new; end if;

  if new.dpa_date is not null then
    select year into v_year from public.fiscal_years where id = new.fiscal_year_id;
    if extract(year from new.dpa_date)::int is distinct from v_year then
      raise exception 'Tanggal DPA harus berada pada tahun anggaran %', v_year using errcode = '22023';
    end if;
    -- Pergeseran berkali-kali: pada tahapan yang sama, versi berikutnya harus ditetapkan setelah versi sebelumnya.
    if exists (
      select 1 from public.budget_versions o
       where o.fiscal_year_id = new.fiscal_year_id and o.stage_code = new.stage_code and o.id <> new.id
         and o.dpa_date is not null
         and ((o.version_no < new.version_no and o.dpa_date >= new.dpa_date)
           or (o.version_no > new.version_no and o.dpa_date <= new.dpa_date))) then
      raise exception 'Tanggal DPA harus setelah versi sebelumnya dan sebelum versi berikutnya pada tahapan yang sama' using errcode = '22023';
    end if;
  end if;

  if auth.uid() is not null then
    if old.status in ('final', 'superseded') and not app.has_permission('budget.finalize') then
      raise exception 'Hanya pejabat yang berwenang memfinalkan anggaran yang dapat mengoreksi tanggal DPA versi final' using errcode = '42501';
    end if;
    if old.dpa_date is not null and nullif(trim(coalesce(new.dpa_note, '')), '') is null then
      raise exception 'Alasan koreksi tanggal DPA wajib diisi' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_budget_versions_dpa_guard on public.budget_versions;
create trigger trg_budget_versions_dpa_guard before update on public.budget_versions
  for each row execute function app.guard_version_dpa();

create or replace function public.set_budget_version_dpa_date(p_version uuid, p_date date, p_reason text default null) returns void
language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  perform app.require_permission('budget.edit');
  if p_date is null then raise exception 'Tanggal DPA wajib diisi' using errcode = '22023'; end if;
  update public.budget_versions
     set dpa_date = p_date, dpa_note = nullif(trim(coalesce(p_reason, '')), '')
   where id = p_version;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Versi anggaran tidak ditemukan atau tidak dapat diubah' using errcode = '42501'; end if;
end $$;

revoke all on function public.set_budget_version_dpa_date(uuid, date, text) from public, anon;
grant execute on function public.set_budget_version_dpa_date(uuid, date, text) to authenticated;
