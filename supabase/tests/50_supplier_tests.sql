-- =====================================================================
-- 50_supplier_tests.sql
-- Tes penambahan penyedia manual dari Realisasi Belanja (migrasi 0010). Dijalankan SETELAH 40_dpa_tests.sql.
-- =====================================================================
\set ON_ERROR_STOP on
reset role;
delete from t.results;

\set admin    '11111111-1111-1111-1111-111111111111'
\set pptk1    '33333333-3333-3333-3333-333333333333'
\set ppbj     '55555555-5555-5555-5555-555555555555'
\set outsider '66666666-6666-6666-6666-666666666666'

select t.as_user(:'pptk1');
select t.lives($q$insert into t.ids select 's1', public.create_supplier_for_realization('  CV   Maju Jaya ', '01.234.567.8-901.000', 'Jl. Merdeka 1')$q$, 'PPTK menambah penyedia manual');
select t.ok((select name from public.suppliers where id = t.id('s1')) = 'CV Maju Jaya', 'nama dinormalisasi (spasi)');
select t.ok((select npwp from public.suppliers where id = t.id('s1')) = '01.234.567.8-901.000', 'NPWP tersimpan');
select t.lives($q$insert into t.ids select 's2', public.create_supplier_for_realization('cv maju  JAYA')$q$, 'nama sama (beda huruf/spasi) dipakai ulang');
select t.ok(t.id('s1') = t.id('s2'), 'tidak membuat penyedia ganda');
select t.throws($q$select public.create_supplier_for_realization('   ')$q$, 'nama kosong ditolak');
select t.throws($q$select public.create_supplier_for_realization(repeat('a', 201))$q$, 'nama terlalu panjang ditolak');

select t.as_user(:'ppbj');
select t.throws($q$select public.create_supplier_for_realization('PT Tanpa Izin')$q$, 'PPBJ (tanpa realization.edit) ditolak');

select t.as_user(:'admin');
select t.ok((select count(*) from public.suppliers where lower(name) = 'cv maju jaya') = 1, 'Data Master hanya memiliki satu penyedia tersebut');
select t.ok(exists (select 1 from public.suppliers where id = t.id('s1')), 'penyedia manual tampak di Data Master (admin)');

-- penyedia nonaktif tidak diaktifkan diam-diam
select t.as_super();
update public.suppliers set is_active = false where id = t.id('s1');
select t.as_user(:'pptk1');
select t.throws($q$select public.create_supplier_for_realization('CV Maju Jaya')$q$, 'penyedia nonaktif: ditolak dengan petunjuk');

-- isolasi organisasi
select t.as_user(:'outsider');
select t.ok((select count(*) from public.suppliers where lower(name) = 'cv maju jaya') = 0, 'OPD lain tidak melihat penyedia');

select t.as_super();
reset role;
select case when passed then 'PASS' else 'FAIL' end as hasil, name, case when passed then '' else coalesce(detail,'') end as detail
from t.results order by n;
select count(*) filter (where passed) as lulus, count(*) filter (where not passed) as gagal, count(*) as total from t.results;
do $$ begin
  if exists (select 1 from t.results where not passed) then
    raise exception 'Ada tes penyedia yang gagal';
  end if;
end $$;
