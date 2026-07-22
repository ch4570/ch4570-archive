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
    .replaceAll("&#8288;", "")
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

test("portfolio technical identifiers stay searchable", async () => {
  const source = await readFile(resolve(repositoryRoot, "portfolio/index.html"), "utf8");
  const heading = scanEditableRegions(source).find(
    (region) => region.id === "portfolio-079",
  );

  assert.ok(heading, "expected the test-support heading");
  assert.match(visibleText(heading.innerHTML), /test-support/u);
  assert.doesNotMatch(heading.innerHTML, /&#8288;|\u2060/u);
});

test("portfolio cases keep diagrams focused and accessible", async () => {
  const source = await readFile(resolve(repositoryRoot, "portfolio/index.html"), "utf8");

  for (const id of ["event", "point", "feed", "test"]) {
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
