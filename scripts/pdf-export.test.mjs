import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  applyPrintSafe,
  buildPdfDocument,
  inlineStylesheetUrls,
  loadLinkedStylesheets,
  loadLocalAssetReplacements,
} from "./prepare-pdf-document.mjs";
import { decoInputs } from "./render-resume-deco.mjs";
import {
  hasPoppler,
  inspectResumePdf,
  resumePdfProblems,
} from "./verify-resume-pdf.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const chronologicalCareerColumn = "1fr";
const RESUME_EDIT_FIELDS = 43;

function findExactRuleDeclarations(stylesheet, selector) {
  const withoutComments = stylesheet.replace(/\/\*[\s\S]*?\*\//gu, "");
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const rulePattern = new RegExp(
    String.raw`(?:^|\})[ \t\r\n]*${escapedSelector}[ \t\r\n]*\{([^{}]*)\}`,
    "gu",
  );

  return [...withoutComments.matchAll(rulePattern)].map(([, ruleBody]) =>
    ruleBody
      .split(";")
      .map((declaration) => declaration.trim())
      .filter(Boolean)
      .map((declaration) => {
        const separator = declaration.indexOf(":");
        return separator < 0
          ? { property: declaration, value: "" }
          : {
              property: declaration.slice(0, separator).trim(),
              value: declaration.slice(separator + 1).trim(),
            };
      }),
  );
}

function effectivePropertyValue(declarations, property) {
  return declarations
    .filter((declaration) => declaration.property === property)
    .at(-1)?.value;
}

test("PDF preparation embeds every shared stylesheet the resume links and drops the screen bar", async () => {
  const sourcePath = path.join(projectRoot, "resume/index.html");
  const sourceHtml = await readFile(sourcePath, "utf8");
  const linked = await loadLinkedStylesheets(sourceHtml, sourcePath);

  assert.deepEqual([...linked.keys()], [
    "../assets/site-frame.css",
    "../assets/resume.css",
    "../assets/viz.css",
  ]);

  const preparedHtml = buildPdfDocument(sourceHtml, "", new Map(), linked);

  assert.equal(preparedHtml.match(/<style data-pdf-export-style>/g)?.length, 1);
  for (const css of linked.values()) assert.ok(preparedHtml.includes(css));
  assert.doesNotMatch(preparedHtml, /<link rel="stylesheet"/);
  assert.doesNotMatch(preparedHtml, /<script src="\.\.\/assets\/site\.js"/);
  assert.match(preparedHtml, /data-edit-id="resume-002"/);
});

test("PDF preparation embeds the canonical stylesheet for documents that still use it", () => {
  const sourceHtml = `<!doctype html>
<link rel="stylesheet" href="../assets/design-system.css">
<script src="../assets/site.js" defer></script>
<main data-edit-id="x-001">content</main>`;
  const stylesheet = "body { color: black; }";

  const preparedHtml = buildPdfDocument(sourceHtml, stylesheet);

  assert.match(preparedHtml, /<style data-pdf-export-style>/);
  assert.ok(preparedHtml.includes(stylesheet));
  assert.doesNotMatch(preparedHtml, /<link rel="stylesheet"/);
  assert.doesNotMatch(preparedHtml, /<script src="\.\.\/assets\/site\.js"/);
  assert.match(preparedHtml, /data-edit-id="x-001"/);
});

test("career and portfolio share the terminal stylesheets and need no site script", async () => {
  for (const name of ["career", "portfolio"]) {
    const sourcePath = path.join(projectRoot, name, "index.html");
    const sourceHtml = await readFile(sourcePath, "utf8");
    const linked = await loadLinkedStylesheets(sourceHtml, sourcePath);
    assert.deepEqual([...linked.keys()], [
      "../assets/site-frame.css",
      "../assets/resume.css",
      "../assets/viz.css",
      "../assets/doc.css",
    ]);
    assert.doesNotMatch(sourceHtml, /design-system\.css|assets\/site\.js|<details\b/u);
    assert.match(linked.get("../assets/doc.css"), /@page :first/u);
  }
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
    const sourcePath = path.join(projectRoot, documentPath);
    const sourceHtml = await readFile(sourcePath, "utf8");
    const preparedHtml = buildPdfDocument(
      sourceHtml,
      stylesheet,
      new Map(),
      await loadLinkedStylesheets(sourceHtml, sourcePath),
    );

    assert.equal(
      preparedHtml.match(/<style data-pdf-export-style>/g)?.length,
      1,
      `${documentPath} should contain one embedded print stylesheet`,
    );
  }
});

