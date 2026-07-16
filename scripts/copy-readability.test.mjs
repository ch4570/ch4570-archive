import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { scanEditableRegions } from "../admin/editor-core.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function visibleText(fragment) {
  return fragment
    .replace(/<[^>]+>/gu, "")
    .replaceAll("&amp;", "&")
    .replace(/\s+/gu, " ")
    .trim();
}

function caseSection(source, id) {
  const opening = `<section class="case-section" id="${id}"`;
  const start = source.indexOf(opening);
  assert.notEqual(start, -1, `expected #${id} case section`);
  const next = source.indexOf('<section class="case-section"', start + opening.length);
  return source.slice(start, next === -1 ? source.length : next);
}

test("resume list items stay concise enough to scan", async () => {
  const source = await readFile(resolve(repositoryRoot, "resume/index.html"), "utf8");
  const listItems = scanEditableRegions(source).filter(
    (region) => region.tagName === "li" && region.id.startsWith("resume-"),
  );

  assert.ok(listItems.length > 0, "expected editable resume list items");
  for (const item of listItems) {
    const text = visibleText(item.innerHTML);
    const sentenceCount = text.split(/[.!?](?:\s|$)/u).filter(Boolean).length;
    assert.ok(text.length <= 115, `${item.id} is ${text.length} characters: ${text}`);
    assert.ok(sentenceCount <= 2, `${item.id} has ${sentenceCount} sentences: ${text}`);
  }
});

test("portfolio story cards lead with concise nominal bullets", async () => {
  const source = await readFile(resolve(repositoryRoot, "portfolio/index.html"), "utf8");
  const editableById = new Map(
    scanEditableRegions(source).map((region) => [region.id, region]),
  );
  const storyPairs = [
    ["portfolio-017", "portfolio-018"],
    ["portfolio-019", "portfolio-020"],
    ["portfolio-039", "portfolio-040"],
    ["portfolio-041", "portfolio-042"],
  ];

  assert.equal(storyPairs.length, 4, "expected the four retained portfolio story cards");
  for (const [headingId, summaryId] of storyPairs) {
    const heading = editableById.get(headingId);
    const summary = editableById.get(summaryId);

    assert.equal(heading?.tagName, "h3", `expected story heading ${headingId}`);
    assert.equal(summary?.tagName, "p", `expected story summary ${summaryId}`);

    const headingText = visibleText(heading.innerHTML);
    const summaryText = visibleText(summary.innerHTML);
    assert.ok(
      headingText.length <= 32,
      `${heading.id} is ${headingText.length} characters: ${headingText}`,
    );
    assert.doesNotMatch(
      `${headingText} ${summaryText}`,
      /[가-힣]니다[.!?]?/u,
      `${headingId}/${summaryId} should use nominal copy`,
    );

    const bulletLines = summary.innerHTML
      .split(/<br\s*\/?\s*>/giu)
      .map((line) => visibleText(line))
      .filter(Boolean);
    assert.ok(
      bulletLines.length >= 2 && bulletLines.length <= 3,
      `${summaryId} should contain two or three scan-friendly bullets`,
    );
    for (const line of bulletLines) {
      assert.match(line, /^•\s/u, `${summaryId} bullet should start with •: ${line}`);
      assert.ok(line.length <= 58, `${summaryId} bullet is ${line.length} characters: ${line}`);
    }
  }
});

test("portfolio omits low-signal detail drawers and their editable fields", async () => {
  const source = await readFile(resolve(repositoryRoot, "portfolio/index.html"), "utf8");
  const editableById = new Map(
    scanEditableRegions(source).map((region) => [region.id, region]),
  );
  const detailRanges = [
    [22, 27],
    [43, 47],
    [64, 77],
    [82, 84],
    [89, 95],
  ];
  const detailIds = detailRanges.flatMap(([start, end]) =>
    Array.from(
      { length: end - start + 1 },
      (_, offset) => `portfolio-${String(start + offset).padStart(3, "0")}`,
    ),
  );

  assert.equal(detailIds.length, 35, "expected the complete removed detail-id contract");
  assert.doesNotMatch(source, /class="case-details"/u);
  assert.doesNotMatch(source, /data-toggle-details/u);
  for (const detailId of detailIds) {
    assert.equal(editableById.has(detailId), false, `${detailId} should stay retired`);
  }
});

test("feed keeps one Archify diagram without duplicate narrative layers", async () => {
  const source = await readFile(resolve(repositoryRoot, "portfolio/index.html"), "utf8");
  const feed = caseSection(source, "feed");

  assert.match(feed, /data-diagram-tool="archify@2\.11\.0"/u);
  assert.equal(feed.match(/<figure\b/gu)?.length, 1, "feed should keep one figure");
  assert.doesNotMatch(feed, /feed-print-spine|story-grid|case-outcome/u);
});

test("each flagship case keeps at most one diagram and previous experience stays elsewhere", async () => {
  const source = await readFile(resolve(repositoryRoot, "portfolio/index.html"), "utf8");

  for (const id of ["event", "point", "feed", "test", "agent"]) {
    const section = caseSection(source, id);
    assert.ok(
      (section.match(/<figure\b/gu) ?? []).length <= 1,
      `#${id} should not repeat diagrams`,
    );
  }
  assert.doesNotMatch(source, /id="previous"|href="#previous"/u);
});

test("Archify output stays a self-contained light SVG", async () => {
  const source = await readFile(
    resolve(repositoryRoot, "assets/diagrams/feed-serving.svg"),
    "utf8",
  );

  assert.match(source, /<svg\b[^>]*data-theme="light"/u);
  assert.match(source, /data-generator="archify 2\.11\.0"/u);
  assert.match(source, /<title>피드 서빙 책임 경계<\/title>/u);
  assert.doesNotMatch(source, /<script\b|<foreignObject\b/iu);
});
