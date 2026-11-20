#!/usr/bin/env node
// Read-only home résumé journeys using an existing Chrome installation and Node 22+.
// Screenshots are evidence to inspect separately, not automatic visual approval.
import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const [originArg, outputArg, ...extra] = process.argv.slice(2);
if (!originArg || !outputArg || extra.length || typeof WebSocket === "undefined") {
  console.error("Usage: node scripts/check-home-browser.mjs <http(s)-origin> <evidence-directory> (Node 22+ and installed Chrome)");
  process.exit(2);
}
const requested = new URL(originArg);
if (!["http:", "https:"].includes(requested.protocol)) throw new Error("An HTTP(S) origin is required.");
const origin = requested.origin;
const output = path.resolve(outputArg);
const requireKoreanFont = process.env.ARCHIVE_REQUIRE_KOREAN_FONT === "1";
let renderedHeadingFonts = [];
const chromePaths = process.env.ARCHIVE_CHROME ? [process.env.ARCHIVE_CHROME] : [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
];
let executable;
for (const candidate of chromePaths) {
  try { await access(candidate); executable = candidate; break; } catch { /* Try installed browsers only. */ }
}
if (!executable) throw new Error("Chrome unavailable; set ARCHIVE_CHROME. No browser checks ran.");
await mkdir(output, { recursive: true });
const profile = await mkdtemp(path.join(tmpdir(), "archive-home-browser-"));
const downloadDirectory = path.join(profile, "downloads");
await mkdir(downloadDirectory);
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const pending = new Map();
const downloads = new Map();
const checks = [], screenshots = [], exceptions = [], responses = [], networkFailures = [];
let chrome, socket, browser, sequence = 0;
const record = (name, pass, observed, scope = "home") => checks.push({ name, scope, status: pass ? "pass" : "fail", observed });
const until = async (inspect, accept, description, milliseconds = 10000) => {
  const deadline = Date.now() + milliseconds;
  let value;
  do {
    value = await inspect();
    if (accept(value)) return value;
    await pause(100);
  } while (Date.now() < deadline);
  throw new Error(`${description}: ${JSON.stringify(value)}`);
};

