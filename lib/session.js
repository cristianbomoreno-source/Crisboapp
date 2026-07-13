import { cookies } from "next/headers";

const COOKIE_NAME = "crisbofiles_session";

// MVP de un solo usuario: guardamos el access_token de GitHub en una cookie
// httpOnly. Para un producto multiusuario real, esto debería vivir cifrado
// en una base de datos, ligado a una sesión propia (con su propio ID),
// nunca el token crudo en una cookie de larga duración.
export function setSession(res, data) {
  const value = Buffer.from(JSON.stringify(data)).toString("base64");
  res.cookies.set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 dias
  });
}

export function clearSession(res) {
  res.cookies.set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
}

export function getSession() {
  const raw = cookies().get(COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));
  } catch {
    return null;
  }
}
