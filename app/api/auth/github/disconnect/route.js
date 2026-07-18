import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Desvincula GitHub de la cuenta actual (borra el token guardado). No
// cierra la sesion de crisbofiles ni afecta a github.com — solo hace que
// crisbofiles deje de tener acceso hasta que se vuelva a vincular.
export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  await query(
    `UPDATE users SET github_token = NULL, github_login = NULL, github_avatar_url = NULL WHERE id = $1`,
    [session.userId]
  );
  console.log(`[auth/github] desvinculado — userId=${session.userId}`);

  const res = NextResponse.json({ ok: true });
  res.headers.set("Cache-Control", "no-store, max-age=0");
  return res;
}
