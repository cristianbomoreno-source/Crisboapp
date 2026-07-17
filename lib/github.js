import crypto from "node:crypto";

const GITHUB_API = "https://api.github.com";
const GITHUB_OAUTH = "https://github.com/login/oauth";

async function gh(path, token, options = {}) {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "deployhub",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    cache: "no-store",
  });
  const text = await res.text();

  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // GitHub (o algun proxy/WAF delante suyo) respondio algo que no es
      // JSON — tipicamente una pagina HTML de error durante una caida
      // puntual o un bloqueo por abuso. Antes esto crasheaba con un
      // "Unexpected token '<'" ilegible; ahora se convierte en un error
      // claro que dice exactamente que paso.
      const err = new Error(
        `GitHub respondio con un formato inesperado (status ${res.status}), no fue JSON. ` +
          `Puede ser una caida puntual de GitHub o un bloqueo temporal — reintenta en unos minutos. ` +
          `Fragmento de la respuesta: ${text.slice(0, 150).replace(/\s+/g, " ")}`
      );
      err.status = res.status;
      err.nonJsonResponse = true;
      throw err;
    }
  }

  if (!res.ok) {
    const err = new Error(data?.message || `GitHub API error (${res.status})`);
    err.status = res.status;
    err.data = data;
    const retryAfter = res.headers.get("retry-after");
    if (retryAfter && !Number.isNaN(Number(retryAfter))) {
      err.retryAfterSeconds = Number(retryAfter);
    }
    throw err;
  }
  return data;
}

// ---------- Limite secundario de GitHub (subida masiva de archivos) ----------
//
// GitHub recomienda explicitamente: solicitudes en serie (nunca en
// paralelo), con una pequena pausa entre cada una, y respetar el header
// Retry-After cuando responde 403/429. Esto es lo que implementa ghWrite —
// se usa solo en las llamadas de escritura del flujo de subida de archivos
// (createBlob y el cierre del commit), no en lecturas sueltas como listar
// commits o repos, que no generan volumen suficiente para pegarle al limite.

const RETRY_BACKOFF_SECONDS = [5, 10, 20, 40, 60];
const MAX_RETRIES = 5;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Pausa aleatoria de 300-700ms entre solicitudes, tal como pide GitHub.
function randomDelayMs() {
  return 300 + Math.floor(Math.random() * 400);
}

async function ghWrite(path, token, options, onRateLimited) {
  let attempt = 0;
  for (;;) {
    await sleep(randomDelayMs());
    try {
      return await gh(path, token, options);
    } catch (err) {
      const isRateLimited = err.status === 403 || err.status === 429;
      if (!isRateLimited || attempt >= MAX_RETRIES) throw err;

      const waitSeconds =
        err.retryAfterSeconds || RETRY_BACKOFF_SECONDS[Math.min(attempt, RETRY_BACKOFF_SECONDS.length - 1)];
      onRateLimited?.(waitSeconds, attempt + 1);
      await sleep(waitSeconds * 1000);
      attempt++;
    }
  }
}

// ---------- OAuth ----------

export function getAuthorizeUrl(redirectUri, state) {
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: "repo read:user",
    state,
  });
  return `${GITHUB_OAUTH}/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(code, redirectUri) {
  const res = await fetch(`${GITHUB_OAUTH}/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return data.access_token;
}

export async function getViewer(token) {
  return gh("/user", token);
}

// ---------- Repositorios ----------

export async function listRepos(token) {
  const repos = await gh(
    "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator",
    token
  );
  // Se exponen los campos tal como los devuelve la API de GitHub
  // (full_name, html_url, default_branch) junto a sus equivalentes en
  // camelCase para el resto de la app — así ningún lugar del código tiene
  // que reconstruir una URL de GitHub a mano.
  return repos.map((r) => ({
    id: r.id,
    name: r.name,
    full_name: r.full_name,
    fullName: r.full_name,
    owner: r.owner.login,
    private: r.private,
    default_branch: r.default_branch,
    defaultBranch: r.default_branch,
    updatedAt: r.updated_at,
    html_url: r.html_url,
    url: r.html_url,
    description: r.description,
  }));
}

export async function getRepo(owner, repo, token) {
  return gh(`/repos/${owner}/${repo}`, token);
}

// ---------- Historial ----------

export async function listCommits(owner, repo, branch, token, perPage = 20) {
  const commits = await gh(
    `/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=${perPage}`,
    token
  );
  return commits.map((c) => ({
    sha: c.sha,
    shortSha: c.sha.slice(0, 7),
    message: c.commit.message.split("\n")[0],
    author: c.commit.author?.name,
    date: c.commit.author?.date,
    url: c.html_url,
  }));
}

// ---------- Piezas reutilizables (usadas por deployAtomicCommit y por el
// flujo incremental del conector MCP, ver lib/mcpTools.js) ----------

// Ref actual de una rama, o null si la rama no existe todavia (repo vacio o
// rama nueva). Nunca lanza para el caso "no existe" — solo relanza otros
// errores reales de la API.
export async function getBranchRef({ owner, repo, branch, token }) {
  return gh(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, token).catch((e) => {
    if (e.status === 404 || e.status === 409) return null;
    throw e;
  });
}

