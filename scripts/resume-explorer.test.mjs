import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../assets/resume-explorer.js", import.meta.url), "utf8");

function explorerPage({ hash = "", malformed, unavailableHistory = false } = {}) {
  const focusState = { activeElement: null };
  const prevented = [];
  const scrolls = [];

  class Element {
    constructor(tagName = "div", dataset = {}, attributes = {}) {
      this.tagName = tagName.toUpperCase();
      this.dataset = dataset;
      this.attributes = { ...attributes };
      this.id = attributes.id || "";
      this.children = [];
      this.parentElement = null;
      this.hidden = false;
      this.disabled = false;
      this.listeners = new Map();
    }
    append(...elements) {
      for (const element of elements) {
        if (element.parentElement) {
          element.parentElement.children = element.parentElement.children.filter((child) => child !== element);
        }
        element.parentElement = this;
        this.children.push(element);
      }
    }
    getAttribute(name) { return this.attributes[name] ?? null; }
    getElementById(id) {
      if (this.id === id) return this;
      for (const child of this.children) {
        const match = child.getElementById(id);
        if (match) return match;
      }
      return null;
    }
    hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    contains(element) {
      for (let current = element; current; current = current.parentElement) {
        if (current === this) return true;
      }
      return false;
    }
    closest(selector) {
      if (selector === "[data-explorer]" && Object.hasOwn(this.dataset, "explorer")) return this;
      return this.parentElement?.closest(selector) || null;
    }
    querySelectorAll(selector) {
      const key = {
        "[data-explorer]": "explorer",
        "[data-explorer-tabs]": "explorerTabs",
        "[data-explorer-tab]": "explorerTab",
        "[data-explorer-panel]": "explorerPanel",
      }[selector];
      const results = [];
      function visit(element) {
        for (const child of element.children) {
          if (Object.hasOwn(child.dataset, key)) results.push(child);
          visit(child);
        }
      }
      visit(this);
      return results;
    }
    addEventListener(name, callback) {
      const callbacks = this.listeners.get(name) || [];
      callbacks.push(callback);
      this.listeners.set(name, callbacks);
    }
    emit(name, properties = {}) {
      const event = {
        target: this,
        preventDefault() { prevented.push(name); },
        ...properties,
      };
      for (const callback of this.listeners.get(name) || []) callback(event);
      return event;
    }
    focus(options) { focusState.activeElement = this; this.focusOptions = options; }
    scrollIntoView(options) {
      let hiddenAncestor = false;
      for (let node = this.parentElement; node; node = node.parentElement) hiddenAncestor ||= node.hidden;
      scrolls.push({ target: this, options, visible: !this.hidden && !hiddenAncestor });
    }
  }

  function makeExplorer(name, keys, history = false) {
    const root = new Element("section", { explorer: "", explorerDefault: keys[0] });
    if (history) root.dataset.explorerHistory = "";
    const toolbar = new Element("div", { explorerTabs: "" });
    toolbar.hidden = true;
    const tabs = keys.map((key) => new Element("button", { explorerTab: key }, {
      id: `${name}-tab-${key}`,
      "aria-controls": `${name}-${key}`,
    }));
    const panels = keys.map((key) => new Element("article", { explorerPanel: key }, { id: `${name}-${key}` }));
    toolbar.append(...tabs);
    root.append(toolbar, ...panels);
    return { root, toolbar, tabs, panels };
  }

  const profile = makeExplorer("profile", ["profile", "stack", "activity"]);
  const work = makeExplorer("case", ["jpa", "event", "search"], true);
  const impact = new Element("div", {}, { id: "impact" });
  work.panels[0].append(impact);
  const document = new Element("document");
  document.append(profile.root, work.root);
  malformed?.({ profile, work, Element });
  const window = new Element("window");
  window.location = { hash, pathname: "/intro/", search: "?lang=ko" };
  const replacements = [];
  const historyState = { preserved: "router state" };
  window.history = {
    state: historyState,
    replaceState(state, title, url) {
      if (unavailableHistory) throw new Error("history is unavailable");
      replacements.push({ state, title, url });
      window.location.hash = url.slice(url.indexOf("#"));
    },
  };
  const context = vm.createContext({ document, window });
  function run() { vm.runInContext(source, context); }
  run();
  return {
    profile, work, impact, document, window, replacements, historyState, prevented, scrolls, run,
    get activeElement() { return focusState.activeElement; },
    navigate(nextHash) {
      window.location.hash = nextHash;
      window.emit("hashchange");
    },
  };
}

function assertSelection(explorer, index) {
  assert.equal(explorer.root.dataset.explorerSelected, explorer.tabs[index].dataset.explorerTab);
  assert.deepEqual(explorer.panels.map((panel) => panel.hidden), explorer.panels.map((_, position) => position !== index));
  assert.deepEqual(explorer.tabs.map((tab) => tab.getAttribute("aria-selected")), explorer.tabs.map((_, position) => String(position === index)));
  assert.deepEqual(explorer.tabs.map((tab) => tab.getAttribute("tabindex")), explorer.tabs.map((_, position) => position === index ? "0" : "-1"));
}

