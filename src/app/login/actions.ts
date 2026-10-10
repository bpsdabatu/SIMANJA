"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { performLogin } from "@/lib/auth/login-core";
import { buildLoginDeps } from "@/lib/auth/login-deps";

export interface FormState {
  error?: string;
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;

  let mustChange = false;
  try {
    const result = await performLogin(await buildLoginDeps(), { username, password, ip });
    if (!result.ok) return { error: result.message };
    mustChange = result.mustChangePassword;
  } catch (err) {
    // Jangan bocorkan detail internal; catat di log server saja.
    console.error("[login] kesalahan sistem", err instanceof Error ? err.message : "unknown");
    return { error: "Terjadi kesalahan pada sistem. Silakan coba lagi atau hubungi administrator." };
  }
  redirect(mustChange ? "/ganti-password" : "/pilih-konteks");
}
