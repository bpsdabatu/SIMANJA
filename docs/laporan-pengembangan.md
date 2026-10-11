# Laporan Pengembangan SIMASPRAJA

**Nama sistem:** SIMASPRAJA — Sistem Informasi Monitoring dan Evaluasi Perencanaan, Realisasi Anggaran dan Kinerja
**Alamat target:** https://simaspraja.vercel.app (sebelumnya simanja-blue.vercel.app)

## 1. Permintaan dan status
| No | Permintaan | Status |
|----|-----------|--------|
| 1 | Ganti nama aplikasi menjadi SIMASPRAJA dan alamat menjadi simaspraja.vercel.app | Kode, dokumen, paket, cookie, metadata sudah diganti. Perubahan nama proyek/domain di Vercel dilakukan manual (docs/deployment.md §2a). |
| 2 | Layout modern, profesional, elegan, tampilan seperti website | Beranda publik, halaman masuk dua panel, sidebar bergrup, header konteks, kartu dan tabel baru. |
| 3 | Login: username, kata sandi, tahun anggaran, tahapan anggaran, fitur keamanan | Selesai. Fitur keamanan: kode CAPTCHA sekali pakai (HMAC + nonce di database), batas percobaan per akun/IP, indikator Caps Lock, tampil/sembunyi kata sandi. |
| 4 | Kombinasi warna dan font | Biru dan emas dari logo; Montserrat (judul, sesuai logo) dan Inter (isi), di-host sendiri. |
| 5 | Semua menu berfungsi | 10 menu aktif dengan halaman dan aksi nyata (lihat §3). |
| 6 | Logo | Dipasang di beranda, login, sidebar, kop cetak, favicon, dan gambar berbagi. |
| 7 | Dokumen/berkas menyusul | Templat dokumen pengadaan memakai bidang sementara (`src/lib/documents.ts`); mudah disesuaikan. |
| 8 | Laporan siap unduh/cetak | Rekapitulasi dan LRA: unduh CSV, cetak/simpan PDF (kop, tanda tangan, A4 lanskap). Log audit: CSV. |

## 2. Alur login
Username -> kata sandi -> tahun anggaran -> tahapan -> kode keamanan. Urutan pemeriksaan: bentuk input, kode keamanan (dihabiskan),
throttling, kata sandi, lalu konteks (tahun + tahapan) divalidasi ke database. Bila konteks tidak tersedia untuk akun tersebut,
sesi langsung ditutup dan pesan yang jelas ditampilkan. Pilihan tahun dibuat dari tahun berjalan (−2 s.d. +1) agar daftar
tahun data tidak terbuka bagi pengunjung yang belum masuk.

## 3. Modul
Dasbor · Input Anggaran · Anggaran Kas · Realisasi Belanja · Rekapitulasi · LRA · Dokumen Pengadaan · Data Master · Pengguna & Peran · Log Audit.
Semua penulisan data memakai fungsi database `SECURITY INVOKER` (migrasi 0006) sehingga RLS dan pelindung yang ada tetap berlaku.

## 4. Pengujian
- Unit: 78 lulus. Database (RLS + alur kerja): 246 lulus. Typecheck dan `next build` bersih.
- Belum dilakukan: uji terhadap proyek Supabase/Vercel nyata, uji visual di browser, dan e2e Playwright penuh.

## 5. Batasan yang perlu diketahui
- Butir anggaran tidak dapat dihapus (hanya pagu diubah) pada versi yang belum final.
- Lampiran berkas (Supabase Storage) belum diimplementasikan; menunggu berkas dari instansi.
- Aturan "total anggaran kas harus sama dengan pagu" tidak dipaksakan (hanya tidak boleh melebihi pagu); sesuaikan bila diperlukan.
- Realisasi diverifikasi oleh peran dengan izin `realization.verify` (bawaan: Admin); ubah di matriks izin bila perlu.
- Kode keamanan adalah penghalang otomatisasi sederhana; bukan pengganti kata sandi kuat dan throttling.

## Perubahan: impor/ekspor Excel, CRUD terkendali, laporan triwulanan
- Migrasi **0007** (aditif): fungsi `delete_master_row`, `update_budget_item`, `delete_budget_item`, `delete_cash_plan`. Kebijakan RLS lama tidak berubah (DELETE langsung pada master tetap ditolak).
- Pustaka baru: `exceljs` (baca/tulis .xlsx), `pdfkit` (PDF), `pptxgenjs` (PPTX). `next.config.ts`: `serverExternalPackages` untuk pdfkit/exceljs.
- Modul baru: `lib/spreadsheet`, `lib/master-import`, `lib/budget-items`, `lib/quarterly-core|quarterly|quarterly-pdf|quarterly-pptx`, `lib/wib`, `components/clock-greeting`, halaman `/laporan-triwulan`.
- Font Arial menggantikan Inter/Montserrat. Menu baru memakai izin `recap.view`/`recap.export` (tanpa izin baru).
- **Belum diuji** terhadap Supabase nyata: terapkan 0007 pada staging dan jalankan `npm run test:db` sebelum produksi.
