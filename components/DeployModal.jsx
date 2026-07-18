"use client";

import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { X, UploadCloud, FileArchive, CheckCircle2, XCircle, Clock, Globe, Loader2 } from "lucide-react";
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
  if (!lastDone) {
    // La conexion termino SIN un evento final de exito ni de error — esto
    // pasa cuando el servidor se corta a mitad de camino (por ejemplo, se
    // excedio el tiempo maximo permitido en un proyecto grande). Antes esto
    // se trataba como si hubiera funcionado; ahora se informa como lo que
    // es: no hay garantia de que el commit se haya creado.
    throw new Error(
      "La conexion se cortó antes de que el servidor confirmara el resultado — probablemente se excedió el tiempo máximo permitido. Verifica en GitHub si el commit se creó; si no, reintenta (los archivos ya subidos no se vuelven a enviar)."
    );
  }
  return lastDone;
}

// ---------- Progreso guardado en el navegador ----------
// Permite retomar una subida a GitHub sin repetir archivos ya enviados si
// la pagina se recarga o el intento anterior fallo a mitad de camino.
//
// Ademas de la verificacion de hash en el servidor (que es la proteccion
// real contra reusar contenido viejo), el progreso guardado expira solo a
// las 2 horas — asi nunca queda un resto de un intento muy anterior dando
// vueltas indefinidamente en el navegador.
const PROGRESS_TTL_MS = 2 * 60 * 60 * 1000;

function progressKey(app) {
  return `crisbofiles_progress_${app.github.owner}_${app.github.repo}`;
}
function loadProgress(app) {
  try {
    const raw = JSON.parse(window.localStorage.getItem(progressKey(app)) || "null");
    if (!raw || !raw.savedAt || Date.now() - raw.savedAt > PROGRESS_TTL_MS) return {};
    return raw.files || {};
  } catch {
    return {};
  }
}
function saveProgress(app, map) {
  try {
    window.localStorage.setItem(progressKey(app), JSON.stringify({ savedAt: Date.now(), files: map }));
  } catch {
    // localStorage lleno o no disponible — no es critico, se sigue sin guardar
  }
}
function clearProgress(app) {
  try {
    window.localStorage.removeItem(progressKey(app));
  } catch {
    // no critico
  }
}

// ---------- Confirmacion real de Vercel ----------
// Vercel siempre reporta el estado de build/deploy — esto consulta ese
// estado hasta que la nueva build queda "READY" (o falla), asi el usuario
// sabe con certeza que la pagina en vivo ya refleja lo que acaba de subir,
// no solo que el push a GitHub funciono.
const VERCEL_POLL_INTERVAL_MS = 4000;
const VERCEL_POLL_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutos

async function pollVercelReady(app, sinceMs, onUpdate) {
  const q = new URLSearchParams({
    token: app.vercel.token || "",
    ...(app.vercel.teamId ? { teamId: app.vercel.teamId } : {}),
  });
  const start = Date.now();

  while (Date.now() - start < VERCEL_POLL_TIMEOUT_MS) {
    let dep = null;
    try {
      const res = await fetch(`/api/vercel/projects/${app.vercel.projectId}?${q}`);
      const data = await res.json();
      dep = data?.deployment || null;
    } catch {
      // fallo de red puntual al consultar — se reintenta en el proximo ciclo
    }

    if (dep && new Date(dep.createdAt).getTime() >= sinceMs) {
      if (dep.state === "READY") return { ok: true, url: dep.url };
      if (dep.state === "ERROR" || dep.state === "CANCELED") {
        return { ok: false, url: dep.url, state: dep.state };
      }
      onUpdate?.(dep.state);
    }
    await new Promise((r) => setTimeout(r, VERCEL_POLL_INTERVAL_MS));
  }
  return { ok: null, timedOut: true };
}

// ---------- Deploy a GitHub en 3 pasos cortos ----------
// En vez de una sola solicitud larga (que en el plan gratuito de Vercel se
// corta a los 60s sin importar cuantos archivos tenga el proyecto), esto
// arma el deploy en tres llamadas cortas: planificar (sin subir nada),
// subir en tandas chicas, y cerrar el commit. Ninguna tanda individual se
// acerca al limite de tiempo, sin importar si el proyecto tiene 10 o 500
// archivos.
const BATCH_SIZE = 15;

