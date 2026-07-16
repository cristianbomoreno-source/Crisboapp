import { query } from "./db";

// Igual que getSession() pero por userId directo — para rutas que se
// autentican con un token de API (MCP) en vez de la cookie de sesion.
export async function getUserById(userId) {
  const { rows } = await query("SELECT * FROM users WHERE id = $1", [userId]);
  return rows[0] || null;
}
