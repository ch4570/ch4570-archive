import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(
  new URL("../assets/archive-terminal.js", import.meta.url),
  "utf8",
);

function setup({
  reduced = false,
  renderer = "webgl",
  missing = [],
  inertScene = false,
  supported = true,
  deferClose = false,
} = {}) {
  let document;
  const closeEvents = [];
  const dataKey = (name) =>
    name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  class Element {
    constructor(tag = "div", attributes = {}) {
      this.tagName = tag.toUpperCase();
      this.attributes = {};
      this.dataset = {};
      this.children = [];
      this.listeners = new Map();
      this.parentElement = null;
      this.value = "";
      this.hidden = false;
      this.disabled = false;
      this.open = false;
      this.selectionStart = 0;
      this.selectionEnd = 0;
      for (const [name, value] of Object.entries(attributes))
        this.setAttribute(name, value);
    }
    get isConnected() {
      return this === document || Boolean(this.parentElement);
    }
    get firstElementChild() {
      return this.children[0];
    }
    get textContent() {
      return this.children.length
        ? this.children.map((child) => child.textContent).join(" ")
        : this.text || "";
    }
    set textContent(value) {
      this.replaceChildren();
      this.text = value;
    }
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name.startsWith("data-")) this.dataset[dataKey(name)] = String(value);
    }
    getAttribute(name) {
      return this.attributes[name] ?? null;
    }
    hasAttribute(name) {
      return Object.hasOwn(this.attributes, name);
    }
    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
      return child;
    }
    replaceChildren(...children) {
      for (const child of this.children) child.parentElement = null;
      this.children = [];
      for (const child of children) this.appendChild(child);
    }
    remove() {
      const siblings = this.parentElement?.children;
      if (siblings) siblings.splice(siblings.indexOf(this), 1);
      this.parentElement = null;
    }
    matches(selector) {
      if (selector.includes(","))
        return selector.split(",").some((part) => this.matches(part.trim()));
      const attribute = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
      if (!attribute) return this.tagName === selector.toUpperCase();
      const value = attribute[1].startsWith("data-")
        ? this.dataset[dataKey(attribute[1])]
        : this.attributes[attribute[1]];
      return (
        value !== undefined &&
        (attribute[2] === undefined || value === attribute[2])
      );
    }
    querySelectorAll(selector) {
      return this.children.flatMap((child) => [
        ...(child.matches(selector) ? [child] : []),
        ...child.querySelectorAll(selector),
      ]);
    }
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }
    closest(selector) {
      return this.matches(selector)
        ? this
        : this.parentElement?.closest(selector) || null;
    }
    contains(node) {
      return (
        node === this || this.children.some((child) => child.contains(node))
      );
    }
    addEventListener(name, callback) {
      const handlers = this.listeners.get(name) || [];
      handlers.push(callback);
      this.listeners.set(name, handlers);
    }
    emit(name, properties = {}) {
      const event = {
        target: this,
        key: "",
        defaultPrevented: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
        ...properties,
      };
      const dispatch = (element) => {
        for (const callback of element.listeners.get(name) || [])
          callback(event);
        if (
          element.parentElement &&
          ["click", "keydown", "submit", "input"].includes(name)
        )
          dispatch(element.parentElement);
      };
      dispatch(this);
      return event;
    }
    focus(options) {
      document.activeElement = this;
      this.focusOptions = options;
    }
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    }
    scrollIntoView(options) {
      this.scrollOptions = options;
    }
    getBoundingClientRect() {
      return { left: 100, right: 600, top: 100, bottom: 500 };
    }
    click() {
      if (!this.disabled) this.emit("click", { clientX: 200, clientY: 200 });
    }
    showModal() {
      this.previousFocus = document.activeElement;
      this.open = true;
    }
    close() {
      if (!this.open) return;
      this.open = false;
      this.previousFocus?.focus({ preventScroll: true });
      if (deferClose) closeEvents.push(() => this.emit("close"));
      else this.emit("close");
    }
  }
  document = new Element("document");
  document.createElement = (tag) => new Element(tag);
  document.getElementById = (id) =>
    document
      .querySelectorAll("[id]")
      .find((element) => element.getAttribute("id") === id) || null;
  const add = (parent, tag, attributes = {}) =>
    parent.appendChild(new Element(tag, attributes));
  const opener = add(document, "button", { "data-terminal-open": "" });
  opener.hidden = true;
  const dialog = add(document, "dialog", { "data-terminal-dialog": "" });
  if (!supported) dialog.showModal = undefined;
  const form = add(dialog, "form", { "data-terminal-form": "" });
  const input = add(form, "input", { "data-terminal-input": "" });
  const output = add(dialog, "div", {
    "data-terminal-output": "",
    role: "log",
    "aria-live": "polite",
  });
  const closeButton = add(dialog, "button", { "data-terminal-close": "" });
  const sections = {};
  for (const id of [
    "top",
    "work",
    "career",
    "activity",
    "documents",
    "contact",
  ]) {
    if (missing.includes(id)) continue;
    sections[id] = add(document, "section", { id });
    add(sections[id], id === "top" ? "h1" : "h2").textContent = `${id} heading`;
  }
  const host = add(document, "div", { "data-scene": "" });
  host.dataset.renderer = renderer;
  const views = {};
  for (const name of ["system", "data", "recovery"]) {
    views[name] = add(host, "button", {
      "data-scene-view": name,
      "aria-pressed": String(name === "system"),
    });
    if (!inertScene)
      views[name].addEventListener("click", () => {
        for (const [key, button] of Object.entries(views))
          button.setAttribute("aria-pressed", String(key === name));
        host.dataset.sceneState = name;
      });
  }
  const toggle = add(host, "button", {
    "data-scene-toggle": "",
    "aria-pressed": String(reduced),
  });
  toggle.disabled = reduced;
  let toggleClicks = 0;
  toggle.addEventListener("click", () => {
    toggleClicks++;
    if (!inertScene)
      toggle.setAttribute(
        "aria-pressed",
        String(toggle.getAttribute("aria-pressed") !== "true"),
      );
  });
  const location = { hash: "" };
  const motion = { matches: reduced };
  const window = {
    location,
    matchMedia: () => motion,
    history: {
      pushState(_state, _unused, hash) {
        location.hash = hash;
      },
    },
  };
  document.activeElement = opener;
  vm.runInNewContext(source, { document, window });
  return {
    document,
    opener,
    dialog,
    form,
    input,
    output,
    closeButton,
    sections,
    host,
    views,
    toggle,
    location,
    get toggleClicks() {
      return toggleClicks;
    },
    get pendingCloseEvents() {
      return closeEvents.length;
    },
    flushCloseEvents() {
      while (closeEvents.length) closeEvents.shift()();
    },
    open() {
      opener.click();
    },
    type(value) {
      input.value = value;
      input.setSelectionRange(value.length, value.length);
      input.emit("input");
    },
    run(value) {
      input.value = value;
      form.emit("submit");
    },
    cancel() {
      const event = dialog.emit("cancel");
      if (!event.defaultPrevented) dialog.close();
    },
  };
}

