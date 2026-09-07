#!/usr/bin/env node
// Read-only Chrome CDP checks; print snapshots do not generate or replace PDFs.
import { spawn } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const [originArg, outputArg, ...args] = process.argv.slice(2);
if (!originArg || !outputArg || typeof WebSocket === "undefined") {
  console.error(
    "Usage: node scripts/check-documents-browser.mjs <origin> <output-directory> [--baseline-only] [--print-baseline <print.json>]",
  );
  process.exit(2);
}
const origin = new URL(originArg).origin,
  output = path.resolve(outputArg),
  baselineOnly = args.includes("--baseline-only");
const baselineIndex = args.indexOf("--print-baseline"),
  baselinePath = baselineIndex < 0 ? null : args[baselineIndex + 1];
if (baselineIndex >= 0 && !baselinePath)
  throw new Error("--print-baseline needs a snapshot file");
const baseline = baselinePath
  ? JSON.parse(await readFile(baselinePath, "utf8"))
  : null;
const routeFilter =
    args.indexOf("--route") < 0 ? null : args[args.indexOf("--route") + 1],
  widthFilter =
    args.indexOf("--width") < 0
      ? null
      : Number(args[args.indexOf("--width") + 1]);
if (
  (routeFilter && !["resume", "career", "portfolio"].includes(routeFilter)) ||
  (widthFilter && ![1440, 390, 320].includes(widthFilter))
)
  throw new Error("Invalid route or viewport filter");
const routes = routeFilter ? [routeFilter] : ["resume", "career", "portfolio"],
  snapshots = {},
  checks = [],
  screenshots = [],
  exceptions = [],
  pending = new Map();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const contrastRatio = (foreground, background) => {
  const luminance = (color) =>
    color
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map(Number)
      .map((channel) => {
        const value = channel / 255;
        return value <= 0.04045
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4;
      })
      .reduce(
        (sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index],
        0,
      );
  const a = luminance(foreground),
    b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};
const record = (name, pass, observed, scope) =>
  checks.push({ name, status: pass ? "pass" : "fail", scope, observed });
let executable,
  chrome,
  socket,
  sequence = 0,
  browser;
for (const candidate of process.env.ARCHIVE_CHROME
  ? [process.env.ARCHIVE_CHROME]
  : [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
    ]) {
  try {
    await access(candidate);
    executable = candidate;
    break;
  } catch {}
}
if (!executable)
  throw new Error("Installed Chrome required; set ARCHIVE_CHROME.");
