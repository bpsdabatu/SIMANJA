import "server-only";
import { userClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import type { SupplierTx } from "@/lib/supplier-ranking-core";

type Sb = Awaited<ReturnType<typeof userClient>>;

/**
 * Transaksi realisasi sah (SP2D bertanggal) satu versi anggaran beserta penyedianya.
 * Dibatasi RLS pemanggil (setiap akun hanya melihat transaksi pada butir yang boleh diaksesnya).
 */
export async function loadSupplierTx(sb: Sb, versionId: string): Promise<{ rows: SupplierTx[]; error: string | null }> {
  const [elig, tx] = await Promise.all([
    fetchAll<{ transaction_id: string; amount: string | number; sp2d_date: string; transaction_date: string | null }>((from, to) =>
      sb.from("v_eligible_realization").select("transaction_id, amount, sp2d_date, transaction_date")
        .eq("budget_version_id", versionId).order("payment_id").range(from, to)),
    fetchAll<{ id: string; supplier_id: string | null; suppliers: { name: string } | null }>((from, to) =>
      sb.from("realization_transactions").select("id, supplier_id, suppliers(name)")
        .eq("budget_version_id", versionId).neq("status", "cancelled").order("id").range(from, to)),
  ]);
  const supOf = new Map(tx.rows.map((t) => [t.id, t]));
  const rows: SupplierTx[] = elig.rows.map((e) => {
    const t = supOf.get(e.transaction_id);
    return { supplierId: t?.supplier_id ?? null, supplierName: t?.suppliers?.name ?? "", amount: Number(e.amount), txDate: e.transaction_date ?? e.sp2d_date, sp2dDate: e.sp2d_date };
  });
  return { rows, error: elig.error ?? tx.error };
}
