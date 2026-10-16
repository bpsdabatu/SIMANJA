-- =====================================================================
-- 0013 — Status SP2D (sudah / belum) pada input realisasi + pemulihan fungsi input realisasi
--
-- AMAN DIJALANKAN BERULANG (create or replace) dan SUDAH MENCAKUP fungsi dari 0012. Bila input realisasi di produksi
-- gagal dengan pesan "Tindakan gagal diproses", biasanya fungsi basis data belum terpasang; jalankan berkas ini
-- (seluruhnya) di Supabase → SQL Editor, lalu muat ulang aplikasi.
--
--  1. sp2d_records.sp2d_number boleh kosong (dari 0011; diulang agar aman bila 0011 terlewat).
--  2. public.record_realization_v2(): tanggal SP2D BOLEH KOSONG.
--       - tanggal SP2D diisi  -> langsung 'realisasi' (realisasi sah), seperti sebelumnya.
--       - tanggal SP2D kosong -> status 'payment_processing' (Belum SP2D). Nilainya tetap memakai pagu (pending_sp2d pada
--         v_budget_balance, sehingga tidak bisa melebihi pagu) tetapi BELUM dihitung sebagai realisasi sah (LRA/Dasbor/Rekap).
--  3. public.set_realization_sp2d(): melengkapi tanggal SP2D kemudian -> status berubah menjadi 'realisasi'.
--       Dapat dilakukan PPTK penugasan butir tsb. atau pemegang izin realization.correct (Admin).
--  4. Fungsi dari 0012 diulang: correct_realization_dates, update/delete_supplier_for_realization.
-- =====================================================================

alter table public.sp2d_records alter column sp2d_number drop not null;

