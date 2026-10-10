# Laporan Phase 1

## Fitur selesai
Arsitektur & dokumen (ERD, matriks izin) · login username server-mediated + throttling + audit · konteks anggaran (tahun+tahapan) tervalidasi server · RBAC 4 peran + scope penugasan · skema 4 migrasi dengan RLS deny-by-default · dasbor KPI nyata · shell UI (sidebar collapsible, drawer mobile, Bahasa Indonesia, Rupiah, WIB) · CI GitHub Actions · dokumentasi deployment/backup/keamanan.

## Migrasi
`0001_core_identity` · `0002_budget_realization_documents` · `0003_rls_and_functions` · `0004_dashboard_kpis`

## Hasil verifikasi (dijalankan di lingkungan pengembangan)
| Pemeriksaan | Hasil |
|---|---|
| `tsc --noEmit`, `next lint`, `next build` | lulus |
| Tes unit (vitest) | 46/46 |
| Tes database RLS/otorisasi/integritas (Postgres 16 + shim Supabase) | 112/112 |
| Konkurensi (2 sesi bersamaan, pagu 500rb, bayar 300rb ×2) | tepat 1 berhasil |
| E2E asap Playwright (desktop + ponsel) | 22/22 |
| Pindai bundel klien untuk rahasia/email internal | 0 temuan |

## Yang BELUM diverifikasi (jujur)
- Belum dijalankan terhadap proyek Supabase/GoTrue sungguhan: alur login→ganti sandi→pilih konteks→dasbor via UI belum diuji end-to-end; yang diuji adalah logika (unit), RLS/SQL (shim `auth.uid()`), dan gerbang/tampilan (e2e asap). Uji ini wajib dilakukan pada proyek *staging* sebelum dipakai.
- Shim Supabase meniru `auth.uid()` dan peran; perilaku PostgREST (mis. hak default skema) harus dikonfirmasi saat `supabase db push`.
- Tidak ada deployment ke Supabase/Vercel. Tidak ada klaim siap produksi.

## Asumsi (lihat juga docs/architecture.md)
Satu OPD (`organization_id` tetap ada) · realisasi sah = status realisasi + SP2D bertanggal · izin PPK untuk verifikasi SP2D/finalisasi kas **tidak diberikan default** (menunggu alur persetujuan resmi; Admin yang memegangnya, bisa diubah di `role_permissions`) · blokir melebihi pagu aktif default, dapat dimatikan lewat setting.

## Masalah/keterbatasan terbuka
1. MFA belum ditegakkan; UI reset kata sandi oleh admin belum ada (Phase 2, sementara via skrip/dasbor Supabase).
2. CSP masih `'unsafe-inline'`.
3. Penugasan PPTK/PPK/PPBJ dan pembuatan tahun/versi anggaran masih lewat skrip/SQL sampai modul Master/Anggaran (Phase 2).
4. Kebijakan Storage dan validasi isi unggahan menunggu modul unggah.
5. Tabel Phase 3-7 sudah ada strukturnya, namun logika bisnis/antarmukanya belum.

## Perlu dari OPD sebelum fase berikutnya
Format resmi LRA & pemetaan rekening · template Nota Dinas PPTK/PPK, DPP, Berita Acara Reviu · matriks persetujuan (siapa memverifikasi SP2D, memfinalkan kas) · dokumen pendukung wajib · kebijakan retensi.

## Langkah berikutnya: Phase 2
Master data, tahun/tahapan/versi anggaran, input manual & impor Excel/PDF (pratinjau, pemetaan kolom, deteksi duplikat), manajemen pengguna oleh Admin (termasuk reset sandi), tampilan log audit.
