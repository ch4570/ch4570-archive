// 홈 동작: 스크롤스파이와 진행선, 분야 필터, 프로젝트 상세 창, 키워드 지도, 상태줄·도움말·한 글자 키.
// JavaScript가 없으면 지도는 키워드 목록과 흐름 띠로, 카드는 상세까지 펼쳐진 채 읽힌다.
// 지도와 카드의 문구는 assets/home-data.js(단일 원본)에서 왔고, 이 파일은 그 데이터의 키워드 표만 읽는다.
import { CARDS, KEYWORDS } from "./home-data.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const EMAIL = "ckdekrn88@gmail.com";
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* 저장이 막혀도 동작은 한다 */ } },
};

$$("[data-current-year]").forEach((el) => { el.textContent = String(new Date().getFullYear()); });

/* ---------- 위쪽 이동줄: 스크롤스파이와 진행선 ---------- */
const navLinks = $$(".nav a");
const nav = $(".nav");
const spy = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (!e.isIntersecting) return;
    navLinks.forEach((a) => {
      const on = a.getAttribute("href") === "#" + e.target.id;
      if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
      if (on && nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: a.offsetLeft - 24, behavior: reduce ? "auto" : "smooth" });
    });
  });
}, { rootMargin: "-40% 0px -55% 0px" });
navLinks.map((a) => $(a.getAttribute("href"))).filter(Boolean).forEach((s) => spy.observe(s));
const prog = $(".prog");
addEventListener("scroll", () => {
  const h = document.documentElement;
  prog.style.transform = `scaleX(${Math.min(1, scrollY / (h.scrollHeight - innerHeight || 1))})`;
}, { passive: true });

/* ---------- 분야 필터 (프로젝트 카드의 data-axes로 거른다) ---------- */
const chips = $$(".chip"), items = $$(".grid [data-axes]"), fstat = $(".fstat");
const grid = $(".grid"), railCounter = $(".rail-count");
function applyFilter(axis, push = true) {
  chips.forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.axis === axis)));
  let n = 0;
  items.forEach((el) => {
    const on = axis === "all" || el.dataset.axes.split(" ").includes(axis);
    el.hidden = !on;
    if (on && el.classList.contains("card")) n++;
  });
  const label = chips.find((c) => c.dataset.axis === axis)?.firstChild.textContent.trim();
  if (fstat) fstat.textContent = axis === "all" ? `전체 ${n}개` : `${label} 관련 ${n}개`;
  grid?.scrollTo({ left: 0 });
  railCount();
  if (push) {
    const u = new URL(location);
    if (axis === "all") u.searchParams.delete("axis"); else u.searchParams.set("axis", axis);
    history.replaceState(null, "", u);
  }
}
chips.forEach((c) => c.addEventListener("click", () => applyFilter(c.dataset.axis)));
$$("[data-go-axis]").forEach((a) => a.addEventListener("click", () => applyFilter(a.dataset.goAxis)));
const startAxis = new URL(location).searchParams.get("axis");
applyFilter(chips.some((c) => c.dataset.axis === startAxis) ? startAxis : "all", false);

/* ---------- 좁은 화면 가로 레일 ---------- */
function railCount() {
  if (!railCounter || getComputedStyle(railCounter).display === "none") return;
  const cards = $$(".card:not([hidden])", grid);
  if (cards.length < 2) { railCounter.textContent = ""; return; }
  const w = (cards[0]?.offsetWidth || 0) + 18 || 1;
  railCounter.textContent = `${Math.min(cards.length, Math.round(grid.scrollLeft / w) + 1)} / ${cards.length} · 옆으로 밀어서 보기`;
}
grid?.addEventListener("scroll", railCount, { passive: true });
addEventListener("resize", railCount);
railCount();

