import { NextResponse, type NextRequest } from "next/server";
import { userClient } from "@/lib/supabase/server";
import { getBudgetContext, getSessionUser } from "@/lib/auth/session";
import { csvResponseHeaders, toCsv } from "@/lib/csv";
import { buildXlsx, xlsxHeaders } from "@/lib/spreadsheet";
import { loadBudgetItems } from "@/lib/budget-items";
import { fetchAll } from "@/lib/fetch-all";
import { STAGE_LABEL } from "@/lib/auth/context";
import { allocation, quarterSums } from "@/lib/cash-core";

export const dynamic = "force-dynamic";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const STATUS: Record<string, string> = { draft: "Draf", submitted: "Diajukan", returned: "Dikembalikan", final: "Final" };

interface PlanRow { budget_item_id: string; status: string; revision_no: number; cash_budget_periods: { period_no: number; period_type: string; amount: string | number }[] }

/** Unduh Anggaran Kas bulanan per butir (Excel/CSV) lengkap dengan total triwulan. */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !user.permissions.has("cashplan.view")) return new NextResponse("Tidak berwenang", { status: 403 });
  const ctx = await getBudgetContext();
  if (!ctx) return new NextResponse("Konteks anggaran belum dipilih", { status: 409 });
  const sb = await userClient();
  const [{ rows: items, error }, plans] = await Promise.all([
    loadBudgetItems(sb, ctx.versionId),
    fetchAll<PlanRow>((from, to) => sb.from("cash_budget_plans").select("budget_item_id, status, revision_no, cash_budget_periods(period_no, period_type, amount)").eq("budget_version_id", ctx.versionId).order("id").range(from, to)),
  ]);
  if (error || plans.error) return new NextResponse("Data tidak dapat dimuat", { status: 500 });
  const planOf = new Map(plans.rows.map((p) => [p.budget_item_id, p]));

  const header = ["Kode Sub Kegiatan", "Sub Kegiatan", "Kode Rekening", "Rekening Belanja", "Uraian", "PPTK", "Pagu", ...MONTHS, "Total Kas", "TW I", "TW II", "TW III", "TW IV", "Sisa Belum Dialokasikan", "Status"];
  const totals = Array(12).fill(0) as number[];
  let totalPagu = 0;
  const body: (string | number)[][] = items.map((r) => {
    const p = planOf.get(r.itemId);
    const m = MONTHS.map((_, i) => Number(p?.cash_budget_periods.find((x) => x.period_type === "month" && x.period_no === i + 1)?.amount ?? 0));
    m.forEach((v, i) => { totals[i]! += v; });
    totalPagu += r.pagu;
    const tw = [0, 1, 2, 3].map((q) => m[q * 3]! + m[q * 3 + 1]! + m[q * 3 + 2]!);
    const sum = m.reduce((a, b) => a + b, 0);
    return [r.subCode, r.subName, r.accountCode, r.accountName, r.description, r.pptk, r.pagu, ...m, sum, ...tw, r.pagu - sum, p ? (STATUS[p.status] ?? p.status) : "Belum disusun"];
  });
  const grand = totals.reduce((a, b) => a + b, 0);
  const tw = [0, 1, 2, 3].map((q) => totals[q * 3]! + totals[q * 3 + 1]! + totals[q * 3 + 2]!);
  body.push(["", "", "", "", "", "TOTAL", totalPagu, ...totals, grand, ...tw, totalPagu - grand, ""]);

  const base = `anggaran-kas-${ctx.year}-${ctx.stage}`;
  if (req.nextUrl.searchParams.get("format") === "csv") return new NextResponse(toCsv([header, ...body]), { headers: csvResponseHeaders(`${base}.csv`) });
  const money = Array.from({ length: 19 }, (_, i) => 6 + i);

  // Lembar 2: rekap per triwulan (pagu, TW I-IV, total kas, sisa belum diinput) per butir + total.
  const recapHeader = ["Kode Sub Kegiatan", "Sub Kegiatan", "Kode Rekening", "Rekening Belanja", "PPTK", "Pagu", "TW I", "TW II", "TW III", "TW IV", "Total Kas (Sudah Diinput)", "Sisa Belum Diinput", "Status"];
  const recapTw = [0, 0, 0, 0];
  let recapKas = 0;
  const recapRows: (string | number)[][] = items.map((r) => {
    const p = planOf.get(r.itemId);
    const m = MONTHS.map((_, i) => Number(p?.cash_budget_periods.find((x) => x.period_type === "month" && x.period_no === i + 1)?.amount ?? 0));
    const q = quarterSums(m);
    const al = allocation(r.pagu, m);
    q.forEach((v, i) => { recapTw[i]! += v; });
    recapKas += al.input;
    return [r.subCode, r.subName, r.accountCode, r.accountName, r.pptk, r.pagu, ...q, al.input, al.sisa, p ? (STATUS[p.status] ?? p.status) : "Belum disusun"];
  });
  recapRows.push(["", "", "", "", "TOTAL", totalPagu, ...recapTw, recapKas, Math.round((totalPagu - recapKas) * 100) / 100, ""]);

  const buf = await buildXlsx([
    {
      name: "Anggaran Kas", title: [`Anggaran Kas — Tahun Anggaran ${ctx.year} (${STAGE_LABEL[ctx.stage]})`],
      header, rows: body, widths: [16, 30, 16, 30, 26, 22, 16, ...Array(12).fill(14), 16, 15, 15, 15, 15, 18, 14], moneyCols: money,
    },
    {
      name: "Rekap Triwulan", title: [`Rekapitulasi Anggaran Kas per Triwulan — Tahun Anggaran ${ctx.year} (${STAGE_LABEL[ctx.stage]})`],
      header: recapHeader, rows: recapRows, widths: [16, 30, 16, 30, 22, 17, 16, 16, 16, 16, 20, 20, 14], moneyCols: [5, 6, 7, 8, 9, 10, 11],
    },
  ]);
  return new NextResponse(new Uint8Array(buf), { headers: xlsxHeaders(`${base}.xlsx`) });
}
