-- =====================================================================
-- 0006_workflows.sql
-- Fungsi alur kerja (RPC) untuk modul: versi & butir anggaran, anggaran kas, realisasi, dokumen.
-- SEMUA fungsi SECURITY INVOKER: RLS dan pelindung (trigger) yang sudah ada tetap berlaku penuh.
-- Fungsi hanya menambah (a) atomisitas multi-langkah, (b) validasi transisi, (c) pesan galat berbahasa Indonesia.
-- =====================================================================

create or replace function app.require_permission(p_permission text) returns void
language plpgsql stable set search_path = public as $$
begin
  if not app.has_permission(p_permission) then
    raise exception 'Anda tidak berwenang melakukan tindakan ini (%)', p_permission using errcode = '42501';
  end if;
end $$;
revoke all on function app.require_permission(text) from public, anon;
grant execute on function app.require_permission(text) to authenticated, service_role;

create or replace function app.reason_required(p_reason text) returns text
language plpgsql immutable as $$
declare r text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if r is null then raise exception 'Alasan wajib diisi' using errcode = '22023'; end if;
  return r;
end $$;
revoke all on function app.reason_required(text) from public, anon;
grant execute on function app.reason_required(text) to authenticated, service_role;

-- Pemeriksaan keanggotaan peran dalam organisasi pemanggil. SECURITY DEFINER karena RLS user_roles
-- hanya mengizinkan admin membaca peran orang lain; fungsi hanya mengembalikan true/false.
create or replace function app.has_active_role(p_user uuid, p_role text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles pr
      join public.user_roles ur on ur.user_id = pr.id and ur.role_code = p_role
     where pr.id = p_user and pr.status = 'active' and pr.organization_id = app.current_org())
$$;
revoke all on function app.has_active_role(uuid, text) from public, anon;
grant execute on function app.has_active_role(uuid, text) to authenticated, service_role;

