-- =====================================================================
-- 0008_cashplan_zero_submit.sql
-- Anggaran kas bernilai Rp 0 (butir berpagu 0, atau butir yang memang tidak
-- ditarik kasnya pada tahun ini) kini dapat DIAJUKAN dan DIFINALISASI.
--
-- Sebelumnya set_cash_plan_status menolak pengajuan bila total kas <= 0
-- ("Isi anggaran kas sebelum diajukan"), sehingga butir berpagu 0 tidak pernah
-- dapat diproses. Pengaman tetap dipertahankan:
--   * rencana kas harus sudah disimpan (baris cash_budget_plans + 12 periode);
--   * total kas tidak pernah boleh melebihi pagu (diperiksa save_cash_plan);
--   * semua perubahan status tetap tercatat di audit.
-- Idempotent: aman dijalankan ulang.
-- =====================================================================
create or replace function public.set_cash_plan_status(p_plan uuid, p_to text, p_reason text default null) returns void
language plpgsql security invoker set search_path = public as $$
declare v_from text; v_periods int; n int;
begin
  select status into v_from from public.cash_budget_plans where id = p_plan;
  if v_from is null then raise exception 'Anggaran kas tidak ditemukan' using errcode = '22023'; end if;

  if p_to = 'submitted' and v_from in ('draft', 'returned') then
    perform app.require_permission('cashplan.submit');
    -- Nilai 0 diperbolehkan, tetapi rencana harus sudah disimpan lengkap 12 bulan.
    select count(*) into v_periods from public.cash_budget_periods where plan_id = p_plan and period_type = 'month';
    if v_periods <> 12 then raise exception 'Simpan anggaran kas (12 bulan) sebelum diajukan' using errcode = '22023'; end if;
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

revoke all on function public.set_cash_plan_status(uuid, text, text) from public, anon;
grant execute on function public.set_cash_plan_status(uuid, text, text) to authenticated;
