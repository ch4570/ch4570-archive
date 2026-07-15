import { validateDraftInput } from "@/lib/admin/content";
import { AdminError, asAdminError } from "@/lib/admin/errors";
import {
  createOrReuseDraftCommit,
  dispatchDraftWorkflow,
  draftRefForPublishJob,
  findDispatchedWorkflowRun,
  getMainSha,
  getRepositorySnapshot,
  getWorkflowJobs,
  getWorkflowRun,
} from "@/lib/admin/github";
import {
  beginPublish,
  finishRevisionForJob,
  getPublishJob,
  getRevision,
  updatePublishJob,
} from "@/lib/admin/store";
import type { PublishJob } from "@/lib/admin/types";

const ACTIVE_PUBLISH_STATUSES = ["preparing", "queued", "in_progress"] as const;
const BEFORE_QUEUED_PUBLISH_STATUSES = ["preparing", "queued"] as const;

export function statusesBeforeWorkflowRun(status: "queued" | "in_progress") {
  return status === "queued" ? BEFORE_QUEUED_PUBLISH_STATUSES : ACTIVE_PUBLISH_STATUSES;
}

export async function startPublish(input: {
  revisionId: string;
  revisionVersion: number;
  idempotencyKey: string;
}) {
  let job = await beginPublish(input);
  if (job.status !== "preparing") return job;

  const draftRef = job.draftRef || draftRefForPublishJob(job.id);
  const ownership = await updatePublishJob(
    job.id,
    { draftRef },
    { statuses: ["preparing"], draftRef: null },
  );
  if (!ownership.updated) return ownership.job || job;
  job = ownership.job || job;
  let dispatchAttempted = false;

  try {
    const revision = await getRevision(job.revisionId);
    if (!revision || revision.status !== "publishing") {
      throw new AdminError(409, "MISSING_REVISION", "게시할 초안을 찾지 못했습니다.");
    }
    const snapshot = await getRepositorySnapshot();
    if (snapshot.baseSha !== revision.baseSha) {
      throw new AdminError(409, "STALE_BASE", "공개 원본이 변경되어 초안을 다시 확인해야 합니다.");
    }
    const validated = validateDraftInput(revision.payload, snapshot);
    const draft = await createOrReuseDraftCommit({
      draftRef,
      baseSha: snapshot.baseSha,
      workingSources: validated.workingSources,
      changeCount: validated.changeCount,
    });
    const persistedDraft = await updatePublishJob(
      job.id,
      { draftSha: draft.draftSha },
      { statuses: ["preparing"], draftRef, draftSha: null },
    );
    if (!persistedDraft.updated) return persistedDraft.job || job;
    job = persistedDraft.job || job;
    dispatchAttempted = true;
    const dispatch = await dispatchDraftWorkflow(
      {
        jobId: job.id,
        draftRef: draft.draftRef,
        draftSha: draft.draftSha,
        baseSha: snapshot.baseSha,
      },
      { allowDispatch: true },
    );
    if (!dispatch) return (await getPublishJob(job.id)) || job;
    const queued = await updatePublishJob(
      job.id,
      {
        status: "queued",
        draftRef: dispatch.draftRef,
        draftSha: dispatch.draftSha,
        runId: dispatch.runId,
        runUrl: dispatch.runUrl,
        htmlUrl: dispatch.htmlUrl,
      },
      { statuses: ["preparing"], draftRef, draftSha: draft.draftSha },
    );
    if (!queued.job) throw new Error("Queued publish job was not found.");
    return queued.job;
  } catch (error) {
    const normalized = asAdminError(error);
    if (!dispatchAttempted) {
      const failed = await updatePublishJob(
        job.id,
        { status: "failed", error: normalized.message },
        { statuses: ["preparing"], draftRef },
      );
      if (failed.job && isTerminalPublishJob(failed.job)) {
        await reconcileTerminalJob(failed.job);
      }
    }
    throw normalized;
  }
}

export function isTerminalPublishJob(job: PublishJob) {
  return ["published", "warning", "failed"].includes(job.status);
}

