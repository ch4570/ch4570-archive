import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../assets/portrait-terminal.js", import.meta.url), "utf8");

function portrait({ reduced = false, fine = true } = {}) {
  function eventTarget(properties = {}) {
    const listeners = new Map();
    return {
      ...properties,
      listeners,
      addEventListener(name, callback, options) {
        const values = listeners.get(name) || [];
        values.push({ callback, options });
        listeners.set(name, values);
      },
      emit(name, event = {}) {
        for (const { callback } of listeners.get(name) || []) callback(event);
      },
    };
  }
  function element(properties = {}) {
    return eventTarget({
      dataset: {}, attributes: {}, hidden: false, parent: null,
      style: { setProperty(name, value) { this[name] = value; } },
      setAttribute(name, value) { this.attributes[name] = value; },
      contains(node) {
        while (node) {
          if (node === this) return true;
          node = node.parent;
        }
        return false;
      },
      closest() {
        if (this.interactive) return this;
        let node = this.parent;
        while (node) {
          if (node.interactive) return node;
          node = node.parent;
        }
        return null;
      },
      ...properties,
    });
  }
  const label = element();
  const toggle = element({ querySelector: () => label });
  const controls = element({ hidden: true });
  const views = ["angled", "front"].map((view) => element({ dataset: { portraitView: view } }));
  const device = element();
  const main = element({ interactive: true, attributes: { tabindex: "-1" } });
  const root = element({
    parent: main,
    querySelector(selector) {
      return {
        "[data-portrait-controls]": controls,
        "[data-portrait-toggle]": toggle,
      }[selector] || null;
    },
    querySelectorAll: () => views,
  });
  const stage = element({
    querySelector: (selector) => selector === "[data-portrait-device]" ? device : null,
    closest: (selector) => selector === "[data-portrait-root]" ? root : null,
    getBoundingClientRect: () => ({ left: 100, top: 100, width: 800, height: 500 }),
  });
  stage.parent = root;
  device.parent = stage;
  controls.parent = root;
  toggle.parent = controls;
  for (const button of views) button.parent = controls;
  const link = element({ interactive: true, parent: device });
  const image = element({ parent: device });
  const motion = eventTarget({ matches: reduced });
  const pointer = eventTarget({ matches: fine });
  const document = eventTarget({ hidden: false, querySelector: () => stage });
  const frames = new Map();
  let sequence = 0;
  let now = 0;
  let intersection;
  class IntersectionObserver {
    constructor(callback) { intersection = callback; }
    observe() {}
  }
  const window = eventTarget({
    matchMedia: (query) => query.includes("reduced-motion") ? motion : pointer,
    IntersectionObserver,
    requestAnimationFrame(callback) { frames.set(++sequence, callback); return sequence; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  vm.runInNewContext(source, { document, window });
  return {
    main, root, device, stage, controls, views, toggle, label, document, motion, pointer, image, link,
    get pendingFrames() { return frames.size; },
    get angles() {
      return ["--portrait-rx", "--portrait-ry"].map((name) => parseFloat(device.style[name]));
    },
    step(delta = 16) {
      now += delta;
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback(now);
    },
    settle() {
      for (let i = 0; i < 180 && frames.size; i += 1) this.step();
      assert.equal(frames.size, 0, "interpolation must settle without an idle loop");
    },
    move(x, y, target = image, pointerType = "mouse") {
      stage.emit("pointermove", { clientX: x, clientY: y, target, pointerType });
    },
    intersect(visible) { intersection([{ isIntersecting: visible }]); },
  };
}

test("portrait starts angled with no idle animation, and pointer tilt stays bounded", () => {
  const app = portrait();
  assert.deepEqual(app.angles, [-5, -10]);
  assert.equal(app.controls.hidden, false);
  assert.equal(app.pendingFrames, 0);
  app.move(10000, -10000);
  app.move(10000, -10000);
  assert.equal(app.pendingFrames, 1);
  app.settle();
  assert.deepEqual(app.angles, [0, -2]);
  app.stage.emit("pointerleave");
  app.settle();
  assert.deepEqual(app.angles, [-5, -10]);
});

test("a focusable main ancestor does not suppress hover, while links inside the device freeze it", () => {
  const app = portrait();
  assert.equal(app.image.closest(), app.main, "the page main is focusable for skip navigation");
  assert.equal(app.device.contains(app.main), false);
  app.move(800, 500);
  app.step();
  assert.notDeepEqual(app.angles, [-5, -10], "hover over the portrait must still tilt the device");
  assert.equal(app.pendingFrames, 1);
  const frozen = app.angles;
  app.move(800, 500, app.link);
  assert.equal(app.pendingFrames, 0);
  assert.deepEqual(app.angles, frozen, "a link inside the device keeps its click target stable");
});

test("view selection changes the actual orientation and the latest choice owns selection", () => {
  const app = portrait();
  assert.equal(app.stage.contains(app.controls), false, "controls live outside the pointer hit area");
  assert.equal(app.root.contains(app.controls), true);
  app.controls.emit("pointermove", { clientX: 100, clientY: 100, target: app.views[1], pointerType: "mouse" });
  app.views[1].emit("focusin", { target: app.views[1] });
  assert.deepEqual(app.angles, [-5, -10], "control hover and focus do not change the view");
  assert.equal(app.pendingFrames, 0);
  app.views[1].emit("click");
  app.views[0].emit("click");
  app.views[1].emit("click");
  app.settle();
  assert.deepEqual(app.angles, [0, 0]);
  assert.equal(app.stage.dataset.portraitView, "front");
  assert.deepEqual(app.views.map((view) => view.attributes["aria-pressed"]), ["false", "true"]);
  app.views[0].emit("click");
  app.settle();
  assert.deepEqual(app.angles, [-5, -10]);
});

test("pause freezes the displayed transform, and explicit view selection remains available", () => {
  const app = portrait();
  app.move(800, 500);
  app.step();
  const frozen = app.angles;
  app.toggle.emit("click");
  assert.equal(app.pendingFrames, 0);
  assert.equal(app.toggle.attributes["aria-pressed"], "true");
  assert.equal(app.stage.dataset.portraitMotion, "paused");
  app.move(200, 100);
  app.stage.emit("pointerleave");
  app.intersect(false);
  app.intersect(true);
  assert.deepEqual(app.angles, frozen);
  assert.equal(app.pendingFrames, 0);
  app.views[1].emit("click");
  assert.deepEqual(app.angles, [0, 0]);
  assert.equal(app.pendingFrames, 0);
  app.toggle.emit("click");
  assert.equal(app.toggle.attributes["aria-pressed"], "false");
  app.move(100, 100);
  assert.equal(app.pendingFrames, 1);
});

test("reduced motion is static, supports explicit views, and reacts to runtime preference changes", () => {
  const app = portrait({ reduced: true });
  assert.deepEqual(app.angles, [0, 0]);
  assert.equal(app.toggle.disabled, true);
  app.move(800, 500);
  assert.equal(app.pendingFrames, 0);
  app.views[0].emit("click");
  assert.deepEqual(app.angles, [-5, -10]);
  assert.equal(app.pendingFrames, 0);
  app.motion.matches = false;
  app.motion.emit("change");
  app.move(800, 500);
  assert.equal(app.pendingFrames, 1);
  app.motion.matches = true;
  app.motion.emit("change");
  assert.deepEqual(app.angles, [0, 0]);
  assert.equal(app.pendingFrames, 0);
  assert.equal(app.stage.dataset.portraitMotion, "reduced");
});

test("coarse and touch pointers preserve scrolling while the view buttons still work", () => {
  const app = portrait({ fine: false });
  const original = app.angles;
  app.move(800, 500, app.image, "touch");
  assert.deepEqual(app.angles, original);
  assert.equal(app.pendingFrames, 0);
  assert.equal(app.toggle.disabled, true);
  app.views[1].emit("click");
  assert.deepEqual(app.angles, [0, 0]);
  assert.equal(app.pendingFrames, 0);
  for (const type of ["pointermove", "pointerdown", "pointerleave"]) {
    for (const entry of app.stage.listeners.get(type) || []) assert.equal(entry.options?.passive, true);
  }
  const fine = portrait();
  fine.move(800, 500, fine.image, "touch");
  assert.equal(fine.pendingFrames, 0);
});

test("hidden and offscreen transitions stop work and resume one unsettled frame", () => {
  const app = portrait();
  app.move(800, 500);
  app.step();
  app.intersect(false);
  assert.equal(app.pendingFrames, 0);
  app.intersect(true);
  app.intersect(true);
  assert.equal(app.pendingFrames, 1);
  app.document.hidden = true;
  app.document.emit("visibilitychange");
  assert.equal(app.pendingFrames, 0);
  app.document.hidden = false;
  app.document.emit("visibilitychange");
  app.document.emit("visibilitychange");
  assert.equal(app.pendingFrames, 1);
  app.settle();
});

test("keyboard focus faces the content forward and pointer press never moves a link", () => {
  const app = portrait();
  app.document.emit("keydown", { key: "Tab" });
  app.device.emit("focusin", { target: app.link });
  assert.deepEqual(app.angles, [0, 0]);
  app.move(800, 500);
  assert.deepEqual(app.angles, [0, 0]);
  assert.equal(app.pendingFrames, 0);
  app.device.emit("focusout", { relatedTarget: null });
  app.settle();
  app.move(800, 500);
  app.step();
  const position = app.angles;
  app.move(800, 500, app.link);
  assert.equal(app.pendingFrames, 0);
  app.document.emit("pointerdown", { target: app.link });
  app.stage.emit("pointerdown", { target: app.link });
  app.device.emit("focusin", { target: app.link });
  assert.deepEqual(app.angles, position);
  app.move(100, 100);
  assert.deepEqual(app.angles, position);
  assert.equal(app.pendingFrames, 0);
});
