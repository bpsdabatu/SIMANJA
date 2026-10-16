-- =====================================================================
-- 70_sp2d_status_tests.sql
-- Tes migrasi 0013: record_realization_v2 (tanggal SP2D opsional) dan set_realization_sp2d.
-- Dijalankan SETELAH 60_realization_tests.sql (memakai versi 'rv', butir 'ri1' [sisa 300.000] dan 'ri2' [sisa 499.990]).
-- =====================================================================
\set ON_ERROR_STOP on
reset role;
delete from t.results;

\set admin  '11111111-1111-1111-1111-111111111111'
\set ppk    '22222222-2222-2222-2222-222222222222'
\set pptk1  '33333333-3333-3333-3333-333333333333'
\set pptk2  '44444444-4444-4444-4444-444444444444'
\set ppbj   '55555555-5555-5555-5555-555555555555'

-- ---- jalur lengkap (sudah SP2D) tetap berfungsi ----
select t.as_user(:'pptk1');
select t.lives($q$insert into t.ids select 'z1', public.record_realization_v2(t.id('rv'), t.id('ri1'), t.today(), t.today(), 'Sudah SP2D', null, null, 10000)$q$, 'sudah SP2D: tersimpan');
select t.ok(t.status_of($q$select status from public.realization_transactions where id = t.id('z1')$q$) = 'realisasi', 'sudah SP2D: langsung realisasi');
select t.throws($q$select public.record_realization_v2(t.id('rv'), t.id('ri1'), t.today(), t.today() - 1, 'Terbalik', null, null, 10)$q$, 'tanggal transaksi setelah tanggal SP2D ditolak');
select t.throws($q$select public.record_realization_v2(t.id('rv'), t.id('ri1'), t.today(), t.today() + 1, 'SP2D besok', null, null, 10)$q$, 'tanggal SP2D masa depan ditolak');

-- ---- belum SP2D ----
select t.lives($q$insert into t.ids select 'zp1', public.record_realization_v2(t.id('rv'), t.id('ri1'), t.today(), null, 'Belum SP2D', null, null, 50000)$q$, 'belum SP2D: tersimpan tanpa tanggal SP2D');
select t.ok(t.status_of($q$select status from public.realization_transactions where id = t.id('zp1')$q$) = 'payment_processing', 'belum SP2D: status payment_processing');
select t.ok((select count(*) from public.sp2d_records where payment_record_id in (select id from public.payment_records where transaction_id = t.id('zp1'))) = 0, 'belum SP2D: tidak ada baris SP2D');
select t.ok((select eligible_realization from public.v_budget_balance where budget_version_id = t.id('rv') and budget_item_id = t.id('ri1')) = 710000, 'belum SP2D: BELUM dihitung sebagai realisasi sah (700.000 + 10.000)');
select t.ok((select pending_sp2d from public.v_budget_balance where budget_version_id = t.id('rv') and budget_item_id = t.id('ri1')) = 50000, 'belum SP2D: tercatat sebagai menunggu SP2D');
select t.throws($q$select public.record_realization_v2(t.id('rv'), t.id('ri1'), t.today() + 1, null, 'Transaksi besok', null, null, 10)$q$, 'belum SP2D: tanggal transaksi masa depan ditolak');
select t.throws($q$select public.record_realization_v2(t.id('rv'), t.id('ri1'), t.today(), null, 'Lebih pagu', null, null, 240000.01)$q$, 'belum SP2D tetap memakai pagu (sisa 240.000)');
select t.lives($q$insert into t.ids select 'zp2', public.record_realization_v2(t.id('rv'), t.id('ri1'), t.today(), null, 'Habiskan sisa', null, null, 240000)$q$, 'belum SP2D: tepat sisa diterima');
select t.throws($q$select public.record_realization_v2(t.id('rv'), t.id('ri1'), t.today(), t.today(), 'Lewat', null, null, 0.01)$q$, 'pagu habis (termasuk yang belum SP2D)');
select t.throws($q$select public.record_realization_v2(t.id('rv'), t.id('ri2'), t.today(), null, 'Bukan butir saya', null, null, 10)$q$, 'belum SP2D: PPTK lain tidak dapat input pada butir ini');

