import PptxGenJS from "pptxgenjs";
import { dateID, pct, rp, type QuarterReport } from "@/lib/quarterly-core";

/** Presentasi laporan triwulanan (16:9, font Arial). */
const NAVY = "0A2140", BLUE = "143D6B", GOLD = "C29D4D", GREY = "64748B", SOFT = "EFF4FA";
const STATUS_COLOR: Record<string, string> = { "Sesuai target": "047857", "Perlu perhatian": "B45309", "Di bawah target": "B91C1C", "Belum ada target kas": "64748B" };
const FONT = "Arial";
const juta = (n: number) => Math.round((n / 1_000_000) * 100) / 100;

export async function buildQuarterPptx(r: QuarterReport): Promise<Buffer> {
  const p = new PptxGenJS();
  p.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
  p.author = "SIMASPRAJA";
  p.title = `Laporan Capaian ${r.label} TA ${r.year}`;
  const scope = r.pptkFilter ? `PPTK ${r.pptkFilter}` : "Seluruh PPTK";
  const t = r.totals;
  let n = 0;
  const frame = (title: string) => {
    const s = p.addSlide(); n++;
    s.background = { color: "FFFFFF" };
    s.addShape(p.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.95, fill: { color: NAVY } });
    s.addShape(p.ShapeType.rect, { x: 0, y: 0.95, w: 13.33, h: 0.05, fill: { color: GOLD } });
    s.addText(title, { x: 0.5, y: 0.12, w: 12.3, h: 0.72, fontFace: FONT, fontSize: 24, bold: true, color: "FFFFFF", valign: "middle" });
    s.addText(`${r.label} TA ${r.year} · ${r.stageLabel} · ${scope}`, { x: 0.5, y: 7.05, w: 10, h: 0.3, fontFace: FONT, fontSize: 10, color: GREY });
    s.addText(String(n), { x: 12.3, y: 7.05, w: 0.6, h: 0.3, fontFace: FONT, fontSize: 10, color: GREY, align: "right" });
    return s;
  };

  // 1. Sampul
  {
    const s = p.addSlide(); n++;
    s.background = { color: NAVY };
    s.addShape(p.ShapeType.rect, { x: 0.6, y: 2.2, w: 0.12, h: 2.3, fill: { color: GOLD } });
    s.addText(r.org.toUpperCase() || "ORGANISASI PERANGKAT DAERAH", { x: 0.95, y: 1.4, w: 11.5, h: 0.5, fontFace: FONT, fontSize: 16, color: "DCB95F", bold: true });
    s.addText("Laporan Capaian Kinerja Pelaksanaan dan Realisasi Kegiatan dan Anggaran", { x: 0.95, y: 2.1, w: 11.5, h: 1.6, fontFace: FONT, fontSize: 34, bold: true, color: "FFFFFF", valign: "top" });
    s.addText(`${r.label} · Tahun Anggaran ${r.year} · ${r.stageLabel}`, { x: 0.95, y: 3.8, w: 11.5, h: 0.5, fontFace: FONT, fontSize: 20, color: "FFFFFF" });
    s.addText(`Periode ${dateID(r.start)} s.d. ${dateID(r.end)} · Cakupan: ${scope}`, { x: 0.95, y: 4.3, w: 11.5, h: 0.4, fontFace: FONT, fontSize: 14, color: "B3C8E3" });
    s.addText(`Disusun ${dateID(r.today)} · SIMASPRAJA`, { x: 0.95, y: 6.6, w: 11.5, h: 0.4, fontFace: FONT, fontSize: 12, color: "85A5CF" });
  }

  // 2. Ringkasan
  {
    const s = frame("Ringkasan Capaian");
    const cards: [string, string, string][] = [
      ["Pagu", rp(t.pagu), ""], ["Target kas s.d. triwulan", rp(t.kasCum), ""], [`Realisasi ${r.label}`, rp(t.realTw), `Target triwulan ${rp(t.kasTw)}`],
      ["Realisasi kumulatif", rp(t.realCum), `${pct(t.pctPagu)} dari pagu`], ["Capaian terhadap kas", pct(t.pctKas), t.status],
    ];
    cards.forEach(([l, v, sub], i) => {
      const x = 0.5 + i * 2.5;
      s.addShape(p.ShapeType.roundRect, { x, y: 1.3, w: 2.35, h: 1.5, fill: { color: SOFT }, line: { color: "CBD5E1", width: 0.75 }, rectRadius: 0.08 });
      s.addText(l, { x: x + 0.1, y: 1.35, w: 2.15, h: 0.4, fontFace: FONT, fontSize: 11, color: GREY });
      s.addText(v, { x: x + 0.1, y: 1.72, w: 2.15, h: 0.6, fontFace: FONT, fontSize: i === 4 ? 24 : 15, bold: true, color: NAVY, fit: "shrink" });
      s.addText(sub, { x: x + 0.1, y: 2.3, w: 2.15, h: 0.4, fontFace: FONT, fontSize: 10, color: i === 4 ? STATUS_COLOR[t.status] : GREY, bold: i === 4 });
    });
    s.addChart(p.ChartType.bar, [
      { name: "Target kas", labels: r.perQuarter.map((x) => `TW ${["I", "II", "III", "IV"][x.quarter - 1]}`), values: r.perQuarter.map((x) => juta(x.kas)) },
      { name: "Realisasi sah", labels: r.perQuarter.map((x) => `TW ${["I", "II", "III", "IV"][x.quarter - 1]}`), values: r.perQuarter.map((x) => juta(x.real)) },
    ], { x: 0.5, y: 3.05, w: 7.2, h: 3.9, barDir: "col", barGrouping: "clustered", chartColors: [BLUE, GOLD], showLegend: true, legendPos: "b", legendFontFace: FONT, legendFontSize: 11,
      catAxisLabelFontFace: FONT, valAxisLabelFontFace: FONT, catAxisLabelFontSize: 11, valAxisLabelFontSize: 10, showTitle: true, title: "Target kas vs realisasi per triwulan (Rp juta)", titleFontFace: FONT, titleFontSize: 12, valGridLine: { color: "E2E8F0", size: 0.5 } });
    const ps = [
      `Pelaksanaan: ${r.counts.realized} butir terealisasi, ${r.counts.inProgress} dalam proses, ${r.counts.idle} belum ada aktivitas (dari ${r.counts.items} butir).`,
      `Sisa pagu ${rp(t.sisa)}.`,
      t.pending > 0 ? `Menunggu SP2D ${rp(t.pending)}.` : "Tidak ada pembayaran menunggu SP2D.",
      t.komitmen > 0 ? `Komitmen kontrak ${rp(t.komitmen)} (belum realisasi).` : "",
    ].filter(Boolean);
    s.addText(ps.map((x) => ({ text: x, options: { bullet: true, breakLine: true } })), { x: 8.0, y: 3.2, w: 4.85, h: 3.6, fontFace: FONT, fontSize: 14, color: "1E293B", valign: "top", paraSpaceAfter: 8 });
  }

  // 3. Per Program (grafik)
  const programs = r.lines.filter((l) => l.level === 0);
  if (programs.length > 0) {
    const s = frame("Capaian per Program");
    const labels = programs.map((l) => l.code);
    s.addChart(p.ChartType.bar, [
      { name: "Pagu", labels, values: programs.map((l) => juta(l.m.pagu)) },
      { name: "Target kas s.d. TW", labels, values: programs.map((l) => juta(l.m.kasCum)) },
      { name: "Realisasi kumulatif", labels, values: programs.map((l) => juta(l.m.realCum)) },
    ], { x: 0.5, y: 1.2, w: 7.6, h: 5.7, barDir: "col", chartColors: ["94A3B8", BLUE, GOLD], showLegend: true, legendPos: "b", legendFontFace: FONT, legendFontSize: 11, catAxisLabelFontFace: FONT, valAxisLabelFontFace: FONT, catAxisLabelFontSize: 10, valAxisLabelFontSize: 10, showTitle: true, title: "Rp juta", titleFontFace: FONT, titleFontSize: 11, valGridLine: { color: "E2E8F0", size: 0.5 } });
    s.addTable([
      [{ text: "Program", options: { bold: true, color: "FFFFFF", fill: { color: BLUE } } }, { text: "% kas", options: { bold: true, color: "FFFFFF", fill: { color: BLUE }, align: "right" } }, { text: "Status", options: { bold: true, color: "FFFFFF", fill: { color: BLUE } } }],
      ...programs.slice(0, 10).map((l) => [{ text: `${l.code} ${l.name}` }, { text: pct(l.m.pctKas), options: { align: "right" as const } }, { text: l.m.status, options: { color: STATUS_COLOR[l.m.status], bold: true } }]),
    ], { x: 8.3, y: 1.3, w: 4.6, colW: [2.3, 0.8, 1.5], fontFace: FONT, fontSize: 9, border: { type: "solid", color: "E2E8F0", pt: 0.5 }, valign: "middle" });
  }

  // 4. Per Sub Kegiatan (tabel, paginasi)
  const subs = r.lines.filter((l) => l.level === 2);
  const PAGE = 9, MAXPAGES = 6;
  for (let i = 0, pg = 1; i < subs.length && pg <= MAXPAGES; i += PAGE, pg++) {
    const part = subs.slice(i, i + PAGE);
    const pages = Math.min(MAXPAGES, Math.ceil(subs.length / PAGE));
    const s = frame(`Capaian per Sub Kegiatan${pages > 1 ? ` (${pg}/${pages})` : ""}`);
    const H = (x: string, a: "left" | "right" = "right") => ({ text: x, options: { bold: true, color: "FFFFFF", fill: { color: BLUE }, align: a } });
    s.addTable([
      [H("Sub Kegiatan", "left"), H("Pagu (Rp)"), H("Target kas s.d. TW"), H(`Realisasi ${r.label}`), H("Realisasi kumulatif"), H("% kas"), H("Status", "left")],
      ...part.map((l) => [
        { text: `${l.code} ${l.name}` }, { text: rp(l.m.pagu).replace("Rp ", ""), options: { align: "right" as const } }, { text: rp(l.m.kasCum).replace("Rp ", ""), options: { align: "right" as const } },
        { text: rp(l.m.realTw).replace("Rp ", ""), options: { align: "right" as const } }, { text: rp(l.m.realCum).replace("Rp ", ""), options: { align: "right" as const } },
        { text: pct(l.m.pctKas), options: { align: "right" as const } }, { text: l.m.status, options: { color: STATUS_COLOR[l.m.status], bold: true } },
      ]),
    ], { x: 0.4, y: 1.2, w: 12.5, colW: [4.0, 1.5, 1.6, 1.5, 1.6, 0.8, 1.5], fontFace: FONT, fontSize: 10, border: { type: "solid", color: "E2E8F0", pt: 0.5 }, valign: "middle" });
    if (pg === MAXPAGES && i + PAGE < subs.length) s.addText("Daftar lengkap tersedia pada laporan PDF.", { x: 0.4, y: 6.6, w: 9, h: 0.3, fontFace: FONT, fontSize: 11, italic: true, color: GREY });
  }

  // 5. Per PPTK
  if (!r.pptkFilter && r.byPptk.length > 1) {
    const list = r.byPptk.slice(0, 12);
    const s = frame("Capaian per PPTK");
    s.addChart(p.ChartType.bar, [{ name: "% realisasi terhadap target kas", labels: list.map((x) => x.name), values: list.map((x) => x.m.pctKas ?? 0) }],
      { x: 0.5, y: 1.2, w: 7.0, h: 5.7, barDir: "bar", chartColors: [BLUE], showValue: true, dataLabelFontFace: FONT, dataLabelFontSize: 10, dataLabelFormatCode: "0.0", catAxisLabelFontFace: FONT, catAxisLabelFontSize: 10, valAxisLabelFontFace: FONT, valAxisLabelFontSize: 10, valAxisMaxVal: Math.max(100, ...list.map((x) => x.m.pctKas ?? 0)), valAxisMinVal: 0, showLegend: false, showTitle: true, title: "% realisasi kumulatif terhadap target kas", titleFontFace: FONT, titleFontSize: 11, valGridLine: { color: "E2E8F0", size: 0.5 } });
    s.addTable([
      [{ text: "PPTK", options: { bold: true, color: "FFFFFF", fill: { color: BLUE } } }, { text: "Realisasi kumulatif (Rp)", options: { bold: true, color: "FFFFFF", fill: { color: BLUE }, align: "right" } }, { text: "Status", options: { bold: true, color: "FFFFFF", fill: { color: BLUE } } }],
      ...list.map((x) => [{ text: x.name }, { text: rp(x.m.realCum).replace("Rp ", ""), options: { align: "right" as const } }, { text: x.m.status, options: { color: STATUS_COLOR[x.m.status], bold: true } }]),
    ], { x: 7.7, y: 1.3, w: 5.2, colW: [2.0, 1.6, 1.6], fontFace: FONT, fontSize: 9, border: { type: "solid", color: "E2E8F0", pt: 0.5 }, valign: "middle" });
  }

  // 6. Analisis & rekomendasi
  {
    const s = frame("Analisis Singkat dan Rekomendasi");
    s.addText(r.analysis.headline, { x: 0.5, y: 1.15, w: 12.3, h: 0.8, fontFace: FONT, fontSize: 14, bold: true, color: NAVY, valign: "top" });
    s.addText(r.analysis.findings.map((x) => ({ text: x, options: { bullet: true, breakLine: true } })), { x: 0.5, y: 2.0, w: 7.6, h: 4.9, fontFace: FONT, fontSize: 11, color: "1E293B", valign: "top", paraSpaceAfter: 6, fit: "shrink" });
    s.addShape(p.ShapeType.roundRect, { x: 8.4, y: 2.0, w: 4.5, h: 4.9, fill: { color: SOFT }, line: { color: "CBD5E1", width: 0.75 }, rectRadius: 0.08 });
    s.addText("Rekomendasi", { x: 8.55, y: 2.05, w: 4.2, h: 0.4, fontFace: FONT, fontSize: 14, bold: true, color: NAVY });
    s.addText((r.analysis.recommendations.length ? r.analysis.recommendations : ["Tidak ada rekomendasi khusus."]).map((x) => ({ text: x, options: { bullet: true, breakLine: true } })), { x: 8.55, y: 2.5, w: 4.2, h: 4.3, fontFace: FONT, fontSize: 11, color: "1E293B", valign: "top", paraSpaceAfter: 6, fit: "shrink" });
  }

  // 7. Catatan
  {
    const s = frame("Catatan Metodologi dan Keterbatasan Data");
    s.addText(r.analysis.notes.map((x) => ({ text: x, options: { bullet: true, breakLine: true } })), { x: 0.6, y: 1.3, w: 12.1, h: 5.4, fontFace: FONT, fontSize: 14, color: "1E293B", valign: "top", paraSpaceAfter: 10, fit: "shrink" });
  }

  const out = await p.write({ outputType: "nodebuffer" });
  return Buffer.from(out as ArrayBuffer);
}
