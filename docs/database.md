# Database SIMANJA

## Definisi finansial (satu sumber kebenaran)
| Konsep | Sumber | Aturan |
|---|---|---|
| Pagu | `budget_item_versions.pagu` (snapshot per `budget_versions`) | Versi `final`/`superseded` tidak dapat diubah/dihapus (trigger). Penyesuaian = versi baru. |
| Komitmen kontrak | `procurement_contracts.contract_value` | **Tidak pernah** dihitung sebagai realisasi. |
| Pengeluaran diajukan | `payment_records.amount` | Tanpa SP2D bertanggal tampil sebagai "Menunggu SP2D". |
| SP2D | `sp2d_records` | Nomor unik per OPD+tahun (yang tidak di-void); void wajib alasan. |
| Realisasi sah | view `v_eligible_realization` | status `realisasi` + SP2D bertanggal + tidak di-void. Dipakai semua KPI/laporan. |
| Sisa anggaran | view `v_budget_balance` | pagu − realisasi sah; pagu 0 → persentase NULL; negatif ditampilkan. |

## Integritas & konkurensi
- Pembayaran memicu `app.check_pagu_on_payment`: mengunci baris pagu (`FOR UPDATE`) lalu memeriksa total; dua sesi bersamaan tidak dapat melampaui pagu (diuji di `20_concurrency.sh`). Dapat dilonggarkan lewat `application_settings` key `realization.block_over_pagu` (`{"enabled": false}`) `[KONFIGURABLE]`.
- Status `realisasi` hanya dapat dicapai bila semua pembayaran memiliki SP2D bertanggal (trigger).
- Transaksi/pembayaran/SP2D **tidak dapat dihapus**; koreksi transaksi final memerlukan `set_config('app.correction_reason', ...)` yang tercatat di `workflow_events` dan `audit_logs`.
- `audit_logs` dan `workflow_events` append-only (trigger UPDATE/DELETE/TRUNCATE, juga untuk service role).
- Uang: `numeric(18,2)`; tidak ada tipe float.

## RLS
- RLS aktif pada **semua** tabel `public`. `auth_identities` dan `auth_attempts` tanpa kebijakan (hanya service role) sehingga email internal tidak pernah terbaca browser.
- Fungsi bantu di skema `app` (tidak diekspos PostgREST): `has_permission`, `can_access_item`, `can_access_document`, dst. Semua `SECURITY DEFINER` dengan `search_path` terkunci.
- Akses butir anggaran: Admin; PPTK yang ditugaskan (`budget_items.pptk_id`); atau scope penugasan (`user_scopes`). PPBJ hanya dokumen yang ditugaskan.
- `profiles`: pengguna hanya dapat mengubah `full_name` dan `phone` sendiri (hak kolom).
- Eskalasi dicegah: tidak dapat mengubah peran/scope sendiri atau lintas organisasi (trigger).

## Konteks anggaran
`public.list_budget_contexts()` dan `public.resolve_budget_context(tahun, tahapan)` (security invoker → RLS). Cookie konteks bertanda tangan HMAC dan terikat ke pengguna; setiap permintaan terproteksi memvalidasi ulang ke RPC.

## Migrasi
`0001` identitas, peran/izin, audit · `0002` master, anggaran, kas, kontrak, realisasi, dokumen, impor · `0003` fungsi otorisasi, view, RLS, hak akses · `0004` KPI dasbor.