-- ---- melengkapi tanggal SP2D ----
select t.as_user(:'pptk2');
select t.throws($q$select public.set_realization_sp2d(t.id('zp1'), t.today())$q$, 'PPTK lain tidak dapat mengisi SP2D');
select t.as_user(:'ppbj');
select t.throws($q$select public.set_realization_sp2d(t.id('zp1'), t.today())$q$, 'PPBJ tidak dapat mengisi SP2D');
select t.as_user(:'pptk1');
select t.throws($q$select public.set_realization_sp2d(t.id('zp1'), t.today() + 1)$q$, 'tanggal SP2D masa depan ditolak');
select t.throws($q$select public.set_realization_sp2d(t.id('zp1'), t.today() - 1)$q$, 'tanggal SP2D sebelum tanggal transaksi ditolak');
select t.throws($q$select public.set_realization_sp2d(t.id('zp1'), null)$q$, 'tanggal SP2D wajib');
select t.lives($q$select public.set_realization_sp2d(t.id('zp1'), t.today())$q$, 'PPTK melengkapi tanggal SP2D');
select t.ok(t.status_of($q$select status from public.realization_transactions where id = t.id('zp1')$q$) = 'realisasi', 'setelah SP2D: status realisasi');
select t.ok((select sp2d_date from public.sp2d_records where payment_record_id in (select id from public.payment_records where transaction_id = t.id('zp1'))) = t.today(), 'tanggal SP2D tersimpan');
select t.ok((select eligible_realization from public.v_budget_balance where budget_version_id = t.id('rv') and budget_item_id = t.id('ri1')) = 760000, 'setelah SP2D: dihitung sebagai realisasi sah (710.000 + 50.000)');
select t.ok((select pending_sp2d from public.v_budget_balance where budget_version_id = t.id('rv') and budget_item_id = t.id('ri1')) = 240000, 'menunggu SP2D berkurang');
select t.throws($q$select public.set_realization_sp2d(t.id('zp1'), t.today())$q$, 'tidak dapat mengisi ulang SP2D yang sudah ada');
select t.ok((select count(*) from public.workflow_events where entity_id = t.id('zp1') and to_status = 'realisasi' and from_status = 'payment_processing') = 1, 'riwayat mencatat Belum SP2D -> Realisasi');

-- ---- Admin dapat melengkapi; transaksi batal tidak ----
select t.as_user(:'admin');
select t.lives($q$select public.set_realization_sp2d(t.id('zp2'), t.today())$q$, 'Admin melengkapi tanggal SP2D');
select t.ok(t.status_of($q$select status from public.realization_transactions where id = t.id('zp2')$q$) = 'realisasi', 'Admin: status realisasi');
select t.as_user(:'pptk2');
select t.lives($q$insert into t.ids select 'zp3', public.record_realization_v2(t.id('rv'), t.id('ri2'), t.today(), null, 'Akan dibatalkan', null, null, 100)$q$, 'PPTK2 input belum SP2D pada butirnya');
select t.as_user(:'admin');
select t.lives($q$select public.cancel_transaction(t.id('zp3'), 'Salah input')$q$, 'Admin membatalkan transaksi belum SP2D');
select t.throws($q$select public.set_realization_sp2d(t.id('zp3'), t.today())$q$, 'transaksi batal tidak dapat diberi SP2D');
select t.ok((select pending_sp2d from public.v_budget_balance where budget_version_id = t.id('rv') and budget_item_id = t.id('ri2')) = 0, 'transaksi batal tidak lagi memakai pagu');

-- ---- koreksi tanggal Admin tetap berlaku pada transaksi yang SP2D-nya dilengkapi belakangan ----
select t.lives($q$select public.correct_realization_dates(t.id('zp1'), t.today(), t.today(), 'Uji koreksi')$q$, 'Admin mengoreksi tanggal setelah SP2D dilengkapi');

select t.as_super();
select * from t.results where not passed;
select count(*) filter (where passed) as lulus, count(*) filter (where not passed) as gagal, count(*) as total from t.results;
