"use client";

import { useEffect, useState } from "react";
import { X, Github, Search, ChevronRight, ChevronLeft } from "lucide-react";

function newAppId() {
  return `app_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const EMOJIS = ["▲", "🚀", "🎨", "🛒", "📦", "🐙", "🔥", "🌐", "💼", "🎯"];

export default function ConnectAppModal({ onClose, onSaved, editApp }) {
  const isEditing = Boolean(editApp);
  const [step, setStep] = useState(isEditing ? 3 : 1);
  const [repos, setRepos] = useState([]);
  const [loadingRepos, setLoadingRepos] = useState(!isEditing);
  const [search, setSearch] = useState("");
  const [selectedRepo, setSelectedRepo] = useState(
    isEditing
      ? { owner: editApp.github.owner, name: editApp.github.repo, defaultBranch: editApp.github.defaultBranch }
      : null
  );

  const [name, setName] = useState(isEditing ? editApp.name : "");
  const [emoji, setEmoji] = useState(isEditing ? editApp.emoji : EMOJIS[0]);
  const [hosting, setHosting] = useState(
    isEditing ? (editApp.vercel?.enabled ? "vercel" : editApp.hostinger?.enabled ? "hostinger" : "none") : "none"
  ); // none | vercel | hostinger

  const [vercelToken, setVercelToken] = useState(isEditing ? editApp.vercel?.token || "" : "");
  const [vercelTeamId, setVercelTeamId] = useState(isEditing ? editApp.vercel?.teamId || "" : "");
  const [vercelProjects, setVercelProjects] = useState([]);
  const [vercelProjectId, setVercelProjectId] = useState(isEditing ? editApp.vercel?.projectId || "" : "");
  const [deployHookUrl, setDeployHookUrl] = useState(isEditing ? editApp.vercel?.deployHookUrl || "" : "");
  const [loadingVercel, setLoadingVercel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [githubNotConnected, setGithubNotConnected] = useState(false);

  const [ftp, setFtp] = useState({
    protocol: isEditing ? editApp.hostinger?.protocol || "ftp" : "ftp",
    host: isEditing ? editApp.hostinger?.host || "" : "",
    port: isEditing ? editApp.hostinger?.port || "" : "",
    username: isEditing ? editApp.hostinger?.username || "" : "",
    password: isEditing ? editApp.hostinger?.password || "" : "",
    remotePath: isEditing ? editApp.hostinger?.remotePath || "/public_html" : "/public_html",
    domain: isEditing ? editApp.hostinger?.domain || "" : "",
  });

  useEffect(() => {
    if (isEditing) {
      // Ya sabemos el repo, no hace falta volver a listar todos.
      return;
    }
    fetch("/api/repos")
      .then((r) => {
        if (r.status === 409) {
          setGithubNotConnected(true);
          return { repos: [] };
        }
        return r.json();
      })
      .then((data) => setRepos(data.repos || []))
      .finally(() => setLoadingRepos(false));
  }, []);

  const filteredRepos = repos.filter((r) =>
    r.fullName.toLowerCase().includes(search.toLowerCase())
  );

  const loadVercelProjects = async () => {
    if (!vercelToken) return;
    setLoadingVercel(true);
    try {
      const q = new URLSearchParams({ token: vercelToken, ...(vercelTeamId ? { teamId: vercelTeamId } : {}) });
      const res = await fetch(`/api/vercel/projects?${q}`);
      const data = await res.json();
      setVercelProjects(data.projects || []);
    } finally {
      setLoadingVercel(false);
    }
  };

  const handleSave = async () => {
    const app = {
      id: isEditing ? editApp.id : newAppId(),
      name: name || selectedRepo.name,
      emoji,
      framework: isEditing ? editApp.framework : null,
      github: {
        owner: selectedRepo.owner,
        repo: selectedRepo.name,
        defaultBranch: selectedRepo.defaultBranch,
      },
      vercel:
        hosting === "vercel"
          ? {
              enabled: true,
              projectId: vercelProjectId,
              token: vercelToken,
              teamId: vercelTeamId || undefined,
              deployHookUrl: deployHookUrl || undefined,
            }
          : { enabled: false },
      hostinger: hosting === "hostinger" ? { enabled: true, ...ftp, port: ftp.port ? Number(ftp.port) : undefined } : { enabled: false },
    };
    setSaving(true);
    try {
      const res = await fetch("/api/apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(app),
      });
      if (!res.ok) throw new Error((await res.json()).error || "No se pudo guardar la aplicación");
      onSaved(app);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-panel border border-border rounded-xl2 w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-[15px]">{isEditing ? "Editar aplicación" : "Conectar aplicación"}</h2>
          <button onClick={onClose} className="text-muted hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-5">
          {step === 1 && (
            <div>
              <p className="text-[12.5px] text-muted mb-3">Elige el repositorio de GitHub para esta app</p>
              <div className="relative mb-3">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar repositorio..."
                  className="w-full bg-panel2 border border-border rounded-lg pl-8 pr-3 py-2.5 text-[13px] outline-none focus:border-accent"
                />
              </div>
              {loadingRepos ? (
                <p className="text-[12.5px] text-muted py-6 text-center">Cargando repositorios...</p>
              ) : githubNotConnected ? (
                <div className="text-center py-8">
                  <p className="text-[13px] mb-3">Todavía no vinculaste tu cuenta de GitHub.</p>
                  <a
                    href="/api/auth/github"
                    className="inline-flex items-center gap-2 bg-white text-black font-semibold text-[12.5px] rounded-lg px-4 py-2.5"
                  >
                    <Github size={14} />
                    Vincular GitHub
                  </a>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto scrollbar-thin">
                  {filteredRepos.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => {
                        setSelectedRepo(r);
                        setName(r.name);
                      }}
                      className={`text-left flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-[13px] transition-colors ${
                        selectedRepo?.id === r.id
                          ? "border-accent bg-accent-soft"
                          : "border-transparent bg-panel2 hover:border-border"
                      }`}
                    >
                      <Github size={14} className="text-muted flex-shrink-0" />
                      <span className="truncate">{r.fullName}</span>
                      {r.private && (
                        <span className="ml-auto text-[10px] text-muted border border-border rounded px-1.5 py-0.5">
                          privado
                        </span>
                      )}
                    </button>
                  ))}
                  {filteredRepos.length === 0 && (
                    <p className="text-[12.5px] text-muted py-6 text-center">Sin resultados</p>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div>
              <p className="text-[12.5px] text-muted mb-4">Personaliza cómo se ve esta app en tu dashboard</p>
              <label className="block text-[11px] uppercase tracking-wide text-muted mb-1.5">Nombre</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-panel2 border border-border rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-accent mb-4"
              />
              <label className="block text-[11px] uppercase tracking-wide text-muted mb-1.5">Ícono</label>
              <div className="flex gap-2 flex-wrap">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    onClick={() => setEmoji(e)}
                    className={`w-9 h-9 rounded-lg border flex items-center justify-center text-base ${
                      emoji === e ? "border-accent bg-accent-soft" : "border-border bg-panel2"
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <p className="text-[12.5px] text-muted mb-4">
                ¿Dónde vive esta app en producción? (opcional, puedes agregarlo después)
              </p>
              <div className="flex gap-2 mb-5">
                {[
                  { key: "none", label: "Solo GitHub" },
                  { key: "vercel", label: "Vercel" },
                  { key: "hostinger", label: "Hostinger" },
                ].map((o) => (
                  <button
                    key={o.key}
                    onClick={() => setHosting(o.key)}
                    className={`flex-1 text-[12.5px] font-medium py-2.5 rounded-lg border ${
                      hosting === o.key ? "border-accent bg-accent-soft text-accent" : "border-border bg-panel2 text-muted"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>

              {hosting === "vercel" && (
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="block text-[11px] uppercase tracking-wide text-muted mb-1.5">
                      Token de Vercel
                    </label>
                    <input
                      type="password"
                      value={vercelToken}
                      onChange={(e) => setVercelToken(e.target.value)}
                      placeholder="Account Settings → Tokens"
                      className="w-full bg-panel2 border border-border rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] uppercase tracking-wide text-muted mb-1.5">
                      Team ID (opcional)
                    </label>
                    <input
                      value={vercelTeamId}
                      onChange={(e) => setVercelTeamId(e.target.value)}
                      className="w-full bg-panel2 border border-border rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-accent"
                    />
                  </div>
                  <button
                    onClick={loadVercelProjects}
                    className="text-[12.5px] text-accent self-start"
                    disabled={!vercelToken || loadingVercel}
                  >
                    {loadingVercel ? "Buscando proyectos..." : "Buscar proyectos de Vercel →"}
                  </button>
                  {vercelProjects.length > 0 && (
                    <div>
                      <label className="block text-[11px] uppercase tracking-wide text-muted mb-1.5">Proyecto</label>
                      <select
                        value={vercelProjectId}
                        onChange={(e) => setVercelProjectId(e.target.value)}
                        className="w-full bg-panel2 border border-border rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-accent"
                      >
                        <option value="">Selecciona...</option>
                        {vercelProjects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-[11px] uppercase tracking-wide text-muted mb-1.5">
                      Deploy Hook URL <span className="normal-case text-muted">(opcional)</span>
                    </label>
                    <input
                      value={deployHookUrl}
                      onChange={(e) => setDeployHookUrl(e.target.value)}
                      placeholder="Project Settings → Git → Deploy Hooks"
                      className="w-full bg-panel2 border border-border rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-accent"
                    />
                  </div>
                </div>
              )}

              {hosting === "hostinger" && (
                <div className="flex flex-col gap-3">
                  <select
                    value={ftp.protocol}
                    onChange={(e) => setFtp({ ...ftp, protocol: e.target.value })}
                    className="w-full bg-panel2 border border-border rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-accent"
                  >
                    <option value="ftp">FTP</option>
                    <option value="ftps">FTPS</option>
                    <option value="sftp">SFTP</option>
                  </select>
                  <div className="flex gap-2">
                    <input
                      value={ftp.host}
                      onChange={(e) => setFtp({ ...ftp, host: e.target.value })}
                      placeholder="ftp.tudominio.com"
                      className="flex-[3] bg-panel2 border border-border rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-accent"
                    />
                    <input
                      value={ftp.port}
                      onChange={(e) => setFtp({ ...ftp, port: e.target.value })}
                      placeholder="21"
                      className="flex-1 bg-panel2 border border-border rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-accent"
                    />
                  </div>
                  <input
                    value={ftp.username}
                    onChange={(e) => setFtp({ ...ftp, username: e.target.value })}
                    placeholder="Usuario"
                    className="w-full bg-panel2 border border-border rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-accent"
                  />
                  <input
                    type="password"
                    value={ftp.password}
                    onChange={(e) => setFtp({ ...ftp, password: e.target.value })}
                    placeholder="Contraseña"
                    className="w-full bg-panel2 border border-border rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-accent"
                  />
                  <input
                    value={ftp.remotePath}
                    onChange={(e) => setFtp({ ...ftp, remotePath: e.target.value })}
                    placeholder="/public_html"
                    className="w-full bg-panel2 border border-border rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-accent"
                  />
                  <div>
                    <input
                      value={ftp.domain}
                      onChange={(e) => setFtp({ ...ftp, domain: e.target.value })}
                      placeholder="tudominio.com"
                      className="w-full bg-panel2 border border-border rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-accent"
                    />
                    <p className="text-[11px] text-muted mt-1.5">
                      Dominio real del sitio — se usa para mostrar su logo (favicon) en la tarjeta y el link directo.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-border">
          <button
            onClick={() => setStep((s) => Math.max(isEditing ? 2 : 1, s - 1))}
            disabled={step === (isEditing ? 2 : 1)}
            className="text-[12.5px] text-muted disabled:opacity-30 flex items-center gap-1"
          >
            <ChevronLeft size={14} /> Atrás
          </button>

          {step < 3 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={step === 1 && !selectedRepo}
              className="bg-accent text-white text-[13px] font-medium px-4 py-2 rounded-lg disabled:opacity-40 flex items-center gap-1"
            >
              Siguiente <ChevronRight size={14} />
            </button>
          ) : (
            <div className="flex flex-col items-end gap-1.5">
              {saveError && <span className="text-[11px] text-red-400">{saveError}</span>}
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-accent text-white text-[13px] font-medium px-4 py-2 rounded-lg disabled:opacity-50"
              >
                {saving ? "Guardando..." : "Guardar aplicación"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
