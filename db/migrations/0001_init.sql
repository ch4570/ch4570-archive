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
