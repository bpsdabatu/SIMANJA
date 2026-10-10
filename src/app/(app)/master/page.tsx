import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireModule } from "@/lib/auth/guard";
import { userClient } from "@/lib/supabase/server";
import { MASTER, MASTER_KEYS, type MasterEntity } from "@/lib/master-config";
import { Badge, Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { EmptyState, Flash, PageHeader, TableWrap } from "@/components/ui/page";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";
import { saveMasterAction, toggleMasterAction } from "./actions";

export const metadata: Metadata = { title: "Data Master" };
export const dynamic = "force-dynamic";

type Row = Record<string, unknown> & { id: string; is_active?: boolean };
interface ParentOpt { id: string; label: string }

async function loadParents(cfg: MasterEntity): Promise<ParentOpt[]> {
  if (!cfg.parent) return [];
  const supabase = await userClient();
  if (cfg.parent.labelOf === "year") {
    const { data } = await supabase.from(cfg.parent.table).select("id, year").order("year", { ascending: false });
    return (data ?? []).map((r) => ({ id: r.id as string, label: String(r.year) }));
  }
  const { data } = await supabase.from(cfg.parent.table).select("id, code, name").eq("is_active", true).order("code");
  return (data ?? []).map((r) => ({ id: r.id as string, label: `${r.code} — ${r.name}` }));
}

function FieldInputs({ cfg, parents, row }: { cfg: MasterEntity; parents: ParentOpt[]; row?: Row }) {
  const pid = row ? `-${row.id}` : "";
  return (
    <>
      {cfg.parent && (
        <Field label={cfg.parent.label} htmlFor={`parent${pid}`} className="sm:col-span-2">
          <Select id={`parent${pid}`} name={cfg.parent.key} required defaultValue={(row?.[cfg.parent.key] as string) ?? ""}>
            <option value="" disabled>Pilih {cfg.parent.label.toLowerCase()}</option>
            {parents.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </Select>
        </Field>
      )}
      {cfg.fields.map((f) => (
        <Field key={f.key} label={f.label} htmlFor={`${f.key}${pid}`} className={f.kind === "textarea" ? "sm:col-span-2" : undefined}>
          {f.kind === "textarea" ? (
            <Textarea id={`${f.key}${pid}`} name={f.key} maxLength={f.max} defaultValue={(row?.[f.key] as string) ?? ""} />
          ) : (
            <Input id={`${f.key}${pid}`} name={f.key} required={f.required} maxLength={f.max} defaultValue={(row?.[f.key] as string) ?? ""} className={f.mono ? "font-mono" : undefined} />
          )}
        </Field>
      ))}
    </>
  );
}

export default async function MasterPage({ searchParams }: { searchParams: Promise<{ tab?: string; ok?: string; err?: string; q?: string }> }) {
  const { user } = await requireModule("master.view");
  const sp = await searchParams;
  const tab = sp.tab && MASTER[sp.tab] ? sp.tab : "programs";
  const cfg = MASTER[tab]!;
  const canManage = user.permissions.has("master.manage");
  const supabase = await userClient();

  const q = (sp.q ?? "").trim().slice(0, 60);
  let query = supabase.from(cfg.table).select("*").order(cfg.orderBy).limit(500);
  if (q) {
    const first = cfg.fields[0]!.key;
    const col = first === "code" || first === "rup_code" ? first : "name";
    query = query.ilike(col, `%${q.replace(/[%_]/g, "")}%`);
  }
  const [{ data, error }, parents] = await Promise.all([query, loadParents(cfg)]);
  const rows = (data ?? []) as Row[];
  const parentLabel = new Map(parents.map((p) => [p.id, p.label]));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader eyebrow="Administrasi" title="Data Master" description="Referensi klasifikasi anggaran dan pengadaan. Data tidak dihapus; gunakan nonaktifkan agar riwayat tetap utuh." />
      <Flash ok={sp.ok} err={sp.err} />

      <nav aria-label="Jenis master" className="flex flex-wrap gap-2">
        {MASTER_KEYS.map((k) => (
          <Link key={k} href={`/master?tab=${k}`} aria-current={k === tab ? "page" : undefined}
            className={cn("rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              k === tab ? "bg-navy-700 text-white shadow-sm" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-navy-50")}>
            {MASTER[k]!.label}
          </Link>
        ))}
      </nav>

      {canManage && (
        <Card>
          <details>
            <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3.5 text-sm font-semibold text-navy-800 [&::-webkit-details-marker]:hidden">
              <Plus size={16} aria-hidden /> Tambah {cfg.label}
            </summary>
            <form action={saveMasterAction} className="grid gap-4 border-t border-slate-100 p-5 sm:grid-cols-2">
              <input type="hidden" name="entity" value={tab} />
              <FieldInputs cfg={cfg} parents={parents} />
              <div className="sm:col-span-2"><SubmitButton pendingText="Menyimpan...">Simpan</SubmitButton></div>
            </form>
          </details>
        </Card>
      )}

      <Card>
        <CardHeader
          title={`${cfg.label} (${rows.length}${rows.length === 500 ? "+" : ""})`}
          actions={
            <form className="flex gap-2" action="/master">
              <input type="hidden" name="tab" value={tab} />
              <Input name="q" defaultValue={q} placeholder="Cari..." aria-label="Cari" className="h-9 w-48" />
              <Button type="submit" variant="outline" size="sm" className="h-9">Cari</Button>
            </form>
          }
        />
        {error ? <EmptyState title="Data tidak dapat dimuat">Muat ulang halaman atau hubungi administrator.</EmptyState>
          : rows.length === 0 ? <EmptyState title={`Belum ada ${cfg.label.toLowerCase()}`}>{canManage ? "Gunakan tombol Tambah di atas." : "Hubungi administrator untuk mengisi data master."}</EmptyState>
          : (
          <TableWrap>
            <table className="table-base">
              <thead>
                <tr>
                  {cfg.parent && <th>{cfg.parent.label}</th>}
                  {cfg.fields.map((f) => <th key={f.key}>{f.label}</th>)}
                  <th>Status</th>
                  {canManage && <th className="text-right">Aksi</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={r.is_active === false ? "opacity-60" : undefined}>
                    {cfg.parent && <td className="text-slate-600">{parentLabel.get(r[cfg.parent.key] as string) ?? "—"}</td>}
                    {cfg.fields.map((f) => <td key={f.key} className={f.mono ? "font-mono text-[13px]" : undefined}>{(r[f.key] as string) || "—"}</td>)}
                    <td><Badge tone={r.is_active === false ? "slate" : "green"}>{r.is_active === false ? "Nonaktif" : "Aktif"}</Badge></td>
                    {canManage && (
                      <td className="text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <details className="relative text-left">
                            <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-lg bg-navy-50 px-3 text-xs font-semibold text-navy-700 hover:bg-navy-100 [&::-webkit-details-marker]:hidden">Ubah</summary>
                            <form action={saveMasterAction} className="absolute right-0 z-20 mt-2 grid w-[min(92vw,26rem)] gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-lift sm:grid-cols-2">
                              <input type="hidden" name="entity" value={tab} />
                              <input type="hidden" name="id" value={r.id} />
                              <FieldInputs cfg={cfg} parents={parents} row={r} />
                              <div className="sm:col-span-2"><SubmitButton size="sm" pendingText="Menyimpan...">Simpan perubahan</SubmitButton></div>
                            </form>
                          </details>
                          <form action={toggleMasterAction}>
                            <input type="hidden" name="entity" value={tab} />
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="active" value={r.is_active === false ? "true" : "false"} />
                            <SubmitButton size="sm" variant="outline">{r.is_active === false ? "Aktifkan" : "Nonaktifkan"}</SubmitButton>
                          </form>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
