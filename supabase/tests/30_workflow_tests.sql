-- =====================================================================
-- 30_workflow_tests.sql
-- Tes fungsi alur kerja (migrasi 0006): anggaran, anggaran kas, realisasi, dokumen.
-- Dijalankan SETELAH 10_rls_authorization_tests.sql pada database yang sama (memakai pengguna & master seed-nya).
-- Pengguna: admin 1111, ppk 2222, pptk1 3333, pptk2 4444, ppbj 5555, outsider (OPD B) 6666.
-- =====================================================================
\set ON_ERROR_STOP on
reset role;
delete from t.results;

create table t.ids (k text primary key, v uuid);
grant all on t.ids to public;
create function t.id(p_k text) returns uuid language sql stable as $$ select v from t.ids where k = p_k $$;
grant execute on function t.id(text) to public;
create function t.status_of(p_sql text) returns text language plpgsql as $$ declare s text; begin execute p_sql into s; return s; end $$;
grant execute on function t.status_of(text) to public;

\set admin  '11111111-1111-1111-1111-111111111111'
\set ppk    '22222222-2222-2222-2222-222222222222'
\set pptk1  '33333333-3333-3333-3333-333333333333'
\set pptk2  '44444444-4444-4444-4444-444444444444'
\set ppbj   '55555555-5555-5555-5555-555555555555'
\set outsider '66666666-6666-6666-6666-666666666666'
\set sub  '00000000-0000-0000-0000-00000000a003'
\set acct '00000000-0000-0000-0000-00000000e001'
\set fund '00000000-0000-0000-0000-00000000d001'

-- =====================================================================
-- A. Versi & butir anggaran
-- =====================================================================
select t.as_user(:'admin');
select t.lives($q$insert into t.ids select 'v1', public.create_budget_version(2027, 'murni', 'uji')$q$, 'admin membuat versi anggaran 2027/murni');
select t.ok(t.status_of($q$select status from public.budget_versions where id = t.id('v1')$q$) = 'draft', 'versi baru berstatus draft');
select t.ok((select count(*) from public.fiscal_years where year = 2027) = 1, 'tahun anggaran 2027 dibuat otomatis');
select t.throws($q$select public.create_budget_version(2027, 'tidak-ada')$q$, 'tahapan tidak valid ditolak');
select t.throws($q$select public.create_budget_version(1800, 'murni')$q$, 'tahun tidak valid ditolak');

select t.lives(format($q$insert into t.ids select 'i1', public.add_budget_item(t.id('v1'), %L, %L, %L, %L, 'Belanja ATK', 1000000)$q$, :'sub', :'acct', :'fund', :'pptk1'), 'admin menambah butir anggaran + pagu');
select t.throws(format($q$select public.add_budget_item(t.id('v1'), %L, %L, %L, %L, 'Belanja ATK', 5)$q$, :'sub', :'acct', :'fund', :'pptk1'), 'butir identik pada versi sama ditolak');
select t.throws(format($q$select public.add_budget_item(t.id('v1'), %L, %L, %L, %L, 'Lain', 5)$q$, :'sub', :'acct', :'fund', :'ppbj'), 'PPTK harus berperan pptk (PPBJ ditolak)');
select t.throws(format($q$select public.add_budget_item(t.id('v1'), %L, %L, %L, null, 'Negatif', -1)$q$, :'sub', :'acct', :'fund'), 'pagu negatif ditolak');
select t.lives($q$select public.update_item_pagu(t.id('v1'), t.id('i1'), 1500000, 'naik')$q$, 'admin mengubah pagu');
select t.ok((select pagu from public.budget_item_versions where budget_version_id = t.id('v1') and budget_item_id = t.id('i1')) = 1500000, 'pagu berubah menjadi 1.500.000');
select t.throws($q$select public.update_item_pagu(t.id('v1'), t.id('i1'), -5)$q$, 'ubah pagu negatif ditolak');

select t.as_user(:'pptk1');
select t.throws($q$select public.create_budget_version(2030, 'murni')$q$, 'PPTK tidak dapat membuat versi anggaran');
select t.throws($q$select public.update_item_pagu(t.id('v1'), t.id('i1'), 9)$q$, 'PPTK tidak dapat mengubah pagu');
select t.as_user(:'admin');

