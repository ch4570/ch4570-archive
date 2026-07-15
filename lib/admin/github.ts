import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

import {
  DOCUMENT_KEYS,
  DOCUMENTS,
  GITHUB_API_VERSION,
  MAIN_BRANCH,
  PUBLISH_WORKFLOW,
  REPOSITORY,
  REPOSITORY_OWNER_ID,
  type DocumentKey,
} from "@/lib/admin/constants";
import { AdminError } from "@/lib/admin/errors";
import type { RepositorySnapshot } from "@/lib/admin/content";

const executeFile = promisify(execFile);
const API_ROOT = `https://api.github.com/repos/${REPOSITORY}`;

type GitHubRequestOptions = {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
};

export async function githubRequest<T = unknown>(
  path: string,
  options: GitHubRequestOptions = {},
): Promise<T> {
  const token = process.env.GITHUB_ADMIN_TOKEN?.trim();
  if (!token) throw new Error("GITHUB_ADMIN_TOKEN is required for GitHub requests.");
  const response = await fetch(path.startsWith("http") ? path : `${API_ROOT}${path}`, {
    method: options.method || "GET",
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(20_000),
  });
  const responseText = await response.text();
  let payload: unknown = null;
  if (responseText) {
    try {
      payload = JSON.parse(responseText);
    } catch {
      payload = null;
    }
  }
  if (!response.ok) {
    const githubMessage =
      payload && typeof payload === "object" && "message" in payload
        ? String(payload.message)
        : `GitHub request failed (${response.status}).`;
    const status = [401, 403, 404, 409, 422].includes(response.status) ? response.status : 502;
    throw new AdminError(status, "GITHUB_ERROR", githubMessage);
  }
  return payload as T;
}

async function localSnapshot(): Promise<RepositorySnapshot> {
  const [{ stdout }, entries] = await Promise.all([
    executeFile("git", ["rev-parse", "HEAD"], { cwd: process.cwd() }),
    Promise.all(
      DOCUMENT_KEYS.map(async (key) => [
        key,
        await readFile(DOCUMENTS[key].path, "utf8"),
      ] as const),
    ),
  ]);
  return {
    baseSha: stdout.trim(),
    sources: Object.fromEntries(entries) as Record<DocumentKey, string>,
  };
}

type GitReference = { object: { sha: string } };
type GitHubContent = { type: string; encoding: string; content: string };

function decodeGitHubContent(content: GitHubContent, documentKey: DocumentKey) {
  if (content.type !== "file" || content.encoding !== "base64" || !content.content) {
    throw new AdminError(502, "INVALID_GITHUB_CONTENT", `${DOCUMENTS[documentKey].name} 원본을 확인하지 못했습니다.`);
  }
  return Buffer.from(content.content.replace(/\s+/g, ""), "base64").toString("utf8");
}

export async function getRepositorySnapshot(): Promise<RepositorySnapshot> {
  if (!process.env.GITHUB_ADMIN_TOKEN && !process.env.VERCEL) return localSnapshot();

  const mainRef = await githubRequest<GitReference>(`/git/ref/heads/${MAIN_BRANCH}`);
  const baseSha = mainRef.object.sha;
  const entries = await Promise.all(
    DOCUMENT_KEYS.map(async (documentKey) => {
      const content = await githubRequest<GitHubContent>(
        `/contents/${DOCUMENTS[documentKey].path}?ref=${encodeURIComponent(baseSha)}`,
      );
      return [documentKey, decodeGitHubContent(content, documentKey)] as const;
    }),
  );
  return {
    baseSha,
    sources: Object.fromEntries(entries) as Record<DocumentKey, string>,
  };
}

type GitCommit = { tree: { sha: string }; parents?: Array<{ sha: string }> };
type GitObject = { sha: string };
type DispatchResponse = {
  workflow_run_id: number;
  run_url: string;
  html_url: string;
};

export type DispatchDetails = {
  draftRef: string;
  draftSha: string;
  runId: number;
  runUrl: string;
  htmlUrl: string;
};

function publishRunName(jobId: string) {
  return `Publish admin draft ${jobId}`;
}

export function draftRefForPublishJob(jobId: string) {
  if (!/^[0-9a-f-]{36}$/u.test(jobId)) {
    throw new AdminError(400, "INVALID_JOB", "게시 작업 ID가 올바르지 않습니다.");
  }
  return `refs/heads/content-drafts/admin-${jobId}`;
}

async function assertRepositoryOwner() {
  const user = await githubRequest<{ id: number }>("https://api.github.com/user");
  if (user.id !== REPOSITORY_OWNER_ID) {
    throw new AdminError(403, "INVALID_GITHUB_OWNER", "저장소 소유자의 GitHub 자격증명이 아닙니다.");
  }
}

