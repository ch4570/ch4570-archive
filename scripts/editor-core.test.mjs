import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ALLOWED_INLINE_TAGS,
  EditableDocumentError,
  assertEditableOnlyChanges,
  inferEditableTimeDatetime,
  isSafeHref,
  maskEditableContents,
  replaceEditableContents,
  scanEditableRegions,
  synchronizeEditableTimeDatetimes,
  validateInlineHtml,
} from "../admin/editor-core.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const validatorPath = join(repositoryRoot, "scripts", "validate-editables.mjs");

function assertEditorError(callback, code) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof EditableDocumentError);
    assert.equal(error.code, code);
    return true;
  });
}

test("scans Korean text, entities, and inline markup without normalizing bytes", () => {
  const source = [
    "<!doctype html>",
    '<main class="document">',
    '  <p data-edit-id="resume-summary">장애 &amp; 복구를 <strong>끝까지</strong> 추적합니다.</p>',
    "</main>",
  ].join("\n");

  const regions = scanEditableRegions(source);
  assert.equal(regions.length, 1);
  assert.deepEqual(
    {
      id: regions[0].id,
      innerHTML: regions[0].innerHTML,
      tagName: regions[0].tagName,
    },
    {
      id: "resume-summary",
      innerHTML: "장애 &amp; 복구를 <strong>끝까지</strong> 추적합니다.",
      tagName: "p",
    },
  );
  assert.equal(
    source.slice(regions[0].startTagStart, regions[0].startTagEnd),
    '<p data-edit-id="resume-summary">',
  );
});

test("rejects duplicate and nested editable IDs", async (t) => {
  await t.test("duplicate sibling IDs", () => {
    assertEditorError(
      () =>
        scanEditableRegions(
          '<p data-edit-id="same">첫째</p><p data-edit-id="same">둘째</p>',
        ),
      "DUPLICATE_EDIT_ID",
    );
  });

  await t.test("nested editable regions", () => {
    assertEditorError(
      () =>
        scanEditableRegions(
          '<p data-edit-id="outer">본문 <span data-edit-id="inner">강조</span></p>',
        ),
      "NESTED_EDITABLE",
    );
  });

  await t.test("duplicate data-edit-id attributes", () => {
    assertEditorError(
      () =>
        scanEditableRegions(
          '<p data-edit-id="first" data-edit-id="second">본문</p>',
        ),
      "DUPLICATE_EDIT_ID_ATTRIBUTE",
    );
  });
});

test("replaces only editable innerHTML and preserves every outer byte", () => {
  const source = [
    '<section class="resume" data-layout="locked">',
    '  <h2 data-edit-id="title">기존 제목</h2>',
    '  <p class="lede" data-edit-id="summary">기존 <b>소개</b></p>',
    "</section>",
  ].join("\n");

  const result = replaceEditableContents(
    source,
    new Map([
      ["title", "AI-Native 백엔드 엔지니어"],
      ["summary", "설계와 <strong>검증</strong>을 함께 다룹니다."],
    ]),
    { requireAll: true },
  );

  assert.equal(
    result,
    [
      '<section class="resume" data-layout="locked">',
      '  <h2 data-edit-id="title">AI-Native 백엔드 엔지니어</h2>',
      '  <p class="lede" data-edit-id="summary">설계와 <strong>검증</strong>을 함께 다룹니다.</p>',
      "</section>",
    ].join("\n"),
  );
  assert.equal(maskEditableContents(result), maskEditableContents(source));
});

test("supports partial replacements and rejects unknown or missing fields", () => {
  const source =
    '<p data-edit-id="one">하나</p><p data-edit-id="two">둘</p>';

  assert.equal(
    replaceEditableContents(source, { one: "첫 번째" }),
    '<p data-edit-id="one">첫 번째</p><p data-edit-id="two">둘</p>',
  );
  assertEditorError(
    () => replaceEditableContents(source, { unknown: "값" }),
    "UNKNOWN_EDIT_ID",
  );
  assertEditorError(
    () => replaceEditableContents(source, { one: "값" }, { requireAll: true }),
    "MISSING_REPLACEMENT",
  );
  assertEditorError(
    () => replaceEditableContents(source, new Date()),
    "INVALID_REPLACEMENTS",
  );
});

test("masked comparison accepts content edits and rejects locked outer changes", () => {
  const baseline =
    '<article class="case"><h2 data-edit-id="title">원래 제목</h2></article>';
  const edited =
    '<article class="case"><h2 data-edit-id="title">다듬은 <strong>제목</strong></h2></article>';

  assert.equal(maskEditableContents(baseline), maskEditableContents(edited));
  assert.deepEqual(assertEditableOnlyChanges(baseline, edited).changedIds, [
    "title",
  ]);

  const outerChange = edited.replace('class="case"', 'class="case featured"');
  assertEditorError(
    () => assertEditableOnlyChanges(baseline, outerChange),
    "LOCKED_MARKUP_CHANGED",
  );
});

