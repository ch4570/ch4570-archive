#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// PDF에는 화면용 스크립트를 싣지 않는다(site.js, 이력서 grep 줄의 resume-terminal.js).
const runtimeScriptPattern =
  /[ \t]*<script src="\.\.\/assets\/(?:site|resume-terminal)\.js" defer><\/script>[ \t]*\n?/gu;

function findTagEnd(html, start) {
  let quote = "";

  for (let index = start; index < html.length; index += 1) {
    const character = html[index];
    if (quote) {
      if (character === quote) quote = "";
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index;
    }
  }

  return -1;
}

function hasAttribute(openingTag, tagNameEnd, attributeName) {
  let cursor = tagNameEnd;

  while (cursor < openingTag.length - 1) {
    while (/\s/.test(openingTag[cursor])) cursor += 1;
    if (openingTag[cursor] === "/" || openingTag[cursor] === ">") break;

    const nameStart = cursor;
    while (!/[\s=/>]/.test(openingTag[cursor])) cursor += 1;
    const name = openingTag.slice(nameStart, cursor).toLowerCase();
    if (name === attributeName) return true;

    while (/\s/.test(openingTag[cursor])) cursor += 1;
    if (openingTag[cursor] !== "=") continue;

    cursor += 1;
    while (/\s/.test(openingTag[cursor])) cursor += 1;
    const quote = openingTag[cursor];
    if (quote === '"' || quote === "'") {
      cursor += 1;
      while (cursor < openingTag.length && openingTag[cursor] !== quote) cursor += 1;
      cursor += 1;
    } else {
      while (!/[\s>]/.test(openingTag[cursor])) cursor += 1;
    }
  }

  return false;
}

function expandDetailsElements(sourceHtml) {
  const insertions = [];
  let cursor = 0;

  while (cursor < sourceHtml.length) {
    const tagStart = sourceHtml.indexOf("<", cursor);
    if (tagStart === -1) break;
    if (sourceHtml.startsWith("<!--", tagStart)) {
      const commentEnd = sourceHtml.indexOf("-->", tagStart + 4);
      cursor = commentEnd === -1 ? sourceHtml.length : commentEnd + 3;
      continue;
    }

    const tagEnd = findTagEnd(sourceHtml, tagStart + 1);
    if (tagEnd === -1) break;

    let nameStart = tagStart + 1;
    while (/\s/.test(sourceHtml[nameStart])) nameStart += 1;
    const isClosingTag = sourceHtml[nameStart] === "/";
    if (isClosingTag) nameStart += 1;

    let nameEnd = nameStart;
    while (/[A-Za-z0-9-]/.test(sourceHtml[nameEnd])) nameEnd += 1;
    const tagName = sourceHtml.slice(nameStart, nameEnd).toLowerCase();

    if (tagName === "details" && !isClosingTag) {
      const openingTag = sourceHtml.slice(tagStart, tagEnd + 1);
      const relativeNameEnd = nameEnd - tagStart;
      if (!hasAttribute(openingTag, relativeNameEnd, "open")) {
        let insertionPoint = tagEnd;
        let beforeEnd = tagEnd - 1;
        while (/\s/.test(sourceHtml[beforeEnd])) beforeEnd -= 1;
        if (sourceHtml[beforeEnd] === "/") insertionPoint = beforeEnd;
        insertions.push(insertionPoint);
      }
    }

    cursor = tagEnd + 1;
  }

  let expandedHtml = sourceHtml;
  for (let index = insertions.length - 1; index >= 0; index -= 1) {
    const insertionPoint = insertions[index];
    expandedHtml = `${expandedHtml.slice(0, insertionPoint)} open${expandedHtml.slice(insertionPoint)}`;
  }
  return expandedHtml;
}

