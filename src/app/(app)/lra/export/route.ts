import { NextResponse, type NextRequest } from "next/server";
import { userClient } from "@/lib/supabase/server";
import { getBudgetContext, getSessionUser } from "@/lib/auth/session";
import { csvResponseHeaders, toCsv } from "@/lib/csv";
import { isIsoDate } from "@/lib/reports";
import { buildLraReport } from "@/lib/lra-core";
import { loadLraData } from "@/lib/lra-data";

export const dynamic = "force-dynamic";
const LEVEL = ["Program", "Kegiatan", "Sub Kegiatan", "Belanja"];

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !user.permissions.has("lra.export") || !user.roles.includes("admin")) return new NextResponse("Tidak berwenang", { status: 403 });
  const ctx = await getBudgetContext();
  if (!ctx) return new NextResponse("Konteks anggaran belum dipilih", { status: 409 });
  const s = req.nextUrl.searchParams.get("sampai");
  const until = isIsoDate(s) ? s : null;

  const data = await loadLraData(await userClient(), { versionId: ctx.versionId, stage: ctx.stage }, { until });
  if (data.error) return new NextResponse("Data tidak dapat dimuat", { status: 500 });
  const { lines, total } = buildLraReport(data.items);
  const lbl = (k: "murni" | "pergeseran" | "perubahan", d: string) => data.tahapan.columns[k]?.label ?? d;
  const aktif = data.tahapan.active?.label ?? "tanpa DPA berlaku";
  const out: unknown[][] = [["Tingkat", "Kode Rekening", "Uraian Belanja", "Sumber Dana", `Pagu (${aktif})`, `Pagu ${lbl("murni", "Murni")}`, `Pagu ${lbl("pergeseran", "Pergeseran")}`, `Pagu ${lbl("perubahan", "Perubahan")}`, "Realisasi Bln Lalu", "Realisasi Bln Ini", "Realisasi Jumlah", "Sisa", "Capaian (%)", "Catatan"]];
  const row = (t: typeof total) => [t.pagu, t.murni, t.pergeseran, t.perubahan, t.lalu, t.ini, t.jumlah, t.sisa, t.pct ?? ""];
  for (const l of lines) {
    out.push([LEVEL[l.level], l.code, l.name, l.kind === "item" ? l.fundingName : "", ...row(l.totals), l.kind === "item" ? l.flags.map((f) => (f === "SISA_NEGATIF" ? "Sisa negatif" : "Realisasi tanpa pagu")).join("; ") : ""]);
  }
  out.push(["Total", "", "TOTAL BELANJA", "", ...row(total), `Sampai dengan ${data.cutoff}`]);
  return new NextResponse(toCsv(out), { headers: csvResponseHeaders(`lra-${ctx.year}-${aktif.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-sd-${data.cutoff}.csv`) });
}
