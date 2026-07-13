import { NextResponse } from "next/server";
import { exchangeCodeForToken, getViewer } from "@/lib/github";
import { setSession } from "@/lib/session";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const savedState = request.cookies.get("crisbofiles_oauth_state")?.value;

  if (!code || !state || state !== savedState) {
    const res = NextResponse.redirect(new URL("/login?error=state_mismatch", request.url));
    return res;
  }

  try {
    const redirectUri = new URL("/api/auth/github/callback", request.url).toString();
    const token = await exchangeCodeForToken(code, redirectUri);
    const viewer = await getViewer(token);

    // Siempre se redirige a una ruta interna de la app, nunca a github.com.
    // "/" decide internamente (app/page.jsx) si manda a /dashboard o /login
    // segun si ya hay sesion.
    const res = NextResponse.redirect(new URL("/", request.url));
    setSession(res, {
      token,
      login: viewer.login,
      name: viewer.name,
      avatarUrl: viewer.avatar_url,
    });
    res.cookies.set("crisbofiles_oauth_state", "", { path: "/", maxAge: 0 });
    return res;
  } catch (err) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(err.message)}`, request.url)
    );
  }
}
