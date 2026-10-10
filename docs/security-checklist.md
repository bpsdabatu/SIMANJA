# Checklist Keamanan (Phase 1)

Legenda: ✅ terverifikasi oleh tes otomatis · 🔎 diverifikasi manual saat deploy · ⏳ belum (fase berikutnya)

## Autentikasi & sesi
- ✅ Login memakai username; email internal tidak pernah ke browser (`login-core.test.ts`, e2e, scan bundel di CI).
- ✅ Pesan galat identik untuk username tak dikenal / akun nonaktif / sandi salah; kasus tak dikenal tetap memanggil signIn palsu.
- ✅ Throttling per username & per IP (hash HMAC), berlaku juga untuk username yang tidak ada.
- ✅ Hanya `auth.getUser()` (bukan `getSession()`) untuk keputusan akses (tes statis).
- ✅ Akun `suspended` kehilangan seluruh akses data (tes RLS).
- 🔎 Masa berlaku sesi/JWT (`jwt_expiry` 3600, rotasi refresh token) sesuai `config.toml` di proyek produksi.
- ⏳ MFA opsional (kolom `profiles.mfa_required` siap; belum ditegakkan). Reset kata sandi oleh admin: UI di Phase 2 (sementara via skrip/dasbor Supabase).

## Otorisasi
- ✅ RLS pada semua tabel `public`; anon tidak dapat membaca apa pun; `auth_identities`/`auth_attempts` tertutup.
- ✅ Isolasi organisasi, PPTK per penugasan, PPBJ per dokumen, PPK per scope (112 tes SQL).
- ✅ Tidak ada eskalasi peran/organisasi sendiri; profil hanya `full_name`/`phone` yang dapat diubah sendiri.
- ✅ Konteks anggaran: cookie HMAC terikat pengguna + validasi ulang ke RPC tiap permintaan.
- ✅ Dilindungi di dua lapisan: service layer (`requirePermission`) dan database (RLS + trigger).

## Integritas data keuangan
- ✅ Kontrak ≠ realisasi; realisasi hanya dengan SP2D bertanggal; pembatalan menghitung ulang.
- ✅ Batas pagu aman konkurensi (dua sesi bersamaan) dan SP2D ganda ditolak.
- ✅ Audit/riwayat append-only (termasuk terhadap service role); transaksi final tidak dapat dihapus/diubah tanpa alasan tercatat.
- ✅ Versi anggaran final tidak dapat dibuka/diubah/dihapus.

## Aplikasi
- ✅ Header: CSP (`frame-ancestors 'none'`), X-Frame-Options, nosniff, Referrer-Policy, HSTS (produksi), tanpa X-Powered-By.
- ✅ Tidak ada `dangerouslySetInnerHTML`; rahasia server hanya di modul `server-only`; `.env.example` hanya placeholder.
- ✅ Server Actions Next.js memeriksa Origin (perlindungan CSRF bawaan); cookie konteks `httpOnly`, `sameSite=lax`, `secure` di produksi.
- 🔎 Pastikan `SUPABASE_SERVICE_ROLE_KEY` dan `APP_SECRET` bertanda *Sensitive* di Vercel dan berbeda antar lingkungan.
- ⏳ Validasi tipe konten unggahan berdasarkan isi (bukan ekstensi), pemindaian, URL bertanda tangan singkat: saat modul unggah (Phase 2/4).
- ⏳ Rate limiting pada endpoint sensitif selain login; pemantauan/alert log audit.

## Catatan jujur
CSP memakai `'unsafe-inline'` untuk skrip/gaya karena hidrasi Next.js; pengetatan berbasis nonce direncanakan pada Phase 8.
Throttling bergantung pada tabel database (tanpa Redis); cukup untuk skala OPD, bukan pertahanan DDoS.
