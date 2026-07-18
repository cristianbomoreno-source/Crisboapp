import { getSession } from "@/lib/session";
import { extractZip, generateReadme, detectFramework } from "@/lib/zip";
import { getRepo, getBranchRef, createBlob, ghWriteContents } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 55; // margen bajo el limite de 60s del plan Hobby

// Sube SOLO los archivos de "paths" (una tanda chica, definida por el
// cliente — normalmente 15-20) como blobs de Git. No arma el commit
// todavia; eso lo hace /deploy/finish una vez que todas las tandas
// terminaron. Al mantener cada llamada chica, ninguna se acerca al limite
// de 60s de Vercel, sin importar cuantos archivos tenga el proyecto en
// total.
export async function POST(req, { params }) {
  const { owner, repo } = params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      try {
        const session = await getSession();
        if (!session) {
          send({ type: "error", message: "No autenticado." });
          controller.close();
          return;
        }
        if (!session.githubConnected) {
          send({ type: "error", message: "Tu cuenta de GitHub no esta vinculada." });
          controller.close();
          return;
        }

        const body = await req.json();
        const { zipUrl, branch, paths } = body;
        if (!zipUrl || !branch || !Array.isArray(paths) || paths.length === 0) {
          send({ type: "error", message: "Faltan datos para procesar esta tanda." });
          controller.close();
          return;
        }

        const zipRes = await fetch(zipUrl);
        if (!zipRes.ok) {
          throw new Error(`No se pudo descargar el zip subido (status ${zipRes.status})`);
        }
        const arrayBuffer = await zipRes.arrayBuffer();
        const allFiles = await extractZip(arrayBuffer);

        // README auto-generado: si esta tanda pide "README.md" y el zip no
        // lo traia, hay que regenerarlo igual que hizo /deploy/plan, para
        // que el contenido sea identico al que el cliente ya conto.
        const pathSet = new Set(paths);
        const wanted = allFiles.filter((f) => pathSet.has(f.path));
        if (pathSet.has("README.md") && !wanted.some((f) => f.path === "README.md")) {
          const framework = detectFramework(allFiles.map((f) => f.path));
          wanted.push({ path: "README.md", buffer: Buffer.from(generateReadme(repo, framework), "utf-8") });
        }

        const results = [];
        for (let i = 0; i < wanted.length; i++) {
          const file = wanted[i];

          // Caso borde: repo vacio todavia (nunca tuvo un commit). Solo
          // puede pasar en la PRIMERA tanda del deploy — se resuelve con
          // la API de Contents en vez de crear un blob suelto, que un
          // repo vacio no acepta.
          const ref = await getBranchRef({ owner, repo, branch, token: session.token });
          if (!ref) {
            send({ type: "status", stage: "bootstrap", message: "Repositorio vacio detectado — inicializandolo..." });
            const bootstrapPath = file.path.split("/").map(encodeURIComponent).join("/");
            const created = await ghWriteContents({
              owner,
              repo,
              token: session.token,
              path: bootstrapPath,
              base64Content: file.buffer.toString("base64"),
              branch,
              message: "Inicializa el repositorio",
            });
            results.push({ path: file.path, sha: created.content.sha });
          } else {
            const sha = await createBlob({
              owner,
              repo,
              token: session.token,
              base64Content: file.buffer.toString("base64"),
              onRateLimited: (waitSeconds, attempt) =>
                send({
                  type: "status",
                  stage: "rate-limited",
                  message: `GitHub limitó temporalmente las solicitudes. Reintentando en ${waitSeconds} segundos`,
                  path: file.path,
                  waitSeconds,
                  attempt,
                }),
            });
            results.push({ path: file.path, sha });
          }

          send({
            type: "progress",
            path: file.path,
            sha: results[results.length - 1].sha,
            index: i + 1,
            total: wanted.length,
          });
        }

        send({ type: "done", results });
      } catch (err) {
        send({ type: "error", message: err.message || String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