async function existingDraftSha(draftRef: string, baseSha: string) {
  const refPath = draftRef.replace(/^refs\//u, "");
  try {
    const current = await githubRequest<GitReference>(`/git/ref/${refPath}`);
    const commit = await githubRequest<GitCommit>(`/git/commits/${current.object.sha}`);
    if (!commit.parents?.some((parent) => parent.sha === baseSha)) {
      throw new AdminError(409, "INVALID_DRAFT_REF", "게시용 초안이 현재 원본에서 만들어지지 않았습니다.");
    }
    return current.object.sha;
  } catch (error) {
    if (error instanceof AdminError && error.status === 404) return null;
    throw error;
  }
}

export async function createOrReuseDraftCommit(input: {
  draftRef: string;
  baseSha: string;
  workingSources: Partial<Record<DocumentKey, string>>;
  changeCount: number;
}): Promise<{ draftRef: string; draftSha: string }> {
  await assertRepositoryOwner();

  const mainRef = await githubRequest<GitReference>(`/git/ref/heads/${MAIN_BRANCH}`);
  if (mainRef.object.sha !== input.baseSha) {
    throw new AdminError(409, "STALE_BASE", "게시하는 동안 공개 원본이 변경되었습니다.");
  }
  const existingSha = await existingDraftSha(input.draftRef, input.baseSha);
  if (existingSha) return { draftRef: input.draftRef, draftSha: existingSha };

  const baseCommit = await githubRequest<GitCommit>(`/git/commits/${input.baseSha}`);
  const treeEntries = await Promise.all(
    Object.entries(input.workingSources).map(async ([documentKey, source]) => {
      const blob = await githubRequest<GitObject>("/git/blobs", {
        method: "POST",
        body: { content: source, encoding: "utf-8" },
      });
      return {
        path: DOCUMENTS[documentKey as DocumentKey].path,
        mode: "100644",
        type: "blob",
        sha: blob.sha,
      };
    }),
  );
  const tree = await githubRequest<GitObject>("/git/trees", {
    method: "POST",
    body: { base_tree: baseCommit.tree.sha, tree: treeEntries },
  });
  const draftCommit = await githubRequest<GitObject>("/git/commits", {
    method: "POST",
    body: {
      message: `Stage owner-authored application copy\n\nPrepare ${input.changeCount} reviewed copy blocks for the guarded publication workflow.\n\nConstraint: Editable prose only; layout and diagram markup remain locked\nConfidence: high\nScope-risk: narrow\nReversibility: clean\nTested: Server-side editable-boundary validation\nNot-tested: PDF pagination before the publication workflow`,
      tree: tree.sha,
      parents: [input.baseSha],
    },
  });
  try {
    await githubRequest("/git/refs", {
      method: "POST",
      body: { ref: input.draftRef, sha: draftCommit.sha },
    });
  } catch (error) {
    if (error instanceof AdminError && error.status === 422) {
      const racedSha = await existingDraftSha(input.draftRef, input.baseSha);
      if (racedSha) return { draftRef: input.draftRef, draftSha: racedSha };
    }
    throw error;
  }
  return { draftRef: input.draftRef, draftSha: draftCommit.sha };
}

function dispatchDetails(
  dispatch: DispatchResponse,
  draftRef: string,
  draftSha: string,
): DispatchDetails {
  if (!dispatch.workflow_run_id || !dispatch.run_url || !dispatch.html_url) {
    throw new AdminError(502, "MISSING_WORKFLOW_RUN", "GitHub 게시 작업 ID를 받지 못했습니다.");
  }
  return {
    draftRef,
    draftSha,
    runId: dispatch.workflow_run_id,
    runUrl: dispatch.run_url,
    htmlUrl: dispatch.html_url,
  };
}

export async function findDispatchedWorkflowRun(jobId: string) {
  const result = await githubRequest<{
    workflow_runs: Array<
      DispatchResponse & { id: number; url: string; display_title: string }
    >;
  }>(
    `/actions/workflows/${PUBLISH_WORKFLOW}/runs?event=workflow_dispatch&branch=${MAIN_BRANCH}&per_page=30`,
  );
  const run = result.workflow_runs.find(
    (candidate) => candidate.display_title === publishRunName(jobId),
  );
  return run
    ? {
        workflow_run_id: run.id,
        run_url: run.url,
        html_url: run.html_url,
      }
    : null;
}

export async function dispatchDraftWorkflow(input: {
  jobId: string;
  draftRef: string;
  draftSha: string;
  baseSha: string;
}, options: { allowDispatch?: boolean } = {}): Promise<DispatchDetails | null> {
  const recovered = await findDispatchedWorkflowRun(input.jobId);
  if (recovered) return dispatchDetails(recovered, input.draftRef, input.draftSha);
  if (options.allowDispatch === false) return null;

  const dispatch = await githubRequest<DispatchResponse>(
    `/actions/workflows/${PUBLISH_WORKFLOW}/dispatches`,
    {
      method: "POST",
      body: {
        ref: MAIN_BRANCH,
        inputs: {
          publish_job_id: input.jobId,
          draft_ref: input.draftRef,
          draft_sha: input.draftSha,
          base_sha: input.baseSha,
        },
      },
    },
  );
  return dispatchDetails(dispatch, input.draftRef, input.draftSha);
}

export type WorkflowRun = {
  status: "queued" | "in_progress" | "completed";
  conclusion: string | null;
  html_url: string;
  jobs_url: string;
};

export function getWorkflowRun(runId: number) {
  return githubRequest<WorkflowRun>(`/actions/runs/${runId}`);
}

export function getWorkflowJobs(jobsUrl: string) {
  return githubRequest<{ jobs: Array<{ name: string; conclusion: string | null }> }>(jobsUrl);
}

export async function getMainSha() {
  const mainRef = await githubRequest<GitReference>(`/git/ref/heads/${MAIN_BRANCH}`);
  return mainRef.object.sha;
}