test("separate explorers show real default panels with complete accessible relationships", () => {
  const page = explorerPage();
  for (const explorer of [page.profile, page.work]) {
    assertSelection(explorer, 0);
    assert.equal(explorer.root.dataset.explorerReady, "true");
    assert.equal(explorer.toolbar.hidden, false);
    assert.equal(explorer.toolbar.getAttribute("role"), "tablist");
    explorer.tabs.forEach((tab, index) => {
      assert.equal(tab.getAttribute("role"), "tab");
      assert.equal(tab.getAttribute("aria-controls"), explorer.panels[index].id);
      assert.equal(explorer.panels[index].getAttribute("role"), "tabpanel");
      assert.equal(explorer.panels[index].getAttribute("aria-labelledby"), tab.id);
    });
  }
  assert.equal(page.activeElement, null, "initialization leaves focus alone");
  assert.equal(page.replacements.length, 0, "initialization does not rewrite the URL");
  assert.equal(page.scrolls.length, 0, "initialization leaves the browser's initial anchor positioning alone");
});

test("clicks change the selected content immediately and independently, preserving current focus", () => {
  const page = explorerPage();
  page.profile.tabs[1].focus();
  page.profile.tabs[1].emit("click");
  assertSelection(page.profile, 1);
  assertSelection(page.work, 0);
  assert.equal(page.activeElement, page.profile.tabs[1]);
  assert.equal(page.replacements.length, 0, "profile tabs have no URL persistence");
  page.work.tabs[2].focus();
  page.work.tabs[2].emit("click");
  assertSelection(page.work, 2);
  assertSelection(page.profile, 1);
  assert.equal(page.activeElement, page.work.tabs[2], "selection does not force focus into a panel");
  assert.equal(page.window.location.hash, "#case-search");
  assert.equal(page.replacements[0].state, page.historyState, "existing history state survives");
  assert.equal(page.scrolls.length, 0, "explicit tab selection does not jump the reading position");
});

test("arrows wrap selection and focus; Home and End go to the first and last tabs", () => {
  const page = explorerPage();
  const { profile } = page;
  for (const [from, key, expected] of [
    [0, "ArrowRight", 1], [1, "ArrowDown", 2], [2, "ArrowRight", 0],
    [0, "ArrowLeft", 2], [2, "ArrowUp", 1], [1, "Home", 0], [0, "End", 2],
  ]) {
    profile.tabs[from].emit("keydown", { key });
    assertSelection(profile, expected);
    assert.equal(page.activeElement, profile.tabs[expected]);
    assert.equal(page.activeElement.focusOptions?.preventScroll, true);
  }
  assert.equal(page.prevented.length, 7);
});

test("Tab, composition, and browser shortcuts retain native keyboard behavior", () => {
  const page = explorerPage();
  for (const properties of [
    { key: "Tab" }, { key: "Enter" }, { key: "ArrowRight", isComposing: true },
    { key: "ArrowRight", keyCode: 229 }, { key: "ArrowLeft", altKey: true },
    { key: "ArrowRight", ctrlKey: true }, { key: "ArrowRight", metaKey: true },
  ]) page.profile.tabs[0].emit("keydown", properties);
  assertSelection(page.profile, 0);
  assert.equal(page.activeElement, null);
  assert.equal(page.prevented.length, 0);
});

test("initial and changed work deep links reveal the matching panel without rewriting URL or focus", () => {
  const page = explorerPage({ hash: "#case-event" });
  assertSelection(page.work, 1);
  assertSelection(page.profile, 0);
  page.profile.tabs[1].focus();
  page.navigate("#case-search");
  assertSelection(page.work, 2);
  assert.equal(page.activeElement, page.profile.tabs[1]);
  page.navigate("#career");
  assertSelection(page.work, 2);
  page.navigate("#profile-stack");
  assertSelection(page.profile, 0, "an explorer without URL state ignores hashes");
  page.navigate("#%E0%A4%A");
  assertSelection(page.work, 2);
  assert.equal(page.replacements.length, 0);
});

