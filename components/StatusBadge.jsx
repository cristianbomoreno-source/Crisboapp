"use client";

const STATE_STYLES = {
  online: { label: "Online", dot: "bg-emerald-400", text: "text-emerald-400" },
  offline: { label: "Offline", dot: "bg-red-400", text: "text-red-400" },
  building: { label: "Compilando", dot: "bg-amber-400 animate-pulse-soft", text: "text-amber-400" },
  unknown: { label: "Sin datos", dot: "bg-gray-500", text: "text-gray-400" },
};

export default function StatusBadge({ state = "unknown" }) {
  const s = STATE_STYLES[state] || STATE_STYLES.unknown;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium">
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      <span className={s.text}>{s.label}</span>
    </span>
  );
}
