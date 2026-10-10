import { b64urlDecode, b64urlEncode, hmacSign, hmacVerify, keyedHash } from "@/lib/auth/crypto";

/**
 * Kode keamanan (CAPTCHA) tanpa layanan pihak ketiga.
 *  - Jawaban TIDAK dikirim ke browser: token memuat hash berkunci (HMAC) dari jawaban + nonce.
 *  - Kedaluwarsa 5 menit; nonce hanya boleh dipakai SEKALI (dicatat di database oleh login-deps).
 *  - Ini penghalang otomatisasi sederhana, bukan pengganti pembatasan percobaan & kata sandi kuat.
 */
export const CAPTCHA_TTL_SECONDS = 300;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // tanpa I, O, 0, 1 agar tidak ambigu
const LENGTH = 5;

const enc = new TextEncoder();
const dec = new TextDecoder();

interface Payload { n: string; h: string; e: number }

export function normalizeAnswer(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

function randomInt(max: number): number {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0xffffffff / max) * max;
  do crypto.getRandomValues(buf); while (buf[0]! >= limit);
  return buf[0]! % max;
}

export function randomCode(): string {
  let s = "";
  for (let i = 0; i < LENGTH; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

export function renderCaptchaSvg(code: string): string {
  const W = 168, H = 56;
  const colors = ["#0e2e52", "#1b4b81", "#a47f33", "#143d6b"];
  let body = `<rect width="${W}" height="${H}" rx="8" fill="#f1f5f9"/>`;
  for (let i = 0; i < 6; i++) {
    body += `<path d="M${randomInt(W)} ${randomInt(H)} Q${randomInt(W)} ${randomInt(H)} ${randomInt(W)} ${randomInt(H)}" stroke="${colors[randomInt(colors.length)]}" stroke-opacity=".28" stroke-width="1.4" fill="none"/>`;
  }
  for (let i = 0; i < 24; i++) {
    body += `<circle cx="${randomInt(W)}" cy="${randomInt(H)}" r="${1 + randomInt(2)}" fill="#64748b" fill-opacity=".25"/>`;
  }
  const step = (W - 28) / code.length;
  [...code].forEach((ch, i) => {
    const x = 18 + i * step + randomInt(5);
    const y = 36 + randomInt(8) - 4;
    const rot = randomInt(41) - 20;
    const size = 26 + randomInt(6);
    body += `<text x="${x.toFixed(1)}" y="${y}" font-family="Montserrat, Arial, sans-serif" font-weight="800" font-size="${size}" fill="${colors[randomInt(colors.length)]}" transform="rotate(${rot} ${x.toFixed(1)} ${y})">${ch}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`;
}

export function svgToDataUri(svg: string): string {
  const bytes = enc.encode(svg);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return `data:image/svg+xml;base64,${btoa(bin)}`;
}

export async function createCaptcha(
  secret: string,
  nowMs: number = Date.now(),
): Promise<{ token: string; image: string; code: string }> {
  const code = randomCode();
  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  const n = b64urlEncode(nonceBytes);
  const payload: Payload = {
    n,
    h: await keyedHash(secret, `captcha:${n}`, code),
    e: Math.floor(nowMs / 1000) + CAPTCHA_TTL_SECONDS,
  };
  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  const token = `${body}.${await hmacSign(secret, body)}`;
  return { token, image: svgToDataUri(renderCaptchaSvg(code)), code };
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export interface OpenedCaptcha { nonce: string; hash: string; exp: number }

/** Langkah 1: tanda tangan + kedaluwarsa. Belum memeriksa jawaban (agar nonce dapat dihabiskan lebih dulu). */
export async function openCaptchaToken(
  secret: string,
  token: string,
  nowMs: number = Date.now(),
): Promise<OpenedCaptcha | null> {
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  if (!(await hmacVerify(secret, body, sig))) return null;
  let p: Payload;
  try {
    p = JSON.parse(dec.decode(b64urlDecode(body)));
  } catch {
    return null;
  }
  if (typeof p.n !== "string" || typeof p.h !== "string" || typeof p.e !== "number") return null;
  if (p.e <= Math.floor(nowMs / 1000)) return null;
  return { nonce: p.n, hash: p.h, exp: p.e };
}

/** Langkah 2: bandingkan jawaban (waktu-konstan). */
export async function checkCaptchaAnswer(secret: string, opened: OpenedCaptcha, answer: string): Promise<boolean> {
  const given = normalizeAnswer(answer);
  if (given.length !== LENGTH) return false;
  const expected = await keyedHash(secret, `captcha:${opened.nonce}`, given);
  return safeEqual(expected, opened.hash);
}
