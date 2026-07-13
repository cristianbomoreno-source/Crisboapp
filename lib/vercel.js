async function vc(path, token, options = {}) {
  const res = await fetch(`https://api.vercel.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    cache: "no-store",
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Vercel API error (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function teamQuery(teamId) {
  return teamId ? `&teamId=${encodeURIComponent(teamId)}` : "";
}

export async function listProjects(token, teamId) {
  const q = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  const data = await vc(`/v9/projects${q}`, token);
  return (data.projects || []).map((p) => ({
    id: p.id,
    name: p.name,
    framework: p.framework,
    updatedAt: p.updatedAt,
    latestDeploymentUrl: p.latestDeployments?.[0]?.url,
  }));
}

export async function getLatestDeployment(projectIdOrName, token, teamId) {
  const q = `?limit=1&projectId=${encodeURIComponent(projectIdOrName)}${teamQuery(teamId)}`;
  const data = await vc(`/v6/deployments${q}`, token);
  const dep = data.deployments?.[0];
  if (!dep) return null;
  return {
    id: dep.uid,
    url: dep.url,
    state: dep.state, // READY | ERROR | BUILDING | QUEUED | CANCELED
    createdAt: dep.createdAt,
    target: dep.target,
  };
}

export async function getDeploymentEvents(deploymentId, token, teamId) {
  const q = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  const data = await vc(`/v3/deployments/${deploymentId}/events${q}`, token);
  return (Array.isArray(data) ? data : data.events || []).map((e) => ({
    type: e.type,
    text: e.text || e.payload?.text || "",
    createdAt: e.created,
  }));
}

export async function getDomains(projectId, token, teamId) {
  const q = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  const data = await vc(`/v9/projects/${projectId}/domains${q}`, token);
  return (data.domains || []).map((d) => ({
    name: d.name,
    verified: d.verified,
    apexName: d.apexName,
  }));
}

export async function getEnvVars(projectId, token, teamId) {
  const q = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  const data = await vc(`/v9/projects/${projectId}/env${q}`, token);
  return (data.envs || []).map((e) => ({
    key: e.key,
    target: e.target,
    // el valor nunca se expone en la lista por seguridad de la propia API de Vercel
  }));
}

// El "redeploy" confiable en Vercel es disparar un Deploy Hook: una URL que
// el propio Vercel genera en Project Settings -> Git -> Deploy Hooks, y que
// al recibir un POST reconstruye el proyecto desde la rama conectada.
// Intentar recrear un deployment "desde cero" via API sin pasarle archivos
// no es una operacion soportada de forma confiable, asi que no la usamos.
export async function triggerDeployHook(hookUrl) {
  const res = await fetch(hookUrl, { method: "POST" });
  if (!res.ok) {
    throw new Error(`No se pudo disparar el Deploy Hook (status ${res.status})`);
  }
  return res.json().catch(() => ({}));
}
