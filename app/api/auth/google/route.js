import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getGoogleAuthorizeUrl } from "@/lib/google";

export async function GET(request) {
  const redirectUri = new URL("/api/auth/google/callback", request.url).toString();
  const state = randomUUID();

  const res = NextResponse.redirect(getGoogleAuthorizeUrl(redirectUri, state));
  res.cookies.set("crisbofiles_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