async function runGithubDeploy({ owner, repo, zipUrl, message, resumeBlobs, onLog, onProgress, onRateLimit, onFileDone }) {
  onLog("Analizando el proyecto y comparando con el repositorio...");
  const planRes = await fetch(`/api/github/${owner}/${repo}/deploy/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ zipUrl, message }),
  });
  const plan = await planRes.json().catch(() => ({}));
  if (!planRes.ok) throw new Error(plan.error || `No se pudo analizar el proyecto (status ${planRes.status}).`);

  if (plan.noChanges) {
    return { noChanges: true, stats: plan.stats, framework: plan.framework };
  }

  if (plan.skippedSensitive?.length) {
    onLog(
      `Se omitieron ${plan.skippedSensitive.length} archivo(s) con posibles credenciales ` +
        `(${plan.skippedSensitive.join(", ")}) — nunca se suben a GitHub.`
    );
  }
  onLog(`Proyecto valido — framework detectado: ${plan.framework}`);
  onLog(
    `${plan.toUpload.length} archivo(s) por subir, ${plan.unchanged.length} sin cambios, ` +
      `${plan.deletedCount} eliminado(s).`
  );

  const allBlobs = [...plan.unchanged];
  const stillPending = [];
  for (const path of plan.toUpload) {
    const resumed = resumeBlobs?.[path];
    if (resumed) {
      allBlobs.push({ path, sha: resumed });
    } else {
      stillPending.push(path);
    }
  }

  const total = plan.toUpload.length;
  let processed = total - stillPending.length;
  if (processed > 0) {
    onLog(`Retomando progreso guardado: ${processed} archivo(s) ya subidos.`, "ok");
    onProgress({ current: "", processed, total });
  }

  for (let i = 0; i < stillPending.length; i += BATCH_SIZE) {
    const batch = stillPending.slice(i, i + BATCH_SIZE);
    const batchResult = await streamRequest(
      `/api/github/${owner}/${repo}/deploy/batch`,
      { zipUrl, branch: plan.branch, paths: batch },
      (evt) => {
        if (evt.type === "status" && evt.stage === "rate-limited") {
          onRateLimit(evt.message);
          return;
        }
        if (evt.type === "status") onLog(evt.message);
        if (evt.type === "progress" && evt.path) {
          processed++;
          onRateLimit(null);
          onProgress({ current: evt.path, processed, total });
          onFileDone(evt.path, evt.sha);
        }
      }
    );
    for (const r of batchResult.results || []) {
      if (!allBlobs.some((b) => b.path === r.path)) allBlobs.push(r);
    }
  }

  onLog("Creando el commit final...");
  const finishRes = await fetch(`/api/github/${owner}/${repo}/deploy/finish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ branch: plan.branch, blobs: allBlobs, message, stats: plan.stats }),
  });
  const finishData = await finishRes.json().catch(() => ({}));
  if (!finishRes.ok) throw new Error(finishData.error || `No se pudo cerrar el commit (status ${finishRes.status}).`);

  return {
    commitSha: finishData.commitSha,
    commitUrl: finishData.commitUrl,
    stats: finishData.stats || plan.stats,
    framework: plan.framework,
  };
}

