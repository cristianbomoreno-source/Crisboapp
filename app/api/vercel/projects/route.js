import { NextResponse } from "next/server";
import { listProjects } from "@/lib/vercel";

export async function GET(req) {
  const token = req.nextUrl.searchParams.get("token");
  const teamId = req.nextUrl.searchParams.get("teamId") || undefined;
  if (!token) return NextResponse.json({ error: "Falta el token de Vercel" }, { status: 400 });

  try {
    const projects = await listProjects(token, teamId);
    return NextResponse.json({ projects });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
