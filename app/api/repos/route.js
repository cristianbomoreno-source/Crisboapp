import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listRepos } from "@/lib/github";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!session.githubConnected) {
    return NextResponse.json({ error: "GitHub no esta vinculado a tu cuenta" }, { status: 409 });
  }

  try {
    const repos = await listRepos(session.token);
    return NextResponse.json({ repos });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
