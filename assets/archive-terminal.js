(() => {
  "use strict";

  const dialog = document.querySelector("[data-terminal-dialog]");
  const form = dialog?.querySelector("[data-terminal-form]");
  const input = dialog?.querySelector("[data-terminal-input]");
  const output = dialog?.querySelector("[data-terminal-output]");
  const closeButton = dialog?.querySelector("[data-terminal-close]");
  if (
    !dialog ||
    !form ||
    !input ||
    !output ||
    !closeButton ||
    typeof dialog.showModal !== "function"
  )
    return;

  const openers = [...document.querySelectorAll("[data-terminal-open]")];
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const limit = 30;
  const destinations = {
    work: { id: "work", label: "작업" },
    career: { id: "career", label: "경력" },
    activity: { id: "activity", label: "기록" },
    docs: { id: "documents", label: "문서" },
    contact: { id: "contact", label: "연락처" },
    top: { id: "top", label: "첫 화면" },
  };
  const viewNames = { system: "구조", data: "데이터", recovery: "복구" };
  const history = [];
  let historyIndex = 0;
  let draft = "";
  let composing = false;
  let opener = null;

  const sceneHost = () => document.querySelector("[data-scene]");
  const sceneAvailable = () => sceneHost()?.dataset.renderer === "webgl";
  const sceneToggle = () => document.querySelector("[data-scene-toggle]");
  const sceneView = (name) =>
    document.querySelector(`[data-scene-view="${name}"]`);

  function commands() {
    const available = [
      ["help", "명령어 보기"],
      ["ls", "이동할 곳 보기"],
    ];
    for (const [command, destination] of Object.entries(destinations)) {
      if (document.getElementById(destination.id))
        available.push([command, destination.label]);
    }
    if (sceneAvailable()) {
      for (const [name, label] of Object.entries(viewNames)) {
        if (sceneView(name) && !sceneView(name).disabled)
          available.push([`view ${name}`, `3D ${label} 보기`]);
      }
      if (sceneToggle() && !sceneToggle().disabled)
        available.push(
          ["pause", "3D 움직임 멈추기"],
          ["resume", "3D 움직임 재생"],
        );
    }
    available.push(["clear", "출력 지우기"]);
    return available;
  }

  function append(command, message, links = [], status = "info") {
    const entry = document.createElement("div");
    entry.className = "terminal-entry";
    entry.dataset.terminalStatus = status;
    if (command) {
      const echo = document.createElement("p");
      echo.className = "terminal-input-echo";
      echo.textContent = `› ${command}`;
      entry.appendChild(echo);
    }
    const response = document.createElement("p");
    response.textContent = message;
    entry.appendChild(response);
    if (links.length) {
      const list = document.createElement("div");
      list.className = "terminal-command-list";
      for (const [value, label] of links) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.terminalCommand = value;
        button.textContent = `${value} · ${label}`;
        list.appendChild(button);
      }
      entry.appendChild(list);
    }
    // Append one completed entry so the live log announces only the new response.
    output.appendChild(entry);
    while (output.children.length > limit) output.firstElementChild.remove();
    output.scrollTop = output.scrollHeight;
  }

  const fail = (command, message) => append(command, message, [], "error");

  function close({ restoreFocus = true } = {}) {
    if (!dialog.open) return;
    dialog.close();
    if (restoreFocus && opener?.isConnected)
      opener.focus({ preventScroll: true });
  }

  function open(source = document.activeElement) {
    if (dialog.open) return;
    opener = source;
    try {
      dialog.showModal();
      input.focus({ preventScroll: true });
    } catch {
      opener?.focus?.({ preventScroll: true });
    }
  }

  function navigate(
    destination,
    command,
    message = `${destination.label}${["documents", "contact"].includes(destination.id) ? "로" : "으로"} 이동했습니다.`,
  ) {
    const section = document.getElementById(destination.id);
    if (!section) {
      fail(
        command,
        "이동할 곳을 찾지 못했습니다. help로 현재 페이지의 명령어를 확인해 주세요.",
      );
      return;
    }
    // close() restores native focus synchronously; its later close event is only a notification.
    close({ restoreFocus: false });
    const heading = section.querySelector("h1, h2, h3") || section;
    if (!heading.hasAttribute("tabindex"))
      heading.setAttribute("tabindex", "-1");
    const hash = `#${destination.id}`;
    if (window.location.hash !== hash) window.history.pushState(null, "", hash);
    heading.focus({ preventScroll: true });
    section.scrollIntoView({
      behavior: motion.matches ? "instant" : "smooth",
      block: "start",
    });
    append(command, message);
  }

  function remember(value) {
    if (history.at(-1) !== value) history.push(value);
    if (history.length > limit) history.shift();
    historyIndex = history.length;
    draft = "";
  }

  function run(raw) {
    const value = raw.trim().slice(0, 200);
    if (!value) return;
    remember(value);
    input.value = "";
    const normalized = value.toLowerCase().replace(/\s+/g, " ");
    const [command, argument, ...extra] = normalized.split(" ");
    if (command === "clear" && !argument) {
      output.replaceChildren();
      return;
    }
    if ((command === "help" || command === "ls") && !argument) {
      const available = commands();
      append(
        value,
        command === "help"
          ? "명령어를 입력하거나 아래 버튼을 누르세요."
          : "현재 페이지에서 이동할 수 있는 곳입니다.",
        command === "ls"
          ? available.filter(([name]) => Object.hasOwn(destinations, name))
          : available,
      );
      return;
    }
    if (Object.hasOwn(destinations, command) && !argument) {
      navigate(destinations[command], value);
      return;
    }
    if (command === "view") {
      if (!Object.hasOwn(viewNames, argument) || extra.length) {
        fail(
          value,
          "view system, view data, view recovery 중 하나를 입력해 주세요.",
        );
        return;
      }
      const button = sceneView(argument);
      if (!sceneAvailable() || !button || button.disabled) {
        fail(
          value,
          "지금은 3D 보기를 바꿀 수 없습니다. 작업과 문서는 계속 볼 수 있습니다.",
        );
        return;
      }
      if (!document.getElementById("top")) {
        fail(
          value,
          "3D가 있는 첫 화면을 찾지 못했습니다. help로 이동할 곳을 확인해 주세요.",
        );
        return;
      }
      button.click();
      if (!sceneAvailable() || button.getAttribute("aria-pressed") !== "true") {
        fail(value, "3D 보기를 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      navigate(
        destinations.top,
        value,
        `3D를 ${viewNames[argument]} 보기로 바꿨습니다.`,
      );
      return;
    }
    if ((command === "pause" || command === "resume") && !argument) {
      const button = sceneToggle();
      if (!sceneAvailable() || !button) {
        fail(
          value,
          "지금은 3D 움직임을 제어할 수 없습니다. 작업과 문서는 계속 볼 수 있습니다.",
        );
        return;
      }
      const pressed = button.getAttribute("aria-pressed");
      const desired = command === "pause" ? "true" : "false";
      if (pressed === desired) {
        append(
          value,
          command === "pause"
            ? "3D 움직임이 이미 멈춰 있습니다."
            : "3D 움직임이 이미 재생 중입니다.",
        );
        return;
      }
      if (button.disabled || !["true", "false"].includes(pressed)) {
        fail(
          value,
          motion.matches
            ? "기기의 모션 줄이기 설정이 켜져 있어 3D 움직임을 재생하지 않습니다."
            : "지금은 3D 움직임을 바꿀 수 없습니다. 잠시 후 다시 시도해 주세요.",
        );
        return;
      }
      button.click();
      if (
        !sceneAvailable() ||
        button.getAttribute("aria-pressed") !== desired
      ) {
        fail(
          value,
          "3D 움직임을 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.",
        );
        return;
      }
      append(
        value,
        command === "pause"
          ? "3D 움직임을 멈췄습니다."
          : "3D 움직임을 재생합니다.",
      );
      return;
    }
    fail(
      value,
      "알 수 없는 명령어입니다. help를 입력하면 사용할 수 있는 명령어를 볼 수 있습니다.",
    );
  }

  dialog.addEventListener("cancel", (event) => {
    if (event.defaultPrevented) return;
    event.preventDefault();
    close();
  });
  closeButton.addEventListener("click", () => close());
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      close();
  });
  for (const button of openers) {
    button.addEventListener("click", () => open(button));
    const key = button.querySelector("kbd");
    const platform =
      window.navigator?.userAgentData?.platform ||
      window.navigator?.platform ||
      "";
    if (key)
      key.textContent = /Mac|iPhone|iPad|iPod/.test(platform)
        ? "⌘ K"
        : "Ctrl K";
    button.hidden = false;
  }
  document.addEventListener("keydown", (event) => {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      composing ||
      event.keyCode === 229 ||
      event.repeat
    )
      return;
    if (
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      event.key.toLowerCase() === "k"
    ) {
      event.preventDefault();
      if (dialog.open) close();
      else open();
    }
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!composing && !event.isComposing && dialog.open) run(input.value);
  });
  input.addEventListener("compositionstart", () => {
    composing = true;
  });
  input.addEventListener("compositionend", () => {
    composing = false;
  });
  input.addEventListener("input", () => {
    draft = input.value;
    historyIndex = history.length;
  });
  input.addEventListener("keydown", (event) => {
    if (
      event.isComposing ||
      composing ||
      event.keyCode === 229 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return;
    if (
      (event.key === "ArrowUp" || event.key === "ArrowDown") &&
      history.length
    ) {
      event.preventDefault();
      if (historyIndex === history.length) draft = input.value;
      historyIndex = Math.max(
        0,
        Math.min(
          history.length,
          historyIndex + (event.key === "ArrowUp" ? -1 : 1),
        ),
      );
      input.value =
        historyIndex === history.length ? draft : history[historyIndex];
      input.setSelectionRange(input.value.length, input.value.length);
    } else if (
      event.key === "Tab" &&
      !event.shiftKey &&
      input.selectionStart === input.value.length &&
      input.selectionEnd === input.value.length
    ) {
      const prefix = input.value.trimStart().toLowerCase().replace(/\s+/g, " ");
      const matches = commands()
        .map(([name]) => name)
        .filter((name) => prefix && name.startsWith(prefix));
      if (matches.length !== 1 || matches[0] === prefix) return;
      event.preventDefault();
      input.value = matches[0];
      draft = input.value;
      historyIndex = history.length;
      input.setSelectionRange(input.value.length, input.value.length);
    }
  });
  dialog.addEventListener("click", (event) => {
    const button = event.target.closest("[data-terminal-command]");
    if (!button || !dialog.contains(button) || button.disabled) return;
    run(button.dataset.terminalCommand || "");
    if (dialog.open) input.focus({ preventScroll: true });
  });
  if (!output.children.length)
    append(
      "",
      "help로 명령어를 확인하세요. 페이지 이동과 3D 보기를 제어할 수 있습니다.",
    );
})();
