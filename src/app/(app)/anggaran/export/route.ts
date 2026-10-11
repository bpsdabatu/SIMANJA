import { NextResponse, type NextRequest } from "next/server";
import { userClient } from "@/lib/supabase/server";
import { getBudgetContext, getSessionUser } from "@/lib/auth/session";
import { csvResponseHeaders, toCsv } from "@/lib/csv";
import { buildXlsx, xlsxHeaders } from "@/lib/spreadsheet";
import { loadBudgetItems } from "@/lib/budget-items";
import { STAGE_LABEL } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

/** Unduh Input Anggaran versi yang sedang dibuka (Excel/CSV). Kolom awal sama dengan templat impor. */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !user.permissions.has("budget.view")) return new NextResponse("Tidak berwenang", { status: 403 });
  const ctx = await getBudgetContext();
  if (!ctx) return new NextResponse("Konteks anggaran belum dipilih", { status: 409 });
  const sb = await userClient();
  const { rows: all, error } = await loadBudgetItems(sb, ctx.versionId);
  if (error) return new NextResponse("Data tidak dapat dimuat", { status: 500 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 60);
  const rows = q ? all.filter((r) => [r.subCode, r.subName, r.accountCode, r.accountName, r.description, r.pptk].some((x) => x.toLowerCase().includes(q))) : all;

  const header = ["Kode Program", "Program", "Kode Kegiatan", "Kegiatan", "Kode Sub Kegiatan", "Sub Kegiatan", "Kode Rekening", "Rekening Belanja", "Kode Sumber Dana", "Sumber Dana", "PPTK", "Uraian", "Pagu", "Catatan Perubahan"];
  const body = rows.map((r) => [r.programCode, r.programName, r.activityCode, r.activityName, r.subCode, r.subName, r.accountCode, r.accountName, r.fundingCode, r.funding, r.pptk, r.description, r.pagu, r.note]);
  const total = rows.reduce((s, r) => s + r.pagu, 0);
  const base = `input-anggaran-${ctx.year}-${ctx.stage}`;
  if (req.nextUrl.searchParams.get("format") === "csv") {
    return new NextResponse(toCsv([header, ...body, ["", "", "", "", "", "", "", "", "", "", "", "TOTAL", total, ""]]), { headers: csvResponseHeaders(`${base}.csv`) });
  }
  const buf = await buildXlsx([{
    name: "Input Anggaran", title: [`Input Anggaran — Tahun Anggaran ${ctx.year} (${STAGE_LABEL[ctx.stage]})`],
    header, rows: [...body, ["", "", "", "", "", "", "", "", "", "", "", "TOTAL", total, ""]],
    widths: [14, 28, 16, 28, 18, 34, 18, 34, 14, 24, 24, 30, 18, 24], moneyCols: [12],
  }]);
  return new NextResponse(new Uint8Array(buf), { headers: xlsxHeaders(`${base}.xlsx`) });
}
