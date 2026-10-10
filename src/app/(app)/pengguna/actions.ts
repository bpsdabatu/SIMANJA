"use server";

import { randomUUID } from "node:crypto";
import { requireModule } from "@/lib/auth/guard";
import { adminClient } from "@/lib/supabase/admin";
import { userClient } from "@/lib/supabase/server";
import { flashRedirect } from "@/lib/flash";
import { passwordSchema } from "@/lib/auth/password-policy";
import { USERNAME_RE } from "@/lib/auth/login-core";
import { friendlyError, isUuid, optStr, str } from "@/lib/action-utils";

const BACK = "/pengguna";
const ROLES = ["admin", "ppk", "pptk", "ppbj"] as const;
type Role = (typeof ROLES)[number];

const rolesFrom = (fd: FormData): Role[] => [...new Set(fd.getAll("roles").map(String))].filter((r): r is Role => (ROLES as readonly string[]).includes(r));

async function audit(actorId: string, orgId: string, action: string, recordId: string, context?: Record<string, unknown>) {
  await adminClient().from("audit_logs").insert({ action, actor_id: actorId, organization_id: orgId, table_name: "profiles", record_id: recordId, context: context ?? null });
}

/** Target harus ada di organisasi yang sama dengan admin (service role melewati RLS, jadi diperiksa eksplisit). */
async function targetInOrg(id: string, orgId: string) {
  if (!isUuid(id)) return null;
  const { data } = await adminClient().from("profiles").select("id, username, organization_id").eq("id", id).maybeSingle();
  return data && data.organization_id === orgId ? data : null;
}

export async function createUserAction(fd: FormData): Promise<void> {
  const { user } = await requireModule("users.manage");
  const username = str(fd, "username", 32).toLowerCase();
  const fullName = str(fd, "fullName", 150);
  const roles = rolesFrom(fd);
  const password = String(fd.get("password") ?? "");
  if (!USERNAME_RE.test(username)) flashRedirect(BACK, { err: "Username 3–32 karakter: huruf kecil, angka, titik, garis bawah, atau strip." });
  if (!fullName) flashRedirect(BACK, { err: "Nama lengkap wajib diisi." });
  if (roles.length === 0) flashRedirect(BACK, { err: "Pilih minimal satu peran." });
  const pw = passwordSchema.safeParse(password);
  if (!pw.success) flashRedirect(BACK, { err: `Kata sandi sementara: ${pw.error.issues[0]?.message}` });

  const admin = adminClient();
  const dupe = await admin.from("profiles").select("id").eq("username", username).maybeSingle();
  if (dupe.data) flashRedirect(BACK, { err: `Username "${username}" sudah dipakai.` });

  const internalEmail = `${randomUUID()}@auth.simaspraja.invalid`;
  const created = await admin.auth.admin.createUser({ email: internalEmail, password, email_confirm: true });
  if (created.error || !created.data.user) {
    console.error("[pengguna] createUser", created.error?.message);
    flashRedirect(BACK, { err: "Akun tidak dapat dibuat. Periksa kebijakan kata sandi atau coba lagi." });
  }
  const uid = created.data.user!.id;
  let failure = "";
  try {
    const p = await admin.from("profiles").insert({
      id: uid, organization_id: user.organizationId, username, full_name: fullName,
      nip: optStr(fd, "nip", 30), position_title: optStr(fd, "position", 150), must_change_password: true,
    });
    if (p.error) throw new Error(p.error.message);
    const steps = [
      admin.from("auth_identities").insert({ profile_id: uid, internal_email: internalEmail }),
      admin.from("user_roles").insert(roles.map((r) => ({ user_id: uid, role_code: r, granted_by: user.id }))),
      ...(roles.some((r) => r === "admin" || r === "ppk")
        ? [admin.from("user_scopes").insert({ user_id: uid, scope_type: "organization", scope_id: null, granted_by: user.id })] : []),
    ];
    for (const s of steps) { const r = await s; if (r.error) throw new Error(r.error.message); }
  } catch (e) {
    console.error("[pengguna] simpan profil", e instanceof Error ? e.message : "unknown");
    failure = "Profil tidak dapat disimpan; pembuatan akun dibatalkan.";
    // Bersihkan agar tidak ada akun setengah jadi (profiles.id -> auth.users bersifat RESTRICT).
    await admin.from("user_scopes").delete().eq("user_id", uid);
    await admin.from("user_roles").delete().eq("user_id", uid);
    await admin.from("auth_identities").delete().eq("profile_id", uid);
    await admin.from("profiles").delete().eq("id", uid);
    await admin.auth.admin.deleteUser(uid);
  }
  if (failure) flashRedirect(BACK, { err: failure });
  await audit(user.id, user.organizationId, "USER_CREATED", uid, { username, roles });
  flashRedirect(BACK, { ok: `Pengguna @${username} dibuat. Sampaikan kata sandi sementara melalui jalur aman; wajib diganti saat masuk pertama.` });
}

