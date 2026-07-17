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
        const resumeBlobs = body.resumeBlobs && typeof body.resumeBlobs === "object" ? body.resumeBlobs : undefined;

        if (!zipUrl) {
          send({ type: "error", message: "Falta el archivo .zip." });
          controller.close();
          return;
        }

        send({ type: "status", stage: "zip-received", message: "ZIP recibido." });
        const zipRes = await fetch(zipUrl);
        if (!zipRes.ok) {
          throw new Error(`No se pudo descargar el zip subido (status ${zipRes.status})`);
        }
        const arrayBuffer = await zipRes.arrayBuffer();

        send({ type: "status", stage: "extracting", message: "Descomprimiendo..." });
        const files = await extractZip(arrayBuffer);

        if (files.skippedSensitive?.length) {
          send({
            type: "status",
            stage: "validating",
            message:
              `Se omitieron ${files.skippedSensitive.length} archivo(s) con posibles credenciales ` +
              `(${files.skippedSensitive.join(", ")}) — nunca se suben a GitHub.`,
          });
        }

        send({ type: "status", stage: "analyzing", message: "Analizando archivos..." });
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

        const result = await deployAtomicCommit({
          owner,
          repo,
          branch,
          token: session.token,
          files,
          message,
          resumeBlobs,
          onProgress: (p) => {
            if (p.stage === "comparing") {
              send({ type: "status", stage: "comparing", message: "Comparando con el repositorio actual..." });
            } else if (p.stage === "bootstrap") {
              send({ type: "status", stage: "bootstrap", message: "Repositorio vacio detectado — inicializandolo..." });
            } else if (p.stage === "blobs") {
              if (p.index === 0) {
                send({ type: "status", stage: "uploading", message: `Subiendo ${p.total} archivos...` });
              }
              send({
                type: "progress",
                stage: "blobs",
                index: p.index,
                total: p.total,
                path: p.path,
                sha: p.sha,
                unchanged: p.unchanged || false,
                resumed: p.resumed || false,
              });
            } else if (p.stage === "rate-limited") {
              send({
                type: "status",
                stage: "rate-limited",
                message: `GitHub limitó temporalmente las solicitudes. Reintentando en ${p.waitSeconds} segundos`,
                path: p.path,
                waitSeconds: p.waitSeconds,
                attempt: p.attempt,
              });
            } else if (p.stage === "tree") {
              send({ type: "status", stage: "tree", message: "Creando arbol de archivos..." });
            } else if (p.stage === "commit") {
              send({ type: "status", stage: "commit", message: "Creando commit..." });
            } else if (p.stage === "push") {
              send({ type: "status", stage: "push", message: "Publicando (push) a la rama..." });
            } else if (p.stage === "no-changes") {
              send({ type: "status", stage: "no-changes", message: "Sin cambios respecto al repositorio actual." });
            }
          },
        });

        if (result.noChanges) {
          send({
            type: "done",
            noChanges: true,
            message: "No hay cambios — no se creo ningun commit.",
            stats: result.stats,
            framework,
          });
        } else {
          send({
            type: "done",
            message: "Actualizacion completada.",
            commitSha: result.commitSha,
            commitUrl: result.url,
            stats: result.stats,
            framework,
          });
        }
      } catch (err) {
        send({ type: "error", message: err.message || String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
