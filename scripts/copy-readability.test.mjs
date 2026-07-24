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
    .replaceAll("&nbsp;", " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function caseSection(source, id) {
  const opening = '<section class="case-section" id="' + id + '"';
  const start = source.indexOf(opening);
  assert.notEqual(start, -1, "expected #" + id + " case section");
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
    assert.ok(text.length <= 115, item.id + " is " + text.length + " characters");
    assert.ok(sentenceCount <= 2, item.id + " has too many sentences");
  }
});

test("browser documents declare an inline favicon", async () => {
  const documents = await Promise.all(
    [
      "index.html",
      "resume/index.html",
      "career/index.html",
      "portfolio/index.html",
      "admin/index.html",
    ].map(async (file) => [
      file,
      await readFile(resolve(repositoryRoot, file), "utf8"),
    ]),
  );

  for (const [file, source] of documents) {
    assert.match(
      source,
      /<link rel="icon" href="data:image\/svg\+xml,[^"]+">/u,
      file + " should not trigger a fallback /favicon.ico request",
    );
  }
});

test("public documents keep one heading and valid editable regions", async () => {
  const documents = [
    ["home", "index.html"],
    ["resume", "resume/index.html"],
    ["career", "career/index.html"],
    ["portfolio", "portfolio/index.html"],
  ];

  for (const [prefix, file] of documents) {
    const source = await readFile(resolve(repositoryRoot, file), "utf8");
    assert.equal(source.match(/<h1\b/gu)?.length, 1, file + " should have one h1");

    const regions = scanEditableRegions(source);
    assert.ok(regions.length > 0, file + " should expose editable content");
    assert.equal(
      new Set(regions.map((region) => region.id)).size,
      regions.length,
      file + " should keep editable IDs unique",
    );
    assert.ok(
      regions.every((region) => region.id.startsWith(prefix + "-")),
      file + " should namespace editable IDs",
    );
  }
});

test("portfolio story cards stay short and semantic", async () => {
  const source = await readFile(resolve(repositoryRoot, "portfolio/index.html"), "utf8");
  const editableById = new Map(
    scanEditableRegions(source).map((region) => [region.id, region]),
  );
  const storyPairs = [
    ["portfolio-017", "portfolio-018"],
    ["portfolio-019", "portfolio-020"],
    ["portfolio-089", "portfolio-090"],
    ["portfolio-091", "portfolio-092"],
    ["portfolio-039", "portfolio-040"],
    ["portfolio-041", "portfolio-042"],
  ];

  for (const [headingId, summaryId] of storyPairs) {
    const heading = editableById.get(headingId);
    const summary = editableById.get(summaryId);
    assert.equal(heading?.tagName, "h3", "expected story heading " + headingId);
    assert.equal(summary?.tagName, "p", "expected story summary " + summaryId);

    const headingText = visibleText(heading.innerHTML);
    const summaryText = visibleText(summary.innerHTML);
    const sentences = summaryText.split(/[.!?](?:\s|$)/u).filter(Boolean);

    assert.ok(headingText.length <= 46, headingId + " should stay scannable");
    assert.ok(summaryText.length <= 150, summaryId + " should stay scannable");
    assert.ok(
      sentences.length >= 1 && sentences.length <= 3,
      summaryId + " should contain one to three sentences",
    );
    assert.doesNotMatch(summary.innerHTML, /<br\s*\/?\s*>|^\s*•/iu);
  }
});

