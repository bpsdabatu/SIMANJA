import "server-only";
import { redirect } from "next/navigation";
import { requireContext } from "@/lib/auth/session";

/** Konteks + sesi + izin modul. Pengguna tanpa izin dialihkan ke dasbor (RLS tetap penentu akses data). */
export async function requireModule(permission: string) {
  const ctx = await requireContext();
  if (!ctx.user.permissions.has(permission)) redirect("/dashboard?akses=ditolak");
  return ctx;
}
