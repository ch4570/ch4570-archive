import assert from "node:assert/strict";
import test from "node:test";

import { dispatchDraftWorkflow } from "@/lib/admin/github";

const jobId = "11111111-1111-4111-8111-111111111111";
const draftRef = `refs/heads/content-drafts/admin-${jobId}`;

test("workflow dispatch uses the stable job input without the removed response flag", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  process.env.GITHUB_ADMIN_TOKEN = "test-token-that-never-leaves-the-test-process";
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.includes("/runs?")) {
      return Response.json({ workflow_runs: [] });
    }
    return Response.json({
      workflow_run_id: 123,
      run_url: "https://api.github.test/runs/123",
      html_url: "https://github.test/runs/123",
    });
  };

  try {
    const result = await dispatchDraftWorkflow({
      jobId,
      draftRef,
      draftSha: "b".repeat(40),
      baseSha: "a".repeat(40),
    });
    assert.equal(result?.runId, 123);
    const dispatchRequest = requests.find((request) => request.init?.method === "POST");
    assert.ok(dispatchRequest);
    const body = JSON.parse(String(dispatchRequest.init?.body));
    assert.equal(body.return_run_details, undefined);
    assert.equal(body.inputs.publish_job_id, jobId);
    assert.equal(body.inputs.draft_ref, draftRef);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.GITHUB_ADMIN_TOKEN;
  }
});

test("workflow dispatch recovery reuses a run with the same stable title", async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  process.env.GITHUB_ADMIN_TOKEN = "test-token-that-never-leaves-the-test-process";
  globalThis.fetch = async () => {
    requestCount += 1;
    return Response.json({
      workflow_runs: [
        {
          id: 456,
          url: "https://api.github.test/runs/456",
          html_url: "https://github.test/runs/456",
          display_title: `Publish admin draft ${jobId}`,
        },
      ],
    });
  };

  try {
    const result = await dispatchDraftWorkflow(
      {
        jobId,
        draftRef,
        draftSha: "b".repeat(40),
        baseSha: "a".repeat(40),
      },
      { allowDispatch: false },
    );
    assert.equal(result?.runId, 456);
    assert.equal(requestCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.GITHUB_ADMIN_TOKEN;
  }
});
