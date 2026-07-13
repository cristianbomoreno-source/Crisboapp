import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getAuthorizeUrl } from "@/lib/github";

export async function GET(request) {
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
