import crypto from "node:crypto";
import { query } from "./db";

// Prefijo visible para reconocer estos tokens a simple vista (en logs, en
// la pantalla de "generar token", etc.) — no es secreto en si mismo, el
// secreto es el resto de la cadena aleatoria.
const PREFIX = "cbf_mcp_";
const TOKEN_BYTES = 32; // 256 bits de entropia

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateRawToken() {
  return `${PREFIX}${crypto.randomBytes(TOKEN_BYTES).toString("base64url")}`;
}

// Crea un token nuevo para el usuario y lo devuelve EN CLARO — es la unica
// vez que se puede leer completo. En la base de datos solo se guarda su
// hash (sha256), igual que una contraseña: si alguien lee la base de datos
// no puede reconstruir el token original.
export async function createApiToken(userId, name) {
  const token = generateRawToken();
  const tokenHash = hashToken(token);
  const tokenPrefix = token.slice(0, PREFIX.length + 8);

  const { rows } = await query(
    `INSERT INTO api_tokens (user_id, name, token_hash, token_prefix)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, token_prefix, created_at, last_used_at, revoked_at`,
    [userId, name?.trim() || "Token de Claude", tokenHash, tokenPrefix]
  );

  return { ...rows[0], token };
}

export async function listApiTokens(userId) {
  const { rows } = await query(
    `SELECT id, name, token_prefix, created_at, last_used_at, revoked_at
     FROM api_tokens
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

// Revoca (no borra) el token — asi queda el registro de que existio y
// cuando se revoco, util si algun dia hay que auditar accesos.
export async function revokeApiToken(userId, tokenId) {
  const { rowCount } = await query(
    `UPDATE api_tokens SET revoked_at = now()
     WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
    [tokenId, userId]
  );
  return rowCount > 0;
}

// Valida un token recibido en el header Authorization y devuelve el userId
// dueno, o null si no es valido/esta revocado. Actualiza last_used_at de
// forma "fire and forget" (no bloquea la respuesta del endpoint).
export async function getUserIdForToken(token) {
  if (!token || !token.startsWith(PREFIX)) return null;

  const tokenHash = hashToken(token);
  const { rows } = await query(
    `SELECT id, user_id FROM api_tokens WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash]
  );
  const row = rows[0];
  if (!row) return null;

  query(`UPDATE api_tokens SET last_used_at = now() WHERE id = $1`, [row.id]).catch(() => {});
  return row.user_id;
}
