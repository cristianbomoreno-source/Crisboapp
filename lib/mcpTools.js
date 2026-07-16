import { query } from "./db";
import { getUserById } from "./users";
import { extractZip, validateProject, detectFramework } from "./zip";
import { deployAtomicCommit, listCommits, restoreToCommit } from "./github";

// Mismo tope que el limite de cuerpo de una funcion serverless de Vercel
// (~4.5MB) menos margen para el resto del JSON-RPC y la expansion de
// base64 (~33%). Proyectos mas grandes deben seguir usando el boton
// "Actualizar" normal de la app (que sube a Vercel Blob sin este limite).
const MAX_INLINE_ZIP_BYTES = 3 * 1024 * 1024;

function textResult(text, isError = false) {
  return { content: [{ type: "text", text }], isError };
}

async function getOwnedApp(userId, appId) {
  const { rows } = await query("SELECT * FROM apps WHERE id = $1 AND user_id = $2", [appId, userId]);
  return rows[0] || null;
}

async function decodeAndValidateZip(base64) {
  if (!base64 || typeof base64 !== "string") {
    throw new Error("Falta zip_base64.");
  }
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length === 0) {
    throw new Error("El zip llego vacio (¿el base64 esta bien formado?).");
  }
  if (buffer.length > MAX_INLINE_ZIP_BYTES) {
    throw new Error(
      `El zip pesa ${(buffer.length / 1024 / 1024).toFixed(1)}MB — supera el limite de ` +
        `${MAX_INLINE_ZIP_BYTES / 1024 / 1024}MB para subirlo inline por este conector. ` +
        `Para proyectos mas grandes usa el boton "Actualizar" normal en crisbofiles.`
    );
  }

  const files = await extractZip(buffer);
  const validation = validateProject(files);
  const framework = detectFramework(files.map((f) => f.path));
  return { files, validation, framework };
}

function summaryText({ app, files, validation, framework }) {
  const lines = [
    `App: ${app.name} (${app.github_owner}/${app.github_repo}, rama ${app.github_default_branch})`,
    `Framework detectado: ${framework}`,
    `Archivos a subir: ${files.length} (${(validation.totalBytes / 1024).toFixed(0)} KB)`,
  ];
  if (files.skippedSensitive?.length) {
    lines.push(
      `⚠️ Se omitieron ${files.skippedSensitive.length} archivo(s) con posibles credenciales: ` +
        files.skippedSensitive.join(", ")
    );
  }
  if (!validation.valid) {
    lines.push(`❌ Problemas: ${validation.errors.join(" ")}`);
  }
  lines.push(
    "",
    "Esto REEMPLAZA por completo el contenido del repositorio en esa rama " +
      "(commit atomico) — no es un merge incremental."
  );
  return lines.join("\n");
}

// --------------------------------------------------------------------------
// Definicion de herramientas expuestas al conector MCP
// --------------------------------------------------------------------------

export const TOOLS = [
  {
    name: "list_apps",
    description:
      "Lista las aplicaciones conectadas en crisbofiles (id, nombre, framework, repo de GitHub, rama). " +
      "Usa el \"id\" que devuelve esto como appId en preview_deploy / deploy / list_recent_commits / restore_deploy.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "preview_deploy",
    description:
      "Revisa QUE se subiria a GitHub sin hacer ningun cambio todavia (no escribe nada). " +
      "Llama esto SIEMPRE antes de deploy, y muestra el resultado al usuario para que confirme " +
      "explicitamente antes de llamar a deploy con confirm:true.",
    inputSchema: {
      type: "object",
      properties: {
        appId: { type: "string", description: "Id de la app (ver list_apps)." },
        zip_base64: { type: "string", description: "Contenido del .zip del proyecto, en base64." },
      },
      required: ["appId", "zip_base64"],
      additionalProperties: false,
    },
  },
  {
    name: "deploy",
    description:
      "Reemplaza TODO el contenido del repositorio de GitHub de una app con el contenido del zip, " +
      "en un solo commit atomico. Requiere confirm:true — y ese confirm solo debe enviarse despues " +
      "de que el usuario haya visto el resultado de preview_deploy y haya dicho explicitamente que " +
      "quiere continuar. Los archivos con posibles credenciales (.env*, claves, etc.) nunca se suben, " +
      "se omiten automaticamente.",
    inputSchema: {
      type: "object",
      properties: {
        appId: { type: "string", description: "Id de la app (ver list_apps)." },
        zip_base64: { type: "string", description: "Contenido del .zip del proyecto, en base64." },
        message: { type: "string", description: "Mensaje del commit (opcional)." },
        confirm: {
          type: "boolean",
          description: "Debe ser true. El usuario debe haber confirmado explicitamente antes de esto.",
        },
      },
      required: ["appId", "zip_base64", "confirm"],
      additionalProperties: false,
    },
  },
  {
    name: "list_recent_commits",
    description: "Lista los commits recientes del repositorio de una app (historial de despliegues).",
    inputSchema: {
      type: "object",
      properties: {
        appId: { type: "string" },
        limit: { type: "number", description: "Cuantos commits traer (por defecto 10, maximo 30)." },
      },
      required: ["appId"],
      additionalProperties: false,
    },
  },
  {
    name: "restore_deploy",
    description:
      "Mueve la rama de vuelta a un commit anterior (equivalente a un rollback). Requiere confirm:true " +
      "y el sha exacto de list_recent_commits. Esto tambien reescribe el historial de la rama " +
      "(force-push), no es reversible de forma trivial.",
    inputSchema: {
      type: "object",
      properties: {
        appId: { type: "string" },
        sha: { type: "string", description: "SHA completo del commit al que volver (ver list_recent_commits)." },
        confirm: { type: "boolean" },
      },
      required: ["appId", "sha", "confirm"],
      additionalProperties: false,
    },
  },
];

