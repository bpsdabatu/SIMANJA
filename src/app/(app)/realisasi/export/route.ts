import { NextResponse, type NextRequest } from "next/server";
import { userClient } from "@/lib/supabase/server";
import { getBudgetContext, getSessionUser } from "@/lib/auth/session";
import { csvResponseHeaders, toCsv } from "@/lib/csv";
import { buildXlsx, xlsxHeaders } from "@/lib/spreadsheet";
import { loadBalanceRows } from "@/lib/realization-search";
import { filterBalance, totalsOf } from "@/lib/realization-search-core";
import { STAGE_LABEL } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

/** Unduh hasil pencarian realisasi & sisa anggaran (filter sama dengan halaman). */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !user.permissions.has("realization.view")) return new NextResponse("Tidak berwenang", { status: 403 });
  const ctx = await getBudgetContext();
  if (!ctx) return new NextResponse("Konteks anggaran belum dipilih", { status: 409 });
  const sp = req.nextUrl.searchParams;
  const { rows: all, error } = await loadBalanceRows(await userClient(), ctx.versionId);
  if (error) return new NextResponse("Data tidak dapat dimuat", { status: 500 });
  const rows = filterBalance(all, { keg: sp.get("keg") ?? "", sub: sp.get("sub") ?? "", bel: sp.get("bel") ?? "", dana: sp.get("dana") ?? "", pptk: sp.get("pptk") ?? "", cari: sp.get("cari") ?? "" });
  const t = totalsOf(rows);
  const header = ["Kode Kegiatan", "Kegiatan", "Kode Sub Kegiatan", "Sub Kegiatan", "Kode Rekening", "Rekening Belanja", "Sumber Dana", "PPTK", "Pagu", "Realisasi", "Menunggu SP2D", "Komitmen Kontrak", "Sisa Anggaran", "% Realisasi"];
  const body = rows.map((r) => [r.activityCode, r.activityName, r.subCode, r.subName, r.accountCode, r.accountName, r.funding, r.pptk, r.pagu, r.realisasi, r.pending, r.komitmen, r.sisa, r.pct ?? ""]);
  const foot = ["", "", "", "", "", "", "", "TOTAL", t.pagu, t.realisasi, t.pending, t.komitmen, t.sisa, t.pct ?? ""];
  const base = `realisasi-sisa-anggaran-${ctx.year}-${ctx.stage}`;
  if (sp.get("format") === "csv") return new NextResponse(toCsv([header, ...body, foot]), { headers: csvResponseHeaders(`${base}.csv`) });
  const buf = await buildXlsx([{ name: "Realisasi & Sisa", title: [`Realisasi dan Sisa Anggaran — TA ${ctx.year} (${STAGE_LABEL[ctx.stage]})`], header, rows: [...body, foot], widths: [16, 28, 18, 34, 18, 34, 24, 24, 18, 18, 18, 18, 18, 12], moneyCols: [8, 9, 10, 11, 12] }]);
  return new NextResponse(new Uint8Array(buf), { headers: xlsxHeaders(`${base}.xlsx`) });
}
