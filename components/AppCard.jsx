"use client";

import { useEffect, useState } from "react";
import { Github, Globe, Clock, UploadCloud, ExternalLink, Server, Pencil } from "lucide-react";
import StatusBadge from "./StatusBadge";

function timeAgo(dateStr) {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora mismo";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

const VERCEL_STATE_MAP = {
  READY: "online",
  ERROR: "offline",
  BUILDING: "building",
  QUEUED: "building",
  CANCELED: "offline",
};

export default function AppCard({ app, onUpdate, onOpen, onEdit }) {
  const [loading, setLoading] = useState(true);
  const [lastCommit, setLastCommit] = useState(null);
  const [vercelInfo, setVercelInfo] = useState(null);
  const [error, setError] = useState(false);
  const [faviconFailed, setFaviconFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load(isFirstLoad) {
      if (isFirstLoad) setLoading(true);
      setError(false);
      if (isFirstLoad) setFaviconFailed(false);
      try {
        const commitsRes = await fetch(`/api/github/${app.github.owner}/${app.github.repo}/commits`);
        const commitsData = await commitsRes.json();
        if (!cancelled && commitsData.commits) setLastCommit(commitsData.commits[0]);

        if (app.vercel?.enabled && app.vercel.projectId) {
          const q = new URLSearchParams({
            token: app.vercel.token || "",
            ...(app.vercel.teamId ? { teamId: app.vercel.teamId } : {}),
          });
          const vRes = await fetch(`/api/vercel/projects/${app.vercel.projectId}?${q}`);
          const vData = await vRes.json();
          if (!cancelled) setVercelInfo(vData);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load(true);

    // Actualiza sola cada 10 segundos — asi, si actualizas esta app desde
    // otra sesion/dispositivo, esta tarjeta refleja el cambio (estado,
    // ultimo commit) sin que nadie tenga que recargar la pagina.
    const interval = setInterval(() => load(false), 10000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [app]);

  const state = vercelInfo?.deployment?.state
    ? VERCEL_STATE_MAP[vercelInfo.deployment.state] || "unknown"
    : app.hostinger?.enabled
    ? "unknown"
    : "unknown";

  const domain = vercelInfo?.domains?.[0]?.name || app.hostinger?.domain || app.domain || null;
  const hostingLabel = app.vercel?.enabled ? "Vercel" : app.hostinger?.enabled ? "Hostinger" : "—";
  const faviconUrl = domain
    ? `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}`
    : null;

  return (
    <div
      onClick={() => onOpen?.(app)}
      className="bg-panel border border-border rounded-xl2 p-5 flex flex-col gap-4 hover:border-[#33333a] transition-colors cursor-pointer"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-panel2 border border-border flex items-center justify-center text-lg flex-shrink-0 overflow-hidden">
            {faviconUrl && !faviconFailed ? (
              <img
                src={faviconUrl}
                alt=""
                className="w-6 h-6 object-contain"
                onError={() => setFaviconFailed(true)}
              />
            ) : (
              app.emoji || "▲"
            )}
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-[14.5px] truncate">{app.name}</h3>
            <p className="text-[11.5px] text-muted truncate">{app.framework || "Framework desconocido"}</p>
          </div>
        </div>
        {loading ? (
          <span className="text-[11px] text-muted">cargando...</span>
        ) : (
          <div className="flex items-center gap-2">
            <StatusBadge state={state} />
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit?.(app);
              }}
              className="text-muted hover:text-white p-1 rounded-md hover:bg-panel2"
              title="Editar hosting"
            >
              <Pencil size={12} />
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-y-2 gap-x-3 text-[11.5px] text-muted">
        <div className="flex items-center gap-1.5 min-w-0">
          <Github size={12} className="flex-shrink-0" />
          <span className="truncate">{app.github.owner}/{app.github.repo}</span>
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <Server size={12} className="flex-shrink-0" />
          <span className="truncate">{hostingLabel}</span>
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <Globe size={12} className="flex-shrink-0" />
          {domain ? (
            <a
              href={`https://${domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate hover:text-accent flex items-center gap-1"
            >
              {domain} <ExternalLink size={10} />
            </a>
          ) : (
            <span className="truncate">Sin dominio</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <Clock size={12} className="flex-shrink-0" />
          <span className="truncate">{timeAgo(lastCommit?.date)}</span>
        </div>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onUpdate(app);
        }}
        className="mt-1 w-full inline-flex items-center justify-center gap-2 bg-accent-soft text-accent hover:bg-accent hover:text-white text-[13px] font-medium rounded-lg py-2.5 transition-colors"
      >
        <UploadCloud size={15} />
        Actualizar
      </button>
    </div>
  );
}
