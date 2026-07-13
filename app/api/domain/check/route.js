import { NextResponse } from "next/server";
import { checkDomain } from "@/lib/dns";

export const runtime = "nodejs";

export async function GET(req) {
  const domain = req.nextUrl.searchParams.get("domain");
  if (!domain) return NextResponse.json({ error: "Falta el dominio" }, { status: 400 });

  try {
    const result = await checkDomain(domain);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
