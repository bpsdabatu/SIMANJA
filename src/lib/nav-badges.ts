import "server-only";
import { userClient } from "@/lib/supabase/server";

type Sb = Awaited<ReturnType<typeof userClient>>;

/** Jumlah pekerjaan yang menunggu tindakan pengguna per menu (hanya > 0). Dibatasi RLS; kegagalan diabaikan (hanya kenyamanan UI). */
export async function loadNavBadges(sb: Sb, versionId: string, perms: Set<string>): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const count = async (table: string, statuses: string[]) => {
    try {
      const { count: n } = await sb.from(table).select("id", { count: "exact", head: true }).eq("budget_version_id", versionId).in("status", statuses);
      return n ?? 0;
    } catch { return 0; }
  };
  const [tx, kas] = await Promise.all([
    perms.has("realization.verify") ? count("realization_transactions", ["submitted", "payment_processing"])
      : perms.has("realization.edit") ? count("realization_transactions", ["returned"]) : Promise.resolve(0),
    perms.has("cashplan.finalize") ? count("cash_budget_plans", ["submitted"])
      : perms.has("cashplan.edit") ? count("cash_budget_plans", ["returned"]) : Promise.resolve(0),
  ]);
  if (tx > 0) out["/realisasi"] = tx;
  if (kas > 0) out["/anggaran-kas"] = kas;
  return out;
}
