-- =====================================================================
-- 0007_master_crud_and_item_edit.sql
-- Tambahan (aditif): hapus terkendali data master, ubah/hapus butir anggaran, hapus draf anggaran kas.
-- Tidak mengubah tabel, kebijakan RLS, maupun fungsi yang sudah ada. Kebijakan "tanpa DELETE langsung"
-- pada master tetap berlaku; penghapusan hanya lewat fungsi di bawah (izin diperiksa eksplisit,
-- dibatasi organisasi pemanggil, dan ditolak bila data sudah dirujuk data lain).
-- =====================================================================

-- ---------- A. Hapus data master (hanya bila belum dirujuk) ----------
create or replace function public.delete_master_row(p_entity text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_org uuid := app.current_org(); n int;
begin
  perform app.require_permission('master.manage');
  if p_entity not in ('programs','activities','sub_activities','expenditure_accounts',
                      'funding_sources','procurement_methods','suppliers','rup_references') then
    raise exception 'Jenis master tidak dikenal' using errcode = '22023';
  end if;
  if v_org is null then raise exception 'Organisasi tidak ditemukan' using errcode = '42501'; end if;
  execute format('delete from public.%I where id = $1 and organization_id = $2', p_entity) using p_id, v_org;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Data tidak ditemukan' using errcode = '22023'; end if;
exception when foreign_key_violation then
  raise exception 'Data sudah dipakai oleh data lain sehingga tidak dapat dihapus. Gunakan Nonaktifkan agar riwayat tetap utuh.' using errcode = '22023';
end $$;

-- ---------- B. Ubah butir anggaran (klasifikasi) ----------
-- Hanya bila butir hanya ada pada versi ini dan belum memiliki transaksi realisasi.
create or replace function public.update_budget_item(
  p_version uuid, p_item uuid, p_sub_activity uuid, p_account uuid, p_funding uuid, p_description text
) returns void
language plpgsql security invoker set search_path = public as $$
declare v_org uuid := app.current_org(); v_status text; v_desc text := nullif(trim(coalesce(p_description, '')), ''); n int;
begin
  perform app.require_permission('budget.edit');
  select status into v_status from public.budget_versions where id = p_version and organization_id = v_org;
  if v_status is null then raise exception 'Versi anggaran tidak ditemukan' using errcode = '22023'; end if;
  if v_status not in ('draft', 'active') then
    raise exception 'Versi anggaran berstatus % tidak dapat diubah', v_status using errcode = '42501';
  end if;
  if not exists (select 1 from public.budget_item_versions where budget_version_id = p_version and budget_item_id = p_item) then
    raise exception 'Butir anggaran tidak ditemukan pada versi ini' using errcode = '22023';
  end if;
  if exists (select 1 from public.budget_item_versions where budget_item_id = p_item and budget_version_id <> p_version) then
    raise exception 'Butir ini juga dipakai pada versi anggaran lain; klasifikasinya tidak dapat diubah. Ubah pagu/PPTK, atau hapus lalu tambah butir baru.' using errcode = '22023';
  end if;
  if exists (select 1 from public.realization_transactions where budget_item_id = p_item and status <> 'cancelled') then
    raise exception 'Butir sudah memiliki transaksi realisasi; hanya pagu dan PPTK yang dapat diubah.' using errcode = '22023';
  end if;
  begin
    update public.budget_items
       set sub_activity_id = p_sub_activity, expenditure_account_id = p_account,
           funding_source_id = p_funding, description = v_desc
     where id = p_item and organization_id = v_org;
    get diagnostics n = row_count;
  exception when unique_violation then
    raise exception 'Butir anggaran dengan kombinasi yang sama sudah ada' using errcode = '23505';
  end;
  if n = 0 then raise exception 'Butir anggaran tidak dapat diubah' using errcode = '42501'; end if;
end $$;

-- ---------- C. Hapus butir anggaran dari versi (draf/aktif) ----------
create or replace function public.delete_budget_item(p_version uuid, p_item uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_org uuid := app.current_org(); v_status text; n int;
begin
  perform app.require_permission('budget.edit');
  select status into v_status from public.budget_versions where id = p_version and organization_id = v_org;
  if v_status is null then raise exception 'Versi anggaran tidak ditemukan' using errcode = '22023'; end if;
  if v_status not in ('draft', 'active') then
    raise exception 'Versi anggaran berstatus % tidak dapat diubah', v_status using errcode = '42501';
  end if;
  if exists (select 1 from public.realization_transactions
              where budget_version_id = p_version and budget_item_id = p_item) then
    raise exception 'Butir sudah memiliki transaksi realisasi sehingga tidak dapat dihapus' using errcode = '22023';
  end if;
  if exists (select 1 from public.cash_budget_plans
              where budget_version_id = p_version and budget_item_id = p_item and status in ('submitted', 'final')) then
    raise exception 'Anggaran kas butir ini sudah diajukan/final sehingga butir tidak dapat dihapus' using errcode = '22023';
  end if;

  delete from public.cash_budget_plans where budget_version_id = p_version and budget_item_id = p_item;
  delete from public.budget_item_versions
   where budget_version_id = p_version and budget_item_id = p_item and organization_id = v_org;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Butir anggaran tidak ditemukan pada versi ini' using errcode = '22023'; end if;

  -- Identitas butir ikut dihapus hanya bila tidak dipakai versi lain dan tidak dirujuk data lain.
  if not exists (select 1 from public.budget_item_versions where budget_item_id = p_item) then
    begin
      delete from public.budget_items where id = p_item and organization_id = v_org;
    exception when foreign_key_violation then
      null; -- masih dirujuk (paket/dokumen/transaksi dibatalkan): biarkan, tidak tampil di versi manapun
    end;
  end if;
end $$;

-- ---------- D. Hapus draf anggaran kas (PPTK penugasan) ----------
create or replace function public.delete_cash_plan(p_plan uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_item uuid; v_status text;
begin
  perform app.require_permission('cashplan.edit');
  select budget_item_id, status into v_item, v_status from public.cash_budget_plans
   where id = p_plan and organization_id = app.current_org();
  if v_item is null then raise exception 'Anggaran kas tidak ditemukan' using errcode = '22023'; end if;
  if not app.is_assigned_pptk(v_item) then
    raise exception 'Hanya PPTK penanggung jawab yang dapat menghapus anggaran kas butir ini' using errcode = '42501';
  end if;
  if v_status not in ('draft', 'returned') then
    raise exception 'Anggaran kas berstatus % tidak dapat dihapus', v_status using errcode = '42501';
  end if;
  delete from public.cash_budget_plans where id = p_plan;
end $$;

-- ---------- Hak eksekusi: hanya pengguna terautentikasi ----------
revoke all on function public.delete_master_row(text, uuid) from public, anon;
revoke all on function public.update_budget_item(uuid, uuid, uuid, uuid, uuid, text) from public, anon;
revoke all on function public.delete_budget_item(uuid, uuid) from public, anon;
revoke all on function public.delete_cash_plan(uuid) from public, anon;
grant execute on function public.delete_master_row(text, uuid) to authenticated;
grant execute on function public.update_budget_item(uuid, uuid, uuid, uuid, uuid, text) to authenticated;
grant execute on function public.delete_budget_item(uuid, uuid) to authenticated;
grant execute on function public.delete_cash_plan(uuid) to authenticated;
