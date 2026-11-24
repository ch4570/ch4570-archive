#!/usr/bin/env node
// 이력서 장식 줄(창 제목·프롬프트·절 명령 줄·HEAD 표시)을 4배 해상도 투명 PNG로 다시 찍는다.
//
// 왜: Chrome은 SVG 글자도 PDF 글자로 남긴다. 장식 줄이 글자로 남으면 글자 추출(ATS) 첫 줄이
// 이름이 아니라 창 제목·프롬프트가 된다. 그래서 PDF에서만 같은 모양의 그림을 끼운다.
// 화면에서는 진짜 글자(선택·복사 가능)이고 그림은 쓰지 않는다(assets/resume.css의 .deco-img).
//
// 글꼴·색·명령 문구·크기가 바뀌면 그림이 어긋나므로 scripts/export-pdfs.sh가 내보내기 직전에
// 이 스크립트를 먼저 돌린다. 새 의존성 없이 Node 내장 fetch·WebSocket으로 Chrome DevTools를 쓴다.
//
// 사용법: node scripts/render-resume-deco.mjs            (PNG와 manifest를 다시 만든다)
//        BROWSER_BIN=/path/to/chrome node scripts/render-resume-deco.mjs
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { inflateSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const decoRoot = path.join(projectRoot, "assets/resume-deco");
const resumeUrl = pathToFileURL(path.join(projectRoot, "resume/index.html")).href;

// 장식 그림 파일이 낡았는지 알아내는 입력(CSS·글꼴 파일·장식 글자). 테스트가 같은 계산을 쓴다.
export const decoVariants = [
  { name: "dark", classes: [] },
  { name: "light", classes: ["print-safe"] },
];
export const printWidth = 794; // A4 210mm를 CSS px로(96dpi)
export const scale = 4;

export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function decoInputs() {
  const [css, html] = await Promise.all([
    readFile(path.join(projectRoot, "assets/resume.css")),
    readFile(path.join(projectRoot, "resume/index.html"), "utf8"),
  ]);
  const fontFiles = [
    "Pretendard-Regular.woff2",
    "Pretendard-SemiBold.woff2",
    "Pretendard-Bold.woff2",
    "Pretendard-ExtraBold.woff2",
    "JetBrainsMono-Regular.woff2",
    "JetBrainsMono-Medium.woff2",
    "JetBrainsMono-Bold.woff2",
  ];
  const fonts = {};
  for (const file of fontFiles) {
    fonts[file] = sha256(await readFile(path.join(projectRoot, "assets/fonts", file)));
  }
  const texts = {};
  const decoPattern =
    /<span class="deco-txt">([\s\S]*?)<\/span>(?:<\/span>)?<img class="deco-img" src="[^"]*\/([a-z-]+)\.png"/gu;
  for (const [, inner, key] of html.matchAll(decoPattern)) {
    texts[key] = inner.replace(/<[^>]+>/gu, "").replaceAll("&gt;", ">").replaceAll("&lt;", "<");
  }
  return { css: sha256(css), fonts, texts };
}

async function findBrowser() {
  const candidates = process.env.BROWSER_BIN
    ? [process.env.BROWSER_BIN]
    : [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
      ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {}
  }
  throw new Error("Chrome or Chromium was not found. Set BROWSER_BIN to the browser executable.");
}

