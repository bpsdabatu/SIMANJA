import "server-only";
import { userClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { loadBudgetItems } from "@/lib/budget-items";
import { getOrganizationName } from "@/lib/lookups";
import { STAGE_LABEL, type Stage } from "@/lib/auth/context";
import { buildQuarterReport, defaultQuarter, quarterRange, type QItem, type Quarter, type QuarterReport } from "@/lib/quarterly-core";

type Sb = Awaited<ReturnType<typeof userClient>>;

export interface QuarterParams { quarter?: string | null; pptk?: string | null }

export const parseQuarter = (v: string | null | undefined, year: number, now = new Date()): Quarter =>
  v && ["1", "2", "3", "4"].includes(v) ? (Number(v) as Quarter) : defaultQuarter(year, now);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface QuarterData { report: QuarterReport; pptkOptions: { id: string; name: string }[]; error: string | null }

/** Memuat data (dibatasi RLS pemanggil) lalu menghitung laporan triwulanan. Filter PPTK: UUID, "none" (belum ditugaskan), atau kosong (semua). */
export async function loadQuarterReport(
  sb: Sb, ctx: { year: number; stage: Stage; versionId: string }, orgId: string, params: QuarterParams, now = new Date(),
): Promise<QuarterData> {
  const quarter = parseQuarter(params.quarter, ctx.year, now);
  const { end } = quarterRange(ctx.year, quarter);

  const [{ rows: all, error: e1 }, plans, real, bal, tx, org] = await Promise.all([
    loadBudgetItems(sb, ctx.versionId),
    fetchAll<{ budget_item_id: string; status: string; cash_budget_periods: { period_no: number; period_type: string; amount: string | number }[] }>((from, to) =>
      sb.from("cash_budget_plans").select("budget_item_id, status, cash_budget_periods(period_no, period_type, amount)").eq("budget_version_id", ctx.versionId).order("id").range(from, to)),
    fetchAll<{ budget_item_id: string; amount: string | number; sp2d_date: string }>((from, to) =>
      sb.from("v_eligible_realization").select("budget_item_id, amount, sp2d_date").eq("budget_version_id", ctx.versionId).lte("sp2d_date", end).order("payment_id").range(from, to)),
    fetchAll<{ budget_item_id: string; pending_sp2d: string | number; contract_commitment: string | number }>((from, to) =>
      sb.from("v_budget_balance").select("budget_item_id, pending_sp2d, contract_commitment").eq("budget_version_id", ctx.versionId).order("budget_item_id").range(from, to)),
    fetchAll<{ id: string; budget_item_id: string }>((from, to) =>
      sb.from("realization_transactions").select("id, budget_item_id").eq("budget_version_id", ctx.versionId).neq("status", "cancelled").order("id").range(from, to)),
    getOrganizationName(sb, orgId),
  ]);
  const error = e1 ?? plans.error ?? real.error ?? bal.error ?? tx.error;

  const planOf = new Map(plans.rows.map((p) => [p.budget_item_id, p]));
  const balOf = new Map(bal.rows.map((b) => [b.budget_item_id, b]));
  const realOf = new Map<string, { date: string; amount: number }[]>();
  for (const r of real.rows) (realOf.get(r.budget_item_id) ?? realOf.set(r.budget_item_id, []).get(r.budget_item_id)!).push({ date: r.sp2d_date, amount: Number(r.amount) });
  const txItems = new Set(tx.rows.map((t) => t.budget_item_id));

  const pptkOptions = [...new Map(all.filter((i) => i.pptkId).map((i) => [i.pptkId!, i.pptk])).entries()]
    .map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "id"));
  const filterRaw = params.pptk ?? "";
  const filter = filterRaw === "none" || UUID.test(filterRaw) ? filterRaw : "";
  const picked = all.filter((i) => (filter === "" ? true : filter === "none" ? !i.pptkId : i.pptkId === filter));
  const pptkFilter = filter === "" ? null : filter === "none" ? "Belum ditugaskan" : pptkOptions.find((p) => p.id === filter)?.name ?? null;

  const items: QItem[] = picked.map((i) => {
    const plan = planOf.get(i.itemId);
    const months = plan ? Array.from({ length: 12 }, (_, m) => Number(plan.cash_budget_periods.find((p) => p.period_type === "month" && p.period_no === m + 1)?.amount ?? 0)) : null;
    const b = balOf.get(i.itemId);
    return {
      itemId: i.itemId, programCode: i.programCode, programName: i.programName, activityCode: i.activityCode, activityName: i.activityName,
      subCode: i.subCode, subName: i.subName, accountCode: i.accountCode, accountName: i.accountName,
      pptkId: i.pptkId, pptk: i.pptk, description: i.description, pagu: i.pagu,
      kasMonths: months, kasStatus: plan?.status ?? null, real: realOf.get(i.itemId) ?? [],
      pending: Number(b?.pending_sp2d ?? 0), komitmen: Number(b?.contract_commitment ?? 0), hasTransaction: txItems.has(i.itemId),
    };
  });

  const report = buildQuarterReport({ org, year: ctx.year, stageLabel: STAGE_LABEL[ctx.stage], quarter, now, items, pptkFilter });
  return { report, pptkOptions, error };
}
