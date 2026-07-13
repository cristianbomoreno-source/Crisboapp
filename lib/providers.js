// Registro central de proveedores. Cada uno declara su estado y, cuando
// está implementado, los módulos que resuelven su lógica real. Para agregar
// un proveedor nuevo (Netlify, Cloudflare Pages, Railway, Render, Supabase,
// Firebase, GoDaddy...) el patrón es:
//
//   1. Crear lib/<proveedor>.js con las funciones equivalentes a las que
//      ya existen en lib/vercel.js (listProjects, getLatestDeployment, etc).
//   2. Agregar su entrada aquí con status: "available".
//   3. El Dashboard y AppCard ya están preparados para listarlo sin más
//      cambios — leen esta tabla, no tienen nada hardcodeado por proveedor.
//
// Esto es lo que hace que sumar integraciones nuevas sea incremental y no
// requiera tocar la arquitectura existente.

export const PROVIDERS = {
  github: {
    id: "github",
    label: "GitHub",
    category: "source-control",
    status: "available",
  },
  vercel: {
    id: "vercel",
    label: "Vercel",
    category: "hosting",
    status: "available",
  },
  hostinger: {
    id: "hostinger",
    label: "Hostinger",
    category: "hosting",
    status: "available",
    note: "Vía FTP/SFTP, sin API oficial de despliegues.",
  },
  netlify: { id: "netlify", label: "Netlify", category: "hosting", status: "planned" },
  cloudflare_pages: {
    id: "cloudflare_pages",
    label: "Cloudflare Pages",
    category: "hosting",
    status: "planned",
  },
  railway: { id: "railway", label: "Railway", category: "hosting", status: "planned" },
  render: { id: "render", label: "Render", category: "hosting", status: "planned" },
  supabase: { id: "supabase", label: "Supabase", category: "backend", status: "planned" },
  firebase: { id: "firebase", label: "Firebase", category: "backend", status: "planned" },
  godaddy: { id: "godaddy", label: "GoDaddy", category: "dns", status: "planned" },
  cloudflare_dns: {
    id: "cloudflare_dns",
    label: "Cloudflare DNS",
    category: "dns",
    status: "planned",
  },
};

export function listProviders() {
  return Object.values(PROVIDERS);
}

export function isAvailable(id) {
  return PROVIDERS[id]?.status === "available";
}
