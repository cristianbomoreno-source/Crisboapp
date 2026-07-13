"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, RotateCcw, ExternalLink, Shield, ShieldAlert, UploadCloud } from "lucide-react";
import TopNav from "@/components/TopNav";
import DeployModal from "@/components/DeployModal";
import { ToastProvider, useToast } from "@/components/Toasts";
import { getApps } from "@/lib/appsStore";

function timeAgo(dateStr) {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora mismo";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

function DetailInner() {
  const { owner, repo } = useParams();
  const router = useRouter();
  const { push } = useToast();

  const [user, setUser] = useState(null);
  const [app, setApp] = useState(null);
  const [commits, setCommits] = useState([]);
  const [loadingCommits, setLoadingCommits] = useState(true);
  const [restoring, setRestoring] = useState(null);
  const [showDeploy, setShowDeploy] = useState(false);

  const [domainInput, setDomainInput] = useState("");
  const [domainResult, setDomainResult] = useState(null);
  const [checkingDomain, setCheckingDomain] = useState(false);

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((d) => setUser(d.user));
    const apps = getApps();
    const found = apps.find((a) => a.github.owner === owner && a.github.repo === repo);
    const resolvedApp =
      found || {
        id: `${owner}/${repo}`,
        name: repo,
        emoji: "📦",
        github: { owner, repo, defaultBranch: "main" },
        vercel: { enabled: false },
        hostinger: { enabled: false },
      };
    setApp(resolvedApp);
    if (resolvedApp.hostinger?.domain) setDomainInput(resolvedApp.hostinger.domain);

    fetch(`/api/github/${owner}/${repo}/commits`)
      .then((r) => r.json())
      .then((d) => setCommits(d.commits || []))
      .finally(() => setLoadingCommits(false));
  }, [owner, repo]);

  const handleRestore = async (sha) => {
    if (!confirm("Esto va a mover la rama principal al estado de este commit. ¿Continuar?")) return;
    setRestoring(sha);
    try {
      const res = await fetch(`/api/github/${owner}/${repo}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sha }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      push({ type: "success", title: "Version restaurada", description: `Rama movida a ${sha.slice(0, 7)}` });
      const d = await fetch(`/api/github/${owner}/${repo}/commits`).then((r) => r.json());
      setCommits(d.commits || []);
    } catch (err) {
      push({ type: "error", title: "No se pudo restaurar", description: err.message });
    } finally {
      setRestoring(null);
    }
  };

  const handleCheckDomain = async () => {
    if (!domainInput) return;
    setCheckingDomain(true);
    setDomainResult(null);
    try {
      const res = await fetch(`/api/domain/check?domain=${encodeURIComponent(domainInput)}`);
      const data = await res.json();
      setDomainResult(data);
    } finally {
      setCheckingDomain(false);
    }
  };

  if (!app) return null;

  return (
    <div className="min-h-screen bg-bg">
      <TopNav user={user} />

      <main className="max-w-3xl mx-auto px-5 py-8">
        <button
          onClick={() => router.push("/dashboard")}
          className="flex items-center gap-1.5 text-[13px] text-muted hover:text-white mb-6"
        >
          <ArrowLeft size={14} /> Volver al dashboard
        </button>

        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-panel2 border border-border flex items-center justify-center text-xl">
              {app.emoji}
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">{app.name}</h1>
              <p className="text-[12.5px] text-muted">{owner}/{repo}</p>
            </div>
          </div>
          <button
            onClick={() => setShowDeploy(true)}
            className="inline-flex items-center gap-2 bg-accent text-white text-[13px] font-medium rounded-lg px-4 py-2.5"
          >
            <UploadCloud size={15} />
            Actualizar
          </button>
        </div>

        {/* Historial de commits */}
        <section className="mb-10">
          <h2 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-3">
            Historial de commits
          </h2>
          {loadingCommits ? (
            <p className="text-[13px] text-muted">Cargando...</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {commits.map((c, i) => (
                <div
                  key={c.sha}
                  className="flex items-center justify-between bg-panel border border-border rounded-lg px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] truncate">{c.message}</p>
                    <p className="text-[11px] text-muted mt-0.5">
                      <span className="font-mono">{c.shortSha}</span> · {c.author} · {timeAgo(c.date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted hover:text-white p-1.5"
                      title="Ver en GitHub"
                    >
                      <ExternalLink size={14} />
                    </a>
                    {i !== 0 && (
                      <button
                        onClick={() => handleRestore(c.sha)}
                        disabled={restoring === c.sha}
                        className="flex items-center gap-1.5 text-[11.5px] text-muted hover:text-accent border border-border rounded-md px-2.5 py-1.5 disabled:opacity-50"
                      >
                        <RotateCcw size={12} />
                        {restoring === c.sha ? "Restaurando..." : "Restaurar"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {commits.length === 0 && <p className="text-[13px] text-muted">Sin commits todavía.</p>}
            </div>
          )}
        </section>

        {/* Verificacion de dominio */}
        <section>
          <h2 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-3">
            Verificar dominio (DNS / SSL)
          </h2>
          <div className="flex gap-2 mb-3">
            <input
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
              placeholder="tudominio.com"
              className="flex-1 bg-panel2 border border-border rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-accent"
            />
            <button
              onClick={handleCheckDomain}
              disabled={checkingDomain || !domainInput}
              className="bg-panel2 border border-border text-[13px] font-medium rounded-lg px-4 disabled:opacity-50"
            >
              {checkingDomain ? "Verificando..." : "Verificar"}
            </button>
          </div>

          {domainResult && (
            <div className="bg-panel border border-border rounded-lg px-4 py-4">
              <div className="flex items-center gap-2 mb-3">
                {domainResult.healthy ? (
                  <Shield size={16} className="text-emerald-400" />
                ) : (
                  <ShieldAlert size={16} className="text-amber-400" />
                )}
                <span className="text-[13px] font-medium">
                  {domainResult.healthy ? "Todo en orden" : "Se encontraron problemas"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-[12px] text-muted mb-2">
                <div>
                  <p className="text-[10.5px] uppercase tracking-wide mb-1">Registros A</p>
                  <p>{domainResult.aRecords?.map((r) => r.data).join(", ") || "Ninguno"}</p>
                </div>
                <div>
                  <p className="text-[10.5px] uppercase tracking-wide mb-1">SSL</p>
                  <p>
                    {domainResult.ssl?.valid
                      ? `Válido (${domainResult.ssl.daysRemaining} días restantes)`
                      : "Inválido o no encontrado"}
                  </p>
                </div>
              </div>
              {domainResult.issues?.length > 0 && (
                <ul className="text-[12px] text-amber-400 list-disc list-inside mt-2 space-y-1">
                  {domainResult.issues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      </main>

      {showDeploy && <DeployModal app={app} onClose={() => setShowDeploy(false)} />}
    </div>
  );
}

export default function AppDetailPage() {
  return (
    <ToastProvider>
      <DetailInner />
    </ToastProvider>
  );
}
