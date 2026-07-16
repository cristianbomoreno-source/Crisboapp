import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { revokeApiToken } from "@/lib/apiTokens";

export const runtime = "nodejs";

export async function DELETE(_request, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const ok = await revokeApiToken(session.userId, Number(params.id));
  if (!ok) {
    return NextResponse.json({ error: "Token no encontrado (o ya estaba revocado)" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
