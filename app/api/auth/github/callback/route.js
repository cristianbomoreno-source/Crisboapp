import { NextResponse } from "next/server";
import { exchangeCodeForToken, getViewer } from "@/lib/github";
import { getSession } from "@/lib/session";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const savedState = request.cookies.get("crisbofiles_oauth_state")?.value;

  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(new URL("/dashboard?error=github_state_mismatch", request.url));
  }

  try {
    const redirectUri = new URL("/api/auth/github/callback", request.url).toString();
    const token = await exchangeCodeForToken(code, redirectUri);
    const viewer = await getViewer(token);

    // Se guarda en la fila del usuario ya logueado con Google — asi queda
    // vinculado a la cuenta, no a esta cookie ni a este navegador.
    await query(
      `UPDATE users SET github_token = $1, github_login = $2, github_avatar_url = $3 WHERE id = $4`,
      [token, viewer.login, viewer.avatar_url, session.userId]
    );
    console.log(`[auth/github] vinculado — userId=${session.userId} github_login=${viewer.login}`);

    const res = NextResponse.redirect(new URL("/dashboard", request.url));
    res.headers.set("Cache-Control", "no-store, max-age=0");
    res.cookies.set("crisbofiles_oauth_state", "", { path: "/", maxAge: 0 });
    return res;
  } catch (err) {
    return NextResponse.redirect(
      new URL(`/dashboard?error=${encodeURIComponent(err.message)}`, request.url)
    );
  }
}