export async function setUserStatusAction(fd: FormData): Promise<void> {
  const { user } = await requireModule("users.manage");
  const id = str(fd, "userId", 40);
  const to = str(fd, "to", 10);
  if (id === user.id) flashRedirect(BACK, { err: "Anda tidak dapat mengubah status akun sendiri." });
  const target = await targetInOrg(id, user.organizationId);
  if (!target || !["active", "suspended"].includes(to)) flashRedirect(BACK, { err: "Permintaan tidak valid." });
  const { error } = await adminClient().from("profiles").update({ status: to }).eq("id", id);
  if (error) flashRedirect(BACK, { err: "Status tidak dapat diubah." });
  if (to === "suspended") await adminClient().auth.admin.signOut(id, "global").catch(() => undefined);
  await audit(user.id, user.organizationId, to === "active" ? "USER_ACTIVATED" : "USER_SUSPENDED", id);
  flashRedirect(BACK, { ok: to === "active" ? `@${target!.username} diaktifkan.` : `@${target!.username} ditangguhkan dan sesinya diakhiri.` });
}

export async function resetPasswordAction(fd: FormData): Promise<void> {
  const { user } = await requireModule("users.manage");
  const id = str(fd, "userId", 40);
  if (id === user.id) flashRedirect(BACK, { err: "Ganti kata sandi sendiri melalui menu profil." });
  const target = await targetInOrg(id, user.organizationId);
  if (!target) flashRedirect(BACK, { err: "Pengguna tidak ditemukan." });
  const pw = passwordSchema.safeParse(String(fd.get("password") ?? ""));
  if (!pw.success) flashRedirect(BACK, { err: `Kata sandi sementara: ${pw.error.issues[0]?.message}` });
  const admin = adminClient();
  const upd = await admin.auth.admin.updateUserById(id, { password: pw.data });
  if (upd.error) { console.error("[pengguna] reset", upd.error.message); flashRedirect(BACK, { err: "Kata sandi tidak dapat diatur ulang." }); }
  await admin.from("profiles").update({ must_change_password: true }).eq("id", id);
  await admin.auth.admin.signOut(id, "global").catch(() => undefined);
  await audit(user.id, user.organizationId, "USER_PASSWORD_RESET", id);
  flashRedirect(BACK, { ok: `Kata sandi @${target!.username} diatur ulang; wajib diganti saat masuk.` });
}

export async function setRolesAction(fd: FormData): Promise<void> {
  const { user } = await requireModule("users.manage");
  const id = str(fd, "userId", 40);
  const roles = rolesFrom(fd);
  if (!isUuid(id)) flashRedirect(BACK, { err: "Pengguna tidak valid." });
  if (roles.length === 0) flashRedirect(BACK, { err: "Pilih minimal satu peran." });
  // Memakai klien pengguna: RLS + pelindung trigger (tidak boleh mengubah peran sendiri) tetap berlaku.
  const sb = await userClient();
  const { data: cur, error: e0 } = await sb.from("user_roles").select("role_code").eq("user_id", id);
  if (e0) flashRedirect(BACK, { err: friendlyError(e0) });
  const have = new Set((cur ?? []).map((r) => r.role_code as string));
  const add = roles.filter((r) => !have.has(r));
  const del = [...have].filter((r) => !(roles as string[]).includes(r));
  if (add.length) { const { error } = await sb.from("user_roles").insert(add.map((r) => ({ user_id: id, role_code: r, granted_by: user.id }))); if (error) flashRedirect(BACK, { err: friendlyError(error) }); }
  if (del.length) { const { error } = await sb.from("user_roles").delete().eq("user_id", id).in("role_code", del); if (error) flashRedirect(BACK, { err: friendlyError(error) }); }
  const needsScope = roles.some((r) => r === "admin" || r === "ppk");
  if (needsScope) {
    // Indeks unik berbasis ekspresi tidak dapat dipakai on_conflict PostgREST: periksa dulu, baru sisipkan.
    const { data: has } = await sb.from("user_scopes").select("id").eq("user_id", id).eq("scope_type", "organization").maybeSingle();
    if (!has) {
      const { error } = await sb.from("user_scopes").insert({ user_id: id, scope_type: "organization", scope_id: null, granted_by: user.id });
      if (error) flashRedirect(BACK, { err: friendlyError(error) });
    }
  } else {
    await sb.from("user_scopes").delete().eq("user_id", id).eq("scope_type", "organization");
  }
  flashRedirect(BACK, { ok: "Peran diperbarui." });
}
