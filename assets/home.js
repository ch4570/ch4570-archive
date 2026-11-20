// Home interactions: command-run sections, kubectl describe rows, command palette,
// keyboard navigation, scroll progress and the three.js hero. Without JavaScript the
// page stays fully expanded; with reduced motion nothing types or animates.

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const EMAIL = "ckdekrn88@gmail.com";

/* ---------- typing helper (one orchestrated moment per section) ---------- */
const typeText = (element, text, done) => {
  if (reduce) { element.textContent = text; done(); return; }
  element.textContent = "";
  let index = 0;
  const started = performance.now();
  const perChar = Math.max(14, Math.min(30, 380 / text.length));
  const tick = (now) => {
    const next = Math.min(text.length, Math.floor((now - started) / perChar) + 1);
    if (next !== index) { index = next; element.textContent = text.slice(0, index); }
    if (index < text.length) requestAnimationFrame(tick);
    else setTimeout(done, 80);
  };
  requestAnimationFrame(tick);
};

/* ---------- hero ---------- */
const heroOut = $("[data-hero-out]");
const heroTyped = $(".typed");
if (heroOut && heroTyped && !reduce) {
  heroOut.classList.add("is-waiting");
  typeText(heroTyped, "whoami", () => heroOut.classList.remove("is-waiting"));
}

/* ---------- command-run sections ---------- */
const ran = new WeakSet();
const runSection = (section, instant = false) => {
  if (!section || ran.has(section) || !section.hasAttribute("data-run")) return;
  ran.add(section);
  const label = $(".cmd__t", section);
  const finish = () => section.classList.remove("is-pending", "is-typing");
  if (instant || reduce || !label) { finish(); return; }
  section.classList.add("is-typing");
  typeText(label, label.dataset.full, finish);
};
const runnable = $$("[data-run]");
runnable.forEach((section) => {
  const label = $(".cmd__t", section);
  if (label) label.dataset.full = label.textContent;
});
if (!reduce && "IntersectionObserver" in window) {
  runnable.forEach((section) => section.classList.add("is-pending"));
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      runSection(entry.target);
      observer.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -15% 0px", threshold: 0.12 });
  runnable.forEach((section) => observer.observe(section));
}

/* ---------- kubectl describe rows ---------- */
const toggles = $$(".kube__toggle");
// Measured height animation (Web Animations API) — smoother than grid-row tricks for long panels.
const setRow = (button, open, animate = true) => {
  button.setAttribute("aria-expanded", String(open));
  const panel = document.getElementById(button.getAttribute("aria-controls"));
  panel.inert = !open;
  if (!animate || reduce || !panel.animate) { panel.classList.toggle("is-open", open); return; }
  const from = panel.getBoundingClientRect().height;
  panel.classList.toggle("is-open", open);
  const to = open ? panel.scrollHeight : 0;
  panel.getAnimations().forEach((a) => a.cancel());
  panel.animate(
    [{ height: `${from}px`, opacity: open ? 0.4 : 1 }, { height: `${to}px`, opacity: open ? 1 : 0.4 }],
    { duration: Math.min(420, 220 + Math.abs(to - from) * 0.12), easing: "cubic-bezier(.2,.8,.2,1)" },
  );
};
toggles.forEach((button) => {
  setRow(button, false, false);
  button.addEventListener("click", () => setRow(button, button.getAttribute("aria-expanded") !== "true"));
});
const openProject = (id) => {
  const project = document.getElementById(id);
  const button = project && $(".kube__toggle", project);
  if (!button) return;
  runSection($("#projects"), true);
  setRow(button, true);
  project.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  button.focus({ preventScroll: true });
};
$$("[data-open]").forEach((link) => link.addEventListener("click", (event) => {
  event.preventDefault();
  openProject(link.dataset.open);
}));

/* ---------- scroll progress  [=======>        ] 42% ---------- */
const track = $(".progress__track");
const pct = $(".progress__pct");
let frame = 0;
const paint = () => {
  frame = 0;
  const max = document.documentElement.scrollHeight - innerHeight;
  const value = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
  const filled = Math.round(value * 20);
  track?.parentElement.classList.toggle("is-zero", scrollY < 4);
  if (track) track.textContent = "[" + "=".repeat(Math.max(0, filled - 1)) + (filled ? ">" : "") + " ".repeat(20 - filled) + "]";
  if (pct) pct.textContent = `${Math.round(value * 100)}%`;
};
addEventListener("scroll", () => { if (!frame) frame = requestAnimationFrame(paint); }, { passive: true });
addEventListener("resize", paint);
paint();

