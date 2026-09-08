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
} = {}) {
  let document;
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
      this.selectionStart = 0;
      this.selectionEnd = 0;
      for (const [name, value] of Object.entries(attributes))
        this.setAttribute(name, value);
    }
    get firstElementChild() { return this.children[0]; }
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
    getAttribute(name) { return this.attributes[name] ?? null; }
    hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
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
      if (selector.startsWith("."))
        return (this.getAttribute("class") || "").split(/\s+/).includes(selector.slice(1));
      const match = /^([a-z][a-z0-9-]*)?(?:\[([^=\]]+)(?:="([^"]*)")?\])?$/i.exec(selector);
      if (!match) return false;
      if (match[1] && this.tagName !== match[1].toUpperCase()) return false;
      if (!match[2]) return true;
      const value = match[2].startsWith("data-")
        ? this.dataset[dataKey(match[2])]
        : this.attributes[match[2]];
      return value !== undefined && (match[3] === undefined || value === match[3]);
    }
    querySelectorAll(selector) {
      return this.children.flatMap((child) => [
        ...(child.matches(selector) ? [child] : []),
        ...child.querySelectorAll(selector),
      ]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    closest(selector) {
      return this.matches(selector) ? this : this.parentElement?.closest(selector) || null;
    }
    contains(node) {
      return node === this || this.children.some((child) => child.contains(node));
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
        preventDefault() { this.defaultPrevented = true; },
        ...properties,
      };
      const dispatch = (element) => {
        for (const callback of element.listeners.get(name) || []) callback(event);
        if (element.parentElement && ["click", "keydown", "submit", "input"].includes(name))
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
      this.scrollCount = (this.scrollCount || 0) + 1;
    }
    click() { if (!this.disabled) this.emit("click"); }
  }
  document = new Element("document");
  document.createElement = (tag) => new Element(tag);
  document.getElementById = (id) => document.querySelectorAll("[id]")
    .find((element) => element.getAttribute("id") === id) || null;
  const add = (parent, tag, attributes = {}, content = "") => {
    const element = parent.appendChild(new Element(tag, attributes));
    if (content) element.textContent = content;
    return element;
  };
  const focusButton = add(document, "button", { "data-terminal-focus": "" });
  focusButton.hidden = true;
  const main = add(document, "main", { id: "main" });
  const sections = {};
  for (const id of ["top", "work", "career", "activity", "documents", "system-sketch", "contact"]) {
    if (missing.includes(id)) continue;
    sections[id] = add(main, "section", { id });
    add(sections[id], id === "top" ? "h1" : "h2", { id: `${id}-title` }, `${id} heading`);
    add(sections[id], "p", { "data-terminal-summary": "", "data-edit-id": `${id}-summary` }, `${id} 실제 기록과 검증 내용`);
    const article = add(sections[id], "article");
    add(article, "h3", {}, `${id} 상세`);
    add(article, "a", { href: `./${id}/` }, "웹에서 읽기 ↗");
    if (id === "documents")
      add(article, "a", { href: "./pdf/resume.pdf", download: "이력서.pdf" }, "PDF ↓");
    add(article, "button", { "data-edit-control": "" }, "편집");
  }
  const shortcuts = add(sections.top || main, "div", { "data-terminal-shortcuts": "" });
  shortcuts.hidden = true;
  const shortcutButtons = {};
  for (const command of ["work", "docs", "contact"]) {
    shortcutButtons[command] = add(shortcuts, "button", {
      type: "button", "data-terminal-command": command,
    });
    add(shortcutButtons[command], "span", {}, command);
  }
  const session = add(main, "section", { "data-terminal-session": "" });
  session.hidden = true;
  const output = add(session, "div", {
    "data-terminal-output": "",
    role: "log",
    "aria-live": "polite",
  });
  const form = add(session, "form", { "data-terminal-form": "" });
  const input = add(form, "input", supported ? { "data-terminal-input": "" } : {});
  const host = add(document, "div", { "data-scene": "" });
  host.dataset.renderer = renderer;
  const views = {};
  for (const name of ["system", "data", "recovery"]) {
    views[name] = add(host, "button", { "data-scene-view": name, "aria-pressed": String(name === "system") });
    if (!inertScene)
      views[name].addEventListener("click", () => {
        for (const [key, button] of Object.entries(views))
          button.setAttribute("aria-pressed", String(key === name));
        host.dataset.sceneState = name;
      });
  }
  const toggle = add(host, "button", { "data-scene-toggle": "", "aria-pressed": String(reduced) });
  toggle.disabled = reduced;
  let toggleClicks = 0;
  toggle.addEventListener("click", () => {
    toggleClicks++;
    if (!inertScene)
      toggle.setAttribute("aria-pressed", String(toggle.getAttribute("aria-pressed") !== "true"));
  });
  const location = { hash: "#top" };
  const motion = { matches: reduced };
  const window = { location, matchMedia: () => motion };
  document.activeElement = focusButton;
  vm.runInNewContext(source, { document, window });
  return {
    document, focusButton, main, session, form, input, output, sections, shortcuts, shortcutButtons,
    host, views, toggle, location, add,
    get toggleClicks() { return toggleClicks; },
    type(value) {
      input.value = value;
      input.setSelectionRange(value.length, value.length);
      input.emit("input");
    },
    run(value) {
      input.value = value;
      form.emit("submit");
    },
  };
}

