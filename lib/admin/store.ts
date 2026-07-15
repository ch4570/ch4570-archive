import { randomUUID } from "node:crypto";

import { ensureDatabase } from "@/lib/admin/database";
import { AdminError } from "@/lib/admin/errors";
import type {
  ContentRevision,
  DraftPayload,
  PublishJob,
  PublishJobStatus,
} from "@/lib/admin/types";

type Row = Record<string, unknown>;

type PublishJobUpdate = Partial<
  Pick<
    PublishJob,
    | "status"
    | "draftRef"
    | "draftSha"
    | "runId"
    | "runUrl"
    | "htmlUrl"
    | "publishedSha"
    | "error"
  >
>;

type PublishJobGuard = {
  statuses?: readonly PublishJobStatus[];
  draftRef?: string | null;
  draftSha?: string | null;
  runId?: number | null;
};

function text(row: Row, key: string) {
  const value = row[key];
  return value == null ? null : String(value);
}

function number(row: Row, key: string) {
  const value = row[key];
  return value == null ? null : Number(value);
}

function revisionFromRow(row: Row): ContentRevision {
  return {
    id: String(row.id),
    baseSha: String(row.base_sha),
    payload: JSON.parse(String(row.values_json)) as DraftPayload,
    checksum: String(row.checksum),
    status: String(row.status) as ContentRevision["status"],
    version: Number(row.version),
    publishedSha: text(row, "published_sha"),
    error: text(row, "error"),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function jobFromRow(row: Row): PublishJob {
  return {
    id: String(row.id),
    revisionId: String(row.revision_id),
    idempotencyKey: String(row.idempotency_key),
    status: String(row.status) as PublishJobStatus,
    draftRef: text(row, "draft_ref"),
    draftSha: text(row, "draft_sha"),
    runId: number(row, "run_id"),
    runUrl: text(row, "run_url"),
    htmlUrl: text(row, "html_url"),
    publishedSha: text(row, "published_sha"),
    error: text(row, "error"),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export async function getActiveRevision() {
  const client = await ensureDatabase();
  const result = await client.execute(
    "SELECT * FROM content_revisions WHERE status IN ('draft', 'publishing') ORDER BY updated_at DESC LIMIT 1",
  );
  return result.rows[0] ? revisionFromRow(result.rows[0] as Row) : null;
}

export async function getRevision(id: string) {
  const client = await ensureDatabase();
  const result = await client.execute({
    sql: "SELECT * FROM content_revisions WHERE id = ? LIMIT 1",
    args: [id],
  });
  return result.rows[0] ? revisionFromRow(result.rows[0] as Row) : null;
}

export async function saveDraftRevision(input: {
  baseSha: string;
  payload: DraftPayload;
  checksum: string;
  revisionId: string | null;
  revisionVersion: number | null;
}) {
  const client = await ensureDatabase();
  const now = Date.now();
  const valuesJson = JSON.stringify(input.payload);

  if (input.revisionId) {
    if (!Number.isInteger(input.revisionVersion)) {
      throw new AdminError(400, "INVALID_REVISION", "초안 버전이 올바르지 않습니다.");
    }
    const result = await client.execute({
      sql: `UPDATE content_revisions
        SET base_sha = ?, values_json = ?, checksum = ?, version = version + 1,
            error = NULL, updated_at = ?
        WHERE id = ? AND version = ? AND status = 'draft'`,
      args: [
        input.baseSha,
        valuesJson,
        input.checksum,
        now,
        input.revisionId,
        input.revisionVersion as number,
      ],
    });
    if (result.rowsAffected !== 1) {
      throw new AdminError(409, "STALE_REVISION", "다른 창에서 초안이 변경되었습니다.");
    }
    const updated = await getRevision(input.revisionId);
    if (!updated) throw new Error("Updated draft revision was not found.");
    return updated;
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const id = randomUUID();
    const result = await client.execute({
      sql: `INSERT INTO content_revisions
        (id, base_sha, values_json, checksum, status, version, created_at, updated_at)
        SELECT ?, ?, ?, ?, 'draft', 1, ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM content_revisions WHERE status IN ('draft', 'publishing')
        )
        ON CONFLICT DO NOTHING`,
      args: [id, input.baseSha, valuesJson, input.checksum, now, now],
    });
    if (result.rowsAffected === 1) {
      const created = await getRevision(id);
      if (!created) throw new Error("Created draft revision was not found.");
      return created;
    }

    const active = await getActiveRevision();
    if (active) {
      if (active.status === "draft" && active.checksum === input.checksum) return active;
      throw new AdminError(409, "ACTIVE_REVISION_EXISTS", "저장된 초안을 다시 불러와 주세요.");
    }
  }
  throw new AdminError(409, "ACTIVE_REVISION_EXISTS", "저장된 초안을 다시 불러와 주세요.");
}

export async function deleteDraftRevision(revisionId: string, revisionVersion: number) {
  const client = await ensureDatabase();
  const result = await client.execute({
    sql: "DELETE FROM content_revisions WHERE id = ? AND version = ? AND status = 'draft'",
    args: [revisionId, revisionVersion],
  });
  if (result.rowsAffected !== 1) {
    const existing = await getRevision(revisionId);
    if (existing) {
      throw new AdminError(409, "STALE_REVISION", "다른 창에서 초안이 변경되었습니다.");
    }
  }
}

export async function getPublishJob(id: string) {
  const client = await ensureDatabase();
  const result = await client.execute({
    sql: "SELECT * FROM publish_jobs WHERE id = ? LIMIT 1",
    args: [id],
  });
  return result.rows[0] ? jobFromRow(result.rows[0] as Row) : null;
}

export async function getPublishJobByIdempotencyKey(idempotencyKey: string) {
  const client = await ensureDatabase();
  const result = await client.execute({
    sql: "SELECT * FROM publish_jobs WHERE idempotency_key = ? LIMIT 1",
    args: [idempotencyKey],
  });
  return result.rows[0] ? jobFromRow(result.rows[0] as Row) : null;
}

export async function getLatestPublishJobForRevision(revisionId: string) {
  const client = await ensureDatabase();
  const result = await client.execute({
    sql: "SELECT * FROM publish_jobs WHERE revision_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1",
    args: [revisionId],
  });
  return result.rows[0] ? jobFromRow(result.rows[0] as Row) : null;
}

export async function beginPublish(input: {
  revisionId: string;
  revisionVersion: number;
  idempotencyKey: string;
}) {
  const existing = await getPublishJobByIdempotencyKey(input.idempotencyKey);
  if (existing) {
    if (existing.revisionId === input.revisionId) return existing;
    throw new AdminError(409, "IDEMPOTENCY_CONFLICT", "다른 초안에 사용한 게시 요청 키입니다.");
  }

  const client = await ensureDatabase();
  const now = Date.now();
  const jobId = randomUUID();
  const results = await client.batch(
    [
      {
        sql: `UPDATE content_revisions
          SET status = 'publishing', version = version + 1, error = NULL, updated_at = ?
          WHERE id = ? AND version = ? AND status = 'draft'`,
        args: [now, input.revisionId, input.revisionVersion],
      },
      {
        sql: `INSERT INTO publish_jobs
          (id, revision_id, idempotency_key, status, created_at, updated_at)
          SELECT ?, ?, ?, 'preparing', ?, ?
          WHERE changes() = 1`,
        args: [jobId, input.revisionId, input.idempotencyKey, now, now],
      },
    ],
    "write",
  );
  if (results[0].rowsAffected !== 1 || results[1].rowsAffected !== 1) {
    const raced = await getPublishJobByIdempotencyKey(input.idempotencyKey);
    if (raced?.revisionId === input.revisionId) return raced;
    throw new AdminError(409, "STALE_REVISION", "게시할 초안이 최신 상태가 아닙니다.");
  }
  const created = await getPublishJob(jobId);
  if (!created) throw new Error("Created publish job was not found.");
  return created;
}

export async function updatePublishJob(
  id: string,
  update: PublishJobUpdate,
  guard: PublishJobGuard = {},
) {
  const columns = {
    status: "status",
    draftRef: "draft_ref",
    draftSha: "draft_sha",
    runId: "run_id",
    runUrl: "run_url",
    htmlUrl: "html_url",
    publishedSha: "published_sha",
    error: "error",
  } as const;
  const entries = Object.entries(update).filter(([, value]) => value !== undefined);
  if (!entries.length) return { job: await getPublishJob(id), updated: false };

  const client = await ensureDatabase();
  const assignments = entries.map(([key]) => `${columns[key as keyof typeof columns]} = ?`);
  const where = ["id = ?"];
  const guardArgs: Array<string | number> = [id];

  if (guard.statuses) {
    if (!guard.statuses.length) return { job: await getPublishJob(id), updated: false };
    where.push(`status IN (${guard.statuses.map(() => "?").join(", ")})`);
    guardArgs.push(...guard.statuses);
  }
  for (const [key, column] of [
    ["draftRef", "draft_ref"],
    ["draftSha", "draft_sha"],
    ["runId", "run_id"],
  ] as const) {
    if (!Object.prototype.hasOwnProperty.call(guard, key)) continue;
    const expected = guard[key];
    if (expected === null) {
      where.push(`${column} IS NULL`);
    } else if (expected !== undefined) {
      where.push(`${column} = ?`);
      guardArgs.push(expected);
    }
  }

  const result = await client.execute({
    sql: `UPDATE publish_jobs SET ${assignments.join(", ")}, updated_at = ? WHERE ${where.join(" AND ")}`,
    args: [...entries.map(([, value]) => value ?? null), Date.now(), ...guardArgs],
  });
  return { job: await getPublishJob(id), updated: result.rowsAffected === 1 };
}

export async function finishRevisionForJob(
  jobId: string,
  revisionId: string,
  status: "published" | "draft",
  details: { publishedSha?: string | null; error?: string | null } = {},
) {
  const client = await ensureDatabase();
  const terminalStatuses = status === "published" ? ["published", "warning"] : ["failed"];
  const result = await client.execute({
    sql: `UPDATE content_revisions
      SET status = ?, published_sha = ?, error = ?, version = version + 1, updated_at = ?
      WHERE id = ? AND status = 'publishing'
        AND EXISTS (
          SELECT 1
          FROM publish_jobs AS current_job
          WHERE current_job.id = ?
            AND current_job.revision_id = content_revisions.id
            AND current_job.status IN (${terminalStatuses.map(() => "?").join(", ")})
            AND NOT EXISTS (
              SELECT 1
              FROM publish_jobs AS newer_job
              WHERE newer_job.revision_id = current_job.revision_id
                AND (
                  newer_job.created_at > current_job.created_at
                  OR (
                    newer_job.created_at = current_job.created_at
                    AND newer_job.rowid > current_job.rowid
                  )
                )
            )
        )`,
    args: [
      status,
      details.publishedSha ?? null,
      details.error ?? null,
      Date.now(),
      revisionId,
      jobId,
      ...terminalStatuses,
    ],
  });
  return result.rowsAffected === 1;
}

export async function resetOrphanedPublishingRevision(revisionId: string, error: string) {
  const client = await ensureDatabase();
  const result = await client.execute({
    sql: `UPDATE content_revisions
      SET status = 'draft', error = ?, version = version + 1, updated_at = ?
      WHERE id = ? AND status = 'publishing'
        AND NOT EXISTS (SELECT 1 FROM publish_jobs WHERE revision_id = ?)`,
    args: [error, Date.now(), revisionId, revisionId],
  });
  return result.rowsAffected === 1;
}
