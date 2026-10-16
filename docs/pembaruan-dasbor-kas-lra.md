# Pembaruan: Anggaran Kas ringkas, LRA khusus Admin, Dasbor baru

## 1. Anggaran Kas (akun selain Admin)
- Semua butir tampil dalam **satu tabel** (sub kegiatan sebagai pengelompok, 12 bulan per baris) dengan hitung langsung: total kas, sisa, dan penanda merah bila melebihi pagu / isian tidak valid.
- Pengisian cepat: Tab/Enter berpindah sel, **tempel blok dari Excel** (Ctrl+V; format 1.234.567,89 maupun 1,234,567.89), tombol **÷12** dan **÷TW** per baris, serta *Bagi rata (yang kosong)* untuk banyak baris sekaligus. Pencarian dan penyaring (perlu diisi / belum disimpan / terkunci).
- **Simpan draf** dan **Simpan & ajukan** bekerja untuk semua butir sekaligus (`saveCashPlansBulkAction`). Setiap butir tetap lewat `save_cash_plan` / `set_cash_plan_status` (hak PPTK penugasan; total kas ≤ pagu diperiksa di database). Tidak atomik antarbutir: yang gagal dilaporkan beserta alasannya, yang berhasil tetap tersimpan.
- Admin tetap memakai tampilan kartu yang lama. Impor Excel/CSV, ekspor, dan cetak tidak berubah. Finalisasi/Kembalikan (bagi pemegang `cashplan.finalize`) tersedia di kolom aksi tabel.

## 2. LRA hanya Admin
Menu dan halaman `/lra` serta `/lra/export` hanya untuk akun berperan **admin** (izin `lra.view` saja tidak cukup). Dilakukan di lapisan aplikasi (`canSeeNav`, `requireAdminModule`); tidak ada perubahan izin di database.

## 3. Dasbor (semua akun)
- Tata letak baru berwarna per kategori: hero + cincin capaian, ubin KPI, donat komposisi, grafik target kas vs realisasi per triwulan, ubin indikator sekunder, pintasan modul.
- **Peringkat penyedia** menurut nominal transaksi, tertinggi → terendah (periode terpisah; bawaan: seluruh tahun).
- **Peringkat realisasi & capaian (%)** per **PPTK, Kegiatan, dan Sub Kegiatan** sekaligus, untuk **bulanan, triwulanan, seluruh tahun, atau rentang tanggal**; dapat diurutkan menurut capaian (%) atau nominal realisasi periode.
  - Bulanan/triwulanan: menurut tanggal SP2D (realisasi sah); capaian = realisasi kumulatif s.d. akhir periode ÷ pagu.
  - Rentang tanggal: transaksi dihitung bila **tanggal transaksi ≥ tanggal awal** dan **tanggal SP2D ≤ tanggal akhir**.
- Seluruh angka dibatasi RLS akun yang login (PPTK melihat butirnya; PPBJ tanpa izin anggaran melihat nol), sama seperti KPI yang sudah ada.

## Berkas migrasi
`supabase/migrations/0012_tanggal_transaksi_dan_penyedia.sql` (aditif, aman diulang).
