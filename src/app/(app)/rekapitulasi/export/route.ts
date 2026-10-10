import { NextResponse, type NextRequest } from "next/server";
import { userClient } from "@/lib/supabase/server";
import { getBudgetContext, getSessionUser } from "@/lib/auth/session";
import { csvResponseHeaders, toCsv } from "@/lib/csv";
import { loadReport } from "@/lib/reports";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !user.permissions.has("recap.export")) return new NextResponse("Tidak berwenang", { status: 403 });
  const ctx = await getBudgetContext();
  if (!ctx) return new NextResponse("Konteks anggaran belum dipilih", { status: 409 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 60);
  const { rows: all, error } = await loadReport(await userClient(), ctx.versionId);
  if (error) return new NextResponse("Data tidak dapat dimuat", { status: 500 });
  const rows = q ? all.filter((r) => [r.subCode, r.subName, r.accountCode, r.accountName, r.pptk, r.description].some((x) => x.toLowerCase().includes(q))) : all;

  const out: unknown[][] = [["Kode Sub Kegiatan", "Sub Kegiatan", "Kode Rekening", "Rekening", "Uraian", "Sumber Dana", "PPTK", "Pagu", "Realisasi", "Menunggu SP2D", "Komitmen Kontrak", "Sisa", "Persentase Realisasi"]];
  for (const r of rows) out.push([r.subCode, r.subName, r.accountCode, r.accountName, r.description, r.funding, r.pptk, r.pagu, r.realisasi, r.pending, r.komitmen, r.sisa, r.pct ?? ""]);
  return new NextResponse(toCsv(out), { headers: csvResponseHeaders(`rekapitulasi-${ctx.year}-${ctx.stage}.csv`) });
}
