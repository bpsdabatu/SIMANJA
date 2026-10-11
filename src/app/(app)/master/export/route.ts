import { NextResponse, type NextRequest } from "next/server";
import { userClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { MASTER } from "@/lib/master-config";
import { IMPORT_SPECS } from "@/lib/master-import";
import { csvResponseHeaders, toCsv } from "@/lib/csv";
import { buildXlsx, xlsxHeaders } from "@/lib/spreadsheet";

export const dynamic = "force-dynamic";

/** Unduh Data Master (Excel/CSV). Kolom sama dengan templat impor + Status, sehingga hasil unduhan dapat diimpor ulang. */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !user.permissions.has("master.view")) return new NextResponse("Tidak berwenang", { status: 403 });
  const tab = req.nextUrl.searchParams.get("tab") ?? "";
  const format = req.nextUrl.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const sb = await userClient();
  if (tab === "pptk") {
    if (!user.permissions.has("users.manage")) return new NextResponse("Tidak berwenang", { status: 403 });
    const { data: ur, error: e } = await sb.from("user_roles").select("profiles!inner(username, full_name, nip, position_title, status)").eq("role_code", "pptk").limit(5000);
    if (e) return new NextResponse("Data tidak dapat dimuat", { status: 500 });
    type P = { username: string; full_name: string; nip: string | null; position_title: string | null; status: string };
    const list = (ur ?? []).map((r) => (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles) as unknown as P).filter(Boolean)
      .sort((a, b) => a.full_name.localeCompare(b.full_name, "id"));
    const head = ["username", "nama_lengkap", "nip", "jabatan", "status"];
    const body = list.map((p) => [p.username, p.full_name, p.nip ?? "", p.position_title ?? "", p.status === "active" ? "Aktif" : "Nonaktif"]);
    if (format === "csv") return new NextResponse(toCsv([head, ...body]), { headers: csvResponseHeaders("data-master-pptk.csv") });
    const b = await buildXlsx([{ name: "PPTK", header: head, rows: body, widths: [22, 40, 24, 40, 12] }]);
    return new NextResponse(new Uint8Array(b), { headers: xlsxHeaders("data-master-pptk.xlsx") });
  }
  const cfg = MASTER[tab];
  const spec = IMPORT_SPECS[tab];
  if (!cfg || !spec) return new NextResponse("Jenis master tidak dikenal", { status: 404 });

  const { data, error } = await sb.from(cfg.table).select("*").order(cfg.orderBy).limit(20000);
  if (error) return new NextResponse("Data tidak dapat dimuat", { status: 500 });

  const parentCode = new Map<string, string>();
  const yearById = new Map<string, number>();
  if (cfg.parent && cfg.parent.table !== "fiscal_years") {
    const { data: ps } = await sb.from(cfg.parent.table).select("id, code").limit(20000);
    for (const p of ps ?? []) parentCode.set(p.id as string, String(p.code));
  }
  if (tab === "rup_references") {
    const { data: ys } = await sb.from("fiscal_years").select("id, year");
    for (const y of ys ?? []) yearById.set(y.id as string, Number(y.year));
  }

  const header = [...spec.columns.map((c) => c.label), "status"];
  const rows = (data ?? []).map((r: Record<string, unknown>) => {
    const cells = spec.columns.map((c) => {
      switch (c.key) {
        case "parent": return parentCode.get(r[cfg.parent!.key] as string) ?? "";
        case "code": return String(r.code ?? r.rup_code ?? "");
        case "name": return String(r.name ?? "");
        case "npwp": return String(r.npwp ?? "");
        case "address": return String(r.address ?? "");
        case "year": return yearById.get(r.fiscal_year_id as string) ?? "";
        case "extra": return String(r.package_name ?? "");
      }
    });
    return [...cells, r.is_active === false ? "Nonaktif" : "Aktif"] as (string | number)[];
  });

  const base = `data-master-${tab}`;
  if (format === "csv") return new NextResponse(toCsv([header, ...rows]), { headers: csvResponseHeaders(`${base}.csv`) });
  const buf = await buildXlsx([{ name: cfg.label, header, rows, widths: header.map((h) => (h === "kode" || h.startsWith("kode") ? 22 : h === "status" ? 12 : 48)) }]);
  return new NextResponse(new Uint8Array(buf), { headers: xlsxHeaders(`${base}.xlsx`) });
}
