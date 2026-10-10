# Matriks Izin SIMANJA

Legenda: **A** = diizinkan (dengan pembatasan scope/assignment), **-** = ditolak, **C** = bergantung konfigurasi alur persetujuan `[KONFIGURABLE]`.
Aksi: V=lihat, C=buat, E=ubah, S=ajukan, R=reviu, P=setujui, F=finalisasi, X=ekspor, M=administrasi.

Pembatasan umum: PPTK hanya pada budget item yang ditugaskan kepadanya; PPK hanya pada scope yang ditetapkan; PPBJ hanya pada dokumen yang ditugaskan. Semua dibatasi konteks aktif (tahun + tahapan).

| Modul | Aksi | Admin | PPK | PPTK | PPBJ |
|-------|------|:-----:|:---:|:----:|:----:|
| Dasbor | V | A (org) | A (scope) | A (assignment) | A (terbatas) |
| Dasbor | X | A | A | A | - |
| Input Anggaran | V | A | A | A (assignment) | - |
| Input Anggaran | C/E | A | - | - | - |
| Input Anggaran | F (finalisasi versi) | A | - | - | - |
| Impor Anggaran | C/E/F | A | - | - | - |
| Anggaran Kas | V | A | A | A (assignment) | - |
| Anggaran Kas | C/E | - | - | A (assignment, belum final) | - |
| Anggaran Kas | S | - | - | A | - |
| Anggaran Kas | P/F | A | C | - | - |
| Realisasi | V | A | A | A (assignment) | - |
| Realisasi | C/E | - | - | A (assignment, sebelum final) | - |
| Realisasi | S | - | - | A | - |
| Realisasi | R/P (verifikasi, SP2D) | A | C | - | - |
| Realisasi | Koreksi tanggal SP2D / batal | A (alasan wajib) | C (alasan wajib) | - | - |
| Rekapitulasi | V/X | A | A | A (assignment) | - |
| LRA | V/X | A | A | - | - |
| LRA | M (konfigurasi template) | A | - | - | - |
| Dokumen Pengadaan | V | A (metadata) | A (scope) | A (milik sendiri) | A (ditugaskan) |
| Dokumen Pengadaan | C/E (Nota Dinas PPTK, DPP) | - | - | A | - |
| Dokumen Pengadaan | C/E (Nota Dinas PPK) | - | A | - | - |
| Dokumen Pengadaan | R (reviu DPP, temuan) | - | - | - | A |
| Dokumen Pengadaan | Kembalikan | - | C | - | A |
| Dokumen Pengadaan | Terbitkan Berita Acara Reviu | - | - | - | A |
| Data Master | V | A | A | A | A |
| Data Master | C/E/nonaktifkan | A | - | - | - |
| Pengguna & Peran | M | A (tidak bisa menaikkan diri sendiri) | - | - | - |
| Log Audit | V | A (baca saja) | - | - | - |
| Pengaturan Aplikasi | M | A | - | - | - |

## Aturan khusus
1. Tidak ada peran yang dapat UPDATE/DELETE `audit_logs` dan `workflow_events`.
2. Admin tidak dapat mengubah atau menghapus transaksi final; koreksi memakai transisi status bertanda alasan.
3. Admin tidak dapat mengubah `user_roles` miliknya sendiri (dicegah trigger).
4. PPBJ tidak memiliki izin tulis pada anggaran dan realisasi.
5. Izin tersimpan di tabel `permissions` dan `role_permissions`; fungsi `app.has_permission(kode)` dipakai oleh RLS dan service layer.
