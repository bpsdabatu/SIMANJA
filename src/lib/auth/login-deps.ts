import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import { userClient } from "@/lib/supabase/server";
import { keyedHash } from "@/lib/auth/crypto";
import { serverEnv } from "@/lib/env";
import type { LoginDeps, ProfileLookup } from "@/lib/auth/login-core";

/** Implementasi nyata `LoginDeps` (server saja). */
export async function buildLoginDeps(): Promise<LoginDeps> {
  const env = serverEnv();
  const admin = adminClient();
  const supabase = await userClient();

  return {
    config: {
      maxFailuresPerUser: env.LOGIN_MAX_FAILURES_PER_USER,
      maxFailuresPerIp: env.LOGIN_MAX_FAILURES_PER_IP,
      windowMinutes: env.LOGIN_WINDOW_MINUTES,
    },
    now: () => new Date(),
    hash: (purpose, value) => keyedHash(env.APP_SECRET, purpose, value),

    async countFailures(by, hash, sinceIso) {
      const { count, error } = await admin
        .from("auth_attempts")
        .select("id", { count: "exact", head: true })
        .eq(by, hash)
        .eq("succeeded", false)
        .gte("attempted_at", sinceIso);
      if (error) throw new Error("Gagal memeriksa pembatasan login");
      return count ?? 0;
    },

    async recordAttempt({ usernameHash, ipHash, succeeded }) {
      await admin.from("auth_attempts").insert({
        username_hash: usernameHash,
        ip_hash: ipHash,
        succeeded,
      });
    },

    async findProfile(username): Promise<ProfileLookup | null> {
      const { data, error } = await admin
        .from("profiles")
        .select("id, status, organization_id, must_change_password, auth_identities(internal_email)")
        .eq("username", username)
        .maybeSingle();
      if (error || !data) return null;
      const identity = Array.isArray(data.auth_identities) ? data.auth_identities[0] : data.auth_identities;
      if (!identity?.internal_email) return null;
      return {
        id: data.id,
        status: data.status,
        organizationId: data.organization_id,
        internalEmail: identity.internal_email,
        mustChangePassword: data.must_change_password,
      };
    },

    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { ok: !error };
    },

    async audit({ action, actorId, organizationId, ipHash, context }) {
      await admin.from("audit_logs").insert({
        action,
        actor_id: actorId ?? null,
        organization_id: organizationId ?? null,
        table_name: "auth",
        ip_hash: ipHash,
        context: context ?? null,
      });
    },

    async touchLastLogin(profileId) {
      await admin.from("profiles").update({ last_login_at: new Date().toISOString() }).eq("id", profileId);
    },
  };
}
