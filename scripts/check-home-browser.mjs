#!/usr/bin/env node
// Read-only home journeys (keyword map, cards, filters, dialog, keyboard, touch, reduced motion, no-JS) using an existing Chrome installation and Node 22+.
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
    "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
    ...(process.env.ARCHIVE_SOFTWARE_WEBGL === "1" ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : []), "about:blank",
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
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Chrome timeout: ${method} ${String(params.expression ?? params.type ?? "").slice(0, 120)}`)); }, 20000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  browser = await call("Browser.getVersion");
  await call("Browser.setDownloadBehavior", { behavior: "allowAndName", downloadPath: downloadDirectory, eventsEnabled: true });

  const openPage = async ({ width = 1440, height = 1000, mobile = false, reduced = false, javascript = true, touch = false, fragment = "" } = {}) => {
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
    if (touch) await page("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await page("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" }] });
    if (!javascript) await page("Emulation.setScriptExecutionDisabled", { value: true });
    await page("Page.navigate", { url: origin + "/" + fragment });
    await until(() => evaluate(`location.origin === ${JSON.stringify(origin)} && document.readyState === 'complete' && !!document.querySelector('main')`), Boolean, "Home did not finish loading");
    await evaluate("document.fonts.ready.then(() => true)");
    await evaluate("Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => null))).then(() => true)");
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
    const keys = { Tab: 9, Enter: 13, Escape: 27, Home: 36, End: 35, ArrowDown: 40, ArrowUp: 38, ArrowRight: 39, ArrowLeft: 37 };
    for (const type of ["keyDown", "keyUp"]) await context.page("Input.dispatchKeyEvent", {
      type, key: value, code: value, windowsVirtualKeyCode: keys[value],
      ...(value === "Enter" && type === "keyDown" ? { text: "\r", unmodifiedText: "\r" } : {}),
    });
    await pause(180);
  };
  const tap = async (context, selector) => {
    const point = await context.evaluate(`(() => {
      const element=document.querySelector(${JSON.stringify(selector)});
      if(!element) return null;
      element.scrollIntoView({block:'center',behavior:'instant'});
      const rect=element.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2,hit=document.elementFromPoint(x,y);
      return rect.width>0 && rect.height>0 && (hit===element || element.contains(hit)) ? {x,y} : null;
    })()`);
    if (!point) throw new Error(`Control is not touch-accessible: ${selector}`);
    // synthesizeTapGesture는 Linux Chrome(CI)에서 클릭을 만들지 못하는 일이 있어, 실제 터치 입력과 같은 touchStart/touchEnd를 직접 보낸다
    await context.page("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: point.x, y: point.y, id: 1 }] });
    await pause(60);
    await context.page("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await pause(250);
  };
  const press = async (context, value, code) => {
    const printable = value.length === 1;
    for (const type of ["keyDown", "keyUp"]) await context.page("Input.dispatchKeyEvent", {
      type, key: value, code: code || (printable ? `Key${value.toUpperCase()}` : value), ...(printable && type === "keyDown" ? { text: value, unmodifiedText: value } : {}),
    });
    await pause(160);
  };
  const layout = async (context, scope) => {
    const observed = await context.evaluate(`(() => {
      const visible=element=>{const r=element.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(element).visibility!=='hidden';};
      const scrolls=element=>{for(let p=element.parentElement;p&&p!==document.body;p=p.parentElement){const s=getComputedStyle(p);if(/auto|scroll/.test(s.overflowX)&&p.scrollWidth>p.clientWidth)return true;}return false;};
      return {width:innerWidth,expectedWidth:${context.width},scrollWidth:document.documentElement.scrollWidth,
        brokenImages:[...document.images].filter(image=>{const rect=image.getBoundingClientRect();return visible(image)&&rect.bottom>0&&rect.top<innerHeight&&(!image.complete||!image.naturalWidth);}).map(image=>image.currentSrc),
        overflowingText:[...document.querySelectorAll('h1,h2,h3,p,li,nav a,button')].filter(element=>visible(element)&&!element.closest('[aria-hidden=true]')&&!scrolls(element)).flatMap(element=>{const r=element.getBoundingClientRect();return r.left < -1 || r.right > ${context.width}+1 ? [{text:element.textContent.trim().slice(0,100),left:r.left,right:r.right}] : [];})};
    })()`);
    record("no horizontal overflow or broken visible images", observed.width <= observed.expectedWidth + 1 && observed.scrollWidth <= observed.expectedWidth + 1 && !observed.brokenImages.length && !observed.overflowingText.length, observed, scope);
  };
  const targets = async (context, scope) => {
    // WCAG 2.5.8: 문장 안의 인라인 링크는 제외하고, 보이는 조작 요소는 24px 이상이어야 한다
    const small = await context.evaluate(`(() => [...document.querySelectorAll('a[href],button,summary,input,[role=button],[tabindex="0"]')].filter(element=>{
      const r=element.getBoundingClientRect(),s=getComputedStyle(element);
      return r.width>0&&r.height>0&&s.visibility!=='hidden'&&!element.closest('[hidden],[aria-hidden=true],dialog:not([open]),.detail')&&s.display!=='inline'&&!element.classList.contains('skip-link')&&(r.width<24||r.height<24);
    }).map(element=>({tag:element.tagName.toLowerCase(),className:String(element.className).slice(0,40),text:element.textContent.trim().slice(0,30),width:Math.round(element.getBoundingClientRect().width),height:Math.round(element.getBoundingClientRect().height)})))()`);
    record("every visible pointer target is at least 24px", small.length === 0, small, scope);
  };
  // 위쪽에서 아래로 한 번 훑어, 늦게 그려지는 것들이 다 그려지게 한다
  const revealAll = async (context) => {
    const height = await context.evaluate("document.documentElement.scrollHeight");
    for (let top = 0; top < height; top += context.height * 0.6) {
      await context.evaluate(`window.scrollTo({top:${Math.round(top)},behavior:'instant'})`);
      await pause(100);
    }
    await context.evaluate("window.scrollTo({top:0,behavior:'instant'})");
    await pause(500);
  };
  const contrast = async (context, scope) => {
    const samples = await context.evaluate(`(() => {
      const rgba=value=>{const values=value.match(/[\\d.]+/g)?.map(Number)||[0,0,0];return [...values.slice(0,3),values[3]??1];};
      const over=(foreground,background)=>foreground.slice(0,3).map((channel,index)=>channel*foreground[3]+background[index]*(1-foreground[3]));
      const luminance=rgb=>rgb.map(channel=>{const value=channel/255;return value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4;}).reduce((sum,value,index)=>sum+value*[0.2126,0.7152,0.0722][index],0);
      const selector='main h1,main h2,main h3,main p,main li,main dt,main dd,main a,main summary,main button,.top a,.top button,.sbar a,.sbar button,.sbar span';
      return [...document.querySelectorAll(selector)].filter(element=>element.getBoundingClientRect().height>0&&element.textContent.trim()&&!element.matches(':disabled')&&!element.closest('[aria-hidden=true],.mini,[hidden],.detail,.mm:not(.is-on)')).map(element=>{
        const layers=[];let opacity=1;
        for(let current=element;current;current=current.parentElement){const style=getComputedStyle(current);layers.unshift(rgba(style.backgroundColor));opacity*=Number(style.opacity);}
        const background=layers.reduce((color,layer)=>over(layer,color),[18,21,28]),style=getComputedStyle(element),textColor=rgba(style.color);
        textColor[3]*=opacity;
        const foreground=over(textColor,background),a=luminance(foreground),b=luminance(background),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05),size=parseFloat(style.fontSize),weight=parseInt(style.fontWeight,10),minimum=size>=24||(size>=18.66&&weight>=700)?3:4.5;
        return {tag:element.tagName.toLowerCase(),className:String(element.className),text:element.textContent.trim().slice(0,60),ratio:Number(ratio.toFixed(2)),minimum};
      });
    })()`);
    const failures = samples.filter(sample => sample.ratio < sample.minimum);
    record("visible text meets WCAG AA contrast", samples.length > 50 && failures.length === 0, { sampled: samples.length, failures }, scope);
  };
  const firstViewport = (context) => context.evaluate(`(() => {
    const inView=element=>{if(!element)return false;const r=element.getBoundingClientRect();return r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight;};
    return {name:inView(document.querySelector('h1')),identity:inView(document.querySelector('.idl')),email:inView(document.querySelector('.hero .contacts a[href^="mailto:"]')),company:inView(document.querySelector('.hero .co')),nodes:[...document.querySelectorAll('.node__pill')].filter(inView).length,pdf:inView(document.querySelector('.top a[download]'))};
  })()`);
  const contentState = (context) => context.evaluate(`(() => {
    const visible=element=>!!element&&element.getBoundingClientRect().height>0&&getComputedStyle(element).visibility!=='hidden';
    return {heading:document.querySelector('h1')?.textContent.replace(/\\s+/g,' ').trim(),portraitLoaded:!!document.querySelector('.who img')?.naturalWidth,
      keywords:[...document.querySelectorAll('.node')].map(node=>({kw:node.dataset.kw,word:node.querySelector('.node__w')?.textContent.trim(),visible:visible(node.querySelector('.node__a'))})),
      cards:[...document.querySelectorAll('.card')].map(card=>({id:card.id,visible:visible(card.querySelector('h3')),mini:!!card.querySelector('svg.mini'),detail:!!card.querySelector('.detail .desc'),detailVisible:visible(card.querySelector('.detail .desc'))})),
      companies:[...document.querySelectorAll('.job h3')].map(heading=>heading.textContent.replace(/\\s+/g,' ').trim()),
      sectionHeadings:[...document.querySelectorAll('main section h2')].map(heading=>({text:heading.textContent.trim(),visible:visible(heading)})),
      identity:document.querySelector('.idl')?.textContent.trim(),
      stripsPresent:document.querySelectorAll('.steps').length,
      decorative:document.querySelectorAll('canvas,.stream,.planet-navigator,.world-sphere,.stellar-backdrop,.hero-art,[data-explorer]').length};
  })()`);
  const KEYWORD_WORDS = ["기록", "이어 가기", "원인", "테스트 먼저", "분리"];
  const contentComplete = (state) => state.heading?.includes("서민재") && state.identity === "멈춘 자리에서 이어 가도록 만듭니다."
    && state.keywords.length === 5 && KEYWORD_WORDS.every(word => state.keywords.some(k => k.word === word && k.visible))
    && state.cards.length === 8 && state.cards.every(card => card.visible && card.mini) && state.cards.filter(card => card.detail).length === 7
    && state.companies.length === 4 && state.sectionHeadings.length === 5 && state.sectionHeadings.every(heading => heading.visible) && state.decorative === 0 && state.stripsPresent === 5;
  const headerCheck = async (context, scope) => {
    const observed = await context.evaluate(`(() => [...document.querySelectorAll('.top .nav a,.top a[download]')].map(element=>{
      const r=element.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);
      return {text:element.textContent.trim(),download:element.hasAttribute('download'),height:r.height,inViewport:r.right>0&&r.left<innerWidth&&r.top>=0&&r.bottom<=innerHeight,unobscured:hit===element||element.contains(hit)};
    }))()`);
    record("header navigation and résumé PDF remain visible and pointer-accessible", observed.some(entry => entry.download) && observed.filter(entry => !entry.download).length === 6 && observed.every(entry => entry.height >= 24 && entry.unobscured && (entry.inViewport || !entry.download && context.width < 700)), observed, scope);
    const before = new Set(downloads.keys());
    await click(context, ".top a[download]");
    const download = await until(async () => [...downloads.values()].find(item => !before.has(item.guid) && item.state === "completed"), Boolean, "Header PDF download did not complete");
    const file = await readFile(path.join(downloadDirectory, download.guid));
    record("header PDF click downloads a PDF", file.subarray(0, 5).toString() === "%PDF-" && download.receivedBytes > 0, { filename: download.suggestedFilename, bytes: file.length }, scope);
  };
  const visibleCards = (context) => context.evaluate("[...document.querySelectorAll('.card:not([hidden])')].map(card=>card.id.replace('case-',''))");
  const mapState = (context) => context.evaluate(`({search:location.search,current:document.querySelector('.node.is-on')?.dataset.kw,pressed:document.querySelector('.chip[aria-pressed=true]')?.dataset.axis,
    stripTitle:document.querySelector('[data-strip-t]').textContent,stripShown:[...document.querySelectorAll('.steps')].filter(ol=>!ol.hidden).map(ol=>ol.dataset.kw),
    status:document.querySelector('[data-sbv]').textContent,hint:document.querySelector('[data-out]').textContent})`);

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844, mobile: true }, { width: 320, height: 640, mobile: true }]) {
    const scope = `${viewport.width}`;
    const context = await openPage(viewport);
    if (viewport.width === 1440) {
      const above = await firstViewport(context);
      record("first viewport shows name, identity line, company, email, PDF and all five keyword nodes", above.name && above.identity && above.email && above.company && above.pdf && above.nodes === 5, above, scope);
    }
    await revealAll(context);
    const state = await contentState(context);
    record("keywords, eight project cards (seven with detail), companies and sections are all present", contentComplete(state) && state.portraitLoaded, state, scope);
    await layout(context, scope);
    if (viewport.width <= 390) await targets(context, scope);
    if (viewport.width === 1440) {
      await context.page("DOM.enable");
      await context.page("CSS.enable");
      const { root } = await context.page("DOM.getDocument");
      const { nodeId } = await context.page("DOM.querySelector", { nodeId: root.nodeId, selector: "#ct" });
      const { fonts } = await context.page("CSS.getPlatformFontsForNode", { nodeId });
      renderedHeadingFonts = fonts;
      if (requireKoreanFont) record("Korean heading is rendered with a Korean-capable font", fonts.some(font => /Pretendard|Noto.*CJK/i.test(font.familyName) && font.glyphCount > 0), { fonts }, scope);
      await contrast(context, scope);
      await headerCheck(context, scope);
      await screenshot(context, "home-1440.png");
      await screenshot(context, "home-1440-full.png", true);
    } else if (viewport.width === 390) {
      await headerCheck(context, scope);
      await screenshot(context, "home-390.png");
      await screenshot(context, "home-390-full.png", true);
    } else {
      await screenshot(context, `home-${viewport.width}-full.png`, true);
    }
    await context.close();
  }

  // 지도의 다섯 노드: 깨끗한 새 페이지에서 첫 클릭만으로 필터가 걸려야 한다
  const FIRST_CLICK = { record: ["event", ["event"]], resume: ["batch", ["batch"]], cause: ["integrity", ["jpa", "batch"]], test: ["migrate", ["boot", "test"]], split: ["search", ["search", "gateway"]] };
  for (const [kw, [axis, ids]] of Object.entries(FIRST_CLICK)) {
    const page = await openPage({ width: 1440, height: 900 });
    await click(page, `.node[data-kw=${kw}] .node__a`);
    await pause(500);
    const state = await mapState(page);
    const cards = await visibleCards(page);
    record(`map node "${kw}": the first click selects it, shows its flow and filters the projects`, state.search === "?axis=" + axis && state.current === kw && state.pressed === axis && state.stripShown.join() === kw && JSON.stringify(cards) === JSON.stringify(ids) && state.status.includes("키워드") && state.status.includes("분야"), { state, cards }, "map");
    if (kw === "record") {
      await screenshot(page, "home-map-click-1440.png");
      await page.evaluate("document.querySelector('#projects').scrollIntoView({block:'start',behavior:'instant'})");
      await pause(200);
      await screenshot(page, "home-projects-filtered-1440.png");
    }
    await page.close();
  }

  const interactive = await openPage({ width: 1440, height: 900 });
  await key(interactive, "Tab");
  record("first Tab reaches the skip link", await interactive.evaluate("document.activeElement.classList.contains('skip-link')"), await interactive.evaluate("document.activeElement.outerHTML.slice(0,80)"), "keyboard");

  // 분야 칩과 개수
  const chipCounts = await interactive.evaluate("[...document.querySelectorAll('.chip')].map(chip=>[chip.dataset.axis,Number(chip.querySelector('small').textContent)])");
  await click(interactive, ".chip[data-axis=search]");
  const searchCards = await visibleCards(interactive);
  const chipState = await mapState(interactive);
  await click(interactive, ".chip[data-axis=all]");
  const allCards = await visibleCards(interactive);
  record("field chips filter the cards, move the map, and show their counts", JSON.stringify(chipCounts) === JSON.stringify([["all", 8], ["event", 1], ["batch", 1], ["integrity", 2], ["search", 2], ["migrate", 2], ["oss", 1]]) && searchCards.join() === "search,gateway" && chipState.current === "split" && allCards.length === 8, { chipCounts, searchCards, chipState, allCards }, "interaction");

  // 카드 → 상세 창: 흐름도는 flow.js가 창 안에서 그린다
  await click(interactive, "#case-search .card__t");
  await until(() => interactive.evaluate("document.querySelector('dialog.case').open && !!document.querySelector('dialog.case .flow.is-interactive')"), Boolean, "Case dialog did not open with an interactive flow");
  const dialogState = await interactive.evaluate("(() => {const d=document.querySelector('dialog.case');return {title:d.querySelector('.case__title').textContent,meta:d.querySelector('.case__meta').textContent,nodes:d.querySelectorAll('.flow__node').length,scenarios:[...d.querySelectorAll('[data-scenario]')].map(b=>b.dataset.scenario),focus:document.activeElement.className,hash:location.hash,diagramOpen:!!d.querySelector('details.diagram[open]'),duplicateIds:[...d.querySelectorAll('[id]')].length};})()");
  await click(interactive, "dialog.case [data-scenario=partial]");
  await click(interactive, "dialog.case .flow__play");
  for (let step = 0; step < 3; step += 1) await click(interactive, "dialog.case .flow__ctrl button[aria-label='다음 단계']");
  await pause(900);
  const flowState = await interactive.evaluate("(() => {const f=document.querySelector('dialog.case [data-flow=search]');return {pressed:f.querySelector('[data-scenario=partial]').getAttribute('aria-pressed'),current:f.querySelector('.flow__node.is-current')?.dataset.node,note:f.querySelector('.flow__note').textContent.trim(),step:f.querySelector('.flow__list [aria-current=step]')?.textContent.trim()};})()");
  record("card opens the detail dialog; the flowchart moves along the exact path with a text note", dialogState.title === "개인화 피드 검색 소스 실패 격리" && dialogState.nodes >= 8 && dialogState.scenarios.length === 4 && dialogState.focus.includes("case__x") && dialogState.hash === "#case-search" && flowState.pressed === "true" && flowState.current === "drop" && flowState.note.startsWith("4/") && !!flowState.step, { dialogState, flowState }, "interaction");
  await key(interactive, "Escape");
  await until(() => interactive.evaluate("!document.querySelector('dialog.case').open && location.hash === '#projects'"), Boolean, "Dialog close handling did not finish", 4000).catch(() => null);
  const closed = await interactive.evaluate("({open:document.querySelector('dialog.case').open,focus:document.activeElement.className,hash:location.hash})");
  record("Escape closes the dialog and returns focus to the card", !closed.open && closed.focus.includes("card__t") && closed.hash === "#projects", closed, "keyboard");
  await click(interactive, "[data-copy]");
  const copied = await until(() => interactive.evaluate("document.querySelector('.toast').textContent.trim()"), Boolean, "Copy email feedback did not appear");
  record("copy email prints a confirmation", copied.includes("ckdekrn88@gmail.com"), copied, "interaction");
  await interactive.close();

  // 키보드 단축키: 켜 둠, ? 도움말, 1–6, h/l, j/k, Enter, 끄기 스위치(저장), 입력 칸 보호
  const keys = await openPage({ width: 1440, height: 900 });
  await keys.evaluate("(() => { localStorage.removeItem('home-keys'); return true; })()");
  await press(keys, "?");
  const helpOpen = await keys.evaluate("({hidden:document.querySelector('[data-help]').hidden,expanded:document.querySelector('[data-helpb]').getAttribute('aria-expanded')})");
  await screenshot(keys, "home-help-1440.png");
  await key(keys, "Escape");
  const helpClosed = await keys.evaluate("document.querySelector('[data-help]').hidden");
  record("? opens the shortcut help and Escape closes it", !helpOpen.hidden && helpOpen.expanded === "true" && helpClosed, { helpOpen, helpClosed }, "keyboard");
  await press(keys, "2");
  await pause(900);
  const afterTwo = await keys.evaluate("({top:Math.round(document.querySelector('#projects').getBoundingClientRect().top),focus:document.activeElement.id})");
  await press(keys, "l");
  const afterL = await mapState(keys);
  await press(keys, "h");
  const afterH = await mapState(keys);
  await press(keys, "j");
  const afterJ = await keys.evaluate("document.activeElement.closest('.card')?.id");
  await press(keys, "j");
  const afterJ2 = await keys.evaluate("document.activeElement.closest('.card')?.id");
  await press(keys, "k");
  const afterK = await keys.evaluate("document.activeElement.closest('.card')?.id");
  await key(keys, "Enter");
  const enterOpen = await keys.evaluate("document.querySelector('dialog.case').open");
  await press(keys, "j");
  const jInDialog = await keys.evaluate("document.activeElement.closest('.card')?.id ?? null");
  await key(keys, "Escape");
  await press(keys, "6");
  await pause(900);
  const afterSix = await keys.evaluate("Math.round(document.querySelector('#contact').getBoundingClientRect().top)");
  record("keys: 2 and 6 jump to sections, h/l move the keyword, j/k move between cards, Enter opens, keys pause in a dialog", Math.abs(afterTwo.top) < 120 && afterTwo.focus === "pt" && afterL.current === "resume" && afterH.current === "record" && afterJ === "case-jpa" && afterJ2 === "case-boot" && afterK === "case-jpa" && enterOpen && jInDialog === null, { afterTwo, afterL: afterL.current, afterH: afterH.current, afterJ, afterJ2, afterK, enterOpen, jInDialog, afterSix }, "keyboard");

  // 입력 칸 보호: 입력 칸에서는 한 글자 키가 글자로만 들어간다
  await keys.evaluate("(() => { window.scrollTo({top:0,behavior:'instant'}); const i=document.createElement('input'); i.id='probe'; i.style.cssText='position:fixed;left:8px;top:80px;z-index:99'; document.body.append(i); i.focus(); return true; })()");
  await pause(600); // 앞선 부드러운 스크롤이 끝나기를 기다린 뒤 기준을 잡는다
  const scrollBefore = await keys.evaluate("Math.round(scrollY)");
  for (const ch of "j1?hl62") await press(keys, ch, /\d/.test(ch) ? `Digit${ch}` : undefined);
  const probe = await keys.evaluate("({value:document.querySelector('#probe').value,scroll:Math.round(scrollY),help:document.querySelector('[data-help]').hidden})");
  record("typing in an input field is never hijacked by shortcuts", probe.value === "j1?hl62" && probe.scroll === scrollBefore && probe.help, probe, "keyboard");
  await keys.evaluate("document.querySelector('#probe').remove()");

  // 끄기 스위치: 끄면 한 글자 키가 모두 멈추고, 새로고침해도 유지된다
  await click(keys, "[data-keysw]");
  const switched = await keys.evaluate("({pressed:document.querySelector('[data-keysw]').getAttribute('aria-pressed'),text:document.querySelector('[data-keystate]').textContent,stored:localStorage.getItem('home-keys')})");
  await keys.evaluate("window.scrollTo({top:0,behavior:'instant'})");
  const currentBefore = (await mapState(keys)).current;
  await press(keys, "6"); await press(keys, "?"); await press(keys, "l");
  await pause(700);
  const off = await keys.evaluate("({scroll:Math.round(scrollY),help:document.querySelector('[data-help]').hidden,current:document.querySelector('.node.is-on')?.dataset.kw})");
  await keys.close();
  const reloaded = await openPage({ width: 1440, height: 900 });
  await press(reloaded, "6");
  await pause(700);
  const persisted = await reloaded.evaluate("({scroll:Math.round(scrollY),pressed:document.querySelector('[data-keysw]').getAttribute('aria-pressed')})");
  await reloaded.evaluate("localStorage.removeItem('home-keys')");
  await reloaded.close();
  record("the shortcut switch turns every single-key shortcut off and the choice survives a reload", switched.pressed === "false" && switched.text === "꺼짐" && switched.stored === "off" && off.scroll === 0 && off.help && off.current === currentBefore && persisted.scroll === 0 && persisted.pressed === "false", { switched, off, currentBefore, persisted }, "keyboard");

  const narrow = await openPage({ width: 700, height: 900 });
  await press(narrow, "6");
  await pause(600);
  const narrowScroll = await narrow.evaluate("Math.round(scrollY)");
  await narrow.close();
  record("below 760px the shortcuts are off (the switch is hidden there)", narrowScroll === 0, narrowScroll, "keyboard");

  // 모바일 터치: 첫 탭은 미리 보기, 같은 노드를 한 번 더 누르면 필터와 이동
  const touch = await openPage({ width: 390, height: 844, mobile: true, touch: true });
  await tap(touch, ".node[data-kw=cause] .node__a");
  await pause(1100);
  const first = await mapState(touch);
  const firstCards = await visibleCards(touch);
  await screenshot(touch, "home-390-tap1.png");
  await tap(touch, ".node[data-kw=cause] .node__a");
  await pause(900);
  const second = await mapState(touch);
  const secondCards = await visibleCards(touch);
  const scrolled = await touch.evaluate("Math.round(document.querySelector('#projects').getBoundingClientRect().top)");
  record("touch: the first tap only previews a node, the second tap filters and moves to the projects", first.current === "cause" && !first.search.includes("axis=") && firstCards.length === 8 && first.hint.includes("한 번 더 누르면 이동합니다") && second.search === "?axis=integrity" && secondCards.join() === "jpa,batch" && Math.abs(scrolled) < 160, { first, firstCards, second, secondCards, scrolled }, "touch");
  await touch.close();

  const reduced = await openPage({ width: 390, height: 844, mobile: true, reduced: true });
  await pause(1500);
  const motion = await reduced.evaluate(`({reduced:matchMedia('(prefers-reduced-motion:reduce)').matches,scrollBehavior:getComputedStyle(document.documentElement).scrollBehavior,animations:document.getAnimations().filter(animation=>animation.playState==='running'&&animation.effect?.getComputedTiming().iterations===Infinity).length,typing:document.querySelector('[data-cmd]').textContent,out:document.querySelector('[data-out]').textContent.length>0,stepsActive:document.querySelectorAll('.steps li.is-cur').length})`);
  record("reduced motion: no infinite animation, no smooth scroll, the shell line is complete at once, no step highlight loop", motion.reduced && motion.scrollBehavior !== "smooth" && !motion.animations && motion.typing === "cat event.flow" && motion.out && motion.stepsActive === 0, motion, "reduced-motion");
  await reduced.close();
  const settle = await openPage({ width: 1440, height: 900 });
  await pause(7000);
  const calm = await settle.evaluate(`({infinite:document.getAnimations().filter(animation=>animation.playState==='running'&&animation.effect?.getComputedTiming().iterations===Infinity).length,stepsActive:document.querySelectorAll('.steps li.is-cur').length})`);
  record("with motion allowed, nothing keeps moving after the first seconds", calm.stepsActive === 0 && calm.infinite === 0, calm, "motion");
  await settle.close();

  const plain = await openPage({ width: 390, height: 844, mobile: true, javascript: false });
  const plainState = await contentState(plain);
  const plainFlows = await plain.evaluate(`(() => {const visible=element=>!!element&&element.getBoundingClientRect().height>0;return {strips:[...document.querySelectorAll('.steps')].filter(visible).length,filterHidden:!visible(document.querySelector('.filter')),flowLists:[...document.querySelectorAll('.card .flow__steps')].filter(visible).length};})()`);
  record("no-JavaScript: five keywords with their flows, every card with its detail, and the flow step lists are readable", contentComplete(plainState) && plainState.cards.filter(card => card.detail).every(card => card.detailVisible) && plainFlows.strips === 5 && plainFlows.filterHidden && plainFlows.flowLists === 4, { plainState, plainFlows }, "no-js");
  await layout(plain, "no-js");
  await screenshot(plain, "home-nojs-390.png");
  await plain.close();

  const printPage = await openPage({ reduced: true });
  await printPage.page("Emulation.setEmulatedMedia", { media: "print", features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  const printState = await printPage.evaluate(`(() => {
    const visible=element=>!!element&&element.getBoundingClientRect().height>0&&getComputedStyle(element).display!=='none';
    return {print:matchMedia('print').matches,headerVisible:visible(document.querySelector('.top')),statusVisible:visible(document.querySelector('.sbar')),describes:[...document.querySelectorAll('.card .detail .desc')].every(visible),headings:[...document.querySelectorAll('main section h2')].map(heading=>visible(heading))};
  })()`);
  record("print hides chrome and expands every project", printState.print && !printState.headerVisible && !printState.statusVisible && printState.describes && printState.headings.length === 5 && printState.headings.every(Boolean), printState, "print");
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
  record("the hero loads no three.js or WebGL scene", !responses.some(response => /three|event-stream/i.test(response.url)), responses.filter(response => /three|event-stream/i.test(response.url)));
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