const imageMimeTypes = new Map([
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

export async function loadLocalAssetReplacements(sourceHtml, sourcePath) {
  const replacements = new Map();
  const sourceDirectory = path.dirname(path.resolve(sourcePath));
  const imageSourcePattern =
    /\bsrc=(["'])([^"'<>]+\.(?:jpe?g|png|svg|webp))\1/giu;

  for (const match of sourceHtml.matchAll(imageSourcePattern)) {
    const source = match[2];
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/iu.test(source)) continue;

    const mimeType = imageMimeTypes.get(path.extname(source).toLowerCase());
    if (!mimeType) continue;

    const image = await readFile(path.resolve(sourceDirectory, source));
    replacements.set(source, `data:${mimeType};base64,${image.toString("base64")}`);
  }

  return replacements;
}

const cssUrlMimeTypes = new Map([
  ...imageMimeTypes,
  [".woff2", "font/woff2"],
]);
const cssUrlPattern = /url\(\s*(["']?)([^"')]+)\1\s*\)/gu;

/**
 * 공통 CSS를 HTML 안에 넣으면 CSS 파일 기준의 상대 경로 url()이 깨진다.
 * data:·절대 경로·외부 주소가 아닌 url()은 CSS 파일 위치에서 읽어 data URI로 바꾼다.
 */
export async function inlineStylesheetUrls(css, stylesheetPath) {
  const stylesheetDirectory = path.dirname(path.resolve(stylesheetPath));
  const replacements = new Map();

  for (const match of css.matchAll(cssUrlPattern)) {
    const reference = match[2];
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/iu.test(reference)) continue;
    if (replacements.has(reference)) continue;

    const mimeType = cssUrlMimeTypes.get(path.extname(reference).toLowerCase());
    if (!mimeType) {
      throw new Error(`Cannot inline ${reference} from ${stylesheetPath}: unsupported file type.`);
    }
    const file = await readFile(path.resolve(stylesheetDirectory, reference));
    replacements.set(reference, `data:${mimeType};base64,${file.toString("base64")}`);
  }

  return css.replace(cssUrlPattern, (whole, quote, reference) =>
    replacements.has(reference) ? `url("${replacements.get(reference)}")` : whole,
  );
}

const htmlOpeningTagPattern = /<html\b([^>]*)>/iu;

/**
 * 인쇄 안전판(흰 머리)용으로 소스 HTML을 바꾼다. html에 print-safe 클래스를 더하고
 * 장식 줄 그림을 어두운 띠용(dark)에서 흰 바탕용(light)으로 바꾼다.
 */
export function applyPrintSafe(sourceHtml) {
  const match = htmlOpeningTagPattern.exec(sourceHtml);
  if (!match) throw new Error("The document has no <html> element.");
  const attributes = match[1];
  const classAttribute = /\sclass=(["'])([^"']*)\1/iu.exec(attributes);
  const nextAttributes = classAttribute
    ? attributes.replace(classAttribute[0], ` class=${classAttribute[1]}${classAttribute[2]} print-safe${classAttribute[1]}`)
    : `${attributes} class="print-safe"`;
  return (
    sourceHtml.slice(0, match.index) +
    `<html${nextAttributes}>` +
    sourceHtml.slice(match.index + match[0].length)
  ).replaceAll("/resume-deco/dark/", "/resume-deco/light/");
}

const sharedStylesheetPattern =
  /[ \t]*<link rel="stylesheet" href="(\.\.\/assets\/[A-Za-z0-9_-]+\.css)">[ \t]*\n?/gu;
const canonicalStylesheetHref = "../assets/design-system.css";

function findSharedStylesheetLinks(sourceHtml) {
  return [...sourceHtml.matchAll(sharedStylesheetPattern)].map((match) => ({
    markup: match[0],
    href: match[1],
    index: match.index,
  }));
}

/** 문서가 링크한 공통 CSS(design-system.css 외)를 읽어 href → 내용 표로 돌려준다. */
export async function loadLinkedStylesheets(sourceHtml, sourcePath) {
  const sourceDirectory = path.dirname(path.resolve(sourcePath));
  const linked = new Map();

  for (const { href } of findSharedStylesheetLinks(sourceHtml)) {
    if (href === canonicalStylesheetHref || linked.has(href)) continue;
    const stylesheetPath = path.resolve(sourceDirectory, href);
    linked.set(href, await inlineStylesheetUrls(await readFile(stylesheetPath, "utf8"), stylesheetPath));
  }

  return linked;
}

export function buildPdfDocument(
  sourceHtml,
  stylesheet,
  assetReplacements = new Map(),
  linkedStylesheets = new Map(),
) {
  const links = findSharedStylesheetLinks(sourceHtml);
  if (links.length === 0) {
    throw new Error(
      "The document does not load the canonical design-system stylesheet or a shared local stylesheet.",
    );
  }

  const seen = new Set();
  const cssParts = [];
  for (const { href } of links) {
    if (seen.has(href)) {
      throw new Error(
        href === canonicalStylesheetHref
          ? "The document loads the canonical stylesheet more than once."
          : `The document loads ${href} more than once.`,
      );
    }
    seen.add(href);

    const css = href === canonicalStylesheetHref ? stylesheet : linkedStylesheets.get(href);
    if (css === undefined) {
      throw new Error(`No stylesheet content was supplied for ${href}.`);
    }
    if (css.toLowerCase().includes("</style")) {
      throw new Error("The stylesheet cannot be safely embedded in an HTML style element.");
    }
    cssParts.push(css);
  }

  const embeddedStylesheet = `<style data-pdf-export-style>\n${cssParts.join("\n")}\n</style>`;

  let preparedHtml = expandDetailsElements(sourceHtml);
  for (const [source, replacement] of assetReplacements) {
    preparedHtml = preparedHtml.replaceAll(source, replacement);
  }

  // 인쇄 직전에 지연 로딩 그림을 기다리지 않도록 즉시 로딩으로 둔다.
  preparedHtml = preparedHtml.replaceAll(' loading="lazy"', "");

  let first = true;
  return preparedHtml
    .replace(sharedStylesheetPattern, () => {
      if (!first) return "";
      first = false;
      return embeddedStylesheet;
    })
    .replace(runtimeScriptPattern, "");
}

async function main() {
  const [sourcePath, stylesheetPath, targetPath, ...flags] = process.argv.slice(2);
  const printSafe = flags.includes("--print-safe");
  if (!sourcePath || !stylesheetPath || !targetPath || flags.some((flag) => flag !== "--print-safe")) {
    process.stderr.write(
      "Usage: node scripts/prepare-pdf-document.mjs <source-html> <stylesheet> <target-html> [--print-safe]\n",
    );
    process.exitCode = 1;
    return;
  }

  const [rawHtml, stylesheet] = await Promise.all([
    readFile(sourcePath, "utf8"),
    readFile(stylesheetPath, "utf8"),
  ]);
  const sourceHtml = printSafe ? applyPrintSafe(rawHtml) : rawHtml;
  const assetReplacements = await loadLocalAssetReplacements(sourceHtml, sourcePath);
  const linkedStylesheets = await loadLinkedStylesheets(sourceHtml, sourcePath);
  const preparedHtml = buildPdfDocument(
    sourceHtml,
    stylesheet,
    assetReplacements,
    linkedStylesheets,
  );

  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, preparedHtml, "utf8");
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  await main();
}
