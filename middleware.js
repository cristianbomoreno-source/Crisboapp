import { NextResponse } from "next/server";

export function middleware(req) {
  const hasSession = req.cookies.get("crisbofiles_session");
  const isDashboard = req.nextUrl.pathname.startsWith("/dashboard");

  if (isDashboard && !hasSession) {
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.headers.set("Cache-Control", "no-store, max-age=0");
    return res;
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
