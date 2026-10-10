-- =====================================================================
-- 0003_rls_and_functions.sql
-- Fungsi otorisasi, konteks anggaran, view pelaporan, RLS deny-by-default
-- =====================================================================

-- ---------- akses butir anggaran (assignment + scope) ----------
create or replace function app.item_in_scope(p_item uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.budget_items bi
    join public.sub_activities sa on sa.id = bi.sub_activity_id
    join public.activities a on a.id = sa.activity_id
    join public.user_scopes us on us.user_id = auth.uid()
    where bi.id = p_item
      and (   us.scope_type = 'organization'
           or (us.scope_type = 'program'      and us.scope_id = a.program_id)
           or (us.scope_type = 'activity'     and us.scope_id = sa.activity_id)
           or (us.scope_type = 'sub_activity' and us.scope_id = bi.sub_activity_id)
           or (us.scope_type = 'budget_item'  and us.scope_id = bi.id)))
$$;

create or replace function app.is_assigned_pptk(p_item uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.budget_items bi
                 where bi.id = p_item and bi.pptk_id = auth.uid()
                   and bi.organization_id = app.current_org())
$$;

create or replace function app.can_access_item(p_item uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.budget_items bi
    where bi.id = p_item and bi.organization_id = app.current_org()
      and (app.has_role('admin') or bi.pptk_id = auth.uid() or app.item_in_scope(bi.id)))
$$;

create or replace function app.can_access_transaction(p_tx uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.realization_transactions t
                 where t.id = p_tx and t.organization_id = app.current_org()
                   and app.can_access_item(t.budget_item_id))
$$;

create or replace function app.can_edit_transaction(p_tx uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.realization_transactions t
                 where t.id = p_tx and t.organization_id = app.current_org()
                   and app.has_permission('realization.edit')
                   and app.is_assigned_pptk(t.budget_item_id)
                   and t.status in ('draft','returned'))
$$;

create or replace function app.can_access_document(p_doc uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.procurement_documents d
    where d.id = p_doc and d.organization_id = app.current_org()
      and app.has_permission('document.view')
      and (   app.has_role('admin')
           or d.created_by = auth.uid()
           or d.assigned_ppk_id = auth.uid()
           or d.assigned_ppbj_id = auth.uid()
           or (app.has_role('ppk') and app.item_in_scope(d.budget_item_id))))
$$;

-- ---------- konteks anggaran (tahun + tahapan) ----------
create or replace function app.list_budget_contexts()
returns table (fiscal_year int, stage_code text, stage_name text,
               budget_version_id uuid, version_no int, status text)
language sql stable security definer set search_path = public as $$
  select fy.year, bv.stage_code, bs.name, bv.id, bv.version_no, bv.status
  from public.budget_versions bv
  join public.fiscal_years fy on fy.id = bv.fiscal_year_id
  join public.budget_stages bs on bs.code = bv.stage_code
  where bv.organization_id = app.current_org()
    and (bv.status in ('active','final') or (bv.status = 'draft' and app.has_permission('budget.edit')))
    and bv.version_no = (
      select max(b2.version_no) from public.budget_versions b2
      where b2.organization_id = bv.organization_id
        and b2.fiscal_year_id = bv.fiscal_year_id and b2.stage_code = bv.stage_code
        and (b2.status in ('active','final') or (b2.status = 'draft' and app.has_permission('budget.edit'))))
  order by fy.year desc, bs.seq
$$;

