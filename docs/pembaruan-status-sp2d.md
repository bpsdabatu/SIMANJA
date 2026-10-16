# Pembaruan: status SP2D (sudah / belum), perbaikan input realisasi, dan Dasbor

## Yang berubah
1. **Input Realisasi — pilihan Status SP2D**
   - *Sudah SP2D* → muncul isian **Tanggal SP2D**; transaksi langsung tercatat sebagai realisasi sah.
   - *Belum SP2D* → isian tanggal SP2D disembunyikan; transaksi tersimpan dengan status **Belum SP2D** dan tampil **merah** di daftar transaksi.
     Nilainya sudah memakai pagu (tidak bisa melebihi sisa anggaran) tetapi **belum dihitung** sebagai realisasi sah di LRA, Dasbor, dan Rekapitulasi (masuk "Menunggu SP2D").
   - Setelah SP2D terbit, PPTK pemilik butir (atau Admin) mengisi tanggal SP2D pada baris merah (kolom *Tgl SP2D*) atau di halaman detail transaksi → baris menjadi normal dan terhitung sebagai realisasi sah.
2. **Dasbor** — bagian *Pintasan modul* dihapus (menu sudah ada di sidebar).
3. **Perbaikan galat "Tindakan gagal diproses"** saat menyimpan realisasi: penyebab paling umum adalah fungsi basis data (`record_realization_v2`, dari migrasi 0012) belum terpasang di Supabase.
   Aplikasi kini menampilkan pesan yang jelas ("Basis data belum diperbarui…") dan mencatat rincian galat ke log server (Vercel → Logs) untuk kasus lain.

## Cara memasang
1. Supabase → **SQL Editor** → tempel seluruh isi `supabase/migrations/0013_status_sp2d_dan_perbaikan_input.sql` → **Run**.
   Berkas ini aman dijalankan berulang dan sudah mencakup fungsi dari 0012.
2. Deploy kode aplikasi (push ke GitHub → Vercel).
3. Cek cepat di SQL Editor (harus mengembalikan 2 baris):
   ```sql
   select proname from pg_proc where proname in ('record_realization_v2', 'set_realization_sp2d');
   ```

## Tes
- Basis data: `bash supabase/tests/run.sh` (tes baru: `70_sp2d_status_tests.sql`).
- Aplikasi: `npm run typecheck && npm test`.
