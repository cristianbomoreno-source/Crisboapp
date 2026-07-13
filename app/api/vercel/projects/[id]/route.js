import { NextResponse } from "next/server";
import { getLatestDeployment, getDomains, getEnvVars } from "@/lib/vercel";

export async function GET(req, { params }) {
  const token = req.nextUrl.searchParams.get("token");
  const teamId = req.nextUrl.searchParams.get("teamId") || undefined;
  if (!token) return NextResponse.json({ error: "Falta el token de Vercel" }, { status: 400 });

  try {
    const [deployment, domains, envVars] = await Promise.all([
      getLatestDeployment(params.id, token, teamId),
      getDomains(params.id, token, teamId).catch(() => []),
      getEnvVars(params.id, token, teamId).catch(() => []),
    ]);
    return NextResponse.json({ deployment, domains, envVars });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
