import { NextResponse, type NextRequest } from "next/server";
import { userClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { csvResponseHeaders, toCsv } from "@/lib/csv";
import { fetchAll } from "@/lib/fetch-all";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !user.permissions.has("audit.view")) return new NextResponse("Tidak berwenang", { status: 403 });
  const p = req.nextUrl.searchParams;
  const action = (p.get("action") ?? "").slice(0, 40), table = (p.get("table") ?? "").slice(0, 60), dari = p.get("dari") ?? "";
  const sb = await userClient();
  const { rows, error } = await fetchAll<{ id: number; occurred_at: string; actor_id: string | null; action: string; table_name: string | null; record_id: string | null; context: unknown }>((from, to) => {
    let q = sb.from("audit_logs").select("id, occurred_at, actor_id, action, table_name, record_id, context").order("occurred_at", { ascending: false }).order("id", { ascending: false }).range(from, to);
    if (action) q = q.eq("action", action);
    if (table) q = q.eq("table_name", table);
    if (/^\d{4}-\d{2}-\d{2}$/.test(dari)) q = q.gte("occurred_at", `${dari}T00:00:00+07:00`);
    return q;
  }, 1000, 5000);
  if (error) return new NextResponse("Data tidak dapat dimuat", { status: 500 });
  const out: unknown[][] = [["ID", "Waktu (UTC)", "ID Pengguna", "Aksi", "Tabel", "Rekaman", "Konteks"]];
  for (const r of rows) out.push([r.id, r.occurred_at, r.actor_id ?? "", r.action, r.table_name ?? "", r.record_id ?? "", r.context ? JSON.stringify(r.context) : ""]);
  return new NextResponse(toCsv(out), { headers: csvResponseHeaders("log-audit.csv") });
}