select t.throws($q$select public.set_budget_version_status(t.id('v1'), 'final')$q$, 'draft tidak boleh langsung final');
select t.lives($q$select public.set_budget_version_status(t.id('v1'), 'active')$q$, 'draft -> active');
select t.ok((select count(*) from public.list_budget_contexts() where fiscal_year = 2027 and stage_code = 'murni') = 1, 'konteks 2027/murni muncul setelah aktif');

-- Salin ke Pergeseran
select t.lives($q$insert into t.ids select 'v2', public.create_budget_version(2027, 'pergeseran', 'salin murni', t.id('v1'))$q$, 'versi pergeseran dengan salinan dari murni');
select t.ok((select count(*) from public.budget_item_versions where budget_version_id = t.id('v2')) = 1, 'butir tersalin ke versi baru');
select t.ok((select pagu from public.budget_item_versions where budget_version_id = t.id('v2')) = 1500000, 'pagu tersalin');
select t.throws(format($q$select public.add_budget_item(t.id('v2'), %L, %L, %L, %L, 'Belanja ATK', 7)$q$, :'sub', :'acct', :'fund', :'pptk1'), 'butir hasil salinan tidak dapat ditambahkan ulang');
select t.lives(format($q$select public.add_budget_item(t.id('v2'), %L, %L, %L, %L, 'Butir baru pergeseran', 250000)$q$, :'sub', :'acct', :'fund', :'pptk2'), 'butir baru pada pergeseran');

-- Finalisasi: setelah final tidak bisa diubah
select t.lives($q$select public.set_budget_version_status(t.id('v1'), 'final')$q$, 'active -> final oleh admin');
select t.throws($q$select public.update_item_pagu(t.id('v1'), t.id('i1'), 1)$q$, 'pagu versi final tidak dapat diubah');
select t.throws(format($q$select public.add_budget_item(t.id('v1'), %L, %L, %L, null, 'Tambahan', 1)$q$, :'sub', :'acct', :'fund'), 'butir baru pada versi final ditolak');
select t.throws($q$select public.set_budget_version_status(t.id('v1'), 'active')$q$, 'final tidak dapat dibuka kembali');

select t.as_user(:'outsider');
select t.throws($q$select public.create_budget_version(2027, 'perubahan', null, t.id('v1'))$q$, 'admin OPD lain tidak dapat menyalin versi OPD A');
select t.as_super();

-- =====================================================================
-- Data kerja tahun 2028 (aktif) untuk anggaran kas & realisasi
-- =====================================================================
select t.as_user(:'admin');
select t.lives($q$insert into t.ids select 'w', public.create_budget_version(2028, 'murni')$q$, 'versi kerja 2028');
select t.lives(format($q$insert into t.ids select 'wi', public.add_budget_item(t.id('w'), %L, %L, %L, %L, 'Butir kerja PPTK1', 1200000)$q$, :'sub', :'acct', :'fund', :'pptk1'), 'butir kerja PPTK1');
select t.lives(format($q$insert into t.ids select 'wi2', public.add_budget_item(t.id('w'), %L, %L, %L, %L, 'Butir kerja PPTK2', 600000)$q$, :'sub', :'acct', :'fund', :'pptk2'), 'butir kerja PPTK2');
select t.lives($q$select public.set_budget_version_status(t.id('w'), 'active')$q$, 'versi kerja aktif');

-- =====================================================================
-- B. Anggaran kas
-- =====================================================================
select t.as_user(:'pptk1');
select t.lives($q$insert into t.ids select 'cp', public.save_cash_plan(t.id('w'), t.id('wi'), array_fill(100000::numeric, array[12]))$q$, 'PPTK menyusun anggaran kas 12 bulan (total = pagu)');
select t.ok((select count(*) from public.cash_budget_periods where plan_id = t.id('cp')) = 12, '12 baris periode tersimpan');
select t.lives($q$select public.save_cash_plan(t.id('w'), t.id('wi'), array[50000,0,0,0,0,0,0,0,0,0,0,0]::numeric[])$q$, 'PPTK menyimpan ulang (menimpa periode)');
select t.ok((select count(*) from public.cash_budget_periods where plan_id = t.id('cp')) = 12 and (select sum(amount) from public.cash_budget_periods where plan_id = t.id('cp')) = 50000, 'periode lama diganti, tidak menumpuk');
select t.throws($q$select public.save_cash_plan(t.id('w'), t.id('wi'), array_fill(100001::numeric, array[12]))$q$, 'total kas melebihi pagu ditolak');
select t.throws($q$select public.save_cash_plan(t.id('w'), t.id('wi'), array[1,2,3]::numeric[])$q$, 'selain 12 bulan ditolak');
select t.throws($q$select public.save_cash_plan(t.id('w'), t.id('wi'), array[-1,0,0,0,0,0,0,0,0,0,0,0]::numeric[])$q$, 'nilai negatif ditolak');
select t.as_user(:'pptk2');
select t.throws($q$select public.save_cash_plan(t.id('w'), t.id('wi'), array_fill(1::numeric, array[12]))$q$, 'PPTK lain tidak dapat mengubah anggaran kas butir bukan miliknya');
select t.as_user(:'admin');
select t.throws($q$select public.save_cash_plan(t.id('w'), t.id('wi'), array_fill(1::numeric, array[12]))$q$, 'admin tidak menyusun anggaran kas (hak PPTK)');

