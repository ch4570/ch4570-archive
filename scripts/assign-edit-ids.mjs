#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const documents = [
  { path: "index.html", prefix: "home" },
  { path: "resume/index.html", prefix: "resume" },
  { path: "career/index.html", prefix: "career" },
  { path: "portfolio/index.html", prefix: "portfolio" },
];

const editableTags = new Set(["h1", "h2", "h3", "h4", "p", "li", "dt", "dd", "time"]);
const voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const lockedClasses = new Set([
  "site-header",
  "case-nav",
  "hero-actions",
  "toast",
  "skip-link",
]);

const findTagEnd = (source, start) => {
  let quote = "";
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === ">") return index;
  }
  throw new Error(`Unclosed HTML tag at byte ${start}`);
};

const parseClasses = (tagSource) => {
  const match = tagSource.match(/\bclass\s*=\s*(["'])(.*?)\1/i);
  return new Set(match ? match[2].split(/\s+/).filter(Boolean) : []);
};

const hasLockedClass = (classes) => [...classes].some((className) => lockedClasses.has(className));

const isEditable = ({ tagName, classes, parent, locked, tagSource }) => {
  if (locked || /\bdata-edit-id\s*=/.test(tagSource)) return false;
  if (editableTags.has(tagName)) return true;
  if (tagName === "div" && classes.has("career-company")) return true;
  if ((tagName === "b" || tagName === "span") && parent?.classes.has("portfolio-profile")) return true;
  return false;
};

const assignIds = (source, prefix) => {
  const existingIds = [...source.matchAll(new RegExp(`data-edit-id=["']${prefix}-(\\d+)["']`, "g"))];
  let nextId = existingIds.reduce((max, match) => Math.max(max, Number(match[1])), 0) + 1;
  const stack = [];
  const chunks = [];
  let cursor = 0;
  let inserted = 0;

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== "<") continue;
    if (source.startsWith("<!--", index)) {
      const commentEnd = source.indexOf("-->", index + 4);
      if (commentEnd < 0) throw new Error(`Unclosed HTML comment at byte ${index}`);
      index = commentEnd + 2;
      continue;
    }

    const end = findTagEnd(source, index);
    const tagSource = source.slice(index, end + 1);
    const closingMatch = tagSource.match(/^<\s*\/\s*([a-zA-Z][\w:-]*)/);
    if (closingMatch) {
      const tagName = closingMatch[1].toLowerCase();
      while (stack.length) {
        const frame = stack.pop();
        if (frame.tagName === tagName) break;
      }
      index = end;
      continue;
    }

    const openingMatch = tagSource.match(/^<\s*([a-zA-Z][\w:-]*)/);
    if (!openingMatch || /^<\s*[!?]/.test(tagSource)) {
      index = end;
      continue;
    }

    const tagName = openingMatch[1].toLowerCase();
    const classes = parseClasses(tagSource);
    const parent = stack.at(-1);
    const locked = Boolean(parent?.locked || hasLockedClass(classes) || tagName === "script" || tagName === "style");
    let renderedTag = tagSource;

    if (isEditable({ tagName, classes, parent, locked, tagSource })) {
      const id = `${prefix}-${String(nextId).padStart(3, "0")}`;
      const insertionPoint = tagSource.endsWith("/>") ? tagSource.length - 2 : tagSource.length - 1;
      renderedTag = `${tagSource.slice(0, insertionPoint)} data-edit-id="${id}"${tagSource.slice(insertionPoint)}`;
      nextId += 1;
      inserted += 1;
    }

    if (renderedTag !== tagSource) {
      chunks.push(source.slice(cursor, index), renderedTag);
      cursor = end + 1;
    }

    const selfClosing = /\/\s*>$/.test(tagSource) || voidTags.has(tagName);
    if (!selfClosing) stack.push({ tagName, classes, locked });
    index = end;
  }

  chunks.push(source.slice(cursor));
  return { source: chunks.join(""), inserted };
};

for (const document of documents) {
  const path = resolve(root, document.path);
  const source = await readFile(path, "utf8");
  const result = assignIds(source, document.prefix);
  if (result.inserted) await writeFile(path, result.source);
  process.stdout.write(`${document.path}: ${result.inserted} edit IDs added\n`);
}
