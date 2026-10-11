"use client";

import { useActionState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { importPptkAction, type PptkImportState } from "./pptk-actions";

const q = (v: string) => `"${v.replace(/"/g, '""')}"`;

export function PptkImportForm() {
  const [state, action] = useActionState<PptkImportState, FormData>(importPptkAction, {});

  const download = () => {
    const rows = [["username", "nama_lengkap", "kata_sandi_sementara"], ...(state.created ?? []).map((c) => [c.username, c.name, c.password])];
    const blob = new Blob(["\uFEFF" + rows.map((r) => r.map(q).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "kredensial-pptk-sementara.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-4">
      <form action={action} encType="multipart/form-data" className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field label="Berkas Excel (.xlsx) atau CSV" htmlFor="pptk-file" hint="Kolom: username, nama_lengkap, nip, jabatan. Kata sandi sementara dibuat otomatis.">
          <Input id="pptk-file" name="file" type="file" accept=".xlsx,.csv,.txt" required className="h-auto py-2" />
        </Field>
        <SubmitButton variant="accent" pendingText="Mengimpor...">Impor PPTK</SubmitButton>
      </form>
      {state.error && <Alert>{state.error}</Alert>}
      {state.failed && <Alert tone="amber">{state.failed.join("; ")}</Alert>}
      {state.created && state.created.length > 0 && (
        <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-900">{state.created.length} akun PPTK dibuat.</p>
          <p className="text-sm text-emerald-900">Kata sandi sementara hanya tampil sekali di halaman ini. Unduh dan sampaikan melalui jalur aman; PPTK wajib menggantinya saat masuk pertama.</p>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Username</th><th>Nama</th><th>Kata sandi sementara</th></tr></thead>
              <tbody>{state.created.map((c) => <tr key={c.username}><td>{c.username}</td><td>{c.name}</td><td className="font-semibold">{c.password}</td></tr>)}</tbody>
            </table>
          </div>
          <Button type="button" variant="outline" onClick={download}><Download size={16} aria-hidden /> Unduh kredensial (CSV)</Button>
        </div>
      )}
    </div>
  );
}