select t.as_user(:'pptk1');
select t.lives($q$select public.save_cash_plan(t.id('w'), t.id('wi'), array_fill(100000::numeric, array[12]))$q$, 'PPTK mengisi penuh');
select t.lives($q$select public.set_cash_plan_status(t.id('cp'), 'submitted')$q$, 'PPTK mengajukan anggaran kas');
select t.throws($q$select public.save_cash_plan(t.id('w'), t.id('wi'), array_fill(1::numeric, array[12]))$q$, 'anggaran kas diajukan tidak dapat diubah');
select t.throws($q$select public.set_cash_plan_status(t.id('cp'), 'final')$q$, 'PPTK tidak dapat memfinalkan');
select t.as_user(:'ppk');
select t.throws($q$select public.set_cash_plan_status(t.id('cp'), 'final')$q$, 'PPK (default) tidak dapat memfinalkan');
select t.as_user(:'admin');
select t.throws($q$select public.set_cash_plan_status(t.id('cp'), 'returned', '')$q$, 'pengembalian tanpa alasan ditolak');
select t.lives($q$select public.set_cash_plan_status(t.id('cp'), 'returned', 'Perbaiki bulan Juni')$q$, 'admin mengembalikan dengan alasan');
select t.as_user(:'pptk1');
select t.lives($q$select public.save_cash_plan(t.id('w'), t.id('wi'), array_fill(100000::numeric, array[12]))$q$, 'PPTK dapat memperbaiki setelah dikembalikan');
select t.lives($q$select public.set_cash_plan_status(t.id('cp'), 'submitted')$q$, 'PPTK mengajukan ulang');
select t.ok((select revision_no from public.cash_budget_plans where id = t.id('cp')) = 3, 'nomor revisi bertambah tiap pengajuan');
select t.as_user(:'admin');
select t.lives($q$select public.set_cash_plan_status(t.id('cp'), 'final')$q$, 'admin memfinalkan anggaran kas');
select t.as_user(:'pptk1');
select t.throws($q$select public.save_cash_plan(t.id('w'), t.id('wi'), array_fill(1::numeric, array[12]))$q$, 'anggaran kas final tidak dapat diubah');
select t.throws($q$select public.set_cash_plan_status(t.id('cp'), 'draft')$q$, 'transisi mundur tidak diizinkan');

-- =====================================================================
-- C. Realisasi belanja
-- =====================================================================
select t.as_user(:'pptk1');
select t.lives(format($q$insert into t.ids select 'tx', public.create_transaction(t.id('w'), t.id('wi'), date '2028-03-10', 'Beli ATK', null, null, 400000)$q$), 'PPTK membuat transaksi draf + pembayaran');
select t.ok(t.status_of($q$select status from public.realization_transactions where id = t.id('tx')$q$) = 'draft', 'transaksi berstatus draft');
select t.lives($q$insert into t.ids select 'pay2', public.add_payment(t.id('tx'), 100000, 'termin 2')$q$, 'PPTK menambah pembayaran');
select t.throws($q$select public.add_payment(t.id('tx'), 5000000)$q$, 'pembayaran melebihi pagu ditolak');
select t.throws($q$select public.add_payment(t.id('tx'), 0)$q$, 'pembayaran nol ditolak');
select t.throws($q$select public.create_transaction(t.id('w'), t.id('wi2'), date '2028-03-10', 'Bukan butir saya', null, null, 10)$q$, 'PPTK tidak dapat membuat transaksi pada butir PPTK lain');
select t.throws($q$select public.create_transaction(t.id('w'), t.id('wi'), date '2028-03-10', '  ', null, null, 10)$q$, 'uraian kosong ditolak');
select t.as_user(:'pptk2');
select t.throws($q$select public.add_payment(t.id('tx'), 1000)$q$, 'PPTK lain tidak dapat menambah pembayaran');
select t.throws($q$select public.submit_transaction(t.id('tx'))$q$, 'PPTK lain tidak dapat mengajukan');
select t.as_user(:'pptk1');
select t.lives($q$select public.submit_transaction(t.id('tx'))$q$, 'PPTK mengajukan transaksi');
select t.throws($q$select public.submit_transaction(t.id('tx'))$q$, 'pengajuan ulang pada status submitted ditolak');
select t.throws($q$select public.add_payment(t.id('tx'), 1000)$q$, 'tidak dapat menambah pembayaran setelah diajukan');
select t.throws($q$select public.verify_transaction(t.id('tx'))$q$, 'PPTK tidak dapat memverifikasi');
select t.throws($q$select public.record_sp2d(t.id('pay2'), 'SP2D-001', date '2028-03-20')$q$, 'PPTK tidak dapat mencatat SP2D');

