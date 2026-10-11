import { NextResponse, type NextRequest } from "next/server";
import { userClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { csvResponseHeaders, toCsv } from "@/lib/csv";
import { buildXlsx, xlsxHeaders } from "@/lib/spreadsheet";

export const dynamic = "force-dynamic";

/** Templat impor anggaran (Excel atau CSV; contoh baris memakai kode master nyata bila ada). */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !user.permissions.has("budget.import")) return new NextResponse("Tidak berwenang", { status: 403 });
  const sb = await userClient();
  const [s, a, f] = await Promise.all([
    sb.from("sub_activities").select("code").eq("is_active", true).order("code").limit(1),
    sb.from("expenditure_accounts").select("code").eq("is_active", true).order("code").limit(1),
    sb.from("funding_sources").select("code").eq("is_active", true).order("code").limit(1),
  ]);
  const header = ["kode_sub_kegiatan", "kode_rekening", "kode_sumber_dana", "username_pptk", "uraian", "pagu"];
  const sample = [s.data?.[0]?.code ?? "KODE-SUB-KEGIATAN", a.data?.[0]?.code ?? "KODE-REKENING", f.data?.[0]?.code ?? "KODE-SUMBER-DANA", "pptk.contoh", "Contoh uraian belanja", 1500000];
  if (req.nextUrl.searchParams.get("format") === "xlsx") {
    const buf = await buildXlsx([{ name: "Anggaran", header, rows: [sample], widths: [24, 24, 20, 20, 40, 18], moneyCols: [5] }]);
    return new NextResponse(new Uint8Array(buf), { headers: xlsxHeaders("templat-impor-anggaran.xlsx") });
  }
  return new NextResponse(toCsv([header, sample]), { headers: csvResponseHeaders("templat-impor-anggaran.csv") });
}
