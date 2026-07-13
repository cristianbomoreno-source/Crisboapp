import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/session";

export async function POST(req) {
  const res = NextResponse.redirect(new URL("/login", req.url));
  clearSessionCookie(res);
  return res;
}
