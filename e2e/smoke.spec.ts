import { expect, test } from "@playwright/test";

test.describe("gerbang akses (tanpa sesi)", () => {
  for (const path of ["/dashboard", "/pilih-konteks", "/ganti-password", "/anggaran", "/"]) {
    test(`${path} dialihkan ke /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    });
  }

  test("respons membawa header keamanan", async ({ request }) => {
    const res = await request.get("/login");
    const h = res.headers();
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-powered-by"]).toBeUndefined();
  });
});

test.describe("halaman login", () => {
  test("memakai Bahasa Indonesia dan memiliki field berlabel", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("lang", "id");
    await expect(page.getByRole("heading", { name: "Masuk" })).toBeVisible();
    await expect(page.getByLabel("Username")).toBeVisible();
    await expect(page.getByLabel("Kata sandi", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Masuk" })).toBeVisible();
  });

  test("tidak ada kolom email (login memakai username)", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
    await expect(page.getByLabel("Username")).toHaveAttribute("autocomplete", "username");
  });

  test("tombol tampilkan/sembunyikan kata sandi bekerja dan dapat dioperasikan keyboard", async ({ page }) => {
    await page.goto("/login");
    const pw = page.getByLabel("Kata sandi", { exact: true });
    await expect(pw).toHaveAttribute("type", "password");
    const toggle = page.getByRole("button", { name: "Tampilkan kata sandi" });
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(pw).toHaveAttribute("type", "text");
    await expect(page.getByRole("button", { name: "Sembunyikan kata sandi" })).toHaveAttribute("aria-pressed", "true");
  });

  test("galat sistem tidak membocorkan detail internal", async ({ page }) => {
    // Supabase tidak tersedia pada lingkungan e2e ini -> pesan sistem generik, tanpa stack/URL/kunci.
    await page.goto("/login");
    await page.getByLabel("Username").fill("pengguna.uji");
    await page.getByLabel("Kata sandi", { exact: true }).fill("KataSandiUji123");
    await page.getByRole("button", { name: "Masuk" }).click();
    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible({ timeout: 15_000 });
    const text = (await alert.innerText()).toLowerCase();
    for (const leak of ["supabase", "127.0.0.1", "econnrefused", "fetch failed", "service", "stack", "invalid"]) {
      expect(text).not.toContain(leak);
    }
  });

  test("tidak ada overflow horizontal pada lebar ponsel", async ({ page }) => {
    await page.goto("/login");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });
});
