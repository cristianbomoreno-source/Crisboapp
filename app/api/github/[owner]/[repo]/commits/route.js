import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listCommits, getRepo } from "@/lib/github";

export const runtime = "nodejs";

export async function GET(req, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { owner, repo } = params;
  try {
    const repoInfo = await getRepo(owner, repo, session.token);
    const commits = await listCommits(owner, repo, repoInfo.default_branch, session.token);
    return NextResponse.json({ commits, defaultBranch: repoInfo.default_branch });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
