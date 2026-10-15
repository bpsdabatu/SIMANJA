import "server-only";
import type { userClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { foldRealization, pickTahapan, todayWIB, type LraItem, type LraStage, type RealizationRow, type Tally, type TahapanResult } from "@/lib/lra-core";

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
  /** Tahapan yang berlaku pada tanggal batas (berdasarkan tanggal DPA) dan versi tiap kolom Pagu Rincian. */
  tahapan: TahapanResult;
  /** SP2D bertanggal setelah tanggal batas: tidak dihitung, tetapi dilaporkan agar tidak hilang diam-diam. */
  afterCutoff: Tally;
  /** Realisasi sah yang butirnya tidak ada pada snapshot pagu mana pun. */
  unmapped: Tally;
  error: string | null;
}

const noTahapan = (): TahapanResult => ({ active: null, columns: { murni: null, pergeseran: null, perubahan: null }, undated: 0, mode: "konteks" });

/**
 * Data LRA.
 * - Tahapan aktif = versi dengan tanggal penetapan DPA terbesar yang ≤ tanggal batas (pickTahapan); pagu aktif diambil dari versi itu.
 * - Pagu rincian Murni/Pergeseran/Perubahan = versi tiap tahapan (Pergeseran ke-n bila berkali-kali) pada OPD + tahun yang sama.
 * - Realisasi = v_eligible_realization seluruh versi pada tahun anggaran itu (transaksi terikat ke versi saat diinput; LRA bersifat
 *   kumulatif sepanjang tahun), dipecah menurut tanggal SP2D. Baris = gabungan butir lintas versi.
 */
export async function loadLraData(sb: Sb, ctx: { versionId: string; stage: LraStage }, opts: { until?: string | null } = {}): Promise<LraData> {
  const cutoff = opts.until ?? todayWIB();
  const empty = (error: string): LraData => ({ items: [], cutoff, tahapan: noTahapan(), afterCutoff: { count: 0, amount: 0 }, unmapped: { count: 0, amount: 0 }, error });

  const { data: cur, error: curErr } = await sb.from("budget_versions").select("organization_id, fiscal_year_id").eq("id", ctx.versionId).maybeSingle();
  if (curErr || !cur) return empty(curErr?.message ?? "Versi anggaran tidak ditemukan");
  const scope = (cols: string) => sb.from("budget_versions").select(cols).eq("organization_id", cur.organization_id).eq("fiscal_year_id", cur.fiscal_year_id);

  type VRow = { id: string; stage_code: LraStage; version_no: number; status: string; dpa_date?: string | null };
  let vres = await scope("id, stage_code, version_no, status, dpa_date");
  // Migrasi 0009 (kolom dpa_date) belum diterapkan: tetap berfungsi dengan versi konteks.
  if (vres.error) vres = await scope("id, stage_code, version_no, status");
  if (vres.error) return empty(vres.error.message);
  const vrows = (vres.data ?? []) as unknown as VRow[];

  const tahapan = pickTahapan(
    vrows.map((v) => ({ id: v.id, stage: v.stage_code, versionNo: v.version_no, status: v.status, dpaDate: v.dpa_date ?? null })),
    cutoff, ctx.versionId);

  const activeId = tahapan.active?.id ?? null;
  const colStage = new Map<string, LraStage[]>();
  for (const s of STAGES) { const c = tahapan.columns[s]; if (c) colStage.set(c.id, [...(colStage.get(c.id) ?? []), s]); }
  const snapshotIds = [...new Set([...vrows.filter((v) => v.status !== "draft").map((v) => v.id), ctx.versionId])];
  const allIds = vrows.map((v) => v.id);

  const snap = await fetchAll<RawRow>((from, to) =>
    sb.from("budget_item_versions")
      .select("budget_item_id, budget_version_id, pagu, budget_items(description, sub_activities(code,name, activities(code,name, programs(code,name))), expenditure_accounts(code,name), funding_sources(code,name), pptk:profiles!budget_items_pptk_id_fkey(full_name))")
      .in("budget_version_id", snapshotIds).order("budget_item_id").order("budget_version_id").range(from, to));

  const real = await fetchAll<RealizationRow & { payment_id: string }>((from, to) =>
    sb.from("v_eligible_realization").select("budget_item_id, amount, sp2d_date, payment_id").in("budget_version_id", allIds).order("payment_id").range(from, to));

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
        paguAktif: 0, pagu: { murni: 0, pergeseran: 0, perubahan: 0 }, lalu: 0, ini: 0,
      };
      meta.set(r.budget_item_id, it);
    }
    const pagu = Number(r.pagu);
    if (r.budget_version_id === activeId) it.paguAktif = pagu;
    for (const st of colStage.get(r.budget_version_id) ?? []) it.pagu[st] = pagu;
  }

  const folded = foldRealization(real.rows, cutoff, new Set(meta.keys()));
  for (const [id, v] of folded.byItem) { const it = meta.get(id); if (it) { it.lalu = v.lalu; it.ini = v.ini; } }

  return { items: [...meta.values()], cutoff, tahapan, afterCutoff: folded.afterCutoff, unmapped: folded.unmapped, error: snap.error ?? real.error };
}

/** Pejabat penandatangan (KPA) dari application_settings key `lra.kpa` = {"name": "...", "nip": "...", "title": "..."}. */
export async function loadKpa(sb: Sb, organizationId: string): Promise<{ name: string; nip: string; title: string } | null> {
  const { data } = await sb.from("application_settings").select("value").eq("organization_id", organizationId).eq("key", "lra.kpa").maybeSingle();
  const v = data?.value as { name?: unknown; nip?: unknown; title?: unknown } | null | undefined;
  if (!v || typeof v.name !== "string" || !v.name.trim()) return null;
  return { name: v.name.trim(), nip: typeof v.nip === "string" ? v.nip.trim() : "", title: typeof v.title === "string" && v.title.trim() ? v.title.trim() : "Kuasa Pengguna Anggaran" };
}
