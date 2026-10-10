# SIMASPRAJA - Arsitektur, Relasi Database, dan Rencana Implementasi

Status: **Draf Phase 1**. Aturan bisnis yang belum dikonfirmasi OPD ditandai `[KONFIGURABLE]`.

## 1. Asumsi

| # | Asumsi | Dampak |
|---|--------|--------|
| A1 | Satu OPD (Bagian Perekonomian dan SDA). Kolom `organization_id` tetap ada di tabel inti. | RLS memakai scope organisasi; ekspansi multi-OPD tidak butuh migrasi ulang struktur. |
| A2 | Repositori baru, tanpa kode lama. | Skema dirancang dari nol. |
| A3 | Realisasi sah = transaksi berstatus `realisasi` yang memiliki tanggal SP2D valid. Kontrak (komitmen) dan realisasi dicatat terpisah. | Mencegah double counting. |
| A4 | Format resmi LRA, Nota Dinas, DPP, Berita Acara Reviu, matriks persetujuan belum ada. | Disimpan sebagai konfigurasi (`document_templates`, `application_settings`). |
| A5 | Tidak ada klaim tanda tangan elektronik tersertifikasi. | Persetujuan internal diberi label "persetujuan internal". |

## 2. Arsitektur Sistem

```
Browser (Next.js App Router, RSC + Server Actions)
   |  cookie sesi HTTP-only (Supabase SSR)
   v
Next.js server (Vercel)
   |- Server Actions / Route Handlers: validasi zod, cek izin, rate limit
   |- Klien Supabase "user" (anon key + JWT pengguna)  -> tunduk pada RLS
   |- Klien Supabase "admin" (service role, HANYA server) -> login username, manajemen akun
   v
Supabase: Postgres (RLS deny-by-default), Auth, Storage privat, Edge Functions (impor berat, ekspor)
```

Prinsip:
1. Otorisasi berlapis: UI (hanya kenyamanan) -> service layer -> RLS.
2. Konteks anggaran (tahun + tahapan) disimpan di cookie bertanda tangan, divalidasi ulang di server pada setiap operasi terproteksi, dan diteruskan ke database lewat fungsi `app.assert_context()`.
3. Semua uang bertipe `numeric(18,2)`.
4. Data keuangan final tidak bisa di-UPDATE/DELETE biasa; koreksi lewat transisi berstatus dan log.

### Login berbasis username
1. Pengguna mengirim username + password ke Server Action.
2. Server (rate limit per IP + per username) mencari `profiles.username` memakai klien admin.
3. Email internal (`<uuid>@auth.simaspraja.invalid`) tidak pernah dikirim ke browser.
4. Server memanggil `signInWithPassword` dengan email internal; hasil sesi disimpan ke cookie HTTP-only.
5. Semua kegagalan mengembalikan pesan generik yang sama dengan waktu respons relatif seragam.
6. Percobaan dicatat di `auth_attempts` dan `audit_logs`.

## 3. Relasi Database (ERD ringkas)

```
organizations 1--* profiles 1--* user_roles *--1 roles 1--* role_permissions *--1 permissions
profiles 1--* user_scopes (assignment: program/kegiatan/sub_kegiatan/budget_item)

fiscal_years 1--* budget_versions *--1 budget_stages     (Murni | Pergeseran | Perubahan)
programs 1--* activities 1--* sub_activities
budget_versions 1--* budget_item_versions *--1 budget_items
budget_items *--1 sub_activities, expenditure_accounts, funding_sources, profiles(pptk)

budget_item_versions 1--* cash_budget_plans 1--* cash_budget_periods (Q1..Q4 / bulan)
budget_items 1--* procurement_packages *--1 rup_references
procurement_packages 1--* procurement_contracts            (KOMITMEN, bukan realisasi)
budget_items 1--* realization_transactions 1--* payment_records 1--1 sp2d_records
realization_transactions 1--* transaction_attachments, workflow_events

procurement_documents 1--* document_revisions 1--* document_reviews 1--* review_findings
document_reviews 1--1 review_minutes (Berita Acara Reviu)

import_batches 1--* import_rows
audit_logs (append-only), workflow_events (append-only)
```

### Definisi finansial (satu sumber kebenaran)

| Konsep | Tabel | Catatan |
|--------|-------|---------|
| Pagu (alokasi) | `budget_item_versions.pagu` | Snapshot per versi; tidak ditimpa. |
| Komitmen | `procurement_contracts.contract_value` | Tidak masuk realisasi. |
| Pengeluaran diajukan | `payment_records.amount` | Menunggu SP2D bila belum ada tanggal SP2D. |
| Realisasi sah | view `v_eligible_realization` | `status='realisasi'` AND `sp2d_date IS NOT NULL` AND tidak dibatalkan. |
| Sisa anggaran | `pagu - SUM(eligible)` | Dihitung di view `v_budget_balance`. |

## 4. Matriks Izin
Lihat `docs/permission-matrix.md`. Matriks tersimpan di tabel `role_permissions` (seed) sehingga dapat diubah admin tanpa deploy ulang.

## 5. Rencana Implementasi

| Fase | Isi | Status |
|------|-----|--------|
| 1 | Arsitektur, design system, auth username, skema inti, RBAC, RLS, audit | **Dikerjakan di paket ini** |
| 2 | Master data, tahun/tahapan, input & impor anggaran | Berikutnya |
| 3 | Anggaran kas, versi anggaran | |
| 4 | Transaksi realisasi, kontrak, pembayaran, SP2D | |
| 5 | Dashboard, rekapitulasi, rekonsiliasi | |
| 6 | Kerangka LRA konfigurabel | |
| 7 | Nota Dinas, DPP, reviu PPBJ, Berita Acara Reviu | |
| 8 | Tes menyeluruh, tinjauan keamanan, performa, deployment | |

### Cakupan skema Phase 1
Phase 1 membuat tabel fondasi dan **kerangka** tabel fase berikutnya yang sudah memengaruhi RLS (budget, realisasi, dokumen) agar kebijakan akses konsisten sejak awal. Logika bisnis tabel-tabel tersebut diimplementasikan pada fasenya masing-masing.

## 6. Pertanyaan Terbuka untuk OPD
1. Format resmi LRA dan pemetaan rekening.
2. Template Nota Dinas PPTK/PPK, DPP, Berita Acara Reviu.
3. Urutan persetujuan yang berlaku dan dokumen pendukung wajib.
4. Aturan toleransi realisasi melebihi pagu (blokir atau peringatan).
5. Kebijakan MFA dan retensi data.
