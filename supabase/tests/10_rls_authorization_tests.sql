-- =====================================================================
-- 10_rls_authorization_tests.sql
-- Tes otorisasi, RLS, dan integritas keuangan SIMASPRAJA.
-- Jalankan setelah shim + migrasi. Setiap tes mencetak PASS/FAIL; skrip berhenti
-- dengan galat jika ada yang gagal.
-- =====================================================================
\set ON_ERROR_STOP on
reset role;
drop schema if exists t cascade;
create schema t;

create table t.results (n serial, name text, passed boolean, detail text);

create function t.ok(p_cond boolean, p_name text, p_detail text default null) returns void
language plpgsql as $$ begin insert into t.results(name, passed, detail) values (p_name, coalesce(p_cond,false), p_detail); end $$;

-- Pernyataan SQL harus gagal (galat apa pun)
create function t.throws(p_sql text, p_name text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
    insert into t.results(name, passed, detail) values (p_name, false, 'seharusnya gagal tetapi berhasil');
  exception when others then
    insert into t.results(name, passed, detail) values (p_name, true, sqlerrm);
  end;
end $$;


-- Pernyataan DML ditolak: berupa galat ATAU memengaruhi 0 baris (perilaku RLS pada UPDATE/DELETE)
create function t.denied(p_sql text, p_name text) returns void
language plpgsql as $$
declare n bigint;
begin
  begin
    execute p_sql;
    get diagnostics n = row_count;
    insert into t.results(name, passed, detail) values (p_name, n = 0, case when n = 0 then '0 baris terpengaruh' else n || ' baris berubah' end);
  exception when others then
    insert into t.results(name, passed, detail) values (p_name, true, sqlerrm);
  end;
end $$;

-- Pernyataan SQL harus berhasil
create function t.lives(p_sql text, p_name text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
    insert into t.results(name, passed, detail) values (p_name, true, null);
  exception when others then
    insert into t.results(name, passed, detail) values (p_name, false, sqlerrm);
  end;
end $$;

-- Hitung baris yang terlihat
create function t.cnt(p_sql text) returns bigint language plpgsql as $$
declare c bigint; begin execute 'select count(*) from (' || p_sql || ') q' into c; return c; end $$;

-- Berpindah identitas
create function t.as_user(p_uid uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), false);
  set role authenticated;
end $$;
create function t.as_service() returns void language plpgsql as $$
begin reset role; perform set_config('request.jwt.claim.sub', '', false); set role service_role; end $$;
create function t.as_super() returns void language plpgsql as $$
begin reset role; perform set_config('request.jwt.claim.sub', '', false); end $$;
grant usage on schema t to anon, authenticated, service_role;
grant execute on all functions in schema t to anon, authenticated, service_role;
grant select, insert on t.results to anon, authenticated, service_role;
grant usage on all sequences in schema t to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- SEED (sebagai superuser; auth.uid() NULL sehingga pelindung server lolos)
-- ---------------------------------------------------------------------
select t.as_super();

insert into public.organizations (id, code, name) values
  ('00000000-0000-0000-0000-0000000000a1','OPD-A','OPD A'),
  ('00000000-0000-0000-0000-0000000000b2','OPD-B','OPD B');

-- Pengguna: admin, ppk, pptk1, pptk2, ppbj (OPD A); outsider (OPD B)
insert into auth.users (id, email)
select id, id::text || '@auth.simaspraja.invalid' from (values
  ('11111111-1111-1111-1111-111111111111'::uuid), ('22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333'), ('44444444-4444-4444-4444-444444444444'),
  ('55555555-5555-5555-5555-555555555555'), ('66666666-6666-6666-6666-666666666666')) v(id);

insert into public.profiles (id, organization_id, username, full_name, must_change_password) values
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-0000000000a1','admin','Admin A',false),
  ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-0000000000a1','ppk','PPK A',false),
  ('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-0000000000a1','pptk1','PPTK Satu',false),
  ('44444444-4444-4444-4444-444444444444','00000000-0000-0000-0000-0000000000a1','pptk2','PPTK Dua',false),
  ('55555555-5555-5555-5555-555555555555','00000000-0000-0000-0000-0000000000a1','ppbj','PPBJ A',false),
  ('66666666-6666-6666-6666-666666666666','00000000-0000-0000-0000-0000000000b2','outsider','Admin B',false);

insert into public.auth_identities (profile_id, internal_email)
select id, email from auth.users;

insert into public.user_roles (user_id, role_code) values
  ('11111111-1111-1111-1111-111111111111','admin'),
  ('22222222-2222-2222-2222-222222222222','ppk'),
  ('33333333-3333-3333-3333-333333333333','pptk'),
  ('44444444-4444-4444-4444-444444444444','pptk'),
  ('55555555-5555-5555-5555-555555555555','ppbj'),
  ('66666666-6666-6666-6666-666666666666','admin');

insert into public.user_scopes (user_id, scope_type, scope_id) values
  ('11111111-1111-1111-1111-111111111111','organization',null),
  ('22222222-2222-2222-2222-222222222222','organization',null);

-- Master & anggaran OPD A
insert into public.fiscal_years (id, organization_id, year) values
  ('00000000-0000-0000-0000-00000000f001','00000000-0000-0000-0000-0000000000a1',2026);
insert into public.programs (id, organization_id, code, name) values
  ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-0000000000a1','1.01','Program A');
insert into public.activities (id, organization_id, program_id, code, name) values
  ('00000000-0000-0000-0000-00000000a002','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000a001','1.01.01','Kegiatan A');
insert into public.sub_activities (id, organization_id, activity_id, code, name) values
  ('00000000-0000-0000-0000-00000000a003','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000a002','1.01.01.01','Sub A');
insert into public.expenditure_accounts (id, organization_id, code, name) values
  ('00000000-0000-0000-0000-00000000e001','00000000-0000-0000-0000-0000000000a1','5.1.02.01','Belanja Barang');
insert into public.funding_sources (id, organization_id, code, name) values
  ('00000000-0000-0000-0000-00000000d001','00000000-0000-0000-0000-0000000000a1','PAD','PAD');

insert into public.budget_versions (id, organization_id, fiscal_year_id, stage_code, version_no, status) values
  ('00000000-0000-0000-0000-0000000b0001','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000f001','murni',1,'active');

-- Dua butir: i1 milik pptk1, i2 milik pptk2
insert into public.budget_items (id, organization_id, fiscal_year_id, sub_activity_id, expenditure_account_id, funding_source_id, pptk_id, description) values
  ('00000000-0000-0000-0000-0000000b1001','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000f001','00000000-0000-0000-0000-00000000a003','00000000-0000-0000-0000-00000000e001','00000000-0000-0000-0000-00000000d001','33333333-3333-3333-3333-333333333333','Butir 1'),
  ('00000000-0000-0000-0000-0000000b1002','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000f001','00000000-0000-0000-0000-00000000a003','00000000-0000-0000-0000-00000000e001','00000000-0000-0000-0000-00000000d001','44444444-4444-4444-4444-444444444444','Butir 2');
insert into public.budget_item_versions (id, organization_id, budget_version_id, budget_item_id, pagu) values
  ('00000000-0000-0000-0000-0000000c1001','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000b0001','00000000-0000-0000-0000-0000000b1001',1000000.00),
  ('00000000-0000-0000-0000-0000000c1002','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000b0001','00000000-0000-0000-0000-0000000b1002',500000.00);

-- Dokumen DPP milik pptk1, ditugaskan ke ppbj
insert into public.procurement_documents (id, organization_id, doc_type, budget_item_id, title, status, created_by, assigned_ppk_id, assigned_ppbj_id) values
  ('00000000-0000-0000-0000-0000000d0001','00000000-0000-0000-0000-0000000000a1','dpp','00000000-0000-0000-0000-0000000b1001','DPP Butir 1','submitted','33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','55555555-5555-5555-5555-555555555555'),
  ('00000000-0000-0000-0000-0000000d0002','00000000-0000-0000-0000-0000000000a1','dpp','00000000-0000-0000-0000-0000000b1002','DPP Butir 2','submitted','44444444-4444-4444-4444-444444444444','22222222-2222-2222-2222-222222222222',null);

-- =====================================================================
-- 1. Isolasi anon & tabel rahasia
-- =====================================================================
reset role; set role anon;
select t.throws('select * from public.profiles', 'anon tidak dapat membaca profiles');
select t.throws('select * from public.budget_items', 'anon tidak dapat membaca budget_items');
select t.as_super();

select t.as_user('33333333-3333-3333-3333-333333333333');
select t.throws('select * from public.auth_identities', 'authenticated tidak dapat membaca auth_identities (email internal tersembunyi)');
select t.throws('select * from public.auth_attempts', 'authenticated tidak dapat membaca auth_attempts');
select t.throws($$insert into public.auth_attempts(username_hash, ip_hash, succeeded) values ('x','y',true)$$, 'authenticated tidak dapat menulis auth_attempts');

-- Service role (server) dapat menyelesaikan username -> identitas
select t.as_service();
select t.ok((select internal_email is not null from public.auth_identities ai
             join public.profiles p on p.id = ai.profile_id where p.username = 'pptk1'),
            'service role dapat menyelesaikan username ke identitas internal');
select t.as_super();

-- =====================================================================
-- 2. Isolasi organisasi
-- =====================================================================
select t.as_user('66666666-6666-6666-6666-666666666666');  -- admin OPD B
select t.ok(t.cnt('select 1 from public.budget_items') = 0, 'admin OPD lain tidak melihat butir anggaran OPD A');
select t.ok(t.cnt('select 1 from public.profiles where organization_id = ''00000000-0000-0000-0000-0000000000a1''') = 0, 'admin OPD lain tidak melihat profil OPD A');
select t.ok(t.cnt('select 1 from public.procurement_documents') = 0, 'admin OPD lain tidak melihat dokumen OPD A');
select t.as_super();

-- =====================================================================
-- 3. PPTK hanya pada butir yang ditugaskan
-- =====================================================================
select t.as_user('33333333-3333-3333-3333-333333333333');  -- pptk1
select t.ok(t.cnt('select 1 from public.budget_items') = 1, 'PPTK1 hanya melihat 1 butir (yang ditugaskan)');
select t.ok(t.cnt('select 1 from public.budget_items where id = ''00000000-0000-0000-0000-0000000b1002''') = 0, 'PPTK1 tidak melihat butir PPTK2');
select t.denied($$update public.budget_item_versions set pagu = 9999999 where budget_item_id = '00000000-0000-0000-0000-0000000b1001'$$, 'PPTK tidak dapat mengubah pagu');
-- UPDATE tanpa kebijakan lolos hanya 0 baris; pastikan nilai tidak berubah
select t.as_super();
select t.ok((select pagu from public.budget_item_versions where id = '00000000-0000-0000-0000-0000000c1001') = 1000000.00, 'pagu tidak berubah setelah upaya PPTK');

select t.as_user('33333333-3333-3333-3333-333333333333');
select t.lives($$insert into public.realization_transactions (id, organization_id, budget_version_id, budget_item_id, transaction_date, description, created_by)
  values ('00000000-0000-0000-0000-00000000aa01','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000b0001','00000000-0000-0000-0000-0000000b1001','2026-03-10','Belanja ATK','33333333-3333-3333-3333-333333333333')$$,
  'PPTK dapat membuat transaksi pada butir miliknya');
select t.throws($$insert into public.realization_transactions (organization_id, budget_version_id, budget_item_id, transaction_date, description, created_by)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000b0001','00000000-0000-0000-0000-0000000b1002','2026-03-10','Butir orang lain','33333333-3333-3333-3333-333333333333')$$,
  'PPTK tidak dapat membuat transaksi pada butir PPTK lain');
select t.throws($$insert into public.realization_transactions (organization_id, budget_version_id, budget_item_id, transaction_date, description, created_by, status)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000b0001','00000000-0000-0000-0000-0000000b1001','2026-03-10','Langsung final','33333333-3333-3333-3333-333333333333','realisasi')$$,
  'PPTK tidak dapat menyisipkan transaksi langsung berstatus realisasi');
select t.as_super();

-- =====================================================================
-- 4. PPBJ: tinjau dokumen yang ditugaskan, tidak mengubah anggaran
-- =====================================================================
select t.as_user('55555555-5555-5555-5555-555555555555');
select t.ok(t.cnt('select 1 from public.procurement_documents') = 1, 'PPBJ hanya melihat dokumen yang ditugaskan');
select t.ok(t.cnt('select 1 from public.budget_item_versions') = 0, 'PPBJ tidak melihat pagu (budget_item_versions)');
select t.ok(t.cnt('select 1 from public.realization_transactions') = 0, 'PPBJ tidak melihat transaksi realisasi');
select t.as_super();
select t.as_user('55555555-5555-5555-5555-555555555555');
select t.throws($$insert into public.budget_items (organization_id, fiscal_year_id, sub_activity_id, expenditure_account_id, funding_source_id, description)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000f001','00000000-0000-0000-0000-00000000a003','00000000-0000-0000-0000-00000000e001','00000000-0000-0000-0000-00000000d001','Coba tambah')$$,
  'PPBJ tidak dapat membuat butir anggaran');
select t.lives($$update public.procurement_documents set status = 'under_review' where id = '00000000-0000-0000-0000-0000000d0001'$$, 'PPBJ dapat memulai reviu dokumen yang ditugaskan');
select t.as_super();
select t.ok((select status from public.procurement_documents where id = '00000000-0000-0000-0000-0000000d0001') = 'under_review', 'status dokumen berubah menjadi under_review');
select t.as_user('55555555-5555-5555-5555-555555555555');
select t.lives($$update public.procurement_documents set status = 'under_review' where id = '00000000-0000-0000-0000-0000000d0002'$$, 'UPDATE dokumen tidak ditugaskan tidak menghasilkan galat (0 baris)');
select t.as_super();
select t.ok((select status from public.procurement_documents where id = '00000000-0000-0000-0000-0000000d0002') = 'submitted', 'dokumen yang tidak ditugaskan ke PPBJ tidak berubah');

-- PPBJ tidak dapat memindahkan dokumen ke status di luar kewenangannya
select t.as_user('55555555-5555-5555-5555-555555555555');
select t.throws($$update public.procurement_documents set status = 'archived' where id = '00000000-0000-0000-0000-0000000d0001'$$, 'PPBJ tidak dapat mengarsipkan dokumen (WITH CHECK)');
select t.as_super();

-- PPK dalam scope dapat melihat dokumen, PPTK lain tidak
select t.as_user('22222222-2222-2222-2222-222222222222');
select t.ok(t.cnt('select 1 from public.procurement_documents') = 2, 'PPK (scope organisasi) melihat dokumen dalam scope');
select t.as_user('44444444-4444-4444-4444-444444444444');
select t.ok(t.cnt('select 1 from public.procurement_documents') = 1, 'PPTK2 hanya melihat dokumen miliknya');
select t.as_super();

-- =====================================================================
-- 5. Eskalasi peran & manajemen pengguna
-- =====================================================================
select t.as_user('33333333-3333-3333-3333-333333333333');
select t.throws($$insert into public.user_roles (user_id, role_code) values ('33333333-3333-3333-3333-333333333333','admin')$$, 'PPTK tidak dapat menaikkan diri menjadi admin');
select t.throws($$update public.profiles set organization_id = '00000000-0000-0000-0000-0000000000b2' where id = '33333333-3333-3333-3333-333333333333'$$, 'pengguna tidak dapat mengubah organization_id sendiri');
select t.throws($$update public.profiles set status = 'active', username = 'hacker' where id = '33333333-3333-3333-3333-333333333333'$$, 'pengguna tidak dapat mengubah username/status sendiri (hak kolom)');
select t.lives($$update public.profiles set phone = '0812' where id = '33333333-3333-3333-3333-333333333333'$$, 'pengguna dapat mengubah telepon sendiri');
select t.as_user('11111111-1111-1111-1111-111111111111');
select t.throws($$insert into public.user_roles (user_id, role_code) values ('11111111-1111-1111-1111-111111111111','ppk')$$, 'Admin tidak dapat mengubah peran miliknya sendiri');
select t.lives($$insert into public.user_roles (user_id, role_code) values ('44444444-4444-4444-4444-444444444444','ppk')$$, 'Admin dapat menetapkan peran pengguna lain di organisasinya');
select t.throws($$insert into public.user_roles (user_id, role_code) values ('66666666-6666-6666-6666-666666666666','ppk')$$, 'Admin tidak dapat mengubah peran pengguna OPD lain');
select t.as_super();

-- =====================================================================
-- 6. Audit append-only
-- =====================================================================
select t.as_user('11111111-1111-1111-1111-111111111111');
select t.ok(t.cnt('select 1 from public.audit_logs') > 0, 'Admin dapat membaca log audit');
select t.throws('delete from public.audit_logs', 'Admin tidak dapat menghapus log audit');
select t.throws($$update public.audit_logs set action = 'X'$$, 'Admin tidak dapat mengubah log audit');
select t.as_user('33333333-3333-3333-3333-333333333333');
select t.ok(t.cnt('select 1 from public.audit_logs') = 0, 'PPTK tidak dapat membaca log audit');
select t.as_service();
select t.throws('delete from public.audit_logs', 'bahkan service role tidak dapat menghapus log audit (trigger)');
select t.throws('truncate public.audit_logs', 'TRUNCATE log audit diblokir');
select t.as_super();
select t.throws('delete from public.workflow_events', 'workflow_events append-only');

-- =====================================================================
-- 7. Kontrak bukan realisasi; SP2D menentukan realisasi sah
-- =====================================================================
select t.as_super();
insert into public.procurement_packages (id, organization_id, budget_item_id, package_name)
values ('00000000-0000-0000-0000-0000000e1001','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000b1001','Paket ATK');
insert into public.procurement_contracts (id, organization_id, package_id, contract_number, contract_date, contract_value)
values ('00000000-0000-0000-0000-0000000f1001','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000e1001','K-001','2026-03-01',800000.00);

select t.ok((select eligible_realization from public.v_budget_balance where budget_item_id = '00000000-0000-0000-0000-0000000b1001') = 0, 'kontrak saja tidak menambah realisasi sah');
select t.ok((select contract_commitment from public.v_budget_balance where budget_item_id = '00000000-0000-0000-0000-0000000b1001') = 800000.00, 'kontrak tercatat sebagai komitmen terpisah');
select t.ok((select sisa_anggaran from public.v_budget_balance where budget_item_id = '00000000-0000-0000-0000-0000000b1001') = 1000000.00, 'sisa anggaran tidak berkurang oleh kontrak');

-- Pembayaran tanpa SP2D -> menunggu SP2D, bukan realisasi
select t.as_user('33333333-3333-3333-3333-333333333333');
select t.lives($$insert into public.payment_records (id, organization_id, transaction_id, amount) values
  ('00000000-0000-0000-0000-0000000a2001','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000aa01',300000.00)$$, 'PPTK dapat mencatat pembayaran pada transaksi draf miliknya');
select t.as_super();
select t.ok((select pending_sp2d from public.v_budget_balance where budget_item_id = '00000000-0000-0000-0000-0000000b1001') = 300000.00, 'pembayaran tanpa SP2D tampil sebagai Menunggu SP2D');
select t.ok((select eligible_realization from public.v_budget_balance where budget_item_id = '00000000-0000-0000-0000-0000000b1001') = 0, 'pembayaran tanpa SP2D tidak masuk realisasi sah');

-- Status realisasi tanpa SP2D bertanggal ditolak
select t.throws($$update public.realization_transactions set status = 'realisasi' where id = '00000000-0000-0000-0000-00000000aa01'$$, 'status realisasi ditolak tanpa SP2D');
-- SP2D tanpa tanggal tetap ditolak
insert into public.sp2d_records (id, organization_id, fiscal_year_id, payment_record_id, sp2d_number, sp2d_date)
values ('00000000-0000-0000-0000-0000000a3001','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000f001','00000000-0000-0000-0000-0000000a2001','SP2D/001/2026',null);
select t.throws($$update public.realization_transactions set status = 'realisasi' where id = '00000000-0000-0000-0000-00000000aa01'$$, 'status realisasi ditolak bila tanggal SP2D kosong');

-- PPTK tidak dapat memverifikasi SP2D
select t.as_user('33333333-3333-3333-3333-333333333333');
select t.denied($$update public.sp2d_records set sp2d_date = '2026-03-20' where id = '00000000-0000-0000-0000-0000000a3001'$$, 'PPTK tidak berwenang mengisi tanggal SP2D (kecuali melalui kebijakan verify)');
select t.as_super();
select t.ok((select sp2d_date is null from public.sp2d_records where id = '00000000-0000-0000-0000-0000000a3001'), 'tanggal SP2D tetap kosong setelah upaya PPTK');

-- Admin (realization.verify) mengisi tanggal SP2D dan memfinalkan
select t.as_user('11111111-1111-1111-1111-111111111111');
select t.lives($$update public.sp2d_records set sp2d_date = '2026-03-20' where id = '00000000-0000-0000-0000-0000000a3001'$$, 'pemegang realization.verify dapat mengisi tanggal SP2D');
select t.lives($$update public.realization_transactions set status = 'realisasi' where id = '00000000-0000-0000-0000-00000000aa01'$$, 'transisi ke realisasi berhasil setelah SP2D bertanggal');
select t.as_super();
select t.ok((select eligible_realization from public.v_budget_balance where budget_item_id = '00000000-0000-0000-0000-0000000b1001') = 300000.00, 'realisasi sah = 300.000 setelah SP2D bertanggal');
select t.ok((select pending_sp2d from public.v_budget_balance where budget_item_id = '00000000-0000-0000-0000-0000000b1001') = 0, 'menunggu SP2D menjadi 0');
select t.ok((select sisa_anggaran from public.v_budget_balance where budget_item_id = '00000000-0000-0000-0000-0000000b1001') = 700000.00, 'sisa anggaran = pagu - realisasi sah');
select t.ok((select pct_realization from public.v_budget_balance where budget_item_id = '00000000-0000-0000-0000-0000000b1001') = 30.00, 'persentase realisasi 30%');

-- Dashboard rekonsiliasi dengan transaksi
select t.ok((select sum(amount) from public.v_eligible_realization) = (select sum(eligible_realization) from public.v_budget_balance), 'total view rekonsiliasi sama dengan ledger transaksi');

-- Nomor SP2D ganda ditolak
insert into public.realization_transactions (id, organization_id, budget_version_id, budget_item_id, transaction_date, description, created_by)
values ('00000000-0000-0000-0000-00000000aa02','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000b0001','00000000-0000-0000-0000-0000000b1002','2026-04-01','Transaksi 2','44444444-4444-4444-4444-444444444444');
insert into public.payment_records (id, organization_id, transaction_id, amount)
values ('00000000-0000-0000-0000-0000000a2002','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000aa02',100000.00);
select t.throws($$insert into public.sp2d_records (organization_id, fiscal_year_id, payment_record_id, sp2d_number, sp2d_date)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000f001','00000000-0000-0000-0000-0000000a2002','SP2D/001/2026','2026-04-02')$$, 'nomor SP2D ganda dalam satu tahun ditolak');

-- =====================================================================
-- 8. Batas pagu & konkurensi
-- =====================================================================
select t.throws($$insert into public.payment_records (organization_id, transaction_id, amount)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000aa02',500000.00)$$, 'pembayaran melebihi pagu ditolak (100rb + 500rb > 500rb)');
select t.lives($$insert into public.payment_records (organization_id, transaction_id, amount)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000aa02',400000.00)$$, 'pembayaran tepat sampai batas pagu diterima');
select t.throws($$insert into public.payment_records (organization_id, transaction_id, amount)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000aa02',0.01)$$, 'satu sen melebihi pagu ditolak');

-- =====================================================================
-- 9. Koreksi, pembatalan, dan riwayat
-- =====================================================================
select t.throws('delete from public.realization_transactions where id = ''00000000-0000-0000-0000-00000000aa01''', 'transaksi tidak dapat dihapus');
select t.throws('delete from public.payment_records where id = ''00000000-0000-0000-0000-0000000a2001''', 'pembayaran tidak dapat dihapus');
select t.throws('delete from public.sp2d_records where id = ''00000000-0000-0000-0000-0000000a3001''', 'SP2D tidak dapat dihapus');
select t.throws($$update public.sp2d_records set sp2d_date = null where id = '00000000-0000-0000-0000-0000000a3001'$$, 'tanggal SP2D transaksi final tidak dapat dihapus tanpa alasan');
select t.throws($$update public.realization_transactions set description = 'diubah diam-diam' where id = '00000000-0000-0000-0000-00000000aa01'$$, 'transaksi final tidak dapat diubah tanpa alasan koreksi');

-- Koreksi sah: alasan tercatat -> SP2D di-void, transaksi dibatalkan, riwayat tersimpan
do $$ begin
  perform set_config('app.correction_reason', 'SP2D salah input, dibatalkan oleh admin', false);
  update public.sp2d_records set voided_at = now(), void_reason = 'SP2D salah input' where id = '00000000-0000-0000-0000-0000000a3001';
  update public.realization_transactions set status = 'cancelled', cancel_reason = 'Salah input' where id = '00000000-0000-0000-0000-00000000aa01';
  perform set_config('app.correction_reason', '', false);
end $$;
select t.ok((select status from public.realization_transactions where id = '00000000-0000-0000-0000-00000000aa01') = 'cancelled', 'koreksi dengan alasan berhasil membatalkan transaksi');
select t.ok((select count(*) from public.workflow_events where entity_id = '00000000-0000-0000-0000-00000000aa01') >= 3, 'riwayat transisi status tersimpan (>= 3 peristiwa)');
select t.ok((select count(*) from public.workflow_events where entity_id = '00000000-0000-0000-0000-00000000aa01' and reason is not null and to_status = 'cancelled') = 1, 'alasan pembatalan tercatat pada riwayat');
select t.ok((select eligible_realization from public.v_budget_balance where budget_item_id = '00000000-0000-0000-0000-0000000b1001') = 0, 'realisasi sah dihitung ulang setelah pembatalan');
select t.ok((select count(*) from public.audit_logs where table_name = 'realization_transactions' and record_id = '00000000-0000-0000-0000-00000000aa01' and action = 'UPDATE') >= 2, 'audit log mencatat perubahan transaksi (old/new)');
select t.throws($$update public.realization_transactions set status = 'cancelled', cancel_reason = '  ' where id = '00000000-0000-0000-0000-00000000aa02'$$, 'pembatalan tanpa alasan ditolak');

-- =====================================================================
-- 10. Versi anggaran final tidak dapat diubah
-- =====================================================================
select t.as_user('33333333-3333-3333-3333-333333333333');
select t.denied($$update public.budget_versions set status = 'final' where id = '00000000-0000-0000-0000-0000000b0001'$$, 'PPTK tidak dapat memfinalkan versi anggaran');
select t.as_super();
update public.budget_versions set status = 'final' where id = '00000000-0000-0000-0000-0000000b0001';
select t.ok((select finalized_at is not null from public.budget_versions where id = '00000000-0000-0000-0000-0000000b0001'), 'finalisasi mencatat waktu');
select t.throws($$update public.budget_item_versions set pagu = 1 where id = '00000000-0000-0000-0000-0000000c1001'$$, 'snapshot pagu pada versi final tidak dapat diubah');
select t.throws($$update public.budget_versions set status = 'draft' where id = '00000000-0000-0000-0000-0000000b0001'$$, 'versi final tidak dapat dibuka kembali');
select t.throws($$delete from public.budget_versions where id = '00000000-0000-0000-0000-0000000b0001'$$, 'versi final tidak dapat dihapus');

-- =====================================================================
-- 11. Konteks anggaran (tahun + tahapan)
-- =====================================================================
select t.as_user('33333333-3333-3333-3333-333333333333');
select t.ok(t.cnt('select 1 from public.list_budget_contexts()') = 1, 'PPTK melihat konteks 2026/murni yang tersedia');
select t.ok(public.resolve_budget_context(2026, 'murni') = '00000000-0000-0000-0000-0000000b0001', 'konteks sah menghasilkan versi anggaran yang benar');
select t.throws($$select public.resolve_budget_context(2026, 'perubahan')$$, 'konteks tahapan yang belum ada ditolak');
select t.throws($$select public.resolve_budget_context(2031, 'murni')$$, 'konteks tahun yang tidak ada ditolak');
select t.as_user('66666666-6666-6666-6666-666666666666');
select t.throws($$select public.resolve_budget_context(2026, 'murni')$$, 'pengguna OPD lain tidak dapat memakai konteks OPD A');
select t.as_super();
select t.as_user('55555555-5555-5555-5555-555555555555');
select t.ok(t.cnt('select 1 from public.list_budget_contexts()') = 1, 'PPBJ dapat memilih konteks aktif');
select t.as_super();

-- Pengguna nonaktif kehilangan seluruh akses
update public.profiles set status = 'suspended' where id = '33333333-3333-3333-3333-333333333333';
select t.as_user('33333333-3333-3333-3333-333333333333');
select t.ok(t.cnt('select 1 from public.budget_items') = 0, 'pengguna suspended tidak melihat data apa pun');
select t.as_super();
update public.profiles set status = 'active' where id = '33333333-3333-3333-3333-333333333333';

-- =====================================================================
-- 12. Master data: tidak ada DELETE, duplikasi dicegah
-- =====================================================================
select t.as_user('11111111-1111-1111-1111-111111111111');
select t.lives($$update public.programs set is_active = false where id = '00000000-0000-0000-0000-00000000a001'$$, 'master dinonaktifkan (soft deactivate)');
select t.as_super();
select t.ok((select is_active from public.programs where id = '00000000-0000-0000-0000-00000000a001') = false, 'master berstatus nonaktif tetap ada');
select t.as_user('11111111-1111-1111-1111-111111111111');
select t.lives($$delete from public.programs where id = '00000000-0000-0000-0000-00000000a001'$$, 'DELETE master tanpa kebijakan tidak menghapus baris');
select t.as_super();
select t.ok(exists(select 1 from public.programs where id = '00000000-0000-0000-0000-00000000a001'), 'master tidak terhapus (tidak ada kebijakan DELETE)');
select t.throws($$insert into public.budget_items (organization_id, fiscal_year_id, sub_activity_id, expenditure_account_id, funding_source_id, pptk_id, description)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000f001','00000000-0000-0000-0000-00000000a003','00000000-0000-0000-0000-00000000e001','00000000-0000-0000-0000-00000000d001',null,'Butir 1')$$, 'butir anggaran duplikat ditolak (kunci komposit)');

-- =====================================================================
-- 13. Anggaran kas: hanya PPTK yang ditugaskan
-- =====================================================================
select t.as_user('44444444-4444-4444-4444-444444444444');
select t.throws($$insert into public.cash_budget_plans (organization_id, budget_version_id, budget_item_id)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000b0001','00000000-0000-0000-0000-0000000b1001')$$, 'PPTK tidak dapat menyusun anggaran kas butir PPTK lain');
select t.lives($$insert into public.cash_budget_plans (id, organization_id, budget_version_id, budget_item_id)
  values ('00000000-0000-0000-0000-0000000ca001','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000b0001','00000000-0000-0000-0000-0000000b1002')$$, 'PPTK dapat menyusun anggaran kas butir miliknya');
select t.lives($$insert into public.cash_budget_periods (plan_id, period_type, period_no, amount)
  values ('00000000-0000-0000-0000-0000000ca001','quarter',1,100000)$$, 'PPTK dapat mengisi periode triwulan');
select t.throws($$insert into public.cash_budget_periods (plan_id, period_type, period_no, amount)
  values ('00000000-0000-0000-0000-0000000ca001','quarter',5,100000)$$, 'triwulan di luar 1-4 ditolak');
select t.as_super();

-- =====================================================================
-- 14. KPI dasbor: rekonsiliasi dengan ledger dan keterbatasan per peran
-- =====================================================================
select t.as_super();
-- Realisasi sah 250.000 pada butir 1 (pembayaran + SP2D bertanggal -> status realisasi)
insert into public.realization_transactions (id, organization_id, budget_version_id, budget_item_id, transaction_date, description, created_by)
values ('00000000-0000-0000-0000-00000000aa03','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000b0001','00000000-0000-0000-0000-0000000b1001','2026-05-05','Transaksi sah','33333333-3333-3333-3333-333333333333');
insert into public.payment_records (id, organization_id, transaction_id, amount)
values ('00000000-0000-0000-0000-0000000a2003','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000aa03',250000.00);
insert into public.sp2d_records (organization_id, fiscal_year_id, payment_record_id, sp2d_number, sp2d_date)
values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000f001','00000000-0000-0000-0000-0000000a2003','SP2D/777/2026','2026-05-06');
update public.realization_transactions set status = 'realisasi' where id = '00000000-0000-0000-0000-00000000aa03';

select t.as_user('11111111-1111-1111-1111-111111111111');
select t.ok((select total_pagu from public.dashboard_kpis('00000000-0000-0000-0000-0000000b0001')) = 1500000.00, 'KPI admin: total pagu = 1.500.000');
select t.ok((select total_realisasi from public.dashboard_kpis('00000000-0000-0000-0000-0000000b0001')) = 250000.00, 'KPI admin: realisasi hanya yang ber-SP2D bertanggal (250.000)');
select t.ok((select sisa_anggaran from public.dashboard_kpis('00000000-0000-0000-0000-0000000b0001')) = 1250000.00, 'KPI admin: sisa = pagu - realisasi sah');
select t.ok((select pct_realisasi from public.dashboard_kpis('00000000-0000-0000-0000-0000000b0001')) = 16.67, 'KPI admin: persentase realisasi 16,67%');
select t.ok((select jumlah_butir_aktif from public.dashboard_kpis('00000000-0000-0000-0000-0000000b0001')) = 2, 'KPI admin: 2 butir anggaran');
select t.ok((select jumlah_menunggu_sp2d from public.dashboard_kpis('00000000-0000-0000-0000-0000000b0001')) = 1, 'KPI admin: 1 transaksi menunggu SP2D (yang dibatalkan tidak dihitung)');
select t.ok((select total_menunggu_sp2d from public.dashboard_kpis('00000000-0000-0000-0000-0000000b0001')) = 500000.00, 'KPI admin: nilai menunggu SP2D 500.000');
select t.ok((select total_komitmen from public.dashboard_kpis('00000000-0000-0000-0000-0000000b0001')) = 800000.00, 'KPI admin: komitmen kontrak 800.000 terpisah dari realisasi');
select t.ok((select jumlah_dokumen_reviu from public.dashboard_kpis('00000000-0000-0000-0000-0000000b0001')) = 2, 'KPI admin: 2 dokumen menunggu/dalam reviu');
select t.ok((select total_realisasi from public.dashboard_kpis('00000000-0000-0000-0000-0000000b0001'))
          = (select coalesce(sum(amount),0) from public.v_eligible_realization where budget_version_id = '00000000-0000-0000-0000-0000000b0001'),
            'rekonsiliasi: KPI realisasi = jumlah ledger v_eligible_realization');
select t.ok((select total_pagu from public.dashboard_kpis('00000000-0000-0000-0000-0000000b0001'))
          = (select sum(pagu) from public.budget_item_versions where budget_version_id = '00000000-0000-0000-0000-0000000b0001'),
            'rekonsiliasi: KPI pagu = jumlah snapshot pagu versi');

select t.as_user('33333333-3333-3333-3333-333333333333');   -- PPTK1: hanya butir 1
select t.ok((select total_pagu from public.dashboard_kpis('00000000-0000-0000-0000-0000000b0001')) = 1000000.00, 'KPI PPTK1 hanya mencakup butir miliknya (pagu 1.000.000)');
select t.ok((select total_realisasi from public.dashboard_kpis('00000000-0000-0000-0000-0000000b0001')) = 250000.00, 'KPI PPTK1: realisasi 250.000');
select t.ok((select jumlah_menunggu_sp2d from public.dashboard_kpis('00000000-0000-0000-0000-0000000b0001')) = 0, 'KPI PPTK1 tidak menghitung transaksi PPTK lain');

select t.as_user('55555555-5555-5555-5555-555555555555');   -- PPBJ: tanpa data keuangan
select t.ok((select total_pagu from public.dashboard_kpis('00000000-0000-0000-0000-0000000b0001')) = 0, 'KPI PPBJ: tanpa akses pagu');
select t.ok((select pct_realisasi is null from public.dashboard_kpis('00000000-0000-0000-0000-0000000b0001')), 'KPI PPBJ: pagu 0 -> persentase NULL (bukan 0%)');
select t.ok((select jumlah_dokumen_reviu from public.dashboard_kpis('00000000-0000-0000-0000-0000000b0001')) = 1, 'KPI PPBJ: hanya dokumen yang ditugaskan');

select t.as_user('66666666-6666-6666-6666-666666666666');   -- OPD lain
select t.ok((select total_pagu = 0 and jumlah_butir_aktif = 0 and jumlah_dokumen_reviu = 0 from public.dashboard_kpis('00000000-0000-0000-0000-0000000b0001')), 'KPI OPD lain: tidak melihat data OPD A sama sekali');

select t.as_super();

-- =====================================================================
-- RINGKASAN
-- =====================================================================
reset role;
select case when passed then 'PASS' else 'FAIL' end as hasil, name, case when passed then '' else coalesce(detail,'') end as detail
from t.results order by n;
select count(*) filter (where passed) as lulus, count(*) filter (where not passed) as gagal, count(*) as total from t.results;
do $$ begin
  if exists (select 1 from t.results where not passed) then
    raise exception 'Ada tes yang gagal';
  end if;
end $$;
