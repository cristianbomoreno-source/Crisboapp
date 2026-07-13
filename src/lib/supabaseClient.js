import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Esto aparece en la consola del navegador si faltan las variables de
  // entorno en Vercel (VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY).
  console.error(
    "Faltan las variables de entorno de Supabase. Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en Vercel (Project Settings → Environment Variables) y vuelve a desplegar."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
