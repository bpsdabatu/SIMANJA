# Panduan Pengguna SIMASPRAJA (Phase 1)

## 1. Masuk
1. Buka alamat SIMASPRAJA, isi **Username** dan **Kata sandi** dari administrator. Ikon mata menampilkan/menyembunyikan kata sandi.
2. Pesan "Username atau kata sandi tidak sesuai" tidak menjelaskan mana yang salah; ini disengaja demi keamanan.
3. Setelah beberapa kali gagal beruntun, akses ditahan sementara (±15 menit). Bila akun terkunci atau lupa kata sandi, hubungi administrator; tidak ada pemulihan lewat email.

## 2. Ganti kata sandi pertama kali
Akun baru/di-reset wajib mengganti kata sandi: minimal 10 karakter dengan huruf besar, huruf kecil, dan angka.

## 3. Pilih konteks anggaran
Pilih **Tahun Anggaran** dan **Tahapan** (Murni, Pergeseran, Perubahan). Seluruh halaman memakai pilihan ini; ditampilkan di bilah atas ("TA 2026 · Murni"). Klik **Ganti** untuk memilih ulang. Kombinasi yang belum dibuat administrator tidak dapat dipilih. Konteks berlaku 12 jam.

## 4. Dasbor
Menampilkan Total Pagu, Realisasi, Sisa, Persentase, jumlah butir anggaran, transaksi menunggu SP2D (merah), dokumen menunggu reviu, dan komitmen kontrak.
- **Realisasi** hanya transaksi yang sudah memiliki tanggal SP2D. **Menunggu SP2D** dan **komitmen kontrak** ditampilkan terpisah dan tidak masuk realisasi.
- Angka mengikuti hak akses Anda: PPTK hanya melihat butir yang ditugaskan; PPBJ tidak melihat angka anggaran.
- Sisa anggaran negatif ditandai merah (melebihi pagu).

## 5. Peran
| Peran | Ringkas |
|---|---|
| Admin | Mengelola pengguna, master, anggaran, pengaturan; membaca audit |
| PPK | Melihat anggaran/realisasi dalam scope; memproses dokumen PPK |
| PPTK | Menyusun anggaran kas, realisasi, dan dokumen untuk butir yang ditugaskan |
| PPBJ | Mereviu DPP yang ditugaskan dan menerbitkan Berita Acara Reviu |

Menu bertanda **Fase N** belum tersedia. Panduan modul lain akan ditambahkan seiring rilis.

## Pembaruan: unggah/ekspor Excel, tahun anggaran, laporan triwulanan

### Data Master (Admin)
- **Unggah Excel/CSV**: pilih tab (Program, Kegiatan, Sub Kegiatan, Rekening Belanja, Sumber Dana, Metode, Penyedia, RUP) → *Unggah … dari Excel / CSV*. Unduh **Templat** terlebih dahulu. Urutan unggah: Program → Kegiatan → Sub Kegiatan (kode induk harus sudah ada). Format kolom kode sebagai **Teks** di Excel. Bila ada satu baris bermasalah, seluruh impor dibatalkan. Centang *Perbarui nama…* bila kode yang sudah ada ingin diperbarui; bila tidak, baris itu dilewati.
- **Tambah / Ubah / Nonaktifkan / Hapus**: Hapus hanya berhasil bila data belum dipakai data lain; jika sudah dipakai gunakan Nonaktifkan.
- **PPTK**: tab *PPTK* (khusus Admin) mengunggah daftar PPTK (username, nama_lengkap, nip, jabatan). Akun dibuat dengan kata sandi sementara acak yang tampil sekali dan dapat diunduh; wajib diganti saat masuk pertama. Ubah/tangguhkan/atur ulang sandi di *Pengguna & Peran*.
- **Unduh/Cetak**: tombol Excel, CSV, dan Cetak pada setiap tab.

