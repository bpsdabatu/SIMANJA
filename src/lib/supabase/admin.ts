import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Klien service role. Melewati RLS -> HANYA untuk operasi server yang sudah
 * melalui pemeriksaan otorisasi eksplisit (resolusi username, log percobaan login,
 * audit autentikasi, administrasi akun). Jangan pernah mengembalikan hasilnya mentah
 * ke browser dan jangan mengimpor modul ini dari komponen klien.
 */
let cached: SupabaseClient | null = null;
export function adminClient(): SupabaseClient {
  if (cached) return cached;
  const pub = publicEnv();
  const srv = serverEnv();
  cached = createClient(pub.NEXT_PUBLIC_SUPABASE_URL, srv.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