await mkdir(output, { recursive: true });
const profile = await mkdtemp(path.join(tmpdir(), "archive-documents-"));
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
  let launchError, debug;
  chrome.on("error", (error) => {
    launchError = error;
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (launchError) throw launchError;
    if (chrome.exitCode !== null)
      throw new Error("Chrome exited during launch");
    try {
      debug = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8"))
        .trim()
        .split("\n");
      break;
    } catch {
      await pause(100);
    }
  }
  if (!debug) throw new Error("Chrome debugger unavailable");
  socket = new WebSocket(`ws://127.0.0.1:${debug[0]}${debug[1]}`);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener(
      "error",
      () => reject(new Error("Chrome socket failed")),
      { once: true },
    );
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown")
      exceptions.push(message.params.exceptionDetails);
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    clearTimeout(entry.timer);
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result);
  });
  const call = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++sequence,
        timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Chrome timeout: ${method}`));
        }, 20000);
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
  browser = (await call("Browser.getVersion")).product;
  const open = async (route, width = 1440, height = 1000) => {
    const { targetId } = await call("Target.createTarget", {
        url: "about:blank",
      }),
      { sessionId } = await call("Target.attachToTarget", {
        targetId,
        flatten: true,
      });
    const page = (method, params) => call(method, params, sessionId),
      evaluate = async (expression) => {
        const result = await page("Runtime.evaluate", {
          expression,
          returnByValue: true,
          awaitPromise: true,
        });
        if (result.exceptionDetails)
          throw new Error(JSON.stringify(result.exceptionDetails));
        return result.result.value;
      };
    await page("Page.enable");
    await page("Runtime.enable");
    await page("Network.enable");
    await page("Network.setCacheDisabled", { cacheDisabled: true });
    await page("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 500,
    });
    await page("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    await page("Page.navigate", { url: `${origin}/${route}/` });
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      ready = await evaluate(
        `document.readyState==='complete'&&!!document.querySelector('main')&&location.pathname==='/${route}/'`,
      );
      if (ready) break;
      await pause(100);
    }
    if (!ready) throw new Error(`${route} did not load`);
    await evaluate("document.fonts.ready.then(()=>true)");
    await pause(200);
    return {
      page,
      evaluate,
      close: () => call("Target.closeTarget", { targetId }),
    };
  };
  const screenshot = async (context, name) => {
    const result = await context.page("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    await writeFile(
      path.join(output, name),
      Buffer.from(result.data, "base64"),
    );
    screenshots.push({ file: name, inspected: false });
  };
  // Capture print first so the baseline exists before any later screen refinements.
  for (const route of routes) {
    const context = await open(route);
    await context.page("Emulation.setEmulatedMedia", {
      media: "print",
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    await context.evaluate("window.dispatchEvent(new Event('beforeprint'))");
    await pause(200);
    snapshots[route] = await context.evaluate(`(() => {
      const selectors='.resume-document,.resume-hero,.resume-achievement-list,.resume-achievement-list li,.career-document,.career-project,.portfolio-hero,.case-study,.case-lede,.story-block p,main h1,main h2,main h3';
      const properties=['display','position','font-family','font-size','font-weight','line-height','letter-spacing','color','background-color','margin-top','margin-right','margin-bottom','margin-left','padding-top','padding-right','padding-bottom','padding-left','border-top-width','border-right-width','border-bottom-width','border-left-width','break-before','break-after','break-inside'];
      return {viewport:{width:innerWidth,height:innerHeight},media:matchMedia('print').matches,elements:[...document.querySelectorAll(selectors)].filter(element=>!element.closest('.screen-only')).map((element,index)=>{const rect=element.getBoundingClientRect(),style=getComputedStyle(element);return {key:element.getAttribute('data-edit-id')||element.id||element.tagName+':'+index,text:element.textContent.trim(),rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},styles:Object.fromEntries(properties.map(property=>[property,style.getPropertyValue(property)]))};})};
    })()`);
    await context.close();
  }
  await writeFile(
    path.join(output, "print.json"),
    JSON.stringify(
      { origin, browser, capturedAt: new Date().toISOString(), snapshots },
      null,
      2,
    ) + "\n",
  );
  console.log(`Print snapshots saved: ${path.join(output, "print.json")}`);
  if (baseline)
    for (const route of routes) {
      const before = baseline.snapshots[route],
        after = snapshots[route],
        differences = [];
      if (!before) differences.push({ error: "Missing baseline route" });
      else {
        if (before.elements.length !== after.elements.length)
          differences.push({
            field: "elementCount",
            before: before.elements.length,
            after: after.elements.length,
          });
        for (
          let index = 0;
          index < Math.min(before.elements.length, after.elements.length);
          index++
        ) {
          const a = before.elements[index],
            b = after.elements[index];
          if (a.key !== b.key || a.text !== b.text)
            differences.push({ key: b.key, field: "identity/text" });
          for (const property of Object.keys(a.rect))
            if (Math.abs(a.rect[property] - b.rect[property]) > 0.1)
              differences.push({
                key: b.key,
                field: property,
                before: a.rect[property],
                after: b.rect[property],
              });
          for (const property of Object.keys(a.styles))
            if (a.styles[property] !== b.styles[property])
              differences.push({
                key: b.key,
                field: property,
                before: a.styles[property],
                after: b.styles[property],
              });
        }
      }
      record(
        "print layout and typography preserved",
        differences.length === 0,
        { comparedElements: after.elements.length, differences },
        route,
      );
    }
  if (!baselineOnly)
    for (const route of routes)
      for (const width of widthFilter ? [widthFilter] : [1440, 390, 320]) {
        const context = await open(route, width, width === 1440 ? 1000 : 844),
          scope = `${route}-${width}`;
        const layout = await context.evaluate(
          `({width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,h1:document.querySelectorAll('h1').length,summary:[...document.querySelectorAll('.resume-hero-copy,.resume-achievement-list li,.career-project p,.career-project li,.hero-copy,.case-lede,.story-block p')].map(element=>({text:element.textContent.trim().slice(0,90),fontSize:parseFloat(getComputedStyle(element).fontSize)}))})`,
        );
        record(
          "no horizontal overflow",
          layout.scrollWidth <= layout.width + 1,
          { width: layout.width, scrollWidth: layout.scrollWidth },
          scope,
        );
        record("one document h1", layout.h1 === 1, { h1: layout.h1 }, scope);
        record(
          "key summaries use at least 16px text",
          layout.summary.length > 0 &&
            layout.summary.every((item) => item.fontSize >= 16),
          layout.summary,
          scope,
        );
        await screenshot(context, `${scope}.png`);
        await context.page("Page.bringToFront");
        for (const type of ["keyDown", "keyUp"])
          await context.page("Input.dispatchKeyEvent", {
            type,
            key: "Tab",
            code: "Tab",
            windowsVirtualKeyCode: 9,
          });
        await pause(150);
        const focused = await context.evaluate(
          `({href:document.activeElement.getAttribute('href'),top:document.activeElement.getBoundingClientRect().top,hasFocus:document.hasFocus(),matchesFocus:document.activeElement.matches(':focus'),color:getComputedStyle(document.activeElement).color,background:getComputedStyle(document.activeElement).backgroundColor})`,
        );
        const focusContrast = contrastRatio(focused.color, focused.background);
        record(
          "focused skip link contrast at least 4.5:1",
          focusContrast >= 4.5,
          {
            color: focused.color,
            background: focused.background,
            ratio: focusContrast,
          },
          scope,
        );
        await screenshot(context, `${scope}-skip-focus.png`);
        for (const type of ["keyDown", "keyUp"])
          await context.page("Input.dispatchKeyEvent", {
            type,
            key: "Enter",
            code: "Enter",
            windowsVirtualKeyCode: 13,
          });
        await pause(100);
        const skip = await context.evaluate(
          `({hash:location.hash,inMain:!!document.activeElement.closest('main')})`,
        );
        record(
          "skip link focuses document main",
          focused.href?.startsWith("#") &&
            focused.top >= 0 &&
            skip.hash === focused.href &&
            skip.inMain,
          { focused, after: skip },
          scope,
        );
        if (width === 1440) {
          const paths = await context.evaluate(
            `(async()=>{const links=[...document.querySelectorAll('.site-header a[href],header.screen-only a[href]')].filter(link=>link.origin===location.origin);return Promise.all([...new Set(links.map(link=>link.href))].map(async url=>{try{const response=await fetch(url,{cache:'no-store'});return{url,status:response.status,type:response.headers.get('content-type')};}catch(error){return{url,error:error.message};}}));})()`,
          );
          record(
            "header navigation and PDF destinations load",
            paths.some((item) => item.url.includes("/pdf/")) &&
              paths.every(
                (item) =>
                  item.status === 200 &&
                  (!item.url.includes("/pdf/") || item.type?.includes("pdf")),
              ),
            paths,
            scope,
          );
        }
        if (route === "portfolio" && width < 500) {
          const contrast = await context.evaluate(`(()=>{
        const rgba=value=>{const numbers=value.match(/[\\d.]+/g)?.map(Number)||[0,0,0];return [...numbers.slice(0,3),numbers[3]??1];};
        const over=(foreground,background)=>foreground.slice(0,3).map((channel,index)=>channel*foreground[3]+background[index]*(1-foreground[3]));
        const luminance=rgb=>rgb.map(channel=>{const value=channel/255;return value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4;}).reduce((sum,value,index)=>sum+value*[0.2126,0.7152,0.0722][index],0);
        return [...document.querySelectorAll('.case-nav a:not([aria-current="true"]),.case-nav a:not([aria-current="true"]) span')].map(element=>{
          const layers=[];for(let current=element;current;current=current.parentElement)layers.unshift(rgba(getComputedStyle(current).backgroundColor));
          const background=layers.reduce((color,layer)=>over(layer,color),[255,255,255]),style=getComputedStyle(element),foreground=over(rgba(style.color),background),a=luminance(foreground),b=luminance(background);
          return{text:element.textContent.trim(),tag:element.tagName,color:style.color,background,fontSize:style.fontSize,ratio:(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)};
        });
      })()`);
          record(
            "inactive case navigation contrast at least 4.5:1",
            contrast.length > 0 && contrast.every((item) => item.ratio >= 4.5),
            contrast,
            scope,
          );
          const targets = await context.evaluate(
              `[...document.querySelectorAll('.case-nav a[href^="#"]')].map(link=>link.getAttribute('href'))`,
            ),
            positions = [];
          for (const hash of targets) {
            await context.evaluate(`location.hash=${JSON.stringify(hash)}`);
            await pause(160);
            positions.push(
              await context.evaluate(
                `(()=>{const element=document.getElementById(${JSON.stringify(hash.slice(1))});if(!element)return{hash:${JSON.stringify(hash)},exists:false};const rect=element.getBoundingClientRect();const overlays=[...document.querySelectorAll('header.screen-only,.site-header,.case-nav')].filter(item=>{const style=getComputedStyle(item),box=item.getBoundingClientRect();return ['fixed','sticky'].includes(style.position)&&box.height>0&&box.bottom>0&&box.top<=(parseFloat(style.top)||0)+1;}).map(item=>item.getBoundingClientRect());return{hash:${JSON.stringify(hash)},exists:true,targetTop:rect.top,headerBottom:Math.max(0,...overlays.map(item=>item.bottom))};})()`,
              ),
            );
          }
          record(
            "case anchors clear sticky navigation",
            positions.length > 0 &&
              positions.every(
                (item) =>
                  item.exists && item.targetTop >= item.headerBottom - 1,
              ),
            positions,
            scope,
          );
          await screenshot(context, `${scope}-case-anchor.png`);
        }
        await context.close();
      }
  record(
    "no uncaught browser JavaScript exceptions",
    exceptions.length === 0,
    exceptions,
    "documents",
  );
} catch (error) {
  record(
    "document verification completed",
    false,
    { error: error.stack || error.message },
    "runtime",
  );
} finally {
  for (const entry of pending.values()) clearTimeout(entry.timer);
  socket?.close();
  if (chrome && chrome.exitCode === null) {
    const exited = new Promise((resolve) => chrome.once("exit", resolve));
    chrome.kill("SIGTERM");
    await Promise.race([exited, pause(2000)]);
    if (chrome.exitCode === null) {
      chrome.kill("SIGKILL");
      await Promise.race([exited, pause(2000)]);
    }
  }
  await rm(profile, { recursive: true, force: true });
  const failed = checks.filter((check) => check.status === "fail");
  await writeFile(
    path.join(output, "browser.json"),
    JSON.stringify(
      {
        origin,
        browser,
        baselineOnly,
        printBaseline: baselinePath,
        checks,
        screenshots,
        limitations: [
          "Screenshots need separate visual inspection.",
          "Print media emulation compares CSS layout and typography; it does not verify generated PDF pagination. Existing PDF files are only fetched.",
          "Viewport emulation does not prove physical-device behavior or complete accessibility conformance.",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        output,
        passed: checks.filter((check) => check.status === "pass").length,
        failed: failed.length,
        failures: failed,
      },
      null,
      2,
    ),
  );
  if (failed.length) process.exitCode = 1;
}
