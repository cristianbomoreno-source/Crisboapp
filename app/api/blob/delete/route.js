import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  if (!process.env.UPLOADS_READ_WRITE_TOKEN) {
    throw new Error("Falta la variable de entorno UPLOADS_READ_WRITE_TOKEN");
  }

  const { zipUrl } = await request.json();
  if (!zipUrl) return NextResponse.json({ ok: true });

  try {
    await del(zipUrl, { token: process.env.UPLOADS_READ_WRITE_TOKEN });
  } catch {
    // best-effort, no es critico si falla
  }
  return NextResponse.json({ ok: true });
}
