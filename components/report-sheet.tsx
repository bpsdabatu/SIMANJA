import type { PrintProfile } from "@/lib/settings";
import { nowWib, todayLong } from "@/lib/date";
import { formatCell, type Report } from "@/lib/report-types";

export type Printer = { name: string; nip: string | null; role: string };
const dots = "..............................";

/** Lembar kertas: kop, judul, isi, dan blok tanda tangan. Dipakai semua dokumen cetak. */
export function Sheet({ profile, title, subtitle, orientation = "portrait", printer, signatures = true, children }: { profile: PrintProfile; title: string; subtitle?: string; orientation?: "portrait" | "landscape"; printer: Printer; signatures?: boolean; children: React.ReactNode }) {
  return (
    <>
      <style>{`@page { size: A4 ${orientation}; margin: 12mm; }`}</style>
      <article className={`report-sheet mx-auto bg-white text-slate-900 shadow-card print:shadow-none ${orientation === "landscape" ? "max-w-[78rem]" : "max-w-[52rem]"} rounded-2xl border border-slate-200 p-6 print:max-w-none print:rounded-none print:border-0 print:p-0 sm:p-10`}>
        <header className="border-b-[3px] border-double border-slate-800 pb-3 text-center">
          <p className="font-display text-xl font-bold uppercase tracking-wide">{profile.orgName || "Nama OPD"}</p>
          {profile.address && <p className="text-sm text-slate-700">{profile.address}</p>}
        </header>
        <div className="mt-5 text-center">
          <h1 className="font-display text-lg font-bold uppercase">{title}</h1>
          {subtitle && <p className="text-sm text-slate-700">{subtitle}</p>}
        </div>
        <div className="mt-5">{children}</div>
        {signatures && (
          <footer className="mt-10 grid grid-cols-2 gap-8 text-sm [break-inside:avoid]">
            <div><p>&nbsp;</p><p>Dibuat oleh,</p><p className="text-slate-700">{printer.role}</p><div className="h-20" /><p className="font-semibold underline">{printer.name}</p>{printer.nip && <p>NIP {printer.nip}</p>}</div>
            <div className="text-center"><p>{profile.city || dots}, {todayLong()}</p><p>Mengetahui,</p><p className="text-slate-700">{profile.headTitle || "Kepala"}</p><div className="h-20" />
              <p className="font-semibold underline">{profile.headName || dots}</p><p>NIP {profile.headNip || dots}</p></div>
          </footer>)}
        <p className="mt-6 text-[0.7rem] text-slate-500">Dicetak dari SIPANDABAJA pada {nowWib()} oleh {printer.name}.</p>
      </article>
    </>
  );
}

export function ReportTable({ report }: { report: Report }) {
  return (
    <div className="overflow-x-auto print:overflow-visible">
      <table>
        <thead><tr>{report.columns.map((c) => <th key={c.key} className={c.align === "center" ? "text-center" : c.kind === "money" || c.kind === "percent" ? "text-right" : "text-left"}>{c.label}</th>)}</tr></thead>
        <tbody>{report.rows.length ? report.rows.map((r, i) => (
          <tr key={i} className={r._lvl ? (r._lvl === 1 ? "bg-slate-300 font-bold" : r._lvl === 2 ? "bg-slate-200 font-bold" : "bg-slate-100 font-semibold") : ""}>{report.columns.map((c) => <td key={c.key} style={c.indent && r._ind ? { paddingLeft: `${0.5 + Number(r._ind) * 1}rem` } : undefined} className={`${c.align === "center" ? "text-center" : c.kind === "money" || c.kind === "percent" ? "text-right tabular-nums" : c.kind === "int" ? "text-center" : ""}`}>{r[c.key] === null && (c.key === "no") ? "" : formatCell(c.kind, r[c.key] ?? null)}</td>)}</tr>))
          : <tr><td colSpan={report.columns.length} className="py-6 text-center text-slate-500">Tidak ada data.</td></tr>}</tbody>
        {report.totals && <tfoot><tr>{report.columns.map((c) => <td key={c.key} className={c.kind === "money" || c.kind === "percent" ? "text-right tabular-nums" : ""}>{report.totals![c.key] === undefined || report.totals![c.key] === null ? "" : formatCell(c.kind, report.totals![c.key]!)}</td>)}</tr></tfoot>}
      </table>
      {!!report.notes?.length && <ul className="mt-3 list-disc space-y-0.5 pl-5 text-xs text-slate-600">{report.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
    </div>
  );
}
