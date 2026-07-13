import { NextResponse } from "next/server";
import { exchangeGoogleCode, getGoogleUserInfo } from "@/lib/google";
import { setSessionCookie } from "@/lib/session";
import { query } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const savedState = request.cookies.get("crisbofiles_oauth_state")?.value;

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(new URL("/login?error=state_mismatch", request.url));
  }

  try {
    const redirectUri = new URL("/api/auth/google/callback", request.url).toString();
    const accessToken = await exchangeGoogleCode(code, redirectUri);
    const profile = await getGoogleUserInfo(accessToken);

    const { rows } = await query(
      `INSERT INTO users (google_id, email, name, avatar_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (google_id) DO UPDATE
         SET email = EXCLUDED.email, name = EXCLUDED.name, avatar_url = EXCLUDED.avatar_url
       RETURNING id`,
      [profile.sub, profile.email, profile.name, profile.picture]
    );
    const userId = rows[0].id;

    const res = NextResponse.redirect(new URL("/", request.url));
    setSessionCookie(res, userId);
    res.cookies.set("crisbofiles_oauth_state", "", { path: "/", maxAge: 0 });
    return res;
  } catch (err) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(err.message)}`, request.url));
  }
}