test("the inline session and focus controls appear only after initialization", () => {
  const app = setup();
  assert.equal(app.session.hidden, false);
  assert.equal(app.focusButton.hidden, false);
  assert.equal(app.shortcuts.hidden, false);
  assert.equal(app.output.children.length, 0);
  assert.equal(app.document.querySelectorAll("dialog").length, 0);
  const unsupported = setup({ supported: false });
  assert.equal(unsupported.session.hidden, true);
  assert.equal(unsupported.focusButton.hidden, true);
  assert.equal(unsupported.shortcuts.hidden, true);
});

test("portrait shortcuts append real section results and focus the trailing prompt without losing its draft", () => {
  const app = setup();
  app.type("작성 중인 명령어");
  for (const [command, id] of [["work", "work"], ["docs", "documents"], ["contact", "contact"]]) {
    const previousCount = app.output.children.length;
    app.shortcutButtons[command].querySelector("span").click();
    assert.equal(app.output.children.length, previousCount + 1);
    const result = app.output.children.at(-1);
    assert.match(result.textContent, new RegExp(`${id} 실제 기록과 검증 내용`));
    assert.ok(result.querySelectorAll("a").some((link) => link.getAttribute("href") === `./${id}/`));
    assert.equal(app.input.value, "작성 중인 명령어");
    assert.equal(app.document.activeElement, app.input);
    assert.equal(app.form.scrollOptions.behavior, "instant");
    assert.equal(app.form.scrollOptions.block, "end");
    assert.equal(app.session.children.at(-1), app.form);
    assert.equal(app.location.hash, "#top");
  }
  app.input.emit("keydown", { key: "ArrowUp" });
  assert.equal(app.input.value, "contact");
  app.input.emit("keydown", { key: "ArrowDown" });
  assert.equal(app.input.value, "작성 중인 명령어");
});

test("command delegation only accepts enabled buttons in the session or initialized shortcut groups", () => {
  const app = setup();
  app.add(app.main, "button", { "data-terminal-command": "work" }, "unscoped").click();
  app.add(app.shortcuts, "a", { "data-terminal-command": "work", href: "#work" }, "link").click();
  app.add(app.session, "span", { "data-terminal-command": "work" }, "text").click();
  const uninitialized = app.add(app.main, "div", { "data-terminal-shortcuts": "" });
  app.add(uninitialized, "button", { "data-terminal-command": "work" }, "late widget").click();
  app.shortcutButtons.work.disabled = true;
  app.shortcutButtons.work.querySelector("span").click();
  app.input.emit("compositionstart");
  app.shortcutButtons.docs.click();
  assert.equal(app.output.children.length, 0);
  assert.equal(app.document.activeElement, app.focusButton);
  app.input.emit("compositionend");
  app.shortcutButtons.docs.click();
  assert.equal(app.output.children.length, 1);
});

test("focus shortcuts return to the same prompt without losing drafts or changing the URL", () => {
  const app = setup();
  app.type("나중에 쓸 초안");
  app.document.emit("keydown", { key: "k", metaKey: true, isComposing: true });
  assert.equal(app.document.activeElement, app.focusButton);
  const key = app.document.emit("keydown", { key: "k", ctrlKey: true });
  assert.equal(key.defaultPrevented, true);
  assert.equal(app.document.activeElement, app.input);
  app.document.emit("keydown", { key: "k", ctrlKey: true });
  assert.equal(app.document.activeElement, app.input);
  app.focusButton.focus();
  app.focusButton.click();
  assert.equal(app.document.activeElement, app.input);
  assert.equal(app.input.value, "나중에 쓸 초안");
  assert.equal(app.location.hash, "#top");
});

