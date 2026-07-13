import { NextResponse } from "next/server";
import { triggerDeployHook } from "@/lib/vercel";

export async function POST(req) {
  const { hookUrl } = await req.json();
  if (!hookUrl) return NextResponse.json({ error: "Falta el Deploy Hook URL" }, { status: 400 });

  try {
    const data = await triggerDeployHook(hookUrl);
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