select t.as_user(:'admin');
select t.throws($q$select public.verify_transaction(t.id('tx'))$q$, 'verifikasi tanpa SP2D ditolak');
select t.lives($q$select public.record_sp2d(t.id('pay2'), 'SP2D-001', date '2028-03-20')$q$, 'admin mencatat SP2D pembayaran 2');
select t.ok(t.status_of($q$select status from public.realization_transactions where id = t.id('tx')$q$) = 'payment_processing', 'status menjadi payment_processing');
select t.throws($q$select public.verify_transaction(t.id('tx'))$q$, 'verifikasi ditolak selama masih ada pembayaran tanpa SP2D');
select t.lives($q$select public.record_sp2d((select id from public.payment_records where transaction_id = t.id('tx') and id <> t.id('pay2')), 'SP2D-002', date '2028-03-21')$q$, 'admin mencatat SP2D pembayaran 1');
select t.throws($q$select public.record_sp2d(t.id('pay2'), 'SP2D-002', date '2028-03-22')$q$, 'nomor SP2D ganda pada tahun yang sama ditolak');
select t.ok((select total_realisasi from public.dashboard_kpis(t.id('w'))) = 0, 'KPI: belum ada realisasi sebelum diverifikasi');
select t.ok((select jumlah_menunggu_sp2d from public.dashboard_kpis(t.id('w'))) = 1, 'KPI: 1 transaksi menunggu SP2D');
select t.lives($q$select public.verify_transaction(t.id('tx'))$q$, 'admin memverifikasi -> realisasi');
select t.ok((select total_realisasi from public.dashboard_kpis(t.id('w'))) = 500000, 'KPI: realisasi sah 500.000 (400.000 + 100.000)');
select t.throws($q$select public.cancel_transaction(t.id('tx'), '')$q$, 'pembatalan tanpa alasan ditolak');
select t.throws($q$update public.realization_transactions set description = 'ubah diam-diam' where id = t.id('tx')$q$, 'transaksi final tidak dapat diubah langsung');
select t.lives($q$select public.correct_sp2d(t.id('pay2'), 'SP2D-001A', date '2028-03-19', 'Salah ketik nomor')$q$, 'koreksi SP2D dengan alasan');
select t.throws($q$select public.correct_sp2d(t.id('pay2'), 'SP2D-001B', date '2028-03-19', '')$q$, 'koreksi SP2D tanpa alasan ditolak');
select t.lives($q$select public.cancel_transaction(t.id('tx'), 'Dibatalkan: dokumen tidak lengkap')$q$, 'admin membatalkan transaksi final dengan alasan');
select t.ok((select total_realisasi from public.dashboard_kpis(t.id('w'))) = 0, 'KPI: realisasi kembali 0 setelah pembatalan');
select t.ok((select count(*) from public.workflow_events where entity_id = t.id('tx') and to_status = 'cancelled' and reason like 'Dibatalkan%') = 1, 'riwayat mencatat alasan pembatalan');
select t.throws($q$select public.cancel_transaction(t.id('tx'), 'lagi')$q$, 'pembatalan ganda ditolak');

