# Conectar la app a Supabase (paso a paso, desde el celular)

Sigue estos pasos en orden. No necesitas computador, todo se hace desde el
navegador.

## Paso 1: Crear la tabla en Supabase

1. Entra a tu proyecto en **supabase.com**
2. En el menú lateral, toca **"SQL Editor"**
3. Toca **"New query"**
4. Abre el archivo `supabase_schema.sql` (incluido en este proyecto), copia
   todo su contenido, y pégalo en el cuadro
5. Toca **"Run"** (o el botón ▶)
6. Debería decir "Success. No rows returned" — eso significa que la tabla y
   los permisos quedaron creados correctamente

## Paso 2: Simplificar el registro (recomendado)

Por defecto, Supabase exige que cada usuario confirme su correo antes de
poder iniciar sesión (te llega un link al correo). Para que puedas crear tu
cuenta y entrar de inmediato sin revisar el correo:

1. En Supabase, ve a **Authentication → Providers**
2. Toca en **"Email"**
3. Apaga la opción **"Confirm email"**
4. Guarda los cambios

(Puedes activarlo de nuevo más adelante si quieres que tus usuarios
confirmen su correo antes de entrar.)

## Paso 3: Copiar tus llaves de Supabase

1. En Supabase, ve a **Project Settings → API**
2. Copia el valor de **"Project URL"**
3. Copia el valor de **"anon public"** (la llave larga)

Vas a necesitar estos dos valores en el siguiente paso.

## Paso 4: Agregar las llaves en Vercel

1. Entra a tu proyecto en **vercel.com**
2. Ve a **Settings → Environment Variables**
3. Agrega una variable:
   - Nombre: `VITE_SUPABASE_URL`
   - Valor: el "Project URL" que copiaste
4. Agrega otra variable:
   - Nombre: `VITE_SUPABASE_ANON_KEY`
   - Valor: la llave "anon public" que copiaste
5. Guarda ambas

## Paso 5: Subir los archivos actualizados a GitHub

Reemplaza estos archivos en tu repositorio (mismo método de antes: "Add
file" → "Upload files", esto sobrescribe el archivo si ya existe con el
mismo nombre):

- `src/App.jsx` (actualizado — ya usa Supabase en vez de guardar solo en el
  celular)
- `package.json` (actualizado — incluye la nueva dependencia de Supabase)
- `src/lib/supabaseClient.js` (nuevo archivo)

## Paso 6: Volver a desplegar en Vercel

Cada vez que subes cambios a GitHub, Vercel vuelve a publicar la app sola.
Si no ves que se actualice en un par de minutos, entra a tu proyecto en
Vercel → pestaña "Deployments" → botón "Redeploy" en el último despliegue
(esto asegura que tome las nuevas variables de entorno).

## Qué cambió para ti como usuario de la app

- Ahora al **crear cuenta**, en vez de "Usuario" te va a pedir **correo
  electrónico** — así funciona la autenticación real de Supabase
- Tus datos (ventas, productos, insumos, etc.) ahora quedan guardados en la
  nube: si entras desde otro celular con el mismo correo y contraseña, vas
  a ver la misma información
- Cada negocio (cada correo distinto) solo puede ver sus propios datos —
  eso lo garantizan las políticas de seguridad (RLS) que creaste en el
  Paso 1

## Si algo no funciona

- Pantalla en blanco o error al abrir la app → revisa que las dos variables
  de entorno en Vercel estén escritas exactamente como se indica arriba
  (con el prefijo `VITE_`), y vuelve a desplegar
- "No se pudo crear la cuenta" → revisa que el correo tenga formato válido
  y la contraseña tenga mínimo 6 caracteres
- Inicias sesión pero no ves tus datos anteriores → es normal la primera
  vez: los datos que tenías guardados en `localStorage` de un celular no se
  transfieren solos a Supabase (son dos lugares distintos). A partir de
  ahora, todo lo que registres queda guardado en la nube.
