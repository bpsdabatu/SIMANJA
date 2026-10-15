-- =====================================================================
-- 0011 — Input realisasi ringkas: tanpa nomor SP2D (cukup tanggal SP2D) dan tanpa verifikasi Admin
--
-- Perubahan (aditif; fungsi lama tidak dihapus agar riwayat & tes lama tetap valid):
--  1. sp2d_records.sp2d_number boleh kosong. Realisasi sah tetap = SP2D BERTANGGAL (v_eligible_realization
--     dan v_budget_balance tidak berubah), jadi LRA, Dasbor, Rekapitulasi, dan Laporan Triwulan tetap konsisten.
--  2. public.record_realization(): PPTK penugasan menyimpan transaksi + pembayaran + tanggal SP2D dalam SATU langkah;
--     transaksi langsung berstatus 'realisasi' (tidak ada lagi draf -> diajukan -> diverifikasi).
--  3. public.correct_realization_date(): koreksi tanggal SP2D oleh pemegang izin realization.correct (Admin) dengan alasan tercatat.
--  4. Transaksi lama yang masih 'submitted'/'payment_processing' dan seluruh pembayarannya sudah bertanggal SP2D
--     dijadikan 'realisasi' (tidak perlu verifikasi lagi). Yang belum bertanggal dibiarkan apa adanya.
-- Seluruh pelindung (trigger pagu concurrency-safe, guard status 'realisasi', RLS baca) tetap berlaku.
-- =====================================================================

-- 1. Nomor SP2D tidak lagi wajib ---------------------------------------------------------------
alter table public.sp2d_records alter column sp2d_number drop not null;
-- (indeks unik parsial sp2d_number_uk tetap: nomor yang diisi tidak boleh ganda; NULL tidak dianggap ganda)

