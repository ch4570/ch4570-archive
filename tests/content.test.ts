import assert from "node:assert/strict";
import test from "node:test";

import { validateDraftInput, type RepositorySnapshot } from "@/lib/admin/content";
import { AdminError } from "@/lib/admin/errors";

const snapshot: RepositorySnapshot = {
  baseSha: "a".repeat(40),
  sources: {
    home: '<main><p data-edit-id="home-001">기존 소개</p></main>',
    resume: '<main><p data-edit-id="resume-001">기존 이력</p></main>',
    career: '<main><time datetime="2025-01" data-edit-id="career-001">2025.01 — 현재</time></main>',
    portfolio: '<main><p data-edit-id="portfolio-001">기존 사례</p></main>',
  },
};

test("server validation applies only known editable fields", () => {
  const result = validateDraftInput(
    {
      version: 1,
      updatedAt: new Date().toISOString(),
      documents: {
        home: {
          "home-001": { original: "기존 소개", value: "다듬은 <strong>소개</strong>" },
        },
        career: {
          "career-001": { original: "2025.01 — 현재", value: "2026.07 — 현재" },
        },
      },
    },
    snapshot,
  );

  assert.equal(result.changeCount, 2);
  assert.equal(
    result.workingSources.home,
    '<main><p data-edit-id="home-001">다듬은 <strong>소개</strong></p></main>',
  );
  assert.equal(
    result.workingSources.career,
    '<main><time datetime="2026-07" data-edit-id="career-001">2026.07 — 현재</time></main>',
  );
});

test("server validation rejects stale, unknown, and unsafe edits", () => {
  const invalidDrafts = [
    {
      documents: {
        home: { "home-001": { original: "오래된 소개", value: "수정" } },
      },
      code: "STALE_CONTENT",
    },
    {
      documents: {
        home: { unknown: { original: "기존 소개", value: "수정" } },
      },
      code: "UNKNOWN_EDIT_ID",
    },
    {
      documents: {
        home: { "home-001": { original: "기존 소개", value: "<script>alert(1)</script>" } },
      },
      code: "INVALID_EDITABLE_HTML",
    },
  ];

  for (const fixture of invalidDrafts) {
    assert.throws(
      () =>
        validateDraftInput(
          { version: 1, updatedAt: new Date().toISOString(), documents: fixture.documents },
          snapshot,
        ),
      (error) => error instanceof AdminError && error.code === fixture.code,
    );
  }
});