/** 8비트 RGBA PNG의 왼쪽 위 픽셀이 완전히 투명한지 본다(첫 줄 첫 픽셀은 필터와 상관없이 원래 값이다). */
export function hasTransparentCorner(png) {
  if (png.readUInt8(24) !== 8 || png.readUInt8(25) !== 6) return false;
  const chunks = [];
  for (let offset = 8; offset < png.length; ) {
    const length = png.readUInt32BE(offset);
    if (png.toString("latin1", offset + 4, offset + 8) === "IDAT") chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const scanline = inflateSync(Buffer.concat(chunks)); // [필터, R, G, B, A, ...]
  return scanline.readUInt8(4) === 0;
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const executable = await findBrowser();
  const profile = await mkdtemp(path.join(tmpdir(), "resume-deco-"));
  const chrome = spawn(
    executable,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-extensions",
      "--hide-scrollbars",
      "--force-color-profile=srgb",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  let socket;
  const pending = new Map();
  let sequence = 0;

  try {
    let debug;
    for (let attempt = 0; attempt < 100 && !debug; attempt++) {
      if (chrome.exitCode !== null) throw new Error("Chrome exited during launch");
      try {
        debug = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).trim().split("\n");
      } catch {
        await pause(100);
      }
    }
    if (!debug) throw new Error("Chrome debugger unavailable");

    // 처음 열려 있는 about:blank 쪽의 디버거에 바로 붙는다.
    let pageSocketUrl;
    for (let attempt = 0; attempt < 50 && !pageSocketUrl; attempt++) {
      try {
        const targets = await (await fetch(`http://127.0.0.1:${debug[0]}/json/list`)).json();
        pageSocketUrl = targets.find((target) => target.type === "page")?.webSocketDebuggerUrl;
      } catch {}
      if (!pageSocketUrl) await pause(100);
    }
    if (!pageSocketUrl) throw new Error("Chrome page target unavailable");

    socket = new WebSocket(pageSocketUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", () => reject(new Error("Chrome socket failed")), { once: true });
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.error) entry.reject(new Error(`${entry.method}: ${message.error.message}`));
      else entry.resolve(message.result);
    });
    const call = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Chrome timeout: ${method}`));
        }, 30000);
        pending.set(id, { resolve, reject, timer, method });
        socket.send(JSON.stringify({ id, method, params }));
      });

    const page = call;
    const evaluate = async (expression) => {
      const result = await page("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };

    await page("Page.enable");
    await page("Emulation.setDeviceMetricsOverride", {
      width: printWidth,
      height: 1300,
      deviceScaleFactor: scale,
      mobile: false,
    });
    await page("Emulation.setEmulatedMedia", { media: "print" });

    const sizes = {};
    for (const variant of decoVariants) {
      await page("Page.navigate", { url: resumeUrl });
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await evaluate("document.readyState === 'complete' && !!document.querySelector('.deco-txt')")) break;
        await pause(100);
      }
      // 장식 그림이 아닌 글자를 보이게 하고(캡처용) 흰 종이·띠 바탕은 지워 글자만 투명 바탕에 찍는다.
      // 바탕을 지우는 선택자는 머리 띠·창 제목줄·종이·명령 줄 상자를 이름으로 지정한다. 장식 줄 뒤에
      // 새 배경 상자를 더하면 여기에도 더해야 한다(안 더하면 아래 알파 채널 검사가 실패한다).
      await evaluate(`(() => {
        const root = document.documentElement;
        root.classList.remove("deco");
        for (const name of ${JSON.stringify(variant.classes)}) root.classList.add(name);
        const style = document.createElement("style");
        style.textContent = ".band-fill{display:none!important}html:root,html:root body.resume-doc,html:root .resume-head,html:root .term-titlebar,.resume-canvas,.resume-sheet,.resume-head,.term-titlebar,.resume-body,.cmdline,.cmd{background:transparent!important;border-color:transparent!important;box-shadow:none!important}";
        document.head.appendChild(style);
        return document.fonts.ready.then(() => true);
      })()`);
      await page("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
      await pause(300);

      // 쓰인 글꼴이 정말 저장소 글꼴로 그려졌는지 확인한다(대체 글꼴이면 그림이 어긋난다).
      const faces = await evaluate(`(() => [...document.fonts].filter((face) => face.status === "loaded").map((face) => face.family.replaceAll('"', '') + " " + face.weight))()`);
      for (const needed of ["JetBrains Mono 400", "JetBrains Mono 700", "JetBrains Mono 500"]) {
        if (!faces.includes(needed)) throw new Error(`Font face not loaded for decoration capture: ${needed} (loaded: ${faces.join(", ")})`);
      }

      const boxes = await evaluate(`[...document.querySelectorAll(".deco-txt")].map((text) => {
        const image = text.nextElementSibling;
        const key = image.getAttribute("src").split("/").pop().replace(".png", "");
        const isTitle = !!text.closest(".term-title");
        const host = isTitle ? text.closest(".term-title") : text.parentElement;
        const textBox = text.getBoundingClientRect();
        const hostBox = host.getBoundingClientRect();
        return {
          key,
          x: isTitle ? hostBox.left : textBox.left,
          y: hostBox.top + scrollY,
          width: isTitle ? hostBox.width : textBox.width,
          height: hostBox.height,
        };
      })`);
      if (boxes.length === 0) throw new Error("No .deco-txt elements found in resume/index.html");

      await mkdir(path.join(decoRoot, variant.name), { recursive: true });
      for (const box of boxes) {
        const shot = await page("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: true,
          clip: { x: box.x, y: box.y, width: box.width, height: box.height, scale: 1 },
        });
        const png = Buffer.from(shot.data, "base64");
        if (!hasTransparentCorner(png)) {
          throw new Error(`${variant.name}/${box.key}.png is not transparent; the page background was not cleared, so it would cover the PDF band.`);
        }
        await writeFile(path.join(decoRoot, variant.name, `${box.key}.png`), png);
        sizes[box.key] = [Math.round(box.width * 100) / 100, Math.round(box.height * 100) / 100];
      }
    }

    const manifest = {
      note: "scripts/render-resume-deco.mjs가 만든다. 직접 고치지 않는다. inputs가 현재 resume.css·글꼴·장식 글자와 다르면 그림이 낡은 것이다.",
      scale,
      printWidth,
      inputs: await decoInputs(),
      sizes,
    };
    await writeFile(path.join(decoRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    process.stdout.write(`Rendered ${Object.keys(sizes).length * decoVariants.length} resume decoration images.\n`);
  } finally {
    for (const entry of pending.values()) clearTimeout(entry.timer);
    socket?.close();
    if (chrome.exitCode === null) {
      const exited = new Promise((resolve) => chrome.once("exit", resolve));
      chrome.kill("SIGTERM");
      await Promise.race([exited, pause(3000)]);
      if (chrome.exitCode === null) {
        chrome.kill("SIGKILL");
        await Promise.race([exited, pause(2000)]);
      }
    }
    // Chrome이 종료하면서 프로필 폴더에 파일을 쓰는 중이면 지우기가 실패할 수 있어 몇 번 다시 시도한다.
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