test("openers appear only when native dialog initialization succeeds", () => {
  assert.equal(setup().opener.hidden, false);
  assert.equal(setup({ supported: false }).opener.hidden, true);
});

test("keyboard toggle respects IME composition, preserves drafts, and Escape restores focus", () => {
  const app = setup();
  app.document.emit("keydown", { key: "k", metaKey: true, isComposing: true });
  assert.equal(app.dialog.open, false);
  const key = app.document.emit("keydown", { key: "k", ctrlKey: true });
  assert.equal(key.defaultPrevented, true);
  assert.equal(app.document.activeElement, app.input);
  app.type("나중에 쓸 초안");
  app.cancel();
  assert.equal(app.document.activeElement, app.opener);
  app.open();
  assert.equal(app.input.value, "나중에 쓸 초안");
  app.input.emit("compositionstart");
  app.run("work");
  assert.equal(app.dialog.open, true);
  assert.equal(app.location.hash, "");
  app.input.emit("compositionend");
  app.closeButton.click();
  assert.equal(app.dialog.open, false);
});

test("section commands navigate the real anchor and focus its heading without a second focus scroll", () => {
  for (const reduced of [false, true]) {
    const app = setup({ reduced });
    app.open();
    app.run("  DOCS  ");
    assert.equal(app.dialog.open, false);
    assert.equal(app.location.hash, "#documents");
    const heading = app.sections.documents.children[0];
    assert.equal(app.document.activeElement, heading);
    assert.equal(heading.getAttribute("tabindex"), "-1");
    assert.equal(heading.focusOptions.preventScroll, true);
    assert.equal(
      app.sections.documents.scrollOptions.behavior,
      reduced ? "instant" : "smooth",
    );
  }
});

