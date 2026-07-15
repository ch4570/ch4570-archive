import { createClient, type Client } from "@libsql/client";
import { mkdirSync } from "node:fs";

const SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS content_revisions (
  id TEXT PRIMARY KEY,
  base_sha TEXT NOT NULL,
  values_json TEXT NOT NULL,
  checksum TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'publishing', 'published', 'failed')),
  version INTEGER NOT NULL DEFAULT 1,
  published_sha TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS content_revisions_status_updated_idx
  ON content_revisions(status, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS content_revisions_single_active_idx
  ON content_revisions((1))
  WHERE status IN ('draft', 'publishing');
CREATE TABLE IF NOT EXISTS publish_jobs (
  id TEXT PRIMARY KEY,
  revision_id TEXT NOT NULL REFERENCES content_revisions(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('preparing', 'queued', 'in_progress', 'published', 'warning', 'failed')),
  draft_ref TEXT,
  draft_sha TEXT,
  run_id INTEGER,
  run_url TEXT,
  html_url TEXT,
  published_sha TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS publish_jobs_revision_updated_idx
  ON publish_jobs(revision_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS login_buckets (
  key_hash TEXT PRIMARY KEY,
  window_started INTEGER NOT NULL,
  failures INTEGER NOT NULL,
  blocked_until INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
`;

type DatabaseState = {
  client?: Client;
  schema?: Promise<void>;
};

const globalDatabase = globalThis as typeof globalThis & {
  __ch4570Database?: DatabaseState;
};

const state = (globalDatabase.__ch4570Database ??= {});

function databaseUrl() {
  const configured = process.env.TURSO_DATABASE_URL?.trim();
  if (process.env.VERCEL && (!configured || configured.startsWith("file:"))) {
    throw new Error("Vercel requires a remote TURSO_DATABASE_URL.");
  }
  return configured || "file:.data/ch4570-archive.db";
}

export function getDatabase() {
  if (!state.client) {
    const url = databaseUrl();
    if (url.startsWith("file:")) mkdirSync(".data", { recursive: true });
    state.client = createClient({
      url,
      authToken: process.env.TURSO_AUTH_TOKEN?.trim() || undefined,
      intMode: "number",
      timeout: 5_000,
    });
  }
  return state.client;
}

export async function ensureDatabase() {
  const client = getDatabase();
  state.schema ??=
    process.env.VERCEL && process.env.TURSO_AUTO_MIGRATE !== "true"
      ? Promise.resolve()
      : client.executeMultiple(SCHEMA);
  await state.schema;
  return client;
}

export async function closeDatabaseForTests() {
  state.client?.close();
  state.client = undefined;
  state.schema = undefined;
}
