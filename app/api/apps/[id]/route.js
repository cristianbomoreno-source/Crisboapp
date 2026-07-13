import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { query } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(request, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  await query("DELETE FROM apps WHERE id = $1 AND user_id = $2", [params.id, session.userId]);
  return NextResponse.json({ ok: true });
}
