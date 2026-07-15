export const ALLOWED_INLINE_TAGS = Object.freeze([
  "a",
  "b",
  "strong",
  "em",
  "i",
  "code",
  "br",
  "span",
  "small",
]);

const ALLOWED_INLINE_TAG_SET = new Set(ALLOWED_INLINE_TAGS);
const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);
const RAW_TEXT_ELEMENTS = new Set([
  "iframe",
  "noembed",
  "noframes",
  "script",
  "style",
  "textarea",
  "title",
  "xmp",
]);
const FORBIDDEN_EDITABLE_CONTAINERS = new Set([
  ...RAW_TEXT_ELEMENTS,
  "plaintext",
]);
const GLOBAL_INLINE_ATTRIBUTES = new Set([
  "dir",
  "lang",
  "role",
  "title",
]);
const ANCHOR_ATTRIBUTES = new Set(["href", "rel", "target"]);
const SAFE_HREF_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);
const ATTRIBUTE_ENTITY_VALUES = new Map([
  ["amp", "&"],
  ["apos", "'"],
  ["colon", ":"],
  ["gt", ">"],
  ["lt", "<"],
  ["newline", "\n"],
  ["quot", '"'],
  ["tab", "\t"],
]);
const EDITABLE_MASK = "\u0000EDITABLE_CONTENT\u0000";
const EDITABLE_TIME_DATETIME_MASK = "EDITABLE-TIME-DATETIME";

export class EditableDocumentError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "EditableDocumentError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new EditableDocumentError(code, message, details);
}

function assertString(value, label) {
  if (typeof value !== "string") {
    fail("INVALID_SOURCE", `${label} must be a string.`, {
      receivedType: typeof value,
    });
  }
}

function isWhitespace(character) {
  return /\s/u.test(character);
}

function isTagNameStart(character) {
  return /[A-Za-z]/u.test(character);
}

function isTagNameCharacter(character) {
  return /[A-Za-z0-9:_-]/u.test(character);
}

function scanTagEnd(source, start) {
  let quote = null;

  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];

    if (quote) {
      if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (character === ">") {
      return index + 1;
    }
  }

  fail("MALFORMED_HTML", "An HTML tag is missing its closing angle bracket.", {
    offset: start,
  });
}

function parseStartTag(source, start, end) {
  let cursor = start + 1;

  while (isWhitespace(source[cursor])) {
    cursor += 1;
  }

  const tagNameStart = cursor;
  while (cursor < end && isTagNameCharacter(source[cursor])) {
    cursor += 1;
  }

  const tagName = source.slice(tagNameStart, cursor).toLowerCase();
  const attributes = [];
  let selfClosing = false;

  while (cursor < end - 1) {
    while (isWhitespace(source[cursor])) {
      cursor += 1;
    }

    if (source[cursor] === ">") {
      break;
    }

    if (source[cursor] === "/") {
      selfClosing = true;
      cursor += 1;
      while (isWhitespace(source[cursor])) {
        cursor += 1;
      }
      if (source[cursor] !== ">") {
        fail("MALFORMED_HTML", "Unexpected content after a self-closing slash.", {
          offset: cursor,
          tagName,
        });
      }
      break;
    }

    const nameStart = cursor;
    while (
      cursor < end - 1 &&
      !isWhitespace(source[cursor]) &&
      !["=", ">", "/", '"', "'"].includes(source[cursor])
    ) {
      cursor += 1;
    }

    if (cursor === nameStart) {
      fail("MALFORMED_HTML", "An HTML attribute name is malformed.", {
        offset: cursor,
        tagName,
      });
    }

    const name = source.slice(nameStart, cursor).toLowerCase();
    while (isWhitespace(source[cursor])) {
      cursor += 1;
    }

    let hasValue = false;
    let value = "";
    if (source[cursor] === "=") {
      hasValue = true;
      cursor += 1;
      while (isWhitespace(source[cursor])) {
        cursor += 1;
      }

      const quote = source[cursor];
      if (quote === '"' || quote === "'") {
        cursor += 1;
        const valueStart = cursor;
        while (cursor < end - 1 && source[cursor] !== quote) {
          cursor += 1;
        }
        if (source[cursor] !== quote) {
          fail("MALFORMED_HTML", "An HTML attribute value has an unclosed quote.", {
            attribute: name,
            offset: valueStart,
            tagName,
          });
        }
        value = source.slice(valueStart, cursor);
        cursor += 1;
      } else {
        const valueStart = cursor;
        while (
          cursor < end - 1 &&
          !isWhitespace(source[cursor]) &&
          ![">", "'", '"', "`", "="].includes(source[cursor])
        ) {
          cursor += 1;
        }
        if (cursor === valueStart) {
          fail("MALFORMED_HTML", "An HTML attribute value is missing.", {
            attribute: name,
            offset: cursor,
            tagName,
          });
        }
        value = source.slice(valueStart, cursor);
      }
    }

    attributes.push({ name, value, hasValue });
  }

  return {
    type: "start",
    start,
    end,
    tagName,
    attributes,
    selfClosing,
  };
}