-- Alur kembali & ajukan ulang
select t.as_user(:'pptk1');
select t.lives($q$insert into t.ids select 'tx2', public.create_transaction(t.id('w'), t.id('wi'), date '2028-04-01', 'Beli kertas', null, null, 200000)$q$, 'transaksi kedua');
select t.lives($q$select public.submit_transaction(t.id('tx2'))$q$, 'ajukan transaksi kedua');
select t.as_user(:'admin');
select t.throws($q$select public.return_transaction(t.id('tx2'), '')$q$, 'pengembalian tanpa alasan ditolak');
select t.lives($q$select public.return_transaction(t.id('tx2'), 'Nilai tidak sesuai kuitansi')$q$, 'admin mengembalikan transaksi');
select t.ok(t.status_of($q$select status from public.realization_transactions where id = t.id('tx2')$q$) = 'returned', 'status returned');
select t.ok((select count(*) from public.workflow_events where entity_id = t.id('tx2') and to_status = 'returned' and reason like 'Nilai%') = 1, 'alasan pengembalian tercatat');
select t.as_user(:'pptk1');
select t.lives($q$select public.add_payment(t.id('tx2'), 50000)$q$, 'PPTK dapat menambah pembayaran saat dikembalikan');
select t.lives($q$select public.submit_transaction(t.id('tx2'))$q$, 'PPTK mengajukan ulang');

-- =====================================================================
-- D. Dokumen pengadaan
-- =====================================================================
select t.as_user(:'pptk1');
select t.lives(format($q$insert into t.ids select 'd1', public.create_document('dpp', t.id('wi'), 'DPP Pengadaan ATK', %L, %L, '{"perihal":"Pengadaan ATK"}'::jsonb)$q$, :'ppk', :'ppbj'), 'PPTK membuat DPP');
select t.ok(t.status_of($q$select status from public.procurement_documents where id = t.id('d1')$q$) = 'draft', 'dokumen berstatus draft');
select t.ok((select count(*) from public.document_revisions where document_id = t.id('d1')) = 1, 'revisi awal dibuat');
select t.throws(format($q$select public.create_document('dpp', t.id('wi2'), 'Bukan butir saya', %L, %L, '{}')$q$, :'ppk', :'ppbj'), 'PPTK tidak dapat membuat dokumen pada butir PPTK lain');
select t.throws(format($q$select public.create_document('dpp', t.id('wi'), 'PPK salah', %L, %L, '{}')$q$, :'ppbj', :'ppbj'), 'penugasan PPK harus berperan ppk');
select t.throws(format($q$select public.create_document('berita_acara_reviu', t.id('wi'), 'BA palsu', %L, %L, '{}')$q$, :'ppk', :'ppbj'), 'PPTK tidak dapat membuat Berita Acara');
select t.lives($q$select public.save_document_revision(t.id('d1'), null, '{"perihal":"Pengadaan ATK 2028"}'::jsonb, 'revisi isi')$q$, 'PPTK menyimpan revisi 2');
select t.ok((select max(revision_no) from public.document_revisions where document_id = t.id('d1')) = 2, 'nomor revisi bertambah');
select t.as_user(:'pptk2');
select t.throws($q$select public.save_document_revision(t.id('d1'), null, '{}')$q$, 'bukan penyusun tidak dapat mengubah isi');
select t.ok(t.cnt($q$select 1 from public.procurement_documents where id = t.id('d1')$q$) = 0, 'PPTK lain tidak melihat dokumen');
select t.as_user(:'ppbj');
select t.throws($q$select public.start_review(t.id('d1'))$q$, 'reviu draf (belum diajukan) ditolak');
select t.as_user(:'pptk1');
select t.lives($q$select public.submit_document(t.id('d1'))$q$, 'PPTK mengajukan dokumen');
select t.throws($q$select public.save_document_revision(t.id('d1'), null, '{}')$q$, 'dokumen diajukan tidak dapat diubah');
select t.as_user(:'ppbj');
select t.lives($q$insert into t.ids select 'r1', public.start_review(t.id('d1'))$q$, 'PPBJ memulai reviu');
select t.ok(t.status_of($q$select status from public.procurement_documents where id = t.id('d1')$q$) = 'under_review', 'status under_review');
select t.lives($q$select public.add_finding(t.id('r1'), 'HPS belum dilampirkan', 'Lampirkan HPS')$q$, 'PPBJ mencatat temuan');
select t.throws($q$select public.complete_review(t.id('d1'))$q$, 'reviu tidak dapat selesai dengan temuan belum beres');
select t.throws($q$select public.return_document(t.id('d1'), '')$q$, 'pengembalian tanpa alasan ditolak');
select t.lives($q$select public.return_document(t.id('d1'), 'Lengkapi HPS')$q$, 'PPBJ mengembalikan dokumen');
select t.ok((select outcome from public.document_reviews where id = t.id('r1')) = 'returned', 'hasil reviu = returned');
select t.as_user(:'pptk1');
select t.lives($q$select public.save_document_revision(t.id('d1'), null, '{"perihal":"ATK","hps":"terlampir"}'::jsonb, 'HPS dilampirkan')$q$, 'PPTK memperbaiki');
select t.lives($q$select public.submit_document(t.id('d1'))$q$, 'PPTK mengajukan ulang');
select t.ok(t.status_of($q$select status from public.procurement_documents where id = t.id('d1')$q$) = 'resubmitted', 'status resubmitted');
select t.as_user(:'ppbj');
select t.lives($q$insert into t.ids select 'r2', public.start_review(t.id('d1'))$q$, 'PPBJ mereviu ulang');
select t.throws($q$select public.issue_minutes(t.id('d1'), 'BA/1')$q$, 'Berita Acara sebelum reviu selesai ditolak');
select t.lives($q$select public.complete_review(t.id('d1'))$q$, 'PPBJ menyelesaikan reviu');
select t.as_user(:'pptk1');
select t.throws($q$select public.issue_minutes(t.id('d1'), 'BA/1')$q$, 'PPTK tidak dapat menerbitkan Berita Acara');
select t.as_user(:'ppbj');
select t.lives($q$select public.issue_minutes(t.id('d1'), 'BA/001/2028', '{"catatan":"lengkap"}'::jsonb)$q$, 'PPBJ menerbitkan Berita Acara');
select t.ok(t.status_of($q$select status from public.procurement_documents where id = t.id('d1')$q$) = 'issued', 'status issued');
select t.ok((select count(*) from public.review_minutes where minutes_no = 'BA/001/2028') = 1, 'Berita Acara tersimpan');
select t.ok((select count(*) from public.workflow_events where entity_id = t.id('d1')) >= 6, 'riwayat transisi dokumen tercatat');