test("section commands append actual content and links downward while retaining one trailing prompt", () => {
  for (const reduced of [false, true]) {
    const app = setup({ reduced });
    for (const [command, id] of [["work", "work"], ["career", "career"], ["activity", "activity"], ["docs", "documents"], ["contact", "contact"], ["top", "top"]]) {
      const earlierEntries = [...app.output.children];
      app.run(`  ${command.toUpperCase()}  `);
      assert.equal(app.output.children.length, earlierEntries.length + 1);
      earlierEntries.forEach((entry, index) => assert.equal(app.output.children[index], entry));
      const result = app.output.children.at(-1);
      assert.match(result.textContent, new RegExp(`${id} 실제 기록과 검증 내용`));
      assert.ok(result.querySelectorAll("a").some((link) => link.getAttribute("href") === `#${id}`));
      assert.equal(result.querySelectorAll("[id]").length, 0);
      assert.equal(result.querySelectorAll("[data-edit-id]").length, 0);
      assert.equal(result.querySelectorAll("[data-edit-control]").length, 0);
      assert.equal(app.location.hash, "#top");
      assert.equal(app.document.activeElement, app.input);
      assert.equal(app.input.focusOptions.preventScroll, true);
      assert.equal(app.input.value, "");
      assert.equal(app.form.scrollOptions.behavior, "instant");
      assert.equal(app.form.scrollOptions.block, "end");
      assert.equal(app.sections[id].scrollOptions, undefined);
      assert.equal(app.output.scrollTop, undefined);
      assert.equal(app.session.children.at(-1), app.form);
      assert.equal(app.document.querySelectorAll("[data-terminal-input]").length, 1);
    }
  }
});

test("document results preserve real download destinations and safe link labels", () => {
  const app = setup();
  app.sections.documents.querySelector("[data-terminal-summary]").remove();
  app.add(app.sections.documents.querySelector("article"), "p", {}, "경력과 주요 성과를 요약했습니다.");
  app.add(app.sections.documents, "a", { href: "javascript:alert(1)" }, "unsafe");
  app.add(app.sections.documents, "a", { href: "data:text/html,unsafe" }, "unsafe data");
  app.run("docs");
  const links = app.output.querySelectorAll("a");
  const pdf = links.find((link) => link.getAttribute("href") === "./pdf/resume.pdf");
  assert.equal(pdf.getAttribute("download"), "이력서.pdf");
  assert.equal(pdf.textContent, "documents 상세 · PDF ↓");
  const summary = app.output.querySelector("ul").textContent;
  assert.equal(summary, "documents 상세 — 경력과 주요 성과를 요약했습니다.");
  assert.doesNotMatch(summary, /웹에서 읽기|PDF|↓|↗|편집/);
  assert.ok(!links.some((link) => /^(javascript|data):/.test(link.getAttribute("href"))));
});

test("career results keep each company, period, and service together with its summary, links, and draft", () => {
  const app = setup();
  const list = app.add(app.sections.career, "ol", { class: "career-list" });
  const records = [
    ["서로 다른 회사 A", "2025.06 — 현재", "채용 서비스"],
    ["서로 다른 회사 B", "2024.06 — 2025.04", "협업 서비스"],
    ["서로 다른 회사 C", "2023.09 — 2024.05", "클라우드 서비스"],
    ["서로 다른 회사 D", "2022.11 — 2023.02", "사내 서비스"],
    ["다섯 번째 회사", "2021.01 — 2022.01", "이전 서비스"],
  ];
  for (const [index, [company, period, service]] of records.entries()) {
    const row = app.add(list, "li");
    const date = app.add(row, "div", { class: "career-date" });
    app.add(date, "time", {}, period);
    const employer = app.add(row, "div", { class: "career-company" });
    app.add(employer, "h3", {}, company);
    app.add(employer, "p", {}, service);
    app.add(row, "p", { "data-terminal-summary": "" }, "백엔드 개발과 운영을 담당했습니다.");
    app.add(row, "a", { href: `./career/#company-${index}` }, "경력 상세 읽기");
  }
  app.run("help");
  const earlier = app.output.children[0];
  app.type("계속 작성할 초안");
  earlier.querySelectorAll("button")
    .find((button) => button.dataset.terminalCommand === "career").click();
  assert.equal(app.output.children[0], earlier);
  assert.equal(app.output.children.length, 2);
  const result = app.output.children.at(-1);
  assert.deepEqual(result.querySelectorAll("li").map((row) => row.textContent),
    records.slice(0, 4).map(([company, period, service]) =>
      `${company} · ${period} · ${service} — 백엔드 개발과 운영을 담당했습니다.`));
  const hrefs = result.querySelectorAll("a").map((link) => link.getAttribute("href"));
  assert.ok(hrefs.includes("#career"));
  assert.ok(hrefs.includes("./career/"));
  assert.ok(hrefs.includes("./career/#company-0"));
  assert.equal(app.input.value, "계속 작성할 초안");
  assert.equal(app.document.activeElement, app.input);
  assert.equal(app.form.scrollOptions.behavior, "instant");
  app.input.emit("keydown", { key: "ArrowUp" });
  assert.equal(app.input.value, "career");
  app.input.emit("keydown", { key: "ArrowDown" });
  assert.equal(app.input.value, "계속 작성할 초안");
});

