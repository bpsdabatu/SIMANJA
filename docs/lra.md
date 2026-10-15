# Laporan Realisasi Anggaran (LRA)

Format mengikuti contoh LRA SKPD (SIANGGARAN, `LRA_TA_2026.pdf`). Satu baris = satu butir anggaran (rekening + sumber dana).

| Kolom | Rumus |
|---|---|
| Pagu (tahapan aktif) | `budget_item_versions.pagu` pada **tahapan yang berlaku pada tanggal batas** (lihat "Tahapan menurut tanggal DPA") |
| Pagu Rincian Murni/Pergeseran/Perubahan | Pagu butir pada versi tiap tahapan (Pergeseran I/II/… bila berkali-kali); 0 bila butir tidak ada di tahapan itu. Tahapan yang DPA-nya belum berlaku pada tanggal batas ditandai `*` (rencana), seperti kolom Perubahan pada contoh PDF |
| Bln Lalu | Realisasi sah dengan tanggal SP2D **sebelum** tanggal 1 bulan dari tanggal batas |
| Bln Ini | Realisasi sah dengan tanggal SP2D tanggal 1 bulan itu **s.d. tanggal batas** (inklusif) |
| Jumlah | Bln Lalu + Bln Ini |
| Sisa | Pagu − Jumlah (negatif ditampilkan merah) |
| Capaian | Jumlah ÷ Pagu × 100, dari **total** (bukan rata-rata baris); pagu 0 → "-" |

Tanggal batas bawaan = hari ini (WIB); dapat diubah lewat filter "Realisasi sampai tanggal".
Realisasi sah tetap satu definisi: view `v_eligible_realization` (status `realisasi`, SP2D bertanggal, tidak di-void).
Karena transaksi terikat ke versi anggaran saat diinput, LRA menjumlahkan realisasi **seluruh versi pada tahun anggaran** yang sama (kumulatif), per butir.

## Tahapan menurut tanggal DPA
Tahapan berlaku ditentukan oleh **tanggal penetapan DPA** tiap versi (kolom `budget_versions.dpa_date`, migrasi `0009`), bukan oleh konteks yang dipilih.
Contoh TA 2026: Murni 2 Jan · Pergeseran I 16 Mar · Perubahan 26 Okt.

| Tanggal batas | Tahapan aktif |
|---|---|
| < 2 Jan 2026 | belum ada DPA berlaku (pagu aktif 0, ada peringatan) |
| 2 Jan – 15 Mar | Murni |
| 16 Mar – 25 Okt (termasuk 14 Okt) | Pergeseran I |
| ≥ 26 Okt | Perubahan |

- Tanggal DPA bersifat inklusif (pada hari penetapan, tahapan itu sudah berlaku). Draf tidak pernah menentukan tahapan.
- Pergeseran boleh berkali-kali: versi `pergeseran` ke-n = "Pergeseran n" (angka Romawi). Pada tahapan yang sama, tanggal versi berikutnya harus setelah versi sebelumnya.
- Tanggal DPA dapat **dikoreksi** di Input Anggaran → Versi anggaran → "Koreksi". Koreksi wajib beralasan; pada versi final hanya pemegang hak `budget.finalize`. Nilai lama dan baru tercatat di `audit_logs`; LRA langsung mengikuti tanggal yang baru.
- Tanggal harus berada pada tahun anggaran versi tersebut.
- Bila belum ada satu pun tanggal DPA, LRA memakai versi konteks yang dipilih (perilaku lama) dan menampilkan peringatan.
- Versi tanpa tanggal diabaikan dalam penentuan tahapan dan dilaporkan di layar.

**Penerapan:** jalankan migrasi `supabase/migrations/0009_dpa_date.sql`, lalu isi tanggal DPA tiap versi. Sebelum migrasi diterapkan, halaman tetap berfungsi (tahapan mengikuti konteks).

## Akurasi
- Penjumlahan dalam sen (bilangan bulat) → tidak ada galat floating-point.
- Butir dibedakan oleh rekening **dan sumber dana** (`…00052.PAD` ≠ `…00052.DBH_CHT`); tidak digabung.
- Baris = gabungan butir lintas tahapan, sehingga butir baru di Perubahan tetap tampil (pagu Pergeseran 0).
- Peringatan di layar (tidak ikut tercetak): SP2D setelah tanggal batas, realisasi tanpa butir pada snapshot pagu, sisa negatif, realisasi tanpa pagu.
- `supabase/tests/40_dpa_tests.sql` menguji validasi/koreksi/hak akses tanggal DPA; `tests/lra.test.ts` merekonsiliasi 53 baris contoh PDF: Pagu 681.989.691 · Bln Lalu 266.799.770 · Bln Ini 37.377.799 · Jumlah 304.177.569 · Sisa 377.812.122 · Capaian 44,60%.

## Penandatangan (KPA)
Diambil dari `application_settings` key `lra.kpa` (kosong → kolom tanda tangan lama dipakai). Contoh (jalankan sebagai admin, ganti `<ORG_ID>`):

```sql
insert into public.application_settings (organization_id, key, value, description)
values ('<ORG_ID>', 'lra.kpa', '{"name":"Dra. EMILYATI, M.Si","nip":"196901181990032001","title":"Kuasa Pengguna Anggaran"}', 'Penandatangan LRA')
on conflict (organization_id, key) do update set value = excluded.value;
```
