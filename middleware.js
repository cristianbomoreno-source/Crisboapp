import { NextResponse } from "next/server";

export function middleware(req) {
  const hasSession = req.cookies.get("crisbofiles_session");
  const isDashboard = req.nextUrl.pathname.startsWith("/dashboard");

  if (isDashboard && !hasSession) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
