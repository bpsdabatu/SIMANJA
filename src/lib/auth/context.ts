import { b64urlDecode, b64urlEncode, hmacSign, hmacVerify } from "@/lib/auth/crypto";

/**
 * Cookie konteks anggaran (tahun + tahapan). Bertanda tangan HMAC dan terikat pada ID pengguna.
 * Cookie ini hanya PETUNJUK; setiap operasi terproteksi tetap memvalidasi ulang konteks
 * ke database lewat RPC resolve_budget_context (berbasis RLS/izin pengguna).
 */
export const CONTEXT_COOKIE = "simaspraja_ctx";
export const CONTEXT_TTL_SECONDS = 12 * 60 * 60;

export const STAGES = ["murni", "pergeseran", "perubahan"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<Stage, string> = {
  murni: "Murni",
  pergeseran: "Pergeseran",
  perubahan: "Perubahan",
};

export interface ContextPayload {
  u: string; // user id
  y: number; // tahun anggaran
  s: Stage; // tahapan
  v: string; // budget_version_id
  exp: number; // epoch detik
}

const dec = new TextDecoder();
const enc = new TextEncoder();

export function isStage(x: unknown): x is Stage {
  return typeof x === "string" && (STAGES as readonly string[]).includes(x);
}

export async function signContext(secret: string, p: ContextPayload): Promise<string> {
  const body = b64urlEncode(enc.encode(JSON.stringify(p)));
  return `${body}.${await hmacSign(secret, body)}`;
}

export async function verifyContext(
  secret: string,
  token: string | undefined,
  opts: { userId?: string; now?: number } = {},
): Promise<ContextPayload | null> {
  if (!token) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  if (!(await hmacVerify(secret, body, sig))) return null;
  let p: ContextPayload;
  try {
    p = JSON.parse(dec.decode(b64urlDecode(body)));
  } catch {
    return null;
  }
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (
    typeof p.u !== "string" || typeof p.v !== "string" || typeof p.exp !== "number" ||
    !Number.isInteger(p.y) || !isStage(p.s)
  ) return null;
  if (p.exp <= now) return null;
  if (opts.userId !== undefined && p.u !== opts.userId) return null;
  return p;
}