test("career summaries fall back to existing content when structured career rows are unavailable", () => {
  for (const emptyList of [false, true]) {
    const app = setup();
    if (emptyList) {
      const list = app.add(app.sections.career, "ol", { class: "career-list" });
      app.add(list, "li");
    }
    app.run("career");
    assert.equal(app.output.querySelector("ul").textContent, "career 실제 기록과 검증 내용");
    assert.ok(app.output.querySelectorAll("a").some((link) => link.getAttribute("href") === "./career/"));
  }
});


test("generic section summaries exclude static command prompts", () => {
  const app = setup();
  app.sections.top.querySelector("[data-terminal-summary]").remove();
  app.sections.top.querySelector("article").remove();
  app.add(app.sections.top, "p", { class: "command-line" }, "ch4570@archive ~ $ top");
  app.add(app.sections.top, "p", {}, "백엔드를 개발합니다.");
  app.run("top");
  assert.equal(app.output.querySelector("ul").textContent, "백엔드를 개발합니다.");
});

test("help advertises available commands and command buttons preserve in-progress drafts", () => {
  const app = setup({ missing: ["documents"], renderer: "fallback" });
  app.run("help");
  const buttons = app.output.querySelectorAll("[data-terminal-command]");
  assert.ok(buttons.some((button) => button.dataset.terminalCommand === "work"));
  assert.ok(!buttons.some((button) => button.dataset.terminalCommand === "docs"));
  assert.ok(!buttons.some((button) => button.dataset.terminalCommand.startsWith("view")));
  assert.ok(!buttons.some((button) => button.dataset.terminalCommand === "resume"));
  app.type("keep my draft");
  buttons.find((button) => button.dataset.terminalCommand === "work").click();
  assert.equal(app.output.children.length, 2);
  assert.equal(app.input.value, "keep my draft");
  assert.equal(app.document.activeElement, app.input);
  app.run("docs");
  assert.match(app.output.children.at(-1).textContent, /찾지 못했습니다/);
  assert.equal(app.input.value, "docs");
  app.run("ls");
  const entries = app.output.children.at(-1).querySelectorAll("[data-terminal-command]");
  assert.ok(entries.every((entry) => ["work", "career", "activity", "contact", "top"].includes(entry.dataset.terminalCommand)));
});

test("clear removes runtime output only and history stays available", () => {
  const app = setup();
  const staticSections = Object.values(app.sections);
  const originalText = staticSections.map((section) => section.textContent);
  app.run("work");
  app.run("help");
  app.run("clear");
  assert.equal(app.output.children.length, 0);
  assert.deepEqual(staticSections.map((section) => section.textContent), originalText);
  staticSections.forEach((section) => assert.equal(section.parentElement, app.main));
  assert.equal(app.form.parentElement, app.session);
  assert.equal(app.document.activeElement, app.input);
  app.input.emit("keydown", { key: "ArrowUp" });
  assert.equal(app.input.value, "clear");
});

test("output and history remain bounded, restore drafts, and treat command HTML as text", () => {
  const app = setup();
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
  assert.equal(app.input.value, "<img src=x onerror=alert(1)>");
  assert.equal(app.output.children.at(-1).dataset.terminalStatus, "error");
  const help = app.output.children.at(-1).querySelector("[data-terminal-command]");
  assert.equal(help.dataset.terminalCommand, "help");
  help.click();
  assert.match(app.output.children.at(-1).textContent, /결과는 이 아래에 이어집니다/);
});

