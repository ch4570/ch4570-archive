#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const canonicalStylesheetLink =
  '<link rel="stylesheet" href="../assets/design-system.css">';
const runtimeScript = '<script src="../assets/site.js" defer></script>';

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

export function buildPdfDocument(sourceHtml, stylesheet) {
  if (!sourceHtml.includes(canonicalStylesheetLink)) {
    throw new Error("The document does not load the canonical design-system stylesheet.");
  }
  if (
    sourceHtml.indexOf(canonicalStylesheetLink) !==
    sourceHtml.lastIndexOf(canonicalStylesheetLink)
  ) {
    throw new Error("The document loads the canonical stylesheet more than once.");
  }
  if (stylesheet.toLowerCase().includes("</style")) {
    throw new Error("The stylesheet cannot be safely embedded in an HTML style element.");
  }

  const embeddedStylesheet = `<style data-pdf-export-style>\n${stylesheet}\n</style>`;

  return expandDetailsElements(sourceHtml)
    .replace(canonicalStylesheetLink, embeddedStylesheet)
    .replace(runtimeScript, "");
}

async function main() {
  const [sourcePath, stylesheetPath, targetPath] = process.argv.slice(2);
  if (!sourcePath || !stylesheetPath || !targetPath) {
    process.stderr.write(
      "Usage: node scripts/prepare-pdf-document.mjs <source-html> <stylesheet> <target-html>\n",
    );
    process.exitCode = 1;
    return;
  }

  const [sourceHtml, stylesheet] = await Promise.all([
    readFile(sourcePath, "utf8"),
    readFile(stylesheetPath, "utf8"),
  ]);
  const preparedHtml = buildPdfDocument(sourceHtml, stylesheet);

  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, preparedHtml, "utf8");
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  await main();
}
