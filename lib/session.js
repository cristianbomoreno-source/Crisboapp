import { cookies } from "next/headers";
import crypto from "node:crypto";
import { query } from "./db";

const COOKIE_NAME = "crisbofiles_session";

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "Falta la variable de entorno SESSION_SECRET (cualquier cadena larga y aleatoria sirve)."
    );
  }
  return secret;
}

function sign(value) {
  return crypto.createHmac("sha256", getSecret()).update(value).digest("hex");
}

// La cookie solo guarda el userId, firmado con HMAC para que no se pueda
// falsificar (nadie puede escribir "userId: 1" a mano y hacerse pasar por
// otra cuenta). Los datos reales (token de GitHub, etc) viven en la base de
// datos, nunca en la cookie — por eso sobreviven a borrar el navegador: lo
// unico que se pierde ahi es la cookie de sesion, no la cuenta.
function encode(payload) {
  const value = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${value}.${sign(value)}`;
}

function decode(raw) {
  const [value, sig] = raw.split(".");
  if (!value || !sig) return null;
  const expected = sign(value);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
}

export function setSessionCookie(res, userId) {
  res.cookies.set(COOKIE_NAME, encode({ userId }), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 dias
  });
}

export function clearSessionCookie(res) {
  res.cookies.set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
}

// Devuelve la sesion actual con datos frescos desde la base de datos (no
// solo lo que habia en la cookie), incluyendo si GitHub esta vinculado.
export async function getSession() {
  const raw = cookies().get(COOKIE_NAME)?.value;
  if (!raw) return null;

  const payload = decode(raw);
  if (!payload?.userId) return null;

  const { rows } = await query("SELECT * FROM users WHERE id = $1", [payload.userId]);
  const user = rows[0];
  if (!user) return null;

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatar_url,
    // Nombres compatibles con el resto del codigo existente (que ya leia
    // session.token / session.login para hablar con la API de GitHub).
    token: user.github_token || null,
    login: user.github_login || null,
    githubAvatarUrl: user.github_avatar_url || null,
    githubConnected: Boolean(user.github_token),
  };
}