// --------------------------------------------------------------------------
// Ejecucion de cada herramienta
// --------------------------------------------------------------------------

export async function callTool(userId, name, args = {}) {
  const user = await getUserById(userId);
  if (!user) return textResult("Usuario no encontrado.", true);

  switch (name) {
    case "list_apps": {
      const { rows } = await query(
        "SELECT id, name, framework, github_owner, github_repo, github_default_branch, updated_at " +
          "FROM apps WHERE user_id = $1 ORDER BY updated_at DESC",
        [userId]
      );
      if (rows.length === 0) return textResult("No tienes aplicaciones conectadas todavia en crisbofiles.");
      const lines = rows.map(
        (r) =>
          `- ${r.name} (id: ${r.id}) — ${r.github_owner}/${r.github_repo}@${r.github_default_branch}` +
          (r.framework ? ` — ${r.framework}` : "")
      );
      return textResult(lines.join("\n"));
    }

    case "preview_deploy": {
      if (!user.github_token) return textResult("Tu cuenta no tiene GitHub vinculado en crisbofiles.", true);
      const app = await getOwnedApp(userId, args.appId);
      if (!app) return textResult(`No existe una app con id "${args.appId}" en tu cuenta.`, true);

      try {
        const { files, validation, framework } = await decodeAndValidateZip(args.zip_base64);
        return textResult(summaryText({ app, files, validation, framework }), !validation.valid);
      } catch (e) {
        return textResult(e.message, true);
      }
    }

    case "deploy": {
      if (args.confirm !== true) {
        return textResult(
          "Falta confirmar. Llama primero a preview_deploy, muestra el resultado al usuario, y " +
            "solo si el usuario confirma explicitamente, vuelve a llamar a deploy con confirm:true.",
          true
        );
      }
      if (!user.github_token) return textResult("Tu cuenta no tiene GitHub vinculado en crisbofiles.", true);
      const app = await getOwnedApp(userId, args.appId);
      if (!app) return textResult(`No existe una app con id "${args.appId}" en tu cuenta.`, true);

      let files, validation, framework;
      try {
        ({ files, validation, framework } = await decodeAndValidateZip(args.zip_base64));
      } catch (e) {
        return textResult(e.message, true);
      }
      if (!validation.valid) {
        return textResult(`No se puede desplegar: ${validation.errors.join(" ")}`, true);
      }

      try {
        const result = await deployAtomicCommit({
          owner: app.github_owner,
          repo: app.github_repo,
          branch: app.github_default_branch,
          token: user.github_token,
          files,
          message: args.message || `Actualizacion de ${app.name} via Claude (MCP)`,
        });
        const skippedNote = files.skippedSensitive?.length
          ? ` Se omitieron ${files.skippedSensitive.length} archivo(s) con posibles credenciales: ` +
            files.skippedSensitive.join(", ") +
            "."
          : "";
        return textResult(
          `✅ Desplegado: ${files.length} archivos (${framework}) en un solo commit.\n` +
            `Commit: ${result.commitSha.slice(0, 7)} — ${result.url}${skippedNote}`
        );
      } catch (e) {
        return textResult(`Fallo el despliegue: ${e.message}`, true);
      }
    }

    case "list_recent_commits": {
      if (!user.github_token) return textResult("Tu cuenta no tiene GitHub vinculado en crisbofiles.", true);
      const app = await getOwnedApp(userId, args.appId);
      if (!app) return textResult(`No existe una app con id "${args.appId}" en tu cuenta.`, true);

      const limit = Math.min(Number(args.limit) || 10, 30);
      const commits = await listCommits(app.github_owner, app.github_repo, app.github_default_branch, user.github_token, limit);
      if (commits.length === 0) return textResult("Sin commits todavia en ese repositorio/rama.");
      const lines = commits.map((c) => `- ${c.shortSha} — ${c.message} (${c.author}, ${c.date})`);
      return textResult(lines.join("\n"));
    }

    case "restore_deploy": {
      if (args.confirm !== true) {
        return textResult(
          "Falta confirmar. Pide confirmacion explicita del usuario y vuelve a llamar con confirm:true.",
          true
        );
      }
      if (!user.github_token) return textResult("Tu cuenta no tiene GitHub vinculado en crisbofiles.", true);
      const app = await getOwnedApp(userId, args.appId);
      if (!app) return textResult(`No existe una app con id "${args.appId}" en tu cuenta.`, true);
      if (!args.sha) return textResult("Falta el sha del commit al que restaurar.", true);

      try {
        await restoreToCommit({
          owner: app.github_owner,
          repo: app.github_repo,
          branch: app.github_default_branch,
          token: user.github_token,
          sha: args.sha,
        });
        return textResult(`✅ Rama ${app.github_default_branch} restaurada a ${args.sha.slice(0, 7)}.`);
      } catch (e) {
        return textResult(`Fallo la restauracion: ${e.message}`, true);
      }
    }

    default:
      return textResult(`Herramienta desconocida: ${name}`, true);
  }
}