function parseEndTag(source, start, end) {
  let cursor = start + 2;
  const hasLeadingWhitespace = isWhitespace(source[cursor]);
  while (isWhitespace(source[cursor])) {
    cursor += 1;
  }

  const tagNameStart = cursor;
  while (cursor < end && isTagNameCharacter(source[cursor])) {
    cursor += 1;
  }
  const tagName = source.slice(tagNameStart, cursor).toLowerCase();

  while (isWhitespace(source[cursor])) {
    cursor += 1;
  }

  return {
    type: "end",
    start,
    end,
    tagName,
    malformed: hasLeadingWhitespace || !tagName || source[cursor] !== ">",
  };
}

function readMarkupToken(source, start) {
  if (source.startsWith("<!--", start)) {
    const close = source.indexOf("-->", start + 4);
    if (close === -1) {
      fail("MALFORMED_HTML", "An HTML comment is not closed.", { offset: start });
    }
    return { type: "comment", start, end: close + 3 };
  }

  if (source[start + 1] === "!" || source[start + 1] === "?") {
    return {
      type: "declaration",
      start,
      end: scanTagEnd(source, start),
    };
  }

  if (source[start + 1] === "/") {
    const candidateStart = start + 2;
    let cursor = candidateStart;
    while (isWhitespace(source[cursor])) {
      cursor += 1;
    }
    if (!isTagNameStart(source[cursor])) {
      return null;
    }
    const end = scanTagEnd(source, start);
    return parseEndTag(source, start, end);
  }

  if (!isTagNameStart(source[start + 1])) {
    return null;
  }

  const end = scanTagEnd(source, start);
  return parseStartTag(source, start, end);
}

function findRawTextEnd(source, cursor, tagName) {
  const pattern = new RegExp(`</\\s*${tagName}(?=[\\s>])[^>]*>`, "giu");
  pattern.lastIndex = cursor;
  const match = pattern.exec(source);
  return match ? match.index : -1;
}

function* tokenizeHtml(source) {
  let cursor = 0;
  let rawTextTag = null;

  while (cursor < source.length) {
    const tagStart = rawTextTag
      ? findRawTextEnd(source, cursor, rawTextTag)
      : source.indexOf("<", cursor);

    if (tagStart === -1) {
      if (rawTextTag) {
        fail("MALFORMED_HTML", `The <${rawTextTag}> element is not closed.`, {
          offset: cursor,
          tagName: rawTextTag,
        });
      }
      if (cursor < source.length) {
        yield { type: "text", start: cursor, end: source.length };
      }
      return;
    }

    if (tagStart > cursor) {
      yield { type: "text", start: cursor, end: tagStart };
    }

    const token = readMarkupToken(source, tagStart);
    if (!token) {
      yield { type: "text", start: tagStart, end: tagStart + 1 };
      cursor = tagStart + 1;
      continue;
    }

    yield token;
    cursor = token.end;

    if (rawTextTag && token.type === "end" && token.tagName === rawTextTag) {
      rawTextTag = null;
    } else if (
      token.type === "start" &&
      !token.selfClosing &&
      RAW_TEXT_ELEMENTS.has(token.tagName)
    ) {
      rawTextTag = token.tagName;
    }
  }
}

