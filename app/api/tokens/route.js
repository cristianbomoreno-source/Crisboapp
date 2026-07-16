import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createApiToken, listApiTokens } from "@/lib/apiTokens";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tokens = await listApiTokens(session.userId);
  return NextResponse.json({ tokens });
}

export async function POST(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.slice(0, 80) : "";

  const created = await createApiToken(session.userId, name);
  // `token` (el valor completo) solo viaja en ESTA respuesta — a partir de
  // aqui la base de datos solo guarda su hash y no se puede volver a leer.
  return NextResponse.json({ token: created });
}
