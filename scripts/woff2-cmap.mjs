// woff2 글꼴이 가진 글자(cmap) 목록을 읽는다. 외부 도구 없이 Node 내장 Brotli만 쓴다.
// subset 글꼴이 이력서의 모든 글자를 갖는지 검사하는 데 쓴다(scripts/resume-fonts.test.mjs).
import { readFile } from "node:fs/promises";
import { brotliDecompressSync } from "node:zlib";

// WOFF2 사양의 알려진 테이블 이름 순서(플래그 0~62).
const knownTags = [
  "cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca", "prep",
  "CFF ", "VORG", "EBDT", "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE",
  "GDEF", "GPOS", "GSUB", "EBSC", "JSTF", "MATH", "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt",
  "avar", "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar", "gvar", "hsty", "just", "lcar",
  "mort", "morx", "opbd", "prop", "trak", "Zapf", "Silf", "Glat", "Gloc", "Feat", "Sill",
];

function readBase128(buffer, offset) {
  let value = 0;
  for (let index = 0; index < 5; index += 1) {
    const byte = buffer[offset + index];
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) return { value, next: offset + index + 1 };
  }
  throw new Error("Invalid UIntBase128 in woff2 table directory");
}

export function parseWoff2Cmap(buffer) {
  if (buffer.toString("latin1", 0, 4) !== "wOF2") throw new Error("Not a woff2 file");
  const tableCount = buffer.readUInt16BE(12);
  const compressedLength = buffer.readUInt32BE(20);
  let offset = 48;
  const tables = [];
  for (let index = 0; index < tableCount; index += 1) {
    const flags = buffer[offset];
    offset += 1;
    const tagIndex = flags & 0x3f;
    const transformVersion = flags >> 6;
    let tag;
    if (tagIndex === 63) {
      tag = buffer.toString("latin1", offset, offset + 4);
      offset += 4;
    } else {
      tag = knownTags[tagIndex];
    }
    const original = readBase128(buffer, offset);
    offset = original.next;
    // glyf·loca는 버전 0이 변환(transformLength 있음), 그 밖의 테이블은 버전 0이 무변환이다.
    const transformed = tag === "glyf" || tag === "loca" ? transformVersion === 0 : transformVersion !== 0;
    let length = original.value;
    if (transformed) {
      const transform = readBase128(buffer, offset);
      offset = transform.next;
      length = transform.value;
    }
    tables.push({ tag, length });
  }

  const data = brotliDecompressSync(buffer.subarray(offset, offset + compressedLength));
  let position = 0;
  let cmap;
  for (const table of tables) {
    if (table.tag === "cmap") cmap = data.subarray(position, position + table.length);
    position += table.length;
  }
  if (!cmap) throw new Error("woff2 has no cmap table");

  const codePoints = new Set();
  const recordCount = cmap.readUInt16BE(2);
  for (let index = 0; index < recordCount; index += 1) {
    const subtable = cmap.readUInt32BE(4 + index * 8 + 4);
    const format = cmap.readUInt16BE(subtable);
    if (format === 4) {
      const segCount = cmap.readUInt16BE(subtable + 6) / 2;
      const endCodes = subtable + 14;
      const startCodes = endCodes + segCount * 2 + 2;
      const idDeltas = startCodes + segCount * 2;
      const rangeOffsets = idDeltas + segCount * 2;
      for (let segment = 0; segment < segCount; segment += 1) {
        const end = cmap.readUInt16BE(endCodes + segment * 2);
        const start = cmap.readUInt16BE(startCodes + segment * 2);
        const delta = cmap.readInt16BE(idDeltas + segment * 2);
        const rangeOffset = cmap.readUInt16BE(rangeOffsets + segment * 2);
        for (let code = start; code <= end && code !== 0xffff; code += 1) {
          let glyph;
          if (rangeOffset === 0) glyph = (code + delta) & 0xffff;
          else {
            const address = rangeOffsets + segment * 2 + rangeOffset + (code - start) * 2;
            glyph = cmap.readUInt16BE(address);
            if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
          }
          if (glyph !== 0) codePoints.add(code);
        }
      }
    } else if (format === 12) {
      const groups = cmap.readUInt32BE(subtable + 12);
      for (let group = 0; group < groups; group += 1) {
        const base = subtable + 16 + group * 12;
        const start = cmap.readUInt32BE(base);
        const end = cmap.readUInt32BE(base + 4);
        const glyph = cmap.readUInt32BE(base + 8);
        for (let code = start; code <= end; code += 1) if (glyph + (code - start) !== 0) codePoints.add(code);
      }
    }
  }
  return codePoints;
}

export async function readWoff2Cmap(file) {
  return parseWoff2Cmap(await readFile(file));
}
