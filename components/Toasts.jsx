"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, XCircle, Loader2, Info } from "lucide-react";

const ToastContext = createContext(null);

let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((toast) => {
    const id = ++idCounter;
    setToasts((prev) => [...prev, { id, ...toast }]);
    if (toast.type !== "loading") {
      const timeout = toast.type === "error" ? 6000 : 3500;
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, timeout);
    }
    return id;
  }, []);

  const update = useCallback((id, patch) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    if (patch.type && patch.type !== "loading") {
      const timeout = patch.type === "error" ? 6000 : 3500;
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, timeout);
    }
  }, []);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ push, update, dismiss }}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 w-[320px]">
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function Toast({ toast, onDismiss }) {
  const icons = {
    loading: <Loader2 size={16} className="animate-spin text-accent" />,
    success: <CheckCircle2 size={16} className="text-emerald-400" />,
    error: <XCircle size={16} className="text-red-400" />,
    info: <Info size={16} className="text-blue-400" />,
  };

  return (
    <div className="animate-toast-in bg-panel border border-border rounded-lg px-4 py-3 shadow-xl flex items-start gap-3">
      <div className="mt-0.5">{icons[toast.type] || icons.info}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium leading-snug">{toast.title}</p>
        {toast.description && (
          <p className="text-[11.5px] text-muted mt-0.5 leading-snug break-words">{toast.description}</p>
        )}
      </div>
      {toast.type !== "loading" && (
        <button onClick={onDismiss} className="text-muted hover:text-white text-xs">
          ✕
        </button>
      )}
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de ToastProvider");
  return ctx;
}
