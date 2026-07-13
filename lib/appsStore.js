const KEY = "crisbofiles_apps";
const VERCEL_CREDS_KEY = "crisbofiles_vercel_creds";

export function getApps() {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveApps(apps) {
  window.localStorage.setItem(KEY, JSON.stringify(apps));
}

export function upsertApp(app) {
  const apps = getApps();
  const idx = apps.findIndex((a) => a.id === app.id);
  if (idx >= 0) apps[idx] = app;
  else apps.push(app);
  saveApps(apps);
  return apps;
}

export function removeApp(id) {
  const apps = getApps().filter((a) => a.id !== id);
  saveApps(apps);
  return apps;
}

export function getApp(id) {
  return getApps().find((a) => a.id === id) || null;
}

// Credenciales de Vercel reutilizables entre apps (token + team opcional)
export function getVercelCreds() {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(window.localStorage.getItem(VERCEL_CREDS_KEY) || "null");
  } catch {
    return null;
  }
}

export function saveVercelCreds(creds) {
  window.localStorage.setItem(VERCEL_CREDS_KEY, JSON.stringify(creds));
}

export function newAppId() {
  return `app_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
