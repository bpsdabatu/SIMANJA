import "server-only";
import type { userClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { foldRealization, todayWIB, type LraItem, type LraStage, type RealizationRow, type Tally } from "@/lib/lra-core";

type Sb = Awaited<ReturnType<typeof userClient>>;
interface Named { code: string; name: string }
const STAGES: LraStage[] = ["murni", "pergeseran", "perubahan"];

interface RawRow {
  budget_item_id: string; budget_version_id: string; pagu: string | number;
  budget_items: {
    description: string | null;
    sub_activities: (Named & { activities: (Named & { programs: Named | null }) | null }) | null;
    expenditure_accounts: Named | null;
    funding_sources: Named | null;
    pptk: { full_name: string } | null;
  } | null;
}

export interface LraData {
  items: LraItem[];
  cutoff: string;
  /** SP2D bertanggal setelah tanggal batas: tidak dihitung, tetapi dilaporkan agar tidak hilang diam-diam. */
  afterCutoff: Tally;
  /** Realisasi sah yang butirnya tidak ada pada snapshot pagu mana pun. */
  unmapped: Tally;
  /** Tahapan yang snapshot pagunya tersedia (kolom Pagu Rincian). */
  stagesAvailable: Record<LraStage, boolean>;
  error: string | null;
}

/**
 * Data LRA. Pagu rincian Murni/Pergeseran/Perubahan diambil dari versi anggaran non-draf terbaru tiap tahapan pada
 * OPD + tahun yang sama; tahapan aktif memakai versi konteks. Realisasi = v_eligible_realization (definisi sah tunggal,
 * versi konteks) dipecah menurut tanggal SP2D. Baris = gabungan butir lintas tahapan (butir baru di Perubahan tetap tampil).
 */
export async function loadLraData(sb: Sb, ctx: { versionId: string; stage: LraStage }, opts: { until?: string | null } = {}): Promise<LraData> {
  const cutoff = opts.until ?? todayWIB();
  const empty = (error: string): LraData => ({ items: [], cutoff, afterCutoff: { count: 0, amount: 0 }, unmapped: { count: 0, amount: 0 }, stagesAvailable: { murni: false, pergeseran: false, perubahan: false }, error });

  const { data: cur, error: curErr } = await sb.from("budget_versions").select("organization_id, fiscal_year_id").eq("id", ctx.versionId).maybeSingle();
  if (curErr || !cur) return empty(curErr?.message ?? "Versi anggaran tidak ditemukan");
  const { data: vers, error: verErr } = await sb.from("budget_versions").select("id, stage_code, version_no, status")
    .eq("organization_id", cur.organization_id).eq("fiscal_year_id", cur.fiscal_year_id);
  if (verErr) return empty(verErr.message);

  const versionOf: Partial<Record<LraStage, string>> = {};
  for (const s of STAGES) {
    if (s === ctx.stage) { versionOf[s] = ctx.versionId; continue; }
    const best = (vers ?? []).filter((v) => v.stage_code === s && v.status !== "draft").sort((a, b) => (b.version_no as number) - (a.version_no as number))[0];
    if (best) versionOf[s] = best.id as string;
  }
  const versionIds = [...new Set(Object.values(versionOf))] as string[];

  const snap = await fetchAll<RawRow>((from, to) =>
    sb.from("budget_item_versions")
      .select("budget_item_id, budget_version_id, pagu, budget_items(description, sub_activities(code,name, activities(code,name, programs(code,name))), expenditure_accounts(code,name), funding_sources(code,name), pptk:profiles!budget_items_pptk_id_fkey(full_name))")
      .in("budget_version_id", versionIds).order("budget_item_id").order("budget_version_id").range(from, to));

  const real = await fetchAll<RealizationRow & { payment_id: string }>((from, to) =>
    sb.from("v_eligible_realization").select("budget_item_id, amount, sp2d_date, payment_id").eq("budget_version_id", ctx.versionId).order("payment_id").range(from, to));

  const stageOfVersion = new Map<string, LraStage>();
  for (const s of STAGES) { const v = versionOf[s]; if (v) stageOfVersion.set(v, s); }

  const meta = new Map<string, LraItem>();
  for (const r of snap.rows) {
    const b = r.budget_items;
    if (!b) continue;
    let it = meta.get(r.budget_item_id);
    if (!it) {
      const sub = b.sub_activities;
      it = {
        itemId: r.budget_item_id,
        programCode: sub?.activities?.programs?.code ?? "-", programName: sub?.activities?.programs?.name ?? "(tanpa program)",
        activityCode: sub?.activities?.code ?? "-", activityName: sub?.activities?.name ?? "(tanpa kegiatan)",
        subCode: sub?.code ?? "-", subName: sub?.name ?? "(tanpa sub kegiatan)",
        accountCode: b.expenditure_accounts?.code ?? "-", accountName: b.expenditure_accounts?.name ?? "",
        fundingCode: b.funding_sources?.code ?? "", fundingName: b.funding_sources?.name ?? "",
        pptk: b.pptk?.full_name ?? "", description: b.description ?? "",
        pagu: { murni: 0, pergeseran: 0, perubahan: 0 }, lalu: 0, ini: 0,
      };
      meta.set(r.budget_item_id, it);
    }
    const st = stageOfVersion.get(r.budget_version_id);
    if (st) it.pagu[st] = Number(r.pagu);
  }

  const folded = foldRealization(real.rows, cutoff, new Set(meta.keys()));
  for (const [id, v] of folded.byItem) { const it = meta.get(id); if (it) { it.lalu = v.lalu; it.ini = v.ini; } }

  return {
    items: [...meta.values()], cutoff, afterCutoff: folded.afterCutoff, unmapped: folded.unmapped,
    stagesAvailable: { murni: !!versionOf.murni, pergeseran: !!versionOf.pergeseran, perubahan: !!versionOf.perubahan },
    error: snap.error ?? real.error,
  };
}

/** Pejabat penandatangan (KPA) dari application_settings key `lra.kpa` = {"name": "...", "nip": "...", "title": "..."}. */
export async function loadKpa(sb: Sb, organizationId: string): Promise<{ name: string; nip: string; title: string } | null> {
  const { data } = await sb.from("application_settings").select("value").eq("organization_id", organizationId).eq("key", "lra.kpa").maybeSingle();
  const v = data?.value as { name?: unknown; nip?: unknown; title?: unknown } | null | undefined;
  if (!v || typeof v.name !== "string" || !v.name.trim()) return null;
  return { name: v.name.trim(), nip: typeof v.nip === "string" ? v.nip.trim() : "", title: typeof v.title === "string" && v.title.trim() ? v.title.trim() : "Kuasa Pengguna Anggaran" };
}
