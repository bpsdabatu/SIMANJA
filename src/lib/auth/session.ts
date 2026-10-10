import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { userClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { CONTEXT_COOKIE, verifyContext, type Stage } from "@/lib/auth/context";

export type RoleCode = "admin" | "ppk" | "pptk" | "ppbj";

export interface SessionUser {
  id: string;
  username: string;
  fullName: string;
  organizationId: string;
  mustChangePassword: boolean;
  roles: RoleCode[];
  permissions: Set<string>;
}

/**
 * Pengguna sesi saat ini. Memakai auth.getUser() (memvalidasi JWT ke server Supabase),
 * bukan getSession() yang hanya membaca cookie. Dicache per-request.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await userClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, full_name, organization_id, status, must_change_password")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (!profile || profile.status !== "active") return null;

  const { data: roleRows } = await supabase.from("user_roles").select("role_code").eq("user_id", profile.id);
  const roles = (roleRows ?? []).map((r) => r.role_code as RoleCode);

  let permissions = new Set<string>();
  if (roles.length > 0) {
    const { data: perms } = await supabase
      .from("role_permissions")
      .select("permission_code")
      .in("role_code", roles);
    permissions = new Set((perms ?? []).map((p) => p.permission_code as string));
  }

  return {
    id: profile.id,
    username: profile.username,
    fullName: profile.full_name,
    organizationId: profile.organization_id,
    mustChangePassword: profile.must_change_password,
    roles,
    permissions,
  };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requirePermission(code: string): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.permissions.has(code)) redirect("/dashboard?akses=ditolak");
  return user;
}

export interface BudgetContext {
  year: number;
  stage: Stage;
  versionId: string;
}

/**
 * Konteks anggaran aktif. Cookie hanya petunjuk: tanda tangan, kepemilikan, dan kedaluwarsa
 * diperiksa, lalu DIVALIDASI ULANG ke database (RPC resolve_budget_context) sehingga konteks
 * yang dicabut/tidak lagi tersedia langsung ditolak. Tidak pernah memercayai nilai dari klien.
 */
export const getBudgetContext = cache(async (): Promise<BudgetContext | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const store = await cookies();
  const payload = await verifyContext(serverEnv().APP_SECRET, store.get(CONTEXT_COOKIE)?.value, {
    userId: user.id,
  });
  if (!payload) return null;

  const supabase = await userClient();
  const { data, error } = await supabase.rpc("resolve_budget_context", {
    p_year: payload.y,
    p_stage: payload.s,
  });
  if (error || !data || data !== payload.v) return null;
  return { year: payload.y, stage: payload.s, versionId: data as string };
});

export async function requireContext(): Promise<{ user: SessionUser; context: BudgetContext }> {
  const user = await requireUser();
  const context = await getBudgetContext();
  if (!context) redirect("/pilih-konteks");
  return { user, context };
}