create or replace function app.resolve_budget_context(p_year int, p_stage text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  select c.budget_version_id into v
  from app.list_budget_contexts() c
  where c.fiscal_year = p_year and c.stage_code = p_stage;
  if v is null then
    raise exception 'Konteks anggaran tidak valid atau tidak tersedia' using errcode = '42501';
  end if;
  return v;
end $$;

-- Pembungkus pada skema public agar dapat dipanggil lewat PostgREST .rpc() (schema app tidak diekspos)
create or replace function public.list_budget_contexts()
returns table (fiscal_year int, stage_code text, stage_name text,
               budget_version_id uuid, version_no int, status text)
language sql stable security invoker as $$ select * from app.list_budget_contexts() $$;

create or replace function public.resolve_budget_context(p_year int, p_stage text) returns uuid
language sql stable security invoker as $$ select app.resolve_budget_context(p_year, p_stage) $$;

-- ---------- view pelaporan: satu definisi realisasi sah ----------
-- Realisasi sah = transaksi berstatus 'realisasi' + pembayaran ber-SP2D bertanggal, tidak di-void.
create view public.v_eligible_realization with (security_invoker = true) as
select t.organization_id, t.id as transaction_id, t.budget_version_id, t.budget_item_id,
       t.transaction_date, p.id as payment_id, p.amount, s.sp2d_number, s.sp2d_date
from public.realization_transactions t
join public.payment_records p on p.transaction_id = t.id
join public.sp2d_records s on s.payment_record_id = p.id
where t.status = 'realisasi' and s.sp2d_date is not null and s.voided_at is null;

-- Pagu, realisasi sah, menunggu SP2D, dan komitmen kontrak sebagai metrik TERPISAH.
create view public.v_budget_balance with (security_invoker = true) as
select biv.organization_id, biv.budget_version_id, biv.budget_item_id, biv.pagu,
       coalesce(e.amount, 0)  as eligible_realization,
       coalesce(pd.amount, 0) as pending_sp2d,
       coalesce(c.amount, 0)  as contract_commitment,
       biv.pagu - coalesce(e.amount, 0) as sisa_anggaran,
       case when biv.pagu = 0 then null
            else round(coalesce(e.amount, 0) / biv.pagu * 100, 2) end as pct_realization,
       (coalesce(e.amount, 0) > biv.pagu) as is_over_budget
from public.budget_item_versions biv
left join lateral (
  select sum(r.amount) as amount from public.v_eligible_realization r
  where r.budget_version_id = biv.budget_version_id and r.budget_item_id = biv.budget_item_id) e on true
left join lateral (
  select sum(p.amount) as amount
  from public.payment_records p
  join public.realization_transactions t on t.id = p.transaction_id
  where t.budget_version_id = biv.budget_version_id and t.budget_item_id = biv.budget_item_id
    and t.status <> 'cancelled'
    and not exists (select 1 from public.v_eligible_realization r where r.payment_id = p.id)) pd on true
left join lateral (
  select sum(k.contract_value) as amount
  from public.procurement_contracts k
  join public.procurement_packages pk on pk.id = k.package_id
  where pk.budget_item_id = biv.budget_item_id and k.status <> 'cancelled') c on true;

-- ---------- pelindung kolom dokumen ----------
create or replace function app.guard_document_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.created_by <> old.created_by or new.organization_id <> old.organization_id
     or new.doc_type <> old.doc_type or new.budget_item_id <> old.budget_item_id then
    raise exception 'Kolom identitas dokumen tidak dapat diubah' using errcode = '42501';
  end if;
  if (new.assigned_ppk_id is distinct from old.assigned_ppk_id
      or new.assigned_ppbj_id is distinct from old.assigned_ppbj_id)
     and old.status <> 'draft' and auth.uid() is not null and not app.has_permission('users.manage') then
    raise exception 'Penugasan dokumen hanya dapat diubah saat draf atau oleh administrator' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_pd_cols before update on public.procurement_documents
  for each row execute function app.guard_document_columns();

create trigger trg_revisions_immutable before update or delete on public.document_revisions
  for each row execute function app.block_modification();

create trigger trg_audit_role_permissions after insert or update or delete on public.role_permissions
  for each row execute function app.audit_trigger();

-- =====================================================================
-- RLS: aktifkan pada SEMUA tabel public, lalu hanya buka lewat kebijakan eksplisit
-- =====================================================================
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- Tabel tanpa kebijakan (hanya service role): auth_identities, auth_attempts.

-- ---------- referensi global ----------
create policy roles_select on public.roles for select to authenticated using (true);
create policy permissions_select on public.permissions for select to authenticated using (true);
create policy budget_stages_select on public.budget_stages for select to authenticated using (true);
create policy role_permissions_select on public.role_permissions for select to authenticated using (true);
create policy role_permissions_write on public.role_permissions for all to authenticated
  using (app.has_permission('users.manage')) with check (app.has_permission('users.manage'));

-- ---------- organisasi, profil, peran, scope, pengaturan ----------
create policy organizations_select on public.organizations for select to authenticated
  using (id = app.current_org());

create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or organization_id = app.current_org());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- Pembuatan/ubah status akun: hanya server (service role) setelah cek users.manage.

