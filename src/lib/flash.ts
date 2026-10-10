import { redirect } from "next/navigation";

/** Pesan singkat satu-kali lewat query string (tanpa data sensitif). */
export function flashRedirect(path: string, msg: { ok?: string; err?: string }): never {
  const u = new URL(path, "http://x");
  if (msg.ok) u.searchParams.set("ok", msg.ok.slice(0, 200));
  if (msg.err) u.searchParams.set("err", msg.err.slice(0, 200));
  redirect(u.pathname + u.search);
}

export interface FlashParams {
  ok?: string;
  err?: string;
}
