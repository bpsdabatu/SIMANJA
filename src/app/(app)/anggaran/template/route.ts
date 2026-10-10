import { NextResponse } from "next/server";
import { userClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { csvResponseHeaders, toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

/** Templat CSV impor anggaran (contoh baris memakai kode master nyata bila ada). */
export async function GET() {
  const user = await getSessionUser();
  if (!user || !user.permissions.has("budget.import")) return new NextResponse("Tidak berwenang", { status: 403 });
  const sb = await userClient();
  const [s, a, f] = await Promise.all([
    sb.from("sub_activities").select("code").eq("is_active", true).order("code").limit(1),
    sb.from("expenditure_accounts").select("code").eq("is_active", true).order("code").limit(1),
    sb.from("funding_sources").select("code").eq("is_active", true).order("code").limit(1),
  ]);
  const rows = [
    ["kode_sub_kegiatan", "kode_rekening", "kode_sumber_dana", "username_pptk", "uraian", "pagu"],
    [s.data?.[0]?.code ?? "KODE-SUB-KEGIATAN", a.data?.[0]?.code ?? "KODE-REKENING", f.data?.[0]?.code ?? "KODE-SUMBER-DANA", "pptk.contoh", "Contoh uraian belanja", 1500000],
  ];
  return new NextResponse(toCsv(rows), { headers: csvResponseHeaders("templat-impor-anggaran.csv") });
}