### Tahun anggaran (Admin)
*Input Anggaran → Tambah tahun anggaran*: isi tahun → sistem membuat versi **Murni** berstatus draf. Aktifkan versi, lalu pilih konteks lewat tautan **Ganti** di bagian atas. Tahapan **Pergeseran/Perubahan** ditambah lewat *Buat versi baru* (dapat menyalin pagu dari versi sebelumnya).

### Input Anggaran
Referensi diambil dari Data Master; pengguna tinggal memilih dan mengisi pagu per tahun/tahapan. Tambah butir, **Ubah** (pagu, PPTK, rincian), **Hapus butir** (tidak bisa bila sudah ada transaksi), impor Excel/CSV, unduh Excel/CSV, dan cetak.

### Anggaran Kas
Disusun dari butir Input Anggaran. PPTK dapat mengisi per butir atau **unggah Excel** (templat sudah berisi butir penugasannya), **Hapus draf**, mengajukan; unduh Excel/CSV (dengan total triwulan) dan cetak.

### Laporan Triwulanan
Menu *Laporan Triwulanan*: pilih triwulan dan (opsional) PPTK → **Unduh Presentasi (PPTX)** atau **Unduh PDF**. Berisi ringkasan, grafik, tabel per Program/Kegiatan/Sub Kegiatan dan per PPTK, analisis singkat, rekomendasi, dan catatan metodologi. Realisasi = SP2D bertanggal; capaian fisik belum tercatat di sistem.

### Jam & salam
Jam digital WIB tampil di bar atas; salam tampil saat masuk dan saat kembali ke aplikasi setelah ≥ 5 menit. Seluruh tampilan memakai font Arial.

### Realisasi Belanja: menambah transaksi
1. **Admin** mengisi pagu dan menugaskan **PPTK** pada tiap butir (Input Anggaran → Ubah → PPTK).
2. **PPTK** login pada tahun/tahapan yang sama → Realisasi Belanja → *Buat transaksi baru*: pilih butir (sisa anggaran tampil di pilihan), tanggal, nilai, uraian, penyedia/metode → *Simpan sebagai draf*.
3. Di detail transaksi: tambah pembayaran bila bertahap → **Ajukan**.
4. **PPK/verifikator** mencatat nomor & tanggal **SP2D** per pembayaran → **Verifikasi**. Setelah itu nilainya dihitung sebagai realisasi (dasbor, LRA, laporan). Transaksi dapat dikembalikan atau dibatalkan dengan alasan.

### Pencarian realisasi & sisa anggaran
Kartu *Pencarian Realisasi & Sisa Anggaran* di halaman Realisasi Belanja: filter kegiatan, sub kegiatan, belanja, sumber dana, PPTK, kata kunci; menampilkan pagu, realisasi, menunggu SP2D, sisa, % dan total; unduh Excel/CSV.

### Dasbor: peringkat capaian
Kartu *Peringkat Capaian Realisasi Anggaran*: pilih peringkat menurut PPTK/Kegiatan/Sub Kegiatan dan periode (tahun, triwulan, atau bulan). Menampilkan 5 tertinggi dan 5 terendah menurut realisasi kumulatif s.d. akhir periode ÷ pagu.

### Realisasi Belanja: input transaksi yang disederhanakan
Form *Buat transaksi baru* kini 4 langkah: cari & pilih butir (atau klik **Buat transaksi** pada baris hasil pencarian) → tanggal (bawaan hari ini WIB) → nilai → uraian. Ringkasan pagu/realisasi/menunggu SP2D/**sisa tersedia** tampil langsung beserta sisa setelah transaksi. Tombol **Simpan & ajukan verifikasi** menyimpan dan mengirim sekaligus; **Simpan sebagai draf** bila masih ada pembayaran lain.
Pemeriksaan otomatis (juga di server): nilai ≤ sisa tersedia (pagu − realisasi − menunggu SP2D), tanggal pada tahun anggaran dan tidak melewati hari ini, maksimal 2 desimal, serta peringatan transaksi ganda (butir+tanggal+nilai sama) yang harus dikonfirmasi. Aturan nilai ≤ sisa juga berlaku saat menambah pembayaran.
