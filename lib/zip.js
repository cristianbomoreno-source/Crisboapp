import JSZip from "jszip";

const IGNORED_DIR_NAMES = new Set([
  "node_modules",
  ".next",
  ".git",
  ".vercel",
  "dist",
  "build",
  ".DS_Store",
  ".turbo",
  "coverage",
]);

function isIgnored(path) {
  return path.split("/").some((segment) => IGNORED_DIR_NAMES.has(segment));
}

// Archivos que casi siempre contienen secretos reales (claves de API,
// tokens, credenciales de base de datos) y NUNCA deberian terminar en un
// commit, sin importar que el usuario haya zipeado su carpeta local
// completa por accidente. `.env.example`/`.env.sample`/`.env.template` se
// permiten explicitamente porque son plantillas vacias, no secretos.
const ALLOWED_ENV_FILENAMES = new Set([".env.example", ".env.sample", ".env.template"]);
const SENSITIVE_FILE_PATTERNS = [
  /^\.env(\..+)?$/i, // .env, .env.local, .env.production.local, etc.
  /\.pem$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /^id_rsa(\.pub)?$/i,
  /^id_ed25519(\.pub)?$/i,
];

export function isSensitiveFile(filename) {
  if (ALLOWED_ENV_FILENAMES.has(filename)) return false;
  return SENSITIVE_FILE_PATTERNS.some((re) => re.test(filename));
}

// Devuelve [{ path, buffer }] ya filtrado y ordenado.
export async function extractZip(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const entries = Object.values(zip.files).filter((f) => !f.dir);

  const allPaths = entries.map((e) => e.name);
  const rootPrefix = (() => {
    if (allPaths.length === 0) return "";
    const first = allPaths[0].split("/")[0];
    const allShareRoot = allPaths.every((p) => p.split("/")[0] === first);
    return allShareRoot ? `${first}/` : "";
  })();

  const files = [];
  const skipped = [];
  for (const entry of entries) {
    const relPath = entry.name.startsWith(rootPrefix)
      ? entry.name.slice(rootPrefix.length)
      : entry.name;
    if (!relPath || isIgnored(relPath)) continue;
    const filename = relPath.split("/").pop();
    if (isSensitiveFile(filename)) {
      skipped.push(relPath);
      continue;
    }
    const buffer = await entry.async("nodebuffer");
    files.push({ path: relPath, buffer });
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  // Se cuelga como propiedad extra (el array sigue siendo un array normal)
  // para no romper a quienes ya hacen `files.map(...)` / `files.length` —
  // quien quiera avisar al usuario puede leer `files.skippedSensitive`.
  files.skippedSensitive = skipped;
  return files;
}

// Validaciones minimas de sanidad antes de publicar.
export function validateProject(files) {
  const errors = [];
  if (files.length === 0) {
    errors.push("El zip esta vacio (o solo contenia carpetas ignoradas).");
  }
  const totalBytes = files.reduce((sum, f) => sum + f.buffer.length, 0);
  const MAX_BYTES = 90 * 1024 * 1024; // margen bajo el limite de 100MB por archivo/commit de GitHub
  if (totalBytes > MAX_BYTES) {
    errors.push(
      `El proyecto pesa ${(totalBytes / 1024 / 1024).toFixed(1)}MB, ` +
        `supera el limite recomendado de ${MAX_BYTES / 1024 / 1024}MB para subir via API.`
    );
  }
  const tooBig = files.find((f) => f.buffer.length > 45 * 1024 * 1024);
  if (tooBig) {
    errors.push(`El archivo "${tooBig.path}" supera 45MB — GitHub lo rechazara.`);
  }
  return { valid: errors.length === 0, errors, totalBytes };
}

export function detectFramework(paths) {
  const has = (name) => paths.some((p) => p.split("/").pop() === name);
  const hasExt = (ext) => paths.some((p) => p.endsWith(ext));

  if (has("next.config.js") || has("next.config.mjs") || has("next.config.ts")) return "Next.js";
  if (has("astro.config.mjs") || has("astro.config.ts")) return "Astro";
  if (has("svelte.config.js")) return "SvelteKit";
  if (has("nuxt.config.js") || has("nuxt.config.ts")) return "Nuxt";
  if (has("vite.config.js") || has("vite.config.ts")) return "Vite";
  if (has("angular.json")) return "Angular";
  if (has("package.json") && paths.some((p) => p.includes("src/App.jsx") || p.includes("src/App.tsx")))
    return "React";
  if (has("package.json")) return "Node.js";
  if (has("requirements.txt") || hasExt(".py")) return "Python";
  if (has("Gemfile")) return "Ruby";
  if (has("pom.xml")) return "Java";
  if (hasExt(".html")) return "Estatico";
  return "Generico";
}

export function generateReadme(repoName, framework) {
  return `# ${repoName}

Proyecto detectado como **${framework}**, publicado con crisbofiles.

## Como usarlo

Revisa \`package.json\` (o el archivo de entrada equivalente) para los
comandos de instalacion y arranque de este proyecto.
`;
}
