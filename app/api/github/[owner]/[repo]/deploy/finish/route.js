import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { finalizeCommitFromBlobs } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 55;

// Ultimo paso: con TODOS los blobs ya subidos (por /deploy/batch, en
// tandas chicas) mas los que no cambiaron (reusados de /deploy/plan), arma
// el arbol final, crea el commit, y mueve la rama. Son solo 3-4 llamadas a
// GitHub — rapido, muy lejos del limite de 60s sin importar el tamaño del
// proyecto.
export async function POST(req, { params }) {
  const { owner, repo } = params;

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!session.githubConnected) {
    return NextResponse.json({ error: "Tu cuenta de GitHub no esta vinculada." }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { branch, blobs, message, stats } = body;
    if (!branch || !Array.isArray(blobs) || blobs.length === 0) {
      return NextResponse.json({ error: "Faltan datos para cerrar el deploy." }, { status: 400 });
    }

    const result = await finalizeCommitFromBlobs({
      owner,
      repo,
      branch,
      token: session.token,
      blobs,
      message: message || "Actualizacion desde crisbofiles",
    });

    console.log(`[deploy/finish] ${owner}/${repo}@${branch} — commit=${result.commitSha}`);

    return NextResponse.json({ commitSha: result.commitSha, commitUrl: result.url, stats });
  } catch (err) {
    console.error("[deploy/finish] error:", err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
