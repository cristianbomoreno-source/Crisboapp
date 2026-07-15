"use client";

import { useState, useRef, useEffect } from "react";
import { LogOut, Github, CheckCircle2, ChevronDown, Mail } from "lucide-react";

export default function TopNav({ user }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-bg/90 backdrop-blur-md border-b border-border">
      <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img src="/logo-128.png" alt="crisbofiles" className="w-7 h-7 rounded-lg" />
          <span className="font-semibold text-[15px] tracking-tight">crisbofiles</span>
        </div>

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

                <div className="px-4 py-3.5 border-b border-border">
                  {user.githubConnected ? (
                    <div className="flex items-center gap-2 text-[12.5px] text-emerald-400">
                      <CheckCircle2 size={14} className="flex-shrink-0" />
                      <span className="truncate">GitHub conectado: @{user.githubLogin}</span>
                    </div>
                  ) : (
                    <a
                      href="/api/auth/github"
                      className="flex items-center justify-center gap-2 bg-white text-black text-[12.5px] font-semibold rounded-lg py-2.5"
                    >
                      <Github size={14} />
                      Vincular GitHub
                    </a>
                  )}
                </div>

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
    </header>
  );
}
