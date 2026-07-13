import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { restoreToCommit, getRepo } from "@/lib/github";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { owner, repo } = params;
  const { sha } = await req.json();
  if (!sha) return NextResponse.json({ error: "Falta el sha del commit" }, { status: 400 });

  try {
    const repoInfo = await getRepo(owner, repo, session.token);
    const result = await restoreToCommit({
      owner,
      repo,
      branch: repoInfo.default_branch,
      token: session.token,
      sha,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
