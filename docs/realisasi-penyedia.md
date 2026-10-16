# Realisasi Belanja — Penyedia manual & Metode Pengadaan

**Penyedia.** Pada form "Buat transaksi baru", pilih penyedia dari daftar Data Master, atau klik **"Penyedia belum ada? Tambah manual"** lalu isi nama (wajib) dan alamat (opsional). NPWP tidak lagi diisi (kolom lama tetap ada di database, tidak ditampilkan).
- Penyedia baru otomatis tersimpan di **Data Master → Penyedia** dan muncul pada transaksi berikutnya.
- Nama dibandingkan tanpa membedakan huruf besar/kecil dan spasi ganda: bila sudah ada, penyedia yang ada dipakai ulang (tidak dibuat ganda). Form juga menampilkan penyedia yang sama/mirip agar dipilih dari daftar.
- Penyedia yang sudah ada tetapi nonaktif tidak diaktifkan diam-diam; pengguna diminta meminta pengelola Data Master mengaktifkannya.
- PPTK tidak memiliki hak `master.manage`, karena itu penambahan lewat fungsi `create_supplier_for_realization` (migrasi `0010`) yang hanya memeriksa `realization.edit` dan terbatas pada organisasi pemanggil. Penambahan tercatat di audit.

**Metode pengadaan.** Pilihannya diambil dari **Data Master → Metode Pengadaan** (yang aktif), `kode — nama`. Tambah/ubah metode di tab tersebut; pengguna dengan hak `master.manage` mendapat tautan "Kelola metode" di bawah pilihan.

**Penerapan:** jalankan `supabase/migrations/0010_realization_supplier.sql`.

## Pembaruan 0012 — tanggal transaksi, kelola penyedia

- **Tanggal transaksi** kini terpisah dari **tanggal SP2D** pada form Input Realisasi. Aturan: keduanya pada tahun anggaran, tanggal transaksi ≤ tanggal SP2D, tanggal SP2D ≤ hari ini (WIB). Realisasi sah tetap dihitung menurut tanggal SP2D. Fungsi baru `record_realization_v2`; `record_realization` lama dibiarkan.
- **Koreksi Admin** (halaman detail transaksi) mengubah kedua tanggal sekaligus lewat `correct_realization_dates` dengan alasan tercatat.
- **Kelola penyedia** (menu Input Realisasi → *Kelola penyedia*, `/realisasi/penyedia`): tambah, ubah (nama + alamat), dan hapus. Hapus ditolak bila penyedia sudah dipakai transaksi (gunakan ubah nama, atau Admin menonaktifkan di Data Master). Fungsi: `update_supplier_for_realization`, `delete_supplier_for_realization` (hak `realization.edit`, terbatas organisasi pemanggil).
- Data Master → Penyedia dan templat impor/ekspor tidak lagi memuat NPWP.

**Penerapan:** jalankan `supabase/migrations/0012_tanggal_transaksi_dan_penyedia.sql`.
