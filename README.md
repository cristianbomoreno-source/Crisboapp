# crisbofiles

Centro de control personal para administrar, actualizar y desplegar tus
aplicaciones desde una sola interfaz — sin usar Git manualmente.

## Qué hace hoy (funcional de verdad)

- **Login con GitHub** (OAuth) — lee y actualiza los repos a los que tengas acceso.
- **Dashboard** con todas tus apps conectadas como tarjetas: framework, estado, dominio, repo, hosting y última actualización.
- **Conectar una app**: eliges un repo de GitHub y, opcionalmente, un proyecto de Vercel o un destino FTP/SFTP (Hostinger).
- **Actualizar con un botón**: subes un `.zip`, se valida la estructura, se ignoran `node_modules`, `.next`, `.git`, `dist`, `build`, etc., y se publica como **un solo commit atómico** (no uno por archivo) directo a la rama principal.
- Si la app tiene un **Deploy Hook de Vercel** configurado, se dispara automáticamente tras el push.
- Si la app tiene **Hostinger** configurado, el mismo zip se sube también por FTP/FTPS/SFTP.
- **Historial de commits** por app, con botón para **restaurar** cualquier versión anterior (mueve la rama a ese commit).
- **Verificación de dominio**: registros DNS (A/CNAME) y validez del certificado SSL, sin necesitar cuenta de ningún proveedor.
- **Notificaciones en tiempo real** de cada paso: subiendo, creando commit, publicando, éxito o error con detalle.

## Qué NO está implementado todavía (a propósito)

Netlify, Cloudflare Pages, Railway, Render, Supabase, Firebase, GoDaddy y
Cloudflare DNS están **arquitectados** en `lib/providers.js` (marcados como
`planned`) pero no tienen su integración real todavía. Agregar cada uno es
mecánico: se crea `lib/<proveedor>.js` con las mismas funciones que ya
existen en `lib/vercel.js`, se cambia su estado a `available`, y el
Dashboard/AppCard los toman automáticamente porque leen esta tabla en vez
de tener cada proveedor hardcodeado.

Tampoco hay base de datos: qué apps registraste vive en `localStorage` del
navegador. Funciona perfecto para uso personal en un solo dispositivo. Si
esto crece a un producto multiusuario real, el siguiente paso es mover esa
tabla (y los tokens de Vercel/Hostinger, cifrados) a Postgres — recomendado:
Vercel Postgres o Supabase — y las credenciales de sesión a algo como
NextAuth en vez de la cookie casera que hay hoy en `lib/session.js`.

## Arquitectura

```
app/
  login/page.jsx                        -> pantalla de login
  dashboard/page.jsx                     -> grid de apps
  dashboard/[owner]/[repo]/page.jsx       -> detalle: historial, restore, DNS
  api/
    auth/github/route.js                  -> inicia OAuth
    auth/github/callback/route.js          -> intercambia code por token
    auth/logout/route.js
    me/route.js
    repos/route.js                         -> lista repos del usuario
    github/[owner]/[repo]/commits/route.js
    github/[owner]/[repo]/restore/route.js
    github/[owner]/[repo]/deploy/route.js  -> el flujo central (zip -> commit atomico -> push)
    vercel/projects/route.js
    vercel/projects/[id]/route.js
    vercel/redeploy/route.js
    hostinger/deploy/route.js
    domain/check/route.js
lib/
  session.js       -> cookie httpOnly con el token de GitHub
  github.js         -> OAuth, repos, commit atomico (Git Data API), historial, restore
  vercel.js          -> proyectos, deployments, dominios, env vars, deploy hooks
  hostinger.js        -> subida FTP/FTPS/SFTP
  zip.js                -> extraccion, filtrado de carpetas pesadas, validacion, deteccion de framework
  dns.js                 -> DNS-over-HTTPS + verificacion SSL nativa
  providers.js             -> registro central de proveedores (disponibles y futuros)
  appsStore.js               -> persistencia de "apps" en localStorage (MVP sin backend)
components/
  TopNav, AppCard, ConnectAppModal, DeployModal, Toasts, StatusBadge
```

### Por qué un solo commit atómico y no uno por archivo

Subir archivo por archivo (como en la versión anterior de esta idea) crea
un commit por cada archivo del zip — ensucia el historial y no es como
trabaja una plataforma de despliegues real. Aquí se arma el árbol completo
de Git (blobs + tree + commit) vía la Git Data API de GitHub y se publica
todo de una vez, igual que hace `git commit` localmente.

### Cómo funciona "restaurar una versión"

Mueve el puntero de la rama (`refs/heads/<rama>`) directo al commit
elegido — el equivalente a `git reset --hard <sha>` seguido de un push
forzado. Es la forma más simple y confiable de dejar el repo exactamente
como estaba. Los commits posteriores quedan fuera del historial de esa
rama (siguen existiendo en GitHub un tiempo antes de que se recolecten).

## Puesta en marcha

### 1. Crear la OAuth App de GitHub (una sola vez)

1. En GitHub: Settings → Developer settings → OAuth Apps → **New OAuth App**.
2. **Homepage URL**: la URL donde vayas a desplegar esto (ej. `https://deployhub-tuusuario.vercel.app`).
3. **Authorization callback URL**: la misma URL + `/api/auth/github/callback`
   (ej. `https://deployhub-tuusuario.vercel.app/api/auth/github/callback`).
4. Genera un **Client Secret** y guarda ambos valores (Client ID y Secret).

### 2. Desplegar en Vercel

1. Sube esta carpeta a un repo nuevo en GitHub.
2. En Vercel: **Add New → Project** → selecciona ese repo → **Deploy**.
3. Antes o después del primer deploy, ve a Project Settings → Environment
   Variables y agrega:
   - `GITHUB_CLIENT_ID`
   - `GITHUB_CLIENT_SECRET`
4. Si cambiaste la URL después de desplegar, actualiza también la
   **Authorization callback URL** en la OAuth App de GitHub para que
   coincida exactamente.
5. Redeploy para que tome las variables de entorno.

### 3. Usarlo

1. Abre tu URL → **Continuar con GitHub**.
2. **Conectar aplicación** → elige el repo, dale nombre/ícono, y opcionalmente
   conecta Vercel (token + proyecto, y si quieres redeploy automático, el
   Deploy Hook URL de Project Settings → Git → Deploy Hooks) o Hostinger
   (datos de FTP desde hPanel → Archivos → Detalles de FTP).
3. Desde el dashboard, **Actualizar** → sube el zip → listo.

## Sobre la integración con Vercel

`lib/vercel.js` usa endpoints públicos documentados de la API de Vercel
(`/v9/projects`, `/v6/deployments`, `/v9/projects/:id/domains`, etc.) tal
como están hoy. Vercel versiona y ajusta estos endpoints con cierta
frecuencia — si algo empieza a fallar, ese archivo es el primer lugar a
revisar contra la documentación oficial de Vercel (Deployments API /
Projects API).

## Notas de seguridad (léelas)

- El token de GitHub vive en una cookie httpOnly — no es accesible desde
  JavaScript del navegador, pero sí es un token de larga duración con
  permiso `repo` completo. Para un producto real, considera tokens de
  corta duración + refresh, o migrar a GitHub App con permisos más finos
  por repositorio.
- El token de Vercel y las credenciales de Hostinger se guardan en
  `localStorage` del navegador porque no hay backend con base de datos
  todavía. Es razonable para uso personal en tu propio dispositivo; **no
  compartas la URL de tu crisbofiles desplegado con nadie más** tal como está
  ahora, porque cualquiera con la sesión iniciada vería esas credenciales
  guardadas en ese navegador.
