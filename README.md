# crisbofiles

Cuenta personal para administrar, actualizar y desplegar tus aplicaciones
desde una sola interfaz — sin usar Git manualmente.

## Qué cambió en esta versión (importante)

Antes, la sesión y las apps que conectabas vivían en el navegador (cookie +
localStorage) — por eso se perdían al borrar datos del navegador o cambiar
de dispositivo. Ahora:

- **Inicias sesión con tu cuenta de Google** (es tu identidad real en la app).
- **GitHub se vincula una sola vez** a esa cuenta de Google — el token queda
  guardado en una base de datos, no en el navegador. Vas a poder borrar el
  historial de Safari las veces que quieras: la próxima vez que entres con
  Google, GitHub va a seguir vinculado.
- **Las aplicaciones que conectes (repo + Vercel/Hostinger) también viven en
  la base de datos**, no en localStorage.

**Migración:** como cambió el lugar donde se guarda todo, las apps que
habías conectado en la versión anterior (localStorage) no van a aparecer
solas acá — es la última vez que las vas a tener que volver a conectar,
después de esto quedan guardadas para siempre en tu cuenta.

## Qué hace hoy (funcional de verdad)

- Login con Google (identidad de la cuenta).
- Vincular GitHub una sola vez, guardado de forma persistente.
- Dashboard con todas tus apps: framework, estado, dominio (con su favicon
  real), repo, hosting y última actualización.
- Conectar una app → repo de GitHub + opcionalmente Vercel o Hostinger.
  Editable después sin duplicar la tarjeta.
- Actualizar con un botón: zip → valida → ignora `node_modules`/`.next`/
  `.git`/`dist`/`build` → **reemplaza por completo** el contenido:
  - En GitHub: un solo commit atómico que reemplaza todo el árbol (nada
    viejo queda).
  - En Hostinger: vacía la carpeta remota antes de subir el zip nuevo.
- Historial de commits + restaurar cualquier versión anterior.
- Verificación de DNS/SSL de dominios.
- Notificaciones en tiempo real de cada paso.

## Puesta en marcha (hay pasos nuevos — leer completo antes de desplegar)

### 1. Base de datos Postgres

La forma mas simple es **Vercel Postgres** (no sale de la misma pantalla de
tu proyecto):

1. En tu proyecto en Vercel → pestaña **Storage** → **Create Database** →
   **Postgres**.
2. Sigue el asistente (nombre, región). Al terminar, Vercel conecta
   automáticamente la base de datos a tu proyecto y agrega las variables de
   entorno necesarias (`POSTGRES_URL`, etc.) — el código ya las reconoce.
3. En la misma pantalla de la base de datos, busca la pestaña **Query** (o
   "Data" → "Query editor" según la versión de Vercel) y pega el contenido
   completo del archivo `schema.sql` que viene en este zip. Ejecútalo una
   vez — crea las tablas `users` y `apps`.

Alternativas si prefieres: **Supabase** o **Neon** (ambos tienen plan
gratuito) — creas la base ahí, copias su cadena de conexión, y la pegas
como la variable de entorno `DATABASE_URL` en Vercel. El paso de correr
`schema.sql` es el mismo (ambos tienen un editor SQL en su panel).

### 2. Crear credenciales de Google OAuth

1. Ve a [Google Cloud Console](https://console.cloud.google.com/) → crea un
   proyecto nuevo (o usa uno existente).
2. **APIs & Services** → **OAuth consent screen** → tipo **External** →
   completa nombre de la app y tu correo. No hace falta publicarla para uso
   personal (queda en modo "Testing"; agrega tu propio correo en
   "Test users").
3. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth
   client ID** → tipo **Web application**.
4. En **Authorized redirect URIs** agrega:
   `https://<tu-dominio-de-vercel>/api/auth/google/callback`
5. Copia el **Client ID** y el **Client Secret**.

### 3. Crear (o reutilizar) la OAuth App de GitHub

Si ya la creaste antes, revisa que su **Authorization callback URL** siga
siendo `https://<tu-dominio-de-vercel>/api/auth/github/callback`. Si no la
tienes, mismo proceso de siempre: GitHub → Settings → Developer settings →
OAuth Apps → New OAuth App.

### 4. Variables de entorno en Vercel

Project Settings → Environment Variables:

- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (paso 3)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (paso 2)
- `DATABASE_URL` (si usaste Vercel Postgres, ya está puesta sola; si usaste
  Supabase/Neon, pégala tú)
- `SESSION_SECRET` — cualquier cadena larga y aleatoria (por ejemplo,
  generá una en https://generate-secret.vercel.app/32)

### 5. Redeploy

Sube este código a tu repo y espera el redeploy (o dispáralo manualmente
desde Vercel) para que tome las variables nuevas.

### 6. Usarlo

1. Abre tu URL → **Continuar con Google**.
2. Vas a ver un aviso para **vincular GitHub** — hazlo una sola vez.
3. **Conectar aplicación** → elige el repo, dale nombre/ícono, y
   opcionalmente conecta Vercel o Hostinger (con su dominio, para que se
   vea el favicon real en la tarjeta).
4. **Actualizar** cuando quieras publicar cambios.

## Arquitectura

```
lib/
  db.js         -> Pool de Postgres (creado de forma perezosa)
  session.js     -> cookie firmada (HMAC) con solo el userId + lookup en DB
  google.js       -> OAuth de Google (login principal)
  github.js        -> OAuth de GitHub (vinculo), repos, commit atomico, historial, restore
  vercel.js          -> proyectos, deployments, dominios, deploy hooks
  hostinger.js         -> FTP/FTPS/SFTP, con limpieza de la carpeta remota antes de subir
  zip.js                -> extraccion, filtrado, validacion, deteccion de framework
  dns.js                 -> verificacion de DNS/SSL
  providers.js             -> registro de proveedores disponibles/futuros
app/api/
  auth/google/(callback)     -> login principal
  auth/github/(callback)      -> vincular GitHub a la cuenta ya iniciada
  auth/logout
  me                           -> perfil de la sesion actual
  apps, apps/[id]                -> CRUD de aplicaciones en la base de datos
  repos                           -> listar repos de GitHub del usuario
  github/[owner]/[repo]/...         -> commits, restore, deploy (commit atomico)
  vercel/..., hostinger/deploy, domain/check
```

## Sobre la integración con Vercel

`lib/vercel.js` usa endpoints públicos documentados de la API de Vercel tal
como están hoy. Si algo empieza a fallar, ese archivo es el primer lugar a
revisar contra la documentación oficial de Vercel.
Actualización de configuración.
## Notas de seguridad

- El token de GitHub y las credenciales de Vercel/Hostinger se guardan en
  la base de datos **sin cifrar** (texto plano en la columna). Es un paso
  adelante enorme respecto a tenerlas en el navegador de cada quien, pero
  para un producto realmente multiusuario el siguiente paso sería cifrarlas
  en reposo (por ejemplo con `pgcrypto` o cifrado a nivel de aplicación
  antes de guardar).
- La cookie de sesión ahora solo contiene el `userId`, firmado con HMAC
  (`SESSION_SECRET`) para que no se pueda falsificar — pero sigue siendo de
  larga duración (30 días) sin revocación server-side individual. Para algo
  más robusto, el siguiente paso sería una tabla de sesiones con expiración
  y logout real del lado del servidor.