test("same-page hashes scroll newly revealed content after it is visible, without moving focus", () => {
  const page = explorerPage();
  page.profile.tabs[1].focus();
  page.navigate("#case-event");
  assertSelection(page.work, 1);
  assert.equal(page.scrolls.length, 1);
  assert.equal(page.scrolls[0].target, page.work.panels[1]);
  assert.equal(page.scrolls[0].visible, true, "the hidden panel must be revealed before scrolling");
  assert.equal(page.scrolls[0].options.block, "start");
  assert.equal(page.scrolls[0].options.behavior, "instant", "recovery cannot inherit a pending smooth scroll");
  assert.equal(page.activeElement, page.profile.tabs[1]);
  assert.equal(page.replacements.length, 0, "hash navigation retains its native history entry");
  page.navigate("#case-event");
  page.navigate("#career");
  assert.equal(page.scrolls.length, 1, "visible targets and unrelated hashes keep native scrolling");
  page.work.tabs[2].emit("click");
  page.work.tabs[2].emit("keydown", { key: "Home" });
  assert.equal(page.scrolls.length, 1, "explicit selection still changes content without a jump");
});

test("descendant anchors open their owner panel and scroll the exact content, retaining the incoming hash", () => {
  const page = explorerPage({ hash: "#case-event" });
  assertSelection(page.work, 1);
  assert.equal(page.scrolls.length, 0);
  page.navigate("#impact");
  assertSelection(page.work, 0);
  assert.equal(page.scrolls.length, 1);
  assert.equal(page.scrolls[0].target, page.impact);
  assert.equal(page.scrolls[0].visible, true);
  assert.equal(page.window.location.hash, "#impact");
  assert.equal(page.replacements.length, 0);

  const direct = explorerPage({ hash: "#impact", malformed({ work }) {
    work.root.dataset.explorerDefault = "event";
  } });
  assertSelection(direct.work, 0, "a descendant deep link overrides a different default panel");
  assert.equal(direct.scrolls.length, 0, "initial deep links still let the browser position the document");
});

test("rapid hash changes position each revealed target immediately and leave the latest target selected", () => {
  const page = explorerPage();
  for (const hash of ["#case-event", "#case-search", "#case-jpa", "#case-event", "#impact"]) page.navigate(hash);
  assertSelection(page.work, 0);
  assert.equal(page.scrolls.length, 5);
  assert.ok(page.scrolls.every((scroll) => scroll.visible && scroll.options.behavior === "instant"));
  assert.equal(page.scrolls.at(-1).target, page.impact);
  assert.equal(page.window.location.hash, "#impact");
  assert.equal(page.replacements.length, 0);
  assert.equal(page.activeElement, null);
});

test("the latest rapid input wins and repeated initialization does not double-bind controls", () => {
  const page = explorerPage();
  page.run();
  for (const index of [1, 2, 0, 2, 1]) page.work.tabs[index].emit("click");
  assertSelection(page.work, 1);
  assert.equal(page.window.location.hash, "#case-event");
  assert.equal(page.replacements.length, 5);
  assert.equal(page.work.tabs[0].listeners.get("click").length, 1);
});

test("an unavailable History API cannot break local selection or keyboard input", () => {
  const page = explorerPage({ unavailableHistory: true });
  page.work.tabs[1].emit("click");
  assertSelection(page.work, 1);
  page.work.tabs[1].emit("keydown", { key: "ArrowRight" });
  assertSelection(page.work, 2);
  assert.equal(page.activeElement, page.work.tabs[2]);
});

test("malformed relationships remain fully readable while a valid neighboring explorer works", () => {
  const mutations = [
    ({ profile }) => { profile.root.dataset.explorerDefault = "missing"; },
    ({ profile }) => { profile.tabs[1].dataset.explorerTab = "profile"; },
    ({ profile }) => { profile.panels[1].dataset.explorerPanel = "profile"; },
    ({ profile }) => { profile.tabs[1].attributes["aria-controls"] = "missing"; },
    ({ profile }) => { profile.tabs[1].id = ""; },
    ({ profile }) => { profile.panels[1].id = ""; },
    ({ profile }) => { profile.tabs[1].id = profile.tabs[0].id; },
    ({ profile }) => { profile.tabs[1].tagName = "A"; },
    ({ profile }) => { profile.tabs[1].disabled = true; },
    ({ profile }) => { profile.toolbar.children.pop(); },
    ({ profile }) => { profile.root.children.pop(); },
    ({ profile, Element }) => { profile.root.append(new Element("div", { explorerTabs: "" })); },
  ];
  for (const malformed of mutations) {
    const page = explorerPage({ malformed });
    assert.equal(page.profile.root.dataset.explorerReady, undefined);
    assert.equal(page.profile.toolbar.hidden, true);
    assert.ok(page.profile.panels.every((panel) => !panel.hidden));
    assert.ok(page.profile.tabs.every((tab) => !tab.getAttribute("role")));
    assertSelection(page.work, 0);
  }
});

test("nested explorer content belongs only to its nearest owner", () => {
  const page = explorerPage({ malformed({ profile, work }) {
    profile.panels[2].append(work.root);
  } });
  assertSelection(page.profile, 0);
  assertSelection(page.work, 0);
  page.profile.tabs[2].emit("click");
  page.work.tabs[1].emit("click");
  assertSelection(page.profile, 2);
  assertSelection(page.work, 1);
});
