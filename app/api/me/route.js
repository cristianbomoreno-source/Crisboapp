import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ user: null });

  return NextResponse.json({
    user: {
      name: session.name,
      email: session.email,
      avatarUrl: session.avatarUrl,
      githubLogin: session.login,
      githubAvatarUrl: session.githubAvatarUrl,
      githubConnected: session.githubConnected,
    },
  });
}
