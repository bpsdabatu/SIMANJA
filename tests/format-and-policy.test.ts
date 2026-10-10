import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatDateTimeWIB, formatInteger, formatPercent, formatRupiah } from "@/lib/format";
import { passwordSchema } from "@/lib/auth/password-policy";
import { NAV_ITEMS } from "@/lib/nav";

describe("format Indonesia", () => {
  it("Rupiah dengan pemisah ribuan titik dan desimal koma", () => {
    expect(formatRupiah(1234567.5)).toBe("Rp 1.234.567,50");
    expect(formatRupiah("1000000.00")).toBe("Rp 1.000.000,00");
    expect(formatRupiah(0)).toBe("Rp 0,00");
    expect(formatRupiah(null)).toBe("Rp 0,00");
  });
  it("negatif ditampilkan eksplisit (tidak disembunyikan)", () => {
    expect(formatRupiah(-250000)).toContain("-");
    expect(formatRupiah(-250000)).toContain("250.000,00");
  });
  it("persentase null (pagu 0) ditampilkan '-' bukan 0%", () => {
    expect(formatPercent(null)).toBe("-");
    expect(formatPercent("30.00")).toBe("30,00%");
    expect(formatPercent(0)).toBe("0,00%");
  });
  it("integer", () => expect(formatInteger(1234567)).toBe("1.234.567"));
  it("waktu dalam Asia/Jakarta (UTC+7)", () => {
    const s = formatDateTimeWIB("2026-10-10T00:30:00Z");
    expect(s).toContain("10 Oktober 2026");
    expect(s).toMatch(/07[.:]30/);
    expect(s.endsWith("WIB")).toBe(true);
    // 17:30 UTC tanggal 9 -> sudah tanggal 10 di Jakarta
    expect(formatDateTimeWIB("2026-10-09T17:30:00Z")).toContain("10 Oktober 2026");
  });
  it("tanggal tidak valid -> '-'", () => expect(formatDateTimeWIB("bukan tanggal")).toBe("-"));
});

describe("kebijakan kata sandi", () => {
  it("menerima kata sandi kuat", () => expect(passwordSchema.safeParse("KataSandi123").success).toBe(true));
  it.each(["pendek1A", "semuahurufkecil1", "SEMUAHURUFBESAR1", "TanpaAngkaSama", "a".repeat(129) + "A1"])(
    "menolak %s", (pw) => expect(passwordSchema.safeParse(pw).success).toBe(false),
  );
});

const ROOT = path.resolve(__dirname, "..");

describe("navigasi", () => {
  it("setiap menu terikat pada satu kode izin yang ada di matriks", () => {
    const known = new Set([
      "dashboard.view", "budget.view", "cashplan.view", "realization.view", "recap.view", "lra.view",
      "document.view", "master.view", "users.manage", "audit.view",
    ]);
    for (const i of NAV_ITEMS) expect(known.has(i.permission), i.label).toBe(true);
  });
  it("seluruh menu aktif dan setiap tujuan memiliki halaman", () => {
    for (const i of NAV_ITEMS) {
      const file = path.join(ROOT, "src", "app", "(app)", i.href.slice(1), "page.tsx");
      expect(existsSync(file), `${i.label} -> ${i.href}`).toBe(true);
    }
  });
  it("href unik dan label tidak kosong", () => {
    expect(new Set(NAV_ITEMS.map((i) => i.href)).size).toBe(NAV_ITEMS.length);
    for (const i of NAV_ITEMS) expect(i.label.length).toBeGreaterThan(0);
  });
});