create policy user_roles_select on public.user_roles for select to authenticated
  using (user_id = auth.uid()
      or (app.has_permission('users.manage')
          and exists (select 1 from public.profiles p where p.id = user_id and p.organization_id = app.current_org())));
create policy user_roles_write on public.user_roles for all to authenticated
  using (app.has_permission('users.manage')
         and exists (select 1 from public.profiles p where p.id = user_id and p.organization_id = app.current_org()))
  with check (app.has_permission('users.manage')
         and exists (select 1 from public.profiles p where p.id = user_id and p.organization_id = app.current_org()));

create policy user_scopes_select on public.user_scopes for select to authenticated
  using (user_id = auth.uid()
      or (app.has_permission('users.manage')
          and exists (select 1 from public.profiles p where p.id = user_id and p.organization_id = app.current_org())));
create policy user_scopes_write on public.user_scopes for all to authenticated
  using (app.has_permission('users.manage')
         and exists (select 1 from public.profiles p where p.id = user_id and p.organization_id = app.current_org()))
  with check (app.has_permission('users.manage')
         and exists (select 1 from public.profiles p where p.id = user_id and p.organization_id = app.current_org()));

create policy settings_select on public.application_settings for select to authenticated
  using (organization_id = app.current_org());
create policy settings_write on public.application_settings for all to authenticated
  using (organization_id = app.current_org() and app.has_permission('settings.manage'))
  with check (organization_id = app.current_org() and app.has_permission('settings.manage'));

-- ---------- audit & riwayat (baca saja) ----------
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (app.has_permission('audit.view') and organization_id = app.current_org());

create policy workflow_events_select on public.workflow_events for select to authenticated
  using (organization_id = app.current_org() and (
        (entity_type = 'realization_transactions' and app.can_access_transaction(entity_id))
     or (entity_type = 'procurement_documents'    and app.can_access_document(entity_id))));