-- 2. Simpan realisasi dalam satu langkah ------------------------------------------------------
create or replace function public.record_realization(
  p_version uuid, p_item uuid, p_sp2d_date date, p_description text,
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
  if p_sp2d_date is null then raise exception 'Tanggal SP2D wajib diisi' using errcode = '22023'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Nilai realisasi harus lebih dari nol' using errcode = '22023'; end if;
  if round(p_amount, 2) <> p_amount then raise exception 'Nilai realisasi maksimal dua angka desimal' using errcode = '22023'; end if;

  select bv.fiscal_year_id, fy.year into v_fy, v_year
    from public.budget_versions bv join public.fiscal_years fy on fy.id = bv.fiscal_year_id
   where bv.id = p_version and bv.organization_id = v_org;
  if v_fy is null then raise exception 'Versi anggaran tidak ditemukan' using errcode = '22023'; end if;
  if not exists (select 1 from public.budget_item_versions where budget_version_id = p_version and budget_item_id = p_item) then
    raise exception 'Butir anggaran tidak ditemukan pada versi ini' using errcode = '22023';
  end if;
  if extract(year from p_sp2d_date)::int <> v_year then
    raise exception 'Tanggal SP2D harus berada pada tahun anggaran %', v_year using errcode = '22023';
  end if;
  if p_sp2d_date > v_today then raise exception 'Tanggal SP2D tidak boleh melebihi tanggal hari ini' using errcode = '22023'; end if;
  if p_supplier is not null and not exists (select 1 from public.suppliers where id = p_supplier and organization_id = v_org) then
    raise exception 'Penyedia tidak valid' using errcode = '22023';
  end if;
  if p_method is not null and not exists (select 1 from public.procurement_methods where id = p_method and organization_id = v_org) then
    raise exception 'Metode pengadaan tidak valid' using errcode = '22023';
  end if;

  -- Uraian opsional: bila kosong, dipakai nama rekening belanja.
  v_desc := nullif(trim(coalesce(p_description, '')), '');
  if v_desc is null then
    select 'Realisasi ' || ea.name into v_desc
      from public.budget_items bi join public.expenditure_accounts ea on ea.id = bi.expenditure_account_id
     where bi.id = p_item;
    v_desc := coalesce(v_desc, 'Realisasi belanja');
  end if;

  -- Satu transaksi = satu pembayaran = satu tanggal SP2D. Tanggal transaksi = tanggal SP2D.
  insert into public.realization_transactions (organization_id, budget_version_id, budget_item_id, transaction_date,
        description, supplier_id, procurement_method_id, status, created_by)
  values (v_org, p_version, p_item, p_sp2d_date, v_desc, p_supplier, p_method, 'draft', auth.uid())
  returning id into v_tx;

  -- Trigger trg_payment_pagu menolak bila melebihi pagu (dengan penguncian baris pagu).
  insert into public.payment_records (organization_id, transaction_id, amount, created_by)
  values (v_org, v_tx, p_amount, auth.uid())
  returning id into v_pay;

  insert into public.sp2d_records (organization_id, fiscal_year_id, payment_record_id, sp2d_number, sp2d_date, created_by)
  values (v_org, v_fy, v_pay, null, p_sp2d_date, auth.uid());

  -- Guard status memastikan SP2D bertanggal ada sebelum status 'realisasi'.
  update public.realization_transactions set status = 'realisasi', updated_by = auth.uid() where id = v_tx;
  return v_tx;
end $$;

-- 3. Koreksi tanggal SP2D (Admin / izin realization.correct) ----------------------------------
create or replace function public.correct_realization_date(p_tx uuid, p_date date, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := app.current_org(); v_status text; v_item uuid; v_ver uuid; v_year int; v_reason text;
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  perform app.require_permission('realization.correct');
  v_reason := app.reason_required(p_reason);
  if p_date is null then raise exception 'Tanggal SP2D wajib diisi' using errcode = '22023'; end if;

  select t.status, t.budget_item_id, t.budget_version_id into v_status, v_item, v_ver
    from public.realization_transactions t where t.id = p_tx and t.organization_id = v_org;
  if v_status is null or not app.can_access_item(v_item) then
    raise exception 'Transaksi tidak ditemukan atau tidak berwenang' using errcode = '42501';
  end if;
  if v_status <> 'realisasi' then raise exception 'Hanya transaksi berstatus realisasi yang dapat dikoreksi' using errcode = '22023'; end if;

  select fy.year into v_year from public.budget_versions bv join public.fiscal_years fy on fy.id = bv.fiscal_year_id where bv.id = v_ver;
  if extract(year from p_date)::int <> v_year then
    raise exception 'Tanggal SP2D harus berada pada tahun anggaran %', v_year using errcode = '22023';
  end if;
  if p_date > v_today then raise exception 'Tanggal SP2D tidak boleh melebihi tanggal hari ini' using errcode = '22023'; end if;

  perform set_config('app.correction_reason', v_reason, true);  -- dicatat di workflow_events & dipakai guard
  update public.sp2d_records set sp2d_date = p_date
   where voided_at is null and payment_record_id in (select id from public.payment_records where transaction_id = p_tx);
  update public.realization_transactions set transaction_date = p_date, updated_by = auth.uid() where id = p_tx;
end $$;

-- 4. Transaksi lama yang menunggu verifikasi -> langsung realisasi bila SP2D sudah bertanggal ---
update public.realization_transactions t
   set status = 'realisasi'
 where t.status in ('submitted', 'payment_processing')
   and exists (select 1 from public.payment_records p where p.transaction_id = t.id)
   and not exists (
     select 1 from public.payment_records p
      where p.transaction_id = t.id
        and not exists (select 1 from public.sp2d_records s
                         where s.payment_record_id = p.id and s.sp2d_date is not null and s.voided_at is null));

-- Izin eksekusi
revoke all on function public.record_realization(uuid, uuid, date, text, uuid, uuid, numeric) from public, anon;
grant execute on function public.record_realization(uuid, uuid, date, text, uuid, uuid, numeric) to authenticated;
revoke all on function public.correct_realization_date(uuid, date, text) from public, anon;
grant execute on function public.correct_realization_date(uuid, date, text) to authenticated;

-- Keterangan izin disesuaikan (izin realization.verify dipertahankan hanya sebagai hak tulis koreksi/pembatalan oleh Admin)
update public.permissions set description = 'Hak koreksi/pembatalan realisasi oleh Admin (tidak ada lagi proses verifikasi)'
 where code = 'realization.verify';
