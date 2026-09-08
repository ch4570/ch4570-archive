(() => {
  "use strict";

  for (const root of document.querySelectorAll("[data-explorer]")) {
    if (root.dataset.explorerReady === "true") continue;
    const owned = (selector) => [...root.querySelectorAll(selector)]
      .filter((element) => element.closest("[data-explorer]") === root);
    const toolbars = owned("[data-explorer-tabs]");
    const tabs = owned("[data-explorer-tab]");
    const panels = owned("[data-explorer-panel]");
    const toolbar = toolbars[0];
    const keys = tabs.map((tab) => tab.dataset.explorerTab);
    const panelKeys = panels.map((panel) => panel.dataset.explorerPanel);
    const ids = [...tabs, ...panels].map((element) => element.id);
    const defaultKey = root.dataset.explorerDefault;

    // Validate the entire relation before hiding content or changing its semantics.
    if (toolbars.length !== 1 || !tabs.length || tabs.length !== panels.length
      || new Set(keys).size !== tabs.length || new Set(panelKeys).size !== panels.length
      || new Set(ids).size !== ids.length || ids.some((id) => !id || /\s/.test(id))
      || !keys.includes(defaultKey)
      || tabs.some((tab) => tab.tagName !== "BUTTON" || tab.disabled || !toolbar.contains(tab))
      || keys.some((key, index) => {
        const panel = panels.find((candidate) => candidate.dataset.explorerPanel === key);
        return !key || !panel || tabs[index].getAttribute("aria-controls") !== panel.id;
      })) continue;

    const entries = tabs.map((tab) => ({
      key: tab.dataset.explorerTab,
      tab,
      panel: panels.find((panel) => panel.dataset.explorerPanel === tab.dataset.explorerTab),
    }));
    const followsHistory = Object.hasOwn(root.dataset, "explorerHistory");

    function selectionFromHash() {
      if (!followsHistory) return undefined;
      try {
        const id = decodeURIComponent(window.location.hash.slice(1));
        const target = document.getElementById(id);
        const entry = target && entries.find((candidate) => candidate.panel.contains(target));
        return entry ? { entry, target } : undefined;
      } catch {
        return undefined;
      }
    }

    function select(entry, updateHistory = false) {
      for (const candidate of entries) {
        const selected = candidate === entry;
        candidate.tab.setAttribute("aria-selected", String(selected));
        candidate.tab.setAttribute("tabindex", selected ? "0" : "-1");
        candidate.panel.hidden = !selected;
      }
      root.dataset.explorerSelected = entry.key;
      if (updateHistory && followsHistory) {
        try {
          window.history.replaceState(window.history.state, "", `#${encodeURIComponent(entry.panel.id)}`);
        } catch {
          // Local reading remains available when the host prevents URL updates.
        }
      }
    }

    toolbar.setAttribute("role", "tablist");
    for (const [index, entry] of entries.entries()) {
      entry.tab.setAttribute("role", "tab");
      entry.panel.setAttribute("role", "tabpanel");
      entry.panel.setAttribute("aria-labelledby", entry.tab.id);
      if (!entry.panel.hasAttribute("tabindex")) entry.panel.setAttribute("tabindex", "0");
      entry.tab.addEventListener("click", () => select(entry, true));
      entry.tab.addEventListener("keydown", (event) => {
        if (event.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey) return;
        let next;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % entries.length;
        else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + entries.length) % entries.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = entries.length - 1;
        else return;
        event.preventDefault();
        select(entries[next], true);
        entries[next].tab.focus({ preventScroll: true });
      });
    }

    select(selectionFromHash()?.entry || entries.find((entry) => entry.key === defaultKey));
    if (followsHistory) window.addEventListener("hashchange", () => {
      const selection = selectionFromHash();
      if (!selection) return;
      const wasHidden = selection.entry.panel.hidden;
      select(selection.entry);
      // Native fragment scrolling cannot reach a hidden target. Position it after revealing,
      // without inheriting a smooth scroll that a newer hash navigation can interrupt.
      if (wasHidden) selection.target.scrollIntoView({ block: "start", behavior: "instant" });
    });
    root.dataset.explorerReady = "true";
    toolbar.hidden = false;
  }
})();