-- ---------- data master (dibaca semua peran ber-master.view, ditulis master.manage) ----------
do $$
declare t text;
begin
  foreach t in array array['fiscal_years','programs','activities','sub_activities','expenditure_accounts',
    'funding_sources','procurement_methods','suppliers','rup_references'] loop
    execute format('create policy %1$s_select on public.%1$s for select to authenticated
      using (organization_id = app.current_org() and app.has_permission(%2$L))', t, 'master.view');
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated
      with check (organization_id = app.current_org() and app.has_permission(%2$L))', t, 'master.manage');
    execute format('create policy %1$s_update on public.%1$s for update to authenticated
      using (organization_id = app.current_org() and app.has_permission(%2$L))
      with check (organization_id = app.current_org() and app.has_permission(%2$L))', t, 'master.manage');
    -- Tanpa kebijakan DELETE: master dinonaktifkan (is_active=false), bukan dihapus.
  end loop;
end $$;

-- ---------- anggaran ----------
create policy budget_versions_select on public.budget_versions for select to authenticated
  using (organization_id = app.current_org()
     and (app.has_permission('budget.view') or app.has_permission('dashboard.view'))
     and (status <> 'draft' or app.has_permission('budget.edit')));
create policy budget_versions_insert on public.budget_versions for insert to authenticated
  with check (organization_id = app.current_org() and app.has_permission('budget.edit'));
create policy budget_versions_update on public.budget_versions for update to authenticated
  using (organization_id = app.current_org() and app.has_permission('budget.edit'))
  with check (organization_id = app.current_org() and app.has_permission('budget.edit'));

create policy budget_items_select on public.budget_items for select to authenticated
  using (organization_id = app.current_org() and app.has_permission('budget.view') and app.can_access_item(id));
-- PPBJ hanya melihat butir yang terkait dokumen yang ditugaskan kepadanya (tanpa pagu).
create policy budget_items_select_ppbj on public.budget_items for select to authenticated
  using (organization_id = app.current_org() and app.has_permission('document.review')
     and exists (select 1 from public.procurement_documents d
                 where d.budget_item_id = budget_items.id and d.assigned_ppbj_id = auth.uid()));
create policy budget_items_insert on public.budget_items for insert to authenticated
  with check (organization_id = app.current_org() and app.has_permission('budget.edit'));
create policy budget_items_update on public.budget_items for update to authenticated
  using (organization_id = app.current_org() and app.has_permission('budget.edit'))
  with check (organization_id = app.current_org() and app.has_permission('budget.edit'));

create policy biv_select on public.budget_item_versions for select to authenticated
  using (organization_id = app.current_org() and app.has_permission('budget.view') and app.can_access_item(budget_item_id));
create policy biv_insert on public.budget_item_versions for insert to authenticated
  with check (organization_id = app.current_org() and app.has_permission('budget.edit'));
create policy biv_update on public.budget_item_versions for update to authenticated
  using (organization_id = app.current_org() and app.has_permission('budget.edit'))
  with check (organization_id = app.current_org() and app.has_permission('budget.edit'));

-- ---------- anggaran kas ----------
create policy cash_plans_select on public.cash_budget_plans for select to authenticated
  using (organization_id = app.current_org() and app.has_permission('cashplan.view') and app.can_access_item(budget_item_id));
create policy cash_plans_insert on public.cash_budget_plans for insert to authenticated
  with check (organization_id = app.current_org() and status = 'draft'
     and app.has_permission('cashplan.edit') and app.is_assigned_pptk(budget_item_id));
create policy cash_plans_update on public.cash_budget_plans for update to authenticated
  using (organization_id = app.current_org() and (
        (app.has_permission('cashplan.edit') and app.is_assigned_pptk(budget_item_id) and status in ('draft','returned'))
     or (app.has_permission('cashplan.finalize') and app.can_access_item(budget_item_id))))
  with check (organization_id = app.current_org() and (
        (app.has_permission('cashplan.edit') and app.is_assigned_pptk(budget_item_id) and status in ('draft','submitted'))
     or (app.has_permission('cashplan.finalize') and app.can_access_item(budget_item_id))));

create policy cash_periods_select on public.cash_budget_periods for select to authenticated
  using (exists (select 1 from public.cash_budget_plans p where p.id = plan_id));
create policy cash_periods_write on public.cash_budget_periods for all to authenticated
  using (exists (select 1 from public.cash_budget_plans p where p.id = plan_id
                 and app.has_permission('cashplan.edit') and app.is_assigned_pptk(p.budget_item_id)
                 and p.status in ('draft','returned')))
  with check (exists (select 1 from public.cash_budget_plans p where p.id = plan_id
                 and app.has_permission('cashplan.edit') and app.is_assigned_pptk(p.budget_item_id)
                 and p.status in ('draft','returned')));

-- ---------- paket & kontrak ----------
create policy packages_select on public.procurement_packages for select to authenticated
  using (organization_id = app.current_org() and app.has_permission('budget.view') and app.can_access_item(budget_item_id));
create policy packages_write on public.procurement_packages for all to authenticated
  using (organization_id = app.current_org() and app.can_access_item(budget_item_id)
     and (app.has_permission('budget.edit') or (app.has_permission('document.create_pptk') and app.is_assigned_pptk(budget_item_id))))
  with check (organization_id = app.current_org() and app.can_access_item(budget_item_id)
     and (app.has_permission('budget.edit') or (app.has_permission('document.create_pptk') and app.is_assigned_pptk(budget_item_id))));

create policy contracts_select on public.procurement_contracts for select to authenticated
  using (organization_id = app.current_org() and app.has_permission('realization.view')
     and exists (select 1 from public.procurement_packages pk where pk.id = package_id));
create policy contracts_write on public.procurement_contracts for all to authenticated
  using (organization_id = app.current_org() and exists (
        select 1 from public.procurement_packages pk where pk.id = package_id
          and (app.has_permission('budget.edit') or (app.has_permission('realization.edit') and app.is_assigned_pptk(pk.budget_item_id)))))
  with check (organization_id = app.current_org() and exists (
        select 1 from public.procurement_packages pk where pk.id = package_id
          and (app.has_permission('budget.edit') or (app.has_permission('realization.edit') and app.is_assigned_pptk(pk.budget_item_id)))));

-- ---------- realisasi ----------
create policy rt_select on public.realization_transactions for select to authenticated
  using (organization_id = app.current_org() and app.has_permission('realization.view') and app.can_access_item(budget_item_id));
create policy rt_insert on public.realization_transactions for insert to authenticated
  with check (organization_id = app.current_org() and created_by = auth.uid() and status = 'draft'
     and app.has_permission('realization.edit') and app.is_assigned_pptk(budget_item_id));
create policy rt_update on public.realization_transactions for update to authenticated
  using (organization_id = app.current_org() and (
        (app.has_permission('realization.edit') and app.is_assigned_pptk(budget_item_id) and status in ('draft','returned'))
     or (app.has_permission('realization.verify') and app.can_access_item(budget_item_id))))
  with check (organization_id = app.current_org() and (
        (app.has_permission('realization.edit') and app.is_assigned_pptk(budget_item_id) and status in ('draft','submitted'))
     or (app.has_permission('realization.verify') and app.can_access_item(budget_item_id))));
-- Tanpa DELETE.

create policy payments_select on public.payment_records for select to authenticated
  using (organization_id = app.current_org() and app.can_access_transaction(transaction_id));
create policy payments_insert on public.payment_records for insert to authenticated
  with check (organization_id = app.current_org() and app.can_edit_transaction(transaction_id));
create policy payments_update on public.payment_records for update to authenticated
  using (organization_id = app.current_org() and app.can_edit_transaction(transaction_id))
  with check (organization_id = app.current_org() and app.can_edit_transaction(transaction_id));

create policy sp2d_select on public.sp2d_records for select to authenticated
  using (organization_id = app.current_org() and exists (
        select 1 from public.payment_records p where p.id = payment_record_id));
create policy sp2d_insert on public.sp2d_records for insert to authenticated
  with check (organization_id = app.current_org() and app.has_permission('realization.verify')
     and exists (select 1 from public.payment_records p where p.id = payment_record_id));
create policy sp2d_update on public.sp2d_records for update to authenticated
  using (organization_id = app.current_org() and app.has_permission('realization.verify')
     and exists (select 1 from public.payment_records p where p.id = payment_record_id))
  with check (organization_id = app.current_org() and app.has_permission('realization.verify'));

create policy attachments_select on public.transaction_attachments for select to authenticated
  using (organization_id = app.current_org() and app.can_access_transaction(transaction_id));
create policy attachments_insert on public.transaction_attachments for insert to authenticated
  with check (organization_id = app.current_org() and uploaded_by = auth.uid()
     and (app.can_edit_transaction(transaction_id)
          or (app.has_permission('realization.verify') and app.can_access_transaction(transaction_id))));
create policy attachments_update on public.transaction_attachments for update to authenticated
  using (organization_id = app.current_org() and app.has_permission('realization.verify') and app.can_access_transaction(transaction_id))
  with check (organization_id = app.current_org() and app.has_permission('realization.verify'));

-- ---------- dokumen pengadaan ----------
create policy templates_select on public.document_templates for select to authenticated
  using (organization_id = app.current_org() and app.has_permission('document.view'));
create policy templates_write on public.document_templates for all to authenticated
  using (organization_id = app.current_org() and app.has_permission('settings.manage'))
  with check (organization_id = app.current_org() and app.has_permission('settings.manage'));

create policy docs_select on public.procurement_documents for select to authenticated
  using (app.can_access_document(id));
create policy docs_insert on public.procurement_documents for insert to authenticated
  with check (organization_id = app.current_org() and created_by = auth.uid() and status = 'draft' and (
        (doc_type in ('nota_dinas_pptk','dpp') and app.has_permission('document.create_pptk') and app.is_assigned_pptk(budget_item_id))
     or (doc_type = 'nota_dinas_ppk' and app.has_permission('document.create_ppk') and app.can_access_item(budget_item_id))
     or (doc_type = 'berita_acara_reviu' and app.has_permission('document.issue_ba'))));
create policy docs_update on public.procurement_documents for update to authenticated
  using (app.can_access_document(id) and (
        (created_by = auth.uid() and status in ('draft','returned_for_correction'))
     or (assigned_ppbj_id = auth.uid() and app.has_permission('document.review')
         and status in ('submitted','resubmitted','under_review','review_completed'))
     or (assigned_ppk_id = auth.uid() and app.has_permission('document.return')
         and status in ('submitted','resubmitted'))))
  with check (organization_id = app.current_org() and (
        (created_by = auth.uid() and status in ('draft','submitted','resubmitted','cancelled'))
     or (assigned_ppbj_id = auth.uid() and app.has_permission('document.review')
         and status in ('under_review','returned_for_correction','review_completed','issued'))
     or (assigned_ppk_id = auth.uid() and app.has_permission('document.return')
         and status in ('returned_for_correction','under_review'))));

create policy revisions_select on public.document_revisions for select to authenticated
  using (app.can_access_document(document_id));
create policy revisions_insert on public.document_revisions for insert to authenticated
  with check (created_by = auth.uid() and app.can_access_document(document_id));

create policy reviews_select on public.document_reviews for select to authenticated
  using (app.can_access_document(document_id));
create policy reviews_insert on public.document_reviews for insert to authenticated
  with check (reviewer_id = auth.uid() and app.has_permission('document.review')
     and exists (select 1 from public.procurement_documents d where d.id = document_id and d.assigned_ppbj_id = auth.uid()));
create policy reviews_update on public.document_reviews for update to authenticated
  using (reviewer_id = auth.uid() and app.has_permission('document.review'))
  with check (reviewer_id = auth.uid() and app.has_permission('document.review'));

create policy findings_select on public.review_findings for select to authenticated
  using (exists (select 1 from public.document_reviews r where r.id = review_id));
create policy findings_write on public.review_findings for all to authenticated
  using (exists (select 1 from public.document_reviews r where r.id = review_id
                 and r.reviewer_id = auth.uid() and app.has_permission('document.review')))
  with check (exists (select 1 from public.document_reviews r where r.id = review_id
                 and r.reviewer_id = auth.uid() and app.has_permission('document.review')));

create policy minutes_select on public.review_minutes for select to authenticated
  using (exists (select 1 from public.document_reviews r where r.id = review_id));
create policy minutes_insert on public.review_minutes for insert to authenticated
  with check (app.has_permission('document.issue_ba') and issued_by = auth.uid()
     and exists (select 1 from public.document_reviews r where r.id = review_id
                 and r.reviewer_id = auth.uid() and r.outcome = 'completed'));

-- ---------- impor ----------
create policy import_batches_all on public.import_batches for all to authenticated
  using (organization_id = app.current_org() and app.has_permission('budget.import'))
  with check (organization_id = app.current_org() and app.has_permission('budget.import') and created_by = auth.uid());
create policy import_rows_all on public.import_rows for all to authenticated
  using (exists (select 1 from public.import_batches b where b.id = batch_id and app.has_permission('budget.import')))
  with check (exists (select 1 from public.import_batches b where b.id = batch_id and app.has_permission('budget.import')));

-- =====================================================================
-- Hak akses tabel/fungsi (lapisan kedua di bawah RLS)
-- =====================================================================
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

revoke all on public.auth_identities, public.auth_attempts from authenticated;

-- Profil: pengguna hanya dapat mengubah nama dan telepon sendiri.
revoke update on public.profiles from authenticated;
grant  update (full_name, phone) on public.profiles to authenticated;
revoke insert, delete on public.profiles from authenticated;

-- Tabel append-only: tidak ada tulis lewat peran authenticated
revoke insert, update, delete, truncate on public.audit_logs, public.workflow_events from authenticated;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'app' loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;

revoke all on function public.list_budget_contexts() from public, anon;
revoke all on function public.resolve_budget_context(int, text) from public, anon;
grant execute on function public.list_budget_contexts() to authenticated;
grant execute on function public.resolve_budget_context(int, text) to authenticated;
