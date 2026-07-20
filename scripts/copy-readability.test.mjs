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

test("submission copy keeps verified scope, attribution, and version cues", async () => {
  const [home, resume, career, portfolio, answerBank] = await Promise.all([
    readFile(resolve(repositoryRoot, "index.html"), "utf8"),
    readFile(resolve(repositoryRoot, "resume/index.html"), "utf8"),
    readFile(resolve(repositoryRoot, "career/index.html"), "utf8"),
    readFile(resolve(repositoryRoot, "portfolio/index.html"), "utf8"),
    readFile(
      resolve(repositoryRoot, "applications/backend-application-answer-bank.md"),
      "utf8",
    ),
  ]);
  const packet = [home, resume, career, portfolio, answerBank].join("\n");

  assert.doesNotMatch(packet, /AI[- ]?Native|Agent Lab/iu);
  assert.match(
    resume,
    /한국방송통신대학교 컴퓨터과학과 졸업[^<]*2023\.03[^<]*2025\.03/u,
  );
  assert.match(resume, /Kafka로 처리하는 내부 이벤트 9종/u);
  assert.match(career, /Kafka로 처리하는 내부 이벤트 9종/u);
  assert.match(portfolio, /Kafka로 처리하는 내부 이벤트 9종/u);
  assert.match(
    resume,
    /https:\/\/github\.com\/javacafe-project\/elasticsearch-plugin/u,
  );
  assert.match(
    portfolio,
    /https:\/\/github\.com\/javacafe-project\/elasticsearch-plugin/u,
  );
  assert.match(
    portfolio,
    /<dt data-edit-id="portfolio-055">담당<\/dt>/u,
  );
  assert.match(packet, /웍스피어\(유\) 소속으로 JOBKOREA·Albamon/u);
  assert.doesNotMatch(portfolio, /S3에서는 지워졌지만 DB에 남은/u);
  assert.doesNotMatch(packet, /Spring 오픈소스 PR 3건/u);
  assert.doesNotMatch(
    packet,
    /멈춘 지점부터|해당 지점부터|장애가 날 때마다 로그와 원장을 대조|internal_event_record|point_core|point_service|query-api|FPR·SPR/u,
  );
});

test("portfolio story cards use short plain sentences", async () => {
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
    assert.ok(headingText.length <= 46, `${heading.id} is too long: ${headingText}`);
    assert.ok(summaryText.length <= 150, `${summaryId} is too long: ${summaryText}`);
    assert.match(`${headingText} ${summaryText}`, /습니다[.!]?/u);
    assert.doesNotMatch(summary.innerHTML, /<br\s*\/?\s*>|^\s*•/iu);
    assert.doesNotMatch(
      `${headingText} ${summaryText}`,
      /정합성 계약|책임 경계|설계 기준|결과 불변식/u,
      `${headingId}/${summaryId} should avoid abstract portfolio jargon`,
    );

    const sentences = summaryText.split(/[.!?](?:\s|$)/u).filter(Boolean);
    assert.ok(
      sentences.length >= 1 && sentences.length <= 3,
      `${summaryId} should contain one to three short sentences`,
    );
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

test("each backend case keeps at most one diagram and omits unrelated sections", async () => {
  const source = await readFile(resolve(repositoryRoot, "portfolio/index.html"), "utf8");

  for (const id of ["event", "point", "feed", "test"]) {
    const section = caseSection(source, id);
    assert.ok(
      (section.match(/<figure\b/gu) ?? []).length <= 1,
      `#${id} should not repeat diagrams`,
    );
  }
  assert.doesNotMatch(source, /id="previous"|href="#previous"/u);
  assert.doesNotMatch(source, /id="agent"|href="#agent"/u);
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
