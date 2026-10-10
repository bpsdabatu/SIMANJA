import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Tes statis keamanan: memastikan rahasia server dan modul server-only tidak bocor ke bundel klien,
 * dan bahwa contoh env hanya berisi placeholder.
 */
const ROOT = path.resolve(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
const srcFiles = walk(path.join(ROOT, "src"));
const rel = (f: string) => path.relative(ROOT, f);
const isClient = (code: string) => /^\s*(\/\*[\s\S]*?\*\/\s*)?["']use client["']/.test(code);

const SERVER_ONLY_IMPORTS = [
  "@/lib/supabase/admin", "@/lib/supabase/server", "@/lib/auth/login-deps", "@/lib/auth/session", "@/lib/env",
];

describe("pemisahan server/klien", () => {
  it("komponen klien tidak mengimpor modul server-only atau klien admin", () => {
    const offenders: string[] = [];
    for (const f of srcFiles) {
      const code = readFileSync(f, "utf8");
      if (!isClient(code)) continue;
      for (const bad of SERVER_ONLY_IMPORTS) if (code.includes(`"${bad}"`)) offenders.push(`${rel(f)} -> ${bad}`);
    }
    expect(offenders).toEqual([]);
  });

  it("modul yang memuat rahasia ditandai 'server-only'", () => {
    for (const f of ["src/lib/env.ts", "src/lib/supabase/admin.ts", "src/lib/supabase/server.ts", "src/lib/auth/login-deps.ts", "src/lib/auth/session.ts"]) {
      expect(readFileSync(path.join(ROOT, f), "utf8"), f).toContain('import "server-only"');
    }
  });

  it("SUPABASE_SERVICE_ROLE_KEY hanya dibaca di env.ts (tidak pernah NEXT_PUBLIC_)", () => {
    const users = srcFiles.filter((f) => readFileSync(f, "utf8").includes("SERVICE_ROLE")).map(rel);
    // env.ts (skema) dan supabase/admin.ts (klien) - keduanya server-only
    expect(users.sort()).toEqual(["src/lib/env.ts", "src/lib/supabase/admin.ts"]);
    for (const f of srcFiles) expect(readFileSync(f, "utf8")).not.toMatch(/NEXT_PUBLIC_[A-Z_]*SERVICE/);
  });

  it("tidak ada penggunaan getSession() untuk keputusan otorisasi (hanya getUser())", () => {
    for (const f of srcFiles) expect(readFileSync(f, "utf8"), rel(f)).not.toMatch(/auth\.getSession\(/);
  });

  it("tidak ada dangerouslySetInnerHTML (cegah XSS)", () => {
    for (const f of srcFiles) expect(readFileSync(f, "utf8"), rel(f)).not.toContain("dangerouslySetInnerHTML");
  });
});

describe(".env.example", () => {
  const env = readFileSync(path.join(ROOT, ".env.example"), "utf8");
  it("hanya berisi placeholder (tanpa JWT/kunci sungguhan)", () => {
    expect(env).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    expect(env).not.toMatch(/sb_secret_/);
    expect(env).toContain("YOUR_SUPABASE_SERVICE_ROLE_KEY");
  });
  it("tidak ada variabel NEXT_PUBLIC_ untuk service role", () => {
    expect(env).not.toMatch(/NEXT_PUBLIC_[A-Z_]*SERVICE/);
  });
});

describe("migrasi", () => {
  const dir = path.join(ROOT, "supabase", "migrations");
  const sql = readdirSync(dir).filter((f) => f.endsWith(".sql")).map((f) => [f, readFileSync(path.join(dir, f), "utf8")] as const);
  const all = sql.map(([, s]) => s).join("\n");

  it("setiap tabel public diberi RLS (loop enable RLS pada seluruh tabel public)", () => {
    expect(all).toMatch(/alter table public\.%I enable row level security/);
  });
  it("tidak ada tipe float/real/double untuk uang", () => {
    expect(all).not.toMatch(/\b(float|double precision|real)\b(?!\s*key)/i);
  });
  it("tidak ada kredensial tertanam di migrasi", () => {
    expect(all).not.toMatch(/password\s*=\s*'/i);
  });
});
