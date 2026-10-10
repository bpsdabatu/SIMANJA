"use server";

import { requireModule } from "@/lib/auth/guard";
import { userClient } from "@/lib/supabase/server";
import { flashRedirect } from "@/lib/flash";
import { isUuid, num, optStr, runAction, str } from "@/lib/action-utils";

const BACK = "/anggaran-kas";

async function ctxVersion(fd: FormData, permission: string) {
  const { context } = await requireModule(permission);
  if (str(fd, "versionId", 40) !== context.versionId) flashRedirect(BACK, { err: "Konteks anggaran berubah. Muat ulang halaman lalu ulangi." });
  return context.versionId;
}

export async function saveCashPlanAction(fd: FormData): Promise<void> {
  const versionId = await ctxVersion(fd, "cashplan.edit");
  const item = str(fd, "itemId", 40);
  if (!isUuid(item)) flashRedirect(BACK, { err: "Butir tidak valid." });
  const months: number[] = [];
  for (let m = 1; m <= 12; m++) {
    const raw = String(fd.get(`m${m}`) ?? "").trim();
    const v = raw === "" ? 0 : num(fd, `m${m}`);
    if (!Number.isFinite(v) || v < 0) flashRedirect(BACK, { err: `Nilai bulan ke-${m} tidak valid.` });
    months.push(v);
  }
  const supabase = await userClient();
  return runAction(BACK, "Anggaran kas disimpan sebagai draf.", async () =>
    supabase.rpc("save_cash_plan", { p_version: versionId, p_item: item, p_months: months }),
  );
}

export async function cashStatusAction(fd: FormData): Promise<void> {
  const to = str(fd, "to", 12);
  const perm = to === "submitted" ? "cashplan.submit" : "cashplan.finalize";
  await ctxVersion(fd, perm);
  const plan = str(fd, "planId", 40);
  if (!isUuid(plan) || !["submitted", "returned", "final"].includes(to)) flashRedirect(BACK, { err: "Permintaan tidak valid." });
  const msg = { submitted: "Anggaran kas diajukan.", returned: "Anggaran kas dikembalikan ke PPTK.", final: "Anggaran kas difinalisasi." }[to]!;
  const supabase = await userClient();
  return runAction(BACK, msg, async () =>
    supabase.rpc("set_cash_plan_status", { p_plan: plan, p_to: to, p_reason: optStr(fd, "reason", 300) }),
  );
}
