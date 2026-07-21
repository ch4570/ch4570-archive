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

test("career copy assigns CI memory work to Worksphere and keeps prior roles compact", async () => {
  const [resume, career] = await Promise.all([
    readFile(resolve(repositoryRoot, "resume/index.html"), "utf8"),
    readFile(resolve(repositoryRoot, "career/index.html"), "utf8"),
  ]);
  const ciResourceIssue = /CI.{0,80}메모리 부족|메모리 부족.{0,80}CI/su;
  const worksphereCareerSource = career.slice(
    career.indexOf('id="worksphere-core"'),
    career.indexOf('id="previous-experience"'),
  );
  const tosslabCareerSource = career.slice(
    career.indexOf('id="previous-experience"'),
  );
  const worksphereResumeSource = resume.slice(
    resume.indexOf('data-edit-id="resume-010"'),
    resume.indexOf('id="previous-title"'),
  );
  const previousResumeSource = resume.slice(
    resume.indexOf('id="previous-title"'),
  );
  const worksphereCareer = visibleText(worksphereCareerSource);
  const tosslabCareer = visibleText(tosslabCareerSource);
  const worksphereResume = visibleText(worksphereResumeSource);
  const previousResume = visibleText(previousResumeSource);

  assert.match(worksphereCareer, ciResourceIssue);
  assert.doesNotMatch(tosslabCareer, ciResourceIssue);
  assert.match(worksphereResume, ciResourceIssue);
  assert.doesNotMatch(previousResume, ciResourceIssue);
  assert.match(worksphereCareerSource, /data-edit-id="career-070"/u);
  assert.doesNotMatch(tosslabCareerSource, /data-edit-id="career-070"/u);
  assert.match(worksphereResumeSource, /data-edit-id="resume-029"/u);
  assert.doesNotMatch(previousResumeSource, /data-edit-id="resume-029"/u);

  const careerEditable = new Map(
    scanEditableRegions(career).map((region) => [region.id, region]),
  );
  for (const [headingId, detailId] of [
    ["career-072", "career-073"],
    ["career-077", "career-078"],
  ]) {
    assert.doesNotMatch(
      visibleText(careerEditable.get(headingId).innerHTML),
      /Backend Engineer/u,
    );
    assert.match(
      visibleText(careerEditable.get(detailId).innerHTML),
      /Backend Engineer/u,
    );
  }
});

test("final packet keeps company context, evidence, and document-specific wording", async () => {
  const [resume, career, answerBank] = await Promise.all([
    readFile(resolve(repositoryRoot, "resume/index.html"), "utf8"),
    readFile(resolve(repositoryRoot, "career/index.html"), "utf8"),
    readFile(
      resolve(repositoryRoot, "applications/backend-application-answer-bank.md"),
      "utf8",
    ),
  ]);
  const careerEditable = new Map(
    scanEditableRegions(career).map((region) => [region.id, region]),
  );
  const resumeEditable = new Map(
    scanEditableRegions(resume).map((region) => [region.id, region]),
  );
  const careerText = (id) => visibleText(careerEditable.get(id).innerHTML);
  const resumeText = (id) => visibleText(resumeEditable.get(id).innerHTML);

  assert.match(resumeText("resume-014"), /^9개 API에/u);
  assert.match(careerText("career-036"), /^배치는 중단한 위치부터/u);
  assert.match(careerText("career-042"), /^웍스피어\(유\)/u);
  assert.match(careerText("career-044"), /검색 소스마다 타임아웃/u);
  assert.match(careerText("career-070"), /자원 증설 없이/u);
  assert.notEqual(
    careerText("career-070"),
    resumeText("resume-029"),
    "career and resume should not repeat the same CI sentence verbatim",
  );
  assert.ok(
    career.indexOf('data-edit-id="career-050"') <
      career.indexOf('data-edit-id="career-044"'),
    "the page-two continuation label should introduce the search project",
  );

  assert.doesNotMatch(answerBank, /회귀 테스트도 남겼습니다/u);
  assert.doesNotMatch(answerBank, /3단계 랭킹/u);
  assert.match(answerBank, /중복 제거·점수화·재정렬/u);
  assert.match(answerBank, /웍스피어\(유\).{0,80}test-support/su);
  const jpaAnswer = answerBank.slice(
    answerBank.indexOf("### 7."),
    answerBank.indexOf("### 8."),
  );
  assert.equal(
    jpaAnswer.match(/약 200만 건/gu)?.length,
    1,
    "the short JPA answer should not repeat the same metric",
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
  assert.match(source, /<title\b[^>]*>피드 서빙 책임 경계<\/title>/u);
  assert.doesNotMatch(source, /<script\b|<foreignObject\b/iu);

  const viewBox = source.match(/viewBox="[\d.-]+ [\d.-]+ ([\d.]+) ([\d.]+)"/u);
  assert.ok(viewBox, "expected a numeric SVG viewBox");
  assert.ok(Number(viewBox[1]) <= 1000, "the A4 diagram should stay compact enough to read");

  const fontSizes = [
    ...source.matchAll(/font-size(?:\s*:\s*|=")([\d.]+)(?:px)?/gu),
  ].map((match) => Number(match[1]));
  assert.ok(fontSizes.length > 0, "expected explicit diagram font sizes");
  assert.ok(
    Math.min(...fontSizes) >= 14,
    "the smallest A4 diagram label should remain readable",
  );
});
