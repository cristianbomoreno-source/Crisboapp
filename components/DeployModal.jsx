"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { X, UploadCloud, FileArchive, CheckCircle2, XCircle } from "lucide-react";
import { useToast } from "./Toasts";

async function streamRequest(url, body, onEvent) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.body) throw new Error("Sin respuesta del servidor");

  const contentType = res.headers.get("content-type") || "";
  if (!res.ok && !contentType.includes("text/plain")) {
    // Respuesta de error que no es nuestro stream NDJSON (por ejemplo un
    // 413 o 500 crudo de la plataforma) — se lee como texto, nunca se
    // intenta parsear como JSON linea por linea.
    const text = await res.text();
    throw new Error(text.slice(0, 200) || `Error del servidor (status ${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastDone = null;
  let lastError = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      let evt;
      try {
        evt = JSON.parse(line);
      } catch {
        continue; // linea no-JSON inesperada — se ignora en vez de tumbar todo
      }
      onEvent(evt);
      if (evt.type === "done") lastDone = evt;
      if (evt.type === "error") lastError = evt;
    }
  }
  if (lastError) throw new Error(lastError.message);
  return lastDone;
}

export default function DeployModal({ app, onClose }) {
  const { push, update } = useToast();
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState(`Actualizacion de ${app.name} desde crisbofiles`);
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState([]);
  const [result, setResult] = useState(null); // { ok, message, commitUrl }
  const inputRef = useRef(null);

  const appendLog = (text, kind = "info") => setLog((prev) => [...prev, { text, kind }]);

  const handleFile = (f) => {
    if (f && f.name.endsWith(".zip")) setFile(f);
  };

  const runDeploy = async () => {
    if (!file) return;
    setRunning(true);
    setLog([]);
    setResult(null);

    const toastId = push({ type: "loading", title: "Subiendo...", description: app.name });
    let zipUrl = null;

    try {
      // 0. Subir el zip directo a Vercel Blob desde el navegador — nunca
      // pasa por nuestra funcion, asi que no hay limite de 4.5MB.
      appendLog(`Subiendo ${file.name}...`);
      const blob = await upload(`${app.id}-${Date.now()}.zip`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
      });
      zipUrl = blob.url;
      appendLog("Archivo recibido, procesando...", "ok");

      // 1. GitHub — commit atomico + push
      update(toastId, { title: "Creando commit...", description: "Subiendo archivos a GitHub" });
      const ghResult = await streamRequest(
        `/api/github/${app.github.owner}/${app.github.repo}/deploy`,
        { zipUrl, message },
        (evt) => {
          if (evt.type === "status") appendLog(evt.message);
          if (evt.type === "progress" && evt.stage === "blobs" && evt.path) {
            appendLog(`[${evt.index}/${evt.total}] ${evt.path}`, "progress");
          }
        }
      );
      appendLog("Commit y push completados.", "ok");

      // 2. Vercel — deploy hook si esta configurado
      if (app.vercel?.enabled && app.vercel.deployHookUrl) {
        update(toastId, { title: "Publicando...", description: "Disparando redeploy en Vercel" });
        appendLog("Disparando Deploy Hook de Vercel...");
        await fetch("/api/vercel/redeploy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hookUrl: app.vercel.deployHookUrl }),
        });
        appendLog("Vercel deployment disparado.", "ok");
      } else if (app.vercel?.enabled) {
        appendLog("Vercel esta conectado por Git — se desplegara automaticamente con el push.", "ok");
      }

      // 3. Hostinger — subida FTP directa del mismo zip (misma URL de Blob)
      if (app.hostinger?.enabled) {
        update(toastId, { title: "Publicando...", description: "Subiendo a Hostinger por FTP" });
        appendLog(`Conectando a ${app.hostinger.host}...`);

        await streamRequest("/api/hostinger/deploy", {
          zipUrl,
          protocol: app.hostinger.protocol,
          host: app.hostinger.host,
          port: app.hostinger.port,
          username: app.hostinger.username,
          password: app.hostinger.password,
          remotePath: app.hostinger.remotePath,
        }, (evt) => {
          if (evt.type === "status") appendLog(evt.message);
          if (evt.type === "progress") appendLog(`[${evt.index}/${evt.total}] ${evt.path}`, "progress");
        });
        appendLog("Subida a Hostinger completada.", "ok");
      }

      setResult({ ok: true, message: "Deployment exitoso.", commitUrl: ghResult?.commitUrl });
      if (ghResult?.framework && ghResult.framework !== app.framework) {
        fetch("/api/apps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...app, framework: ghResult.framework }),
        }).catch(() => {});
      }
      update(toastId, {
        type: "success",
        title: "Deployment exitoso",
        description: `${app.name} se actualizo correctamente`,
      });
    } catch (err) {
      appendLog(`Error: ${err.message}`, "error");
      setResult({ ok: false, message: err.message });
      update(toastId, { type: "error", title: "Error al publicar", description: err.message });
    } finally {
      setRunning(false);
      if (zipUrl) {
        fetch("/api/blob/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ zipUrl }),
        }).catch(() => {});
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-panel border border-border rounded-xl2 w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-lg">{app.emoji}</span>
            <h2 className="font-semibold text-[15px]">Actualizar {app.name}</h2>
          </div>
          <button onClick={onClose} className="text-muted hover:text-white" disabled={running}>
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-5 flex flex-col gap-4">
          {!result && (
            <>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  handleFile(e.dataTransfer.files?.[0]);
                }}
                onClick={() => inputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl2 px-5 py-8 text-center cursor-pointer transition-colors ${
                  dragging ? "border-accent bg-accent-soft" : "border-border bg-panel2"
                }`}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".zip"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
                {file ? (
                  <div className="flex items-center justify-center gap-2 text-[13px]">
                    <FileArchive size={16} className="text-accent" />
                    {file.name}
                  </div>
                ) : (
                  <>
                    <UploadCloud size={24} className="mx-auto mb-2 text-muted" />
                    <p className="text-[13px] font-medium">Arrastra tu .zip o toca para elegirlo</p>
                    <p className="text-[11px] text-muted mt-1">Sin límite práctico de tamaño — node_modules, .next y .git se ignoran automáticamente</p>
                  </>
                )}
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wide text-muted mb-1.5">
                  Mensaje del commit
                </label>
                <input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full bg-panel2 border border-border rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-accent"
                />
              </div>
            </>
          )}

          {log.length > 0 && (
            <div className="bg-[#0e0e10] border border-border rounded-lg px-3 py-3 font-mono text-[11px] text-muted max-h-48 overflow-y-auto scrollbar-thin leading-relaxed">
              {log.map((l, i) => (
                <div key={i} className={l.kind === "ok" ? "text-emerald-400" : l.kind === "error" ? "text-red-400" : ""}>
                  {l.text}
                </div>
              ))}
            </div>
          )}

          {result && (
            <div
              className={`flex items-start gap-2.5 rounded-lg px-4 py-3 text-[13px] ${
                result.ok
                  ? "bg-emerald-500/10 border border-emerald-500/30"
                  : "bg-red-500/10 border border-red-500/30"
              }`}
            >
              {result.ok ? (
                <CheckCircle2 size={16} className="text-emerald-400 mt-0.5 flex-shrink-0" />
              ) : (
                <XCircle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
              )}
              <div>
                <p className="font-medium">{result.message}</p>
                {result.commitUrl && (
                  <a
                    href={result.commitUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent text-[12px] underline"
                  >
                    Ver commit en GitHub →
                  </a>
                )}
              </div>
            </div>
          )}

          {!result && (
            <button
              onClick={runDeploy}
              disabled={!file || running}
              className="w-full bg-accent text-white text-[13px] font-semibold rounded-lg py-3 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {running ? "Publicando..." : "Publicar actualización"}
            </button>
          )}
          {result && (
            <button
              onClick={onClose}
              className="w-full bg-panel2 border border-border text-[13px] font-medium rounded-lg py-2.5"
            >
              Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