export default function DeployModal({ app, onClose }) {
  const { push, update } = useToast();
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState(`Actualizacion de ${app.name} desde crisbofiles`);
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState([]);
  const [result, setResult] = useState(null); // { ok, message, commitUrl }
  const [fileProgress, setFileProgress] = useState({ current: "", processed: 0, total: 0 });
  const [rateLimitNotice, setRateLimitNotice] = useState(null);
  const [vercelCheck, setVercelCheck] = useState(null); // { status: 'checking'|'ready'|'error'|'timeout', url }
  const [resumeInfo, setResumeInfo] = useState(0);
  const inputRef = useRef(null);
  const progressRef = useRef({});

  useEffect(() => {
    const saved = loadProgress(app);
    const count = Object.keys(saved).length;
    progressRef.current = saved;
    setResumeInfo(count);
  }, [app]);

  const appendLog = (text, kind = "info") => setLog((prev) => [...prev, { text, kind }]);

  const handleFile = (f) => {
    if (f && f.name.endsWith(".zip")) setFile(f);
  };

  const runDeploy = async () => {
    if (!file || running) return; // el botón ya se deshabilita, esto es un cinturón extra
    setRunning(true);
    setLog([]);
    setResult(null);
    setRateLimitNotice(null);
    setVercelCheck(null);

    const resumeBlobs = progressRef.current;
    const resumedCount = Object.keys(resumeBlobs).length;
    if (resumedCount > 0) {
      appendLog(`Retomando progreso guardado: ${resumedCount} archivo(s) ya subidos anteriormente.`, "ok");
    }

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

      // 1. GitHub — en 3 pasos cortos (plan, tandas de subida, cierre del
      // commit) para no acercarse nunca al limite de 60s de Vercel, sin
      // importar cuantos archivos tenga el proyecto.
      update(toastId, { title: "Creando commit...", description: "Subiendo archivos a GitHub" });
      const ghResult = await runGithubDeploy({
        owner: app.github.owner,
        repo: app.github.repo,
        zipUrl,
        message,
        resumeBlobs,
        onLog: (msg, kind) => appendLog(msg, kind),
        onProgress: ({ current, processed, total }) => {
          setRateLimitNotice(null);
          setFileProgress({ current, processed, total });
        },
        onRateLimit: (msg) => {
          if (msg) {
            setRateLimitNotice(msg);
            appendLog(msg, "warn");
          } else {
            setRateLimitNotice(null);
          }
        },
        onFileDone: (path, sha) => {
          if (!sha) return;
          progressRef.current = { ...progressRef.current, [path]: sha };
          saveProgress(app, progressRef.current);
        },
      });
      if (!ghResult?.noChanges) appendLog("Commit y push completados.", "ok");

      // Deploy exitoso — ya no hace falta el progreso guardado.
      clearProgress(app);
      progressRef.current = {};
      setResumeInfo(0);

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

      // 2b. Confirmacion real: se consulta el estado del deployment en
      // Vercel hasta que quede en READY — asi el resultado final no dice
      // solo "se subio a GitHub" sino "la pagina en vivo ya esta al dia".
      // Solo tiene sentido si hubo un push real (no en el caso "sin
      // cambios") y si tenemos token+projectId para poder consultar.
      if (app.vercel?.enabled && app.vercel.projectId && app.vercel.token && !ghResult?.noChanges) {
        const since = Date.now() - 5000; // margen de 5s por reloj/latencia
        setVercelCheck({ status: "checking" });
        appendLog("Esperando la confirmacion de Vercel (build en curso)...");
        update(toastId, { title: "Verificando en Vercel...", description: "Esperando a que termine el build" });

        const outcome = await pollVercelReady(app, since, (state) => {
          appendLog(`Vercel: ${state}...`);
        });

        if (outcome.ok === true) {
          setVercelCheck({ status: "ready", url: outcome.url });
          appendLog("Vercel confirmo: la pagina en vivo ya esta actualizada.", "ok");
        } else if (outcome.ok === false) {
          setVercelCheck({ status: "error", url: outcome.url, state: outcome.state });
          appendLog(`Vercel reporto un error en el build (${outcome.state}). Revisa el panel de Vercel.`, "error");
        } else {
          setVercelCheck({ status: "timeout" });
          appendLog("Vercel esta tardando mas de lo normal en confirmar — revisa el panel para verificar.", "warn");
        }
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

      if (ghResult?.noChanges) {
        appendLog("Sin cambios respecto al repositorio — no se creo ningun commit.", "ok");
      } else {
        const s = ghResult?.stats;
        if (s) {
          appendLog(
            `Resumen: ${s.added} nuevo(s), ${s.modified} modificado(s), ${s.deleted} eliminado(s), ${s.unchanged} sin cambios.`,
            "ok"
          );
        }
      }

      setResult({
        ok: true,
        noChanges: !!ghResult?.noChanges,
        message: ghResult?.noChanges ? "Sin cambios — no se creo ningun commit." : "Actualizacion completada.",
        commitUrl: ghResult?.commitUrl,
        stats: ghResult?.stats,
      });
      if (ghResult?.framework && ghResult.framework !== app.framework) {
        fetch("/api/apps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...app, framework: ghResult.framework }),
        }).catch(() => {});
      }
      update(toastId, {
        type: "success",
        title: ghResult?.noChanges ? "Sin cambios" : "Actualizacion completada",
        description: ghResult?.noChanges
          ? `${app.name} ya estaba al dia`
          : `${app.name} se actualizo correctamente`,
      });
    } catch (err) {
      // No se borra el progreso guardado — el proximo intento retoma desde
      // el ultimo archivo pendiente en vez de volver a empezar de cero.
      appendLog(`Error: ${err.message}`, "error");
      setResult({ ok: false, message: err.message });
      update(toastId, { type: "error", title: "Error al publicar", description: err.message });
    } finally {
      setRunning(false);
      setRateLimitNotice(null);
      if (zipUrl) {
        fetch("/api/blob/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ zipUrl }),
        }).catch(() => {});
      }
    }
  };

  const pending = fileProgress.total ? fileProgress.total - fileProgress.processed : 0;

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
                onClick={() => !running && inputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl2 px-5 py-8 text-center transition-colors ${
                  running ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                } ${dragging ? "border-accent bg-accent-soft" : "border-border bg-panel2"}`}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".zip"
                  className="hidden"
                  disabled={running}
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

              {resumeInfo > 0 && !running && (
                <div className="flex items-center gap-2 text-[11.5px] text-amber-400 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2.5">
                  <Clock size={13} className="flex-shrink-0" />
                  Hay un progreso guardado de un intento anterior ({resumeInfo} archivo(s)) — se retomará automáticamente al publicar.
                </div>
              )}

              <div>
                <label className="block text-[11px] uppercase tracking-wide text-muted mb-1.5">
                  Mensaje del commit
                </label>
                <input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={running}
                  className="w-full bg-panel2 border border-border rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-accent disabled:opacity-60"
                />
              </div>
            </>
          )}

          {running && fileProgress.total > 0 && (
            <div className="bg-panel2 border border-border rounded-lg px-3.5 py-3">
              <div className="flex items-center justify-between text-[11.5px] mb-1.5">
                <span className="text-muted">Procesando archivo</span>
                <span className="font-medium">
                  {fileProgress.processed}/{fileProgress.total} — {pending} pendiente{pending === 1 ? "" : "s"}
                </span>
              </div>
              <p className="text-[12px] font-mono truncate mb-2">{fileProgress.current}</p>
              <div className="h-1.5 bg-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent transition-all duration-300"
                  style={{ width: `${(fileProgress.processed / fileProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {rateLimitNotice && (
            <div className="flex items-center gap-2 text-[12px] text-amber-400 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2.5">
              <Clock size={14} className="flex-shrink-0 animate-pulse-soft" />
              {rateLimitNotice}
            </div>
          )}

          {vercelCheck && (
            <div
              className={`flex items-center justify-between gap-2 text-[12px] rounded-lg px-3 py-2.5 border ${
                vercelCheck.status === "ready"
                  ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/25"
                  : vercelCheck.status === "error"
                  ? "text-red-400 bg-red-500/10 border-red-500/25"
                  : "text-amber-400 bg-amber-500/10 border-amber-500/25"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {vercelCheck.status === "checking" && (
                  <Loader2 size={14} className="flex-shrink-0 animate-spin" />
                )}
                {vercelCheck.status === "ready" && <CheckCircle2 size={14} className="flex-shrink-0" />}
                {vercelCheck.status === "error" && <XCircle size={14} className="flex-shrink-0" />}
                {vercelCheck.status === "timeout" && <Clock size={14} className="flex-shrink-0" />}
                <span className="truncate">
                  {vercelCheck.status === "checking" && "Vercel esta construyendo la nueva version..."}
                  {vercelCheck.status === "ready" && "Vercel confirmó: la página en vivo ya está actualizada"}
                  {vercelCheck.status === "error" && `Vercel falló al construir (${vercelCheck.state || "error"})`}
                  {vercelCheck.status === "timeout" && "Vercel está tardando más de lo normal — revisa el panel"}
                </span>
              </div>
              {vercelCheck.url && (
                <a
                  href={`https://${vercelCheck.url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 flex-shrink-0 underline"
                >
                  <Globe size={12} />
                  Ver sitio
                </a>
              )}
            </div>
          )}

          {log.length > 0 && (
            <div className="bg-[#0e0e10] border border-border rounded-lg px-3 py-3 font-mono text-[11px] text-muted max-h-48 overflow-y-auto scrollbar-thin leading-relaxed">
              {log.map((l, i) => (
                <div
                  key={i}
                  className={
                    l.kind === "ok"
                      ? "text-emerald-400"
                      : l.kind === "error"
                      ? "text-red-400"
                      : l.kind === "warn"
                      ? "text-amber-400"
                      : ""
                  }
                >
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
                {result.stats && !result.noChanges && (
                  <p className="text-[12px] text-muted mt-1">
                    {result.stats.added} nuevo(s) · {result.stats.modified} modificado(s) ·{" "}
                    {result.stats.deleted} eliminado(s)
                    {result.stats.unchanged > 0 ? ` · ${result.stats.unchanged} sin cambios` : ""}
                  </p>
                )}
                {!result.ok && (
                  <p className="text-[11.5px] text-muted mt-1">
                    El progreso quedó guardado — al reintentar, los archivos ya subidos no se vuelven a enviar.
                  </p>
                )}
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
