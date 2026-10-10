import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { requireModule } from "@/lib/auth/guard";
import { userClient } from "@/lib/supabase/server";
import { formatDateTimeWIB } from "@/lib/format";
import { Badge, Card, CardHeader } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, PageHeader, TableWrap } from "@/components/ui/page";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Log Audit" };
export const dynamic = "force-dynamic";
const PAGE = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string; action?: string; table?: string; dari?: string }> }) {
  await requireModule("audit.view");
  const sp = await searchParams;
  const page = Math.max(1, Math.min(10000, Number(sp.page) || 1));
  const supabase = await userClient();
  let q = supabase.from("audit_logs").select("id, occurred_at, actor_id, action, table_name, record_id, context", { count: "exact" })
    .order("occurred_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  const action = (sp.action ?? "").trim().slice(0, 40);
  const table = (sp.table ?? "").trim().slice(0, 60);
  if (action) q = q.eq("action", action);
  if (table) q = q.eq("table_name", table);
  if (sp.dari && /^\d{4}-\d{2}-\d{2}$/.test(sp.dari)) q = q.gte("occurred_at", `${sp.dari}T00:00:00+07:00`);
  const { data, count, error } = await q;
  const actorIds = [...new Set((data ?? []).map((r) => r.actor_id).filter(Boolean))] as string[];
  const { data: actors } = actorIds.length ? await supabase.from("profiles").select("id, username").in("id", actorIds) : { data: [] };
  const name = new Map((actors ?? []).map((a) => [a.id as string, a.username as string]));
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const qs = (p: number) => { const u = new URLSearchParams(); if (action) u.set("action", action); if (table) u.set("table", table); if (sp.dari) u.set("dari", sp.dari); u.set("page", String(p)); return `/audit?${u}`; };
  const tone = (a: string) => (a.startsWith("LOGIN_FAIL") || a.includes("THROTTLED") || a.includes("CAPTCHA") ? "red" : a === "DELETE" ? "amber" : a === "INSERT" ? "green" : "navy") as "red" | "amber" | "green" | "navy";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader eyebrow="Administrasi" title="Log Audit" description="Catatan permanen peristiwa autentikasi dan perubahan data. Hanya dapat dibaca; tidak ada yang dapat mengubah atau menghapusnya." />
      <Card>
        <CardHeader title={`Peristiwa (${count ?? 0})`}
          actions={<a href={`/audit/export?${new URLSearchParams({ ...(action && { action }), ...(table && { table }), ...(sp.dari && { dari: sp.dari }) })}`} className={buttonVariants({ variant: "outline", size: "sm" })}><Download size={15} aria-hidden /> Unduh CSV (maks. 5.000 baris)</a>} />
        <form action="/audit" className="flex flex-wrap gap-2 border-b border-slate-100 p-4">
          <Input name="action" defaultValue={action} placeholder="Aksi (mis. LOGIN_FAILURE)" aria-label="Aksi" className="h-9 w-56" />
          <Input name="table" defaultValue={table} placeholder="Tabel (mis. realization_transactions)" aria-label="Tabel" className="h-9 w-64" />
          <Input name="dari" type="date" defaultValue={sp.dari ?? ""} aria-label="Dari tanggal" className="h-9 w-44" />
          <button className={cn(buttonVariants({ variant: "primary", size: "sm" }), "h-9")}>Filter</button>
        </form>
        {error ? <EmptyState title="Data tidak dapat dimuat">Muat ulang halaman.</EmptyState>
          : (data ?? []).length === 0 ? <EmptyState title="Tidak ada peristiwa">Ubah filter untuk melihat data lain.</EmptyState>
          : (
          <TableWrap>
            <table className="table-base">
              <thead><tr><th>Waktu</th><th>Pengguna</th><th>Aksi</th><th>Tabel</th><th>Rekaman</th><th>Konteks</th></tr></thead>
              <tbody>
                {(data ?? []).map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap text-[13px]">{formatDateTimeWIB(r.occurred_at)}</td>
                    <td>{r.actor_id ? `@${name.get(r.actor_id) ?? "—"}` : <span className="text-slate-400">sistem</span>}</td>
                    <td><Badge tone={tone(r.action)}>{r.action}</Badge></td>
                    <td className="font-mono text-[13px]">{r.table_name ?? "—"}</td>
                    <td className="max-w-[10rem] truncate font-mono text-xs text-slate-500" title={r.record_id ?? ""}>{r.record_id ?? "—"}</td>
                    <td className="max-w-xs truncate font-mono text-xs text-slate-500" title={r.context ? JSON.stringify(r.context) : ""}>{r.context ? JSON.stringify(r.context) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm">
          <span className="text-slate-600">Halaman {page} dari {pages}</span>
          <span className="flex gap-2">
            {page > 1 && <Link href={qs(page - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>Sebelumnya</Link>}
            {page < pages && <Link href={qs(page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>Berikutnya</Link>}
          </span>
        </div>
      </Card>
    </div>
  );
}
