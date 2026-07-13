"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.66-.22-2.45H12v4.63h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81z"/>
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.94-2.92l-3.88-3c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.94H1.28v3.1A12 12 0 0 0 12 24z"/>
      <path fill="#FBBC05" d="M5.29 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.28a12 12 0 0 0 0 10.78z"/>
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.94 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.61l4.01 3.1C6.23 6.86 8.88 4.75 12 4.75z"/>
    </svg>
  );
}

function LoginContent() {
  const params = useSearchParams();
  const error = params.get("error");

  return (
    <main className="min-h-screen flex items-center justify-center bg-bg px-6">
      <div className="w-full max-w-sm text-center">
        <img src="/logo.png" alt="crisbofiles" className="w-16 h-16 mx-auto mb-6 rounded-2xl" />
        <h1 className="text-2xl font-bold tracking-tight mb-2">crisbofiles</h1>
        <p className="text-muted text-sm mb-10">
          Tu cuenta personal para administrar y desplegar todas tus aplicaciones.
        </p>

        {error && (
          <div className="mb-6 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
            No se pudo iniciar sesión: {error}
          </div>
        )}

        <a
          href="/api/auth/google"
          className="w-full inline-flex items-center justify-center gap-2.5 bg-white text-black font-semibold text-sm rounded-lg py-3 hover:bg-gray-100 transition-colors"
        >
          <GoogleIcon />
          Continuar con Google
        </a>

        <p className="text-[11px] text-muted mt-8 leading-relaxed">
          Tu cuenta queda guardada de forma permanente. Una vez adentro,
          vinculas GitHub una sola vez y crisbofiles lo recuerda siempre,
          incluso si borras los datos del navegador.
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
