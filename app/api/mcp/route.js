import { NextResponse } from "next/server";
import { getUserIdForToken } from "@/lib/apiTokens";
import { TOOLS, callTool } from "@/lib/mcpTools";

export const runtime = "nodejs";
export const maxDuration = 60;

const PROTOCOL_VERSION = "2025-03-26";
const SERVER_INFO = { name: "crisbofiles", version: "1.0.0" };

function rpcResult(id, result) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}
function rpcError(id, code, message) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } }, { status: 200 });
}

// Este servidor MCP es intencionalmente "sin estado" (sin sesiones, sin
// SSE): cada POST trae un mensaje JSON-RPC y responde con un solo JSON.
// Alcanza para lo que necesitamos (tools/list + tools/call) y encaja mejor
// con una funcion serverless de Vercel que un stream de larga duracion.
export async function POST(request) {
  const authHeader = request.headers.get("authorization") || "";
  const headerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  // Fallback por query param (?token=...): la autenticacion por "Request
  // headers" en el dialogo de conector personalizado de Claude esta en
  // beta y no todos la tienen habilitada todavia. Poner el token en la
  // propia URL del conector funciona siempre, sin depender de esa beta.
  const { searchParams } = new URL(request.url);
  const queryToken = searchParams.get("token");
  const token = headerToken || queryToken;
  const userId = await getUserIdForToken(token);

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON invalido" } },
      { status: 400 }
    );
  }

  const { id, method, params } = body;
  const isNotification = id === undefined;

  // `initialize` no requiere token todavia (es el "handshake" del
  // protocolo); todo lo demas si — asi un cliente sin token recibe un error
  // claro en vez de una lista de herramientas vacia/confusa.
  if (method !== "initialize" && !userId) {
    if (isNotification) return new NextResponse(null, { status: 202 });
    return NextResponse.json(
      { jsonrpc: "2.0", id, error: { code: -32001, message: "Token invalido, ausente o revocado." } },
      { status: 401 }
    );
  }

  switch (method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });

    case "notifications/initialized":
      // Es una notificacion (sin id) — no lleva respuesta con cuerpo.
      return new NextResponse(null, { status: 202 });

    case "ping":
      return rpcResult(id, {});

    case "tools/list":
      return rpcResult(id, { tools: TOOLS });

    case "tools/call": {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};
      if (!toolName) return rpcError(id, -32602, "Falta params.name");

      try {
        const result = await callTool(userId, toolName, toolArgs);
        return rpcResult(id, result);
      } catch (e) {
        return rpcError(id, -32000, e.message || "Error interno ejecutando la herramienta");
      }
    }

    default:
      if (isNotification) return new NextResponse(null, { status: 202 });
      return rpcError(id, -32601, `Metodo no soportado: ${method}`);
  }
}

// El transporte "Streamable HTTP" de MCP permite GET para abrir un stream
// SSE de notificaciones del servidor hacia el cliente. Este servidor no
// envia notificaciones proactivas, asi que no lo soporta — responder 405
// es valido segun la especificacion.
export async function GET() {
  return NextResponse.json({ error: "Este servidor MCP no soporta streaming por GET." }, { status: 405 });
}
