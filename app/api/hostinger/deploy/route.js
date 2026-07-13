import { extractZip, validateProject } from "@/lib/zip";
import { uploadFilesFTP } from "@/lib/hostinger";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      try {
        const formData = await req.formData();
        const zipFile = formData.get("zip");
        const protocol = formData.get("protocol") || "ftp";
        const host = formData.get("host");
        const port = Number(formData.get("port")) || undefined;
        const username = formData.get("username");
        const password = formData.get("password");
        const remotePath = formData.get("remotePath") || "/public_html";

        if (!zipFile || !host || !username || !password) {
          send({ type: "error", message: "Faltan campos requeridos para Hostinger." });
          controller.close();
          return;
        }

        send({ type: "status", stage: "validating", message: "Validando estructura del proyecto..." });
        const arrayBuffer = await zipFile.arrayBuffer();
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
