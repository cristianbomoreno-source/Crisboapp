import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { finalizeCommitFromBlobs, findMissingBlobs } from "@/lib/github";

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

    // Verificamos TODOS los blobs (no solo los que vienen de un progreso
    // guardado) antes de armar el arbol. Al principio esto solo cubria los
    // "resumidos" de localStorage (el caso mas obvio de blob perdido por
    // garbage collection) — pero el reintento por propagacion transitoria
    // en finalizeCommitFromBlobs no alcanzo para resolver el problema en la
    // practica, lo que indica que el blob invalido puede ser cualquiera
    // (tipicamente uno de los "sin cambios" reusados de /deploy/plan), no
    // solo uno resumido del navegador. Verificar todos es un poco mas de
    // llamadas a GitHub, pero permite detectar Y recuperar el archivo
    // puntual que este fallando, en vez de que el usuario vea un 404 sin
    // saber cual archivo lo causa.
    const missing = await findMissingBlobs({ owner, repo, token: session.token, entries: blobs });
    if (missing.length > 0) {
      console.warn(`[deploy/finish] ${owner}/${repo}@${branch} — blobs invalidos detectados: ${missing.join(", ")}`);
      return NextResponse.json(
        {
          error:
            `${missing.length} archivo(s) tenían un blob inválido en GitHub (${missing.slice(0, 3).join(", ")}` +
            `${missing.length > 3 ? "..." : ""}) — hay que volver a subirlos.`,
          code: "STALE_BLOBS",
          stalePaths: missing,
        },
        { status: 409 }
      );
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
    if (err.treeEntries) {
      console.error("[deploy/finish] entradas del arbol al momento de fallar:", JSON.stringify(err.treeEntries));
    }
    const isGithubNotFoundOnGitData =
      err.status === 404 && err.data?.documentation_url?.includes("/rest/git/");
    const message = isGithubNotFoundOnGitData
      ? "GitHub tardó más de lo esperado en reconocer los archivos recién subidos y el reintento automático no alcanzó. " +
        "Volvé a intentar el deploy — normalmente se resuelve solo en el segundo intento."
      : err.message || String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
