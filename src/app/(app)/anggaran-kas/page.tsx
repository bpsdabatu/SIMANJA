import type { Metadata } from "next";
import { requireModule } from "@/lib/auth/guard";
import { userClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { STAGE_LABEL } from "@/lib/auth/context";
import { getOrganizationName } from "@/lib/lookups";
import { formatRupiah } from "@/lib/format";
import { Badge, Card, CardHeader } from "@/components/ui/card";
import { Download, FileSpreadsheet, Search, Upload } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { EmptyState, Flash, PageHeader } from "@/components/ui/page";
import { ConfirmSubmit, PrintButton, SubmitButton } from "@/components/ui/submit-button";
import { PrintFooter, PrintHeader, SignatureBlock } from "@/components/ui/report";
import { MONTHS_SHORT, TW_LABEL, allocation, quarterSums, recapTotals } from "@/lib/cash-core";
import { cn } from "@/lib/utils";
import { CashPlanForm } from "./cash-plan-form";
import { cashStatusAction, deleteCashPlanAction, importCashPlansAction } from "./actions";

export const metadata: Metadata = { title: "Anggaran Kas" };
export const dynamic = "force-dynamic";

const MONTHS = MONTHS_SHORT;
const STATUS = {
  none: { label: "Belum disusun", tone: "slate" }, draft: { label: "Draf", tone: "amber" }, submitted: { label: "Diajukan", tone: "navy" },
  returned: { label: "Dikembalikan", tone: "red" }, final: { label: "Final", tone: "green" },
} as const;
type St = keyof typeof STATUS;

interface ItemRow {
  budget_item_id: string; pagu: string | number;
  budget_items: {
    id: string; description: string | null; pptk_id: string | null;
    sub_activities: { code: string; name: string } | null; expenditure_accounts: { code: string; name: string } | null;
    pptk: { full_name: string } | null;
  } | null;
}
interface PlanRow { id: string; budget_item_id: string; status: St; revision_no: number; change_reason: string | null; cash_budget_periods: { period_no: number; period_type?: string; amount: string | number }[] }

export default async function AnggaranKasPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; cari?: string; st?: string }> }) {
  const { user, context } = await requireModule("cashplan.view");
  const sp = await searchParams;
  const supabase = await userClient();
  const [itemsRes, plansRes, org] = await Promise.all([
    fetchAll<ItemRow>((from, to) => supabase.from("budget_item_versions")
      .select("budget_item_id, pagu, budget_items(id, description, pptk_id, sub_activities(code,name), expenditure_accounts(code,name), pptk:profiles!budget_items_pptk_id_fkey(full_name))")
      .eq("budget_version_id", context.versionId).order("budget_item_id").range(from, to)),
    fetchAll<PlanRow>((from, to) => supabase.from("cash_budget_plans").select("id, budget_item_id, status, revision_no, change_reason, cash_budget_periods(period_no, amount)")
      .eq("budget_version_id", context.versionId).order("id").range(from, to)),
    getOrganizationName(supabase, user.organizationId),
  ]);
  const error = itemsRes.error;
  const allItems = itemsRes.rows.filter((r) => r.budget_items)
    .sort((a, b) => (a.budget_items!.sub_activities?.code ?? "").localeCompare(b.budget_items!.sub_activities?.code ?? "", "id", { numeric: true }));
  const plans = new Map(plansRes.rows.map((p) => [p.budget_item_id, p]));
  const canEdit = user.permissions.has("cashplan.edit");
  const canFinalize = user.permissions.has("cashplan.finalize");

  const monthsOf = (id: string) => MONTHS.map((_, i) => Number(plans.get(id)?.cash_budget_periods.find((p) => p.period_no === i + 1)?.amount ?? 0));
  const statusOf = (id: string): St => plans.get(id)?.status ?? "none";

  // Filter tampilan (kata kunci + status). Ringkasan & rekap selalu memakai SELURUH butir.
  const cari = (sp.cari ?? "").trim().toLowerCase().slice(0, 60);
  const stFilter = sp.st && (sp.st in STATUS) ? (sp.st as St) : "";
  const items = allItems.filter((r) => {
    const b = r.budget_items!;
    if (stFilter && statusOf(r.budget_item_id) !== stFilter) return false;
    if (!cari) return true;
    return [b.sub_activities?.code, b.sub_activities?.name, b.expenditure_accounts?.code, b.expenditure_accounts?.name, b.description, b.pptk?.full_name]
      .some((x) => (x ?? "").toLowerCase().includes(cari));
  });

  const recap = recapTotals(allItems.map((r) => ({ pagu: Number(r.pagu), months: plans.has(r.budget_item_id) ? monthsOf(r.budget_item_id) : null, status: plans.get(r.budget_item_id)?.status ?? null })));
  const totals = MONTHS.map((_, i) => allItems.reduce((s, r) => s + monthsOf(r.budget_item_id)[i]!, 0));
  const grand = recap.total;
  const totalPagu = recap.pagu;
  const statusCount = allItems.reduce<Record<St, number>>((acc, r) => { acc[statusOf(r.budget_item_id)]++; return acc; }, { none: 0, draft: 0, submitted: 0, returned: 0, final: 0 });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PrintHeader orgName={org} title="Anggaran Kas" subtitle={`Tahun Anggaran ${context.year} — ${STAGE_LABEL[context.stage]}`} />
      <PageHeader
        eyebrow={`TA ${context.year} · ${STAGE_LABEL[context.stage]}`}
        title="Anggaran Kas"
        description="Rencana penarikan kas bulanan per butir, disusun dari data Input Anggaran. PPTK menyusun dan mengajukan; pejabat berwenang mengembalikan atau memfinalisasi. Total kas tidak boleh melebihi pagu."
        actions={<>
          <a href="/anggaran-kas/export?format=xlsx" className={buttonVariants({ variant: "outline" })}><Download size={16} aria-hidden /> Excel</a>
          <a href="/anggaran-kas/export?format=csv" className={buttonVariants({ variant: "outline" })}><Download size={16} aria-hidden /> CSV</a>
          <PrintButton />
        </>}
      />
      <Flash ok={sp.ok} err={sp.err} />

      <Card className="no-print">
        <details>
          <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3.5 text-sm font-semibold text-navy-800 [&::-webkit-details-marker]:hidden">Cara menambah data Anggaran Kas</summary>
          <ol className="list-decimal space-y-1.5 border-t border-slate-100 py-4 pl-9 pr-5 text-sm text-slate-700">
            <li><b>Admin</b>: isi pagu butir di <b>Input Anggaran</b> (versi yang dibuka) dan tetapkan <b>PPTK</b> pada tiap butir (Ubah → PPTK). Butir tanpa PPTK tidak dapat disusun kas-nya.</li>
            <li><b>PPTK</b> login pada tahun/tahapan yang sama, buka menu ini: setiap butir miliknya tampil sebagai kartu.</li>
            <li>Isi nominal <b>Januari–Desember</b> per butir, klik <b>Simpan draf</b> (total tidak boleh melebihi pagu). Alternatif: unduh templat Excel di bawah, isi, lalu unggah.</li>
            <li>Klik <b>Ajukan</b>. Pejabat berwenang (PPK/admin) <b>Finalisasi</b> atau <b>Kembalikan</b> (perbaiki lalu ajukan lagi). Draf yang salah dapat dihapus.</li>
          </ol>
        </details>
      </Card>

      {canEdit && (
        <Card className="no-print">
          <details>
            <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3.5 text-sm font-semibold text-navy-800 [&::-webkit-details-marker]:hidden"><Upload size={16} aria-hidden /> Isi Anggaran Kas dari Excel / CSV</summary>
            <form action={importCashPlansAction} encType="multipart/form-data" className="space-y-4 border-t border-slate-100 p-5">
              <input type="hidden" name="versionId" value={context.versionId} />
              <p className="text-sm text-slate-600">Unduh templat (sudah berisi butir Input Anggaran yang ditugaskan kepada Anda), isi nominal Jan–Des, lalu unggah. Hasil tersimpan sebagai <b>draf</b>; periksa lalu ajukan. Total per butir tidak boleh melebihi pagu.</p>
              <div className="flex flex-wrap gap-2">
                <a href="/anggaran-kas/template?format=xlsx" className={buttonVariants({ variant: "outline", size: "sm" })}><FileSpreadsheet size={14} aria-hidden /> Templat Excel</a>
                <a href="/anggaran-kas/template?format=csv" className={buttonVariants({ variant: "outline", size: "sm" })}><FileSpreadsheet size={14} aria-hidden /> Templat CSV</a>
              </div>
              <Field label="Berkas Excel (.xlsx) atau CSV" htmlFor="kas-file"><Input id="kas-file" name="file" type="file" accept=".xlsx,.csv,.txt" required className="h-auto py-2" /></Field>
              <SubmitButton variant="accent" pendingText="Mengimpor...">Unggah</SubmitButton>
            </form>
          </details>
        </Card>
      )}

      <div className="no-print grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {([
          ["Total pagu", formatRupiah(totalPagu), `${recap.count} butir anggaran`, "border-navy-200 bg-navy-50/60", "bg-navy-600", "text-navy-900"],
          ["Sudah diinput (kas)", formatRupiah(grand), `${recap.filled} butir sudah disusun`, "border-sky-200 bg-sky-50/70", "bg-sky-500", "text-sky-900"],
          [recap.sisa < 0 ? "Melebihi pagu" : "Sisa belum diinput", formatRupiah(Math.abs(recap.sisa)), recap.sisa === 0 && recap.count > 0 ? "Seluruh pagu sudah dialokasikan" : `${recap.count - recap.filled} butir belum disusun`, recap.sisa < 0 ? "border-red-200 bg-red-50/70" : "border-amber-200 bg-amber-50/70", recap.sisa < 0 ? "bg-red-500" : "bg-amber-500", recap.sisa < 0 ? "text-red-800" : "text-amber-900"],
          ["Status pengajuan", `${statusCount.final} final · ${statusCount.submitted} diajukan`, `${statusCount.draft} draf · ${statusCount.returned} dikembalikan · ${statusCount.none} belum disusun`, "border-emerald-200 bg-emerald-50/70", "bg-emerald-500", "text-emerald-900"],
        ] as const).map(([l, v, h, box, bar, txt]) => (
          <div key={l} className={cn("relative overflow-hidden rounded-xl border p-5 shadow-card", box)}>
            <span className={cn("absolute inset-x-0 top-0 h-1", bar)} aria-hidden />
            <p className="text-sm font-medium text-slate-600">{l}</p>
            <p className={cn("mt-1 break-words font-display text-xl font-bold tabular-nums", txt)}>{v}</p>
            <p className="mt-1 text-xs text-slate-500">{h}</p>
          </div>
        ))}
      </div>

      {/* Rekapitulasi Anggaran Kas per Triwulan (tampil juga saat dicetak) */}
      <Card>
        <CardHeader
          title="Rekapitulasi Anggaran Kas per Triwulan"
          description="Jumlah rencana kas seluruh butir per triwulan, dibandingkan dengan pagu. Unduhan Excel memuat lembar “Rekap Triwulan” per butir."
          actions={<a href="/anggaran-kas/export?format=xlsx" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "no-print h-9")}><Download size={14} aria-hidden /> Excel</a>}
        />
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
          {recap.tw.map((v, i) => {
            const tone = [["border-sky-200 bg-sky-50", "text-sky-700", "bg-sky-500"], ["border-emerald-200 bg-emerald-50", "text-emerald-700", "bg-emerald-500"], ["border-amber-200 bg-amber-50", "text-amber-700", "bg-amber-500"], ["border-violet-200 bg-violet-50", "text-violet-700", "bg-violet-500"]][i]!;
            const share = totalPagu > 0 ? Math.min(100, (v / totalPagu) * 100) : 0;
            return (
              <div key={i} className={cn("rounded-xl border p-4", tone[0])}>
                <p className={cn("text-xs font-semibold uppercase tracking-wide", tone[1])}>{TW_LABEL[i]} · {MONTHS[i * 3]}–{MONTHS[i * 3 + 2]}</p>
                <p className="mt-1 font-display text-lg font-bold tabular-nums text-slate-900">{formatRupiah(v)}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/70"><div className={cn("h-full rounded-full", tone[2])} style={{ width: `${share}%` }} /></div>
                <p className="mt-1 text-xs text-slate-600">{totalPagu > 0 ? `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format((v / totalPagu) * 100)}% dari pagu` : "Pagu 0"}</p>
              </div>
            );
          })}
        </div>
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="table-base">
            <thead><tr><th>Sub kegiatan / rekening</th><th>PPTK</th><th className="text-right">Pagu</th>{TW_LABEL.map((t) => <th key={t} className="text-right">{t}</th>)}<th className="text-right">Total kas</th><th className="text-right">Sisa belum diinput</th><th>Status</th></tr></thead>
            <tbody>
              {allItems.map((r) => {
                const b = r.budget_items!;
                const m = monthsOf(r.budget_item_id);
                const q = quarterSums(m);
                const al = allocation(Number(r.pagu), m);
                const st = statusOf(r.budget_item_id);
                return (
                  <tr key={r.budget_item_id}>
                    <td><span className="font-mono text-xs text-slate-500">{b.sub_activities?.code}</span> {b.sub_activities?.name}<br /><span className="font-mono text-xs text-slate-500">{b.expenditure_accounts?.code}</span> {b.expenditure_accounts?.name}</td>
                    <td className="text-xs">{b.pptk?.full_name ?? "—"}</td>
                    <td className="num">{formatRupiah(r.pagu).replace(",00", "").replace("Rp ", "")}</td>
                    {q.map((v, i) => <td key={i} className="num">{v ? formatRupiah(v).replace(",00", "").replace("Rp ", "") : "—"}</td>)}
                    <td className="num font-semibold">{formatRupiah(al.input).replace(",00", "").replace("Rp ", "")}</td>
                    <td className={cn("num font-semibold", al.sisa < 0 ? "text-red-700" : al.sisa === 0 ? "text-emerald-700" : "text-amber-700")}>{formatRupiah(al.sisa).replace(",00", "").replace("Rp ", "")}</td>
                    <td><Badge tone={STATUS[st].tone}>{STATUS[st].label}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr className="bg-slate-50 font-bold"><td colSpan={2} className="px-3 py-3 text-right">TOTAL</td><td className="num px-3 py-3">{formatRupiah(totalPagu).replace(",00", "").replace("Rp ", "")}</td>{recap.tw.map((v, i) => <td key={i} className="num px-3 py-3">{formatRupiah(v).replace(",00", "").replace("Rp ", "")}</td>)}<td className="num px-3 py-3">{formatRupiah(grand).replace(",00", "").replace("Rp ", "")}</td><td className="num px-3 py-3">{formatRupiah(recap.sisa).replace(",00", "").replace("Rp ", "")}</td><td /></tr></tfoot>
          </table>
        </div>
      </Card>

      <Card className="no-print">
        <form action="/anggaran-kas" className="flex flex-wrap items-end gap-3 p-4">
          <Field label="Cari butir" htmlFor="kas-cari"><Input id="kas-cari" name="cari" defaultValue={sp.cari ?? ""} placeholder="kode/nama sub kegiatan, rekening, PPTK" maxLength={60} className="w-72" /></Field>
          <Field label="Status" htmlFor="kas-st">
            <Select id="kas-st" name="st" defaultValue={stFilter} className="w-48">
              <option value="">Semua status</option>
              {(Object.keys(STATUS) as St[]).map((k) => <option key={k} value={k}>{STATUS[k].label} ({statusCount[k]})</option>)}
            </Select>
          </Field>
          <button className={buttonVariants({ variant: "primary" })}><Search size={16} aria-hidden /> Tampilkan</button>
          <a href="/anggaran-kas" className={buttonVariants({ variant: "outline" })}>Atur ulang</a>
          <p className="ml-auto text-xs text-slate-500">Menampilkan {items.length} dari {allItems.length} butir</p>
        </form>
      </Card>

      {error ? <Card><EmptyState title="Data tidak dapat dimuat">Muat ulang halaman atau hubungi administrator.</EmptyState></Card>
        : allItems.length === 0 ? <Card><EmptyState title="Belum ada butir anggaran">Butir yang ditugaskan kepada Anda akan tampil di sini setelah anggaran diinput.</EmptyState></Card>
        : (
        <>
        <div className="no-print space-y-4">
          {items.map((r) => {
            const b = r.budget_items!;
            const plan = plans.get(r.budget_item_id);
            const status: St = plan?.status ?? "none";
            const mine = canEdit && b.pptk_id === user.id;
            const editable = mine && (status === "none" || status === "draft" || status === "returned");
            const byMonth = (n: number) => Number(plan?.cash_budget_periods.find((p) => p.period_no === n)?.amount ?? 0);
            const sum = MONTHS.reduce((s, _, i) => s + byMonth(i + 1), 0);
            return (
              <Card key={r.budget_item_id}>
                <CardHeader
                  title={`${b.sub_activities?.code ?? ""} — ${b.sub_activities?.name ?? ""}`}
                  description={`${b.expenditure_accounts?.code ?? ""} ${b.expenditure_accounts?.name ?? ""}${b.description ? ` · ${b.description}` : ""} · PPTK: ${b.pptk?.full_name ?? "belum ditugaskan"}`}
                  actions={<><Badge tone={STATUS[status].tone}>{STATUS[status].label}{plan && plan.revision_no > 1 ? ` · rev ${plan.revision_no}` : ""}</Badge></>}
                />
                <div className="px-5 py-4">
                  {!editable && (
                    <div className="mb-3 grid gap-2 sm:grid-cols-3">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"><span className="text-xs text-slate-500">Pagu</span><br /><b className="tabular-nums text-navy-900">{formatRupiah(r.pagu)}</b></div>
                      <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm"><span className="text-xs text-sky-700">Sudah diinput</span><br /><b className="tabular-nums text-sky-900">{formatRupiah(sum)}</b></div>
                      <div className={cn("rounded-lg border px-3 py-2 text-sm", Number(r.pagu) - sum < 0 ? "border-red-200 bg-red-50 text-red-800" : Number(r.pagu) - sum === 0 ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800")}><span className="text-xs">Sisa belum diinput</span><br /><b className="tabular-nums">{formatRupiah(Number(r.pagu) - sum)}</b></div>
                    </div>
                  )}
                  {status === "returned" && plan?.change_reason && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">Dikembalikan: {plan.change_reason}</p>}

                  {editable ? (
                    <CashPlanForm key={`${r.budget_item_id}-${status}-${plan?.revision_no ?? 0}-${sum}`} versionId={context.versionId} itemId={r.budget_item_id} pagu={Number(r.pagu)} initial={MONTHS.map((_, i) => byMonth(i + 1))} hasPlan={!!plan} />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="table-base"><thead><tr>{MONTHS.map((m) => <th key={m} className="text-right">{m}</th>)}</tr></thead>
                        <tbody><tr>{MONTHS.map((m, i) => <td key={m} className="num text-[13px]">{byMonth(i + 1) ? formatRupiah(byMonth(i + 1)).replace(",00", "").replace("Rp ", "") : "—"}</td>)}</tr></tbody></table>
                    </div>
                  )}

                  {plan && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {mine && (status === "draft" || status === "returned") && (
                        <form action={cashStatusAction}>
                          <input type="hidden" name="versionId" value={context.versionId} /><input type="hidden" name="planId" value={plan.id} /><input type="hidden" name="to" value="submitted" />
                          <ConfirmSubmit variant="accent" message={sum === 0 ? "Total kas Rp 0 (tidak ada penarikan kas pada butir ini). Ajukan? Setelah diajukan tidak dapat diubah kecuali dikembalikan." : "Ajukan anggaran kas ini? Setelah diajukan tidak dapat diubah kecuali dikembalikan."}>Ajukan</ConfirmSubmit>
                        </form>
                      )}
                      {mine && (status === "draft" || status === "returned") && (
                        <form action={deleteCashPlanAction}>
                          <input type="hidden" name="versionId" value={context.versionId} /><input type="hidden" name="planId" value={plan.id} />
                          <ConfirmSubmit variant="danger" message="Hapus draf anggaran kas butir ini? Isian bulanan akan dikosongkan.">Hapus draf</ConfirmSubmit>
                        </form>
                      )}
                      {canFinalize && status === "submitted" && (
                        <>
                          <form action={cashStatusAction}>
                            <input type="hidden" name="versionId" value={context.versionId} /><input type="hidden" name="planId" value={plan.id} /><input type="hidden" name="to" value="final" />
                            <ConfirmSubmit variant="primary" message="Finalisasi anggaran kas ini?">Finalisasi</ConfirmSubmit>
                          </form>
                          <form action={cashStatusAction} className="flex gap-2">
                            <input type="hidden" name="versionId" value={context.versionId} /><input type="hidden" name="planId" value={plan.id} /><input type="hidden" name="to" value="returned" />
                            <Input name="reason" required maxLength={300} placeholder="Alasan pengembalian" aria-label="Alasan pengembalian" className="h-10 w-64" />
                            <SubmitButton variant="outline">Kembalikan</SubmitButton>
                          </form>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}

          <Card>
            <CardHeader title="Total per bulan" />
            <div className="overflow-x-auto">
              <table className="table-base"><thead><tr>{MONTHS.map((m) => <th key={m} className="text-right">{m}</th>)}<th className="text-right">Total</th></tr></thead>
                <tbody><tr>{totals.map((t, i) => <td key={i} className="num text-[13px]">{t ? formatRupiah(t).replace(",00", "").replace("Rp ", "") : "—"}</td>)}<td className="num font-bold text-navy-900">{formatRupiah(grand)}</td></tr></tbody></table>
            </div>
          </Card>
        </div>

        {/* Tampilan cetak: rekap seluruh butir dalam satu tabel */}
        <div className="print-only">
          <table className="table-base">
            <thead><tr><th>Sub kegiatan / rekening</th><th className="text-right">Pagu</th>{MONTHS.map((m) => <th key={m} className="text-right">{m}</th>)}<th className="text-right">Total kas</th></tr></thead>
            <tbody>
              {items.map((r) => {
                const b = r.budget_items!;
                const plan = plans.get(r.budget_item_id);
                const by = (n: number) => Number(plan?.cash_budget_periods.find((p) => p.period_no === n)?.amount ?? 0);
                const sum = MONTHS.reduce((a, _, i) => a + by(i + 1), 0);
                return (
                  <tr key={r.budget_item_id}>
                    <td>{b.sub_activities?.code} {b.sub_activities?.name}<br />{b.expenditure_accounts?.code} {b.expenditure_accounts?.name}{b.pptk?.full_name ? ` · PPTK: ${b.pptk.full_name}` : ""}</td>
                    <td className="num">{formatRupiah(r.pagu).replace(",00", "").replace("Rp ", "")}</td>
                    {MONTHS.map((_, i) => <td key={i} className="num">{by(i + 1) ? formatRupiah(by(i + 1)).replace(",00", "").replace("Rp ", "") : "—"}</td>)}
                    <td className="num font-semibold">{formatRupiah(sum).replace(",00", "").replace("Rp ", "")}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr className="font-bold"><td>TOTAL</td><td className="num">{formatRupiah(totalPagu).replace(",00", "").replace("Rp ", "")}</td>{totals.map((t, i) => <td key={i} className="num">{t ? formatRupiah(t).replace(",00", "").replace("Rp ", "") : "—"}</td>)}<td className="num">{formatRupiah(grand).replace(",00", "").replace("Rp ", "")}</td></tr></tfoot>
          </table>
        </div>
        </>
      )}
      <SignatureBlock />
      <PrintFooter />
    </div>
  );
}
