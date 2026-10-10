import { NextResponse, type NextRequest } from "next/server";
import { userClient } from "@/lib/supabase/server";
import { getBudgetContext, getSessionUser } from "@/lib/auth/session";
import { csvResponseHeaders, toCsv } from "@/lib/csv";
import { isIsoDate, loadReport } from "@/lib/reports";
import { buildLra } from "@/lib/lra";

export const dynamic = "force-dynamic";
const LEVEL = ["Program", "Kegiatan", "Sub Kegiatan", "Rekening"];

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !user.permissions.has("lra.export")) return new NextResponse("Tidak berwenang", { status: 403 });
  const ctx = await getBudgetContext();
  if (!ctx) return new NextResponse("Konteks anggaran belum dipilih", { status: 409 });
  const s = req.nextUrl.searchParams.get("sampai");
  const until = isIsoDate(s) ? s : null;

  const { rows, error } = await loadReport(await userClient(), ctx.versionId, { until });
  if (error) return new NextResponse("Data tidak dapat dimuat", { status: 500 });
  const out: unknown[][] = [["Tingkat", "Kode", "Uraian", "Anggaran", "Realisasi", "Sisa", "Persentase"]];
  for (const l of buildLra(rows)) out.push([LEVEL[l.level], l.code, l.name, l.totals.pagu, l.totals.realisasi, l.totals.sisa, l.totals.pct ?? ""]);
  return new NextResponse(toCsv(out), { headers: csvResponseHeaders(`lra-${ctx.year}-${ctx.stage}${until ? `-sd-${until}` : ""}.csv`) });
}
