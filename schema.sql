-- Esquema de base de datos de crisbofiles.
-- Correr UNA sola vez contra tu base de datos Postgres (ver README para
-- como crearla y donde pegar esto).

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  google_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  github_token TEXT,
  github_login TEXT,
  github_avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS apps (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  emoji TEXT,
  framework TEXT,
  github_owner TEXT NOT NULL,
  github_repo TEXT NOT NULL,
  github_default_branch TEXT NOT NULL,
  vercel JSONB NOT NULL DEFAULT '{"enabled": false}',
  hostinger JSONB NOT NULL DEFAULT '{"enabled": false}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_apps_user_id ON apps(user_id);

-- Tokens de API para el conector MCP (Claude). Son independientes de la
-- sesion de Google: se generan/revocan desde el dashboard y solo sirven
-- para llamar /api/mcp, nunca para iniciar sesion normal en la app.
CREATE TABLE IF NOT EXISTS api_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_user_id ON api_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_api_tokens_hash ON api_tokens(token_hash);
