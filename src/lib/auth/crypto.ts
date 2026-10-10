/**
 * Primitif kripto berbasis Web Crypto: berjalan di Node (server actions) maupun Edge (middleware).
 * Tidak mengimpor modul Node apa pun.
 */
const enc = new TextEncoder();

export function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(str: string): Uint8Array {
  const pad = "=".repeat((4 - (str.length % 4)) % 4);
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

export async function hmacSign(secret: string, data: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), enc.encode(data));
  return b64urlEncode(new Uint8Array(sig));
}

/** Verifikasi waktu-konstan (crypto.subtle.verify). */
export async function hmacVerify(secret: string, data: string, signature: string): Promise<boolean> {
  try {
    return await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret, "verify"),
      b64urlDecode(signature) as BufferSource,
      enc.encode(data),
    );
  } catch {
    return false;
  }
}

/** Hash berkunci (HMAC) untuk username/IP pada log; tidak dapat dibalik tanpa kunci. */
export async function keyedHash(secret: string, purpose: string, value: string): Promise<string> {
  return (await hmacSign(secret, `${purpose}:${value}`)).slice(0, 43);
}
