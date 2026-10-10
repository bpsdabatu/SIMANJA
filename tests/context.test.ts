import { describe, expect, it } from "vitest";
import { b64urlEncode } from "@/lib/auth/crypto";
import { signContext, verifyContext, type ContextPayload } from "@/lib/auth/context";

const SECRET = "x".repeat(40);
const NOW = 1_800_000_000;
const base: ContextPayload = { u: "user-1", y: 2026, s: "murni", v: "ver-1", exp: NOW + 3600 };

describe("cookie konteks anggaran", () => {
  it("roundtrip sah", async () => {
    const t = await signContext(SECRET, base);
    expect(await verifyContext(SECRET, t, { userId: "user-1", now: NOW })).toEqual(base);
  });

  it("menolak token kosong/rusak/berformat salah", async () => {
    for (const bad of [undefined, "", "abc", "a.b.c", "....", "x."]) {
      expect(await verifyContext(SECRET, bad, { now: NOW })).toBeNull();
    }
  });

  it("menolak isi yang dimodifikasi (tahun/tahapan/versi tidak dapat dipalsukan)", async () => {
    const t = await signContext(SECRET, base);
    const sig = t.split(".")[1]!;
    const forged = b64urlEncode(new TextEncoder().encode(JSON.stringify({ ...base, y: 2025, s: "perubahan", v: "ver-lain" })));
    expect(await verifyContext(SECRET, `${forged}.${sig}`, { now: NOW })).toBeNull();
  });

  it("menolak tanda tangan dengan kunci berbeda", async () => {
    const t = await signContext("y".repeat(40), base);
    expect(await verifyContext(SECRET, t, { now: NOW })).toBeNull();
  });

  it("menolak token kedaluwarsa", async () => {
    const t = await signContext(SECRET, { ...base, exp: NOW - 1 });
    expect(await verifyContext(SECRET, t, { now: NOW })).toBeNull();
    const t2 = await signContext(SECRET, { ...base, exp: NOW });
    expect(await verifyContext(SECRET, t2, { now: NOW })).toBeNull();
  });

  it("terikat pada pengguna: token pengguna lain ditolak", async () => {
    const t = await signContext(SECRET, base);
    expect(await verifyContext(SECRET, t, { userId: "user-2", now: NOW })).toBeNull();
  });

  it("menolak tahapan di luar Murni/Pergeseran/Perubahan walau ditandatangani sah", async () => {
    const t = await signContext(SECRET, { ...base, s: "bebas" as never });
    expect(await verifyContext(SECRET, t, { now: NOW })).toBeNull();
  });

  it("menolak tahun non-integer walau ditandatangani sah", async () => {
    const t = await signContext(SECRET, { ...base, y: 2026.5 });
    expect(await verifyContext(SECRET, t, { now: NOW })).toBeNull();
  });
});
