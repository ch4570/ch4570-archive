import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { readWoff2Cmap } from "./woff2-cmap.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const fontPath = (file) => path.join(projectRoot, "assets/fonts", file);

// KS X 1001 한글 2,350자 = 가(AC00)~힣(D7A3) 가운데 완성형 영역. Pretendard 공식 subset이 이를 담는다.
const ksx1001Hangul = (() => {
  const decoder = new TextDecoder("euc-kr");
  const syllables = [];
  for (let lead = 0xb0; lead <= 0xc8; lead += 1) {
    for (let trail = 0xa1; trail <= 0xfe; trail += 1) {
      const character = decoder.decode(Uint8Array.of(lead, trail));
      if (/^[가-힣]$/u.test(character)) syllables.push(character);
    }
  }
  return syllables;
})();

function visibleResumeText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gu, " ")
    .replace(/<style[\s\S]*?<\/style>/gu, " ")
    .replace(/<head[\s\S]*?<\/head>/u, " ")
    .replace(/placeholder="([^"]*)"/gu, " $1 ")
    .replace(/<[^>]+>/gu, " ")
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&");
}

test("Pretendard subset keeps all 2,350 KS X 1001 Hangul syllables", async () => {
  assert.equal(ksx1001Hangul.length, 2350);
  for (const weight of ["Regular", "SemiBold", "Bold", "ExtraBold"]) {
    const codePoints = await readWoff2Cmap(fontPath(`Pretendard-${weight}.woff2`));
    const missing = ksx1001Hangul.filter((character) => !codePoints.has(character.codePointAt(0)));
    assert.deepEqual(missing, [], `Pretendard-${weight} is missing KS X 1001 syllables`);
  }
});

test("every character on the resume page comes out in Pretendard or JetBrains Mono, never a fallback font", async () => {
  const html = await readFile(path.join(projectRoot, "resume/index.html"), "utf8");
  const text = visibleResumeText(html);
  const supported = new Set();
  for (const file of [
    "Pretendard-Regular.woff2",
    "Pretendard-SemiBold.woff2",
    "Pretendard-Bold.woff2",
    "Pretendard-ExtraBold.woff2",
    "JetBrainsMono-Regular.woff2",
    "JetBrainsMono-Medium.woff2",
    "JetBrainsMono-Bold.woff2",
  ]) {
    for (const codePoint of await readWoff2Cmap(fontPath(file))) supported.add(codePoint);
  }

  const missing = new Set();
  for (const character of text) {
    if (/\s/u.test(character)) continue;
    if (!supported.has(character.codePointAt(0))) missing.add(character);
  }
  assert.deepEqual([...missing], [], "characters outside both font files would fall back to a system font");

  // 굵기별로도 확인한다: Regular에 없는 글자가 SemiBold 등에만 있으면 굵기에 따라 대체 글꼴이 섞인다.
  const regular = await readWoff2Cmap(fontPath("Pretendard-Regular.woff2"));
  const bold = await readWoff2Cmap(fontPath("Pretendard-Bold.woff2"));
  const onlyOne = [...text].filter(
    (character) => !/\s/u.test(character) && regular.has(character.codePointAt(0)) !== bold.has(character.codePointAt(0)),
  );
  assert.deepEqual(onlyOne, []);
});
