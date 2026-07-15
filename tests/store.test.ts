import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { closeDatabaseForTests } from "@/lib/admin/database";
import { AdminError } from "@/lib/admin/errors";
import {
  clearLoginFailures,
  loginRetryAfterSeconds,
  recordLoginFailure,
} from "@/lib/admin/rate-limit";
import {
  reconcileTerminalJob,
  statusesBeforeWorkflowRun,
} from "@/lib/admin/publish";
import {
  beginPublish,
  deleteDraftRevision,
  finishRevisionForJob,
  getActiveRevision,
  getRevision,
  saveDraftRevision,
  updatePublishJob,
} from "@/lib/admin/store";
import type { DraftPayload } from "@/lib/admin/types";

test("draft revisions use optimistic locking and idempotent publish jobs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ch4570-admin-db-"));
  process.env.TURSO_DATABASE_URL = `file:${join(directory, "test.db")}`;
  delete process.env.TURSO_AUTH_TOKEN;
  delete process.env.VERCEL;
  await closeDatabaseForTests();

  const firstPayload: DraftPayload = {
    version: 1,
    updatedAt: "2026-07-15T00:00:00.000Z",
    documents: {
      home: { "home-001": { original: "기존", value: "수정" } },
    },
  };
  const first = await saveDraftRevision({
    baseSha: "a".repeat(40),
    payload: firstPayload,
    checksum: "1".repeat(64),
    revisionId: null,
    revisionVersion: null,
  });
  assert.equal(first.version, 1);

  const updated = await saveDraftRevision({
    baseSha: "a".repeat(40),
    payload: { ...firstPayload, updatedAt: "2026-07-15T00:01:00.000Z" },
    checksum: "2".repeat(64),
    revisionId: first.id,
    revisionVersion: first.version,
  });
  assert.equal(updated.version, 2);

  await assert.rejects(
    () =>
      saveDraftRevision({
        baseSha: "a".repeat(40),
        payload: firstPayload,
        checksum: "3".repeat(64),
        revisionId: first.id,
        revisionVersion: first.version,
      }),
    (error) => error instanceof AdminError && error.code === "STALE_REVISION",
  );

  const idempotencyKey = "11111111-1111-4111-8111-111111111111";
  const [job, duplicate] = await Promise.all([
    beginPublish({
      revisionId: updated.id,
      revisionVersion: updated.version,
      idempotencyKey,
    }),
    beginPublish({
      revisionId: updated.id,
      revisionVersion: updated.version,
      idempotencyKey,
    }),
  ]);
  assert.equal(duplicate.id, job.id);
  const draftRef = `refs/heads/content-drafts/admin-${job.id}`;
  const claims = await Promise.all([
    updatePublishJob(
      job.id,
      { draftRef },
      { statuses: ["preparing"], draftRef: null },
    ),
    updatePublishJob(
      job.id,
      { draftRef },
      { statuses: ["preparing"], draftRef: null },
    ),
  ]);
  assert.equal(claims.filter((claim) => claim.updated).length, 1);
  const queued = await updatePublishJob(
    job.id,
    { status: "queued", runId: 123 },
    { statuses: ["preparing"], runId: null },
  );
  assert.equal(queued.updated, true);
  assert.equal(queued.job?.status, "queued");
  assert.deepEqual(statusesBeforeWorkflowRun("queued"), ["preparing", "queued"]);
  assert.deepEqual(statusesBeforeWorkflowRun("in_progress"), [
    "preparing",
    "queued",
    "in_progress",
  ]);
  const inProgress = await updatePublishJob(
    job.id,
    { status: "in_progress" },
    { statuses: statusesBeforeWorkflowRun("in_progress"), runId: 123 },
  );
  assert.equal(inProgress.updated, true);
  const stalePoll = await updatePublishJob(
    job.id,
    { status: "queued" },
    { statuses: statusesBeforeWorkflowRun("queued"), runId: 123 },
  );
  assert.equal(stalePoll.updated, false);
  assert.equal(stalePoll.job?.status, "in_progress");
  const published = await updatePublishJob(
    job.id,
    { status: "published", publishedSha: "b".repeat(40) },
    { statuses: ["in_progress"], runId: 123 },
  );
  assert.equal(published.updated, true);
  const losingTerminalPoll = await updatePublishJob(
    job.id,
    { status: "published", publishedSha: "c".repeat(40) },
    { statuses: ["preparing", "queued", "in_progress"], runId: 123 },
  );
  assert.equal(losingTerminalPoll.updated, false);
  assert.equal(losingTerminalPoll.job?.publishedSha, "b".repeat(40));
  await reconcileTerminalJob(
    losingTerminalPoll.job as NonNullable<typeof losingTerminalPoll.job>,
  );
  assert.equal((await getRevision(updated.id))?.publishedSha, "b".repeat(40));
  assert.equal(await getActiveRevision(), null);

  const identicalDrafts = await Promise.all([
    saveDraftRevision({
      baseSha: "b".repeat(40),
      payload: firstPayload,
      checksum: "4".repeat(64),
      revisionId: null,
      revisionVersion: null,
    }),
    saveDraftRevision({
      baseSha: "b".repeat(40),
      payload: firstPayload,
      checksum: "4".repeat(64),
      revisionId: null,
      revisionVersion: null,
    }),
  ]);
  assert.equal(identicalDrafts[0].id, identicalDrafts[1].id);
  await deleteDraftRevision(identicalDrafts[0].id, identicalDrafts[0].version);

  const concurrentDrafts = await Promise.allSettled([
    saveDraftRevision({
      baseSha: "b".repeat(40),
      payload: firstPayload,
      checksum: "5".repeat(64),
      revisionId: null,
      revisionVersion: null,
    }),
    saveDraftRevision({
      baseSha: "b".repeat(40),
      payload: { ...firstPayload, updatedAt: "2026-07-15T00:02:00.000Z" },
      checksum: "6".repeat(64),
      revisionId: null,
      revisionVersion: null,
    }),
  ]);
  const acceptedDrafts = concurrentDrafts.filter(
    (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof saveDraftRevision>>> =>
      result.status === "fulfilled",
  );
  const rejectedDrafts = concurrentDrafts.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  assert.equal(acceptedDrafts.length, 1);
  assert.equal(rejectedDrafts.length, 1);
  assert.ok(
    rejectedDrafts[0].reason instanceof AdminError &&
      rejectedDrafts[0].reason.code === "ACTIVE_REVISION_EXISTS",
  );
  await deleteDraftRevision(acceptedDrafts[0].value.id, acceptedDrafts[0].value.version);

  const second = await saveDraftRevision({
    baseSha: "b".repeat(40),
    payload: firstPayload,
    checksum: "7".repeat(64),
    revisionId: null,
    revisionVersion: null,
  });
  const oldJob = await beginPublish({
    revisionId: second.id,
    revisionVersion: second.version,
    idempotencyKey: "22222222-2222-4222-8222-222222222222",
  });
  const oldFailure = await updatePublishJob(
    oldJob.id,
    { status: "failed", error: "first attempt failed" },
    { statuses: ["preparing"] },
  );
  assert.equal(oldFailure.updated, true);
  const losingFailurePoll = await updatePublishJob(
    oldJob.id,
    { status: "failed", error: "different local error" },
    { statuses: ["preparing", "queued", "in_progress"] },
  );
  assert.equal(losingFailurePoll.updated, false);
  assert.equal(losingFailurePoll.job?.error, "first attempt failed");
  await reconcileTerminalJob(
    losingFailurePoll.job as NonNullable<typeof losingFailurePoll.job>,
  );
  const retryRevision = await getActiveRevision();
  assert.equal(retryRevision?.status, "draft");
  assert.equal(retryRevision?.error, "first attempt failed");
  const retryJob = await beginPublish({
    revisionId: second.id,
    revisionVersion: retryRevision?.version as number,
    idempotencyKey: "33333333-3333-4333-8333-333333333333",
  });
  assert.equal(
    await finishRevisionForJob(oldJob.id, second.id, "draft", { error: "late poll" }),
    false,
  );
  assert.equal((await getActiveRevision())?.status, "publishing");
  await updatePublishJob(
    retryJob.id,
    { status: "failed", error: "cleanup" },
    { statuses: ["preparing"] },
  );
  assert.equal(
    await finishRevisionForJob(retryJob.id, second.id, "draft", { error: "cleanup" }),
    true,
  );
  const retryDraft = await getActiveRevision();
  await deleteDraftRevision(second.id, retryDraft?.version as number);
  assert.equal(await getActiveRevision(), null);

  const now = Date.now();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await recordLoginFailure("bucket", now + attempt);
  }
  assert.ok((await loginRetryAfterSeconds("bucket", now + 5)) > 0);
  await clearLoginFailures("bucket");
  assert.equal(await loginRetryAfterSeconds("bucket", now + 5), 0);

  await closeDatabaseForTests();
  await rm(directory, { recursive: true, force: true });
});