function decodeAttributeEntities(value) {
  return value.replace(
    /&(?:#(\d+)|#x([\da-f]+)|([a-z][\da-z]+));?/giu,
    (entity, decimal, hexadecimal, named) => {
      if (decimal || hexadecimal) {
        const codePoint = Number.parseInt(decimal ?? hexadecimal, decimal ? 10 : 16);
        if (!Number.isFinite(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) {
          return "\ufffd";
        }
        try {
          return String.fromCodePoint(codePoint);
        } catch {
          return "\ufffd";
        }
      }

      return ATTRIBUTE_ENTITY_VALUES.get(named.toLowerCase()) ?? entity;
    },
  );
}

function getEditableId(token) {
  const editableAttributes = token.attributes.filter(
    (attribute) => attribute.name === "data-edit-id",
  );

  if (editableAttributes.length === 0) {
    return null;
  }
  if (editableAttributes.length > 1) {
    fail("DUPLICATE_EDIT_ID_ATTRIBUTE", "An element has more than one data-edit-id attribute.", {
      offset: token.start,
      tagName: token.tagName,
    });
  }

  const attribute = editableAttributes[0];
  const id = attribute.hasValue ? decodeAttributeEntities(attribute.value).trim() : "";
  if (!id) {
    fail("INVALID_EDIT_ID", "data-edit-id must have a non-empty value.", {
      offset: token.start,
      tagName: token.tagName,
    });
  }

  return id;
}

export function scanEditableRegions(source) {
  assertString(source, "HTML source");

  const regions = [];
  const ids = new Map();
  let activeRegion = null;

  for (const token of tokenizeHtml(source)) {
    if (token.type === "start") {
      const id = getEditableId(token);
      if (id !== null) {
        if (activeRegion) {
          fail("NESTED_EDITABLE", `Editable region "${id}" is nested inside "${activeRegion.id}".`, {
            id,
            parentId: activeRegion.id,
            offset: token.start,
          });
        }
        if (ids.has(id)) {
          fail("DUPLICATE_EDIT_ID", `data-edit-id "${id}" is used more than once.`, {
            firstOffset: ids.get(id),
            id,
            offset: token.start,
          });
        }
        if (token.selfClosing || VOID_ELEMENTS.has(token.tagName)) {
          fail("VOID_EDITABLE", `The <${token.tagName}> element cannot carry editable content.`, {
            id,
            offset: token.start,
            tagName: token.tagName,
          });
        }
        if (FORBIDDEN_EDITABLE_CONTAINERS.has(token.tagName)) {
          fail(
            "FORBIDDEN_EDITABLE_CONTAINER",
            `The <${token.tagName}> element cannot be an editable container.`,
            { id, offset: token.start, tagName: token.tagName },
          );
        }

        ids.set(id, token.start);
        activeRegion = {
          id,
          tagName: token.tagName,
          depth: 1,
          startTagStart: token.start,
          startTagEnd: token.end,
          contentStart: token.end,
        };
        continue;
      }

      if (
        activeRegion &&
        token.tagName === activeRegion.tagName &&
        !token.selfClosing &&
        !VOID_ELEMENTS.has(token.tagName)
      ) {
        activeRegion.depth += 1;
      }
      continue;
    }

    if (
      token.type === "end" &&
      activeRegion &&
      token.tagName === activeRegion.tagName
    ) {
      activeRegion.depth -= 1;
      if (activeRegion.depth === 0) {
        regions.push({
          id: activeRegion.id,
          tagName: activeRegion.tagName,
          startTagStart: activeRegion.startTagStart,
          startTagEnd: activeRegion.startTagEnd,
          contentStart: activeRegion.contentStart,
          contentEnd: token.start,
          endTagStart: token.start,
          endTagEnd: token.end,
          innerHTML: source.slice(activeRegion.contentStart, token.start),
        });
        activeRegion = null;
      }
    }
  }

  if (activeRegion) {
    fail("MALFORMED_HTML", `Editable region "${activeRegion.id}" is not closed.`, {
      id: activeRegion.id,
      offset: activeRegion.startTagStart,
      tagName: activeRegion.tagName,
    });
  }

  return regions;
}

export function isSafeHref(href) {
  if (typeof href !== "string") {
    return false;
  }

  const decoded = decodeAttributeEntities(href).trim();
  if (!decoded) {
    return true;
  }

  const normalized = decoded.replace(/[\u0000-\u0020\u007f]+/gu, "");
  const scheme = normalized.match(/^([a-z][a-z\d+.-]*):/iu);
  return !scheme || SAFE_HREF_PROTOCOLS.has(`${scheme[1].toLowerCase()}:`);
}

function validateInlineAttributes(token) {
  const seen = new Set();

  for (const attribute of token.attributes) {
    if (seen.has(attribute.name)) {
      fail("DUPLICATE_ATTRIBUTE", `Attribute "${attribute.name}" is repeated on <${token.tagName}>.`, {
        attribute: attribute.name,
        offset: token.start,
        tagName: token.tagName,
      });
    }
    seen.add(attribute.name);

    if (attribute.name === "style") {
      fail("STYLE_ATTRIBUTE", "Inline style attributes are not allowed in editable content.", {
        offset: token.start,
        tagName: token.tagName,
      });
    }
    if (attribute.name === "class") {
      fail("CLASS_ATTRIBUTE", "CSS classes are not allowed in editable content.", {
        offset: token.start,
        tagName: token.tagName,
      });
    }
    if (attribute.name.startsWith("on")) {
      fail("EVENT_HANDLER_ATTRIBUTE", "Event handler attributes are not allowed in editable content.", {
        attribute: attribute.name,
        offset: token.start,
        tagName: token.tagName,
      });
    }

    const isAriaAttribute = /^aria-[a-z\d-]+$/u.test(attribute.name);
    const isAnchorAttribute = token.tagName === "a" && ANCHOR_ATTRIBUTES.has(attribute.name);
    if (
      !GLOBAL_INLINE_ATTRIBUTES.has(attribute.name) &&
      !isAriaAttribute &&
      !isAnchorAttribute
    ) {
      fail(
        "DISALLOWED_ATTRIBUTE",
        `Attribute "${attribute.name}" is not allowed on <${token.tagName}>.`,
        { attribute: attribute.name, offset: token.start, tagName: token.tagName },
      );
    }

    if (!attribute.hasValue) {
      fail("ATTRIBUTE_VALUE_REQUIRED", `Attribute "${attribute.name}" requires a value.`, {
        attribute: attribute.name,
        offset: token.start,
        tagName: token.tagName,
      });
    }

    if (attribute.name === "href" && !isSafeHref(attribute.value)) {
      fail("UNSAFE_HREF", `The href on <${token.tagName}> uses an unsafe protocol.`, {
        href: attribute.value,
        offset: token.start,
      });
    }

    if (
      attribute.name === "target" &&
      !["_blank", "_parent", "_self", "_top"].includes(attribute.value.toLowerCase())
    ) {
      fail("UNSAFE_TARGET", `The target value "${attribute.value}" is not allowed.`, {
        offset: token.start,
        target: attribute.value,
      });
    }
  }

  const target = token.attributes.find((attribute) => attribute.name === "target")?.value.toLowerCase();
  if (target === "_blank") {
    const rel = token.attributes.find((attribute) => attribute.name === "rel")?.value || "";
    const relations = new Set(rel.toLowerCase().split(/\s+/u).filter(Boolean));
    if (!relations.has("noopener") && !relations.has("noreferrer")) {
      fail("UNSAFE_REL", "Links opened in a new tab require noopener or noreferrer.", {
        offset: token.start,
      });
    }
  }
}

export function validateInlineHtml(fragment) {
  assertString(fragment, "Editable HTML");

  const stack = [];
  for (const token of tokenizeHtml(fragment)) {
    if (token.type === "text") {
      continue;
    }

    if (token.type === "comment" || token.type === "declaration") {
      fail("DISALLOWED_MARKUP", "Comments and declarations are not allowed in editable content.", {
        offset: token.start,
      });
    }

    if (!ALLOWED_INLINE_TAG_SET.has(token.tagName)) {
      fail("DISALLOWED_TAG", `The <${token.tagName}> tag is not allowed in editable content.`, {
        offset: token.start,
        tagName: token.tagName,
      });
    }

    if (token.type === "start") {
      validateInlineAttributes(token);
      if (token.selfClosing && token.tagName !== "br") {
        fail("INVALID_SELF_CLOSING_TAG", `<${token.tagName}> cannot be self-closing in HTML.`, {
          offset: token.start,
          tagName: token.tagName,
        });
      }
      if (token.tagName !== "br") {
        stack.push(token);
      }
      continue;
    }

    if (token.malformed || token.tagName === "br") {
      fail("INVALID_INLINE_HTML", `The closing </${token.tagName || "?"}> tag is invalid.`, {
        offset: token.start,
        tagName: token.tagName,
      });
    }

    const opening = stack.pop();
    if (!opening || opening.tagName !== token.tagName) {
      fail("INVALID_INLINE_HTML", `The closing </${token.tagName}> tag does not match the open tag.`, {
        expectedTagName: opening?.tagName ?? null,
        offset: token.start,
        tagName: token.tagName,
      });
    }
  }

  if (stack.length > 0) {
    const opening = stack.at(-1);
    fail("INVALID_INLINE_HTML", `The <${opening.tagName}> tag is not closed.`, {
      offset: opening.start,
      tagName: opening.tagName,
    });
  }

  return true;
}

function inlineTextContent(fragment) {
  let text = "";
  for (const token of tokenizeHtml(fragment)) {
    if (token.type === "text") {
      text += decodeAttributeEntities(fragment.slice(token.start, token.end));
    } else if (token.type === "start" && token.tagName === "br") {
      text += " ";
    }
  }
  return text.replace(/\s+/gu, " ").trim();
}

export function inferEditableTimeDatetime(fragment) {
  validateInlineHtml(fragment);
  const text = inlineTextContent(fragment);
  const match = text.match(/\b(\d{4})\s*(?:[./-]|년\s*)\s*(\d{1,2})(?:\s*월)?\b/u);
  const month = Number(match?.[2]);
  if (!match || month < 1 || month > 12) {
    fail(
      "INVALID_TIME_VALUE",
      "기간은 2025.06처럼 연도와 월로 시작해야 합니다.",
      { text },
    );
  }
  return `${match[1]}-${String(month).padStart(2, "0")}`;
}

function editableTimeAttribute(source, region) {
  const token = readMarkupToken(source, region.startTagStart);
  const attributes = token?.type === "start"
    ? token.attributes.filter((attribute) => attribute.name === "datetime")
    : [];
  if (attributes.length !== 1 || !attributes[0].hasValue) {
    fail(
      "INVALID_TIME_ATTRIBUTE",
      `Editable time region "${region.id}" must have one datetime attribute.`,
      { id: region.id, offset: region.startTagStart },
    );
  }
  return decodeAttributeEntities(attributes[0].value);
}

function replaceEditableTimeAttributes(source, valueForRegion) {
  const timeRegions = scanEditableRegions(source)
    .filter((region) => region.tagName === "time")
    .sort((left, right) => right.startTagStart - left.startTagStart);
  let result = source;

  for (const region of timeRegions) {
    editableTimeAttribute(source, region);
    const startTag = source.slice(region.startTagStart, region.startTagEnd);
    const replacementValue = valueForRegion(region);
    let attributeMatched = false;
    const replacedStartTag = startTag.replace(
      /(\bdatetime\s*=\s*)(["'])(.*?)\2/iu,
      (match, prefix, quote) => {
        attributeMatched = true;
        return `${prefix}${quote}${replacementValue}${quote}`;
      },
    );
    if (!attributeMatched) {
      fail(
        "INVALID_TIME_ATTRIBUTE",
        `Editable time region "${region.id}" must use a quoted datetime attribute.`,
        { id: region.id, offset: region.startTagStart },
      );
    }
    result =
      result.slice(0, region.startTagStart) +
      replacedStartTag +
      result.slice(region.startTagEnd);
  }
  return result;
}

export function synchronizeEditableTimeDatetimes(source) {
  assertString(source, "HTML source");
  return replaceEditableTimeAttributes(
    source,
    (region) => inferEditableTimeDatetime(region.innerHTML),
  );
}

function assertEditableTimeDatetimes(source, regions) {
  for (const region of regions) {
    if (region.tagName !== "time") continue;
    const expected = inferEditableTimeDatetime(region.innerHTML);
    const actual = editableTimeAttribute(source, region);
    if (actual !== expected) {
      fail(
        "STALE_TIME_ATTRIBUTE",
        `Editable time region "${region.id}" has datetime="${actual}"; expected "${expected}".`,
        { actual, expected, id: region.id },
      );
    }
  }
}

function maskEditableTimeDatetimes(source) {
  return replaceEditableTimeAttributes(source, () => EDITABLE_TIME_DATETIME_MASK);
}

function normalizeReplacements(replacements) {
  if (replacements instanceof Map) {
    return [...replacements.entries()];
  }

  const prototype = replacements && typeof replacements === "object"
    ? Object.getPrototypeOf(replacements)
    : null;
  if (
    replacements &&
    typeof replacements === "object" &&
    !Array.isArray(replacements) &&
    (prototype === Object.prototype || prototype === null)
  ) {
    return Object.entries(replacements);
  }

  fail("INVALID_REPLACEMENTS", "Replacements must be a Map or a plain object.");
}

function replaceRegionContents(source, regions, replacementById) {
  let result = source;
  for (const region of [...regions].sort((left, right) => right.contentStart - left.contentStart)) {
    if (!replacementById.has(region.id)) {
      continue;
    }
    result =
      result.slice(0, region.contentStart) +
      replacementById.get(region.id) +
      result.slice(region.contentEnd);
  }
  return result;
}

export function replaceEditableContents(
  source,
  replacements,
  { requireAll = false } = {},
) {
  assertString(source, "HTML source");
  const regions = scanEditableRegions(source);
  const regionById = new Map(regions.map((region) => [region.id, region]));
  const replacementById = new Map();

  for (const [id, value] of normalizeReplacements(replacements)) {
    if (typeof id !== "string" || !regionById.has(id)) {
      fail("UNKNOWN_EDIT_ID", `No editable region exists for "${String(id)}".`, {
        id,
      });
    }
    if (typeof value !== "string") {
      fail("INVALID_REPLACEMENT", `Replacement for "${id}" must be a string.`, {
        id,
        receivedType: typeof value,
      });
    }
    validateInlineHtml(value);
    replacementById.set(id, value);
  }

  if (requireAll) {
    const missingIds = regions
      .map((region) => region.id)
      .filter((id) => !replacementById.has(id));
    if (missingIds.length > 0) {
      fail("MISSING_REPLACEMENT", "Every editable region must have a replacement.", {
        missingIds,
      });
    }
  }

  return synchronizeEditableTimeDatetimes(
    replaceRegionContents(source, regions, replacementById),
  );
}

export function maskEditableContents(source) {
  assertString(source, "HTML source");
  const regions = scanEditableRegions(source);
  const masks = new Map(regions.map((region) => [region.id, EDITABLE_MASK]));
  return replaceRegionContents(source, regions, masks);
}

function firstDifference(left, right) {
  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    if (left[index] !== right[index]) {
      return index;
    }
  }
  return left.length === right.length ? -1 : sharedLength;
}

function differenceContext(source, offset) {
  const start = Math.max(0, offset - 35);
  const end = Math.min(source.length, offset + 35);
  return source.slice(start, end).replace(/\s+/gu, " ");
}

export function assertEditableOnlyChanges(baselineSource, workingSource) {
  assertString(baselineSource, "Baseline HTML source");
  assertString(workingSource, "Working HTML source");

  const baselineRegions = scanEditableRegions(baselineSource);
  const workingRegions = scanEditableRegions(workingSource);
  for (const region of baselineRegions) {
    validateInlineHtml(region.innerHTML);
  }
  for (const region of workingRegions) {
    validateInlineHtml(region.innerHTML);
  }

  assertEditableTimeDatetimes(baselineSource, baselineRegions);
  assertEditableTimeDatetimes(workingSource, workingRegions);

  const maskedBaseline = maskEditableTimeDatetimes(maskEditableContents(baselineSource));
  const maskedWorking = maskEditableTimeDatetimes(maskEditableContents(workingSource));
  if (maskedBaseline !== maskedWorking) {
    const offset = firstDifference(maskedBaseline, maskedWorking);
    fail(
      "LOCKED_MARKUP_CHANGED",
      "Markup outside data-edit-id contents differs from the baseline.",
      {
        baselineContext: differenceContext(maskedBaseline, offset),
        offset,
        workingContext: differenceContext(maskedWorking, offset),
      },
    );
  }

  const baselineById = new Map(
    baselineRegions.map((region) => [region.id, region.innerHTML]),
  );
  const changedIds = workingRegions
    .filter((region) => baselineById.get(region.id) !== region.innerHTML)
    .map((region) => region.id);

  return {
    changedIds,
    editableIds: workingRegions.map((region) => region.id),
    regions: workingRegions,
  };
}
