import "server-only";
import { userClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";

type Sb = Awaited<ReturnType<typeof userClient>>;
interface Named { code: string; name: string }

export interface ReportRow {
  itemId: string;
  programCode: string; programName: string;
  activityCode: string; activityName: string;
  subCode: string; subName: string;
  accountCode: string; accountName: string;
  funding: string; pptk: string; description: string;
  pagu: number; realisasi: number; pending: number; komitmen: number; sisa: number; pct: number | null;
}

interface RawItem {
  budget_item_id: string; pagu: string | number;
  budget_items: {
    description: string | null;
    sub_activities: (Named & { activities: (Named & { programs: Named | null }) | null }) | null;
    expenditure_accounts: Named | null;
    funding_sources: { name: string } | null;
    pptk: { full_name: string } | null;
  } | null;
}

/** Satu sumber angka untuk Rekapitulasi dan LRA. Realisasi sah = v_eligible_realization (SP2D bertanggal, tidak void). */
export async function loadReport(sb: Sb, versionId: string, opts: { until?: string | null } = {}) {
  const items = await fetchAll<RawItem>((from, to) =>
    sb.from("budget_item_versions")
      .select("budget_item_id, pagu, budget_items(description, sub_activities(code,name, activities(code,name, programs(code,name))), expenditure_accounts(code,name), funding_sources(name), pptk:profiles!budget_items_pptk_id_fkey(full_name))")
      .eq("budget_version_id", versionId).order("budget_item_id").range(from, to));

  const real = await fetchAll<{ budget_item_id: string; amount: string | number; sp2d_date: string }>((from, to) => {
    let q = sb.from("v_eligible_realization").select("budget_item_id, amount, sp2d_date").eq("budget_version_id", versionId).order("payment_id").range(from, to);
    if (opts.until) q = q.lte("sp2d_date", opts.until);
    return q;
  });
  const bal = await fetchAll<{ budget_item_id: string; pending_sp2d: string | number; contract_commitment: string | number }>((from, to) =>
    sb.from("v_budget_balance").select("budget_item_id, pending_sp2d, contract_commitment").eq("budget_version_id", versionId).order("budget_item_id").range(from, to));

  const realMap = new Map<string, number>();
  for (const r of real.rows) realMap.set(r.budget_item_id, (realMap.get(r.budget_item_id) ?? 0) + Number(r.amount));
  const balMap = new Map(bal.rows.map((b) => [b.budget_item_id, b]));

  const rows: ReportRow[] = items.rows.filter((i) => i.budget_items).map((i) => {
    const b = i.budget_items!;
    const sub = b.sub_activities;
    const pagu = Number(i.pagu);
    const realisasi = realMap.get(i.budget_item_id) ?? 0;
    const bb = balMap.get(i.budget_item_id);
    return {
      itemId: i.budget_item_id,
      programCode: sub?.activities?.programs?.code ?? "-", programName: sub?.activities?.programs?.name ?? "(tanpa program)",
      activityCode: sub?.activities?.code ?? "-", activityName: sub?.activities?.name ?? "(tanpa kegiatan)",
      subCode: sub?.code ?? "-", subName: sub?.name ?? "(tanpa sub kegiatan)",
      accountCode: b.expenditure_accounts?.code ?? "-", accountName: b.expenditure_accounts?.name ?? "",
      funding: b.funding_sources?.name ?? "", pptk: b.pptk?.full_name ?? "", description: b.description ?? "",
      pagu, realisasi, pending: Number(bb?.pending_sp2d ?? 0), komitmen: Number(bb?.contract_commitment ?? 0),
      sisa: pagu - realisasi, pct: pagu === 0 ? null : Math.round((realisasi / pagu) * 10000) / 100,
    };
  });
  rows.sort((a, b) =>
    `${a.programCode}|${a.activityCode}|${a.subCode}|${a.accountCode}`.localeCompare(`${b.programCode}|${b.activityCode}|${b.subCode}|${b.accountCode}`, "id", { numeric: true }));
  return { rows, error: items.error ?? real.error ?? bal.error };
}

export interface Totals { pagu: number; realisasi: number; pending: number; komitmen: number; sisa: number; pct: number | null }
export function sumRows(rows: ReportRow[]): Totals {
  const t = rows.reduce((a, r) => ({ pagu: a.pagu + r.pagu, realisasi: a.realisasi + r.realisasi, pending: a.pending + r.pending, komitmen: a.komitmen + r.komitmen }), { pagu: 0, realisasi: 0, pending: 0, komitmen: 0 });
  return { ...t, sisa: t.pagu - t.realisasi, pct: t.pagu === 0 ? null : Math.round((t.realisasi / t.pagu) * 10000) / 100 };
}

export const isIsoDate = (v: string | undefined | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
