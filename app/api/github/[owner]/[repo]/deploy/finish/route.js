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
    const { branch, blobs, message, stats, resumedPaths } = body;
    if (!branch || !Array.isArray(blobs) || blobs.length === 0) {
      return NextResponse.json({ error: "Faltan datos para cerrar el deploy." }, { status: 400 });
    }

    // Si alguno de estos blobs vino de un progreso guardado en el navegador
    // de un intento anterior (no de esta misma sesion de deploy), confirmamos
    // que GitHub todavia lo tenga antes de intentar usarlo en el arbol nuevo.
    // Un blob suelto que nunca llego a un commit puede desaparecer por
    // garbage collection si paso suficiente tiempo desde que se creo — sin
    // esta verificacion, eso rompia /git/trees con un 404 dificil de
    // diagnosticar.
    if (Array.isArray(resumedPaths) && resumedPaths.length > 0) {
      const resumedSet = new Set(resumedPaths);
      const toVerify = blobs.filter((b) => resumedSet.has(b.path));
      const missing = await findMissingBlobs({ owner, repo, token: session.token, entries: toVerify });
      if (missing.length > 0) {
        return NextResponse.json(
          {
            error:
              `${missing.length} archivo(s) del progreso guardado ya no existen en GitHub ` +
              `(se perdieron por limpieza automatica) — hay que volver a subirlos.`,
            code: "STALE_BLOBS",
            stalePaths: missing,
          },
          { status: 409 }
        );
      }
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
    const isGithubNotFoundOnGitData =
      err.status === 404 && err.data?.documentation_url?.includes("/rest/git/");
    const message = isGithubNotFoundOnGitData
      ? "GitHub tardó más de lo esperado en reconocer los archivos recién subidos y el reintento automático no alcanzó. " +
        "Volvé a intentar el deploy — normalmente se resuelve solo en el segundo intento."
      : err.message || String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
