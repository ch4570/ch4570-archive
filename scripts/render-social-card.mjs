#!/usr/bin/env node
// Node 22+ and an existing Chrome installation; no downloaded browser or dependencies.
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = path.join(root, "design/social-card.html");
const destination = path.join(root, "assets/social-card.png");
const candidates = process.env.ARCHIVE_CHROME
  ? [process.env.ARCHIVE_CHROME]
  : [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
    ];
let executable;
for (const candidate of candidates) {
  try {
    await access(candidate);
    executable = candidate;
    break;
  } catch {
    /* Use an installed browser. */
  }
}
if (!executable)
  throw new Error("Set ARCHIVE_CHROME to an installed Chrome executable.");
const profile = await mkdtemp(path.join(tmpdir(), "archive-social-card-"));
const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
const pending = new Map();
let chrome,
  socket,
  sequence = 0;
try {
  chrome = spawn(
    executable,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  let launchError;
  chrome.on("error", (error) => {
    launchError = error;
  });
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (launchError) throw launchError;
    if (chrome.exitCode !== null)
      throw new Error("Chrome exited before its debugging endpoint was ready.");
    try {
      port = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8"))
        .trim()
        .split("\n");
      break;
    } catch {
      await wait(100);
    }
  }
  if (!port) throw new Error("Chrome debugging endpoint did not become ready.");
  socket = new WebSocket(`ws://127.0.0.1:${port[0]}${port[1]}`);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const response = JSON.parse(String(event.data));
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    clearTimeout(request.timer);
    if (response.error) request.reject(new Error(response.error.message));
    else request.resolve(response.result);
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Chrome timed out: ${method}`));
      }, 10000);
      pending.set(id, { resolve, reject, timer });
      socket.send(
        JSON.stringify({
          id,
          method,
          params,
          ...(sessionId ? { sessionId } : {}),
        }),
      );
    });
  const { targetId } = await send("Target.createTarget", {
    url: "about:blank",
  });
  const { sessionId } = await send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  await send(
    "Emulation.setDeviceMetricsOverride",
    { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false },
    sessionId,
  );
  await send(
    "Emulation.setEmulatedMedia",
    { features: [{ name: "prefers-reduced-motion", value: "reduce" }] },
    sessionId,
  );
  await send("Page.navigate", { url: pathToFileURL(source).href }, sessionId);
  const evaluate = (expression) =>
    send("Runtime.evaluate", { expression, returnByValue: true }, sessionId);
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await evaluate(
      'document.querySelector("[data-scene]")?.dataset.renderer === "webgl" && document.fonts.status === "loaded"',
    );
    if (result.result.value === true) {
      ready = true;
      break;
    }
    await wait(100);
  }
  if (!ready)
    throw new Error(
      "The actual WebGL scene did not render; no preview was exported.",
    );
  await send(
    "Runtime.evaluate",
    {
      expression:
        "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
      awaitPromise: true,
    },
    sessionId,
  );
  const { data } = await send(
    "Page.captureScreenshot",
    {
      format: "png",
      clip: { x: 0, y: 0, width: 1200, height: 630, scale: 1 },
      captureBeyondViewport: false,
    },
    sessionId,
  );
  const png = Buffer.from(data, "base64");
  if (png.readUInt32BE(16) !== 1200 || png.readUInt32BE(20) !== 630)
    throw new Error("Unexpected PNG dimensions.");
  await writeFile(destination, png);
  console.log(`Rendered actual WebGL at 1200×630: ${destination}`);
  await send("Browser.close");
} finally {
  socket?.close();
  for (const request of pending.values()) clearTimeout(request.timer);
  if (chrome && chrome.exitCode === null) chrome.kill();
  await wait(200);
  await rm(profile, { recursive: true, force: true });
}
