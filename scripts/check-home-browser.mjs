#!/usr/bin/env node
// Existing Chrome + Node 22+ only. Keeps screenshots separate from visual-review claims.
import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const [originArg, outputArg, ...flags] = process.argv.slice(2);
if (!originArg || !outputArg || flags.some(flag => !['--baseline', '--full-page'].includes(flag)) || typeof WebSocket === 'undefined') {
  console.error('Usage: node scripts/check-home-browser.mjs <http(s)-origin> <evidence-directory> [--baseline] [--full-page] (Node 22+ and Chrome)');
  process.exit(2);
}
const requested = new URL(originArg);
if (!['http:', 'https:'].includes(requested.protocol)) throw new Error('An HTTP(S) origin is required.');
const origin = requested.origin;
const output = path.resolve(outputArg);
const baseline = flags.includes('--baseline');
const chromePaths = process.env.ARCHIVE_CHROME ? [process.env.ARCHIVE_CHROME] : [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
];
let executable;
for (const candidate of chromePaths) {
  try { await access(candidate); executable = candidate; break; } catch { /* Try an existing installation. */ }
}
if (!executable) throw new Error('Chrome unavailable; set ARCHIVE_CHROME to an installed executable. No browser checks ran.');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(path.join(tmpdir(), 'archive-home-browser-'));
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const pending = new Map();
const checks = [];
const screenshots = [];
const exceptions = [];
const responses = [];
const networkFailures = [];
let chrome, socket, sequence = 0, browser;
function record(name, pass, observed, scope = 'home') {
  checks.push({ name, scope, status: pass ? 'pass' : 'fail', observed });
}
function skip(name, reason) { checks.push({ name, scope: 'home', status: 'not-tested', reason }); }
const instrumentation = `(() => {
  window.__archiveRafCallbacks = 0;
  const nativeRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => nativeRaf(time => { window.__archiveRafCallbacks++; callback(time); });
})()`;
try {
  chrome = spawn(executable, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', 'about:blank'], { stdio: 'ignore' });
  let launchError;
  chrome.on('error', error => { launchError = error; });
  let debug;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (launchError) throw launchError;
    if (chrome.exitCode !== null) throw new Error('Chrome exited before the debugging endpoint was ready');
    try { debug = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).trim().split('\n'); break; } catch { await pause(100); }
  }
  if (!debug) throw new Error('Chrome debugging endpoint did not become ready');
  socket = new WebSocket(`ws://127.0.0.1:${debug[0]}${debug[1]}`);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('Cannot connect to Chrome')), { once: true });
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push({ sessionId: message.sessionId, ...message.params.exceptionDetails });
    if (message.method === 'Network.responseReceived') {
      const response = message.params.response;
      if (response.url.startsWith(origin + '/')) responses.push({ sessionId: message.sessionId, url: response.url, status: response.status, type: message.params.type });
    }
    if (message.method === 'Network.loadingFailed' && !message.params.canceled) networkFailures.push({ sessionId: message.sessionId, ...message.params });
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id); clearTimeout(entry.timer);
    if (message.error) entry.reject(new Error(message.error.message)); else entry.resolve(message.result);
  });
  function call(method, params = {}, sessionId) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Chrome timeout: ${method}`)); }, 20000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  browser = await call('Browser.getVersion');
  const openPage = async ({ width = 1440, height = 1000, mobile = false, reduced = false, javascript = true, noWebGL = false, clipboardMode } = {}) => {
    const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
    const page = (method, params) => call(method, params, sessionId);
    const evaluate = async expression => {
      const result = await page('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    await page('Page.enable');
    await page('Runtime.enable');
    await page('Network.enable');
    await page('Network.setCacheDisabled', { cacheDisabled: true });
    await page('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    await page('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }] });
    await page('Page.addScriptToEvaluateOnNewDocument', { source: instrumentation });
    if (noWebGL) await page('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const native = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function(type, ...args) { return /webgl/i.test(type) ? null : native.call(this, type, ...args); }; })()` });
    if (clipboardMode) await page('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
      const mode=${JSON.stringify(clipboardMode)};
      const probe=window.__archiveClipboardProbe={mode,writes:[],fallbacks:[]};
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value => {
        probe.writes.push(value);
        if(mode!=='success') throw new DOMException('Permission denied by test fixture','NotAllowedError');
      }}});
      const native=document.execCommand.bind(document);
      document.execCommand=(command,...args) => {
        if(command!=='copy') return native(command,...args);
        probe.fallbacks.push(document.activeElement?.value);
        if(mode==='denied-throws') throw new DOMException('Legacy copy blocked by test fixture','NotAllowedError');
        return mode==='denied-with-fallback';
      };
    })()` });
    if (!javascript) await page('Emulation.setScriptExecutionDisabled', { value: true });
    await page('Page.navigate', { url: origin + '/' });
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      ready = await evaluate(`location.origin === ${JSON.stringify(origin)} && document.readyState === 'complete' && !!document.querySelector('main')`);
      if (ready) break;
      await pause(100);
    }
    if (!ready) throw new Error('Home did not finish loading');
    await evaluate('document.fonts.ready.then(() => true)');
    await pause(800);
    return { page, evaluate, sessionId, close: () => call('Target.closeTarget', { targetId }) };
  };
  const screenshot = async (context, name, fullPage = false) => {
    const params = { format: 'png', captureBeyondViewport: fullPage };
    if (fullPage) {
      const dimensions = await context.evaluate('({height:document.documentElement.scrollHeight,viewport:innerHeight})');
      for (let top = 0; top < dimensions.height; top += dimensions.viewport * 0.8) {
        await context.evaluate(`window.scrollTo({top:${Math.round(top)},behavior:'instant'})`);
        await pause(90);
      }
      await context.evaluate("window.scrollTo({top:0,behavior:'instant'})");
      await pause(800);
      const { cssContentSize } = await context.page('Page.getLayoutMetrics');
      params.clip = { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 };
    }
    const result = await context.page('Page.captureScreenshot', params);
    await writeFile(path.join(output, name), Buffer.from(result.data, 'base64'));
    screenshots.push({ file: name, inspected: false, fullPage });
  };
  const click = async (context, selector) => {
    const point = await context.evaluate(`(() => {
      const element=document.querySelector(${JSON.stringify(selector)});
      if(!element || element.disabled) return null;
      element.scrollIntoView({block:'center',behavior:'instant'});
      const rect=element.getBoundingClientRect(), x=rect.left+rect.width/2, y=rect.top+rect.height/2;
      const hit=document.elementFromPoint(x,y);
      return rect.width>0 && rect.height>0 && (hit===element || element.contains(hit)) ? {x,y} : null;
    })()`);
    if (!point) throw new Error(`Control is not pointer-accessible: ${selector}`);
    await context.page('Input.dispatchMouseEvent', {type:'mousePressed',button:'left',clickCount:1,...point});
    await context.page('Input.dispatchMouseEvent', {type:'mouseReleased',button:'left',clickCount:1,...point});
  };
  const layout = async (context, name) => {
    const result = await context.evaluate(`(() => {
      const width = document.documentElement.clientWidth;
      return { viewport: innerWidth, width, documentWidth: document.documentElement.scrollWidth,
        overflowing: [...document.body.querySelectorAll('*')].filter(element => {
          const style = getComputedStyle(element), rect = element.getBoundingClientRect();
          return style.position !== 'fixed' && rect.width > 0 && (rect.right > width + 1 || rect.left < -1) && style.visibility !== 'hidden' && style.opacity !== '0' && !element.closest('.skip-link');
        }).slice(0, 12).map(element => ({ tag: element.tagName, id: element.id, class: typeof element.className === 'string' ? element.className : '', text: element.textContent.trim().slice(0, 65) })) };
    })()`);
    record('no horizontal page overflow', result.documentWidth <= result.width + 1, result, name);
  };
  const visibleContent = async context => context.evaluate(`(() => {
    const visible = element => { if (!element) return false; const rect = element.getBoundingClientRect(); let current = element; while(current) { const style = getComputedStyle(current); if(style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false; current = current.parentElement; } return rect.width > 0 && rect.height > 0; };
    return { h1Count: document.querySelectorAll('h1').length, h1Text: document.querySelector('h1')?.textContent.trim(), h1Visible: visible(document.querySelector('h1')), mainCharacters: document.querySelector('main')?.innerText.trim().length || 0,
      sectionHeadings: [...document.querySelectorAll('main h2')].map(element => ({text: element.textContent.trim(), visible: visible(element)})) };
  })()`);
  const viewports = [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'laptop', width: 1280, height: 900 },
    { name: 'mobile', width: 390, height: 844, mobile: true },
    { name: 'mobile-small', width: 320, height: 740, mobile: true },
    { name: 'desktop-zoom-200-equivalent', width: 720, height: 500 },
  ];
  for (const viewport of viewports) {
    const context = await openPage(viewport);
    await layout(context, viewport.name);
    const content = await visibleContent(context);
    record('single visible home heading and readable content', content.h1Count === 1 && content.h1Visible && content.mainCharacters > 500, content, viewport.name);
    const anchors = await context.evaluate(`(() => { const anchors = [...document.querySelectorAll('a[href]')].map(a => ({href:a.getAttribute('href'),url:new URL(a.href)})).filter(a => a.url.origin === location.origin && a.url.pathname === location.pathname && a.url.hash); return anchors.map(a => ({href:a.href,targetExists:!!document.getElementById(decodeURIComponent(a.url.hash.slice(1)))})); })()`);
    record('all same-page anchors resolve', anchors.length > 0 && anchors.every(anchor => anchor.targetExists), anchors, viewport.name);
    const images = await context.evaluate(`([...document.images].map(image => ({src: image.currentSrc || image.src, loaded: image.complete && image.naturalWidth > 0})))`);
    record('images decode', images.every(image => image.loaded), images, viewport.name);
    await screenshot(context, `${viewport.name}.png`);
    if (viewport.name === 'desktop') {
      if (flags.includes('--full-page')) await screenshot(context, 'desktop-full.png', true);
      const resources = await context.evaluate(`(async () => {
        const urls = [...new Set([...document.querySelectorAll('link[rel="stylesheet"][href],script[src],img[src]')].map(element => element.href || element.currentSrc || element.src).filter(url => new URL(url).origin === location.origin))];
        return Promise.all(urls.map(async url => { try { const response = await fetch(url, {cache:'no-store'}); return {url,status:response.status}; } catch(error) { return {url,error:error.message}; } }));
      })()`);
      record('local stylesheets, scripts, and images return HTTP 200', resources.length > 0 && resources.every(resource => resource.status === 200), resources);
      const links = await context.evaluate(`(async () => {
        const targets = ['/resume', '/career', '/portfolio', '/pdf/seo-minjae-resume.pdf'];
        return Promise.all(targets.map(async target => {
          const anchor = [...document.querySelectorAll('a[href]')].find(a => a.origin === location.origin && a.pathname.replace(/\\/$/, '') === target);
          if (!anchor) return {target,linked:false};
          try { const response = await fetch(anchor.href); return {target,linked:true,status:response.status,contentType:response.headers.get('content-type')}; } catch(error) { return {target,linked:true,error:error.message}; }
        }));
      })()`);
      record('resume, career, portfolio, and resume PDF links work', links.every(link => link.linked && link.status === 200 && (link.target.endsWith('.pdf') ? link.contentType?.includes('pdf') : link.contentType?.includes('html'))), links);
      const scene = await context.evaluate(`(() => { const canvas = document.createElement('canvas'); const supported = !!(canvas.getContext('webgl2') || canvas.getContext('webgl')); const scene = document.getElementById('system-scene'); return {supported,present:!!scene,renderer:scene?.dataset.renderer || scene?.closest('[data-scene]')?.dataset.renderer}; })()`);
      if (baseline && !scene.present) skip('WebGL scene and controls', 'Baseline has no system-scene.');
      else {
        record('WebGL renderer initializes when available', scene.present && (!scene.supported || scene.renderer === 'webgl'), scene);
        const controls = await context.evaluate(`[...document.querySelectorAll('[data-scene-view]')].map(button => ({view:button.dataset.sceneView,label:button.textContent.trim(),disabled:button.disabled}))`);
        for (const view of ['system', 'data', 'recovery']) {
          const control = controls.find(button => button.view === view);
          if (!control) { record(`scene view ${view}`, false, {reason:'Missing scene view control'}); continue; }
          await click(context, `[data-scene-view="${view}"]`);
          await pause(180);
          const state = await context.evaluate(`(() => { const button = document.querySelector('[data-scene-view="${view}"]'); const scene = document.getElementById('system-scene'); return {pressed:button.getAttribute('aria-pressed'),selected:button.getAttribute('aria-selected'),sceneView:scene?.dataset.view || scene?.closest('[data-scene]')?.dataset.sceneState,activeButtons:[...document.querySelectorAll('[data-scene-view]')].filter(button => button.getAttribute('aria-pressed') === 'true' || button.getAttribute('aria-selected') === 'true').map(button => button.dataset.sceneView)}; })()`);
          record(`scene view ${view}`, (state.pressed === 'true' || state.selected === 'true') && state.activeButtons.length === 1 && state.activeButtons[0] === view && (!state.sceneView || state.sceneView === view), state);
        }
        const toggle = await context.evaluate(`(() => {const button = document.querySelector('[data-scene-toggle]'); return button ? {label:button.textContent.trim(),pressed:button.getAttribute('aria-pressed'),disabled:button.disabled} : null;})()`);
        if (!toggle) record('scene motion toggle', false, {reason:'Missing scene motion control'});
        else if (!scene.supported) skip('scene motion toggle', 'WebGL is unavailable in this browser; fallback tested separately.');
        else {
          await click(context, '[data-scene-toggle]');
          // A recently selected view may finish its finite transition after rotation pauses.
          const settlingStart=Date.now();
          let previousFrames=await context.evaluate('window.__archiveRafCallbacks');
          while(Date.now()-settlingStart<2500) {
            await pause(150);
            const frames=await context.evaluate('window.__archiveRafCallbacks');
            if(frames===previousFrames) break;
            previousFrames=frames;
          }
          const stopped = await context.evaluate(`({label:document.querySelector('[data-scene-toggle]').textContent.trim(),pressed:document.querySelector('[data-scene-toggle]').getAttribute('aria-pressed'),frames:window.__archiveRafCallbacks})`);
          await pause(400);
          const framesAfter = await context.evaluate('window.__archiveRafCallbacks');
          record('scene motion pauses after view transition settles', framesAfter - stopped.frames <= 1 && (toggle.label !== stopped.label || toggle.pressed !== stopped.pressed), {before:toggle,after:stopped,framesAfter,settlingMilliseconds:Date.now()-settlingStart-400});
          await click(context, '[data-scene-toggle]');
          await pause(400);
          const resumed = await context.evaluate(`({label:document.querySelector('[data-scene-toggle]').textContent.trim(),pressed:document.querySelector('[data-scene-toggle]').getAttribute('aria-pressed'),frames:window.__archiveRafCallbacks})`);
          record('scene motion resumes', resumed.frames > framesAfter && resumed.label === toggle.label && resumed.pressed === toggle.pressed, resumed);
        }
        await screenshot(context, 'scene-recovery.png');
      }
    }
    await context.close();
  }
  const keyboard = await openPage();
  await keyboard.page('Input.dispatchKeyEvent', { type:'keyDown', key:'Tab', code:'Tab', windowsVirtualKeyCode:9 });
  await keyboard.page('Input.dispatchKeyEvent', { type:'keyUp', key:'Tab', code:'Tab', windowsVirtualKeyCode:9 });
  const skipFocus = await keyboard.evaluate(`(() => {const element=document.activeElement; const rect=element.getBoundingClientRect(); return {tag:element.tagName,href:element.getAttribute('href'),label:element.textContent.trim(),top:rect.top,bottom:rect.bottom};})()`);
  await screenshot(keyboard, 'keyboard-skip.png');
  await keyboard.page('Input.dispatchKeyEvent', { type:'keyDown', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
  await keyboard.page('Input.dispatchKeyEvent', { type:'keyUp', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
  await pause(200);
  const skipResult = await keyboard.evaluate(`({hash:location.hash,activeId:document.activeElement.id,activeTag:document.activeElement.tagName,inMain:!!document.activeElement.closest('main')})`);
  record('keyboard skip link moves focus to main', skipFocus.href?.startsWith('#') && skipFocus.top >= 0 && skipFocus.bottom > 0 && skipResult.hash === skipFocus.href && skipResult.inMain, {focused:skipFocus,afterEnter:skipResult});
  await keyboard.close();
  for(const clipboardMode of ['success','denied-with-fallback','denied','denied-throws']) {
    const context=await openPage({clipboardMode,width:390,height:844,mobile:true});
    const expectedEmail=await context.evaluate(`document.querySelector('a[href^="mailto:"]')?.getAttribute('href').slice(7)`);
    await click(context,'[data-copy-email]');
    await pause(150);
    const result=await context.evaluate(`({probe:window.__archiveClipboardProbe,feedback:document.querySelector('.toast')?.textContent.trim(),visible:document.querySelector('.toast')?.classList.contains('is-visible'),temporaryInputs:document.querySelectorAll('textarea[readonly]').length,focusRetained:document.activeElement.matches('[data-copy-email]'),mailto:document.querySelector('a[href^="mailto:"]')?.getAttribute('href')})`);
    const shouldCopy=['success','denied-with-fallback'].includes(clipboardMode);
    record(`email copy ${clipboardMode}`, result.probe.writes.length===1 && result.probe.writes[0]===expectedEmail && result.visible && result.temporaryInputs===0 && (clipboardMode==='success' ? result.probe.fallbacks.length===0 : result.probe.fallbacks.length===1 && result.probe.fallbacks[0]===expectedEmail) && (shouldCopy ? result.feedback==='이메일 주소를 복사했습니다.' : result.feedback===`이메일: ${expectedEmail}` && result.mailto===`mailto:${expectedEmail}`), {...result,fixture:'Injected clipboard API success/rejection and legacy copy result; no OS clipboard claim.'});
    record(`email copy ${clipboardMode} preserves keyboard focus`,result.focusRetained,{focusRetained:result.focusRetained});
    await screenshot(context,`clipboard-${clipboardMode}.png`);
    await context.close();
  }
  const reduced = await openPage({ reduced:true });
  const reducedBefore = await reduced.evaluate('window.__archiveRafCallbacks');
  await pause(600);
  const motion = await reduced.evaluate(`({reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,frames:window.__archiveRafCallbacks,animations:document.getAnimations().filter(animation => animation.playState === 'running' && animation.effect.getComputedTiming().duration > 1).map(animation => ({type:animation.constructor.name,duration:animation.effect.getComputedTiming().duration})),cssAnimations:[...document.querySelectorAll('*')].filter(element => {const style=getComputedStyle(element); return style.animationName !== 'none' && style.animationDuration.split(',').some(duration => parseFloat(duration) > 0.001);}).map(element => ({tag:element.tagName,id:element.id})).slice(0,20)})`);
  record('reduced motion stops persistent animation', motion.reduced && motion.frames - reducedBefore <= 1 && motion.animations.length === 0 && motion.cssAnimations.length === 0, {sampleMilliseconds:600,framesBefore:reducedBefore,...motion});
  await screenshot(reduced, 'reduced-motion.png');
  await reduced.close();
  const noScript = await openPage({ javascript:false, width:390, height:844, mobile:true });
  const noScriptContent = await visibleContent(noScript);
  record('JavaScript-disabled home remains readable', noScriptContent.h1Count === 1 && noScriptContent.h1Visible && noScriptContent.mainCharacters > 500 && noScriptContent.sectionHeadings.length > 0 && noScriptContent.sectionHeadings.every(heading => heading.visible), noScriptContent);
  await layout(noScript, 'javascript-disabled-mobile');
  await screenshot(noScript, 'javascript-disabled.png');
  await noScript.close();
  const fallback = await openPage({ noWebGL:true });
  const fallbackState = await fallback.evaluate(`(() => {
    const scene=document.getElementById('system-scene');
    const candidates=[...document.querySelectorAll('.scene-fallback,[data-scene-fallback],.system-scene__fallback,.scene-poster')];
    const visible=element => {const rect=element.getBoundingClientRect(); let current=element; while(current) {const style=getComputedStyle(current); if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0) return false; current=current.parentElement;} return rect.width>0&&rect.height>0;};
    return {present:!!scene,renderer:scene?.dataset.renderer || scene?.closest('[data-scene]')?.dataset.renderer,fallbacks:candidates.map(element=>({tag:element.tagName,text:element.textContent.trim().slice(0,200),visible:visible(element)})),mainVisible:visible(document.querySelector('main'))};
  })()`);
  if (baseline && !fallbackState.present) skip('forced WebGL-unavailable fallback', 'Baseline has no system-scene.');
  else record('forced WebGL-unavailable fallback remains visible', fallbackState.present && fallbackState.renderer !== 'webgl' && fallbackState.mainVisible && fallbackState.fallbacks.some(item => item.visible), fallbackState);
  await screenshot(fallback, 'webgl-fallback.png');
  await fallback.close();
  record('no uncaught browser JavaScript exceptions', exceptions.length === 0, exceptions);
  const failedResponses = responses.filter(response => response.status >= 400);
  record('no local HTTP errors during browser journeys', failedResponses.length === 0, failedResponses);
} catch (error) {
  record('browser verification completed', false, {error:error.stack || error.message});
} finally {
  for (const entry of pending.values()) clearTimeout(entry.timer);
  socket?.close();
  if (chrome && chrome.exitCode === null) {
    const exited = new Promise(resolve => chrome.once('exit', resolve));
    chrome.kill('SIGTERM');
    await Promise.race([exited, pause(2000)]);
    if (chrome.exitCode === null) { chrome.kill('SIGKILL'); await Promise.race([exited, pause(2000)]); }
  }
  await rm(profile, {recursive:true,force:true});
  const failed = checks.filter(check => check.status === 'fail');
  const evidence = {
    origin, baseline, capturedAt:new Date().toISOString(), browser:browser?.product,
    viewportEmulation:true, checks, screenshots, exceptions, networkFailures,
    limitations:[
      'Screenshots are captured artifacts; this script does not claim visual inspection.',
      'Viewport emulation does not establish physical-device behavior or full accessibility conformance.',
      'The 720×500 desktop viewport tests the reflow space equivalent to 1440×1000 at 200% zoom; browser chrome zoom itself is not exercised.',
      'Clipboard scenarios inject browser API outcomes and check payload, feedback, and cleanup; they do not establish OS clipboard integration.',
      'requestAnimationFrame counts observe callbacks during a bounded sample, not frame rate or all possible timers.',
      'WebGL fallback is injected before page scripts; it does not emulate every hardware or context-loss failure.',
      'Read-only page and PDF GET requests do not verify admin editing or production writes.',
    ],
  };
  await writeFile(path.join(output,'browser.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({output,passed:checks.filter(check=>check.status==='pass').length,failed:failed.length,notTested:checks.filter(check=>check.status==='not-tested').length,failures:failed.map(check=>({name:check.name,scope:check.scope,observed:check.observed}))},null,2));
  if (failed.length) process.exitCode=1;
}
