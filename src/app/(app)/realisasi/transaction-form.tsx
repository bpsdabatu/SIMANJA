"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { checkTransaction } from "@/lib/tx-rules";
import { createTransactionAction } from "./actions";

export interface TxItem { id: string; subCode: string; subName: string; accountCode: string; accountName: string; funding: string; description: string; pagu: number; realisasi: number; pending: number; available: number }
export interface Recent { itemId: string; date: string; amount: number }
interface Opt { id: string; label: string }

const rp = (n: number) => `Rp ${new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;
const wibToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const cls = "h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-navy-600 focus:outline-none focus:ring-2 focus:ring-navy-200";

function Buttons({ blocked }: { blocked: boolean }) {
  const { pending } = useFormStatus();
  const base = "inline-flex h-11 items-center justify-center rounded-lg px-5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  return (
    <div className="flex flex-wrap gap-3">
      <button type="submit" name="intent" value="submit" disabled={pending || blocked} className={`${base} bg-navy-700 text-white hover:bg-navy-800`}>{pending ? "Menyimpan..." : "Simpan & ajukan verifikasi"}</button>
      <button type="submit" name="intent" value="draft" disabled={pending || blocked} className={`${base} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`}>Simpan sebagai draf</button>
    </div>
  );
}

/** Form transaksi ringkas: cari butir, ringkasan sisa langsung, validasi langsung (server tetap memeriksa ulang). */
export function TransactionForm({ versionId, year, items, recent, suppliers, methods, preselect }: {
  versionId: string; year: number; items: TxItem[]; recent: Recent[]; suppliers: Opt[]; methods: Opt[]; preselect: string;
}) {
  const [itemId, setItemId] = useState(items.some((i) => i.id === preselect) ? preselect : "");
  const [find, setFind] = useState("");
  const [date, setDate] = useState(wibToday);
  const [amountRaw, setAmountRaw] = useState("");
  const [confirmDup, setConfirmDup] = useState(false);

  const item = items.find((i) => i.id === itemId);
  const shown = useMemo(() => {
    const q = find.trim().toLowerCase();
    return q ? items.filter((i) => [i.subCode, i.subName, i.accountCode, i.accountName, i.funding, i.description].some((x) => x.toLowerCase().includes(q))) : items;
  }, [find, items]);
  const amount = amountRaw === "" ? NaN : Number(amountRaw.replace(",", "."));
  const duplicate = !!item && Number.isFinite(amount) && recent.some((r) => r.itemId === itemId && r.date === date && Math.round(r.amount * 100) === Math.round(amount * 100));
  const problem = item && amountRaw !== "" ? checkTransaction({ date, today: wibToday(), year, amount, available: item.available, duplicate, confirmDuplicate: confirmDup }) : null;
  const ready = !!item && amountRaw !== "" && !problem;

  return (
    <form action={createTransactionAction} className="grid gap-4 border-t border-slate-100 p-5 sm:grid-cols-2">
      <input type="hidden" name="versionId" value={versionId} />
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="confirmDuplicate" value={confirmDup ? "true" : "false"} />

      <div className="sm:col-span-2">
        <label htmlFor="tx-find" className="mb-1.5 block text-sm font-medium text-slate-800">1. Pilih butir anggaran <span className="font-normal text-slate-500">({shown.length} dari {items.length})</span></label>
        <input id="tx-find" type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Ketik kode/nama sub kegiatan, rekening, atau sumber dana…" className={cls} />
        <select aria-label="Butir anggaran" size={Math.min(6, Math.max(2, shown.length))} value={itemId} onChange={(e) => { setItemId(e.target.value); setConfirmDup(false); }} className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-1.5 text-sm text-slate-900 focus:border-navy-600 focus:outline-none focus:ring-2 focus:ring-navy-200">
          {shown.map((i) => <option key={i.id} value={i.id} className="rounded px-2 py-1.5">{i.subCode} · {i.accountCode} {i.accountName}{i.description ? ` · ${i.description}` : ""} — sisa {rp(i.available)}</option>)}
        </select>
      </div>

      {item && (
        <dl className="grid gap-x-6 gap-y-1 rounded-lg border border-navy-100 bg-navy-50/50 p-4 text-sm sm:col-span-2 sm:grid-cols-2" aria-live="polite">
          <div className="sm:col-span-2"><dt className="inline text-slate-500">Sub kegiatan: </dt><dd className="inline font-medium">{item.subCode} {item.subName}</dd></div>
          <div className="sm:col-span-2"><dt className="inline text-slate-500">Rekening: </dt><dd className="inline font-medium">{item.accountCode} {item.accountName}</dd></div>
          <div><dt className="inline text-slate-500">Sumber dana: </dt><dd className="inline font-medium">{item.funding || "—"}</dd></div>
          <div><dt className="inline text-slate-500">Pagu: </dt><dd className="inline font-medium tabular-nums">{rp(item.pagu)}</dd></div>
          <div><dt className="inline text-slate-500">Realisasi sah: </dt><dd className="inline font-medium tabular-nums">{rp(item.realisasi)}</dd></div>
          <div><dt className="inline text-slate-500">Menunggu SP2D: </dt><dd className="inline font-medium tabular-nums">{rp(item.pending)}</dd></div>
          <div className="sm:col-span-2"><dt className="inline font-semibold text-navy-900">Sisa tersedia: </dt><dd className="inline text-base font-bold tabular-nums text-navy-900">{rp(item.available)}</dd>
            {Number.isFinite(amount) && amount > 0 && <span className={`ml-2 text-xs ${amount > item.available ? "text-red-700" : "text-slate-600"}`}>→ setelah transaksi ini: {rp(item.available - amount)}</span>}</div>
        </dl>
      )}

      <div>
        <label htmlFor="tx-date" className="mb-1.5 block text-sm font-medium text-slate-800">2. Tanggal transaksi</label>
        <input id="tx-date" name="date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} min={`${year}-01-01`} max={wibToday()} className={cls} />
      </div>
      <div>
        <label htmlFor="tx-amount" className="mb-1.5 block text-sm font-medium text-slate-800">3. Nilai pembayaran (Rp)</label>
        <input id="tx-amount" name="amount" type="number" min={0.01} step="0.01" required inputMode="decimal" value={amountRaw} onChange={(e) => setAmountRaw(e.target.value)} className={cls} />
        <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-slate-600">
          {Number.isFinite(amount) && amount > 0 && <span>{rp(amount)}</span>}
          {item && item.available > 0 && <button type="button" onClick={() => setAmountRaw(String(item.available))} className="font-medium text-navy-700 underline hover:text-navy-900">Isi seluruh sisa ({rp(item.available)})</button>}
        </div>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="tx-desc" className="mb-1.5 block text-sm font-medium text-slate-800">4. Uraian</label>
        <input id="tx-desc" name="description" required maxLength={500} defaultValue="" className={cls} />
      </div>
      <div>
        <label htmlFor="tx-sup" className="mb-1.5 block text-sm font-medium text-slate-800">Penyedia <span className="font-normal text-slate-500">(opsional)</span></label>
        <select id="tx-sup" name="supplier" defaultValue="" className={cls}><option value="">— Tanpa penyedia —</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
      </div>
      <div>
        <label htmlFor="tx-met" className="mb-1.5 block text-sm font-medium text-slate-800">Metode pengadaan <span className="font-normal text-slate-500">(opsional)</span></label>
        <select id="tx-met" name="method" defaultValue="" className={cls}><option value="">— Tidak ada —</option>{methods.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
      </div>

      {duplicate && (
        <label className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 sm:col-span-2">
          <input type="checkbox" checked={confirmDup} onChange={(e) => setConfirmDup(e.target.checked)} className="mt-0.5 h-4 w-4" />
          Sudah ada transaksi dengan butir, tanggal, dan nilai yang sama. Centang bila ini memang transaksi terpisah (bukan input ganda).
        </label>
      )}
      {problem && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800 sm:col-span-2">{problem}</p>}
      {!item && <p className="text-sm text-slate-600 sm:col-span-2">Pilih satu butir anggaran pada daftar di atas untuk melanjutkan.</p>}

      <div className="sm:col-span-2">
        <Buttons blocked={!ready} />
        <p className="mt-2 text-xs text-slate-500">&ldquo;Simpan &amp; ajukan&rdquo; langsung mengirim ke verifikator. Gunakan &ldquo;draf&rdquo; bila masih perlu menambah pembayaran. Nilai baru dihitung sebagai realisasi setelah SP2D bertanggal dan verifikasi. Server memeriksa ulang seluruh aturan di atas.</p>
      </div>
    </form>
  );
}
