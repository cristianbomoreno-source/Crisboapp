# Mi Restaurante — App de ventas e inventario

Este es tu proyecto convertido en una app web real (React + Vite), lista para
subir a GitHub y publicar.

## Cómo se guardan los datos

La app ya está conectada a Supabase (base de datos real en la nube). Al crear
una cuenta con correo y contraseña, esa cuenta y todos los datos del negocio
(productos, ventas, insumos, caja, etc.) quedan guardados de forma
permanente en el servidor — no dependen del celular ni del navegador que
uses. Si entras desde otro dispositivo con el mismo correo y contraseña,
verás la misma información.

Los trabajadores y el Administrador de Caja siguen entrando con su PIN
(configurado en Ajustes → Cuenta y trabajadores) sin necesidad de correo ni
contraseña propios — pero para que el PIN funcione en un dispositivo, el
administrador debe haber iniciado sesión con su correo al menos una vez en
ese mismo dispositivo/navegador.

## 1. Probarlo en tu computador

Necesitas tener [Node.js](https://nodejs.org) instalado (versión 18 o más
nueva). Luego, en una terminal, dentro de esta carpeta:

```bash
npm install
npm run dev
```

Esto te da un link como `http://localhost:5173` para probar la app en tu
navegador antes de publicarla.

## 2. Subir el proyecto a GitHub

Como ya tienes cuenta en GitHub:

1. Entra a github.com y crea un **repositorio nuevo** (botón verde "New").
   Ponle un nombre como `mi-restaurante-app`. Déjalo público o privado, como
   prefieras. No marques ninguna casilla de "agregar README" (ya tienes uno).

2. En tu terminal, dentro de esta carpeta del proyecto:

```bash
git init
git add .
git commit -m "Primera versión de mi app"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/mi-restaurante-app.git
git push -u origin main
```

Reemplaza `TU-USUARIO` por tu nombre de usuario de GitHub. GitHub te va a
pedir iniciar sesión la primera vez (puede pedirte un "token" en vez de
contraseña — GitHub te guía para crearlo si hace falta).

## 3. Publicarlo con Vercel (gratis)

1. Entra a [vercel.com](https://vercel.com) y crea una cuenta usando tu
   cuenta de GitHub (botón "Continue with GitHub").
2. Toca **"Add New Project"**.
3. Selecciona el repositorio `mi-restaurante-app` que acabas de subir.
4. Vercel detecta automáticamente que es un proyecto Vite. No necesitas
   cambiar nada — solo toca **"Deploy"**.
5. En un minuto te da una URL real, algo como
   `mi-restaurante-app.vercel.app`, que ya puedes abrir desde cualquier
   celular o computador.

Cada vez que quieras actualizar la app: haz tus cambios, y luego:

```bash
git add .
git commit -m "Describe qué cambiaste"
git push
```

Vercel actualiza la app publicada automáticamente en cuanto detecta el nuevo
`push`.

## 4. Base de datos real (Supabase) — ya conectada ✅

Ya completaste esta parte siguiendo `SUPABASE_SETUP.md`: creaste el proyecto
en Supabase, corriste `supabase_schema.sql`, y agregaste las llaves
(`VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`) en Vercel. Gracias a eso,
las cuentas y los datos del negocio ya no dependen de `localStorage` — viven
en la base de datos de Supabase y son los mismos sin importar desde qué
celular o computador entres.

## Estructura del proyecto

```
mi-restaurante-app/
├── index.html
├── package.json
├── vite.config.js
├── src/
│   ├── main.jsx      ← punto de entrada de React
│   └── App.jsx       ← toda tu app (lo que ya conoces)
```