-- PPK mengembalikan dokumen & pembatalan
select t.as_user(:'pptk1');
select t.lives(format($q$insert into t.ids select 'd2', public.create_document('nota_dinas_pptk', t.id('wi'), 'Nota Dinas', %L, %L, '{}')$q$, :'ppk', :'ppbj'), 'dokumen kedua');
select t.lives($q$select public.submit_document(t.id('d2'))$q$, 'ajukan dokumen kedua');
select t.as_user(:'ppk');
select t.lives($q$select public.return_document(t.id('d2'), 'Perbaiki perihal')$q$, 'PPK mengembalikan dokumen');
select t.as_user(:'pptk2');
select t.throws($q$select public.cancel_document(t.id('d2'), 'bukan milik saya')$q$, 'bukan penyusun tidak dapat membatalkan');
select t.as_user(:'pptk1');
select t.throws($q$select public.cancel_document(t.id('d2'), '')$q$, 'pembatalan dokumen tanpa alasan ditolak');
select t.lives($q$select public.cancel_document(t.id('d2'), 'Tidak diperlukan')$q$, 'penyusun membatalkan dokumen');
select t.as_user(:'outsider');
select t.ok(t.cnt($q$select 1 from public.procurement_documents$q$) = 0, 'OPD lain tidak melihat dokumen');
select t.throws($q$select public.start_review(t.id('d1'))$q$, 'OPD lain tidak dapat mereviu');

-- =====================================================================
-- Anon tidak dapat memanggil fungsi alur kerja
-- =====================================================================
select t.as_super();
reset role; set role anon;
select t.throws($q$select public.create_budget_version(2040, 'murni')$q$, 'anon tidak dapat memanggil create_budget_version');
select t.throws($q$select public.submit_document('00000000-0000-0000-0000-000000000000')$q$, 'anon tidak dapat memanggil submit_document');
select t.as_super();

-- =====================================================================
reset role;
select case when passed then 'PASS' else 'FAIL' end as hasil, name, case when passed then '' else coalesce(detail,'') end as detail
from t.results order by n;
select count(*) filter (where passed) as lulus, count(*) filter (where not passed) as gagal, count(*) as total from t.results;
do $$ begin
  if exists (select 1 from t.results where not passed) then
    raise exception 'Ada tes alur kerja yang gagal';
  end if;
end $$;
