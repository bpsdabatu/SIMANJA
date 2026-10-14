# Laporan Realisasi Anggaran (LRA)

Format mengikuti contoh LRA SKPD (SIANGGARAN, `LRA_TA_2026.pdf`). Satu baris = satu butir anggaran (rekening + sumber dana).

| Kolom | Rumus |
|---|---|
| Pagu (tahapan aktif) | `budget_item_versions.pagu` pada versi konteks (Murni/Pergeseran/Perubahan yang dipilih saat login) |
| Pagu Rincian Murni/Pergeseran/Perubahan | Pagu butir pada versi non-draf terbaru tiap tahapan (OPD + tahun yang sama); 0 bila butir tidak ada di tahapan itu |
| Bln Lalu | Realisasi sah dengan tanggal SP2D **sebelum** tanggal 1 bulan dari tanggal batas |
| Bln Ini | Realisasi sah dengan tanggal SP2D tanggal 1 bulan itu **s.d. tanggal batas** (inklusif) |
| Jumlah | Bln Lalu + Bln Ini |
| Sisa | Pagu − Jumlah (negatif ditampilkan merah) |
| Capaian | Jumlah ÷ Pagu × 100, dari **total** (bukan rata-rata baris); pagu 0 → "-" |

Tanggal batas bawaan = hari ini (WIB); dapat diubah lewat filter "Realisasi sampai tanggal".
Realisasi sah tetap satu definisi: view `v_eligible_realization` (status `realisasi`, SP2D bertanggal, tidak di-void).

## Akurasi
- Penjumlahan dalam sen (bilangan bulat) → tidak ada galat floating-point.
- Butir dibedakan oleh rekening **dan sumber dana** (`…00052.PAD` ≠ `…00052.DBH_CHT`); tidak digabung.
- Baris = gabungan butir lintas tahapan, sehingga butir baru di Perubahan tetap tampil (pagu Pergeseran 0).
- Peringatan di layar (tidak ikut tercetak): SP2D setelah tanggal batas, realisasi tanpa butir pada snapshot pagu, sisa negatif, realisasi tanpa pagu.
- `tests/lra.test.ts` merekonsiliasi 53 baris contoh PDF: Pagu 681.989.691 · Bln Lalu 266.799.770 · Bln Ini 37.377.799 · Jumlah 304.177.569 · Sisa 377.812.122 · Capaian 44,60%.

## Penandatangan (KPA)
Diambil dari `application_settings` key `lra.kpa` (kosong → kolom tanda tangan lama dipakai). Contoh (jalankan sebagai admin, ganti `<ORG_ID>`):

```sql
insert into public.application_settings (organization_id, key, value, description)
values ('<ORG_ID>', 'lra.kpa', '{"name":"Dra. EMILYATI, M.Si","nip":"196901181990032001","title":"Kuasa Pengguna Anggaran"}', 'Penandatangan LRA')
on conflict (organization_id, key) do update set value = excluded.value;
```
