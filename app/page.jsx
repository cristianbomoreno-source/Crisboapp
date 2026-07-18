import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

// Blindaje contra cache: sin esto, un CDN o el propio Next podrian guardar
// el resultado del redirect (por ejemplo "anda a /login" o "anda a
// /dashboard") y servirselo a otra sesion distinta despues — la misma
// clase de bug que hace que una cuenta nueva parezca "heredar" la sesion
// de otra persona.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function Home() {
  const session = await getSession();
  redirect(session ? "/dashboard" : "/login");
}
