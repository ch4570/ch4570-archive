import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { assertEditableOnlyChanges, scanEditableRegions } from "../admin/editor-core.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function visibleText(fragment) {
  return fragment
    .replace(/<[^>]+>/gu, "")
    .replaceAll("&amp;", "&")
    .replaceAll("&nbsp;", " ")
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
      /<link\s+rel="icon"\s+href="data:image\/svg\+xml,[^"]+"\s*\/?>/u,
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

    assert.doesNotThrow(
      () => assertEditableOnlyChanges(source, source),
      file + " should keep editable values safe for the admin",
    );
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

test("public documents expose one stable and non-editable profile portrait", async () => {
  const documents = [
    "index.html",
    "resume/index.html",
    "career/index.html",
    "portfolio/index.html",
  ];

  for (const file of documents) {
    const source = await readFile(resolve(repositoryRoot, file), "utf8");
    const portraits = source.match(
      /<img\b[^>]*\bsrc="(?:\.\/|\.\.\/)assets\/profile\.jpg"[^>]*>/gu,
    ) ?? [];

    assert.equal(portraits.length, 1, file + " should expose one profile portrait");
    assert.match(portraits[0], /\balt="서민재 프로필 사진"/u);
    assert.match(portraits[0], /\bwidth="689"/u);
    assert.match(portraits[0], /\bheight="886"/u);
    assert.ok(
      scanEditableRegions(source).every(
        (region) => !region.innerHTML.includes("profile.jpg"),
      ),
      file + " should keep the portrait outside editable content",
    );
  }
});

test("home keeps changing career and public metrics editable", async () => {
  const source = await readFile(resolve(repositoryRoot, "index.html"), "utf8");
  const editableById = new Map(
    scanEditableRegions(source).map((region) => [region.id, region]),
  );

  for (const id of ["home-016", "home-019", "home-022", "home-025"]) {
    assert.equal(editableById.get(id)?.tagName, "time", id + " should remain editable");
  }
  assert.equal(
    editableById.get("home-028")?.tagName,
    "span",
    "the public-data checked date should remain editable",
  );
  for (const id of ["home-029", "home-030", "home-031", "home-032"]) {
    assert.equal(editableById.get(id)?.tagName, "dd", id + " should remain editable");
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
  const list = source.match(/<ul class="resume-plain-list doc-hist"[\s\S]*?<\/ul>/u)?.[0] ?? "";
  const rows = [...list.matchAll(/<li>([\s\S]*?)<\/li>/gu)];

  assert.equal(rows.length, 4, "expected four semantic career rows");
  for (const [, row] of rows) {
    const period = row.indexOf("<time");
    const employer = row.indexOf("<b>");
    const role = row.indexOf("<span>");
    assert.ok(period >= 0 && period < employer && employer < role);
  }
});

test("career employer headings keep the Rallit company, team and period", async () => {
  const source = await readFile(resolve(repositoryRoot, "career/index.html"), "utf8");
  const headings = scanEditableRegions(source)
    .filter((region) => region.tagName === "h2")
    .map((region) => visibleText(region.innerHTML));
  const expected = [
    ["유한책임회사웍스피어", "사원 · AI 추천/검색 플랫폼팀", "2025.06"],
    ["(주)토스랩", "Developer · Backend Team", "2024.06 – 2025.04"],
    ["오케스트로주식회사", "Member · Platform Service Dev 6", "2023.09 – 2024.05"],
    ["주식회사즐거운커뮤니케이션즈", "팀원 · 개발2팀", "2022.11 – 2023.02"],
  ];

  for (const parts of expected) {
    assert.ok(
      headings.some((heading) => parts.every((part) => heading.includes(part))),
      "missing employer heading: " + parts.join(" / "),
    );
  }
});

test("portfolio keeps six ordered cases and leads with the JPA correction", async () => {
  const source = await readFile(resolve(repositoryRoot, "portfolio/index.html"), "utf8");
  const orderedIds = ["jpa", "drive", "feed", "event", "codehub", "evidence"];
  const positions = orderedIds.map((id) => source.indexOf('<article class="doc-proj" id="' + id + '"'));

  assert.ok(positions.every((position) => position >= 0), "expected every portfolio case");
  assert.deepEqual(positions, [...positions].sort((left, right) => left - right));
  for (const id of orderedIds) {
    assert.match(source, new RegExp('<a href="#' + id + '">'), "case nav should link #" + id);
  }

  const jpa = source.slice(positions[0], positions[1]);
  assert.match(jpa, /실제 영속성 컨텍스트/u);
  assert.match(jpa, /약 200만/u);
});

test("diagrams are aria-hidden, sourced, and appear next to the numbers they draw", async () => {
  for (const file of ["resume/index.html", "career/index.html", "portfolio/index.html"]) {
    const source = await readFile(resolve(repositoryRoot, file), "utf8");
    const figures = [...source.matchAll(/<div class="viz[^"]*" data-viz="([^"]+)" data-src="([^"]+)">(<svg[\s\S]*?<\/svg>)<\/div>/gu)];

    assert.ok(figures.length > 0, file + " should carry diagrams");
    assert.equal(figures.length, source.match(/data-viz="/gu).length, file + " has a malformed diagram");
    for (const [, id, src, markup] of figures) {
      assert.match(markup, /^<svg [^>]*aria-hidden="true"/u, id + " should be hidden from readers");
      assert.ok(src.length > 8, id + " should name its source");
      assert.doesNotMatch(markup, /<script\b|<foreignObject\b|<image\b|href=/iu, id);
    }
  }
});

test("submission documents follow the wording rules", async () => {
  const allowedHosts = new Set([
    "github.com",
    "velog.io",
    "www.linkedin.com",
    "ch4570-archive.vercel.app",
    "www.w3.org",
  ]);
  for (const file of ["resume/index.html", "career/index.html", "portfolio/index.html"]) {
    const source = await readFile(resolve(repositoryRoot, file), "utf8");
    const body = source.replace(/<head>[\s\S]*?<\/head>/u, "").replace(/<svg[\s\S]*?<\/svg>/gu, "");
    const text = visibleText(body);

    assert.doesNotMatch(text, /약\s*\d+\s*년|\d+\s*년간|\d+\s*년\s*차|\d+\s*년의/u, file + " should not state years of experience");
    assert.doesNotMatch(
      text,
      /(?:MR|PR|커밋|머지)\s*\d+\s*(?:건|개)|(?:개선|제안)\s*\d+\s*건|저장소\s*\d+\s*개|기술 글\s*\d+\s*편|\d+\s*편/u,
      file + " should not state activity counts",
    );
    assert.doesNotMatch(text, /endpoint로 바꿨습니다/u, file + " should not claim the unmerged endpoint switch is done");
    assert.doesNotMatch(text, /(?:승인 흐름|접근 제어)[^.]*?(?:완료했습니다|도입했습니다)/u, file + " should not claim unmerged work is done");
    for (const [, host] of source.matchAll(/https?:\/\/([^/"'\s<>)]+)/gu)) {
      assert.ok(allowedHosts.has(host), file + " links to an unexpected host: " + host);
    }
  }
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
