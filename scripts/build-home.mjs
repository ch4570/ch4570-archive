#!/usr/bin/env node
// index.html 안의 `<!-- home:begin NAME -->` … `<!-- home:end NAME -->` 구역을 assets/home-data.js에서 다시 쓴다.
//   node scripts/build-home.mjs          구역을 다시 쓴다
//   node scripts/build-home.mjs --check  파일을 바꾸지 않고, 원본과 어긋나면 1로 끝난다
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { REGIONS } from "./home-render.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = resolve(root, "index.html");

export function applyRegions(source) {
  let next = source;
  for (const [name, render] of Object.entries(REGIONS)) {
    const pattern = new RegExp(`(<!-- home:begin ${name} -->)[\\s\\S]*?(<!-- home:end ${name} -->)`);
    if (!pattern.test(next)) throw new Error(`index.html에 'home:begin ${name}' 구역이 없습니다.`);
    next = next.replace(pattern, (_, begin, end) => `${begin}\n${render()}\n${end}`);
  }
  return next;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const current = await readFile(target, "utf8");
  const next = applyRegions(current);
  if (process.argv.includes("--check")) {
    if (next !== current) {
      process.stderr.write("index.html의 생성 구역이 assets/home-data.js와 다릅니다. `npm run build:home`을 실행하세요.\n");
      process.exit(1);
    }
    process.stdout.write("home 생성 구역이 원본과 같습니다.\n");
  } else {
    await writeFile(target, next);
    process.stdout.write(next === current ? "변경 없음\n" : "index.html 구역을 다시 썼습니다.\n");
  }
}
