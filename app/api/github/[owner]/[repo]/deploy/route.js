import { getSession } from "@/lib/session";
import { extractZip, validateProject, detectFramework, generateReadme } from "@/lib/zip";
import { getRepo, deployAtomicCommit } from "@/lib/github";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req, { params }) {
  const { owner, repo } = params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      let zipUrl = null;

      try {
        const session = await getSession();
        if (!session) {
          send({ type: "error", message: "No autenticado." });
          controller.close();
          return;
        }
        if (!session.githubConnected) {
          send({ type: "error", message: "Tu cuenta de GitHub no esta vinculada. Vincula GitHub desde el dashboard." });
          controller.close();
          return;
        }

        const body = await req.json();
        zipUrl = body.zipUrl;
        const message = body.message || "Actualizacion desde crisbofiles";

        if (!zipUrl) {
          send({ type: "error", message: "Falta el archivo .zip." });
          controller.close();
          return;
        }

        send({ type: "status", stage: "validating", message: "Validando estructura del proyecto..." });
        const zipRes = await fetch(zipUrl);
        if (!zipRes.ok) {
          throw new Error(`No se pudo descargar el zip subido (status ${zipRes.status})`);
        }
        const arrayBuffer = await zipRes.arrayBuffer();
        const files = await extractZip(arrayBuffer);

        const validation = validateProject(files);
        if (!validation.valid) {
          send({ type: "error", message: validation.errors.join(" ") });
          controller.close();
          return;
        }

        const paths = files.map((f) => f.path);
        const framework = detectFramework(paths);
        send({ type: "status", stage: "validated", message: `Proyecto valido — framework detectado: ${framework}` });

        const hasReadme = paths.some((p) => p.toLowerCase() === "readme.md");
        if (!hasReadme) {
          const readme = generateReadme(repo, framework);
          files.push({ path: "README.md", buffer: Buffer.from(readme, "utf-8") });
        }

        const repoInfo = await getRepo(owner, repo, session.token);
        const branch = repoInfo.default_branch;

        send({ type: "status", stage: "uploading", message: `Subiendo ${files.length} archivos...` });

        const result = await deployAtomicCommit({
          owner,
          repo,
          branch,
          token: session.token,
          files,
          message,
          onProgress: (p) => {
            if (p.stage === "bootstrap") {
              send({ type: "status", stage: "bootstrap", message: "Repositorio vacio detectado — inicializandolo..." });
            } else if (p.stage === "blobs") {
              send({ type: "progress", stage: "blobs", index: p.index, total: p.total, path: p.path });
            } else if (p.stage === "tree") {
              send({ type: "status", stage: "tree", message: "Creando arbol de archivos..." });
            } else if (p.stage === "commit") {
              send({ type: "status", stage: "commit", message: "Creando commit..." });
            } else if (p.stage === "push") {
              send({ type: "status", stage: "push", message: "Publicando (push) a la rama..." });
            }
          },
        });

        send({
          type: "done",
          message: "Deployment exitoso.",
          commitSha: result.commitSha,
          commitUrl: result.url,
          framework,
        });
      } catch (err) {
        send({ type: "error", message: err.message || String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
