import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { extractZip, validateProject, detectFramework, generateReadme } from "@/lib/zip";
import { getRepo, getExistingTreeMap, gitBlobSha1 } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Primer paso del deploy: baja el zip, lo descomprime, y lo compara con lo
// que ya existe en GitHub — SIN crear ningun blob todavia. Es rapido (una
// sola llamada a la API de GitHub para leer el arbol actual) y por eso
// entra comodo en el limite de 60s del plan gratuito de Vercel, sin
// importar cuantos archivos tenga el proyecto. El cliente usa esta
// respuesta para saber que archivos hace falta subir de verdad, y los
// manda despues en tandas chicas a /deploy/batch.
export async function POST(req, { params }) {
  const { owner, repo } = params;

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  if (!session.githubConnected) {
    return NextResponse.json(
      { error: "Tu cuenta de GitHub no esta vinculada. Vincula GitHub desde el dashboard." },
      { status: 400 }
    );
  }

  try {
    const body = await req.json();
    const zipUrl = body.zipUrl;
    if (!zipUrl) {
      return NextResponse.json({ error: "Falta el archivo .zip." }, { status: 400 });
    }

    const zipRes = await fetch(zipUrl);
    if (!zipRes.ok) {
      return NextResponse.json(
        { error: `No se pudo descargar el zip subido (status ${zipRes.status})` },
        { status: 400 }
      );
    }
    const arrayBuffer = await zipRes.arrayBuffer();
    const files = await extractZip(arrayBuffer);

    const validation = validateProject(files);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.errors.join(" ") }, { status: 400 });
    }

    const paths = files.map((f) => f.path);
    const framework = detectFramework(paths);

    const hasReadme = paths.some((p) => p.toLowerCase() === "readme.md");
    if (!hasReadme) {
      const readme = generateReadme(repo, framework);
      files.push({ path: "README.md", buffer: Buffer.from(readme, "utf-8") });
    }

    const repoInfo = await getRepo(owner, repo, session.token);
    const branch = repoInfo.default_branch;

    const existingTree = await getExistingTreeMap({ owner, repo, branch, token: session.token }).catch(
      () => new Map()
    );
    const newPaths = new Set(files.map((f) => f.path));

    const toUpload = [];
    const unchanged = [];
    for (const file of files) {
      const localSha = gitBlobSha1(file.buffer);
      if (existingTree.get(file.path) === localSha) {
        unchanged.push({ path: file.path, sha: localSha });
      } else {
        toUpload.push(file.path);
      }
    }
    const deletedPaths = [...existingTree.keys()].filter((p) => !newPaths.has(p));

    const added = toUpload.filter((p) => !existingTree.has(p)).length;
    const modified = toUpload.length - added;
    const stats = { added, modified, deleted: deletedPaths.length, unchanged: unchanged.length };

    console.log(
      `[deploy/plan] ${owner}/${repo}@${branch} — a_subir=${toUpload.length} sin_cambios=${unchanged.length} ` +
        `eliminados=${deletedPaths.length}`
    );

    if (toUpload.length === 0 && deletedPaths.length === 0) {
      return NextResponse.json({ noChanges: true, stats, framework, branch });
    }

    return NextResponse.json({
      framework,
      branch,
      toUpload,
      unchanged,
      deletedCount: deletedPaths.length,
      stats,
      skippedSensitive: files.skippedSensitive || [],
    });
  } catch (err) {
    console.error("[deploy/plan] error:", err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
