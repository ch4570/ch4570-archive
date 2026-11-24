#!/usr/bin/env node
// 이력서 PDF(어두운 띠 제출판·흰 머리 인쇄 안전판)의 제출 조건을 poppler로 확인한다.
// scripts/export-pdfs.sh가 내보낸 직후에 부르고, scripts/pdf-export.test.mjs도 같은 함수를 쓴다.
//
// 사용법: node scripts/verify-resume-pdf.mjs <pdf> [<pdf> ...]
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

// 글자 추출이 따라야 하는 순서: 이름 → 직무 → 소개 → 연락처 → 경력 → 기술 → 오픈소스 → 학력.
export const resumeReadingOrder = [
  "서민재",
  "백엔드 엔지니어 · Java, Kotlin, Spring",
  "멈춘 자리에서",
  "ckdekrn88@gmail.com",
  "웍스피어(유)",
  "Kafka 내부 이벤트",
  "배치·정합성",
  "아카이브 테이블",
  "검색 소스",
  "토스랩",
  "Mock 테스트로는",
  "오케스트로",
  "즐거운",
  "Java, Kotlin, Spring Boot",
  "Spring 오픈소스",
  "한국방송통신대학교",
];

// 화면에서는 글자이지만 PDF에서는 그림이어야 하는 장식 줄의 조각. PDF 글자에는 0번 나와야 한다.
export const decorationTokens = [
  "ch4570@archive",
  "resume$",
  "~/resume",
  "zsh",
  "cat profile",
  "cat stack",
  "cat oss",
  "cat activity",
  "git log",
  "HEAD",
];

const allowedFontPattern = /^(?:[A-Z]{6}\+)?(?:Pretendard|JetBrainsMono)(?:[-\w]*)$/u;

export async function hasPoppler() {
  try {
    await run("pdftotext", ["-v"]);
    await run("pdffonts", ["-v"]);
    await run("pdfinfo", ["-v"]);
    return true;
  } catch {
    return false;
  }
}

export async function inspectResumePdf(pdfPath) {
  const [{ stdout: info }, { stdout: fonts }, { stdout: raw }, { stdout: layout }] =
    await Promise.all([
      run("pdfinfo", [pdfPath]),
      run("pdffonts", [pdfPath]),
      run("pdftotext", ["-raw", pdfPath, "-"], { maxBuffer: 20 * 1024 * 1024 }),
      run("pdftotext", [pdfPath, "-"], { maxBuffer: 20 * 1024 * 1024 }),
    ]);

  const pages = Number(/^Pages:\s+(\d+)/mu.exec(info)?.[1]);
  const pageSize = /^Page size:\s+(.+)$/mu.exec(info)?.[1] ?? "";
  const fontRows = fonts
    .split("\n")
    .slice(2)
    .filter(Boolean)
    .map((line) => {
      const columns = line.trim().split(/\s+/u);
      return { line, name: columns[0], type3: /\bType 3\b/u.test(line) };
    });
  const firstLine = raw.split("\n").find((line) => line.trim() !== "")?.trim() ?? "";

  const orderProblems = [];
  for (const [mode, text] of [["raw", raw], ["layout", layout]]) {
    const positions = resumeReadingOrder.map((marker) => ({ marker, index: text.indexOf(marker) }));
    const missing = positions.filter((item) => item.index < 0).map((item) => item.marker);
    const actual = positions
      .filter((item) => item.index >= 0)
      .sort((a, b) => a.index - b.index)
      .map((item) => item.marker);
    const expected = resumeReadingOrder.filter((marker) => !missing.includes(marker));
    if (missing.length) orderProblems.push(`${mode}: missing ${missing.join(" | ")}`);
    else if (actual.join("\n") !== expected.join("\n")) orderProblems.push(`${mode}: ${actual.join(" > ")}`);
  }

  const decorationHits = decorationTokens
    .map((token) => ({ token, count: raw.split(token).length - 1 }))
    .filter((item) => item.count > 0);

  return {
    pages,
    pageSize,
    a4: /\(A4\)/u.test(pageSize),
    fonts: fontRows.map((row) => row.name),
    type3Fonts: [...new Set(fontRows.filter((row) => row.type3).map((row) => row.name))],
    foreignFonts: [...new Set(fontRows.filter((row) => !allowedFontPattern.test(row.name)).map((row) => row.name))],
    unembeddedFonts: fontRows.filter((row) => !/\byes\s+(?:yes|no)\s+(?:yes|no)\s+\d+\s+\d+\s*$/u.test(row.line)).map((row) => row.name),
    firstLine,
    orderProblems,
    decorationHits,
  };
}

export function resumePdfProblems(result, { pages = 1 } = {}) {
  const problems = [];
  if (result.pages !== pages) problems.push(`${result.pages} pages; expected ${pages}`);
  if (!result.a4) problems.push(`page size is not A4: ${result.pageSize}`);
  if (result.fonts.length === 0) problems.push("no fonts found");
  if (result.type3Fonts.length) problems.push(`Type 3 fonts: ${result.type3Fonts.join(", ")}`);
  if (result.foreignFonts.length) {
    problems.push(`fonts other than Pretendard/JetBrains Mono (a character is missing from the subset?): ${result.foreignFonts.join(", ")}`);
  }
  if (result.unembeddedFonts.length) problems.push(`fonts not embedded: ${result.unembeddedFonts.join(", ")}`);
  if (result.firstLine !== "서민재 Rex Seo") problems.push(`first extracted line is "${result.firstLine}"; expected "서민재 Rex Seo"`);
  for (const problem of result.orderProblems) problems.push(`reading order ${problem}`);
  for (const hit of result.decorationHits) problems.push(`decoration text "${hit.token}" appears ${hit.count}x in the PDF text`);
  return problems;
}

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    process.stderr.write("Usage: node scripts/verify-resume-pdf.mjs <pdf> [<pdf> ...]\n");
    process.exitCode = 2;
    return;
  }
  if (!(await hasPoppler())) {
    process.stderr.write("pdftotext/pdffonts/pdfinfo (poppler) are required to verify the resume PDF.\n");
    process.exitCode = 2;
    return;
  }
  let failed = false;
  for (const file of files) {
    const problems = resumePdfProblems(await inspectResumePdf(file));
    if (problems.length) {
      failed = true;
      process.stderr.write(`Resume PDF validation failed: ${path.basename(file)}\n  - ${problems.join("\n  - ")}\n`);
    } else {
      process.stdout.write(`Resume PDF checks passed: ${path.basename(file)}\n`);
    }
  }
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
