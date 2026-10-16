import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Pencil, Plus, Search } from "lucide-react";
import { requireModule } from "@/lib/auth/guard";
import { userClient } from "@/lib/supabase/server";
import { Badge, Card, CardHeader } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { EmptyState, Flash, PageHeader } from "@/components/ui/page";
import { ConfirmSubmit, SubmitButton } from "@/components/ui/submit-button";
import { createSupplierAction, deleteSupplierAction, updateSupplierAction } from "../actions";

export const metadata: Metadata = { title: "Kelola Penyedia" };
export const dynamic = "force-dynamic";

interface Sup { id: string; name: string; address: string | null; is_active: boolean }

export default async function PenyediaPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; cari?: string }> }) {
  const { user } = await requireModule("realization.view");
  const sp = await searchParams;
  const canEdit = user.permissions.has("realization.edit");
  const cari = (sp.cari ?? "").trim().slice(0, 60);
  const supabase = await userClient();
  let q = supabase.from("suppliers").select("id, name, address, is_active").order("name").limit(1000);
  if (cari) q = q.ilike("name", `%${cari.replace(/[%_\\]/g, " ")}%`);
  const { data, error } = await q;
  const rows = (data ?? []) as Sup[];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link href="/realisasi" className="no-print inline-flex items-center gap-1 text-sm text-slate-500 hover:text-navy-700"><ArrowLeft size={14} aria-hidden /> Kembali ke Input Realisasi</Link>
      <PageHeader
        eyebrow="Realisasi belanja"
        title="Kelola Penyedia"
        description="Tambah, ubah, atau hapus data penyedia (nama dan alamat). Penyedia yang sudah dipakai pada transaksi tidak dapat dihapus; ubah namanya bila perlu."
      />
      <Flash ok={sp.ok} err={sp.err} />

      {canEdit && (
        <Card>
          <CardHeader title="Tambah penyedia" />
          <form action={createSupplierAction} className="grid gap-3 p-5 sm:grid-cols-2">
            <Field label="Nama penyedia" htmlFor="sup-name"><Input id="sup-name" name="name" required maxLength={200} placeholder="mis. CV Maju Jaya" /></Field>
            <Field label="Alamat (opsional)" htmlFor="sup-addr"><Input id="sup-addr" name="address" maxLength={500} placeholder="Alamat penyedia" /></Field>
            <div className="sm:col-span-2"><SubmitButton variant="primary" pendingText="Menyimpan..."><Plus size={15} aria-hidden /> Tambah penyedia</SubmitButton></div>
          </form>
        </Card>
      )}

      <Card>
        <CardHeader title={`Daftar penyedia (${rows.length})`} />
        <form action="/realisasi/penyedia" className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-5 py-4">
          <Field label="Cari nama" htmlFor="sup-cari"><Input id="sup-cari" name="cari" defaultValue={cari} maxLength={60} className="w-64" /></Field>
          <button className={buttonVariants({ variant: "primary" })}><Search size={16} aria-hidden /> Cari</button>
          {cari && <Link href="/realisasi/penyedia" className={buttonVariants({ variant: "outline" })}>Atur ulang</Link>}
        </form>
        {error ? <EmptyState title="Data tidak dapat dimuat">Muat ulang halaman atau hubungi administrator.</EmptyState>
          : rows.length === 0 ? <EmptyState title={cari ? "Tidak ada penyedia yang cocok" : "Belum ada penyedia"}>{canEdit ? "Tambahkan penyedia pada formulir di atas." : undefined}</EmptyState>
          : (
          <ul className="divide-y divide-slate-100">
            {rows.map((s) => (
              <li key={s.id} className="px-5 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{s.name} {!s.is_active && <Badge tone="slate" className="ml-1">Nonaktif</Badge>}</p>
                    <p className="text-sm text-slate-600">{s.address || "—"}</p>
                  </div>
                  {canEdit && (
                    <form action={deleteSupplierAction}>
                      <input type="hidden" name="id" value={s.id} />
                      <ConfirmSubmit variant="danger" message={`Hapus penyedia "${s.name}"? Hanya bisa bila belum dipakai pada transaksi.`}>Hapus</ConfirmSubmit>
                    </form>
                  )}
                </div>
                {canEdit && (
                  <details className="mt-2">
                    <summary className="inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-navy-700"><Pencil size={13} aria-hidden /> Ubah</summary>
                    <form action={updateSupplierAction} className="mt-2 grid gap-3 sm:grid-cols-2">
                      <input type="hidden" name="id" value={s.id} />
                      <Field label="Nama penyedia" htmlFor={`n-${s.id}`}><Input id={`n-${s.id}`} name="name" required maxLength={200} defaultValue={s.name} /></Field>
                      <Field label="Alamat" htmlFor={`a-${s.id}`}><Input id={`a-${s.id}`} name="address" maxLength={500} defaultValue={s.address ?? ""} /></Field>
                      <div className="sm:col-span-2"><SubmitButton variant="primary" pendingText="Menyimpan...">Simpan perubahan</SubmitButton></div>
                    </form>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
