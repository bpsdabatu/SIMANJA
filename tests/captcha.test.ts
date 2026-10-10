import { describe, expect, it } from "vitest";
import {
  CAPTCHA_TTL_SECONDS, checkCaptchaAnswer, createCaptcha, normalizeAnswer, openCaptchaToken, randomCode,
} from "@/lib/auth/captcha";

const SECRET = "x".repeat(40);

describe("captcha", () => {
  it("kode 5 karakter tanpa karakter ambigu", () => {
    for (let i = 0; i < 200; i++) expect(randomCode()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/);
  });

  it("jawaban tidak muncul di token maupun gambar (hanya hash berkunci)", async () => {
    const c = await createCaptcha(SECRET);
    expect(c.token).not.toContain(c.code);
    const svg = Buffer.from(c.image.split(",")[1]!, "base64").toString("utf8");
    expect(c.image.startsWith("data:image/svg+xml;base64,")).toBe(true);
    // Kode digambar per huruf (terpisah), bukan string utuh yang mudah diekstrak
    expect(svg).not.toContain(c.code);
    expect(svg).toContain("<svg");
  });

  it("jawaban benar diterima (tanpa memedulikan huruf besar/kecil & spasi), salah ditolak", async () => {
    const c = await createCaptcha(SECRET);
    const opened = await openCaptchaToken(SECRET, c.token);
    expect(opened).not.toBeNull();
    expect(await checkCaptchaAnswer(SECRET, opened!, ` ${c.code.toLowerCase()} `)).toBe(true);
    expect(await checkCaptchaAnswer(SECRET, opened!, c.code.replace(/.$/, c.code.endsWith("A") ? "B" : "A"))).toBe(false);
    expect(await checkCaptchaAnswer(SECRET, opened!, "")).toBe(false);
  });

  it("token dengan tanda tangan salah / dirusak / rahasia berbeda ditolak", async () => {
    const c = await createCaptcha(SECRET);
    expect(await openCaptchaToken("y".repeat(40), c.token)).toBeNull();
    expect(await openCaptchaToken(SECRET, c.token.slice(0, -2) + "AA")).toBeNull();
    expect(await openCaptchaToken(SECRET, "a.b.c")).toBeNull();
    expect(await openCaptchaToken(SECRET, "")).toBeNull();
    const [body, sig] = c.token.split(".");
    expect(await openCaptchaToken(SECRET, `${body!.slice(0, -1)}A.${sig}`)).toBeNull();
  });

  it("kedaluwarsa setelah 5 menit", async () => {
    const t0 = Date.parse("2026-10-10T00:00:00Z");
    const c = await createCaptcha(SECRET, t0);
    expect(await openCaptchaToken(SECRET, c.token, t0 + (CAPTCHA_TTL_SECONDS - 1) * 1000)).not.toBeNull();
    expect(await openCaptchaToken(SECRET, c.token, t0 + CAPTCHA_TTL_SECONDS * 1000)).toBeNull();
  });

  it("nonce unik per kode", async () => {
    const a = await openCaptchaToken(SECRET, (await createCaptcha(SECRET)).token);
    const b = await openCaptchaToken(SECRET, (await createCaptcha(SECRET)).token);
    expect(a!.nonce).not.toEqual(b!.nonce);
  });

  it("normalizeAnswer", () => {
    expect(normalizeAnswer(" ab 3kd ")).toBe("AB3KD");
  });
});
