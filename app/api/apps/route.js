import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function rowToApp(row) {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    framework: row.framework,
    github: {
      owner: row.github_owner,
      repo: row.github_repo,
      defaultBranch: row.github_default_branch,
    },
    vercel: row.vercel || { enabled: false },
    hostinger: row.hostinger || { enabled: false },
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { rows } = await query(
    "SELECT * FROM apps WHERE user_id = $1 ORDER BY updated_at DESC",
    [session.userId]
  );
  console.log(`[apps] GET — userId=${session.userId} apps=${rows.length}`);
  return NextResponse.json({ apps: rows.map(rowToApp) });
}

export async function POST(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const app = await request.json();
  if (!app.id || !app.github?.owner || !app.github?.repo) {
    return NextResponse.json({ error: "Datos de la app incompletos" }, { status: 400 });
  }

  await query(
    `INSERT INTO apps
       (id, user_id, name, emoji, framework, github_owner, github_repo, github_default_branch, vercel, hostinger, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       emoji = EXCLUDED.emoji,
       framework = EXCLUDED.framework,
       github_owner = EXCLUDED.github_owner,
       github_repo = EXCLUDED.github_repo,
       github_default_branch = EXCLUDED.github_default_branch,
       vercel = EXCLUDED.vercel,
       hostinger = EXCLUDED.hostinger,
       updated_at = now()
     WHERE apps.user_id = $2`,
    [
      app.id,
      session.userId,
      app.name,
      app.emoji || null,
      app.framework || null,
      app.github.owner,
      app.github.repo,
      app.github.defaultBranch,
      JSON.stringify(app.vercel || { enabled: false }),
      JSON.stringify(app.hostinger || { enabled: false }),
    ]
  );

  return NextResponse.json({ ok: true });
}
