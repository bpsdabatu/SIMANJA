import { createClient } from "@/lib/supabase/server";
import { getBudgetContext } from "@/lib/server/budget-context";
import { ImportForm } from "@/components/import-form";
import { ConfirmButton } from "@/components/confirm-button";
import { getSession } from "@/lib/server/session";
import { can } from "@/lib/rbac";
import { fmtDateTime } from "@/lib/date";
import { deleteImportJob, deleteUnconfirmedImports, ensureBudgetVersion } from "./actions";

export default async function ImportPage() {
  const ctx = await getBudgetContext();
  if (!ctx) return <p>Tahun/tahapan anggaran belum disiapkan. Hubungi administrator.</p>;
  const [sb, session] = [await createClient(), await getSession()];
  const canImport = !!session && can(session.roles, "budget:import");
  const { data: jobs } = ctx.versionId ? await sb.from("import_jobs").select("id, kind, file_name, status, ok_rows, error_rows, created_at")
    .eq("budget_version_id", ctx.versionId).order("created_at", { ascending: false }).limit(10) : { data: [] };
  return (
    <section className="max-w-4xl space-y-5">
      <div><h1 className="page-title">Impor anggaran</h1>
        <p className="text-slate-600">Tahun {ctx.year}, tahapan {ctx.stageName}. <a className="link" href="/api/templates/budget">Unduh template Excel</a></p></div>
      {!ctx.versionId ? (
        <form action={ensureBudgetVersion} className="card p-4"><p className="mb-3 text-sm">Belum ada versi anggaran untuk {ctx.year} {ctx.stageName}.</p>
          <button className="btn btn-primary">Siapkan versi anggaran</button></form>
      ) : <ImportForm />}
      <div><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Riwayat impor <span className="text-xs font-normal text-slate-500">(waktu dalam WIB)</span></h2>
        {canImport && jobs?.some((j) => j.status !== "confirmed") && (
          <form action={deleteUnconfirmedImports}><ConfirmButton className="btn btn-danger btn-sm" message="Hapus SEMUA riwayat impor yang belum dikonfirmasi? Data anggaran yang sudah tersimpan tidak terpengaruh.">Hapus semua yang belum dikonfirmasi</ConfirmButton></form>)}</div>
        {jobs?.length ? <div className="table-wrap"><table><thead><tr><th>File</th><th>Jenis</th><th>Status</th><th>Valid</th><th>Bermasalah</th><th>Waktu</th>{canImport && <th>Aksi</th>}</tr></thead>
          <tbody>{jobs.map((j) => <tr key={j.id}><td>{j.file_name}</td><td>{j.kind === "cash_plans" ? "Anggaran kas" : "Anggaran"}</td>
            <td>{j.status === "confirmed" ? "Dikonfirmasi" : "Menunggu konfirmasi"}</td><td>{j.ok_rows}</td><td>{j.error_rows}</td><td className="whitespace-nowrap">{fmtDateTime(j.created_at)}</td>
            {canImport && <td>{j.status === "confirmed" ? <span className="text-xs text-slate-500">Tersimpan sebagai arsip</span>
              : <form action={deleteImportJob}><input type="hidden" name="jobId" value={j.id} /><ConfirmButton className="btn btn-danger btn-sm" message={`Hapus riwayat impor "${j.file_name}"?`}>Hapus</ConfirmButton></form>}</td>}</tr>)}</tbody></table></div>
          : <p className="text-sm text-slate-600">Belum ada impor. Unduh template, isi, lalu unggah.</p>}</div>
    </section>
  );
}
