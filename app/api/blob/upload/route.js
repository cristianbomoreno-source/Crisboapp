import { handleUpload } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

// Este endpoint NO recibe el archivo — solo autoriza al navegador a subirlo
// directo a Vercel Blob. Asi evitamos por completo el limite de 4.5MB por
// solicitud de las funciones serverless de Vercel.
export async function POST(request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // Validacion explicita para evitar errores silenciosos si falta la
  // variable de entorno del Blob Store en Vercel.
  if (!process.env.UPLOADS_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Falta la variable de entorno UPLOADS_READ_WRITE_TOKEN" },
      { status: 500 }
    );
  }

  const body = await request.json();

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      token: process.env.UPLOADS_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["application/zip", "application/x-zip-compressed", "application/octet-stream"],
        maximumSizeInBytes: 300 * 1024 * 1024, // 300MB de margen
        tokenPayload: JSON.stringify({ userId: session.userId }),
      }),
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
