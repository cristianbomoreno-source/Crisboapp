"use client";

import { useEffect, useState } from "react";
import { KeyRound, Plus, Trash2, Copy, Check, ShieldAlert, ArrowLeft } from "lucide-react";
import TopNav from "@/components/TopNav";
import { ToastProvider, useToast } from "@/components/Toasts";

function timeAgo(dateStr) {
  if (!dateStr) return "nunca";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora mismo";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

function TokensInner() {
  const { push } = useToast();
  const [user, setUser] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [freshToken, setFreshToken] = useState(null); // { token, name } — solo tras crear
  const [copied, setCopied] = useState(false);

  const load = () => {
    fetch("/api/tokens")
      .then((r) => r.json())
      .then((d) => setTokens(d.tokens || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user));
    load();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || "Token de Claude" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo crear el token");
      setFreshToken(data.token);
      setName("");
      load();
    } catch (err) {
      push({ type: "error", title: "Error", description: err.message });
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id) {
    if (!confirm("¿Revocar este token? Cualquier conexion de Claude que lo use dejara de funcionar de inmediato.")) {
      return;
    }
    try {
      const res = await fetch(`/api/tokens/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("No se pudo revocar el token");
      push({ type: "success", title: "Token revocado" });
      load();
    } catch (err) {
      push({ type: "error", title: "Error", description: err.message });
    }
  }

  function copyText(text) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const mcpUrl = typeof window !== "undefined" ? `${window.location.origin}/api/mcp` : "/api/mcp";

  return (
    <div className="min-h-screen bg-bg">
      <TopNav user={user} />

      <main className="max-w-3xl mx-auto px-5 py-10">
        <a href="/dashboard" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-white mb-6">
          <ArrowLeft size={14} /> Volver al dashboard
        </a>

        <div className="flex items-center gap-3 mb-2">
          <KeyRound size={22} className="text-accent" />
          <h1 className="text-xl font-semibold tracking-tight">Tokens para Claude</h1>
        </div>
        <p className="text-[13.5px] text-muted mb-8 max-w-xl">
          Estos tokens permiten que Claude despliegue directamente a tus apps a traves del
          conector MCP de crisbofiles, sin que tengas que bajar y subir el zip a mano. Puedes
          revocarlos en cualquier momento.
        </p>

        <div className="bg-panel border border-border rounded-xl2 p-5 mb-6">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted mb-3">
            Conectar en Claude
          </h2>
          <p className="text-[12.5px] text-muted mb-3">
            Claude → Configuración → Conectores → <strong>Agregar conector personalizado</strong>.
            Pega esta URL (con tu token incluido, es la forma que funciona hoy mismo sin depender
            de ninguna funcion en beta):
          </p>
          <code className="block bg-panel2 rounded-lg px-3 py-2.5 text-[13px] break-all">
            {mcpUrl}?token=TU_TOKEN
          </code>
          <p className="text-[12px] text-muted mt-2">
            Alternativa, si tu cuenta ya tiene la beta de "Request headers" en el dialogo de
            conectores: usa la URL sin <code>?token=</code> y agrega un header{" "}
            <code>Authorization: Bearer TU_TOKEN</code> ahi.
          </p>
        </div>

        {freshToken && (
          <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl2 p-5 mb-6">
            <div className="flex items-center gap-2 text-amber-400 text-[13px] font-medium mb-2">
              <ShieldAlert size={15} />
              Copia esto ahora — no se vuelve a mostrar completo
            </div>
            <p className="text-[12px] text-muted mb-1.5">URL lista para pegar en Claude:</p>
            <div className="flex items-center gap-2 mb-3">
              <code className="flex-1 bg-panel2 rounded-lg px-3 py-2.5 text-[13px] break-all">
                {mcpUrl}?token={freshToken.token}
              </code>
              <button
                onClick={() => copyText(`${mcpUrl}?token=${freshToken.token}`)}
                className="flex items-center gap-1.5 bg-white text-black text-[12.5px] font-semibold rounded-lg px-3 py-2.5 flex-shrink-0"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
            <p className="text-[12px] text-muted mb-1.5">O solo el token (si usas el header Authorization):</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-panel2 rounded-lg px-3 py-2.5 text-[13px] break-all">
                {freshToken.token}
              </code>
              <button
                onClick={() => copyText(freshToken.token)}
                className="flex items-center gap-1.5 bg-white text-black text-[12.5px] font-semibold rounded-lg px-3 py-2.5 flex-shrink-0"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
            <button
              onClick={() => setFreshToken(null)}
              className="text-[12px] text-muted hover:text-white mt-3"
            >
              Ya lo copié, cerrar
            </button>
          </div>
        )}

        <form onSubmit={handleCreate} className="flex items-center gap-2 mb-8">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre del token (ej. Claude — laptop)"
            className="flex-1 bg-panel border border-border rounded-lg px-3.5 py-2.5 text-[13.5px] focus:outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={creating}
            className="flex items-center gap-1.5 bg-accent text-white text-[13px] font-semibold rounded-lg px-4 py-2.5 disabled:opacity-50 flex-shrink-0"
          >
            <Plus size={15} />
            {creating ? "Generando…" : "Generar token"}
          </button>
        </form>

        <div className="bg-panel border border-border rounded-xl2 divide-y divide-border">
          {loading ? (
            <div className="px-5 py-6 text-[13px] text-muted">Cargando…</div>
          ) : tokens.length === 0 ? (
            <div className="px-5 py-6 text-[13px] text-muted">Todavía no generas ningún token.</div>
          ) : (
            tokens.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-medium truncate">{t.name}</p>
                  <p className="text-[12px] text-muted mt-0.5">
                    {t.token_prefix}… · creado {timeAgo(t.created_at)} · usado {timeAgo(t.last_used_at)}
                    {t.revoked_at ? " · revocado" : ""}
                  </p>
                </div>
                {!t.revoked_at && (
                  <button
                    onClick={() => handleRevoke(t.id)}
                    className="flex items-center gap-1.5 text-[12.5px] text-red-400 hover:bg-red-500/10 rounded-lg px-3 py-2 flex-shrink-0"
                  >
                    <Trash2 size={14} />
                    Revocar
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}

export default function TokensPage() {
  return (
    <ToastProvider>
      <TokensInner />
    </ToastProvider>
  );
}
