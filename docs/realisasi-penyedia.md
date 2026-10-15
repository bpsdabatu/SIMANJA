# Realisasi Belanja — Penyedia manual & Metode Pengadaan

**Penyedia.** Pada form "Buat transaksi baru", pilih penyedia dari daftar Data Master, atau klik **"Penyedia belum ada? Tambah manual"** lalu isi nama (wajib), NPWP (opsional, 15/16 digit) dan alamat (opsional).
- Penyedia baru otomatis tersimpan di **Data Master → Penyedia** dan muncul pada transaksi berikutnya.
- Nama dibandingkan tanpa membedakan huruf besar/kecil dan spasi ganda: bila sudah ada, penyedia yang ada dipakai ulang (tidak dibuat ganda). Form juga menampilkan penyedia yang sama/mirip agar dipilih dari daftar.
- Penyedia yang sudah ada tetapi nonaktif tidak diaktifkan diam-diam; pengguna diminta meminta pengelola Data Master mengaktifkannya.
- PPTK tidak memiliki hak `master.manage`, karena itu penambahan lewat fungsi `create_supplier_for_realization` (migrasi `0010`) yang hanya memeriksa `realization.edit` dan terbatas pada organisasi pemanggil. Penambahan tercatat di audit.

**Metode pengadaan.** Pilihannya diambil dari **Data Master → Metode Pengadaan** (yang aktif), `kode — nama`. Tambah/ubah metode di tab tersebut; pengguna dengan hak `master.manage` mendapat tautan "Kelola metode" di bawah pilihan.

**Penerapan:** jalankan `supabase/migrations/0010_realization_supplier.sql`.
