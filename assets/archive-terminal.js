(() => {
  "use strict";

  const session = document.querySelector("[data-terminal-session]");
  const form = session?.querySelector("[data-terminal-form]");
  const input = session?.querySelector("[data-terminal-input]");
  const output = session?.querySelector("[data-terminal-output]");
  if (!session || !form || !input || !output) return;

  const focusButtons = [...document.querySelectorAll("[data-terminal-focus]")];
  const shortcutGroups = [...document.querySelectorAll("[data-terminal-shortcuts]")];
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const limit = 30;
  const destinations = {
    work: { id: "work", label: "작업" },
    career: { id: "career", label: "경력" },
    activity: { id: "activity", label: "공개 코드와 기록" },
    docs: { id: "documents", label: "문서" },
    contact: { id: "contact", label: "연락처" },
    top: { id: "top", label: "프로필" },
  };
  const viewNames = { system: "구조", data: "데이터", recovery: "복구" };
  const history = [];
  let historyIndex = 0;
  let draft = "";
  let composing = false;
  let compositionSubmit = false;

  const sceneHost = () => document.querySelector("[data-scene]");
  const sceneAvailable = () => sceneHost()?.dataset.renderer === "webgl";
  const sceneToggle = () => document.querySelector("[data-scene-toggle]");
  const sceneView = (name) =>
    document.querySelector(`[data-scene-view="${name}"]`);
  const text = (element) => element?.textContent?.replace(/\s+/g, " ").trim() || "";
  const clip = (value) => value.length > 240 ? `${value.slice(0, 239)}…` : value;

  function commands() {
    const available = [["help", "명령어"], ["ls", "목록"]];
    for (const [command, destination] of Object.entries(destinations)) {
      if (document.getElementById(destination.id))
        available.push([command, destination.label]);
    }
    if (sceneAvailable() && document.getElementById("system-sketch")) {
      for (const [name, label] of Object.entries(viewNames)) {
        if (sceneView(name) && !sceneView(name).disabled)
          available.push([`view ${name}`, `3D ${label} 보기`]);
      }
      if (sceneToggle() && !sceneToggle().disabled)
        available.push(["pause", "3D 움직임 멈추기"], ["resume", "3D 움직임 재생"]);
    }
    available.push(["clear", "입력한 명령어와 결과 지우기"]);
    return available;
  }

  function focusPrompt() {
    input.focus({ preventScroll: true });
    form.scrollIntoView({
      behavior: "instant",
      block: "end",
    });
  }

  function append(command, message, { rows = [], links = [], actions = [], status = "info" } = {}) {
    const entry = document.createElement("div");
    entry.className = "terminal-entry";
    entry.dataset.terminalStatus = status;
    const echo = document.createElement("p");
    echo.className = "terminal-input-echo";
    echo.textContent = `ch4570@archive:~$ ${command}`;
    entry.appendChild(echo);
    if (message) {
      const response = document.createElement("p");
      response.className = "terminal-response";
      response.textContent = message;
      entry.appendChild(response);
    }
    if (rows.length) {
      const list = document.createElement("ul");
      list.className = "terminal-result-list";
      for (const row of rows) {
        const item = document.createElement("li");
        item.textContent = row;
        list.appendChild(item);
      }
      entry.appendChild(list);
    }
    if (links.length) {
      const list = document.createElement("div");
      list.className = "terminal-result-links";
      for (const { href, label, download } of links) {
        const link = document.createElement("a");
        link.setAttribute("href", href);
        link.textContent = label;
        if (download !== undefined) link.setAttribute("download", download);
        list.appendChild(link);
      }
      entry.appendChild(list);
    }
    if (actions.length) {
      const list = document.createElement("div");
      list.className = "terminal-command-list";
      for (const [value, label] of actions) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.terminalCommand = value;
        button.textContent = `${value} · ${label}`;
        list.appendChild(button);
      }
      entry.appendChild(list);
    }
    // The page is the scroll container. Add one complete live-log entry at a time.
    output.appendChild(entry);
    while (output.children.length > limit) output.firstElementChild.remove();
    return status !== "error";
  }

  const fail = (command, message) => append(command, message, {
    status: "error",
    actions: [["help", "명령어 보기"]],
  });
  const sketchLinks = () => document.getElementById("system-sketch")
    ? [{ href: "#system-sketch", label: "시스템 스케치 보기 ↑" }] : [];

  function sectionResult(destination, command) {
    const section = document.getElementById(destination.id);
    if (!section) return fail(command, "이 항목을 찾지 못했습니다. help로 사용할 수 있는 명령어를 확인해 주세요.");
    const summaries = [...section.querySelectorAll("[data-terminal-summary]")];
    const isContent = (node) => !node.closest("[data-terminal-session]") && !node.closest(".command-line");
    let values = summaries.filter(isContent).map(text);
    const careerRows = destination.id === "career"
      ? [...(section.querySelector(".career-list")?.querySelectorAll("li") || [])].filter(isContent)
      : [];
    const careers = careerRows.map((record) => {
      const company = record.querySelector(".career-company");
      const heading = text(company?.querySelector("h3") || record.querySelector("h3"));
      const period = text(record.querySelector(".career-date")?.querySelector("time"));
      const service = text(company?.querySelector("p"));
      const description = [...record.querySelectorAll("[data-terminal-summary]")]
        .filter(isContent).map(text).filter(Boolean).join(" ");
      const context = [heading, period, service].filter(Boolean).join(" · ");
      return [context, description].filter(Boolean).join(" — ");
    }).filter(Boolean);
    if (careers.length) values = careers;
    else if (!summaries.length) {
      const records = [...section.querySelectorAll("article, li")].filter(isContent);
      values = records.length
        ? records.map((record) => {
          const heading = text(record.querySelector("h3"));
          const description = [...record.querySelectorAll("p")]
            .filter(isContent).map(text).filter(Boolean).join(" ");
          return [heading, description].filter(Boolean).join(" — ");
        })
        : [...section.querySelectorAll("h3, p")].filter(isContent).map(text);
    }
    const rows = [...new Set(values.map(clip).filter(Boolean))].slice(0, 4);
    const links = [{ href: `#${destination.id}`, label: `${destination.label} 전체 보기 ↑` }];
    const seen = new Set(links.map((link) => link.href));
    for (const source of section.querySelectorAll("a[href]")) {
      const href = source.getAttribute("href")?.trim();
      // Copy only explicit, safe destinations. Never clone editable nodes or controls.
      if (!href || !/^(?:https?:\/\/|mailto:|#|\.?\.?\/)/i.test(href) || seen.has(href)) continue;
      const label = text(source);
      if (!label) continue;
      seen.add(href);
      const context = text(source.closest("article, li")?.querySelector("h3"));
      const link = { href, label: clip(context && !label.includes(context) ? `${context} · ${label}` : label) };
      if (source.hasAttribute("download")) link.download = source.getAttribute("download");
      links.push(link);
      if (links.length >= 7) break;
    }
    return append(command, destination.label, { rows, links });
  }

  function execute(value) {
    const normalized = value.toLowerCase().replace(/\s+/g, " ");
    const [command, argument, ...extra] = normalized.split(" ");
    if (command === "clear" && !argument) {
      output.replaceChildren();
      return true;
    }
    if ((command === "help" || command === "ls") && !argument) {
      const available = commands();
      return append(value, command === "help"
        ? "명령어를 입력하거나 눌러 보세요. 결과는 이 아래에 이어집니다."
        : "읽을 항목을 고르세요.", {
        actions: command === "ls"
          ? available.filter(([name]) => Object.hasOwn(destinations, name))
          : available,
      });
    }
    if (Object.hasOwn(destinations, command) && !argument)
      return sectionResult(destinations[command], value);
    if (command === "view") {
      if (!Object.hasOwn(viewNames, argument) || extra.length)
        return fail(value, "view system, view data, view recovery 중 하나를 입력해 주세요.");
      const button = sceneView(argument);
      if (!sceneAvailable() || !button || button.disabled)
        return fail(value, "지금은 3D 보기를 바꿀 수 없습니다. 작업과 문서는 계속 볼 수 있습니다.");
      if (!document.getElementById("system-sketch"))
        return fail(value, "시스템 스케치를 찾지 못했습니다. help로 사용할 수 있는 명령어를 확인해 주세요.");
      button.click();
      if (!sceneAvailable() || button.getAttribute("aria-pressed") !== "true")
        return fail(value, "3D 보기를 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return append(value, `3D를 ${viewNames[argument]} 보기로 바꿨습니다.`, { links: sketchLinks() });
    }
    if ((command === "pause" || command === "resume") && !argument) {
      const button = sceneToggle();
      if (!sceneAvailable() || !button)
        return fail(value, "지금은 3D 움직임을 제어할 수 없습니다. 작업과 문서는 계속 볼 수 있습니다.");
      const pressed = button.getAttribute("aria-pressed");
      const desired = command === "pause" ? "true" : "false";
      if (pressed === desired)
        return append(value, command === "pause" ? "3D 움직임이 이미 멈춰 있습니다." : "3D 움직임이 이미 재생 중입니다.", { links: sketchLinks() });
      if (button.disabled || !["true", "false"].includes(pressed))
        return fail(value, motion.matches
          ? "기기의 모션 줄이기 설정이 켜져 있어 3D 움직임을 재생하지 않습니다."
          : "지금은 3D 움직임을 바꿀 수 없습니다. 잠시 후 다시 시도해 주세요.");
      button.click();
      if (!sceneAvailable() || button.getAttribute("aria-pressed") !== desired)
        return fail(value, "3D 움직임을 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return append(value, command === "pause" ? "3D 움직임을 멈췄습니다." : "3D 움직임을 재생합니다.", { links: sketchLinks() });
    }
    return fail(value, "알 수 없는 명령어입니다. help로 사용할 수 있는 명령어를 확인해 주세요.");
  }

  function run(raw, { submitted = false } = {}) {
    const value = raw.trim().slice(0, 200);
    if (!value) return;
    if (history.at(-1) !== value) history.push(value);
    if (history.length > limit) history.shift();
    historyIndex = history.length;
    const success = execute(value);
    if (submitted && success) input.value = "";
    draft = input.value;
    focusPrompt();
  }

  session.hidden = false;
  for (const button of focusButtons) {
    button.addEventListener("click", focusPrompt);
    const key = button.querySelector("kbd");
    const platform = window.navigator?.userAgentData?.platform || window.navigator?.platform || "";
    if (key) key.textContent = /Mac|iPhone|iPad|iPod/.test(platform) ? "⌘ K" : "Ctrl K";
    button.hidden = false;
  }
  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.isComposing || composing || event.keyCode === 229 || event.repeat) return;
    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
      event.preventDefault();
      focusPrompt();
    }
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!composing && !compositionSubmit && !event.isComposing) run(input.value, { submitted: true });
  });
  input.addEventListener("compositionstart", () => { composing = true; });
  input.addEventListener("compositionend", () => { composing = false; });
  input.addEventListener("input", () => {
    draft = input.value;
    historyIndex = history.length;
  });
  input.addEventListener("keydown", (event) => {
    compositionSubmit = event.isComposing || composing || event.keyCode === 229;
    if (compositionSubmit) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if ((event.key === "ArrowUp" || event.key === "ArrowDown") && history.length) {
      event.preventDefault();
      if (historyIndex === history.length) draft = input.value;
      historyIndex = Math.max(0, Math.min(history.length, historyIndex + (event.key === "ArrowUp" ? -1 : 1)));
      input.value = historyIndex === history.length ? draft : history[historyIndex];
      input.setSelectionRange(input.value.length, input.value.length);
    } else if (event.key === "Tab" && !event.shiftKey && input.selectionStart === input.value.length && input.selectionEnd === input.value.length) {
      const prefix = input.value.trimStart().toLowerCase().replace(/\s+/g, " ");
      const matches = commands().map(([name]) => name).filter((name) => prefix && name.startsWith(prefix));
      if (matches.length !== 1 || matches[0] === prefix) return;
      event.preventDefault();
      input.value = matches[0];
      draft = input.value;
      historyIndex = history.length;
      input.setSelectionRange(input.value.length, input.value.length);
    }
  });
  input.addEventListener("keyup", () => { compositionSubmit = false; });
  document.addEventListener("click", (event) => {
    const button = event.target?.closest?.("button[data-terminal-command]");
    if (!button || button.disabled || composing) return;
    const group = button.closest("[data-terminal-shortcuts]");
    const inShortcuts = shortcutGroups.includes(group) && document.contains(group);
    if (!session.contains(button) && !inShortcuts) return;
    run(button.dataset.terminalCommand || "");
  });
  for (const group of shortcutGroups) group.hidden = false;
})();
