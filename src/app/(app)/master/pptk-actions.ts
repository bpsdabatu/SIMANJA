"use server";

import { randomInt, randomUUID } from "node:crypto";
import { requireModule } from "@/lib/auth/guard";
import { adminClient } from "@/lib/supabase/admin";
import { readTable, normHeader } from "@/lib/spreadsheet";
import { USERNAME_RE } from "@/lib/auth/login-core";

export interface PptkImportState {
  error?: string;
  created?: { username: string; name: string; password: string }[];
  failed?: string[];
}

const COLS = { username: ["username", "nama_pengguna", "user"], name: ["nama_lengkap", "nama", "name"], nip: ["nip"], position: ["jabatan", "position", "jabatan_pptk"] };

/** Kata sandi sementara acak (12 karakter; memenuhi kebijakan: huruf besar, kecil, angka). */
function tempPassword(): string {
  const U = "ABCDEFGHJKLMNPQRSTUVWXYZ", L = "abcdefghijkmnopqrstuvwxyz", D = "23456789";
  const pick = (s: string) => s[randomInt(s.length)]!;
  const chars = [pick(U), pick(U), pick(L), pick(L), pick(L), pick(L), pick(D), pick(D), pick(D), pick(U + L + D), pick(U + L + D), pick(U + L + D)];
  for (let i = chars.length - 1; i > 0; i--) { const j = randomInt(i + 1); [chars[i], chars[j]] = [chars[j]!, chars[i]!]; }
  return chars.join("");
}

/**
 * Impor PPTK dari Excel/CSV: membuat akun berperan PPTK dengan kata sandi sementara acak
 * (wajib diganti saat masuk pertama). Seluruh baris divalidasi lebih dulu; bila ada masalah tidak ada akun dibuat.
 */
export async function importPptkAction(_prev: PptkImportState, fd: FormData): Promise<PptkImportState> {
  const { user } = await requireModule("users.manage");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Pilih berkas Excel (.xlsx) atau CSV." };
  const read = await readTable(file);
  if (!read.ok) return { error: read.error };
  const table = read.rows;
  const header = (table[0] ?? []).map(normHeader);
  const idx = (aliases: string[]) => header.findIndex((h) => aliases.includes(h));
  const iU = idx(COLS.username), iN = idx(COLS.name), iNip = idx(COLS.nip), iPos = idx(COLS.position);
  if (iU === -1 || iN === -1) return { error: "Kolom wajib: username dan nama_lengkap (opsional: nip, jabatan)." };
  const data = table.slice(1);
  if (data.length === 0) return { error: "Berkas tidak berisi baris data." };
  if (data.length > 200) return { error: "Maksimal 200 PPTK per impor." };

  const admin = adminClient();
  const { data: existing } = await admin.from("profiles").select("username").limit(20000);
  const taken = new Set((existing ?? []).map((p) => String(p.username)));
  const problems: string[] = [];
  const seen = new Set<string>();
  const rows = data.map((r, i) => {
    const line = i + 2;
    const username = (r[iU] ?? "").trim().toLowerCase();
    const fullName = (r[iN] ?? "").trim();
    if (!USERNAME_RE.test(username)) problems.push(`Baris ${line}: username "${username}" tidak valid (3–32 karakter: huruf kecil, angka, titik, garis bawah, strip)`);
    else if (taken.has(username)) problems.push(`Baris ${line}: username "${username}" sudah dipakai`);
    else if (seen.has(username)) problems.push(`Baris ${line}: username "${username}" ganda dalam berkas`);
    if (!fullName) problems.push(`Baris ${line}: nama lengkap kosong`);
    seen.add(username);
    return { line, username, fullName: fullName.slice(0, 150), nip: iNip >= 0 ? (r[iNip] ?? "").trim().slice(0, 30) || null : null, position: iPos >= 0 ? (r[iPos] ?? "").trim().slice(0, 150) || null : null };
  });
  if (problems.length) return { error: `Impor dibatalkan, tidak ada akun dibuat. ${problems.length} masalah: ${problems.slice(0, 5).join("; ")}${problems.length > 5 ? " ..." : ""}` };

  const created: NonNullable<PptkImportState["created"]> = [];
  const failed: string[] = [];
  for (const r of rows) {
    const password = tempPassword();
    const internalEmail = `${randomUUID()}@auth.simaspraja.invalid`;
    const made = await admin.auth.admin.createUser({ email: internalEmail, password, email_confirm: true });
    if (made.error || !made.data.user) { failed.push(`Baris ${r.line} (@${r.username}): akun tidak dapat dibuat`); continue; }
    const uid = made.data.user.id;
    let ok = true;
    try {
      const p = await admin.from("profiles").insert({ id: uid, organization_id: user.organizationId, username: r.username, full_name: r.fullName, nip: r.nip, position_title: r.position, must_change_password: true });
      if (p.error) throw new Error(p.error.message);
      for (const s of [
        admin.from("auth_identities").insert({ profile_id: uid, internal_email: internalEmail }),
        admin.from("user_roles").insert({ user_id: uid, role_code: "pptk", granted_by: user.id }),
      ]) { const x = await s; if (x.error) throw new Error(x.error.message); }
    } catch (e) {
      console.error("[master/pptk] simpan profil", e instanceof Error ? e.message : "unknown");
      ok = false;
      await admin.from("user_roles").delete().eq("user_id", uid);
      await admin.from("auth_identities").delete().eq("profile_id", uid);
      await admin.from("profiles").delete().eq("id", uid);
      await admin.auth.admin.deleteUser(uid);
      failed.push(`Baris ${r.line} (@${r.username}): profil tidak dapat disimpan`);
    }
    if (ok) {
      created.push({ username: r.username, name: r.fullName, password });
      await admin.from("audit_logs").insert({ action: "USER_CREATED", actor_id: user.id, organization_id: user.organizationId, table_name: "profiles", record_id: uid, context: { username: r.username, roles: ["pptk"], via: "master-import" } });
    }
  }
  return { created, failed: failed.length ? failed : undefined };
}