/* ---------- copy email → output line ---------- */
const copyOut = $("[data-copy-out]");
const copyEmail = async () => {
  let ok = false;
  try {
    if (navigator.clipboard && isSecureContext) { await navigator.clipboard.writeText(EMAIL); ok = true; }
  } catch { ok = false; }
  if (copyOut) copyOut.textContent = ok ? `copied ✓  ${EMAIL}` : `복사하지 못했습니다. 직접 선택해 주세요: ${EMAIL}`;
  return ok;
};
$$("[data-copy-email]").forEach((button) => button.addEventListener("click", copyEmail));

/* ---------- command palette ---------- */
const palette = $("#palette");
const keysDialog = $("#keys");
const input = $("#palette-input");
const list = $("#palette-list");
const log = $("[data-log]");
const places = { "~": "top", about: "about", projects: "projects", career: "career", oss: "activity", docs: "documents", contact: "contact" };
const links = { github: "https://github.com/ch4570", velog: "https://velog.io/@ch4570/posts", linkedin: "https://www.linkedin.com/in/devseorex/", mail: `mailto:${EMAIL}` };
const commands = [
  ...Object.keys(places).map((name) => ({ cmd: `cd ${name}`, desc: name === "~" ? "맨 위로" : "섹션으로 이동" })),
  ...Object.keys(links).map((name) => ({ cmd: `open ${name}`, desc: name === "mail" ? "메일 쓰기" : "새 탭으로 열기" })),
  ...toggles.map((button) => ({ cmd: `describe ${button.closest(".project").id.replace("case-", "")}`, desc: $(".kube__name", button).textContent })),
  { cmd: "cat resume.pdf", desc: "이력서 PDF 열기" },
  { cmd: "copy email", desc: "메일 주소 복사" },
  { cmd: "whoami", desc: "한 줄 소개" },
  { cmd: "help", desc: "명령 목록" },
  { cmd: "clear", desc: "기록 지우기" },
];
let selected = 0;
let opener = null;
let skipRestore = false;
const escapeHtml = (text) => text.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
const print = (text, tone = "") => {
  const line = document.createElement("p");
  if (tone) line.className = tone;
  line.textContent = text;
  log.append(line);
  log.scrollTop = log.scrollHeight;
};
const candidates = () => {
  const query = input.value.trim().toLowerCase();
  return commands.filter((c) => !query || c.cmd.startsWith(query) || c.cmd.includes(query)).slice(0, 7);
};
const renderList = () => {
  const items = candidates();
  selected = Math.min(selected, Math.max(0, items.length - 1));
  list.innerHTML = items.map((c, i) => `<li role="option" id="palette-opt-${i}" aria-selected="${i === selected}" data-cmd="${escapeHtml(c.cmd)}"><span>${escapeHtml(c.cmd)}</span><small>${escapeHtml(c.desc)}</small></li>`).join("");
  input.setAttribute("aria-expanded", String(items.length > 0));
  if (items.length) input.setAttribute("aria-activedescendant", `palette-opt-${selected}`);
  else input.removeAttribute("aria-activedescendant");
};
const openPalette = () => {
  if (!palette || palette.open) return;
  opener = document.activeElement;
  palette.showModal();
  input.value = "";
  selected = 0;
  renderList();
  input.focus();
};
palette?.addEventListener("close", () => {
  if (!skipRestore) opener?.focus?.();
  skipRestore = false;
});
palette?.addEventListener("click", (event) => { if (event.target === palette) palette.close(); });
$("[data-close-palette]")?.addEventListener("click", () => palette.close());
const goTo = (id) => {
  skipRestore = true;
  palette.close();
  const section = document.getElementById(id);
  runSection(section, true);
  section.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  $("h1, h2", section)?.focus({ preventScroll: true });
};
const execute = (raw) => {
  const line = raw.trim();
  if (!line) return;
  print(`❯ ${line}`, "echo");
  const [head, ...rest] = line.split(/\s+/);
  const arg = rest.join(" ");
  if (head === "help") {
    print(`이동     cd ${Object.keys(places).join(" | ")}`);
    print(`열기     open ${Object.keys(links).join(" | ")}  ·  cat resume.pdf`);
    print(`프로젝트 describe ${toggles.map((b) => b.closest(".project").id.replace("case-", "")).join(" | ")}`);
    print("기타     copy email  ·  whoami  ·  clear  ·  Tab 자동완성");
  }
  else if (head === "clear") log.replaceChildren();
  else if (head === "whoami") print("서민재 — 실패한 업무는 골라서 다시 실행하고, 잘못 저장된 데이터는 원인부터 찾아 바로잡는 백엔드 엔지니어", "ok");
  else if (head === "cd") { const id = places[arg || "~"]; if (id) goTo(id); else print(`cd: 그런 섹션이 없습니다: ${arg}  (ls: ${Object.keys(places).join(" ")})`, "err"); }
  else if (head === "ls") print(Object.keys(places).filter((k) => k !== "~").map((k) => `${k}/`).join("  "));
  else if (head === "open") {
    const url = links[arg];
    if (!url) print(`open: 알 수 없는 대상입니다: ${arg}  (github · velog · linkedin · mail)`, "err");
    else { print(`${arg} 여는 중…`, "ok"); if (url.startsWith("mailto:")) location.href = url; else window.open(url, "_blank", "noopener"); }
  } else if (head === "describe") {
    const id = `case-${arg}`;
    if (document.getElementById(id)) { skipRestore = true; palette.close(); openProject(id); }
    else print(`describe: 그런 프로젝트가 없습니다: ${arg}`, "err");
  } else if (line === "cat resume.pdf") { print("resume.pdf 여는 중…", "ok"); window.open("./pdf/seo-minjae-resume.pdf", "_blank", "noopener"); }
  else if (line === "copy email") copyEmail().then((ok) => print(ok ? `copied ✓  ${EMAIL}` : `복사하지 못했습니다: ${EMAIL}`, ok ? "ok" : "err"));
  else print(`zsh: command not found: ${head}  — help로 명령을 확인하세요`, "err");
};
if (palette) {
  input.addEventListener("input", () => { selected = 0; renderList(); });
  input.addEventListener("keydown", (event) => {
    const items = candidates();
    if (event.key === "ArrowDown") { event.preventDefault(); selected = (selected + 1) % Math.max(1, items.length); renderList(); }
    else if (event.key === "ArrowUp") { event.preventDefault(); selected = (selected - 1 + items.length) % Math.max(1, items.length); renderList(); }
    else if (event.key === "Tab" && items[selected]) { event.preventDefault(); input.value = items[selected].cmd; renderList(); }
  });
  $("[data-palette-form]").addEventListener("submit", (event) => {
    event.preventDefault();
    const value = input.value.trim();
    const items = candidates();
    const exact = commands.some((c) => c.cmd === value);
    execute(!exact && value && items[selected] ? items[selected].cmd : value);
    input.value = "";
    renderList();
  });
  list.addEventListener("click", (event) => {
    const option = event.target.closest("li");
    if (!option) return;
    execute(option.dataset.cmd);
    input.value = "";
    renderList();
    input.focus();
  });
  $("[data-open-palette]").hidden = false;
  $("[data-open-palette]").addEventListener("click", openPalette);
  $(".endline__keys")?.removeAttribute("hidden");
  $("[data-open-keys]")?.addEventListener("click", () => keysDialog?.showModal());
}

