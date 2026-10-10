import "server-only";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/env";
import { CONTEXT_COOKIE, CONTEXT_TTL_SECONDS, signContext, type Stage } from "@/lib/auth/context";

/** Menetapkan cookie konteks anggaran (HMAC, httpOnly). Cookie hanya petunjuk; selalu divalidasi ulang ke DB. */
export async function setContextCookie(userId: string, ctx: { year: number; stage: Stage; versionId: string }) {
  const token = await signContext(serverEnv().APP_SECRET, {
    u: userId,
    y: ctx.year,
    s: ctx.stage,
    v: ctx.versionId,
    exp: Math.floor(Date.now() / 1000) + CONTEXT_TTL_SECONDS,
  });
  (await cookies()).set(CONTEXT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: CONTEXT_TTL_SECONDS,
  });
}
