"use client";

import { Zap, LogOut } from "lucide-react";

export default function TopNav({ user }) {
  return (
    <header className="sticky top-0 z-40 bg-bg/90 backdrop-blur-md border-b border-border">
      <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
            <Zap size={15} className="text-white" fill="white" />
          </div>
          <span className="font-semibold text-[15px] tracking-tight">crisbofiles</span>
        </div>

        {user && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {user.avatarUrl && (
                <img src={user.avatarUrl} alt={user.login} className="w-6 h-6 rounded-full" />
              )}
              <span className="text-[13px] text-muted hidden sm:inline">{user.login}</span>
            </div>
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="text-muted hover:text-white transition-colors p-1.5 rounded-md hover:bg-panel2"
                title="Cerrar sesión"
              >
                <LogOut size={16} />
              </button>
            </form>
          </div>
        )}
      </div>
    </header>
  );
}