test("submission text stays searchable without invisible joiners", async () => {
  for (const file of ["resume/index.html", "career/index.html", "portfolio/index.html"]) {
    const source = await readFile(resolve(repositoryRoot, file), "utf8");
    assert.doesNotMatch(source, /&#8288;|\u2060/u, file + " should use literal text");
  }
});

test("career overview preserves period, employer, and role reading order", async () => {
  const source = await readFile(resolve(repositoryRoot, "career/index.html"), "utf8");
  const rows = [...source.matchAll(/<article><p class="career-history-line">([\s\S]*?)<\/p><\/article>/gu)];

  assert.equal(rows.length, 4, "expected four semantic career rows");
  for (const [, row] of rows) {
    const period = row.indexOf("<time");
    const employer = row.indexOf("<strong");
    const role = row.indexOf("<span");
    assert.ok(period >= 0 && period < employer && employer < role);
  }
});

test("career employer headings separate company from product and role", async () => {
  const source = await readFile(resolve(repositoryRoot, "career/index.html"), "utf8");
  const editableById = new Map(
    scanEditableRegions(source).map((region) => [region.id, region]),
  );
  const employerHeadings = [
    ["career-025", "웍스피어(유)", "JOBKOREA·Albamon"],
    ["career-065", "토스랩", "JANDI"],
  ];

  for (const [id, company, product] of employerHeadings) {
    const heading = editableById.get(id);
    assert.equal(heading?.tagName, "h2", "expected employer heading " + id);

    const hierarchy = heading.innerHTML.match(
      /^\s*([^<]+?)\s*<small>([\s\S]+)<\/small>\s*$/u,
    );
    assert.ok(hierarchy, id + " should nest product and role in a <small> subtitle");
    assert.equal(visibleText(hierarchy[1]), company, id + " should expose only the company");

    const subtitle = visibleText(hierarchy[2]);
    assert.ok(subtitle.includes(product), id + " should keep the product in its subtitle");
    assert.ok(
      subtitle.includes("Backend Engineer"),
      id + " should keep the role in its subtitle",
    );
  }

  const continuation = editableById.get("career-042");
  assert.equal(continuation?.tagName, "h2", "expected continuation heading career-042");
  assert.match(
    visibleText(continuation.innerHTML),
    /^웍스피어\(유\)/u,
    "career-042 should retain its employer context",
  );
});

test("portfolio leads with the JPA correction case before supporting work", async () => {
  const source = await readFile(resolve(repositoryRoot, "portfolio/index.html"), "utf8");
  const orderedIds = ["event", "jpa", "point", "feed", "evidence"];
  const positions = orderedIds.map((id) => source.indexOf('id="' + id + '"'));

  assert.ok(positions.every((position) => position >= 0), "expected every portfolio case");
  assert.deepEqual(positions, [...positions].sort((left, right) => left - right));

  const jpa = caseSection(source, "jpa");
  assert.match(jpa, /실제 영속성 컨텍스트/u);
  assert.match(jpa, /약 200만/u);
  assert.equal(jpa.match(/<div class="fact-cell">/gu)?.length, 4);
  assert.equal(jpa.match(/<div class="story-block">/gu)?.length, 2);
});

test("portfolio cases keep diagrams focused and accessible", async () => {
  const source = await readFile(resolve(repositoryRoot, "portfolio/index.html"), "utf8");

  for (const id of ["event", "jpa", "point", "feed"]) {
    const section = caseSection(source, id);
    assert.ok(
      (section.match(/<figure\b/gu) ?? []).length <= 1,
      "#" + id + " should not repeat diagrams",
    );
  }

  const feed = caseSection(source, "feed");
  assert.equal(feed.match(/<figure\b/gu)?.length, 1, "feed should expose one figure");
  assert.match(feed, /data-diagram-tool="archify@2\.11\.0"/u);
  assert.match(feed, /<figcaption>[\s\S]*<\/figcaption>/u);
  assert.match(feed, /<img\b[^>]*\balt="[^"]+"/u);
});

test("Archify output stays safe, readable, and on the design grid", async () => {
  const source = await readFile(
    resolve(repositoryRoot, "assets/diagrams/feed-serving.svg"),
    "utf8",
  );

  assert.match(source, /<svg\b[^>]*data-theme="light"/u);
  assert.match(source, /data-generator="archify 2\.11\.0"/u);
  assert.match(source, /<title\b[^>]*>[^<]+<\/title>/u);
  assert.match(source, /<desc\b[^>]*>[^<]+<\/desc>/u);
  assert.doesNotMatch(source, /<script\b|<foreignObject\b/iu);

  const viewBox = source.match(/viewBox="[\d.-]+ [\d.-]+ ([\d.]+) ([\d.]+)"/u);
  assert.ok(viewBox, "expected a numeric SVG viewBox");
  assert.ok(Number(viewBox[1]) <= 1000, "diagram should stay compact enough for A4");

  const radii = [...source.matchAll(/\brx="([\d.]+)"/gu)].map((match) => Number(match[1]));
  assert.ok(radii.length > 0, "expected explicit diagram corner radii");
  assert.ok(Math.max(...radii) <= 2, "diagram should follow the 2px radius contract");

  const fontSizes = [
    ...source.matchAll(/font-size(?:\s*:\s*|=")([\d.]+)(?:px)?/gu),
  ].map((match) => Number(match[1]));
  assert.ok(fontSizes.length > 0, "expected explicit diagram font sizes");
  assert.ok(Math.min(...fontSizes) >= 14, "diagram labels should remain readable");
});
