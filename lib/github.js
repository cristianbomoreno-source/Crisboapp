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
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(data?.message || `GitHub API error (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
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
export async function createBlob({ owner, repo, token, base64Content }) {
  const blob = await gh(`/repos/${owner}/${repo}/git/blobs`, token, {
    method: "POST",
    body: JSON.stringify({ content: base64Content, encoding: "base64" }),
  });
  return blob.sha;
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

  const tree = await gh(`/repos/${owner}/${repo}/git/trees`, token, {
    method: "POST",
    body: JSON.stringify({
      tree: blobs.map((b) => ({ path: b.path, mode: "100644", type: "blob", sha: b.sha })),
    }),
  });

  const commit = await gh(`/repos/${owner}/${repo}/git/commits`, token, {
    method: "POST",
    body: JSON.stringify({ message, tree: tree.sha, parents: parentSha ? [parentSha] : [] }),
  });

  if (ref) {
    await gh(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, token, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });
  } else {
    await gh(`/repos/${owner}/${repo}/git/refs`, token, {
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
export async function deployAtomicCommit({
  owner,
  repo,
  branch,
  token,
  files,
  message,
  onProgress,
}) {
  onProgress?.({ stage: "blobs", index: 0, total: files.length });

  const blobs = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const sha = await createBlob({ owner, repo, token, base64Content: file.buffer.toString("base64") });
    blobs.push({ path: file.path, sha });
    onProgress?.({ stage: "blobs", index: i + 1, total: files.length, path: file.path });
  }

  onProgress?.({ stage: "tree" });
  onProgress?.({ stage: "commit" });
  onProgress?.({ stage: "push" });

  return finalizeCommitFromBlobs({ owner, repo, branch, token, blobs, message });
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