create or replace function public.record_realization_v2(
  p_version uuid, p_item uuid, p_tx_date date, p_sp2d_date date, p_description text,
  p_supplier uuid, p_method uuid, p_amount numeric
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := app.current_org();
  v_fy uuid; v_year int; v_tx uuid; v_pay uuid; v_desc text;
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  perform app.require_permission('realization.edit');
  if v_org is null then raise exception 'Organisasi tidak ditemukan' using errcode = '42501'; end if;
  if not app.is_assigned_pptk(p_item) then
    raise exception 'Butir anggaran bukan milik Anda (PPTK penugasan)' using errcode = '42501';
  end if;
  if p_tx_date is null then raise exception 'Tanggal transaksi wajib diisi' using errcode = '22023'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Nilai realisasi harus lebih dari nol' using errcode = '22023'; end if;
  if round(p_amount, 2) <> p_amount then raise exception 'Nilai realisasi maksimal dua angka desimal' using errcode = '22023'; end if;

  select bv.fiscal_year_id, fy.year into v_fy, v_year
    from public.budget_versions bv join public.fiscal_years fy on fy.id = bv.fiscal_year_id
   where bv.id = p_version and bv.organization_id = v_org;
  if v_fy is null then raise exception 'Versi anggaran tidak ditemukan' using errcode = '22023'; end if;
  if not exists (select 1 from public.budget_item_versions where budget_version_id = p_version and budget_item_id = p_item) then
    raise exception 'Butir anggaran tidak ditemukan pada versi ini' using errcode = '22023';
  end if;
  if extract(year from p_tx_date)::int <> v_year then
    raise exception 'Tanggal transaksi harus berada pada tahun anggaran %', v_year using errcode = '22023';
  end if;
  if p_tx_date > v_today then raise exception 'Tanggal transaksi tidak boleh melebihi tanggal hari ini' using errcode = '22023'; end if;
  if p_sp2d_date is not null then
    if extract(year from p_sp2d_date)::int <> v_year then
      raise exception 'Tanggal SP2D harus berada pada tahun anggaran %', v_year using errcode = '22023';
    end if;
    if p_tx_date > p_sp2d_date then
      raise exception 'Tanggal transaksi tidak boleh setelah tanggal SP2D' using errcode = '22023';
    end if;
    if p_sp2d_date > v_today then raise exception 'Tanggal SP2D tidak boleh melebihi tanggal hari ini' using errcode = '22023'; end if;
  end if;
  if p_supplier is not null and not exists (select 1 from public.suppliers where id = p_supplier and organization_id = v_org) then
    raise exception 'Penyedia tidak valid' using errcode = '22023';
  end if;
  if p_method is not null and not exists (select 1 from public.procurement_methods where id = p_method and organization_id = v_org) then
    raise exception 'Metode pengadaan tidak valid' using errcode = '22023';
  end if;

  v_desc := nullif(trim(coalesce(p_description, '')), '');
  if v_desc is null then
    select 'Realisasi ' || ea.name into v_desc
      from public.budget_items bi join public.expenditure_accounts ea on ea.id = bi.expenditure_account_id
     where bi.id = p_item;
    v_desc := coalesce(v_desc, 'Realisasi belanja');
  end if;

  if p_sp2d_date is null then
    -- Belum SP2D: tersimpan sebagai 'payment_processing'; pagu tetap terkunci oleh trigger trg_payment_pagu.
    insert into public.realization_transactions (organization_id, budget_version_id, budget_item_id, transaction_date,
          description, supplier_id, procurement_method_id, status, created_by)
    values (v_org, p_version, p_item, p_tx_date, v_desc, p_supplier, p_method, 'payment_processing', auth.uid())
    returning id into v_tx;

    insert into public.payment_records (organization_id, transaction_id, amount, created_by)
    values (v_org, v_tx, p_amount, auth.uid());
    return v_tx;
  end if;

  insert into public.realization_transactions (organization_id, budget_version_id, budget_item_id, transaction_date,
        description, supplier_id, procurement_method_id, status, created_by)
  values (v_org, p_version, p_item, p_tx_date, v_desc, p_supplier, p_method, 'draft', auth.uid())
  returning id into v_tx;

  -- Trigger trg_payment_pagu menolak bila melebihi pagu (dengan penguncian baris pagu).
  insert into public.payment_records (organization_id, transaction_id, amount, created_by)
  values (v_org, v_tx, p_amount, auth.uid())
  returning id into v_pay;

  insert into public.sp2d_records (organization_id, fiscal_year_id, payment_record_id, sp2d_number, sp2d_date, created_by)
  values (v_org, v_fy, v_pay, null, p_sp2d_date, auth.uid());

  update public.realization_transactions set status = 'realisasi', updated_by = auth.uid() where id = v_tx;
  return v_tx;
end $$;

revoke all on function public.record_realization_v2(uuid, uuid, date, date, text, uuid, uuid, numeric) from public, anon;
grant execute on function public.record_realization_v2(uuid, uuid, date, date, text, uuid, uuid, numeric) to authenticated;

-- Melengkapi tanggal SP2D pada transaksi yang semula "Belum SP2D" -------------------------------
create or replace function public.set_realization_sp2d(p_tx uuid, p_sp2d_date date) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := app.current_org();
  v_status text; v_item uuid; v_ver uuid; v_txdate date; v_fy uuid; v_year int; r record;
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if v_org is null then raise exception 'Organisasi tidak ditemukan' using errcode = '42501'; end if;
  if p_sp2d_date is null then raise exception 'Tanggal SP2D wajib diisi' using errcode = '22023'; end if;

  select t.status, t.budget_item_id, t.budget_version_id, t.transaction_date
    into v_status, v_item, v_ver, v_txdate
    from public.realization_transactions t
   where t.id = p_tx and t.organization_id = v_org
     for update;
  if v_status is null then raise exception 'Transaksi tidak ditemukan' using errcode = '22023'; end if;

  if not ((app.has_permission('realization.edit') and app.is_assigned_pptk(v_item))
       or (app.has_permission('realization.correct') and app.can_access_item(v_item))) then
    raise exception 'Anda tidak berwenang mengisi tanggal SP2D transaksi ini' using errcode = '42501';
  end if;
  if v_status = 'realisasi' then
    raise exception 'Transaksi ini sudah memiliki tanggal SP2D. Koreksi tanggal dilakukan Admin pada halaman detail.' using errcode = '22023';
  end if;
  if v_status not in ('submitted', 'payment_processing') then
    raise exception 'Tanggal SP2D tidak dapat diisi pada transaksi berstatus %', v_status using errcode = '22023';
  end if;

  select bv.fiscal_year_id, fy.year into v_fy, v_year
    from public.budget_versions bv join public.fiscal_years fy on fy.id = bv.fiscal_year_id where bv.id = v_ver;
  if extract(year from p_sp2d_date)::int <> v_year then
    raise exception 'Tanggal SP2D harus berada pada tahun anggaran %', v_year using errcode = '22023';
  end if;
  if p_sp2d_date < v_txdate then raise exception 'Tanggal SP2D tidak boleh sebelum tanggal transaksi' using errcode = '22023'; end if;
  if p_sp2d_date > v_today then raise exception 'Tanggal SP2D tidak boleh melebihi tanggal hari ini' using errcode = '22023'; end if;

  for r in select p.id from public.payment_records p where p.transaction_id = p_tx loop
    if exists (select 1 from public.sp2d_records s where s.payment_record_id = r.id) then
      update public.sp2d_records set sp2d_date = p_sp2d_date, voided_at = null, void_reason = null
       where payment_record_id = r.id and (sp2d_date is null or voided_at is not null);
    else
      insert into public.sp2d_records (organization_id, fiscal_year_id, payment_record_id, sp2d_number, sp2d_date, created_by)
      values (v_org, v_fy, r.id, null, p_sp2d_date, auth.uid());
    end if;
  end loop;

  update public.realization_transactions set status = 'realisasi', updated_by = auth.uid() where id = p_tx;
end $$;

revoke all on function public.set_realization_sp2d(uuid, date) from public, anon;
grant execute on function public.set_realization_sp2d(uuid, date) to authenticated;

-- Fungsi 0012 (diulang): koreksi tanggal transaksi dan/atau tanggal SP2D (Admin) -----------------------------------
create or replace function public.correct_realization_dates(p_tx uuid, p_tx_date date, p_sp2d_date date, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := app.current_org(); v_status text; v_item uuid; v_ver uuid; v_year int; v_reason text;
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  perform app.require_permission('realization.correct');
  v_reason := app.reason_required(p_reason);
  if p_tx_date is null then raise exception 'Tanggal transaksi wajib diisi' using errcode = '22023'; end if;
  if p_sp2d_date is null then raise exception 'Tanggal SP2D wajib diisi' using errcode = '22023'; end if;
  if p_tx_date > p_sp2d_date then raise exception 'Tanggal transaksi tidak boleh setelah tanggal SP2D' using errcode = '22023'; end if;

  select t.status, t.budget_item_id, t.budget_version_id into v_status, v_item, v_ver
    from public.realization_transactions t where t.id = p_tx and t.organization_id = v_org;
  if v_status is null or not app.can_access_item(v_item) then
    raise exception 'Transaksi tidak ditemukan atau tidak berwenang' using errcode = '42501';
  end if;
  if v_status <> 'realisasi' then raise exception 'Hanya transaksi berstatus realisasi yang dapat dikoreksi' using errcode = '22023'; end if;

  select fy.year into v_year from public.budget_versions bv join public.fiscal_years fy on fy.id = bv.fiscal_year_id where bv.id = v_ver;
  if extract(year from p_tx_date)::int <> v_year or extract(year from p_sp2d_date)::int <> v_year then
    raise exception 'Kedua tanggal harus berada pada tahun anggaran %', v_year using errcode = '22023';
  end if;
  if p_sp2d_date > v_today then raise exception 'Tanggal SP2D tidak boleh melebihi tanggal hari ini' using errcode = '22023'; end if;

  perform set_config('app.correction_reason', v_reason, true);
  update public.sp2d_records set sp2d_date = p_sp2d_date
   where voided_at is null and payment_record_id in (select id from public.payment_records where transaction_id = p_tx);
  update public.realization_transactions set transaction_date = p_tx_date, updated_by = auth.uid() where id = p_tx;
end $$;

revoke all on function public.correct_realization_dates(uuid, date, date, text) from public, anon;
grant execute on function public.correct_realization_dates(uuid, date, date, text) to authenticated;

-- 3. Ubah & hapus penyedia dari menu Realisasi (nama + alamat saja) ----------------------------------
create or replace function public.update_supplier_for_realization(p_id uuid, p_name text, p_address text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := app.current_org();
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_addr text := nullif(btrim(coalesce(p_address, '')), '');
  n int;
begin
  perform app.require_permission('realization.edit');
  if v_org is null then raise exception 'Organisasi tidak ditemukan' using errcode = '42501'; end if;
  if v_name = '' then raise exception 'Nama penyedia wajib diisi' using errcode = '22023'; end if;
  if length(v_name) > 200 then raise exception 'Nama penyedia maksimal 200 karakter' using errcode = '22023'; end if;
  if v_addr is not null and length(v_addr) > 500 then raise exception 'Alamat maksimal 500 karakter' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtext(v_org::text || '|supplier|' || lower(v_name)));
  if exists (select 1 from public.suppliers
              where organization_id = v_org and id <> p_id
                and lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) = lower(v_name)) then
    raise exception 'Penyedia dengan nama "%" sudah ada', v_name using errcode = '22023';
  end if;
  update public.suppliers set name = v_name, address = v_addr where id = p_id and organization_id = v_org;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Penyedia tidak ditemukan' using errcode = '22023'; end if;
end $$;

create or replace function public.delete_supplier_for_realization(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_org uuid := app.current_org(); n int;
begin
  perform app.require_permission('realization.edit');
  if v_org is null then raise exception 'Organisasi tidak ditemukan' using errcode = '42501'; end if;
  delete from public.suppliers where id = p_id and organization_id = v_org;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Penyedia tidak ditemukan' using errcode = '22023'; end if;
exception when foreign_key_violation then
  raise exception 'Penyedia sudah dipakai pada transaksi sehingga tidak dapat dihapus. Ubah namanya, atau minta Admin menonaktifkannya di Data Master.' using errcode = '22023';
end $$;

revoke all on function public.update_supplier_for_realization(uuid, text, text) from public, anon;
revoke all on function public.delete_supplier_for_realization(uuid) from public, anon;
grant execute on function public.update_supplier_for_realization(uuid, text, text) to authenticated;
grant execute on function public.delete_supplier_for_realization(uuid) to authenticated;

-- Segarkan cache skema PostgREST agar fungsi baru langsung dikenali API
notify pgrst, 'reload schema';
