# SIMANJA - Sistem Informasi Manajemen Kinerja

Aplikasi web full-stack untuk OPD: anggaran, anggaran kas, realisasi belanja (SP2D), LRA, dan alur dokumen pengadaan.
Stack: Next.js 15 (App Router, TypeScript) · Tailwind CSS · Supabase (Postgres, Auth, Storage) · Vercel.

> **Status: Phase 1 dari 8 selesai dan teruji lokal.** Belum ada deployment ke Supabase/Vercel yang dilakukan;
> aplikasi belum boleh dianggap siap produksi. Lihat [docs/phase-1-report.md](docs/phase-1-report.md).

## Yang sudah ada (Phase 1)
- Login berbasis **username** (server-mediated), throttling, pesan galat generik, audit autentikasi.
- Pemilihan konteks **Tahun Anggaran + Tahapan** (Murni/Pergeseran/Perubahan), divalidasi ulang ke database.
- RBAC 4 peran (Admin, PPK, PPTK, PPBJ) + scope penugasan, **RLS deny-by-default** pada seluruh tabel.
- Skema lengkap 4 migrasi: master, anggaran berversi, anggaran kas, kontrak (komitmen), transaksi/pembayaran/SP2D, dokumen pengadaan, impor, audit append-only.
- Dasbor KPI nyata (dihitung di database, tunduk pada RLS).
- Tes: unit (46), database RLS/otorisasi (112), konkurensi, e2e asap (22).

Modul lain (anggaran, kas, realisasi, rekap, LRA, dokumen) ditandai "Fase N" di menu dan **belum diimplementasikan**.

## Memulai (pengembangan lokal)
Prasyarat: Node 22, Docker (untuk Supabase CLI), `psql`.

```bash
npm ci
cp .env.example .env.local          # isi nilai dari `supabase status`
supabase start                      # menerapkan migrasi + seed.sql (data contoh dev)
BOOTSTRAP_PASSWORD='GantiSegera123' npm run user:create -- \
  --username admin --name "Administrator" --role admin --org-code DEV-OPD
npm run dev                         # http://localhost:3000
```
Masuk dengan username `admin` dan kata sandi sementara; Anda akan diminta menggantinya.
Agar konteks anggaran tersedia, butuh minimal satu `budget_versions` berstatus `active` (seed dev sudah membuat 2026/Murni).

## Perintah
| Perintah | Fungsi |
|---|---|
| `npm run lint` / `npm run typecheck` | Lint dan pemeriksaan tipe |
| `npm test` | Tes unit (login, cookie konteks, format, statis keamanan) |
| `npm run test:db` | Migrasi pada Postgres bersih + tes RLS/otorisasi + konkurensi (butuh `PGHOST/PGUSER/...`) |
| `npm run test:e2e` | E2E asap Playwright (`PW_CHROMIUM_PATH` bila Chromium tidak diunduh) |
| `npm run build` | Build produksi |
| `npm run user:create` | Membuat akun (service role; dijalankan administrator) |

## Struktur
```
src/app/            halaman & server actions (login, pilih-konteks, ganti-password, (app)/dashboard)
src/lib/auth/       login-core (logika murni), context (cookie HMAC), session (otorisasi server)
src/lib/supabase/   klien user (RLS) dan admin (service role, server-only)
supabase/migrations 0001 identitas/RBAC/audit · 0002 skema keuangan & dokumen · 0003 RLS & view · 0004 KPI
supabase/tests/     shim Supabase, tes RLS (SQL), tes konkurensi
docs/               arsitektur, matriks izin, database, deployment, keamanan, panduan pengguna
```

## Variabel lingkungan
Lihat `.env.example`. **Publik:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
**Rahasia server (jangan pernah `NEXT_PUBLIC_`):** `SUPABASE_SERVICE_ROLE_KEY`, `APP_SECRET`.

## Dokumen
- [Arsitektur & rencana](docs/architecture.md) · [Matriks izin](docs/permission-matrix.md)
- [Database & definisi finansial](docs/database.md) · [Deployment & rollback](docs/deployment.md)
- [Checklist keamanan](docs/security-checklist.md) · [Panduan pengguna](docs/panduan-pengguna.md)
