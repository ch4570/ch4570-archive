(() => {
  "use strict";

  const stage = document.querySelector("[data-portrait-stage]");
  const device = stage?.querySelector("[data-portrait-device]");
  if (!stage || !device || stage.dataset.portraitReady === "true") return;

  const root = stage.closest("[data-portrait-root]") || stage;
  const controls = root.querySelector("[data-portrait-controls]");
  const views = [...root.querySelectorAll("button[data-portrait-view]")];
  const toggle = root.querySelector("[data-portrait-toggle]");
  const toggleLabel = toggle?.querySelector("[data-portrait-toggle-label]");
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const pointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  const orientations = { angled: { rx: -5, ry: -10 }, front: { rx: 0, ry: 0 } };
  const interactive = "a, button, input, textarea, select, summary, [contenteditable], [tabindex]";
  let view = motion.matches ? "front" : "angled";
  let paused = false;
  let visible = true;
  let focused = false;
  let pressed = false;
  let keyboard = true;
  let frame = 0;
  let previousTime = 0;
  let current = { ...orientations[view], px: 0, py: 0 };
  let target = { ...current };

  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  const available = () => !document.hidden && visible;
  const followsPointer = () => !paused && !motion.matches && pointer.matches;
  const unsettled = () => Object.keys(current).some((key) => Math.abs(current[key] - target[key]) > 0.005);

  function paint() {
    device.style.setProperty("--portrait-rx", `${current.rx.toFixed(3)}deg`);
    device.style.setProperty("--portrait-ry", `${current.ry.toFixed(3)}deg`);
    device.style.setProperty("--portrait-px", current.px.toFixed(4));
    device.style.setProperty("--portrait-py", current.py.toFixed(4));
  }

  function stop() {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    previousTime = 0;
  }

  function schedule() {
    if (!frame && available() && !motion.matches && !paused && unsettled())
      frame = window.requestAnimationFrame(tick);
  }

  function tick(time) {
    frame = 0;
    if (!available() || motion.matches || paused) return;
    const delta = previousTime ? clamp(time - previousTime, 1, 32) : 16;
    previousTime = time;
    const weight = 1 - Math.exp(-delta / 74);
    for (const key of Object.keys(current)) current[key] += (target[key] - current[key]) * weight;
    if (!unsettled()) {
      current = { ...target };
      previousTime = 0;
    }
    paint();
    schedule();
  }

  function setTarget(next, immediate = false) {
    target = { px: 0, py: 0, ...next };
    if (immediate || motion.matches || paused || !pointer.matches) {
      stop();
      current = { ...target };
      paint();
    } else {
      schedule();
    }
  }

  function freeze() {
    stop();
    target = { ...current };
  }

  function syncControls() {
    stage.dataset.portraitView = view;
    stage.dataset.portraitMotion = motion.matches ? "reduced" : paused || !pointer.matches ? "paused" : "active";
    for (const button of views)
      button.setAttribute("aria-pressed", String(button.dataset.portraitView === view));
    if (toggle) {
      toggle.disabled = motion.matches || !pointer.matches;
      toggle.setAttribute("aria-pressed", String(!followsPointer()));
    }
    if (toggleLabel) {
      toggleLabel.textContent = motion.matches
        ? "동작 줄이기 켜짐"
        : !pointer.matches
          ? "시점 버튼으로 조작"
          : paused ? "움직임 켜기" : "움직임 멈추기";
    }
  }

  for (const button of views) {
    button.addEventListener("click", () => {
      const next = button.dataset.portraitView;
      if (!Object.hasOwn(orientations, next)) return;
      view = next;
      syncControls();
      setTarget(orientations[view]);
    });
  }

  toggle?.addEventListener("click", () => {
    if (motion.matches || !pointer.matches) return;
    paused = !paused;
    if (paused) freeze();
    else if (!focused) setTarget(orientations[view]);
    syncControls();
  });

  // Hover adds depth; native scrolling and direct button selection own touch input.
  stage.addEventListener("pointermove", (event) => {
    if (!followsPointer() || !available() || focused || pressed || event.pointerType === "touch") return;
    const hoveredControl = event.target?.closest?.(interactive);
    if (event.buttons || (hoveredControl && device.contains(hoveredControl))) {
      freeze();
      return;
    }
    const bounds = stage.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const px = clamp(((event.clientX - bounds.left) / bounds.width - 0.5) * 2, -1, 1);
    const py = clamp(((event.clientY - bounds.top) / bounds.height - 0.5) * 2, -1, 1);
    setTarget({
      rx: orientations[view].rx - py * 5,
      ry: orientations[view].ry + px * 8,
      px,
      py,
    });
  }, { passive: true });

  stage.addEventListener("pointerleave", () => {
    if (followsPointer() && !focused && !pressed) setTarget(orientations[view]);
  }, { passive: true });

  stage.addEventListener("pointerdown", (event) => {
    if (!device.contains(event.target)) return;
    pressed = true;
    freeze();
  }, { passive: true });

  document.addEventListener("pointerdown", () => { keyboard = false; }, { passive: true, capture: true });
  document.addEventListener("pointerup", () => { pressed = false; }, { passive: true });
  document.addEventListener("pointercancel", () => { pressed = false; }, { passive: true });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Tab" || event.key.startsWith("Arrow")) keyboard = true;
  });

  // Keyboard users get a level, stable reading surface. Mouse clicks keep their target in place.
  device.addEventListener("focusin", () => {
    focused = true;
    if (keyboard) setTarget(orientations.front, true);
    else freeze();
  });
  device.addEventListener("focusout", (event) => {
    if (device.contains(event.relatedTarget)) return;
    focused = false;
    if (!paused) setTarget(orientations[view]);
  });

  motion.addEventListener("change", () => {
    stop();
    if (motion.matches) view = "front";
    syncControls();
    setTarget(orientations[view], true);
  });
  pointer.addEventListener("change", () => {
    freeze();
    syncControls();
    if (!focused) setTarget(orientations[view], true);
  });
  document.addEventListener("visibilitychange", () => {
    if (available()) schedule();
    else stop();
  });
  window.addEventListener("blur", () => {
    pressed = false;
    freeze();
  });
  if ("IntersectionObserver" in window) {
    const observer = new window.IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? false;
      if (available()) schedule();
      else stop();
    });
    observer.observe(stage);
  }

  paint();
  syncControls();
  stage.dataset.portraitReady = "true";
  if (controls) controls.hidden = false;
})();