test("IME composition never submits, consumes history, or completes text prematurely", () => {
  const app = setup();
  app.run("work");
  app.type("서울");
  app.input.emit("compositionstart");
  assert.equal(app.input.emit("keydown", { key: "Enter", isComposing: true }).defaultPrevented, false);
  app.form.emit("submit");
  assert.equal(app.output.children.length, 1);
  app.input.emit("keydown", { key: "ArrowUp" });
  app.input.emit("keydown", { key: "Tab" });
  assert.equal(app.input.value, "서울");
  app.input.emit("compositionend");
  app.input.emit("keydown", { key: "Enter", keyCode: 229 });
  app.form.emit("submit");
  assert.equal(app.output.children.length, 1);
  assert.equal(app.input.value, "서울");
  app.input.emit("keyup", { key: "Enter" });
  app.input.emit("keydown", { key: "Enter" });
  app.form.emit("submit");
  assert.equal(app.output.children.length, 2);
  assert.match(app.output.children.at(-1).textContent, /서울/);
});

test("Tab completes a unique suffix and preserves ordinary keyboard navigation otherwise", () => {
  const app = setup();
  app.type("wo");
  assert.equal(app.input.emit("keydown", { key: "Tab" }).defaultPrevented, true);
  assert.equal(app.input.value, "work");
  assert.equal(app.input.emit("keydown", { key: "Tab" }).defaultPrevented, false);
  app.type("c");
  assert.equal(app.input.emit("keydown", { key: "Tab" }).defaultPrevented, false);
  app.type("wo");
  assert.equal(app.input.emit("keydown", { key: "Tab", shiftKey: true }).defaultPrevented, false);
  app.input.setSelectionRange(0, 2);
  assert.equal(app.input.emit("keydown", { key: "Tab" }).defaultPrevented, false);
  app.type("view d");
  assert.equal(app.input.emit("keydown", { key: "Tab" }).defaultPrevented, true);
  assert.equal(app.input.value, "view data");
});

test("view updates the actual scene and appends its link without leaving the prompt", () => {
  for (const options of [{}, { reduced: true }, { missing: ["top"] }]) {
    const app = setup(options);
    app.run("view DATA");
    assert.equal(app.host.dataset.sceneState, "data");
    assert.equal(app.views.data.getAttribute("aria-pressed"), "true");
    assert.equal(app.location.hash, "#top");
    assert.equal(app.document.activeElement, app.input);
    assert.equal(app.sections["system-sketch"].scrollOptions, undefined);
    assert.match(app.output.textContent, /데이터 보기로 바꿨습니다/);
    assert.equal(app.output.querySelector("a").getAttribute("href"), "#system-sketch");
  }
});

test("unavailable or unresponsive scene controls keep the draft and never report false success", () => {
  for (const options of [{ renderer: "fallback" }, { inertScene: true }, { missing: ["system-sketch"] }]) {
    const app = setup(options);
    app.run("view recovery");
    assert.equal(app.location.hash, "#top");
    assert.equal(app.document.activeElement, app.input);
    assert.equal(app.input.value, "view recovery");
    assert.doesNotMatch(app.output.textContent, /바꿨습니다/);
    assert.match(app.output.textContent, /바꾸지 못했습니다|바꿀 수 없습니다|시스템 스케치를 찾지 못했습니다/);
    assert.equal(app.views.recovery.getAttribute("aria-pressed"), "false");
    assert.equal(app.output.children.at(-1).dataset.terminalStatus, "error");
  }
});

test("motion commands verify actual state, are idempotent, and respect reduced motion", () => {
  const app = setup();
  app.run("pause");
  assert.equal(app.toggle.getAttribute("aria-pressed"), "true");
  app.run("pause");
  assert.equal(app.toggleClicks, 1);
  app.run("resume");
  assert.equal(app.toggle.getAttribute("aria-pressed"), "false");
  assert.equal(app.toggleClicks, 2);
  assert.equal(app.document.activeElement, app.input);
  const reduced = setup({ reduced: true });
  reduced.run("resume");
  assert.equal(reduced.toggleClicks, 0);
  assert.match(reduced.output.textContent, /모션 줄이기 설정/);
  assert.equal(reduced.form.scrollOptions.behavior, "instant");
  const inert = setup({ inertScene: true });
  inert.run("pause");
  assert.match(inert.output.textContent, /바꾸지 못했습니다/);
  assert.doesNotMatch(inert.output.textContent, /멈췄습니다/);
});