test("PDF preparation embeds every supported local document image", async () => {
  const sourcePath = path.join(projectRoot, "portfolio/index.html");
  const sourceHtml = await readFile(sourcePath, "utf8");
  const replacements = await loadLocalAssetReplacements(sourceHtml, sourcePath);
  const preparedHtml = buildPdfDocument(
    sourceHtml,
    "",
    replacements,
    await loadLinkedStylesheets(sourceHtml, sourcePath),
  );

  assert.equal(replacements.size, 1);
  assert.match(preparedHtml, /src="data:image\/jpeg;base64,/);
  assert.doesNotMatch(preparedHtml, /\.\.\/assets\/profile\.jpg/);
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

test("previous-career entries keep one chronological column and print dates first", async () => {
  const stylesheet = await readFile(
    path.join(projectRoot, "assets/design-system.css"),
    "utf8",
  );
  const previousCareerRules = findExactRuleDeclarations(
    stylesheet,
    ".career-previous-grid",
  ).filter(
    (declarations) =>
      effectivePropertyValue(declarations, "grid-template-columns") !== undefined,
  );

  assert.equal(previousCareerRules.length, 2, "expected screen and print grid rules");
  for (const declarations of previousCareerRules) {
    assert.equal(
      effectivePropertyValue(declarations, "grid-template-columns"),
      chronologicalCareerColumn,
      "previous-career entries should stay in one chronological column",
    );
  }

  assert.match(
    stylesheet,
    /#previous-experience\s*>\s*\.career-company-head\s*\{[^}]*grid-template-columns:\s*var\(--career-date-rail\)\s+minmax\(0,\s*1fr\)[^}]*\}/su,
    "the print lead period should stay in the left date rail",
  );
  assert.doesNotMatch(
    stylesheet,
    /#worksphere-serving\s+\.career-project:nth-of-type\(\d+\)\s*\{[^}]*(?:break-before:\s*page|page-break-before:\s*always)[^}]*\}/su,
    "Worksphere projects should flow naturally instead of creating a trailing print page",
  );
  assert.match(
    stylesheet,
    /#previous-experience\.career-company-block\s*\{[^}]*padding-top:\s*0[^}]*\}/su,
    "the previous-company sequence should start without redundant print-only whitespace",
  );
});

test("previous-career grid parsing rejects ineffective chronological declarations", () => {
  const invalidRules = [
    "/* grid-template-columns: 1fr; */ grid-template-columns: repeat(2, minmax(0, 1fr));",
    "--x: grid-template-columns: 1fr; grid-template-columns: repeat(2, minmax(0, 1fr));",
    "grid-template-columns: 1fr; grid-template-columns: repeat(2, minmax(0, 1fr));",
    "grid-template-columns: 1fr garbage;",
  ];

  for (const ruleBody of invalidRules) {
    const [declarations] = findExactRuleDeclarations(
      `.career-previous-grid { ${ruleBody} }`,
      ".career-previous-grid",
    );
    assert.notEqual(
      effectivePropertyValue(declarations, "grid-template-columns"),
      chronologicalCareerColumn,
      ruleBody,
    );
  }
});

test("the resume stylesheet's relative font urls become data URIs for PDF export", async () => {
  const sourcePath = path.join(projectRoot, "resume/index.html");
  const sourceHtml = await readFile(sourcePath, "utf8");
  const linked = await loadLinkedStylesheets(sourceHtml, sourcePath);
  const resumeCss = linked.get("../assets/resume.css");

  assert.doesNotMatch(resumeCss, /url\("fonts\//u);
  assert.equal(resumeCss.match(/url\("data:font\/woff2;base64,/gu)?.length, 7);
  assert.match(resumeCss, /font-family: "Pretendard"; font-weight: 400/u);
  assert.doesNotMatch(resumeCss, /font-weight: 500;[^}]*Pretendard/u);

  const inlined = await inlineStylesheetUrls(
    'a{background:url("data:image/svg+xml,%3Csvg%3E")}',
    path.join(projectRoot, "assets/resume.css"),
  );
  assert.equal(inlined, 'a{background:url("data:image/svg+xml,%3Csvg%3E")}');
  await assert.rejects(
    inlineStylesheetUrls('a{src:url("fonts/missing.woff2")}', path.join(projectRoot, "assets/resume.css")),
    /ENOENT/u,
  );
});

test("the print-safe resume swaps decoration images to the light set and adds the class", async () => {
  const sourcePath = path.join(projectRoot, "resume/index.html");
  const sourceHtml = await readFile(sourcePath, "utf8");
  const safe = applyPrintSafe(sourceHtml);

  assert.match(safe, /<html lang="ko" class="deco print-safe">/u);
  assert.doesNotMatch(safe, /resume-deco\/dark\//u);
  assert.equal(safe.match(/resume-deco\/light\/[a-z-]+\.png/gu)?.length, 7);
  assert.equal(applyPrintSafe("<!doctype html><html lang=\"ko\"><body></body></html>").includes('class="print-safe"'), true);

  const replacements = await loadLocalAssetReplacements(safe, sourcePath);
  const prepared = buildPdfDocument(safe, "", replacements, await loadLinkedStylesheets(safe, sourcePath));
  assert.equal(/loading="lazy"/u.test(prepared), false);
  assert.equal(prepared.match(/src="data:image\/png;base64,/gu)?.length, 7);
  assert.equal(/<script/u.test(prepared), false);
});

test("decoration images are fresh for the current CSS, fonts and decoration text", async () => {
  const manifest = JSON.parse(
    await readFile(path.join(projectRoot, "assets/resume-deco/manifest.json"), "utf8"),
  );
  assert.deepEqual(
    manifest.inputs,
    await decoInputs(),
    "resume.css, a font, or a decoration string changed: run `node scripts/render-resume-deco.mjs` (sh scripts/export-pdfs.sh does it too)",
  );
  assert.deepEqual(Object.keys(manifest.inputs.texts).sort(), Object.keys(manifest.sizes).sort());
  for (const key of Object.keys(manifest.sizes)) {
    for (const variant of ["dark", "light"]) {
      const png = await readFile(path.join(projectRoot, "assets/resume-deco", variant, `${key}.png`));
      assert.equal(png.toString("latin1", 1, 4), "PNG");
      const [width, height] = manifest.sizes[key];
      assert.ok(Math.abs(png.readUInt32BE(16) - width * 4) <= 1, `${variant}/${key} width`);
      assert.ok(Math.abs(png.readUInt32BE(20) - height * 4) <= 1, `${variant}/${key} height`);
    }
  }
});

test("resume markup keeps decoration lines out of the reading order", async () => {
  const html = await readFile(path.join(projectRoot, "resume/index.html"), "utf8");

  // 장식 줄은 진짜 글자(화면)와 그림(PDF)이 짝이고 낭독기에서 빠진다.
  const pairs = html.match(/<span class="deco-txt">[\s\S]*?<img class="deco-img" src="[^"]+" alt="" loading="lazy"/gu) ?? [];
  assert.equal(pairs.length, 7);
  assert.match(html, /\(HEAD -&gt; main\)/u);
  assert.doesNotMatch(html, /HEAD -&gt; current/u);
  assert.match(html, /<svg class="band-fill" aria-hidden="true"/u);
  // 편집 필드 51개, 인쇄용 PDF 링크는 화면 전용이며 공통 막대는 그대로다.
  assert.equal(html.match(/data-edit-id="/gu)?.length, RESUME_EDIT_FIELDS);
  assert.match(html, /<div class="resume-tools screen-only">[\s\S]*?href="\.\.\/pdf\/seo-minjae-resume-print\.pdf"[^>]*>인쇄용 PDF<\/a>/u);
  assert.match(html, /<a class="site-bar__pdf" href="\.\.\/pdf\/seo-minjae-resume\.pdf"/u);
});

const poppler = await hasPoppler();
const popplerRequired = Boolean(process.env.CI);

test("poppler is available where CI requires PDF inspection", () => {
  if (popplerRequired) assert.equal(poppler, true, "install poppler-utils in CI");
});

for (const [name, file] of [
  ["dark-band submission", "seo-minjae-resume.pdf"],
  ["print-safe", "seo-minjae-resume-print.pdf"],
]) {
  test(`the ${name} resume PDF is one A4 page with only Pretendard/JetBrains Mono, name first, in reading order`, { skip: !poppler && "poppler not installed" }, async () => {
    const result = await inspectResumePdf(path.join(projectRoot, "output/pdf", file));
    assert.deepEqual(resumePdfProblems(result), [], JSON.stringify(result, null, 1));
    assert.equal(result.pages, 1);
    assert.deepEqual(result.type3Fonts, []);
    assert.equal(result.firstLine, "서민재 Rex Seo");
    assert.deepEqual(result.decorationHits, []);
    assert.deepEqual(result.orderProblems, []);
  });
}

test("the career description and portfolio PDFs keep their page counts", { skip: !poppler && "poppler not installed" }, async () => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
  for (const [file, pages] of [
    ["seo-minjae-career-description.pdf", 3],
    ["seo-minjae-backend-portfolio.pdf", 2],
  ]) {
    const { stdout } = await run("pdfinfo", [path.join(projectRoot, "output/pdf", file)]);
    assert.equal(Number(/^Pages:\s+(\d+)/mu.exec(stdout)[1]), pages, file);
  }
});