try {
  chrome = spawn(executable, [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "about:blank",
  ], { stdio: "ignore" });
  let launchError;
  chrome.on("error", (error) => { launchError = error; });
  const debug = await until(async () => {
    if (launchError) throw launchError;
    if (chrome.exitCode !== null) throw new Error("Chrome exited before its debugging endpoint was ready.");
    try { return (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).trim().split("\n"); }
    catch { return undefined; }
  }, Boolean, "Chrome debugging endpoint unavailable");
  socket = new WebSocket(`ws://127.0.0.1:${debug[0]}${debug[1]}`);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Chrome connection timed out")), 10000);
    socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Cannot connect to Chrome")); }, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") exceptions.push({ sessionId: message.sessionId, ...message.params.exceptionDetails });
    if (message.method === "Network.responseReceived") {
      const response = message.params.response;
      if (response.url.startsWith(origin + "/")) responses.push({ url: response.url, status: response.status, type: message.params.type });
    }
    if (message.method === "Network.loadingFailed" && !message.params.canceled) networkFailures.push({ sessionId: message.sessionId, ...message.params });
    if (message.method === "Browser.downloadWillBegin" || message.method === "Browser.downloadProgress") {
      downloads.set(message.params.guid, { ...downloads.get(message.params.guid), ...message.params });
    }
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    clearTimeout(entry.timer);
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result);
  });
  const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Chrome timeout: ${method}`)); }, 20000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  browser = await call("Browser.getVersion");
  await call("Browser.setDownloadBehavior", { behavior: "allowAndName", downloadPath: downloadDirectory, eventsEnabled: true });

  const openPage = async ({ width = 1440, height = 1000, mobile = false, reduced = false, javascript = true, fragment = "" } = {}) => {
    const { targetId } = await call("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await call("Target.attachToTarget", { targetId, flatten: true });
    const page = (method, params) => call(method, params, sessionId);
    const evaluate = async (expression) => {
      const result = await page("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    await page("Page.enable");
    await page("Runtime.enable");
    await page("Network.enable");
    await page("Network.setCacheDisabled", { cacheDisabled: true });
    await page("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
    await page("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" }] });
    if (!javascript) await page("Emulation.setScriptExecutionDisabled", { value: true });
    await page("Page.navigate", { url: origin + "/" + fragment });
    await until(() => evaluate(`location.origin === ${JSON.stringify(origin)} && document.readyState === 'complete' && !!document.querySelector('main')`), Boolean, "Home did not finish loading");
    await evaluate("document.fonts.ready.then(() => true)");
    await evaluate("Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished)).then(() => true)");
    await pause(300);
    return { page, evaluate, width, height, close: () => call("Target.closeTarget", { targetId }) };
  };
  const screenshot = async (context, file, fullPage = false) => {
    await context.page("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
    const params = { format: "png", captureBeyondViewport: fullPage };
    if (fullPage) {
      const dimensions = await context.evaluate("({height:document.documentElement.scrollHeight,viewport:innerHeight})");
      for (let top = 0; top < dimensions.height; top += dimensions.viewport * 0.8) {
        await context.evaluate(`window.scrollTo({top:${Math.round(top)},behavior:'instant'})`);
        await pause(60);
      }
      await context.evaluate("window.scrollTo({top:0,behavior:'instant'})");
      await pause(250);
      const { cssContentSize } = await context.page("Page.getLayoutMetrics");
      params.clip = { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 };
    }
    const result = await context.page("Page.captureScreenshot", params);
    await writeFile(path.join(output, file), Buffer.from(result.data, "base64"));
    screenshots.push({ file, inspected: false, fullPage });
  };
  const click = async (context, selector, index = 0) => {
    const point = await context.evaluate(`(() => {
      const element=document.querySelectorAll(${JSON.stringify(selector)})[${index}];
      if(!element || element.disabled) return null;
      element.scrollIntoView({block:'center',behavior:'instant'});
      const rect=element.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2,hit=document.elementFromPoint(x,y);
      return rect.width>0 && rect.height>0 && (hit===element || element.contains(hit)) ? {x,y} : null;
    })()`);
    if (!point) throw new Error(`Control is not pointer-accessible: ${selector} [${index}]`);
    for (const type of ["mousePressed", "mouseReleased"]) await context.page("Input.dispatchMouseEvent", { type, button: "left", clickCount: 1, ...point });
  };
  const key = async (context, value) => {
    const keys = { Tab: 9, Enter: 13, Home: 36, End: 35, ArrowDown: 40, ArrowUp: 38, ArrowRight: 39, ArrowLeft: 37 };
    for (const type of ["keyDown", "keyUp"]) await context.page("Input.dispatchKeyEvent", {
      type, key: value, code: value, windowsVirtualKeyCode: keys[value],
      ...(value === "Enter" && type === "keyDown" ? { text: "\r", unmodifiedText: "\r" } : {}),
    });
    await pause(180);
  };
  const layout = async (context, scope) => {
    const observed = await context.evaluate(`(() => {
      const visible=element=>{const r=element.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(element).visibility!=='hidden';};
      return {width:innerWidth,expectedWidth:${context.width},scrollWidth:document.documentElement.scrollWidth,
        brokenImages:[...document.images].filter(image=>{const rect=image.getBoundingClientRect();return visible(image)&&rect.bottom>0&&rect.top<innerHeight&&(!image.complete||!image.naturalWidth);}).map(image=>image.currentSrc),
        overflowingText:[...document.querySelectorAll('h1,h2,h3,p,li,nav a,button')].filter(element=>visible(element)&&!element.closest('[aria-hidden=true]')).flatMap(element=>{const r=element.getBoundingClientRect();return r.left < -1 || r.right > ${context.width}+1 ? [{text:element.textContent.trim().slice(0,100),left:r.left,right:r.right}] : [];})};
    })()`);
    record("no horizontal overflow or broken visible images", observed.width <= observed.expectedWidth + 1 && observed.scrollWidth <= observed.expectedWidth + 1 && !observed.brokenImages.length && !observed.overflowingText.length, observed, scope);
  };

  const contrast = async (context, scope) => {
    const samples = await context.evaluate(`(() => {
      const rgba=value=>{const values=value.match(/[\\d.]+/g)?.map(Number)||[0,0,0];return [...values.slice(0,3),values[3]??1];};
      const over=(foreground,background)=>foreground.slice(0,3).map((channel,index)=>channel*foreground[3]+background[index]*(1-foreground[3]));
      const luminance=rgb=>rgb.map(channel=>{const value=channel/255;return value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4;}).reduce((sum,value,index)=>sum+value*[0.2126,0.7152,0.0722][index],0);
      const selector='main h1,main h2,main h3,main h4,main p,main li,main dt,main dd,main a,main summary,main button,.site-header a';
      return [...document.querySelectorAll(selector)].filter(element=>element.getBoundingClientRect().height>0&&element.textContent.trim()).map(element=>{
        const layers=[];let opacity=1;
        for(let current=element;current;current=current.parentElement){const style=getComputedStyle(current);layers.unshift(rgba(style.backgroundColor));opacity*=Number(style.opacity);}
        const background=layers.reduce((color,layer)=>over(layer,color),[15,18,20]),style=getComputedStyle(element),textColor=rgba(style.color);
        textColor[3]*=opacity;
        const foreground=over(textColor,background),a=luminance(foreground),b=luminance(background),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05),size=parseFloat(style.fontSize),weight=parseInt(style.fontWeight,10),minimum=size>=24||(size>=18.66&&weight>=700)?3:4.5;
        return {tag:element.tagName.toLowerCase(),className:element.className,text:element.textContent.trim().slice(0,60),ratio:Number(ratio.toFixed(2)),minimum};
      });
    })()`);
    const failures = samples.filter(sample => sample.ratio < sample.minimum);
    record("visible text meets WCAG AA contrast", samples.length > 50 && failures.length === 0, { sampled: samples.length, failures }, scope);
  };
  const firstViewport = (context) => context.evaluate(`(() => {
    const inView=element=>{if(!element)return false;const r=element.getBoundingClientRect();return r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight;};
    return {name:inView(document.querySelector('h1')),email:inView(document.querySelector('.facts a[href^="mailto:"]')),company:inView(document.querySelector('.facts dd')),highlights:[...document.querySelectorAll('.highlights li')].filter(inView).length,pdf:inView(document.querySelector('.site-header a[download]'))};
  })()`);
  const contentState = (context) => context.evaluate(`(() => {
    const visible=element=>!!element&&element.getBoundingClientRect().height>0&&getComputedStyle(element).visibility!=='hidden';
    return {heading:document.querySelector('h1')?.textContent.replace(/\\s+/g,' ').trim(),portraitLoaded:!!document.querySelector('.facts img')?.naturalWidth,
      projects:[...document.querySelectorAll('.project')].map(project=>({id:project.id||null,visible:visible(project)})),
      companies:[...document.querySelectorAll('.company h3')].map(heading=>heading.textContent.trim()),
      sectionHeadings:[...document.querySelectorAll('main section h2')].map(heading=>({text:heading.textContent.trim(),visible:visible(heading)})),
      decorative:document.querySelectorAll('.planet-navigator,.world-sphere,.stellar-backdrop,.hero-art,[data-explorer]').length};
  })()`);
  const contentComplete = (state) => state.heading?.includes("서민재") && state.projects.length >= 10 && state.projects.every(project => project.visible) && state.companies.length === 4 && state.sectionHeadings.length >= 6 && state.sectionHeadings.every(heading => heading.visible) && state.decorative === 0;
  const headerCheck = async (context, scope) => {
    const observed = await context.evaluate(`(() => [...document.querySelectorAll('.site-header nav a,.site-header a[download]')].map(element=>{
      const r=element.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);
      return {text:element.textContent.trim(),download:element.hasAttribute('download'),height:r.height,inViewport:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,unobscured:hit===element||element.contains(hit)};
    }))()`);
    record("header navigation and résumé PDF remain visible and pointer-accessible", observed.some(entry => entry.download) && observed.filter(entry => !entry.download).length >= 3 && observed.every(entry => entry.height >= 24 && entry.inViewport && entry.unobscured), observed, scope);
    const before = new Set(downloads.keys());
    await click(context, ".site-header a[download]");
    const download = await until(async () => [...downloads.values()].find(item => !before.has(item.guid) && item.state === "completed"), Boolean, "Header PDF download did not complete");
    const file = await readFile(path.join(downloadDirectory, download.guid));
    record("header PDF click downloads a PDF", file.subarray(0, 5).toString() === "%PDF-" && download.receivedBytes > 0, { filename: download.suggestedFilename, bytes: file.length }, scope);
  };

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844, mobile: true }, { width: 320, height: 640, mobile: true }]) {
    const scope = `${viewport.width}`;
    const context = await openPage(viewport);
    const state = await contentState(context);
    record("every career project is readable without interaction and no decorative universe remains", contentComplete(state) && state.portraitLoaded, state, scope);
    await layout(context, scope);
    if (viewport.width === 1440) {
      const above = await firstViewport(context);
      record("first viewport shows name, current company, email, highlights, and PDF", above.name && above.email && above.company && above.highlights >= 3 && above.pdf, above, scope);
      await context.page("DOM.enable");
      await context.page("CSS.enable");
      const { root } = await context.page("DOM.getDocument");
      const { nodeId } = await context.page("DOM.querySelector", { nodeId: root.nodeId, selector: "#career-title" });
      const { fonts } = await context.page("CSS.getPlatformFontsForNode", { nodeId });
      renderedHeadingFonts = fonts;
      if (requireKoreanFont) record("Korean heading is rendered with a Korean-capable font", fonts.some(font => /Pretendard|Noto.*CJK/i.test(font.familyName) && font.glyphCount > 0), { fonts }, scope);
      await contrast(context, scope);
      await headerCheck(context, scope);
      await screenshot(context, "home-1440.png");
      await screenshot(context, "home-1440-full.png", true);
    } else if (viewport.width === 390) {
      const above = await firstViewport(context);
      record("mobile first viewport shows name and highlights", above.name && above.highlights >= 1 && above.pdf, above, scope);
      await headerCheck(context, scope);
      await screenshot(context, "home-390.png");
      await screenshot(context, "home-390-full.png", true);
    } else {
      await screenshot(context, `home-${viewport.width}-full.png`, true);
    }
    await context.close();
  }

  const interactive = await openPage({ width: 1440, height: 900 });
  await key(interactive, "Tab");
  record("first Tab reaches the skip link", await interactive.evaluate("document.activeElement.classList.contains('skip-link')"), await interactive.evaluate("document.activeElement.outerHTML.slice(0,80)"), "keyboard");
  await click(interactive, ".diagram summary");
  await until(() => interactive.evaluate("(() => {const image=document.querySelector('.diagram img');return document.querySelector('.diagram').open&&image.complete&&image.naturalWidth>0;})()"), Boolean, "Feed diagram did not open and load");
  const diagram = await interactive.evaluate("(() => {const region=document.querySelector('.diagram [role=region]');return {label:region.getAttribute('aria-label'),tabindex:region.tabIndex,caption:document.querySelector('.diagram figcaption').textContent.trim()};})()");
  record("feed diagram opens on demand with a text caption and focusable scroll region", diagram.tabindex === 0 && diagram.label && diagram.caption.length > 20, diagram, "interaction");
  await click(interactive, "[data-copy-email]");
  const toast = await until(() => interactive.evaluate("document.querySelector('.toast').textContent.trim()"), Boolean, "Copy email feedback did not appear");
  record("copy email button gives visible feedback", toast.includes("ckdekrn88@gmail.com") || toast.includes("복사"), toast, "interaction");
  await interactive.close();

  const reduced = await openPage({ width: 390, height: 844, mobile: true, reduced: true });
  const motion = await reduced.evaluate(`({reduced:matchMedia('(prefers-reduced-motion:reduce)').matches,scrollBehavior:getComputedStyle(document.documentElement).scrollBehavior,animations:document.getAnimations().filter(animation=>animation.playState==='running'&&animation.effect?.getComputedTiming().iterations===Infinity).length})`);
  record("reduced motion has no running infinite animations or smooth scrolling", motion.reduced && motion.scrollBehavior !== "smooth" && !motion.animations, motion, "reduced-motion");
  await reduced.close();

  const plain = await openPage({ width: 390, height: 844, mobile: true, javascript: false });
  record("no-JavaScript content remains complete and readable", contentComplete(await contentState(plain)), await contentState(plain), "no-js");
  await layout(plain, "no-js");
  await plain.close();

  const printPage = await openPage({ reduced: true });
  await printPage.page("Emulation.setEmulatedMedia", { media: "print", features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  const printState = await printPage.evaluate(`(() => {
    const visible=element=>!!element&&element.getBoundingClientRect().height>0&&getComputedStyle(element).display!=='none';
    return {print:matchMedia('print').matches,headerVisible:visible(document.querySelector('.site-header')),projects:[...document.querySelectorAll('.project')].every(visible),headings:[...document.querySelectorAll('main section h2')].map(heading=>visible(heading))};
  })()`);
  record("print hides navigation and keeps every résumé section", printState.print && !printState.headerVisible && printState.projects && printState.headings.length >= 6 && printState.headings.every(Boolean), printState, "print");
  await screenshot(printPage, "print-home.png");
  await printPage.close();

  for (const route of ["/resume/", "/career/", "/portfolio/", "/pdf/seo-minjae-resume.pdf", "/pdf/seo-minjae-career-description.pdf", "/pdf/seo-minjae-backend-portfolio.pdf"]) {
    const response = await fetch(origin + route);
    const bytes = Buffer.from(await response.arrayBuffer());
    const isPDF = route.endsWith(".pdf");
    const valid = isPDF ? bytes.subarray(0, 5).toString() === "%PDF-" : /<main[\s>]/i.test(bytes.toString());
    record("document route returns its intended content", response.ok && valid, { route, status: response.status, contentType: response.headers.get("content-type"), bytes: bytes.length }, "routes");
  }
  record("no uncaught browser exceptions", exceptions.length === 0, exceptions);
  record("no local HTTP errors", responses.every(response => response.status < 400), responses.filter(response => response.status >= 400));
  record("no failed asset requests", networkFailures.length === 0, networkFailures);
} catch (error) {
  record("browser verification completed", false, { error: error.stack || error.message });
} finally {
  for (const entry of pending.values()) clearTimeout(entry.timer);
  socket?.close();
  if (chrome && chrome.exitCode === null) {
    const exited = new Promise(resolve => chrome.once("exit", resolve));
    chrome.kill("SIGTERM");
    await Promise.race([exited, pause(2000)]);
    if (chrome.exitCode === null) { chrome.kill("SIGKILL"); await Promise.race([exited, pause(2000)]); }
  }
  await rm(profile, { recursive: true, force: true });
  const evidence = {
    origin, capturedAt: new Date().toISOString(), browser: browser?.product,
    renderedHeadingFonts,
    checks, screenshots, exceptions, networkFailures,
    limitations: [
      "Screenshots must be visually inspected separately; this script does not judge composition.",
      "Viewport emulation does not verify physical devices. 720×500 approximates 200% reflow space, not browser chrome zoom.",
      "Contrast samples cover plain backgrounds and CSS color/opacity; artwork, pseudo-element overlays, and full accessibility conformance require separate review.",
      "Print-media checks verify content and sampled contrast, not PDF pagination or a physical printer.",
      "Read-only routes and temporary local PDF downloads do not exercise admin editing or publication.",
    ],
  };
  await writeFile(path.join(output, "browser.json"), JSON.stringify(evidence, null, 2) + "\n");
  const failures = checks.filter(check => check.status === "fail");
  console.log(JSON.stringify({ output, passed: checks.length - failures.length, failed: failures.length, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
}
