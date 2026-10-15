-- =====================================================================
-- 60_realization_tests.sql
-- Tes input realisasi ringkas tanpa verifikasi (migrasi 0011): record_realization & correct_realization_date.
-- Dijalankan SETELAH 50_supplier_tests.sql pada database yang sama (memakai t.ids & pengguna dari tes sebelumnya).
-- =====================================================================
\set ON_ERROR_STOP on
reset role;
delete from t.results;

\set admin  '11111111-1111-1111-1111-111111111111'
\set ppk    '22222222-2222-2222-2222-222222222222'
\set pptk1  '33333333-3333-3333-3333-333333333333'
\set pptk2  '44444444-4444-4444-4444-444444444444'
\set ppbj   '55555555-5555-5555-5555-555555555555'
\set sub  '00000000-0000-0000-0000-00000000a003'
\set acct '00000000-0000-0000-0000-00000000e001'
\set fund '00000000-0000-0000-0000-00000000d001'

-- Tahun berjalan (WIB) agar tanggal SP2D tidak melewati hari ini
create function t.today() returns date language sql stable as $$ select (now() at time zone 'Asia/Jakarta')::date $$;
grant execute on function t.today() to public;

select t.as_user(:'admin');
select t.lives($q$insert into t.ids select 'rv', public.create_budget_version(extract(year from t.today())::int, 'murni', 'uji realisasi ringkas')$q$, 'versi kerja tahun berjalan');
select t.lives(format($q$insert into t.ids select 'ri1', public.add_budget_item(t.id('rv'), %L, %L, %L, %L, 'Butir realisasi PPTK1', 1000000)$q$, :'sub', :'acct', :'fund', :'pptk1'), 'butir PPTK1 (pagu 1.000.000)');
select t.lives(format($q$insert into t.ids select 'ri2', public.add_budget_item(t.id('rv'), %L, %L, %L, %L, 'Butir realisasi PPTK2', 500000)$q$, :'sub', :'acct', :'fund', :'pptk2'), 'butir PPTK2');
select t.lives($q$select public.set_budget_version_status(t.id('rv'), 'active')$q$, 'versi kerja aktif');

-- ---- PPTK menyimpan realisasi: satu langkah, hanya tanggal SP2D, langsung sah ----
select t.as_user(:'pptk1');
select t.lives($q$insert into t.ids select 'rr1', public.record_realization(t.id('rv'), t.id('ri1'), t.today(), 'Beli ATK', null, null, 300000)$q$, 'PPTK menyimpan realisasi (tanggal SP2D saja)');
select t.ok(t.status_of($q$select status from public.realization_transactions where id = t.id('rr1')$q$) = 'realisasi', 'langsung berstatus realisasi (tanpa verifikasi)');
select t.ok((select sp2d_number from public.sp2d_records where payment_record_id in (select id from public.payment_records where transaction_id = t.id('rr1'))) is null, 'nomor SP2D kosong');
select t.ok((select sp2d_date from public.sp2d_records where payment_record_id in (select id from public.payment_records where transaction_id = t.id('rr1'))) = t.today(), 'tanggal SP2D tersimpan');
select t.ok((select transaction_date from public.realization_transactions where id = t.id('rr1')) = t.today(), 'tanggal transaksi = tanggal SP2D');
select t.ok((select eligible_realization from public.v_budget_balance where budget_version_id = t.id('rv') and budget_item_id = t.id('ri1')) = 300000, 'langsung dihitung sebagai realisasi sah');
select t.ok((select pending_sp2d from public.v_budget_balance where budget_version_id = t.id('rv') and budget_item_id = t.id('ri1')) = 0, 'tidak ada yang menunggu SP2D');
select t.ok((select total_realisasi from public.dashboard_kpis(t.id('rv'))) = 300000, 'KPI dasbor langsung terbarui');

-- ---- uraian opsional: default nama rekening ----
select t.lives($q$insert into t.ids select 'rr2', public.record_realization(t.id('rv'), t.id('ri1'), t.today(), null, null, null, 100000)$q$, 'uraian kosong diterima');
select t.ok(coalesce((select description from public.realization_transactions where id = t.id('rr2')), '') like 'Realisasi %', 'uraian otomatis dari nama rekening');

