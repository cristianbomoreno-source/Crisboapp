import { NextResponse } from "next/server";
import { clearSession } from "@/lib/session";

export async function POST(req) {
  const res = NextResponse.redirect(new URL("/login", req.url));
  clearSession(res);
  return res;
}