test("help offers only present destinations and its generated buttons execute navigation", () => {
  const app = setup({ missing: ["documents"] });
  app.open();
  app.run("help");
  const buttons = app.output.querySelectorAll("[data-terminal-command]");
  assert.ok(
    buttons.some((button) => button.dataset.terminalCommand === "work"),
  );
  assert.ok(
    !buttons.some((button) => button.dataset.terminalCommand === "docs"),
  );
  buttons.find((button) => button.dataset.terminalCommand === "work").click();
  assert.equal(app.location.hash, "#work");
  app.open();
  app.run("docs");
  assert.equal(app.dialog.open, true);
  assert.match(app.output.textContent, /찾지 못했습니다/);
});

test("output and history stay bounded, preserve draft recovery, and never interpret command HTML", () => {
  const app = setup();
  app.open();
  for (let i = 0; i < 36; i++) app.run(`unknown-${i}`);
  assert.equal(app.output.children.length, 30);
  app.type("draft");
  for (let i = 0; i < 40; i++) app.input.emit("keydown", { key: "ArrowUp" });
  assert.equal(app.input.value, "unknown-6");
  for (let i = 0; i < 40; i++) app.input.emit("keydown", { key: "ArrowDown" });
  assert.equal(app.input.value, "draft");
  app.run("<img src=x onerror=alert(1)>");
  assert.match(app.output.textContent, /<img src=x onerror=alert\(1\)>/);
  assert.equal(app.output.querySelectorAll("img").length, 0);
  app.run("clear");
  assert.equal(app.output.children.length, 0);
  app.input.emit("keydown", { key: "ArrowUp" });
  assert.equal(app.input.value, "clear");
});

test("Tab completes one unique prefix and otherwise preserves keyboard focus navigation", () => {
  const app = setup();
  app.open();
  app.type("wo");
  assert.equal(
    app.input.emit("keydown", { key: "Tab" }).defaultPrevented,
    true,
  );
  assert.equal(app.input.value, "work");
  app.type("c");
  assert.equal(
    app.input.emit("keydown", { key: "Tab" }).defaultPrevented,
    false,
  );
  app.type("wo");
  assert.equal(
    app.input.emit("keydown", { key: "Tab", shiftKey: true }).defaultPrevented,
    false,
  );
  app.input.emit("compositionstart");
  assert.equal(
    app.input.emit("keydown", { key: "Tab" }).defaultPrevented,
    false,
  );
});

test("view commands use the actual scene control and move focus to the first heading", () => {
  const app = setup();
  app.open();
  app.run("view DATA");
  assert.equal(app.host.dataset.sceneState, "data");
  assert.equal(app.views.data.getAttribute("aria-pressed"), "true");
  assert.equal(app.dialog.open, false);
  assert.equal(app.location.hash, "#top");
  assert.equal(app.document.activeElement, app.sections.top.children[0]);
  assert.match(app.output.textContent, /데이터 보기로 바꿨습니다/);
});

