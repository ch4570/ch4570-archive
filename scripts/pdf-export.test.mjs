import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  buildPdfDocument,
  loadSvgAssetReplacements,
} from "./prepare-pdf-document.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");

test("PDF preparation embeds the canonical stylesheet and removes runtime-only assets", async () => {
  const [sourceHtml, stylesheet] = await Promise.all([
    readFile(path.join(projectRoot, "resume/index.html"), "utf8"),
    readFile(path.join(projectRoot, "assets/design-system.css"), "utf8"),
  ]);

  const preparedHtml = buildPdfDocument(sourceHtml, stylesheet);

  assert.match(preparedHtml, /<style data-pdf-export-style>/);
  assert.ok(preparedHtml.includes(stylesheet));
  assert.doesNotMatch(preparedHtml, /<link rel="stylesheet"/);
  assert.doesNotMatch(preparedHtml, /<script src="\.\.\/assets\/site\.js"/);
  assert.match(preparedHtml, /data-edit-id="resume-001"/);
});

test("all submission documents use the same export-safe asset contract", async () => {
  const stylesheet = await readFile(
    path.join(projectRoot, "assets/design-system.css"),
    "utf8",
  );
  const documentPaths = [
    "resume/index.html",
    "career/index.html",
    "portfolio/index.html",
  ];

  for (const documentPath of documentPaths) {
    const sourceHtml = await readFile(path.join(projectRoot, documentPath), "utf8");
    const preparedHtml = buildPdfDocument(sourceHtml, stylesheet);

    assert.equal(
      preparedHtml.match(/<style data-pdf-export-style>/g)?.length,
      1,
      `${documentPath} should contain one embedded print stylesheet`,
    );
  }
});

test("PDF preparation expands every printable disclosure without site JavaScript", async () => {
  const [sourceHtml, stylesheet] = await Promise.all([
    readFile(path.join(projectRoot, "portfolio/index.html"), "utf8"),
    readFile(path.join(projectRoot, "assets/design-system.css"), "utf8"),
  ]);

  const preparedHtml = buildPdfDocument(sourceHtml, stylesheet);
  const detailElements = preparedHtml.match(/<details\b[^>]*>/g) ?? [];

  assert.ok(detailElements.length > 0);
  assert.ok(
    detailElements.every((element) => /\sopen(?:\s|>)/.test(element)),
    "every disclosure should be open before Chrome starts printing",
  );
});

test("PDF preparation embeds local Archify SVG assets", async () => {
  const sourcePath = path.join(projectRoot, "portfolio/index.html");
  const [sourceHtml, stylesheet] = await Promise.all([
    readFile(sourcePath, "utf8"),
    readFile(path.join(projectRoot, "assets/design-system.css"), "utf8"),
  ]);
  const replacements = await loadSvgAssetReplacements(sourceHtml, sourcePath);
  const preparedHtml = buildPdfDocument(sourceHtml, stylesheet, replacements);

  assert.equal(replacements.size, 1);
  assert.match(preparedHtml, /src="data:image\/svg\+xml;base64,/);
  assert.doesNotMatch(preparedHtml, /\.\.\/assets\/diagrams\/feed-serving\.svg/);
});

test("PDF preparation handles quoted delimiters and similarly named attributes", () => {
  const sourceHtml = `<!doctype html>
<link rel="stylesheet" href="../assets/design-system.css">
<details data-state="open"><summary>one</summary></details>
<details aria-label="a > b"><summary>two</summary></details>
<DETAILS OPEN><summary>three</summary></DETAILS>
<script src="../assets/site.js" defer></script>`;

  const preparedHtml = buildPdfDocument(sourceHtml, "body { color: black; }");

  assert.match(preparedHtml, /<details data-state="open" open>/);
  assert.match(preparedHtml, /<details aria-label="a > b" open>/);
  assert.match(preparedHtml, /<DETAILS OPEN>/);
  assert.doesNotMatch(preparedHtml, /<DETAILS OPEN\s+open>/);
});

test("PDF preparation rejects ambiguous or unsafe stylesheet inputs", () => {
  const validDocument = `<!doctype html>
<link rel="stylesheet" href="../assets/design-system.css">
<main>content</main>`;

  assert.throws(
    () => buildPdfDocument("<!doctype html><main>content</main>", "body {}"),
    /does not load the canonical design-system stylesheet/,
  );
  assert.throws(
    () =>
      buildPdfDocument(
        `${validDocument}\n<link rel="stylesheet" href="../assets/design-system.css">`,
        "body {}",
      ),
    /loads the canonical stylesheet more than once/,
  );
  assert.throws(
    () => buildPdfDocument(validDocument, "body::after { content: '</style>'; }"),
    /cannot be safely embedded/,
  );
});

test("print styles preserve color and do not inherit screen breakpoints", async () => {
  const stylesheet = await readFile(
    path.join(projectRoot, "assets/design-system.css"),
    "utf8",
  );

  assert.match(stylesheet, /@media screen and \(max-width: 1000px\)/);
  assert.match(stylesheet, /@media screen and \(max-width: 900px\)/);
  assert.match(stylesheet, /@media screen and \(max-width: 700px\)/);
  assert.match(stylesheet, /@media screen and \(max-width: 420px\)/);
  assert.match(stylesheet, /-webkit-print-color-adjust:\s*exact/);
  assert.match(stylesheet, /print-color-adjust:\s*exact/);
});
