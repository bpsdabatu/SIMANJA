-- =====================================================================
-- 0004_dashboard_kpis.sql
-- KPI dasbor dihitung di database (security invoker -> RLS pengguna berlaku).
-- Definisi realisasi sah tunggal: view v_eligible_realization.
-- =====================================================================
create or replace function public.dashboard_kpis(p_version uuid)
returns table (
  total_pagu            numeric,
  total_realisasi       numeric,
  sisa_anggaran         numeric,
  pct_realisasi         numeric,
  jumlah_butir_aktif    bigint,
  jumlah_menunggu_sp2d  bigint,
  jumlah_dokumen_reviu  bigint,
  total_menunggu_sp2d   numeric,
  total_komitmen        numeric,
  dihitung_pada         timestamptz
)
language sql stable security invoker set search_path = public as $$
  with b as (
    select coalesce(sum(pagu), 0)                 as pagu,
           coalesce(sum(eligible_realization), 0) as realisasi_sah,
           coalesce(sum(pending_sp2d), 0)         as pending,
           coalesce(sum(contract_commitment), 0)  as komitmen,
           count(*)                               as butir
    from public.v_budget_balance
    where budget_version_id = p_version
  ),
  tx as (
    select count(distinct t.id) as n
    from public.realization_transactions t
    join public.payment_records p on p.transaction_id = t.id
    where t.budget_version_id = p_version
      and t.status <> 'cancelled'
      and not exists (select 1 from public.v_eligible_realization r where r.payment_id = p.id)
  ),
  d as (
    select count(*) as n
    from public.procurement_documents x
    where x.status in ('submitted','resubmitted','under_review')
  )
  select b.pagu,
         b.realisasi_sah,
         b.pagu - b.realisasi_sah,
         case when b.pagu = 0 then null else round(b.realisasi_sah / b.pagu * 100, 2) end,
         b.butir,
         tx.n,
         d.n,
         b.pending,
         b.komitmen,
         now()
  from b, tx, d
$$;

revoke all on function public.dashboard_kpis(uuid) from public, anon;
grant execute on function public.dashboard_kpis(uuid) to authenticated;
