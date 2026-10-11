import "server-only";
import { userClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";

type Sb = Awaited<ReturnType<typeof userClient>>;
interface Named { code: string; name: string }

export interface BudgetItemRow {
  itemId: string;
  programCode: string; programName: string;
  activityCode: string; activityName: string;
  subCode: string; subName: string;
  accountCode: string; accountName: string;
  fundingCode: string; funding: string;
  pptkId: string | null; pptk: string; description: string;
  pagu: number; note: string;
}

interface Raw {
  budget_item_id: string; pagu: string | number; adjustment_note: string | null;
  budget_items: {
    description: string | null; pptk_id: string | null;
    sub_activities: (Named & { activities: (Named & { programs: Named | null }) | null }) | null;
    expenditure_accounts: Named | null; funding_sources: Named | null;
    pptk: { full_name: string } | null;
  } | null;
}

/** Butir anggaran satu versi (dibatasi RLS pemanggil), lengkap dengan Program > Kegiatan > Sub Kegiatan. */
export async function loadBudgetItems(sb: Sb, versionId: string) {
  const res = await fetchAll<Raw>((from, to) =>
    sb.from("budget_item_versions")
      .select("budget_item_id, pagu, adjustment_note, budget_items(description, pptk_id, sub_activities(code,name, activities(code,name, programs(code,name))), expenditure_accounts(code,name), funding_sources(code,name), pptk:profiles!budget_items_pptk_id_fkey(full_name))")
      .eq("budget_version_id", versionId).order("budget_item_id").range(from, to));
  const rows: BudgetItemRow[] = res.rows.filter((r) => r.budget_items).map((r) => {
    const b = r.budget_items!, sub = b.sub_activities;
    return {
      itemId: r.budget_item_id,
      programCode: sub?.activities?.programs?.code ?? "-", programName: sub?.activities?.programs?.name ?? "",
      activityCode: sub?.activities?.code ?? "-", activityName: sub?.activities?.name ?? "",
      subCode: sub?.code ?? "-", subName: sub?.name ?? "",
      accountCode: b.expenditure_accounts?.code ?? "-", accountName: b.expenditure_accounts?.name ?? "",
      fundingCode: b.funding_sources?.code ?? "", funding: b.funding_sources?.name ?? "",
      pptkId: b.pptk_id, pptk: b.pptk?.full_name ?? "", description: b.description ?? "",
      pagu: Number(r.pagu), note: r.adjustment_note ?? "",
    };
  });
  rows.sort((a, b) => `${a.programCode}|${a.activityCode}|${a.subCode}|${a.accountCode}`.localeCompare(`${b.programCode}|${b.activityCode}|${b.subCode}|${b.accountCode}`, "id", { numeric: true }));
  return { rows, error: res.error };
}
