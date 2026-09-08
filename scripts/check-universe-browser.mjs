#!/usr/bin/env node
// Read-only résumé journeys using an existing Chrome installation and Node 22+.
// Screenshots are evidence to inspect separately, not automatic visual approval.
import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const [originArg, outputArg, ...extra] = process.argv.slice(2);
if (!originArg || !outputArg || extra.length || typeof WebSocket === "undefined") {
  console.error("Usage: node scripts/check-universe-browser.mjs <http(s)-origin> <evidence-directory> (Node 22+ and installed Chrome)");
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
const profile = await mkdtemp(path.join(tmpdir(), "archive-universe-browser-"));
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
    if (javascript) await until(() => evaluate("!!document.querySelector('[data-explorer-ready=true]')"), Boolean, "Project explorer did not initialize");
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
  const selection = (context) => context.evaluate(`(() => {
    const root=document.querySelector('[data-explorer]');
    return {tabs:[...root.querySelectorAll('[data-explorer-tab]')].map(tab=>({id:tab.id,key:tab.dataset.explorerTab,selected:tab.getAttribute('aria-selected'),tabindex:tab.tabIndex,controls:tab.getAttribute('aria-controls')})),
      visiblePanels:[...root.querySelectorAll('[data-explorer-panel]')].filter(panel=>panel.getBoundingClientRect().height>0).map(panel=>panel.id),focused:document.activeElement.id,hash:location.hash};
  })()`);
  const hasSelection = (state, index) => state.tabs[index]?.selected === "true" && state.tabs[index].tabindex === 0 && state.tabs.filter(tab => tab.selected === "true").length === 1 && state.visiblePanels.length === 1 && state.visiblePanels[0] === state.tabs[index].controls;
  const contrast = async (context, scope) => {
    const samples = await context.evaluate(`(() => {
      const rgba=value=>{const values=value.match(/[\\d.]+/g)?.map(Number)||[0,0,0];return [...values.slice(0,3),values[3]??1];};
      const over=(foreground,background)=>foreground.slice(0,3).map((channel,index)=>channel*foreground[3]+background[index]*(1-foreground[3]));
      const luminance=rgb=>rgb.map(channel=>{const value=channel/255;return value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4;}).reduce((sum,value,index)=>sum+value*[0.2126,0.7152,0.0722][index],0);
      const groups=['.career-list li > p','.career-date time','.career-company h3','.qualifications p','.case-panel > p','.case-panel h3','.case-meta span','.case-flow dt','.case-flow dd','.case-tabs button strong','.case-tabs button small','.documents h3','.documents p','.repository-row p','.chapter-label','.contact-email','.planet-flow figcaption span','.planet-flow figcaption strong','.flow-summary','.achievement-chart figcaption span','.achievement-chart figcaption strong','.achievement-chart > p','.test-bar-row > span','.test-bar-row > strong','.achievement-counts dt','.achievement-counts dd','.output-key'];
      return groups.flatMap(selector=>[...document.querySelectorAll(selector)].filter(element=>element.getBoundingClientRect().height>0).map(element=>{
        const layers=[];let opacity=1;
        for(let current=element;current;current=current.parentElement){const style=getComputedStyle(current);layers.unshift({color:rgba(style.backgroundColor),image:style.backgroundImage});opacity*=Number(style.opacity);}
        const background=layers.reduce((color,layer)=>over(layer.color,color),[255,255,255]),style=getComputedStyle(element),textColor=rgba(style.color);
        textColor[3]*=opacity;
        const foreground=over(textColor,background),a=luminance(foreground),b=luminance(background),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05),size=parseFloat(style.fontSize),weight=parseInt(style.fontWeight,10),minimum=size>=24||(size>=18.66&&weight>=700)?3:4.5;
        let imageBehind=false;for(let index=layers.length-1;index>=0;index--){if(layers[index].image!=='none')imageBehind=true;if(layers[index].color[3]===1)break;}
        const surface=element.closest('[data-reading-surface],.world-caption,.chapter-label');
        return {selector,text:element.textContent.trim().slice(0,100),color:style.color,foreground,background,fontSize:style.fontSize,fontWeight:style.fontWeight,effectiveOpacity:opacity,ratio:Number(ratio.toFixed(2)),minimum,supported:!!surface&&!imageBehind,surface:surface?.className};
      }));
    })()`);
    record("sampled plain content meets text contrast", samples.length > 10 && samples.every(sample => sample.supported && sample.ratio >= sample.minimum), samples, scope);
    const surfaces = await context.evaluate(`([...document.querySelectorAll('[data-reading-surface]')].filter(element=>element.getBoundingClientRect().height>0).map(element=>{const style=getComputedStyle(element),channels=style.backgroundColor.match(/[\\d.]+/g)?.map(Number)||[];return {className:element.className,color:style.backgroundColor,alpha:channels[3]??1,image:style.backgroundImage,opacity:Number(style.opacity)};}))`);
    record("reading surfaces remain opaque below cosmic artwork", surfaces.length >= 5 && surfaces.every(surface => surface.alpha === 1 && surface.image === "none" && surface.opacity === 1), surfaces, scope);
  };
  const flowCheck = async (context, panelId, scope, capture = false) => {
    const panelSelector = `#${panelId}`;
    await context.evaluate(`document.querySelector(${JSON.stringify(panelSelector + " .planet-flow")}).scrollIntoView({block:'start',behavior:'instant'})`);
    await until(() => context.evaluate(`(() => {const image=document.querySelector(${JSON.stringify(panelSelector + " .planet-flow img")});return !!image?.complete&&image.naturalWidth>0;})()`), Boolean, "Selected orbit diagram did not load");
    const flow = await context.evaluate(`(() => {
      const panel=document.getElementById(${JSON.stringify(panelId)}),figure=panel.querySelector('.planet-flow'),image=figure.querySelector('img'),caption=figure.querySelector('figcaption'),region=figure.querySelector('.flow-viewport'),summary=figure.querySelector('.flow-summary');
      return {panel:panel.id,src:image.currentSrc,alt:image.alt,imageWidth:image.getBoundingClientRect().width,naturalWidth:image.naturalWidth,caption:caption?.textContent.trim(),captionRelation:figure.getAttribute('aria-labelledby')===caption?.id,summary:summary?.textContent.trim(),summaryVisible:summary?.getBoundingClientRect().height>0,region:{name:region.getAttribute('aria-label'),role:region.getAttribute('role'),tabindex:region.tabIndex,width:region.clientWidth,scrollWidth:region.scrollWidth,overflow:getComputedStyle(region).overflowX},textFlow:[...panel.querySelectorAll('.case-flow dd')].map(item=>({text:item.textContent.trim(),visible:item.getBoundingClientRect().height>0}))};
    })()`);
    record("selected orbit diagram loads with descriptive caption and text alternative", /\/orbit-(jpa|event|batch|feed)\.svg$/.test(flow.src) && flow.alt.length > 15 && flow.captionRelation && !!flow.caption && flow.summaryVisible && flow.summary.includes("→") && flow.textFlow.length >= 3 && flow.textFlow.every(item => item.visible), flow, scope);
    if (context.width < 900) {
      await context.evaluate(`document.querySelector(${JSON.stringify(panelSelector + " .flow-viewport")}).focus()`);
      await key(context, "ArrowRight");
      await key(context, "ArrowRight");
      const scrolled = await context.evaluate(`document.querySelector(${JSON.stringify(panelSelector + " .flow-viewport")}).scrollLeft`);
      record("narrow orbit diagram scrolls horizontally from keyboard", flow.region.role === "region" && flow.region.tabindex === 0 && !!flow.region.name && flow.region.scrollWidth > flow.region.width && scrolled > 0, { ...flow.region, scrolled }, scope);
      await context.evaluate(`document.querySelector(${JSON.stringify(panelSelector + " .flow-viewport")}).scrollLeft=0;document.activeElement.blur()`);
    }
    if (capture) await screenshot(context, `${panelId}-flow-${context.width}.png`);
  };
  const originalFlowCheck = async (context, scope, capture = false) => {
    const before = await context.evaluate("document.querySelector('.original-flow').open");
    if (before) await click(context, ".original-flow summary");
    await click(context, ".original-flow summary");
    await until(() => context.evaluate("document.querySelector('.original-flow img').complete && document.querySelector('.original-flow img').naturalWidth>0"), Boolean, "Original feed diagram did not load");
    const opened = await context.evaluate(`(() => {const details=document.querySelector('.original-flow'),image=details.querySelector('img'),region=details.querySelector('[role=region]');return {open:details.open,src:image.currentSrc,alt:image.alt,imageWidth:image.getBoundingClientRect().width,caption:details.querySelector('figcaption').textContent.trim(),regionWidth:region.clientWidth,scrollWidth:region.scrollWidth,tabindex:region.tabIndex};})()`);
    record("original feed diagram expands with native details and descriptive content", opened.open && /\/feed-serving\.svg$/.test(opened.src) && opened.alt.length > 15 && !!opened.caption && opened.imageWidth > 0, opened, scope);
    if (context.width < 900) {
      await context.evaluate("document.querySelector('.original-flow [role=region]').focus()");
      await key(context, "ArrowRight");
      await key(context, "ArrowRight");
      const offset = await context.evaluate("document.querySelector('.original-flow [role=region]').scrollLeft");
      record("original narrow diagram is keyboard scrollable", opened.tabindex === 0 && opened.scrollWidth > opened.regionWidth && offset > 0, { ...opened, offset }, scope);
      await context.evaluate("document.querySelector('.original-flow [role=region]').scrollLeft=0;document.activeElement.blur()");
    }
    if (capture) {
      await context.evaluate("document.querySelector('.original-flow').scrollIntoView({block:'start',behavior:'instant'})");
      await screenshot(context, `original-feed-expanded-${context.width}.png`);
    }
    await click(context, ".original-flow summary");
    record("original diagram collapses again", await context.evaluate("!document.querySelector('.original-flow').open"), undefined, scope);
  };
  const headerCheck = async (context, scope) => {
    const observed = await context.evaluate(`(() => {
      const entries=[...document.querySelectorAll('.site-header nav a,.site-header a[download]')].map(element=>{
        const r=element.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);
        return {text:element.textContent.trim(),href:element.getAttribute('href'),download:element.hasAttribute('download'),width:r.width,height:r.height,inViewport:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,unobscured:hit===element||element.contains(hit)};
      });return entries;
    })()`);
    record("header navigation and résumé PDF remain visible and pointer-accessible", observed.some(entry => entry.download) && observed.filter(entry => !entry.download).length >= 3 && observed.every(entry => entry.width > 0 && entry.height >= 24 && entry.inViewport && entry.unobscured), observed, scope);
    const before = new Set(downloads.keys());
    await click(context, ".site-header a[download]");
    const download = await until(async () => [...downloads.values()].find(item => !before.has(item.guid) && item.state === "completed"), Boolean, "Header PDF download did not complete");
    const file = await readFile(path.join(downloadDirectory, download.guid));
    record("header PDF click downloads a PDF", file.subarray(0, 5).toString() === "%PDF-" && download.receivedBytes > 0, { url: download.url, filename: download.suggestedFilename, bytes: file.length, state: download.state }, scope);
  };

  // Font fallback fixture: affects only this disposable browser page.
  const fallbackFont = await openPage({ width: 360, height: 800, mobile: true });
  await fallbackFont.evaluate("document.querySelector('.cosmic-title h1').style.fontFamily='Arial, sans-serif'");
  await pause(150);
  const fallbackState = await fallbackFont.evaluate(`(() => {
    const heading=document.querySelector('.cosmic-title h1');
    return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,fontFamily:getComputedStyle(heading).fontFamily,fontSize:getComputedStyle(heading).fontSize,
      titleParts:[...heading.querySelectorAll('span')].map(element=>{const rect=element.getBoundingClientRect();return {text:element.textContent,left:rect.left,right:rect.right,width:rect.width};})};
  })()`);
  record("360px title remains within viewport with an uncondensed font fallback", fallbackState.width <= fallbackFont.width + 1 && fallbackState.scrollWidth <= fallbackFont.width + 1 && fallbackState.titleParts.every(part => part.left >= 0 && part.right <= fallbackFont.width + 1), { expectedWidth: fallbackFont.width, ...fallbackState }, "font-fallback");
  await screenshot(fallbackFont, "font-fallback-360x800.png");
  await fallbackFont.close();
  // End font fallback fixture.

  let expectedTabs;
  for (const viewport of [
    { width: 1440, height: 1000 }, { width: 768, height: 1000 },
    { width: 390, height: 844, mobile: true }, { width: 360, height: 800, mobile: true },
    { width: 720, height: 500 },
  ]) {
    const scope = `${viewport.width}x${viewport.height}`;
    const context = await openPage(viewport);
    await layout(context, scope);
    await screenshot(context, `hero-${scope}.png`);
    await headerCheck(context, scope);
    const identity = await context.evaluate(`({heading:document.querySelector('h1')?.textContent.trim(),portraitLoaded:!!document.querySelector('.identity-band img')?.naturalWidth,artLoaded:!!document.querySelector('.hero-art img')?.naturalWidth,identity:document.querySelector('.identity-band')?.textContent.trim(),displayFontReady:document.fonts.check('italic 900 100px "Barlow Condensed"'),displayFontLoaded:[...document.fonts].some(face=>face.family.replaceAll('"','')==='Barlow Condensed'&&face.status==='loaded'),titleFont:getComputedStyle(document.querySelector('.cosmic-title h1')).fontFamily})`);
    record("hero artwork, local display font and real résumé identity load", !!identity.heading && identity.portraitLoaded && identity.artLoaded && !!identity.identity && identity.displayFontReady && identity.displayFontLoaded && identity.titleFont.startsWith('"Barlow Condensed"'), identity, scope);
    const state = await selection(context);
    expectedTabs ||= state.tabs;
    const planetControls = await context.evaluate("[...document.querySelectorAll('[data-explorer-tab]')].map(tab=>({planet:!!tab.querySelector('.world-sphere'),caption:tab.querySelector('.world-caption')?.textContent.trim(),labels:[...tab.querySelectorAll('.world-caption strong,.world-caption small')].map(label=>({text:label.textContent.trim(),width:label.getBoundingClientRect().width,height:label.getBoundingClientRect().height}))}))");
    const accessibility = await context.page("Accessibility.getFullAXTree");
    const accessibleTabNames = accessibility.nodes.filter(node => node.role?.value === "tab").map(node => node.name?.value || "");
    record("four project planets initialize named visible labels and one accessible selection", state.tabs.length === 4 && hasSelection(state, 0) && planetControls.every(control => control.planet && control.caption && control.labels.length >= 2 && control.labels.every(label => label.width > 0 && label.height > 0)) && accessibleTabNames.length === 4 && accessibleTabNames.every(name => name.trim().length > 4), { ...state, planetControls, accessibleTabNames }, scope);
    if ([1440, 390].includes(viewport.width)) {
      await context.evaluate("document.querySelector('#work').scrollIntoView({block:'start',behavior:'instant'})");
      await screenshot(context, `project-overview-${viewport.width}.png`);
    }
    if (viewport.width === 1440) {
      await context.page("DOM.enable");
      await context.page("CSS.enable");
      const { root } = await context.page("DOM.getDocument");
      const { nodeId } = await context.page("DOM.querySelector", {
        nodeId: root.nodeId,
        selector: "#work-title",
      });
      const { fonts } = await context.page("CSS.getPlatformFontsForNode", { nodeId });
      renderedHeadingFonts = fonts;
      if (requireKoreanFont) {
        record(
          "Korean heading is rendered with the installed CJK font",
          fonts.some(font => /Noto.*CJK/i.test(font.familyName) && font.glyphCount > 0),
          { selector: "#work-title", fonts },
          scope,
        );
      }
    }
    for (let index = 0; index < state.tabs.length; index++) {
      await click(context, "[data-explorer-tab]", index);
      await pause(250);
      const selected = await selection(context);
      record(`pointer selects project ${index + 1}`, hasSelection(selected, index) && selected.hash === `#${encodeURIComponent(selected.tabs[index].controls)}`, selected, scope);
      if (index === 0 && [1440, 390].includes(viewport.width)) {
        await context.evaluate("document.querySelector('.achievement-chart').scrollIntoView({block:'start',behavior:'instant'})");
        await screenshot(context, `jpa-chart-and-flow-${viewport.width}.png`);
      }
      if ([1, 2].includes(index) && [1440, 390].includes(viewport.width)) {
        await context.evaluate(`document.getElementById(${JSON.stringify(selected.tabs[index].controls)}).scrollIntoView({block:'start',behavior:'instant'})`);
        await screenshot(context, `${selected.tabs[index].controls}-achievements-${viewport.width}.png`);
      }
      await flowCheck(context, selected.tabs[index].controls, `${scope}/project-${index + 1}`, [1440, 390].includes(viewport.width));
      if (index === 3) await originalFlowCheck(context, `${scope}/original-feed`, [1440, 390].includes(viewport.width));
      await layout(context, `${scope}/project-${index + 1}`);
      if (viewport.width === 1440) await contrast(context, `${scope}/project-${index + 1}`);
    }
    await click(context, "[data-explorer-tab]", 0);
    await pause(250);
    await contrast(context, scope);
    const metrics = await context.evaluate(`(() => {
      const chart=document.querySelector('.achievement-chart'),rows=[...chart.querySelectorAll('.test-bar-row')].map(row=>({label:row.querySelector('span').textContent.trim(),value:row.querySelector('strong').textContent.trim(),barWidth:row.querySelector('i').getBoundingClientRect().width}));
      const counts=id=>[...document.querySelectorAll(id+' .achievement-counts > div')].map(item=>({label:item.querySelector('dt').textContent.trim(),value:item.querySelector('dd').textContent.replace(/\\s+/g,'')}));
      return {chartCaption:chart.querySelector('figcaption').textContent.trim(),chartDescription:chart.querySelector('p').textContent.trim(),rows,corrected:document.querySelector('#case-jpa .case-result').textContent.trim(),events:counts('#case-event'),batch:counts('#case-batch'),search:document.querySelector('#case-search').textContent.trim()};
    })()`);
    record("achievement graphics preserve documented units and separate work", metrics.chartCaption.includes("별도 작업") && metrics.chartDescription.includes("Spring Boot 2.3.8 → 3.3.3") && metrics.rows[0]?.value === "0개" && metrics.rows[0].barWidth === 0 && metrics.rows[1]?.value === "160개 이상" && metrics.rows[1].barWidth > 0 && metrics.corrected.includes("약 200만 건") && metrics.events.map(item => item.value).join(",") === "9종,6개,8개" && metrics.batch.some(item => /API/.test(item.label) && item.value === "9개") && metrics.batch.some(item => /시나리오/.test(item.label) && item.value === "13개") && /9개 검색 소스/.test(metrics.search), metrics, scope);
    if (viewport.width === 1440) {
      await click(context, "[data-explorer-tab]", 1);
      await context.evaluate("document.querySelector('#work').scrollIntoView({block:'start',behavior:'instant'})");
      await pause(300);
      await screenshot(context, "work-1440x1000.png");
      await click(context, "[data-explorer-tab]", 0);
      await screenshot(context, "home-1440-full.png", true);
    }
    if ([1440, 390].includes(viewport.width)) {
      if (viewport.width === 390) await screenshot(context, "home-390-full.png", true);
      for (const section of ["career", "work", "activity", "documents", "contact"]) {
        await context.evaluate(`document.getElementById(${JSON.stringify(section)}).scrollIntoView({block:'start',behavior:'instant'})`);
        await pause(100);
        await screenshot(context, `${section}-${scope}.png`);
      }
    }
    await context.close();
    console.log(JSON.stringify({ completed: scope, checks: checks.length, failures: checks.filter(check => check.status === "fail").map(check => ({ name: check.name, scope: check.scope })) }));
  }

  const keyboard = await openPage();
  await keyboard.page("Page.bringToFront");
  await key(keyboard, "Tab");
  record("keyboard first reaches visible skip link", await keyboard.evaluate("document.activeElement.classList.contains('skip-link') && document.activeElement.getBoundingClientRect().top >= 0"));
  await key(keyboard, "Enter");
  record("skip link moves focus to main content", await keyboard.evaluate("document.activeElement.id === 'main'"));
  await keyboard.evaluate("document.querySelector('[data-explorer-tab]').focus()");
  await key(keyboard, "ArrowDown");
  let state = await selection(keyboard);
  record("ArrowDown selects and focuses next project", hasSelection(state, 1) && state.focused === state.tabs[1].id, state, "keyboard");
  await key(keyboard, "ArrowRight");
  state = await selection(keyboard);
  record("ArrowRight selects the next project planet", hasSelection(state, 2) && state.focused === state.tabs[2].id, state, "keyboard");
  await key(keyboard, "End");
  state = await selection(keyboard);
  record("End selects and focuses last project", hasSelection(state, state.tabs.length - 1) && state.focused === state.tabs.at(-1).id, state, "keyboard");
  await key(keyboard, "Home");
  state = await selection(keyboard);
  record("Home selects and focuses first project", hasSelection(state, 0) && state.focused === state.tabs[0].id, state, "keyboard");
  await key(keyboard, "Tab");
  record("Tab reaches the selected project content", await keyboard.evaluate("document.activeElement.matches('[data-explorer-panel]:not([hidden])')"), await keyboard.evaluate("document.activeElement.id"), "keyboard");
  await screenshot(keyboard, "keyboard-project-focus.png");
  await keyboard.close();

  const deepLink = await openPage({ fragment: `#${encodeURIComponent(expectedTabs[1].controls)}` });
  state = await selection(deepLink);
  record("direct project fragment reveals the intended panel", hasSelection(state, 1), state, "deep-link");
  await deepLink.close();

  const reduced = await openPage({ width: 390, height: 844, mobile: true, reduced: true });
  const motion = await reduced.evaluate(`({reduced:matchMedia('(prefers-reduced-motion:reduce)').matches,scrollBehavior:getComputedStyle(document.documentElement).scrollBehavior,animations:document.getAnimations().filter(animation=>animation.playState==='running'&&animation.effect?.getComputedTiming().iterations===Infinity).map(animation=>({name:animation.animationName||'web-animation'}))})`);
  record("reduced motion has no running infinite animations or smooth scrolling", motion.reduced && motion.scrollBehavior !== "smooth" && !motion.animations.length, motion, "reduced-motion");
  await screenshot(reduced, "reduced-motion-390.png");
  await reduced.close();

  const plain = await openPage({ width: 390, height: 844, mobile: true, javascript: false });
  const plainState = await plain.evaluate(`(() => {
    const visible=element=>!!element&&element.getBoundingClientRect().height>0;
    return {heading:visible(document.querySelector('h1')),identity:visible(document.querySelector('.identity-band')),panels:[...document.querySelectorAll('[data-explorer-panel]')].map(panel=>({id:panel.id,visible:visible(panel)})),sectionHeadings:[...document.querySelectorAll('main section h2')].map(heading=>({text:heading.textContent.trim(),visible:visible(heading)})),tabsHidden:[...document.querySelectorAll('[data-explorer-tabs]')].every(toolbar=>!visible(toolbar))};
  })()`);
  record("no-JavaScript content remains complete and readable", plainState.heading && plainState.identity && plainState.panels.length === expectedTabs.length && plainState.panels.every(panel => panel.visible) && plainState.sectionHeadings.length >= 4 && plainState.sectionHeadings.every(heading => heading.visible) && plainState.tabsHidden, plainState, "no-js");
  await layout(plain, "no-js");
  for (const tab of expectedTabs) await flowCheck(plain, tab.controls, `no-js/${tab.key}`);
  await originalFlowCheck(plain, "no-js/original-feed");
  await screenshot(plain, "no-js-390-full.png", true);
  await plain.close();

  const printPage = await openPage({ reduced: true });
  await printPage.page("Emulation.setEmulatedMedia", { media: "print", features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await printPage.evaluate("window.dispatchEvent(new Event('beforeprint'))");
  const printState = await printPage.evaluate(`(() => {
    const visible=element=>!!element&&element.getBoundingClientRect().height>0&&getComputedStyle(element).visibility!=='hidden';
    return {print:matchMedia('print').matches,artVisible:visible(document.querySelector('.hero-art')),identityVisible:visible(document.querySelector('.identity-band')),heroHeight:document.querySelector('.cosmic-hero').getBoundingClientRect().height,panels:[...document.querySelectorAll('[data-explorer-panel]')].map(panel=>({id:panel.id,visible:visible(panel)})),headings:[...document.querySelectorAll('#career h2,#work h2,#activity h2,#documents h2')].map(heading=>({text:heading.textContent.trim(),visible:visible(heading)}))};
  })()`);
  record("print retains résumé content and removes decorative artwork", printState.print && !printState.artVisible && printState.identityVisible && printState.heroHeight < 500 && printState.panels.length === expectedTabs.length && printState.panels.every(panel => panel.visible) && printState.headings.length >= 4 && printState.headings.every(heading => heading.visible), printState, "print");
  await contrast(printPage, "print");
  await screenshot(printPage, "print-home.png");
  await printPage.evaluate("document.querySelector('#work').scrollIntoView({behavior:'instant'})");
  await screenshot(printPage, "print-work.png");
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
      "Screenshots must be visually inspected separately; this script does not judge composition or poster grandeur.",
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