-- =====================================================================
-- A. VERSI & BUTIR ANGGARAN
-- =====================================================================
create or replace function public.create_budget_version(
  p_year int, p_stage text, p_note text default null, p_copy_from uuid default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_org uuid := app.current_org(); v_fy uuid; v_no int; v_id uuid;
begin
  perform app.require_permission('budget.edit');
  if p_year is null or p_year not between 2000 and 2100 then
    raise exception 'Tahun anggaran tidak valid' using errcode = '22023';
  end if;
  if not exists (select 1 from public.budget_stages where code = p_stage) then
    raise exception 'Tahapan anggaran tidak valid' using errcode = '22023';
  end if;
  if p_copy_from is not null and not exists (
       select 1 from public.budget_versions where id = p_copy_from and organization_id = v_org) then
    raise exception 'Versi sumber salinan tidak ditemukan' using errcode = '22023';
  end if;

  select id into v_fy from public.fiscal_years where organization_id = v_org and year = p_year;
  if v_fy is null then
    insert into public.fiscal_years (organization_id, year) values (v_org, p_year) returning id into v_fy;
  end if;

  select coalesce(max(version_no), 0) + 1 into v_no
    from public.budget_versions where fiscal_year_id = v_fy and stage_code = p_stage;

  insert into public.budget_versions (organization_id, fiscal_year_id, stage_code, version_no, status, parent_version_id, note, created_by)
  values (v_org, v_fy, p_stage, v_no, 'draft', p_copy_from, nullif(trim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_id;

  if p_copy_from is not null then
    insert into public.budget_item_versions (organization_id, budget_version_id, budget_item_id, pagu, created_by)
    select v_org, v_id, budget_item_id, pagu, auth.uid()
      from public.budget_item_versions where budget_version_id = p_copy_from;
  end if;
  return v_id;
end $$;

create or replace function public.set_budget_version_status(p_version uuid, p_to text) returns void
language plpgsql security invoker set search_path = public as $$
declare v_from text; n int;
begin
  perform app.require_permission('budget.edit');
  select status into v_from from public.budget_versions where id = p_version;
  if v_from is null then raise exception 'Versi anggaran tidak ditemukan' using errcode = '22023'; end if;
  if not ((v_from = 'draft' and p_to = 'active') or (v_from = 'active' and p_to = 'final')) then
    raise exception 'Perubahan status % -> % tidak diizinkan', v_from, p_to using errcode = '22023';
  end if;
  if p_to = 'final' then perform app.require_permission('budget.finalize'); end if;
  update public.budget_versions set status = p_to where id = p_version;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Versi anggaran tidak dapat diubah' using errcode = '42501'; end if;
end $$;

create or replace function public.add_budget_item(
  p_version uuid, p_sub_activity uuid, p_account uuid, p_funding uuid,
  p_pptk uuid, p_description text, p_pagu numeric, p_rup uuid default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_org uuid := app.current_org(); v_fy uuid; v_status text; v_item uuid;
  v_desc text := nullif(trim(coalesce(p_description, '')), '');
  v_zero constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  perform app.require_permission('budget.edit');
  if p_pagu is null or p_pagu < 0 then raise exception 'Pagu tidak boleh negatif' using errcode = '22023'; end if;

  select fiscal_year_id, status into v_fy, v_status from public.budget_versions
   where id = p_version and organization_id = v_org;
  if v_fy is null then raise exception 'Versi anggaran tidak ditemukan' using errcode = '22023'; end if;
  if v_status not in ('draft', 'active') then
    raise exception 'Versi anggaran berstatus % tidak dapat diubah', v_status using errcode = '42501';
  end if;

  if p_pptk is not null and not app.has_active_role(p_pptk, 'pptk') then
    raise exception 'PPTK yang dipilih tidak valid' using errcode = '22023';
  end if;

  -- Identitas butir dipakai ulang lintas tahapan (Murni -> Pergeseran -> Perubahan) pada tahun yang sama.
  select id into v_item from public.budget_items
   where organization_id = v_org and fiscal_year_id = v_fy and sub_activity_id = p_sub_activity
     and expenditure_account_id = p_account and funding_source_id = p_funding
     and coalesce(rup_reference_id, v_zero) = coalesce(p_rup, v_zero)
     and coalesce(description, '') = coalesce(v_desc, '');

  if v_item is null then
    -- ID dibuat di muka & tanpa RETURNING: kebijakan SELECT memakai fungsi yang tidak melihat baris
    -- yang baru disisipkan pada pernyataan yang sama.
    v_item := gen_random_uuid();
    insert into public.budget_items (id, organization_id, fiscal_year_id, sub_activity_id, expenditure_account_id,
                                     funding_source_id, pptk_id, rup_reference_id, description, created_by)
    values (v_item, v_org, v_fy, p_sub_activity, p_account, p_funding, p_pptk, p_rup, v_desc, auth.uid());
  end if;

  begin
    insert into public.budget_item_versions (organization_id, budget_version_id, budget_item_id, pagu, created_by)
    values (v_org, p_version, v_item, p_pagu, auth.uid());
  exception when unique_violation then
    raise exception 'Butir anggaran yang sama sudah ada pada versi ini' using errcode = '23505';
  end;
  return v_item;
end $$;

create or replace function public.update_item_pagu(p_version uuid, p_item uuid, p_pagu numeric, p_note text default null)
returns void
language plpgsql security invoker set search_path = public as $$
declare v_used numeric(18,2); n int;
begin
  perform app.require_permission('budget.edit');
  if p_pagu is null or p_pagu < 0 then raise exception 'Pagu tidak boleh negatif' using errcode = '22023'; end if;
  select coalesce(eligible_realization, 0) + coalesce(pending_sp2d, 0) into v_used
    from public.v_budget_balance where budget_version_id = p_version and budget_item_id = p_item;
  if v_used is not null and p_pagu < v_used then
    raise exception 'Pagu tidak boleh lebih kecil dari realisasi dan pembayaran berjalan (%)', v_used using errcode = '23514';
  end if;
  update public.budget_item_versions
     set pagu = p_pagu, adjustment_note = nullif(trim(coalesce(p_note, '')), '')
   where budget_version_id = p_version and budget_item_id = p_item;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Butir anggaran tidak ditemukan atau tidak dapat diubah' using errcode = '42501'; end if;
end $$;

-- =====================================================================
-- B. ANGGARAN KAS (bulanan)
-- =====================================================================
create or replace function public.save_cash_plan(p_version uuid, p_item uuid, p_months numeric[]) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_org uuid := app.current_org(); v_pagu numeric(18,2); v_sum numeric(18,2); v_plan uuid; v_status text; m numeric;
begin
  perform app.require_permission('cashplan.edit');
  if p_months is null or array_length(p_months, 1) is distinct from 12 then
    raise exception 'Anggaran kas harus berisi 12 bulan' using errcode = '22023';
  end if;
  foreach m in array p_months loop
    if m is null or m < 0 then raise exception 'Nilai anggaran kas tidak boleh kosong atau negatif' using errcode = '22023'; end if;
  end loop;

  select pagu into v_pagu from public.budget_item_versions where budget_version_id = p_version and budget_item_id = p_item;
  if v_pagu is null then raise exception 'Butir anggaran tidak ditemukan pada versi ini' using errcode = '22023'; end if;
  select sum(x) into v_sum from unnest(p_months) x;
  if v_sum > v_pagu then
    raise exception 'Total anggaran kas (%) melebihi pagu (%)', v_sum, v_pagu using errcode = '23514';
  end if;

  select id, status into v_plan, v_status from public.cash_budget_plans
   where budget_version_id = p_version and budget_item_id = p_item;
  if v_plan is null then
    insert into public.cash_budget_plans (organization_id, budget_version_id, budget_item_id, status, updated_by)
    values (v_org, p_version, p_item, 'draft', auth.uid()) returning id into v_plan;
  else
    -- Baris rencana tidak diubah di sini (kebijakan UPDATE PPTK tidak mengizinkan status 'returned');
    -- hanya periodenya, yang diizinkan selama draf/dikembalikan.
    if v_status not in ('draft', 'returned') then
      raise exception 'Anggaran kas berstatus % tidak dapat diubah', v_status using errcode = '42501';
    end if;
  end if;

  delete from public.cash_budget_periods where plan_id = v_plan and period_type = 'month';
  insert into public.cash_budget_periods (plan_id, period_type, period_no, amount)
  select v_plan, 'month', g, p_months[g] from generate_subscripts(p_months, 1) g;
  return v_plan;
end $$;

create or replace function public.set_cash_plan_status(p_plan uuid, p_to text, p_reason text default null) returns void
language plpgsql security invoker set search_path = public as $$
declare v_from text; v_sum numeric; n int;
begin
  select status into v_from from public.cash_budget_plans where id = p_plan;
  if v_from is null then raise exception 'Anggaran kas tidak ditemukan' using errcode = '22023'; end if;

  if p_to = 'submitted' and v_from in ('draft', 'returned') then
    perform app.require_permission('cashplan.submit');
    select coalesce(sum(amount), 0) into v_sum from public.cash_budget_periods where plan_id = p_plan;
    if v_sum <= 0 then raise exception 'Isi anggaran kas sebelum diajukan' using errcode = '22023'; end if;
  elsif p_to = 'returned' and v_from = 'submitted' then
    perform app.require_permission('cashplan.finalize');
    p_reason := app.reason_required(p_reason);
  elsif p_to = 'final' and v_from = 'submitted' then
    perform app.require_permission('cashplan.finalize');
  else
    raise exception 'Perubahan status % -> % tidak diizinkan', v_from, p_to using errcode = '22023';
  end if;

  update public.cash_budget_plans
     set status = p_to,
         revision_no = case when p_to = 'submitted' then revision_no + 1 else revision_no end,
         change_reason = nullif(trim(coalesce(p_reason, '')), ''),
         updated_by = auth.uid()
   where id = p_plan;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Tidak berwenang atau status telah berubah' using errcode = '42501'; end if;
end $$;

-- =====================================================================
-- C. REALISASI BELANJA
-- =====================================================================
create or replace function public.create_transaction(
  p_version uuid, p_item uuid, p_date date, p_description text, p_supplier uuid, p_method uuid, p_amount numeric
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_org uuid := app.current_org(); v_tx uuid; v_desc text := nullif(trim(coalesce(p_description, '')), '');
begin
  perform app.require_permission('realization.edit');
  if v_desc is null then raise exception 'Uraian transaksi wajib diisi' using errcode = '22023'; end if;
  if p_date is null then raise exception 'Tanggal transaksi wajib diisi' using errcode = '22023'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Nilai pembayaran harus lebih dari nol' using errcode = '22023'; end if;
  if not exists (select 1 from public.budget_item_versions where budget_version_id = p_version and budget_item_id = p_item) then
    raise exception 'Butir anggaran tidak ditemukan pada versi ini' using errcode = '22023';
  end if;

  insert into public.realization_transactions (organization_id, budget_version_id, budget_item_id, transaction_date,
        description, supplier_id, procurement_method_id, status, created_by)
  values (v_org, p_version, p_item, p_date, v_desc, p_supplier, p_method, 'draft', auth.uid())
  returning id into v_tx;

  insert into public.payment_records (organization_id, transaction_id, amount, created_by)
  values (v_org, v_tx, p_amount, auth.uid());
  return v_tx;
end $$;

create or replace function public.add_payment(p_tx uuid, p_amount numeric, p_note text default null) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_org uuid := app.current_org(); v_id uuid;
begin
  perform app.require_permission('realization.edit');
  if p_amount is null or p_amount <= 0 then raise exception 'Nilai pembayaran harus lebih dari nol' using errcode = '22023'; end if;
  insert into public.payment_records (organization_id, transaction_id, amount, payment_note, created_by)
  values (v_org, p_tx, p_amount, nullif(trim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_id;
  return v_id;
exception when insufficient_privilege then
  raise exception 'Tidak berwenang menambah pembayaran (hanya pada transaksi draf atau dikembalikan milik PPTK penugasan)' using errcode = '42501';
end $$;

create or replace function public.submit_transaction(p_tx uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare v_status text; n int;
begin
  perform app.require_permission('realization.submit');
  select status into v_status from public.realization_transactions where id = p_tx;
  if v_status is null then raise exception 'Transaksi tidak ditemukan' using errcode = '22023'; end if;
  if v_status not in ('draft', 'returned') then
    raise exception 'Transaksi berstatus % tidak dapat diajukan', v_status using errcode = '22023';
  end if;
  if not exists (select 1 from public.payment_records where transaction_id = p_tx) then
    raise exception 'Tambahkan minimal satu pembayaran sebelum mengajukan' using errcode = '22023';
  end if;
  update public.realization_transactions set status = 'submitted', updated_by = auth.uid() where id = p_tx;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Tidak berwenang mengajukan transaksi ini' using errcode = '42501'; end if;
end $$;

create or replace function public.record_sp2d(p_payment uuid, p_number text, p_date date) returns void
language plpgsql security invoker set search_path = public as $$
declare v_org uuid := app.current_org(); v_tx uuid; v_status text; v_fy uuid; v_num text := nullif(trim(coalesce(p_number, '')), '');
begin
  perform app.require_permission('realization.verify');
  if v_num is null then raise exception 'Nomor SP2D wajib diisi' using errcode = '22023'; end if;
  if p_date is null then raise exception 'Tanggal SP2D wajib diisi' using errcode = '22023'; end if;

  select t.id, t.status, bv.fiscal_year_id into v_tx, v_status, v_fy
    from public.payment_records p
    join public.realization_transactions t on t.id = p.transaction_id
    join public.budget_versions bv on bv.id = t.budget_version_id
   where p.id = p_payment;
  if v_tx is null then raise exception 'Pembayaran tidak ditemukan' using errcode = '22023'; end if;
  if v_status not in ('submitted', 'payment_processing') then
    raise exception 'SP2D hanya dapat dicatat pada transaksi yang sudah diajukan dan belum final (status: %)', v_status using errcode = '22023';
  end if;

  if exists (select 1 from public.sp2d_records where payment_record_id = p_payment) then
    update public.sp2d_records set sp2d_number = v_num, sp2d_date = p_date, voided_at = null, void_reason = null
     where payment_record_id = p_payment;
  else
    insert into public.sp2d_records (organization_id, fiscal_year_id, payment_record_id, sp2d_number, sp2d_date, created_by)
    values (v_org, v_fy, p_payment, v_num, p_date, auth.uid());
  end if;

  if v_status = 'submitted' then
    update public.realization_transactions set status = 'payment_processing', updated_by = auth.uid() where id = v_tx;
  end if;
exception when unique_violation then
  raise exception 'Nomor SP2D % sudah dipakai pada tahun anggaran ini', v_num using errcode = '23505';
end $$;

create or replace function public.verify_transaction(p_tx uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare v_status text; n int;
begin
  perform app.require_permission('realization.verify');
  select status into v_status from public.realization_transactions where id = p_tx;
  if v_status is null then raise exception 'Transaksi tidak ditemukan' using errcode = '22023'; end if;
  if v_status not in ('submitted', 'payment_processing') then
    raise exception 'Transaksi berstatus % tidak dapat diverifikasi', v_status using errcode = '22023';
  end if;
  update public.realization_transactions set status = 'realisasi', updated_by = auth.uid() where id = p_tx;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Tidak berwenang memverifikasi transaksi ini' using errcode = '42501'; end if;
end $$;

create or replace function public.return_transaction(p_tx uuid, p_reason text) returns void
language plpgsql security invoker set search_path = public as $$
declare v_status text; v_reason text; n int;
begin
  perform app.require_permission('realization.verify');
  v_reason := app.reason_required(p_reason);
  select status into v_status from public.realization_transactions where id = p_tx;
  if v_status is null or v_status not in ('submitted', 'payment_processing') then
    raise exception 'Hanya transaksi yang diajukan yang dapat dikembalikan' using errcode = '22023';
  end if;
  perform set_config('app.correction_reason', v_reason, true);  -- tercatat di workflow_events
  update public.realization_transactions set status = 'returned', updated_by = auth.uid() where id = p_tx;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Tidak berwenang mengembalikan transaksi ini' using errcode = '42501'; end if;
end $$;

create or replace function public.cancel_transaction(p_tx uuid, p_reason text) returns void
language plpgsql security invoker set search_path = public as $$
declare v_status text; v_reason text; n int;
begin
  v_reason := app.reason_required(p_reason);
  select status into v_status from public.realization_transactions where id = p_tx;
  if v_status is null then raise exception 'Transaksi tidak ditemukan' using errcode = '22023'; end if;
  if v_status = 'cancelled' then raise exception 'Transaksi sudah dibatalkan' using errcode = '22023'; end if;
  if v_status = 'realisasi' then perform app.require_permission('realization.correct');
  else perform app.require_permission('realization.verify'); end if;
  perform set_config('app.correction_reason', v_reason, true);
  update public.realization_transactions set status = 'cancelled', cancel_reason = v_reason, updated_by = auth.uid() where id = p_tx;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Tidak berwenang membatalkan transaksi ini' using errcode = '42501'; end if;
end $$;

create or replace function public.correct_sp2d(p_payment uuid, p_number text, p_date date, p_reason text) returns void
language plpgsql security invoker set search_path = public as $$
declare v_reason text; n int; v_num text := nullif(trim(coalesce(p_number, '')), '');
begin
  perform app.require_permission('realization.correct');
  v_reason := app.reason_required(p_reason);
  if v_num is null or p_date is null then raise exception 'Nomor dan tanggal SP2D wajib diisi' using errcode = '22023'; end if;
  perform set_config('app.correction_reason', v_reason, true);
  update public.sp2d_records set sp2d_number = v_num, sp2d_date = p_date where payment_record_id = p_payment and voided_at is null;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'SP2D tidak ditemukan atau tidak berwenang' using errcode = '42501'; end if;
exception when unique_violation then
  raise exception 'Nomor SP2D % sudah dipakai pada tahun anggaran ini', v_num using errcode = '23505';
end $$;

-- =====================================================================
-- D. DOKUMEN PENGADAAN
-- =====================================================================
create or replace function public.create_document(
  p_type text, p_item uuid, p_title text, p_ppk uuid, p_ppbj uuid, p_content jsonb
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_org uuid := app.current_org(); v_id uuid; v_title text := nullif(trim(coalesce(p_title, '')), '');
begin
  if v_title is null then raise exception 'Judul dokumen wajib diisi' using errcode = '22023'; end if;
  if p_ppk is not null and not app.has_active_role(p_ppk, 'ppk') then
    raise exception 'PPK yang dipilih tidak valid' using errcode = '22023';
  end if;
  if p_ppbj is not null and not app.has_active_role(p_ppbj, 'ppbj') then
    raise exception 'PPBJ yang dipilih tidak valid' using errcode = '22023';
  end if;

  v_id := gen_random_uuid();  -- tanpa RETURNING (lihat catatan pada add_budget_item)
  insert into public.procurement_documents (id, organization_id, doc_type, budget_item_id, title, status, created_by,
                                            assigned_ppk_id, assigned_ppbj_id)
  values (v_id, v_org, p_type, p_item, v_title, 'draft', auth.uid(), p_ppk, p_ppbj);

  insert into public.document_revisions (document_id, revision_no, content, change_note, created_by)
  values (v_id, 1, coalesce(p_content, '{}'::jsonb), 'Revisi awal', auth.uid());
  return v_id;
end $$;

create or replace function public.save_document_revision(p_doc uuid, p_title text, p_content jsonb, p_note text default null)
returns int
language plpgsql security invoker set search_path = public as $$
declare v_status text; v_owner uuid; v_no int;
begin
  select status, created_by into v_status, v_owner from public.procurement_documents where id = p_doc;
  if v_status is null then raise exception 'Dokumen tidak ditemukan' using errcode = '22023'; end if;
  if v_owner <> auth.uid() then raise exception 'Hanya penyusun dokumen yang dapat mengubah isi' using errcode = '42501'; end if;
  if v_status not in ('draft', 'returned_for_correction') then
    raise exception 'Dokumen berstatus % tidak dapat diubah', v_status using errcode = '42501';
  end if;
  select coalesce(max(revision_no), 0) + 1 into v_no from public.document_revisions where document_id = p_doc;
  insert into public.document_revisions (document_id, revision_no, content, change_note, created_by)
  values (p_doc, v_no, coalesce(p_content, '{}'::jsonb), nullif(trim(coalesce(p_note, '')), ''), auth.uid());
  if nullif(trim(coalesce(p_title, '')), '') is not null then
    update public.procurement_documents set title = trim(p_title) where id = p_doc;
  end if;
  return v_no;
end $$;

create or replace function public.submit_document(p_doc uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare v_status text; v_owner uuid; v_to text; n int;
begin
  select status, created_by into v_status, v_owner from public.procurement_documents where id = p_doc;
  if v_status is null then raise exception 'Dokumen tidak ditemukan' using errcode = '22023'; end if;
  if v_owner <> auth.uid() then raise exception 'Hanya penyusun dokumen yang dapat mengajukan' using errcode = '42501'; end if;
  if v_status = 'draft' then v_to := 'submitted';
  elsif v_status = 'returned_for_correction' then v_to := 'resubmitted';
  else raise exception 'Dokumen berstatus % tidak dapat diajukan', v_status using errcode = '22023'; end if;
  update public.procurement_documents set status = v_to where id = p_doc;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Tidak berwenang mengajukan dokumen ini' using errcode = '42501'; end if;
end $$;

create or replace function public.start_review(p_doc uuid) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_status text; v_rev uuid; v_review uuid; n int;
begin
  perform app.require_permission('document.review');
  select status into v_status from public.procurement_documents where id = p_doc and assigned_ppbj_id = auth.uid();
  if v_status is null then raise exception 'Dokumen tidak ditugaskan kepada Anda' using errcode = '42501'; end if;
  if v_status not in ('submitted', 'resubmitted') then
    raise exception 'Dokumen berstatus % tidak dapat direviu', v_status using errcode = '22023';
  end if;
  select id into v_rev from public.document_revisions where document_id = p_doc order by revision_no desc limit 1;
  update public.procurement_documents set status = 'under_review' where id = p_doc;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Tidak berwenang mereviu dokumen ini' using errcode = '42501'; end if;
  insert into public.document_reviews (document_id, revision_id, reviewer_id)
  values (p_doc, v_rev, auth.uid()) returning id into v_review;
  return v_review;
end $$;

create or replace function public.add_finding(p_review uuid, p_finding text, p_correction text default null) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_id uuid; v_f text := nullif(trim(coalesce(p_finding, '')), '');
begin
  perform app.require_permission('document.review');
  if v_f is null then raise exception 'Uraian temuan wajib diisi' using errcode = '22023'; end if;
  insert into public.review_findings (review_id, finding, required_correction)
  values (p_review, v_f, nullif(trim(coalesce(p_correction, '')), '')) returning id into v_id;
  return v_id;
exception when others then
  if sqlstate in ('42501') then raise exception 'Hanya reviewer dokumen yang dapat menambah temuan' using errcode = '42501'; end if;
  raise;
end $$;

create or replace function public.return_document(p_doc uuid, p_reason text) returns void
language plpgsql security invoker set search_path = public as $$
declare v_status text; v_ppbj uuid; v_ppk uuid; v_reason text; v_review uuid; n int;
begin
  v_reason := app.reason_required(p_reason);
  select status, assigned_ppbj_id, assigned_ppk_id into v_status, v_ppbj, v_ppk
    from public.procurement_documents where id = p_doc;
  if v_status is null then raise exception 'Dokumen tidak ditemukan' using errcode = '22023'; end if;
  perform set_config('app.correction_reason', v_reason, true);

  if v_status = 'under_review' and v_ppbj = auth.uid() then
    perform app.require_permission('document.review');
    select id into v_review from public.document_reviews
     where document_id = p_doc and reviewer_id = auth.uid() and outcome is null order by created_at desc limit 1;
    if v_review is null then raise exception 'Reviu belum dimulai' using errcode = '22023'; end if;
    if not exists (select 1 from public.review_findings where review_id = v_review) then
      insert into public.review_findings (review_id, finding) values (v_review, v_reason);
    end if;
    update public.document_reviews set outcome = 'returned', reviewed_at = now() where id = v_review;
  elsif v_status in ('submitted', 'resubmitted') and v_ppk = auth.uid() then
    perform app.require_permission('document.return');
  else
    raise exception 'Dokumen tidak dapat dikembalikan oleh Anda pada status %', v_status using errcode = '42501';
  end if;

  update public.procurement_documents set status = 'returned_for_correction' where id = p_doc;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Tidak berwenang mengembalikan dokumen ini' using errcode = '42501'; end if;
end $$;

create or replace function public.complete_review(p_doc uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare v_status text; v_review uuid; n int;
begin
  perform app.require_permission('document.review');
  select status into v_status from public.procurement_documents where id = p_doc and assigned_ppbj_id = auth.uid();
  if v_status is distinct from 'under_review' then
    raise exception 'Dokumen tidak sedang Anda reviu' using errcode = '22023';
  end if;
  select id into v_review from public.document_reviews
   where document_id = p_doc and reviewer_id = auth.uid() and outcome is null order by created_at desc limit 1;
  if v_review is null then raise exception 'Reviu belum dimulai' using errcode = '22023'; end if;
  if exists (select 1 from public.review_findings where review_id = v_review and not is_resolved) then
    raise exception 'Masih ada temuan yang belum selesai; kembalikan dokumen atau tandai temuan selesai' using errcode = '22023';
  end if;
  update public.document_reviews set outcome = 'completed', reviewed_at = now() where id = v_review;
  update public.procurement_documents set status = 'review_completed' where id = p_doc;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Tidak berwenang menyelesaikan reviu' using errcode = '42501'; end if;
end $$;

create or replace function public.issue_minutes(p_doc uuid, p_minutes_no text, p_content jsonb default '{}'::jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_status text; v_review uuid; v_id uuid; n int;
begin
  perform app.require_permission('document.issue_ba');
  select status into v_status from public.procurement_documents where id = p_doc and assigned_ppbj_id = auth.uid();
  if v_status is distinct from 'review_completed' then
    raise exception 'Berita Acara hanya dapat diterbitkan setelah reviu selesai' using errcode = '22023';
  end if;
  select id into v_review from public.document_reviews
   where document_id = p_doc and reviewer_id = auth.uid() and outcome = 'completed' order by created_at desc limit 1;
  if v_review is null then raise exception 'Reviu selesai tidak ditemukan' using errcode = '22023'; end if;
  insert into public.review_minutes (review_id, minutes_no, content, issued_by, issued_at)
  values (v_review, nullif(trim(coalesce(p_minutes_no, '')), ''), coalesce(p_content, '{}'::jsonb), auth.uid(), now())
  returning id into v_id;
  update public.procurement_documents set status = 'issued' where id = p_doc;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Tidak berwenang menerbitkan Berita Acara' using errcode = '42501'; end if;
  return v_id;
end $$;

create or replace function public.cancel_document(p_doc uuid, p_reason text) returns void
language plpgsql security invoker set search_path = public as $$
declare v_status text; v_owner uuid; v_reason text; n int;
begin
  v_reason := app.reason_required(p_reason);
  select status, created_by into v_status, v_owner from public.procurement_documents where id = p_doc;
  if v_status is null then raise exception 'Dokumen tidak ditemukan' using errcode = '22023'; end if;
  if v_owner <> auth.uid() then raise exception 'Hanya penyusun dokumen yang dapat membatalkan' using errcode = '42501'; end if;
  if v_status not in ('draft', 'returned_for_correction') then
    raise exception 'Dokumen berstatus % tidak dapat dibatalkan', v_status using errcode = '22023';
  end if;
  update public.procurement_documents set status = 'cancelled', cancel_reason = v_reason where id = p_doc;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Tidak berwenang membatalkan dokumen ini' using errcode = '42501'; end if;
end $$;

-- =====================================================================
-- Hak eksekusi: hanya pengguna terautentikasi (RLS tetap penentu akhir)
-- =====================================================================
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in (
              'create_budget_version','set_budget_version_status','add_budget_item','update_item_pagu',
              'save_cash_plan','set_cash_plan_status',
              'create_transaction','add_payment','submit_transaction','record_sp2d','verify_transaction',
              'return_transaction','cancel_transaction','correct_sp2d',
              'create_document','save_document_revision','submit_document','start_review','add_finding',
              'return_document','complete_review','issue_minutes','cancel_document') loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