// Crea UN blob suelto (un archivo) y devuelve su sha. Pensado para subir
// archivo por archivo desde el conector MCP (`add_files`), en vez de todos
// los blobs de una sola pasada como hace deployAtomicCommit.
//
// Usa ghWrite: pausa entre solicitudes + reintentos con backoff si GitHub
// responde 403/429 (limite secundario) — asi que tambien beneficia
// automaticamente a mcpTools.js sin tocar ese archivo.
export async function createBlob({ owner, repo, token, base64Content, onRateLimited }) {
  const blob = await ghWrite(
    `/repos/${owner}/${repo}/git/blobs`,
    token,
    { method: "POST", body: JSON.stringify({ content: base64Content, encoding: "base64" }) },
    onRateLimited
  );
  return blob.sha;
}

// sha1 de blob de git, calculado localmente (sin llamar a la API) — permite
// comparar el contenido de un archivo local contra lo que ya existe en el
// repo sin gastar una solicitud por archivo.
function gitBlobSha1(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`);
  return crypto.createHash("sha1").update(header).update(buffer).digest("hex");
}

// Mapa path -> sha de TODO el arbol actual de una rama (una sola llamada,
// recursiva). Si la rama todavia no existe (repo vacio), devuelve un mapa
// vacio. Se usa para saltar la subida de archivos cuyo contenido no cambio.
async function getExistingTreeMap({ owner, repo, branch, token }) {
  const ref = await getBranchRef({ owner, repo, branch, token });
  if (!ref) return new Map();
  const commit = await gh(`/repos/${owner}/${repo}/git/commits/${ref.object.sha}`, token);
  const tree = await gh(`/repos/${owner}/${repo}/git/trees/${commit.tree.sha}?recursive=1`, token);
  const map = new Map();
  for (const item of tree.tree || []) {
    if (item.type === "blob") map.set(item.path, item.sha);
  }
  return map;
}

// Arma el arbol + commit + mueve la rama, a partir de blobs YA creados
// (`[{ path, sha }]`). Es la "segunda mitad" de deployAtomicCommit — se
// separa para que el conector MCP pueda usarla despues de subir los blobs
// en varias llamadas incrementales (add_files), sin duplicar esta lógica.
//
// Igual que deployAtomicCommit: sin base_tree, asi que el arbol nuevo
// REEMPLAZA todo el contenido existente del repo en esa rama.
export async function finalizeCommitFromBlobs({ owner, repo, branch, token, blobs, message }) {
  if (blobs.length === 0) {
    throw new Error("No hay archivos para desplegar (0 blobs).");
  }

  let ref = await getBranchRef({ owner, repo, branch, token });

  // Mismo caso borde que deployAtomicCommit: un repo sin ningun commit no
  // acepta escritura via Git Data API todavia — hay que "sembrarlo" primero
  // con la API de Contents (unico camino permitido en un repo vacio).
  if (!ref) {
    const bootstrapPath = blobs[0].path.split("/").map(encodeURIComponent).join("/");
    // No tenemos el contenido en texto plano aqui (solo el sha del blob ya
    // creado) — para el bootstrap alcanza con leer ESE blob y reusar su
    // contenido base64 tal cual, sin decodificarlo/recodificarlo.
    const blobData = await gh(`/repos/${owner}/${repo}/git/blobs/${blobs[0].sha}`, token);
    await gh(`/repos/${owner}/${repo}/contents/${bootstrapPath}`, token, {
      method: "PUT",
      body: JSON.stringify({
        message: "Inicializa el repositorio",
        content: blobData.content,
        branch,
      }),
    });
    ref = await getBranchRef({ owner, repo, branch, token });
  }

  const parentSha = ref?.object?.sha || null;

  const tree = await ghWrite(`/repos/${owner}/${repo}/git/trees`, token, {
    method: "POST",
    body: JSON.stringify({
      tree: blobs.map((b) => ({ path: b.path, mode: "100644", type: "blob", sha: b.sha })),
    }),
  });

  const commit = await ghWrite(`/repos/${owner}/${repo}/git/commits`, token, {
    method: "POST",
    body: JSON.stringify({ message, tree: tree.sha, parents: parentSha ? [parentSha] : [] }),
  });

  if (ref) {
    await ghWrite(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, token, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });
  } else {
    await ghWrite(`/repos/${owner}/${repo}/git/refs`, token, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }),
    });
  }

  const commitDetail = await gh(`/repos/${owner}/${repo}/commits/${commit.sha}`, token);
  return { commitSha: commit.sha, url: commitDetail.html_url };
}

// ---------- Commit atomico (reemplaza todo el contenido del repo) ----------
//
// A diferencia de subir archivo por archivo (que crea un commit por
// archivo), esto arma un arbol de Git completo con el contenido del zip y
// lo publica como UN SOLO commit — el flujo correcto para una plataforma
// de despliegues real.
//
// files: [{ path, buffer }]
// resumeBlobs (opcional): { [path]: sha } ya subidos en un intento anterior
// (guardado por el cliente antes de un recargo de pagina) — se reusan sin
// volver a golpear la API.
export async function deployAtomicCommit({
  owner,
  repo,
  branch,
  token,
  files,
  message,
  onProgress,
  resumeBlobs,
}) {
  // Una sola llamada para saber que ya existe en el repo, y asi no volver a
  // subir archivos cuyo contenido no cambio (menos solicitudes = menos
  // probabilidad de pegarle al limite secundario). Tambien es la base para
  // el reporte de nuevos/modificados/eliminados.
  onProgress?.({ stage: "comparing" });
  const existingTree = await getExistingTreeMap({ owner, repo, branch, token }).catch(() => new Map());
  const newPaths = new Set(files.map((f) => f.path));

  onProgress?.({ stage: "blobs", index: 0, total: files.length });

  const blobs = [];
  let added = 0;
  let modified = 0;
  let unchanged = 0;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const existedBefore = existingTree.has(file.path);

    // El hash local SIEMPRE se calcula primero, sobre el contenido actual
    // del zip que se esta subiendo ahora. Es la unica fuente de verdad de
    // "que hay en este archivo ahora mismo" — nunca se confia en un dato
    // guardado sin antes verificar que siga correspondiendo al contenido
    // real. Esto es barato (hash local, sin red) y evita que un progreso
    // guardado de un intento anterior (con OTRO contenido) enmascare un
    // cambio real como si fuera "sin cambios".
    const localSha = gitBlobSha1(file.buffer);

    const resumedSha = resumeBlobs?.[file.path];
    if (resumedSha && resumedSha === localSha) {
      // El progreso guardado coincide con el contenido actual: ese blob ya
      // esta subido en GitHub de un intento anterior interrumpido, no hace
      // falta volver a mandarlo.
      blobs.push({ path: file.path, sha: resumedSha });
      if (existingTree.get(file.path) === resumedSha) unchanged++;
      else if (existedBefore) modified++;
      else added++;
      onProgress?.({ stage: "blobs", index: i + 1, total: files.length, path: file.path, sha: resumedSha, resumed: true });
      continue;
    }

    if (existingTree.get(file.path) === localSha) {
      blobs.push({ path: file.path, sha: localSha });
      unchanged++;
      onProgress?.({ stage: "blobs", index: i + 1, total: files.length, path: file.path, sha: localSha, unchanged: true });
      continue;
    }

    const sha = await createBlob({
      owner,
      repo,
      token,
      base64Content: file.buffer.toString("base64"),
      onRateLimited: (waitSeconds, attempt) =>
        onProgress?.({ stage: "rate-limited", path: file.path, waitSeconds, attempt }),
    });
    blobs.push({ path: file.path, sha });
    if (existedBefore) modified++;
    else added++;
    onProgress?.({ stage: "blobs", index: i + 1, total: files.length, path: file.path, sha });
  }

  const deletedPaths = [...existingTree.keys()].filter((p) => !newPaths.has(p));
  const stats = { added, modified, deleted: deletedPaths.length, unchanged };
  console.log(
    `[deployAtomicCommit] ${owner}/${repo}@${branch} — nuevos=${added} modificados=${modified} ` +
      `eliminados=${deletedPaths.length} sin_cambios=${unchanged} (total zip=${files.length}, ` +
      `total repo previo=${existingTree.size})`
  );

  // Si nada cambio (ni archivos nuevos/modificados ni eliminados), no tiene
  // sentido crear un commit vacio — GitHub ademas lo rechazaria o crearia
  // un commit identico al anterior sin ningun cambio real.
  if (added === 0 && modified === 0 && deletedPaths.length === 0) {
    onProgress?.({ stage: "no-changes" });
    return { noChanges: true, stats };
  }

  onProgress?.({ stage: "tree" });
  onProgress?.({ stage: "commit" });
  onProgress?.({ stage: "push" });

  const result = await finalizeCommitFromBlobs({ owner, repo, branch, token, blobs, message });
  return { ...result, stats };
}

// ---------- Restaurar una version anterior ----------
//
// Mueve la rama para que apunte de nuevo al commit indicado. Es equivalente
// a un "git reset --hard <sha>" publicado con force-push: la forma mas
// simple y confiable de restaurar exactamente ese estado anterior. Los
// commits posteriores quedan fuera del historial de la rama (aunque siguen
// existiendo en GitHub por un tiempo antes del garbage collection).
export async function restoreToCommit({ owner, repo, branch, token, sha }) {
  await gh(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, token, {
    method: "PATCH",
    body: JSON.stringify({ sha, force: true }),
  });
  return { restoredTo: sha };
}

export async function ensureRepoExists({ owner, repo, token, create, isPublic }) {
  try {
    await gh(`/repos/${owner}/${repo}`, token);
    return { created: false };
  } catch (e) {
    if (e.status === 404 && create) {
      await gh(`/user/repos`, token, {
        method: "POST",
        body: JSON.stringify({ name: repo, private: !isPublic }),
      });
      return { created: true };
    }
    throw e;
  }
}