test("keeps editable period text and machine-readable datetime in sync", () => {
  const baseline =
    '<time class="period" datetime="2025-06" data-edit-id="career-period">2025.06 — 현재</time>';
  const edited = replaceEditableContents(baseline, {
    "career-period": "2026년 7월 — 현재",
  });

  assert.equal(
    edited,
    '<time class="period" datetime="2026-07" data-edit-id="career-period">2026년 7월 — 현재</time>',
  );
  assert.deepEqual(assertEditableOnlyChanges(baseline, edited).changedIds, [
    "career-period",
  ]);
  assert.equal(inferEditableTimeDatetime("<strong>2024.9</strong> — 2025.04"), "2024-09");
  assert.equal(synchronizeEditableTimeDatetimes(edited), edited);

  const stale = edited.replace('datetime="2026-07"', 'datetime="2025-06"');
  assertEditorError(
    () => assertEditableOnlyChanges(baseline, stale),
    "STALE_TIME_ATTRIBUTE",
  );
  assertEditorError(
    () => inferEditableTimeDatetime("현재"),
    "INVALID_TIME_VALUE",
  );
});

test("accepts the documented inline markup and safe href protocols", () => {
  const fragment = [
    '<a href="https://example.com/path?q=1" target="_blank" rel="noopener">링크</a>',
    "<b>굵게</b><strong>중요</strong><em>강조</em><i>용어</i>",
    '<code lang="kotlin">Result</code><br>',
    '<span aria-label="설명">본문</span><small>보충</small>',
  ].join("");

  assert.deepEqual(ALLOWED_INLINE_TAGS, [
    "a",
    "b",
    "strong",
    "em",
    "i",
    "code",
    "br",
    "span",
    "small",
  ]);
  assert.equal(validateInlineHtml(fragment), true);
  for (const href of [
    "https://example.com",
    "http://example.com",
    "mailto:ckdekrn88@gmail.com",
    "tel:+821012345678",
    "/career/",
    "../portfolio/",
    "#project",
    "?view=compact",
  ]) {
    assert.equal(isSafeHref(href), true, href);
  }
});

test("rejects unsafe tags, styling, event handlers, and href protocols", async (t) => {
  const unsafeCases = [
    ["script tag", '<script>alert("x")</script>', "DISALLOWED_TAG"],
    ["style tag", "<style>body{display:none}</style>", "DISALLOWED_TAG"],
    ["block tag", "<div>본문</div>", "DISALLOWED_TAG"],
    ["style attribute", '<span style="display:none">본문</span>', "STYLE_ATTRIBUTE"],
    ["CSS class", '<span class="screen-only">본문</span>', "CLASS_ATTRIBUTE"],
    ["event handler", '<a href="#" onclick="alert(1)">본문</a>', "EVENT_HANDLER_ATTRIBUTE"],
    ["new tab without opener protection", '<a href="https://example.com" target="_blank">본문</a>', "UNSAFE_REL"],
    ["javascript href", '<a href="javascript:alert(1)">본문</a>', "UNSAFE_HREF"],
    ["entity-obscured href", '<a href="java&#x73;cript&colon;alert(1)">본문</a>', "UNSAFE_HREF"],
    ["control-obscured href", '<a href="java&#x0a;script:alert(1)">본문</a>', "UNSAFE_HREF"],
    ["data href", '<a href="data:text/html,alert(1)">본문</a>', "UNSAFE_HREF"],
    ["mismatched tags", "<strong>본문</em>", "INVALID_INLINE_HTML"],
    ["malformed closing tag", "<strong>본문</ strong>", "INVALID_INLINE_HTML"],
  ];

  for (const [name, fragment, code] of unsafeCases) {
    await t.test(name, () => {
      assertEditorError(() => validateInlineHtml(fragment), code);
    });
  }

  for (const href of [
    "javascript:alert(1)",
    "java&#x0a;script:alert(1)",
    "data:text/html,test",
    "file:///etc/passwd",
    "vbscript:msgbox(1)",
  ]) {
    assert.equal(isSafeHref(href), false, href);
  }
});

test("CLI compares a working document with a Git baseline", async () => {
  const temporaryRepository = await mkdtemp(join(tmpdir(), "editable-validator-"));
  const documentPath = join(temporaryRepository, "resume", "index.html");

  try {
    await mkdir(dirname(documentPath), { recursive: true });
    const baseline =
      '<main><p class="summary" data-edit-id="summary">기존 소개</p></main>\n';
    await writeFile(documentPath, baseline, "utf8");

    execFileSync("git", ["init", "-q"], { cwd: temporaryRepository });
    execFileSync("git", ["config", "user.name", "Editor Test"], {
      cwd: temporaryRepository,
    });
    execFileSync("git", ["config", "user.email", "editor@example.com"], {
      cwd: temporaryRepository,
    });
    execFileSync("git", ["add", "resume/index.html"], {
      cwd: temporaryRepository,
    });
    execFileSync("git", ["commit", "-qm", "baseline"], {
      cwd: temporaryRepository,
    });

    await writeFile(
      documentPath,
      baseline.replace("기존 소개", "다듬은 <strong>소개</strong>"),
      "utf8",
    );
    const accepted = spawnSync(
      process.execPath,
      [validatorPath, "--base", "HEAD", "resume/index.html"],
      { cwd: temporaryRepository, encoding: "utf8" },
    );
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.match(accepted.stdout, /1 fields, 1 changed/u);

    const editedSource = await readFile(documentPath, "utf8");
    await writeFile(
      documentPath,
      editedSource.replace('class="summary"', 'class="summary changed"'),
      "utf8",
    );
    const rejected = spawnSync(
      process.execPath,
      [validatorPath, "--base", "HEAD", "resume/index.html"],
      { cwd: temporaryRepository, encoding: "utf8" },
    );
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /LOCKED_MARKUP_CHANGED/u);
  } finally {
    await rm(temporaryRepository, { force: true, recursive: true });
  }
});
