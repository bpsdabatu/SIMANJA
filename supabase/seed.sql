-- =====================================================================
-- seed.sql - DATA PENGEMBANGAN SAJA. JANGAN dijalankan di produksi.
-- Hanya membuat organisasi dev, tahun anggaran, dan master contoh.
-- TIDAK membuat pengguna/kata sandi: gunakan `npm run user:create`.
-- Kode program/kegiatan/rekening di bawah adalah CONTOH FIKTIF untuk uji, bukan klasifikasi resmi.
-- =====================================================================
insert into public.organizations (id, code, name)
values ('00000000-0000-0000-0000-0000000d0001', 'DEV-OPD', 'OPD Pengembangan (contoh)')
on conflict (code) do nothing;

insert into public.fiscal_years (id, organization_id, year)
values ('00000000-0000-0000-0000-0000000f0001', '00000000-0000-0000-0000-0000000d0001', 2026)
on conflict do nothing;

insert into public.budget_versions (id, organization_id, fiscal_year_id, stage_code, version_no, status, note)
values ('00000000-0000-0000-0000-0000000b0001', '00000000-0000-0000-0000-0000000d0001',
        '00000000-0000-0000-0000-0000000f0001', 'murni', 1, 'active', 'Versi murni contoh (dev)')
on conflict do nothing;

insert into public.programs (id, organization_id, code, name) values
  ('00000000-0000-0000-0000-00000000dd01', '00000000-0000-0000-0000-0000000d0001', 'P-01', 'Program Contoh Satu')
on conflict do nothing;
insert into public.activities (id, organization_id, program_id, code, name) values
  ('00000000-0000-0000-0000-00000000dd02', '00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-00000000dd01', 'P-01.K-01', 'Kegiatan Contoh Satu')
on conflict do nothing;
insert into public.sub_activities (id, organization_id, activity_id, code, name) values
  ('00000000-0000-0000-0000-00000000dd03', '00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-00000000dd02', 'P-01.K-01.S-01', 'Sub Kegiatan Contoh Satu')
on conflict do nothing;

insert into public.expenditure_accounts (id, organization_id, code, name) values
  ('00000000-0000-0000-0000-00000000de01', '00000000-0000-0000-0000-0000000d0001', 'R-5.1.02', 'Belanja Barang dan Jasa (contoh)')
on conflict do nothing;
insert into public.funding_sources (id, organization_id, code, name) values
  ('00000000-0000-0000-0000-00000000df01', '00000000-0000-0000-0000-0000000d0001', 'SD-01', 'Sumber Dana Contoh')
on conflict do nothing;
insert into public.procurement_methods (organization_id, code, name) values
  ('00000000-0000-0000-0000-0000000d0001', 'MTD-01', 'Metode Contoh')
on conflict do nothing;