-- ---- validasi ----
select t.throws($q$select public.record_realization(t.id('rv'), t.id('ri1'), t.today() + 1, 'Besok', null, null, 10)$q$, 'tanggal SP2D melewati hari ini ditolak');
select t.throws($q$select public.record_realization(t.id('rv'), t.id('ri1'), (date_trunc('year', t.today()) - interval '1 day')::date, 'Tahun lalu', null, null, 10)$q$, 'tanggal SP2D di luar tahun anggaran ditolak');
select t.throws($q$select public.record_realization(t.id('rv'), t.id('ri1'), null, 'Tanpa tanggal', null, null, 10)$q$, 'tanggal SP2D wajib');
select t.throws($q$select public.record_realization(t.id('rv'), t.id('ri1'), t.today(), 'Nol', null, null, 0)$q$, 'nilai nol ditolak');
select t.throws($q$select public.record_realization(t.id('rv'), t.id('ri1'), t.today(), 'Desimal', null, null, 10.005)$q$, 'lebih dari 2 desimal ditolak');
select t.throws($q$select public.record_realization(t.id('rv'), t.id('ri1'), t.today(), 'Melebihi sisa', null, null, 600001)$q$, 'melebihi pagu (sisa 600.000) ditolak');
select t.ok((select count(*) from public.realization_transactions where budget_item_id = t.id('ri1') and status <> 'cancelled') = 2, 'transaksi gagal tidak meninggalkan data setengah jadi');
select t.lives($q$select public.record_realization(t.id('rv'), t.id('ri1'), t.today(), 'Tepat habis', null, null, 600000)$q$, 'nilai tepat sama dengan sisa diterima');
select t.throws($q$select public.record_realization(t.id('rv'), t.id('ri1'), t.today(), 'Lewat', null, null, 0.01)$q$, 'pagu habis: tambahan ditolak');

-- ---- otorisasi ----
select t.throws($q$select public.record_realization(t.id('rv'), t.id('ri2'), t.today(), 'Bukan butir saya', null, null, 10)$q$, 'PPTK lain tidak dapat menginput pada butir ini');
select t.as_user(:'pptk2');
select t.throws($q$select public.record_realization(t.id('rv'), t.id('ri1'), t.today(), 'Bukan butir saya', null, null, 10)$q$, 'PPTK2 ditolak pada butir PPTK1');
select t.lives($q$select public.record_realization(t.id('rv'), t.id('ri2'), t.today(), 'Milik PPTK2', null, null, 10)$q$, 'PPTK2 berhasil pada butirnya');
select t.as_user(:'ppbj');
select t.throws($q$select public.record_realization(t.id('rv'), t.id('ri1'), t.today(), 'PPBJ', null, null, 10)$q$, 'PPBJ ditolak');
select t.as_user(:'admin');
select t.throws($q$select public.record_realization(t.id('rv'), t.id('ri1'), t.today(), 'Admin bukan PPTK', null, null, 10)$q$, 'Admin tidak menginput realisasi (bukan PPTK penugasan)');

-- ---- koreksi tanggal SP2D (Admin) ----
select t.throws($q$select public.correct_realization_date(t.id('rr1'), t.today() - 1, '')$q$, 'koreksi tanpa alasan ditolak');
select t.throws($q$select public.correct_realization_date(t.id('rr1'), t.today() + 1, 'Salah')$q$, 'koreksi ke tanggal masa depan ditolak');
select t.lives($q$select public.correct_realization_date(t.id('rr1'), (date_trunc('year', t.today()))::date, 'Salah tanggal input')$q$, 'Admin mengoreksi tanggal SP2D dengan alasan');
select t.ok((select sp2d_date from public.sp2d_records where payment_record_id in (select id from public.payment_records where transaction_id = t.id('rr1'))) = (date_trunc('year', t.today()))::date, 'tanggal SP2D berubah');
select t.ok((select transaction_date from public.realization_transactions where id = t.id('rr1')) = (date_trunc('year', t.today()))::date, 'tanggal transaksi ikut berubah');
select t.as_user(:'pptk1');
select t.throws($q$select public.correct_realization_date(t.id('rr1'), t.today(), 'PPTK mencoba')$q$, 'PPTK tidak dapat mengoreksi');
select t.as_user(:'admin');
select t.throws($q$update public.realization_transactions set description = 'ubah diam-diam' where id = t.id('rr1')$q$, 'realisasi final tidak dapat diubah langsung (tanpa alasan koreksi)');
select t.lives($q$select public.cancel_transaction(t.id('rr1'), 'Input ganda')$q$, 'Admin membatalkan realisasi dengan alasan');
select t.ok((select eligible_realization from public.v_budget_balance where budget_version_id = t.id('rv') and budget_item_id = t.id('ri1')) = 700000, 'realisasi berkurang setelah pembatalan (100.000 + 600.000)');

select t.as_super();
select * from t.results where not passed;
select count(*) filter (where passed) as lulus, count(*) filter (where not passed) as gagal, count(*) as total from t.results;
do $$ begin
  if exists (select 1 from t.results where not passed) then
    raise exception 'Ada tes realisasi ringkas yang gagal';
  end if;
end $$;