/* ---------- 프로젝트 상세 창 (카드 안 .detail을 복제하고, 흐름도는 flow.js가 그 안에 그린다) ---------- */
const dlg = $("dialog.case");
let opener = null;
async function openCase(id, from) {
  const card = document.getElementById("case-" + id);
  const detail = card && $(".detail", card);
  if (!detail || !dlg) return;
  opener = from || document.activeElement;
  const src = detail.cloneNode(true);
  $$("[id]", src).forEach((n) => n.removeAttribute("id"));
  $$("[aria-labelledby]", src).forEach((n) => n.removeAttribute("aria-labelledby"));
  $$("figure.flow", src).forEach((f) => f.setAttribute("aria-label", "처리 흐름"));
  $(".case__title", dlg).textContent = $(".card__t", card)?.firstChild.textContent.trim() || $("h3", card).textContent.trim();
  $(".case__meta", dlg).textContent = $$(".card__m span", card).map((s) => s.textContent).join(" · ");
  const body = $(".case__b", dlg);
  body.replaceChildren(...src.childNodes);
  dlg.showModal();
  body.scrollTop = 0;
  $(".case__x", dlg).focus();
  const u = new URL(location);
  u.hash = "case-" + id;
  history.replaceState(null, "", u);
  try { (await import("./flow.js")).mountFlows(body); } catch { /* 단계 목록이 그대로 남는다 */ }
}
$$(".card__t, [data-open-case]").forEach((b) => b.addEventListener("click", (e) => {
  const id = b.dataset.openCase || b.closest(".card").id.replace("case-", "");
  e.preventDefault();
  openCase(id, b);
}));
dlg?.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
$(".case__x")?.addEventListener("click", () => dlg.close());
dlg?.addEventListener("close", () => {
  (opener && opener !== document.body ? opener : $("#pt"))?.focus?.();
  const u = new URL(location);
  u.hash = "projects";
  history.replaceState(null, "", u);
});
if (location.hash.startsWith("#case-")) {
  const id = location.hash.slice(6);
  requestAnimationFrame(() => openCase(id));
}

/* ---------- 연락처 ---------- */
$("[data-copy]")?.addEventListener("click", async () => {
  const out = $(".toast");
  try {
    await navigator.clipboard.writeText(EMAIL);
    out.textContent = `복사했습니다: ${EMAIL}`;
  } catch {
    out.textContent = `복사하지 못했습니다. 주소: ${EMAIL}`;
  }
});

/* ---------- 키워드 지도 ----------
   노드를 누르면 그 일의 흐름이 지도 안에 펼쳐지고, 아래 프로젝트가 같은 분야로 걸러지며, 토큰이 노드로 간다. */
const root = $("[data-hero]");
const map = $("[data-map]", root);
const KW = Object.fromEntries(KEYWORDS.map((k) => {
  const card = CARDS.find((c) => c.id === k.card);
  return [k.id, { flow: Boolean(card.detail.flow), axis: k.axis, cs: k.card, cmd: k.shell.cmd, out: k.shell.out, title: card.title, w: k.word }];
}));
const AX2KW = Object.fromEntries(Object.entries(KW).map(([k, v]) => [v.axis, k]));
const ORDER = $$(".node", map).map((n) => n.dataset.kw);

const wide = matchMedia("(min-width:861px)"), fine = matchMedia("(hover:hover) and (pointer:fine)");
const token = $(".token", map);
const nodes = $$(".node", map), edges = $$(".edge", map), strips = $$(".steps", map);
const mm = $(".mm"), mmBtns = $$(".mm__b"), mmTok = $(".mm__tok");
const cmdEl = $("[data-cmd]", root), outEl = $("[data-out]", root);
const openBtn = $(".open[data-open-case]", root), moreLink = $("[data-more]", root);
let cur = null, cur0 = null, tapped = null, tapT = 0, typeTimer = null, cycTimer = null;
const isTouch = (e) => e.pointerType === "touch" || (!fine.matches && e.detail > 0);

/* 터치: 첫 탭은 미리 보기만 하고(페이지 전체의 data-go-axis 처리보다 먼저 가로챈다), 같은 노드를 한 번 더 누르면 이동한다 */
document.addEventListener("click", (e) => {
  const a = e.target.closest(".node__a");
  if (!a || !isTouch(e)) return;
  const k = a.dataset.kw;
  if (tapped === k || cur === k) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  tapped = k;
  clearTimeout(tapT);
  tapT = setTimeout(() => { tapped = null; }, 6000);
  select(k, false);
  setTimeout(() => { outEl.textContent += " · 한 번 더 누르면 이동합니다"; }, 800);
  $(".strip", map)?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
}, true);

