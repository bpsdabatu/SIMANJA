-- =====================================================================
-- 40_dpa_tests.sql
-- Tes tanggal penetapan DPA (migrasi 0009). Dijalankan SETELAH 30_workflow_tests.sql pada database yang sama.
-- =====================================================================
\set ON_ERROR_STOP on
reset role;
delete from t.results;

\set admin  '11111111-1111-1111-1111-111111111111'
\set pptk1  '33333333-3333-3333-3333-333333333333'

select t.as_user(:'admin');
select t.lives($q$insert into t.ids select 'dm',  public.create_budget_version(2028, 'murni')$q$, 'versi murni 2028');
select t.lives($q$insert into t.ids select 'dp1', public.create_budget_version(2028, 'pergeseran')$q$, 'versi pergeseran I 2028');
select t.lives($q$insert into t.ids select 'dp2', public.create_budget_version(2028, 'pergeseran')$q$, 'versi pergeseran II 2028');
select t.lives($q$insert into t.ids select 'du',  public.create_budget_version(2028, 'perubahan')$q$, 'versi perubahan 2028');

-- pengisian pertama (tanpa alasan) dan validasi
select t.lives($q$select public.set_budget_version_dpa_date(t.id('dm'),  date '2028-01-02')$q$, 'tanggal DPA murni diisi tanpa alasan (pertama kali)');
select t.lives($q$select public.set_budget_version_dpa_date(t.id('dp1'), date '2028-03-16')$q$, 'tanggal DPA pergeseran I diisi');
select t.throws($q$select public.set_budget_version_dpa_date(t.id('dp2'), date '2028-03-16')$q$, 'pergeseran II tidak boleh sama dengan pergeseran I');
select t.throws($q$select public.set_budget_version_dpa_date(t.id('dp2'), date '2028-02-01')$q$, 'pergeseran II tidak boleh sebelum pergeseran I');
select t.lives($q$select public.set_budget_version_dpa_date(t.id('dp2'), date '2028-06-10')$q$, 'pergeseran II setelah pergeseran I diterima');
select t.throws($q$select public.set_budget_version_dpa_date(t.id('dp1'), date '2028-07-01')$q$, 'pergeseran I tidak boleh melewati pergeseran II');
select t.lives($q$select public.set_budget_version_dpa_date(t.id('du'),  date '2028-10-26')$q$, 'tanggal DPA perubahan diisi');
select t.throws($q$select public.set_budget_version_dpa_date(t.id('du'), date '2029-01-05', 'salah tahun')$q$, 'tanggal di luar tahun anggaran ditolak');
select t.throws($q$select public.set_budget_version_dpa_date(t.id('du'), null)$q$, 'tanggal kosong ditolak');

-- koreksi wajib beralasan, dan tercatat di audit
select t.throws($q$select public.set_budget_version_dpa_date(t.id('du'), date '2028-10-20')$q$, 'koreksi tanpa alasan ditolak');
select t.throws($q$select public.set_budget_version_dpa_date(t.id('du'), date '2028-10-20', '   ')$q$, 'koreksi dengan alasan kosong ditolak');
select t.lives($q$select public.set_budget_version_dpa_date(t.id('du'), date '2028-10-20', 'Salah ketik tanggal pada DPA')$q$, 'koreksi dengan alasan diterima');
select t.ok((select dpa_date from public.budget_versions where id = t.id('du')) = date '2028-10-20', 'tanggal DPA berubah setelah koreksi');
select t.ok((select dpa_note from public.budget_versions where id = t.id('du')) = 'Salah ketik tanggal pada DPA', 'alasan koreksi tersimpan');
select t.as_super();
select t.ok((select count(*) from public.audit_logs where table_name = 'budget_versions' and record_id = t.id('du')::text and action = 'UPDATE'
              and old_data->>'dpa_date' = '2028-10-26' and new_data->>'dpa_date' = '2028-10-20') = 1, 'koreksi tanggal DPA tercatat di audit (nilai lama & baru)');
select t.as_user(:'admin');

-- versi final: hanya pejabat finalisasi + alasan
select t.lives($q$select public.set_budget_version_status(t.id('dm'), 'active')$q$, 'murni -> active');
select t.lives($q$select public.set_budget_version_status(t.id('dm'), 'final')$q$, 'murni -> final');
select t.lives($q$select public.set_budget_version_dpa_date(t.id('dm'), date '2028-01-03', 'DPA ditetapkan sehari setelahnya')$q$, 'pejabat finalisasi dapat mengoreksi tanggal DPA versi final dengan alasan');
select t.ok((select status from public.budget_versions where id = t.id('dm')) = 'final', 'status versi tetap final setelah koreksi tanggal');

-- hak akses
select t.as_user(:'pptk1');
select t.throws($q$select public.set_budget_version_dpa_date(t.id('dp1'), date '2028-03-17', 'coba')$q$, 'PPTK tidak dapat mengubah tanggal DPA');
select t.as_user(:'admin');

select t.as_super();
reset role;
select case when passed then 'PASS' else 'FAIL' end as hasil, name, case when passed then '' else coalesce(detail,'') end as detail
from t.results order by n;
select count(*) filter (where passed) as lulus, count(*) filter (where not passed) as gagal, count(*) as total from t.results;
do $$ begin
  if exists (select 1 from t.results where not passed) then
    raise exception 'Ada tes tanggal DPA yang gagal';
  end if;
end $$;
