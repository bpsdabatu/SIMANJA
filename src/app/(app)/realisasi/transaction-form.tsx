"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { checkTransaction } from "@/lib/tx-rules";
import { similarSuppliers } from "@/lib/supplier-input";
import { createRealizationAction } from "./actions";

export interface TxItem { id: string; subCode: string; subName: string; accountCode: string; accountName: string; funding: string; description: string; pagu: number; realisasi: number; pending: number; available: number }
export interface Recent { itemId: string; date: string; amount: number }
interface Opt { id: string; label: string }

const rp = (n: number) => `Rp ${new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;
const wibToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const cls = "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-navy-600 focus:outline-none focus:ring-2 focus:ring-navy-200";
const lbl = "mb-1 block text-sm font-medium text-slate-800";

function SaveButton({ blocked }: { blocked: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || blocked} className="inline-flex h-10 items-center justify-center rounded-lg bg-navy-700 px-6 text-sm font-semibold text-white transition-colors hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50">
      {pending ? "Menyimpan..." : "Simpan realisasi"}
    </button>
  );
}

/**
 * Form realisasi ringkas: pilih butir → tanggal SP2D → nilai → Simpan. Tanpa nomor SP2D, tanpa verifikasi:
 * tersimpan langsung sebagai realisasi. Uraian, penyedia, dan metode bersifat opsional. Server memeriksa ulang semua aturan.
 */
export function TransactionForm({ versionId, year, items, recent, suppliers, methods, preselect, defaultDate, canManageMaster = false }: {
  versionId: string; year: number; items: TxItem[]; recent: Recent[]; suppliers: Opt[]; methods: Opt[]; preselect: string; defaultDate: string; canManageMaster?: boolean;
}) {
  const today = wibToday();
  const [itemId, setItemId] = useState(items.some((i) => i.id === preselect) ? preselect : "");
  const [find, setFind] = useState("");
  const [date, setDate] = useState(/^\d{4}-\d{2}-\d{2}$/.test(defaultDate) && defaultDate <= today ? defaultDate : today);
  const [amountRaw, setAmountRaw] = useState("");
  const [confirmDup, setConfirmDup] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [newSup, setNewSup] = useState(false);
  const [supName, setSupName] = useState("");
  const amountRef = useRef<HTMLInputElement>(null);

  const item = items.find((i) => i.id === itemId);
  useEffect(() => { if (itemId) amountRef.current?.focus(); }, [itemId]);

  const shown = useMemo(() => {
    const q = find.trim().toLowerCase();
    return q ? items.filter((i) => [i.subCode, i.subName, i.accountCode, i.accountName, i.funding, i.description].some((x) => x.toLowerCase().includes(q))) : items;
  }, [find, items]);
  const amount = amountRaw === "" ? NaN : Number(amountRaw.replace(",", "."));
  const duplicate = !!item && Number.isFinite(amount) && recent.some((r) => r.itemId === itemId && r.date === date && Math.round(r.amount * 100) === Math.round(amount * 100));
  const problem = item && amountRaw !== "" ? checkTransaction({ date, today, year, amount, available: item.available, duplicate, confirmDuplicate: confirmDup }) : null;
  const dupSup = newSup ? similarSuppliers(supName, suppliers) : { exact: null, similar: [] };
  const supBlocked = newSup && supName.trim() === "";
  const ready = !!item && amountRaw !== "" && !problem && !supBlocked;

  return (
    <form action={createRealizationAction} className="grid gap-3 border-t border-slate-100 p-4 sm:grid-cols-4">
      <input type="hidden" name="versionId" value={versionId} />
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="confirmDuplicate" value={confirmDup ? "true" : "false"} />
      <input type="hidden" name="supplierNew" value={newSup ? "true" : "false"} />

      <div className="sm:col-span-4">
        <label htmlFor="tx-find" className={lbl}>Butir anggaran <span className="font-normal text-slate-500">({shown.length} dari {items.length})</span></label>
        <input id="tx-find" type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Cari kode/nama sub kegiatan, rekening, atau sumber dana…" className={cls} />
        <select aria-label="Butir anggaran" size={Math.min(5, Math.max(2, shown.length))} value={itemId} onChange={(e) => { setItemId(e.target.value); setConfirmDup(false); }} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white p-1 text-sm text-slate-900 focus:border-navy-600 focus:outline-none focus:ring-2 focus:ring-navy-200">
          {shown.map((i) => <option key={i.id} value={i.id} className="rounded px-2 py-1">{i.subCode} · {i.accountCode} {i.accountName}{i.description ? ` · ${i.description}` : ""} — sisa {rp(i.available)}</option>)}
        </select>
      </div>

      {item && (
        <p className="rounded-lg border border-navy-100 bg-navy-50/50 px-3 py-2 text-sm sm:col-span-4" aria-live="polite">
          <span className="font-medium">{item.subCode} · {item.accountCode} {item.accountName}</span>
          <span className="text-slate-500"> · {item.funding || "—"}</span><br />
          <span className="text-slate-600">Pagu <b className="tabular-nums text-slate-900">{rp(item.pagu)}</b> · Realisasi <b className="tabular-nums text-slate-900">{rp(item.realisasi)}</b> · </span>
          <span className="font-semibold text-navy-900">Sisa <b className="tabular-nums">{rp(item.available)}</b></span>
          {Number.isFinite(amount) && amount > 0 && <span className={`ml-2 text-xs ${amount > item.available ? "text-red-700" : "text-slate-600"}`}>→ setelah ini: {rp(item.available - amount)}</span>}
        </p>
      )}

      <div>
        <label htmlFor="tx-date" className={lbl}>Tanggal SP2D</label>
        <input id="tx-date" name="date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} min={`${year}-01-01`} max={today} className={cls} />
      </div>
      <div>
        <label htmlFor="tx-amount" className={lbl}>Nilai realisasi (Rp)</label>
        <input ref={amountRef} id="tx-amount" name="amount" type="number" min={0.01} step="0.01" required inputMode="decimal" value={amountRaw} onChange={(e) => setAmountRaw(e.target.value)} className={cls} />
        {Number.isFinite(amount) && amount > 0 && <p className="mt-0.5 text-xs text-slate-600">{rp(amount)}</p>}
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="tx-desc" className={lbl}>Uraian <span className="font-normal text-slate-500">(opsional)</span></label>
        <input id="tx-desc" name="description" maxLength={500} defaultValue="" placeholder="Kosongkan = otomatis dari nama rekening" className={cls} />
      </div>

      <details className="rounded-lg border border-slate-200 sm:col-span-4" open={newSup}>
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-700">Penyedia & metode pengadaan <span className="font-normal text-slate-500">(opsional)</span></summary>
        <div className="grid gap-3 border-t border-slate-100 p-3 sm:grid-cols-2">
          <div>
            <label htmlFor="tx-sup" className={lbl}>Penyedia</label>
            {!newSup ? (
              <>
                <select id="tx-sup" name="supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={cls}><option value="">— Tanpa penyedia —</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
                <button type="button" onClick={() => { setNewSup(true); setSupplierId(""); }} className="mt-1 text-xs font-medium text-navy-700 underline">Penyedia belum ada? Tambah manual</button>
              </>
            ) : (
              <div className="space-y-2 rounded-lg border border-navy-100 bg-navy-50/40 p-3">
                <input id="tx-sup" name="supplierName" required maxLength={200} value={supName} onChange={(e) => setSupName(e.target.value)} placeholder="Nama penyedia (mis. CV Maju Jaya)" aria-label="Nama penyedia baru" className={cls} />
                {dupSup.exact && (
                  <p role="status" className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
                    Penyedia ini sudah ada di Data Master; akan dipakai ulang (tidak dibuat ganda).{" "}
                    <button type="button" className="font-semibold underline" onClick={() => { setSupplierId(dupSup.exact!.id); setNewSup(false); setSupName(""); }}>Pilih dari daftar</button>
                  </p>
                )}
                {!dupSup.exact && dupSup.similar.length > 0 && (
                  <p role="status" className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
                    Mirip dengan yang sudah ada:{" "}
                    {dupSup.similar.map((s) => <button key={s.id} type="button" className="mr-2 font-semibold underline" onClick={() => { setSupplierId(s.id); setNewSup(false); setSupName(""); }}>{s.label}</button>)}
                  </p>
                )}
                <input name="supplierNpwp" maxLength={40} inputMode="numeric" placeholder="NPWP (opsional, 15/16 digit)" aria-label="NPWP penyedia baru" className={cls} />
                <input name="supplierAddress" maxLength={500} placeholder="Alamat (opsional)" aria-label="Alamat penyedia baru" className={cls} />
                <p className="text-xs text-slate-600">Penyedia baru otomatis tersimpan di Data Master → Penyedia.</p>
                <button type="button" onClick={() => { setNewSup(false); setSupName(""); }} className="text-xs font-medium text-navy-700 underline">Batal, pilih dari daftar</button>
              </div>
            )}
          </div>
          <div>
            <label htmlFor="tx-met" className={lbl}>Metode pengadaan</label>
            <select id="tx-met" name="method" defaultValue="" className={cls}><option value="">— Tidak ada —</option>{methods.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
            <p className="mt-1 text-xs text-slate-500">
              Mengikuti Data Master → Metode Pengadaan (aktif).{methods.length === 0 && " Belum ada metode aktif."}
              {canManageMaster && <> <a href="/master?tab=procurement_methods" className="font-medium text-navy-700 underline">Kelola metode</a></>}
            </p>
          </div>
        </div>
      </details>

      {duplicate && (
        <label className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 sm:col-span-4">
          <input type="checkbox" checked={confirmDup} onChange={(e) => setConfirmDup(e.target.checked)} className="mt-0.5 h-4 w-4" />
          Sudah ada realisasi dengan butir, tanggal, dan nilai yang sama. Centang bila ini memang transaksi terpisah (bukan input ganda).
        </label>
      )}
      {problem && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-sm text-red-800 sm:col-span-4">{problem}</p>}
      {supBlocked && <p className="text-sm text-slate-600 sm:col-span-4">Isi nama penyedia baru, atau pilih dari daftar.</p>}
      {!item && <p className="text-sm text-slate-600 sm:col-span-4">Pilih satu butir anggaran pada daftar di atas untuk melanjutkan.</p>}

      <div className="flex flex-wrap items-center gap-3 sm:col-span-4">
        <SaveButton blocked={!ready} />
        <p className="text-xs text-slate-500">Langsung tercatat sebagai realisasi (tanpa verifikasi). Setelah tersimpan, butir & tanggal tetap terpilih untuk input berikutnya.</p>
      </div>
    </form>
  );
}