/* 토큰: 허브에서 뻗은 선을 따라 노드로 간다. 한 번 가고 멈춘다 */
const E = edges.map((e) => ({ el: e, a: e.dataset.from, b: e.dataset.to, len: e.getTotalLength() }));
let sx = 1, sy = 1, raf = 0;
const measure = () => { sx = map.clientWidth / 1000; sy = map.clientHeight / 520; };
const ptOn = (ed, t, rev) => { const p = ed.el.getPointAtLength((rev ? 1 - t : t) * ed.len); return [p.x * sx, p.y * sy]; };
const put = (x, y) => { token.style.transform = `translate(${x}px,${y}px)`; };
const route = (from, to) => { // 선 그래프에서 가장 짧은 길(너비 우선)
  if (from === to) return [from];
  const prev = { [from]: null }, q = [from];
  while (q.length) {
    const c = q.shift();
    if (c === to) break;
    E.forEach((e) => { const nx = e.a === c ? e.b : e.b === c ? e.a : null; if (nx && !(nx in prev)) { prev[nx] = c; q.push(nx); } });
  }
  const r = [];
  for (let c = to; c; c = prev[c]) r.unshift(c);
  return r;
};
const rest = (k) => { const o = E.find((e) => e.a === k); return o ? { ed: o, rev: false } : { ed: E.find((e) => e.b === k), rev: true }; };
const localPos = (k, u) => { const r = rest(k); return ptOn(r.ed, r.rev ? 1 - u : u, false); };
function runToken(k, instant) {
  cancelAnimationFrame(raf);
  measure();
  const mapMode = wide.matches && document.documentElement.classList.contains("js");
  token.classList.toggle("token--list", !mapMode);
  if (!mapMode) {
    token.style.transform = "none";
    const li = $(`.node[data-kw=${k}]`, map), r = li.getBoundingClientRect(), m = map.getBoundingClientRect();
    token.style.top = (r.top - m.top + 26) + "px";
    return;
  }
  token.style.top = "0px";
  const hops = cur0 && !instant ? route(cur0, k) : [k];
  const segs = [];
  for (let i = 0; i < hops.length - 1; i++) {
    const f = hops[i], t = hops[i + 1], ed = E.find((e) => e.a === f && e.b === t);
    segs.push({ ed: ed || E.find((e) => e.a === t && e.b === f), rev: !ed });
  }
  const U0 = 0.07, UR = 0.4;
  if (reduce || instant) { const p = localPos(k, U0); put(p[0], p[1]); return; }
  const anim = { segs, t0: performance.now(), k, dur: 850 };
  const tick = (now) => {
    measure();
    const el = Math.max(0, now - anim.t0), n = anim.segs.length;
    if (el < n * anim.dur) {
      const i = Math.floor(el / anim.dur), u = (el - i * anim.dur) / anim.dur;
      const ease = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2, s = anim.segs[i];
      const p = ptOn(s.ed, ease, s.rev);
      put(p[0], p[1]);
    } else {
      const ph = Math.min(1, (el - n * anim.dur) / 4000);
      const p = localPos(anim.k, U0 + UR * (1 - Math.cos(2 * Math.PI * ph)) / 2);
      put(p[0], p[1]);
      if (ph >= 1) { raf = 0; return; }
    }
    if (raf !== 0) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

/* 쉘 줄: 명령은 흉내일 뿐이고 결과 줄만 사실이다. 명령 타이핑은 화면 읽기 도구에 알리지 않는다 */
function say(k) {
  const d = KW[k];
  clearInterval(typeTimer);
  const log = $("[data-log]", root);
  if (cmdEl.textContent && outEl.textContent) {
    const r = document.createElement("div");
    r.innerHTML = '<span class="sh__p">$</span> <span></span><span class="sh__o"></span>';
    r.children[1].textContent = cmdEl.textContent;
    r.children[2].textContent = outEl.textContent;
    log.append(r);
    while (log.children.length > 1) log.firstChild.remove();
  }
  outEl.textContent = "";
  if (reduce) { cmdEl.textContent = d.cmd; outEl.textContent = d.out; return; }
  let i = 0;
  cmdEl.textContent = "";
  typeTimer = setInterval(() => {
    cmdEl.textContent = d.cmd.slice(0, ++i);
    if (i >= d.cmd.length) { clearInterval(typeTimer); outEl.textContent = d.out; }
  }, 28);
}

/* 흐름 띠: 단계 강조는 한 바퀴만 돈다 */
function cycle() {
  clearInterval(cycTimer);
  $$(".steps li", map).forEach((l) => l.classList.remove("is-cur"));
  if (reduce) return;
  const ol = strips.find((s) => !s.hidden);
  if (!ol) return;
  const lis = $$("li", ol);
  let i = -1, rounds = 0;
  const stepOn = () => {
    if (document.hidden) return;
    lis.forEach((l) => l.classList.remove("is-cur"));
    i = (i + 1) % (lis.length + 1);
    if (i < lis.length) lis[i].classList.add("is-cur");
  };
  setTimeout(stepOn, 700);
  cycTimer = setInterval(() => {
    stepOn();
    if (i === lis.length && ++rounds >= 1) { clearInterval(cycTimer); lis.forEach((l) => l.classList.remove("is-cur")); }
  }, 900);
}

function placeMM(k) {
  const b = mmBtns.find((x) => x.dataset.kw === k);
  if (!b) return;
  const r = b.getBoundingClientRect(), m = mm.getBoundingClientRect();
  mmTok.style.transform = `translateX(${r.left + r.width / 2 - m.left}px)`;
}

/* 상태줄과 화면 읽기 도구용 한 문장 */
const sbv = $("[data-sbv]"), sbw = $("[data-sbw]"), srmsg = $("[data-srmsg]");
let srT = 0, booted = false;
function paintSb() {
  const on = $(".chip[aria-pressed=true]");
  const f = on ? on.dataset.axis : "all", n = $$(".card:not([hidden])").length;
  const field = f === "all" ? "분야 전체" : `분야 ${on.firstChild.textContent.trim()} ${n}개`;
  sbv.textContent = cur ? `키워드 ${KW[cur].w} · ${field}` : "";
  clearTimeout(srT);
  if (!booted) return; // 처음 그릴 때는 낭독하지 않는다
  srT = setTimeout(() => { if (cur) srmsg.textContent = `${KW[cur].w} 선택. ${field}`; }, 500);
}
if (fstat) new MutationObserver(paintSb).observe(fstat, { childList: true, characterData: true, subtree: true });

function select(k, apply, instant) {
  if (!KW[k]) return;
  const d = KW[k], changed = k !== cur;
  nodes.forEach((n) => {
    const on = n.dataset.kw === k, a = $(".node__a", n);
    n.classList.toggle("is-on", on);
    if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
  });
  E.forEach((e) => e.el.classList.toggle("is-on", e.a === k || e.b === k));
  strips.forEach((s) => { s.hidden = s.dataset.kw !== k; });
  $("[data-strip-k]", map).textContent = d.w;
  $("[data-strip-t]", map).textContent = d.title;
  openBtn.dataset.openCase = d.cs;
  openBtn.textContent = d.flow ? "처리 순서 보기 →" : "상세 보기 →";
  moreLink.dataset.goAxis = d.axis;
  $$(".card[data-kw]").forEach((c) => c.classList.toggle("is-kw", c.dataset.kw === k));
  mmBtns.forEach((b) => {
    const on = b.dataset.kw === k;
    if (on) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
  });
  placeMM(k);
  if (changed) { say(k); cur0 = cur; cur = k; runToken(k, instant); cycle(); }
  if (apply) {
    const chip = $(`.chip[data-axis="${d.axis}"]`);
    if (chip && chip.getAttribute("aria-pressed") !== "true") chip.click();
  }
  paintSb();
}

nodes.forEach((n) => {
  const a = $(".node__a", n), k = n.dataset.kw;
  a.addEventListener("click", (e) => {
    e.preventDefault();
    const touch = isTouch(e);
    select(k, true);
    if (touch) { tapped = null; $("#projects")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" }); }
  });
  // 마우스로 누르는 순간의 focus는 무시한다: 노드가 커지며 자리가 바뀌어 클릭이 링크에 닿지 못하던 결함이 있었다
  a.addEventListener("focus", () => { if (a.matches(":focus-visible")) select(k, false); });
  a.addEventListener("keydown", (e) => {
    const f = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!f) return;
    e.preventDefault();
    const nk = ORDER[(ORDER.indexOf(k) + f + ORDER.length) % ORDER.length];
    $(`.node[data-kw=${nk}] .node__a`, map).focus();
    select(nk, false); // 방향키는 h/l처럼 미리 보기만 한다. 거르는 것은 Enter·클릭이다
  });
});
mmBtns.forEach((b) => b.addEventListener("click", () => select(b.dataset.kw, true)));
// 분야 칩을 직접 고르면, 그 분야의 키워드로 지도도 옮겨 간다
chips.forEach((c) => c.addEventListener("click", () => { const k = AX2KW[c.dataset.axis]; if (k) select(k, false); }));

/* 큰 지도가 화면 밖으로 나가면 위쪽 줄에 작은 키워드 줄이 붙는다 */
const pane = $(".map-pane", root);
if (pane && mm) {
  new IntersectionObserver(([e]) => {
    mm.classList.toggle("is-on", !e.isIntersecting);
    $(".top").classList.toggle("has-mm", !e.isIntersecting);
    if (!e.isIntersecting) placeMM(cur);
  }, { threshold: 0.05, rootMargin: "-140px 0px 0px 0px" }).observe(pane);
}
addEventListener("resize", () => { measure(); if (cur) { cur0 = null; runToken(cur, false); placeMM(cur); } });

/* ---------- 상태줄, 도움말, 한 글자 단축키 ---------- */
const WINS = navLinks.map((a) => a.getAttribute("href").slice(1)), WN = navLinks.map((a) => a.textContent.trim());
const paintWin = () => {
  const a = navLinks.findIndex((x) => x.getAttribute("aria-current") === "true");
  if (a >= 0) sbw.textContent = `${a + 1}:${WN[a]}*`;
};
new MutationObserver(paintWin).observe(nav, { attributes: true, subtree: true, attributeFilter: ["aria-current"] });
paintWin();

const sw = $("[data-keysw]"), swState = $("[data-keystate]"), helpBtn = $("[data-helpb]"), help = $("[data-help]");
let keysOn = store.get("home-keys") !== "off";
const narrow = matchMedia("(max-width:760px)"); // 좁은 화면에서는 스위치가 숨으므로 키도 함께 꺼진다 (WCAG 2.1.4)
const paintKeys = () => { sw.setAttribute("aria-pressed", String(keysOn)); swState.textContent = keysOn ? "켜짐" : "꺼짐"; };
sw.addEventListener("click", () => { keysOn = !keysOn; store.set("home-keys", keysOn ? "on" : "off"); paintKeys(); });
paintKeys();
const toggleHelp = (force) => {
  const on = force ?? help.hidden;
  help.hidden = !on;
  helpBtn.setAttribute("aria-expanded", String(on));
};
helpBtn.addEventListener("click", () => toggleHelp());
const dialogOpen = () => !!document.querySelector("dialog[open]");
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !help.hidden && !dialogOpen()) { toggleHelp(false); helpBtn.focus(); }
});
const goSection = (id) => {
  const el = document.getElementById(id);
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  $("h1,h2", el)?.focus({ preventScroll: true });
};
document.addEventListener("keydown", (e) => {
  if (!keysOn || narrow.matches || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || dialogOpen()) return;
  if (e.target.closest("input,textarea,select,[contenteditable]")) return;
  const k = e.key, c = e.code; // 한글 입력 상태에서는 key가 달라서 code로도 알아본다
  if (/^[1-6]$/.test(k)) { e.preventDefault(); goSection(WINS[+k - 1]); return; }
  if (k === "?") { e.preventDefault(); toggleHelp(); return; }
  if (k === "h" || k === "l" || c === "KeyH" || c === "KeyL") {
    const step = c === "KeyL" || k === "l" ? 1 : -1;
    e.preventDefault();
    const nk = ORDER[(ORDER.indexOf(cur) + step + ORDER.length) % ORDER.length];
    select(nk, false);
    $(`.node[data-kw=${nk}] .node__a`, map).focus();
    return;
  }
  if (k === "j" || k === "k" || c === "KeyJ" || c === "KeyK") {
    const down = c === "KeyJ" || k === "j";
    const cards = $$(".card:not([hidden]) .card__t");
    if (!cards.length) return;
    e.preventDefault();
    const i = cards.indexOf(document.activeElement);
    const next = cards[i < 0 ? (down ? 0 : cards.length - 1) : (i + (down ? 1 : -1) + cards.length) % cards.length];
    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }
});

/* ---------- 시작: 주소의 분야나 기본 키워드로 지도를 맞춘다 ---------- */
select(AX2KW[new URL(location).searchParams.get("axis")] || "record", false, true);
booted = true;
document.fonts?.ready.then(() => { measure(); cur0 = null; runToken(cur, false); });
