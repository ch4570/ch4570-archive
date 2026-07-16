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
    ["portfolio-059", "portfolio-060"],
    ["portfolio-061", "portfolio-062"],
  ];

  assert.equal(storyPairs.length, 6, "expected all six portfolio story cards");
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

test("portfolio detail evidence uses compact labeled phrases", async () => {
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

  assert.equal(detailIds.length, 35, "expected all portfolio detail evidence items");
  for (const detailId of detailIds) {
    const item = editableById.get(detailId);
    assert.equal(item?.tagName, "li", `expected detail evidence item ${detailId}`);
    assert.match(
      item.innerHTML,
      /^<strong>[^<]{1,18}<\/strong>\s/u,
      `${detailId} should start with a short evidence label`,
    );

    const text = visibleText(item.innerHTML);
    assert.ok(text.length <= 95, `${detailId} is ${text.length} characters: ${text}`);
    assert.doesNotMatch(text, /[가-힣]니다[.!?]?/u, `${detailId} should use nominal copy`);
  }
});