test("missing or unresponsive WebGL controls keep the dialog open and report no false success", () => {
  for (const options of [{ renderer: "fallback" }, { inertScene: true }]) {
    const app = setup(options);
    app.open();
    app.run("view recovery");
    assert.equal(app.dialog.open, true);
    assert.equal(app.location.hash, "");
    assert.doesNotMatch(app.output.textContent, /바꿨습니다/);
    assert.match(app.output.textContent, /바꾸지 못했습니다|바꿀 수 없습니다/);
    assert.equal(app.output.children.at(-1).dataset.terminalStatus, "error");
  }
});

test("motion commands verify actual state, are idempotent, and honor reduced-motion controls", () => {
  const app = setup();
  app.open();
  app.run("pause");
  assert.equal(app.toggle.getAttribute("aria-pressed"), "true");
  app.run("pause");
  assert.equal(app.toggleClicks, 1);
  app.run("resume");
  assert.equal(app.toggle.getAttribute("aria-pressed"), "false");
  assert.equal(app.toggleClicks, 2);
  assert.equal(app.dialog.open, true);
  const reduced = setup({ reduced: true });
  reduced.open();
  reduced.run("resume");
  assert.equal(reduced.toggleClicks, 0);
  assert.match(reduced.output.textContent, /모션 줄이기 설정/);
  const inert = setup({ inertScene: true });
  inert.open();
  inert.run("pause");
  assert.match(inert.output.textContent, /바꾸지 못했습니다/);
  assert.doesNotMatch(inert.output.textContent, /멈췄습니다/);
});

test("only clicks outside the dialog bounds dismiss its backdrop", () => {
  const app = setup();
  app.open();
  app.dialog.emit("click", { clientX: 250, clientY: 250 });
  assert.equal(app.dialog.open, true);
  app.dialog.emit("click", { clientX: 20, clientY: 20 });
  assert.equal(app.dialog.open, false);
  assert.equal(app.document.activeElement, app.opener);
});

test("navigation completes before a queued native close event and retains heading focus after it", () => {
  for (const [command, section] of [
    ["work", "work"],
    ["docs", "documents"],
  ]) {
    const app = setup({ deferClose: true });
    app.open();
    app.run(command);
    assert.equal(app.dialog.open, false);
    assert.equal(app.pendingCloseEvents, 1);
    assert.equal(app.location.hash, `#${section}`);
    assert.equal(app.document.activeElement, app.sections[section].children[0]);
    app.flushCloseEvents();
    assert.equal(app.location.hash, `#${section}`);
    assert.equal(app.document.activeElement, app.sections[section].children[0]);
  }
});

test("reopening before close notifications cannot drop earlier navigation or steal the new input focus", () => {
  const app = setup({ deferClose: true });
  app.open();
  app.run("work");
  app.open();
  app.type("keep this draft");
  app.flushCloseEvents();
  assert.equal(app.location.hash, "#work");
  assert.equal(app.dialog.open, true);
  assert.equal(app.document.activeElement, app.input);
  assert.equal(app.input.value, "keep this draft");
  app.run("docs");
  app.open();
  app.run("contact");
  assert.equal(app.pendingCloseEvents, 2);
  app.flushCloseEvents();
  assert.equal(app.location.hash, "#contact");
  assert.equal(app.document.activeElement, app.sections.contact.children[0]);
});

test("Escape and button close restore the opener immediately without affecting a subsequent dialog session", () => {
  const app = setup({ deferClose: true });
  for (const dismiss of [() => app.cancel(), () => app.closeButton.click()]) {
    app.open();
    app.type("draft survives");
    dismiss();
    assert.equal(app.dialog.open, false);
    assert.equal(app.document.activeElement, app.opener);
    app.open();
    app.flushCloseEvents();
    assert.equal(app.dialog.open, true);
    assert.equal(app.document.activeElement, app.input);
    assert.equal(app.input.value, "draft survives");
    app.closeButton.click();
    app.flushCloseEvents();
  }
});
