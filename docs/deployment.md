# Deployment, Backup, dan Rollback

> Dokumen ini adalah **prosedur**; belum ada deployment yang dijalankan atau diverifikasi pada Phase 1.

## 1. Supabase
1. Buat proyek (region terdekat, mis. Singapore). Simpan password database di pengelola rahasia.
2. **Authentication → Providers → Email**: matikan *Allow new users to sign up*, matikan *Confirm email* (email internal sintetis). *Minimum password length* 10 dan syarat huruf besar/kecil/angka. Atur *Site URL* ke domain Vercel dan tambahkan *Redirect URLs* (preview + produksi).
3. Terapkan migrasi: `supabase link --project-ref <ref>` lalu `supabase db push`. **Jangan** menjalankan `seed.sql` di produksi.
4. **Storage**: bucket privat `transaction-attachments` dan `imports` (lihat `config.toml`); tidak ada akses publik. Kebijakan storage ditambahkan pada Phase 2/4 bersama modul unggah.
5. **Project Settings → API**: salin URL, anon key, dan service role key. Pastikan skema terekspos hanya `public` (skema `app` tidak diekspos).
6. Buat admin pertama dari mesin administrator: `BOOTSTRAP_PASSWORD=... npm run user:create -- --username ... --role admin --org-code ... --org-name "..."`.
7. Buat `fiscal_years` dan `budget_versions` (status `active`) agar konteks anggaran tersedia (modul antarmukanya Phase 2).

## 2. GitHub → Vercel
1. Push repositori ke GitHub; aktifkan branch protection pada `main` dengan syarat CI hijau (`app`, `database`, `e2e`).
2. Impor ke Vercel (framework Next.js). Set environment variables per lingkungan:
   - Production/Preview: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publik); `SUPABASE_SERVICE_ROLE_KEY`, `APP_SECRET` (**Sensitive**, bukan `NEXT_PUBLIC_`).
   - Gunakan proyek Supabase **terpisah** untuk Preview agar data produksi tidak tersentuh; `APP_SECRET` berbeda per lingkungan.
3. Deploy Preview → jalankan checklist `docs/security-checklist.md` dan uji alur login nyata (lihat §5).
4. Promosikan ke Production hanya setelah validasi. Verifikasi: login, pilih konteks, dasbor, header keamanan (`curl -I`), dan log audit LOGIN_SUCCESS tercatat.

## 3. Rollback
- **Aplikasi**: Vercel → Deployments → *Promote to Production* pada rilis stabil sebelumnya (instan, tanpa build ulang).
- **Database**: migrasi bersifat maju (forward-only). Sebelum `db push` produksi, ambil backup (§4). Bila migrasi bermasalah: pulihkan dari backup/PITR, atau buat migrasi korektif baru; jangan mengedit migrasi yang sudah diterapkan.
- Urutan aman: migrasi yang kompatibel mundur (tambah kolom/tabel) dahulu → deploy aplikasi → migrasi pembersihan pada rilis berikutnya.

## 4. Backup & pemulihan
- Plan berbayar Supabase: aktifkan **PITR** dan backup harian otomatis. Plan gratis: tidak ada PITR, jadi jadwalkan dump:
  `pg_dump "$DATABASE_URL" --format=custom --no-owner --file=simanja-$(date +%F).dump` (simpan terenkripsi di luar Supabase).
- Uji pemulihan berkala ke proyek kosong: `pg_restore --no-owner --dbname "$TARGET_URL" simanja-YYYY-MM-DD.dump`, lalu `npm run test:db` tidak berlaku pada data nyata; verifikasi manual jumlah baris dan rekonsiliasi KPI.
- File Storage tidak termasuk dump database; cadangkan bucket secara terpisah.
- Retensi: audit_logs dan transaksi keuangan **tidak dihapus**; tetapkan kebijakan arsip setelah ketentuan retensi OPD dikonfirmasi `[KONFIGURABLE]`.

## 5. E2E dengan Supabase nyata
Tes `npm run test:e2e` saat ini hanya asap (tanpa Supabase). Untuk alur penuh pada proyek *staging*: buat 4 pengguna uji (satu per peran), set variabel `E2E_*` dan tambahkan spesifikasi login → konteks → dasbor. Ini belum ditulis pada Phase 1.

## 6. Perilaku IP & throttling
Throttling memakai `x-forwarded-for` (diisi Vercel). Bila di belakang proxy lain, pastikan header ini tidak dapat dipalsukan klien.
