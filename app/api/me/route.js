import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// CRITICO: esta ruta responde "quien esta conectado ahora" — si alguna
// capa de cache (CDN de Vercel, el propio Next) llegara a guardar esta
// respuesta, un dispositivo completamente distinto podria recibir la
// sesion de otra persona (por ejemplo, ver "GitHub conectado" sin haberlo
// vinculado nunca). Por eso se fuerza dinamico + no-store en dos capas.
export async function GET() {
  const session = await getSession();

  const res = session
    ? NextResponse.json({
        user: {
          name: session.name,
          email: session.email,
          avatarUrl: session.avatarUrl,
          githubLogin: session.login,
          githubAvatarUrl: session.githubAvatarUrl,
          githubConnected: session.githubConnected,
        },
      })
    : NextResponse.json({ user: null });

  res.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
  return res;
}
