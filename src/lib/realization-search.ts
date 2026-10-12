import "server-only";
import { userClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { loadBudgetItems } from "@/lib/budget-items";
import type { BalanceRow } from "@/lib/realization-search-core";

type Sb = Awaited<ReturnType<typeof userClient>>;

/** Butir anggaran satu versi + realisasi sah, menunggu SP2D, komitmen, dan sisa (dibatasi RLS pemanggil). */
export async function loadBalanceRows(sb: Sb, versionId: string): Promise<{ rows: BalanceRow[]; error: string | null }> {
  const [{ rows: items, error: e1 }, bal] = await Promise.all([
    loadBudgetItems(sb, versionId),
    fetchAll<{ budget_item_id: string; eligible_realization: string | number; pending_sp2d: string | number; contract_commitment: string | number; sisa_anggaran: string | number; pct_realization: string | number | null }>((from, to) =>
      sb.from("v_budget_balance").select("budget_item_id, eligible_realization, pending_sp2d, contract_commitment, sisa_anggaran, pct_realization").eq("budget_version_id", versionId).order("budget_item_id").range(from, to)),
  ]);
  const b = new Map(bal.rows.map((x) => [x.budget_item_id, x]));
  const rows: BalanceRow[] = items.map((i) => {
    const x = b.get(i.itemId);
    return {
      itemId: i.itemId, activityCode: i.activityCode, activityName: i.activityName, subCode: i.subCode, subName: i.subName,
      accountCode: i.accountCode, accountName: i.accountName, fundingCode: i.fundingCode, funding: i.funding,
      pptkId: i.pptkId, pptk: i.pptk, description: i.description, pagu: i.pagu,
      realisasi: Number(x?.eligible_realization ?? 0), pending: Number(x?.pending_sp2d ?? 0), komitmen: Number(x?.contract_commitment ?? 0),
      sisa: Number(x?.sisa_anggaran ?? i.pagu), pct: x?.pct_realization == null ? null : Number(x.pct_realization),
    };
  });
  return { rows, error: e1 ?? bal.error };
}
