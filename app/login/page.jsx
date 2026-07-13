"use client";

import { Suspense } from "react";
import { Github, Zap } from "lucide-react";
import { useSearchParams } from "next/navigation";

function LoginContent() {
  const params = useSearchParams();
  const error = params.get("error");

  return (
    <main className="min-h-screen flex items-center justify-center bg-bg px-6">
      <div className="w-full max-w-sm text-center">
        <div className="w-12 h-12 mx-auto mb-6 rounded-xl bg-accent flex items-center justify-center">
          <Zap size={22} className="text-white" fill="white" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight mb-2">crisbofiles</h1>
        <p className="text-muted text-sm mb-10">
          Tu centro de control para administrar y desplegar todas tus aplicaciones.
        </p>

        {error && (
          <div className="mb-6 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
            No se pudo iniciar sesión: {error}
          </div>
        )}

        <a
          href="/api/auth/github"
          className="w-full inline-flex items-center justify-center gap-2 bg-white text-black font-semibold text-sm rounded-lg py-3 hover:bg-gray-100 transition-colors"
        >
          <Github size={18} />
          Continuar con GitHub
        </a>

        <p className="text-[11px] text-muted mt-8 leading-relaxed">
          Al conectar tu cuenta, crisbofiles podrá leer y actualizar los
          repositorios a los que tengas acceso, para publicar tus proyectos
          por ti.
        </p>
      </div>
    </main>
  );
}

// useSearchParams() obliga a que el componente que lo usa este envuelto en
// Suspense, o Next intenta prerenderizar /login como pagina estatica en
// build time y falla ("useSearchParams() should be wrapped in a suspense
// boundary"). Este wrapper es el fix.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
