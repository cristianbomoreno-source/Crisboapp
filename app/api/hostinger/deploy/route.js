import { extractZip, validateProject } from "@/lib/zip";
import { uploadFilesFTP } from "@/lib/hostinger";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      let zipUrl = null;

      try {
        const body = await req.json();
        zipUrl = body.zipUrl;
        const protocol = body.protocol || "ftp";
        const host = body.host;
        const port = Number(body.port) || undefined;
        const username = body.username;
        const password = body.password;
        const remotePath = body.remotePath || "/public_html";

        if (!zipUrl || !host || !username || !password) {
          send({ type: "error", message: "Faltan campos requeridos para Hostinger." });
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

        send({ type: "status", stage: "uploading", message: `Conectando a ${host} por ${protocol.toUpperCase()}...` });

        await uploadFilesFTP({
          protocol,
          host,
          port,
          username,
          password,
          remotePath,
          files,
          onStatus: (message) => send({ type: "status", stage: "ftp-clean", message }),
          onProgress: (path, index, total) => send({ type: "progress", stage: "ftp", path, index, total }),
        });

        send({ type: "done", message: "Deployment exitoso en Hostinger." });
      } catch (err) {
        send({ type: "error", message: err.message || String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