export async function reconcileTerminalJob(job: PublishJob) {
  if (job.status === "published" || job.status === "warning") {
    await finishRevisionForJob(job.id, job.revisionId, "published", {
      publishedSha: job.publishedSha,
    });
  } else if (job.status === "failed") {
    await finishRevisionForJob(job.id, job.revisionId, "draft", { error: job.error });
  }
}

export async function refreshPublishJob(jobId: string) {
  const job = await getPublishJob(jobId);
  if (!job) throw new AdminError(404, "JOB_NOT_FOUND", "게시 작업을 찾지 못했습니다.");
  if (isTerminalPublishJob(job)) {
    await reconcileTerminalJob(job);
    return job;
  }
  if (!job.runId) {
    if (job.draftSha) {
      const recovered = await findDispatchedWorkflowRun(job.id);
      if (recovered) {
        return (
          (
            await updatePublishJob(
              job.id,
              {
                status: "queued",
                runId: recovered.workflow_run_id,
                runUrl: recovered.run_url,
                htmlUrl: recovered.html_url,
              },
              { statuses: ACTIVE_PUBLISH_STATUSES, runId: null },
            )
          ).job || job
        );
      }
    }
    if (job.status === "preparing" && Date.now() - job.updatedAt >= 2 * 60 * 1000) {
      const message = "게시 준비가 중단되어 초안 상태로 되돌렸습니다. 다시 게시해 주세요.";
      const failed = await updatePublishJob(
        job.id,
        { status: "failed", error: message },
        { statuses: ["preparing"], runId: null },
      );
      if (failed.job && isTerminalPublishJob(failed.job)) {
        await reconcileTerminalJob(failed.job);
      }
      return failed.job || job;
    }
    return job;
  }

  const run = await getWorkflowRun(job.runId);
  if (run.status !== "completed") {
    const updated = await updatePublishJob(
      job.id,
      {
        status: run.status === "queued" ? "queued" : "in_progress",
        htmlUrl: run.html_url || job.htmlUrl,
      },
      { statuses: statusesBeforeWorkflowRun(run.status), runId: job.runId },
    );
    return updated.job || job;
  }

  let published = run.conclusion === "success";
  let warning = false;
  if (!published) {
    const jobs = await getWorkflowJobs(run.jobs_url);
    const publishJob = jobs.jobs.find((candidate) => candidate.name === "publish");
    if (publishJob?.conclusion === "success") {
      published = true;
      warning = true;
    }
  }

  if (published) {
    const publishedSha = await getMainSha();
    const completed = await updatePublishJob(
      job.id,
      {
        status: warning ? "warning" : "published",
        htmlUrl: run.html_url || job.htmlUrl,
        publishedSha,
        error: warning ? "콘텐츠는 게시되었지만 GitHub Pages 배포를 확인해야 합니다." : null,
      },
      { statuses: ACTIVE_PUBLISH_STATUSES, runId: job.runId },
    );
    if (completed.job && isTerminalPublishJob(completed.job)) {
      await reconcileTerminalJob(completed.job);
    }
  } else {
    const message = `자동 검증이 통과하지 못했습니다. (${run.conclusion || "unknown"})`;
    const failed = await updatePublishJob(
      job.id,
      { status: "failed", htmlUrl: run.html_url, error: message },
      { statuses: ACTIVE_PUBLISH_STATUSES, runId: job.runId },
    );
    if (failed.job && isTerminalPublishJob(failed.job)) {
      await reconcileTerminalJob(failed.job);
    }
  }

  return (await getPublishJob(job.id)) || job;
}

export function publishJobDto(job: PublishJob) {
  const presentation = {
    preparing: { progress: 22, message: "검증용 초안을 만들고 있습니다." },
    queued: { progress: 58, message: "게시 작업이 대기 중입니다." },
    in_progress: { progress: 72, message: "문구와 PDF를 검증하고 있습니다." },
    published: { progress: 100, message: "게시가 완료되었습니다." },
    warning: { progress: 100, message: "콘텐츠는 게시되었습니다. GitHub Pages 배포를 확인해 주세요." },
    failed: { progress: 0, message: job.error || "게시 작업이 실패했습니다." },
  }[job.status];
  return {
    id: job.id,
    status: job.status,
    progress: presentation.progress,
    message: presentation.message,
    htmlUrl: job.htmlUrl,
    error: job.error,
  };
}
