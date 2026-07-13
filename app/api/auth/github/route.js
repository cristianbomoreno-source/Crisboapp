import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getAuthorizeUrl } from "@/lib/github";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request) {
  // Ya no es el login principal — es "vincular GitHub" dentro de una cuenta
  // de Google ya iniciada. Sin sesion, no tiene sentido continuar.
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const redirectUri = new URL("/api/auth/github/callback", request.url).toString();
  const state = randomUUID();

  const res = NextResponse.redirect(getAuthorizeUrl(redirectUri, state));
  res.cookies.set("crisbofiles_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
