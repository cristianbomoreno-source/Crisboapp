"use client";

import { useState, useRef, useEffect } from "react";
import { LogOut, Github, CheckCircle2, ChevronDown, Mail, KeyRound, Unlink } from "lucide-react";

export default function TopNav({ user }) {
  const [open, setOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const handleDisconnectGithub = async () => {
    if (disconnecting) return;
    const confirmed = window.confirm(
      "¿Desconectar GitHub de tu cuenta? Vas a tener que volver a vincularlo para poder actualizar tus apps."
    );
    if (!confirmed) return;

    setDisconnecting(true);
    try {
      await fetch("/api/auth/github/disconnect", { method: "POST" });
    } finally {
      window.location.reload();
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-bg/90 backdrop-blur-md border-b border-border">
      <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img src="/logo-128.png" alt="crisbofiles" className="w-7 h-7 rounded-lg" />
          <span className="font-semibold text-[15px] tracking-tight">crisbofiles</span>
        </div>

        <div className="flex items-center gap-1.5">
          {user?.githubConnected && (
            <div className="flex items-center gap-1 bg-panel2 border border-border rounded-lg pl-2 pr-1 py-1">
              <CheckCircle2 size={12} className="text-emerald-400 flex-shrink-0" />
              <span className="text-[11px] text-muted max-w-[70px] truncate">
                @{user.githubLogin}
              </span>
              <button
                onClick={handleDisconnectGithub}
                disabled={disconnecting}
                title="Cerrar sesión de GitHub"
                className="flex items-center gap-1 text-[10.5px] text-muted hover:text-red-400 transition-colors px-1.5 py-0.5 rounded disabled:opacity-50"
              >
                <Unlink size={11} />
                <span className="hidden sm:inline">{disconnecting ? "..." : "Cerrar sesión"}</span>
              </button>
            </div>
          )}
          {user && !user.githubConnected && (
            <a
              href="/api/auth/github"
              className="flex items-center gap-1.5 bg-white text-black text-[11px] font-semibold rounded-lg px-2 py-1.5"
            >
              <Github size={12} />
              <span>Vincular GitHub</span>
            </a>
          )}

        {user && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setOpen((o) => !o)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-panel2 transition-colors"
            >
              {user.avatarUrl && (
                <img src={user.avatarUrl} alt={user.name} className="w-7 h-7 rounded-full" />
              )}
              <span className="text-[13px] text-muted hidden sm:inline max-w-[120px] truncate">
                {user.name}
              </span>
              <ChevronDown size={14} className="text-muted" />
            </button>

            {open && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-panel border border-border rounded-xl2 shadow-2xl overflow-hidden">
                <div className="px-4 py-3.5 border-b border-border">
                  <p className="text-[13.5px] font-medium truncate">{user.name}</p>
                  <p className="text-[11.5px] text-muted flex items-center gap-1.5 mt-1 truncate">
                    <Mail size={11} className="flex-shrink-0" />
                    {user.email}
                  </p>
                </div>

                <a
                  href="/dashboard/tokens"
                  className="flex items-center gap-2 px-4 py-3 text-[12.5px] hover:bg-panel2 transition-colors border-b border-border"
                >
                  <KeyRound size={14} className="text-muted" />
                  Tokens para Claude
                </a>

                <form action="/api/auth/logout" method="POST">
                  <button
                    type="submit"
                    className="w-full flex items-center gap-2 px-4 py-3 text-[12.5px] text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <LogOut size={14} />
                    Cerrar sesión de crisbofiles
                  </button>
                </form>
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </header>
  );
}
