import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../assets/system-scene.js', import.meta.url), 'utf8');

function scene({ reduced = false, webgl = true, shaderCompiles = true } = {}) {
  const eventTarget = (properties = {}) => {
    const listeners = new Map();
    return {
      ...properties,
      addEventListener(name, callback) {
        const callbacks = listeners.get(name) || [];
        callbacks.push(callback);
        listeners.set(name, callbacks);
      },
      emit(name, event = {}) {
        for (const callback of listeners.get(name) || []) callback(event);
      },
    };
  };
  const element = (properties = {}) => eventTarget({
    attributes: {}, dataset: {}, style: {}, hidden: false,
    setAttribute(name, value) { this.attributes[name] = value; },
    ...properties,
  });
  const motion = eventTarget({ matches: reduced });
  const pointer = { matches: false };
  const toggle = element({ querySelector: () => null });
  const description = element();
  const views = ['system', 'data', 'recovery'].map((value) => element({ dataset: { sceneView: value } }));
  const host = element({ querySelector: () => toggle, getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 570 }) });
  const uploaded = [];
  const modelMatrices = [];
  let programs = 0;
  let draws = 0;
  const gl = {
    ARRAY_BUFFER: 1, STATIC_DRAW: 2, TRIANGLES: 3, LINES: 4,
    VERTEX_SHADER: 5, FRAGMENT_SHADER: 6, COMPILE_STATUS: 7, LINK_STATUS: 8,
    COLOR_BUFFER_BIT: 16, DEPTH_BUFFER_BIT: 32, DEPTH_TEST: 9, BLEND: 10,
    SRC_ALPHA: 11, ONE_MINUS_SRC_ALPHA: 12, FLOAT: 13,
    createShader: () => ({}), shaderSource() {}, compileShader() {},
    getShaderParameter: () => shaderCompiles,
    createProgram: () => ({ id: ++programs }), attachShader() {}, linkProgram() {},
    getProgramParameter: () => true, useProgram() {},
    createBuffer: () => ({}), bindBuffer() {},
    bufferData(_target, data) { uploaded.push(data); },
    getAttribLocation: (_program, name) => name === 'aPosition' ? 0 : 1,
    getUniformLocation: (_program, name) => name,
    deleteBuffer() {}, deleteShader() {}, deleteProgram() {},
    viewport() {}, clearColor() {}, clear() {}, enable() {}, blendFunc() {},
    uniformMatrix4fv(name, _transpose, value) { if (name === 'uModel') modelMatrices.push([...value]); },
    uniform3fv() {}, enableVertexAttribArray() {}, vertexAttribPointer() {}, uniform1f() {},
    drawArrays() { draws += 1; }, depthMask() {},
  };
  const canvas = element({
    closest: () => host,
    getContext: () => webgl ? gl : null,
    getBoundingClientRect: () => ({ width: 600, height: 570 }),
  });
  const document = eventTarget({
    hidden: false,
    querySelector: (selector) => selector === '#system-scene' ? canvas : selector === '[data-scene-description]' ? description : toggle,
    querySelectorAll: () => views,
  });
  const frames = new Map();
  let nextFrame = 0;
  let visibilityObserver;
  class ResizeObserver { observe() {} }
  class IntersectionObserver {
    constructor(callback) { visibilityObserver = callback; }
    observe() {}
  }
  const window = eventTarget({
    matchMedia: (query) => query.includes('reduced-motion') ? motion : pointer,
    devicePixelRatio: 3, ResizeObserver, IntersectionObserver,
    requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  vm.runInNewContext(source, { document, window, ResizeObserver, IntersectionObserver });
  let now = 0;
  return {
    canvas, host, toggle, views, description, document, motion, uploaded, modelMatrices,
    get draws() { return draws; },
    get programs() { return programs; },
    get pendingFrames() { return frames.size; },
    step() {
      now += 16;
      const current = [...frames.values()];
      frames.clear();
      for (const callback of current) callback(now);
    },
    intersect(value) { visibilityObserver([{ isIntersecting: value }]); },
  };
}

test('missing WebGL or rejected shaders preserve the fallback and disable motion', () => {
  for (const options of [{ webgl: false }, { shaderCompiles: false }]) {
    const app = scene(options);
    assert.equal(app.host.dataset.renderer, 'fallback');
    assert.equal(app.canvas.hidden, true);
    assert.equal(app.toggle.disabled, true);
    assert.equal(app.pendingFrames, 0);
  }
});

test('rendering uploads finite geometry, caps the pixel ratio, and keeps one animation frame', () => {
  const app = scene();
  assert.equal(app.host.dataset.renderer, 'webgl');
  assert.equal(app.canvas.width, 1020);
  assert.equal(app.canvas.height, 969);
  assert.ok(app.uploaded.length > 5);
  assert.ok(app.uploaded.every((buffer) => buffer.length % 6 === 0 && buffer.every(Number.isFinite)));
  for (let i = 0; i < 5; i += 1) app.step();
  assert.ok(app.draws > 0);
  assert.ok(app.modelMatrices.every((matrix) => matrix.length === 16 && matrix.every(Number.isFinite)));
  assert.equal(app.pendingFrames, 1);
});

test('pause stops the loop and resume schedules a single new frame', () => {
  const app = scene();
  app.step();
  app.toggle.emit('click');
  app.step();
  assert.equal(app.toggle.attributes['aria-pressed'], 'true');
  assert.match(app.toggle.attributes['aria-label'], /재생/);
  assert.equal(app.pendingFrames, 0);
  const pausedDraws = app.draws;
  app.step();
  assert.equal(app.draws, pausedDraws);
  app.toggle.emit('click');
  assert.equal(app.toggle.attributes['aria-pressed'], 'false');
  assert.equal(app.pendingFrames, 1);
  app.step();
  assert.ok(app.draws > pausedDraws);
});

test('pausing during a view and pointer transition freezes the displayed transforms immediately', () => {
  const app = scene();
  app.step();
  app.views[2].emit('click');
  app.host.emit('pointermove', { clientX: 540, clientY: 500, pointerType: 'mouse' });
  const previousFrameStart = app.modelMatrices.length;
  app.step();
  const displayed = app.modelMatrices.slice(previousFrameStart);
  app.toggle.emit('click');
  assert.equal(app.pendingFrames, 0, 'pause must cancel unsettled interpolation, not let it finish');
  app.host.emit('pointermove', { clientX: 100, clientY: 100, pointerType: 'mouse' });
  assert.equal(app.pendingFrames, 0, 'pointer interaction must not restart a paused scene');
  app.intersect(false);
  app.intersect(true);
  const redrawnFrameStart = app.modelMatrices.length;
  app.step();
  assert.deepEqual(app.modelMatrices.slice(redrawnFrameStart), displayed, 'a visibility redraw must preserve every frozen transform');
  assert.equal(app.pendingFrames, 0);
});

test('a deliberate view change while paused renders its final state in one frame', () => {
  const app = scene();
  app.step();
  app.toggle.emit('click');
  const frameStart = app.modelMatrices.length;
  app.views[1].emit('click');
  app.step();
  assert.equal(app.pendingFrames, 0);
  assert.equal(app.host.dataset.sceneState, 'data');
  const rootMatrix = app.modelMatrices[frameStart];
  const staticScene = scene({ reduced: true });
  staticScene.views[1].emit('click');
  staticScene.step();
  // One active frame advances the decorative sway by 16.7 ms; allow that frozen offset.
  assert.ok(Math.abs(rootMatrix[0] - staticScene.modelMatrices[0][0]) < 0.001);
  assert.ok(Math.abs(rootMatrix[2] - staticScene.modelMatrices[0][2]) < 0.001);
  assert.equal(app.toggle.attributes['aria-pressed'], 'true');
});

test('reduced motion renders static states while the latest repeated view choice wins', () => {
  const app = scene({ reduced: true });
  app.step();
  assert.equal(app.pendingFrames, 0);
  assert.equal(app.toggle.disabled, true);
  const initialModel = app.modelMatrices[0];
  const nextFrameStart = app.modelMatrices.length;
  app.views[1].emit('click');
  app.views[2].emit('click');
  app.step();
  assert.equal(app.host.dataset.sceneState, 'recovery');
  assert.equal(app.description.textContent, '실패한 단계의 상태를 남겨, 필요한 업무부터 다시 실행합니다.');
  assert.deepEqual(app.views.map((button) => button.attributes['aria-pressed']), ['false', 'false', 'true']);
  assert.notDeepEqual(app.modelMatrices[nextFrameStart], initialModel);
  assert.equal(app.pendingFrames, 0);
});

test('offscreen and hidden scenes suspend drawing and resume without duplicate loops', () => {
  const app = scene();
  app.step();
  app.intersect(false);
  assert.equal(app.pendingFrames, 0);
  app.intersect(true);
  app.intersect(true);
  assert.equal(app.pendingFrames, 1);
  app.document.hidden = true;
  app.document.emit('visibilitychange');
  assert.equal(app.pendingFrames, 0);
  app.document.hidden = false;
  app.document.emit('visibilitychange');
  assert.equal(app.pendingFrames, 1);
});

test('context loss exposes fallback and restoration rebuilds a single live renderer', () => {
  const app = scene();
  app.step();
  let prevented = false;
  app.canvas.emit('webglcontextlost', { preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(app.host.dataset.renderer, 'fallback');
  assert.equal(app.canvas.hidden, true);
  assert.equal(app.pendingFrames, 0);
  app.canvas.emit('webglcontextrestored');
  assert.equal(app.host.dataset.renderer, 'webgl');
  assert.equal(app.canvas.hidden, false);
  assert.equal(app.programs, 2);
  assert.equal(app.pendingFrames, 1);
  app.step();
  assert.equal(app.pendingFrames, 1);
});
