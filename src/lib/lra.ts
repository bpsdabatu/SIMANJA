import type { ReportRow, Totals } from "@/lib/reports";
import { sumRows } from "@/lib/reports";

export interface LraLine { level: 0 | 1 | 2 | 3; code: string; name: string; totals: Totals }

/** Susunan berjenjang Program > Kegiatan > Sub Kegiatan > Rekening (baris sudah terurut). */
export function buildLra(rows: ReportRow[]): LraLine[] {
  const out: LraLine[] = [];
  const by = <K extends string>(list: ReportRow[], key: (r: ReportRow) => string, _k?: K) => {
    const m = new Map<string, ReportRow[]>();
    for (const r of list) { const k = key(r); (m.get(k) ?? m.set(k, []).get(k)!).push(r); }
    return m;
  };
  for (const [, pr] of by(rows, (r) => r.programCode)) {
    out.push({ level: 0, code: pr[0]!.programCode, name: pr[0]!.programName, totals: sumRows(pr) });
    for (const [, ac] of by(pr, (r) => r.activityCode)) {
      out.push({ level: 1, code: ac[0]!.activityCode, name: ac[0]!.activityName, totals: sumRows(ac) });
      for (const [, sb] of by(ac, (r) => r.subCode)) {
        out.push({ level: 2, code: sb[0]!.subCode, name: sb[0]!.subName, totals: sumRows(sb) });
        for (const [, ak] of by(sb, (r) => r.accountCode)) {
          out.push({ level: 3, code: ak[0]!.accountCode, name: ak[0]!.accountName, totals: sumRows(ak) });
        }
      }
    }
  }
  return out;
}