/* single-character shortcuts can be switched off (WCAG 2.1.4) */
const shortcutsBox = $("[data-shortcuts]");
let shortcutsOn = true;
try { shortcutsOn = localStorage.getItem("home.shortcuts") !== "off"; } catch { shortcutsOn = true; }
if (shortcutsBox) {
  shortcutsBox.checked = shortcutsOn;
  shortcutsBox.addEventListener("change", () => {
    shortcutsOn = shortcutsBox.checked;
    try { localStorage.setItem("home.shortcuts", shortcutsOn ? "on" : "off"); } catch { /* per-viewer convenience only */ }
  });
}

/* ---------- global keys: ⌘K, /, j/k, ? ---------- */
const sections = $$("[data-sec]");
const currentIndex = () => {
  const line = innerHeight * 0.3;
  let index = 0;
  sections.forEach((section, i) => { if (section.getBoundingClientRect().top <= line) index = i; });
  return index;
};
addEventListener("keydown", (event) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (palette?.open) palette.close(); else openPalette();
    return;
  }
  if (typing || palette?.open || keysDialog?.open || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === "?" || (event.code === "Slash" && event.shiftKey)) { event.preventDefault(); keysDialog?.showModal(); return; }
  if (!shortcutsOn) return;
  const down = event.key === "j" || event.code === "KeyJ";
  const up = event.key === "k" || event.code === "KeyK";
  if (event.key === "/" || event.code === "Slash") { event.preventDefault(); openPalette(); }
  else if (down || up) {
    const index = Math.min(sections.length - 1, Math.max(0, currentIndex() + (down ? 1 : -1)));
    const section = sections[index];
    runSection(section, true);
    section.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
    $("h1, h2", section)?.focus({ preventScroll: true });
  }
});

/* ---------- interactive flowcharts ---------- */
import("./flow.js").then(({ mountFlows }) => mountFlows()).catch(() => { /* static step lists stay */ });

/* ---------- three.js hero (progressive) ---------- */
const stream = $("[data-stream]");
if (stream) {
  import("./event-stream.js")
    .then(({ mountEventStream }) => mountEventStream(stream))
    .then((live) => {
      if (!live) return;
      $(".stream__fallback", stream)?.setAttribute("hidden", "");
      const inject = $("[data-inject]", stream);
      if (inject && !reduce) inject.hidden = false;
      const pause = $("[data-pause]", stream);
      if (pause && !reduce) pause.hidden = false;
    })
    .catch(() => { /* static SVG stays */ });
}
