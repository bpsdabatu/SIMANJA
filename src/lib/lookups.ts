import "server-only";
import { userClient } from "@/lib/supabase/server";

export interface Opt { id: string; label: string }

type Sb = Awaited<ReturnType<typeof userClient>>;

async function codeName(sb: Sb, table: string): Promise<Opt[]> {
  const { data } = await sb.from(table).select("id, code, name").eq("is_active", true).order("code").limit(1000);
  return (data ?? []).map((r) => ({ id: r.id as string, label: `${r.code} — ${r.name}` }));
}

/** Pengguna aktif berperan tertentu (membutuhkan hak baca user_roles: admin). Gagal -> daftar kosong. */
export async function usersWithRole(sb: Sb, role: "pptk" | "ppk" | "ppbj"): Promise<Opt[]> {
  const { data } = await sb
    .from("user_roles")
    .select("user_id, profiles!inner(id, full_name, status)")
    .eq("role_code", role);
  const out: Opt[] = [];
  for (const r of (data ?? []) as unknown as Array<{ profiles: { id: string; full_name: string; status: string } | { id: string; full_name: string; status: string }[] }>) {
    const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    if (p && p.status === "active") out.push({ id: p.id, label: p.full_name });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label, "id"));
}

export async function loadBudgetLookups(sb: Sb) {
  const [subActivities, accounts, funding, pptk] = await Promise.all([
    codeName(sb, "sub_activities"), codeName(sb, "expenditure_accounts"), codeName(sb, "funding_sources"),
    usersWithRole(sb, "pptk"),
  ]);
  return { subActivities, accounts, funding, pptk };
}

export async function loadSuppliersMethods(sb: Sb) {
  const [{ data: sup }, methods] = await Promise.all([
    sb.from("suppliers").select("id, name").eq("is_active", true).order("name").limit(1000),
    codeName(sb, "procurement_methods"),
  ]);
  return { suppliers: (sup ?? []).map((s) => ({ id: s.id as string, label: s.name as string })), methods };
}

export async function getOrganizationName(sb: Sb, organizationId: string): Promise<string> {
  const { data } = await sb.from("organizations").select("name").eq("id", organizationId).maybeSingle();
  return (data?.name as string | undefined) ?? "";
}
