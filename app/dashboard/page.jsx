"use client";

import { useEffect, useState } from "react";
import { Plus, LayoutGrid } from "lucide-react";
import TopNav from "@/components/TopNav";
import AppCard from "@/components/AppCard";
import ConnectAppModal from "@/components/ConnectAppModal";
import DeployModal from "@/components/DeployModal";
import { ToastProvider } from "@/components/Toasts";
import { getApps } from "@/lib/appsStore";

function DashboardInner() {
  const [user, setUser] = useState(null);
  const [apps, setApps] = useState([]);
  const [showConnect, setShowConnect] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deployTarget, setDeployTarget] = useState(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user));
    setApps(getApps());
  }, []);

  return (
    <div className="min-h-screen bg-bg">
      <TopNav user={user} />

      <main className="max-w-6xl mx-auto px-5 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Tus aplicaciones</h1>
            <p className="text-[13px] text-muted mt-1">
              {apps.length} {apps.length === 1 ? "aplicación conectada" : "aplicaciones conectadas"}
            </p>
          </div>
          <button
            onClick={() => setShowConnect(true)}
            className="inline-flex items-center gap-2 bg-accent text-white text-[13px] font-medium rounded-lg px-4 py-2.5 hover:opacity-90 transition-opacity"
          >
            <Plus size={16} />
            Conectar aplicación
          </button>
        </div>

        {apps.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl2 py-20 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-xl bg-panel2 border border-border flex items-center justify-center mb-4">
              <LayoutGrid size={20} className="text-muted" />
            </div>
            <h3 className="font-semibold text-[15px] mb-1.5">Todavía no tienes aplicaciones</h3>
            <p className="text-[13px] text-muted max-w-xs mb-6">
              Conecta tu primer repositorio para empezar a publicar actualizaciones sin usar Git manualmente.
            </p>
            <button
              onClick={() => setShowConnect(true)}
              className="inline-flex items-center gap-2 bg-accent text-white text-[13px] font-medium rounded-lg px-4 py-2.5"
            >
              <Plus size={16} />
              Conectar aplicación
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {apps.map((app) => (
              <AppCard
                key={app.id}
                app={app}
                onUpdate={setDeployTarget}
                onEdit={setEditTarget}
                onOpen={(a) => {
                  window.location.href = `/dashboard/${a.github.owner}/${a.github.repo}`;
                }}
              />
            ))}
          </div>
        )}
      </main>

      {showConnect && (
        <ConnectAppModal
          onClose={() => setShowConnect(false)}
          onSaved={(app) => {
            setApps(getApps());
            setShowConnect(false);
          }}
        />
      )}

      {editTarget && (
        <ConnectAppModal
          editApp={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={(app) => {
            setApps(getApps());
            setEditTarget(null);
          }}
        />
      )}

      {deployTarget && <DeployModal app={deployTarget} onClose={() => setDeployTarget(null)} />}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <ToastProvider>
      <DashboardInner />
    </ToastProvider>
  );
}
