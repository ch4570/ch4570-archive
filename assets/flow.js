// Interactive flowcharts for project "describe" panels.
// The static <ol> in each figure stays the accessible source of the steps; this module
// draws an SVG over it, lets the reader pick a scenario, and moves a token along the
// exact path (prev / play / next, ← →, or click a node). Reduced motion: no travel.

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const NS = "http://www.w3.org/2000/svg";

// Node kinds: step · gate (decision) · fail · done. Coordinates are in a 760×300 box.
export const FLOWS = {
  // Event recovery, as implemented: only CREATED events execute; failures split by kind.
  event: {
    view: [980, 380],
    nodes: {
      req: { x: 60, y: 130, label: "업무 처리" },
      create: { x: 210, y: 130, label: "이벤트 저장\nCREATED · payload" },
      pub: { x: 370, y: 130, label: "Kafka 발행", kind: "gate" },
      consume: { x: 535, y: 130, label: "수신 → IN_PROGRESS", kind: "gate" },
      work: { x: 705, y: 130, label: "업무 실행", kind: "gate" },
      done: { x: 895, y: 130, label: "COMPLETED", kind: "done" },
      skip: { x: 535, y: 36, label: "이미 처리된 이벤트 건너뜀", kind: "done" },
      sendFail: { x: 370, y: 250, label: "SEND_FAILED\n발행 실패로 분리", kind: "fail" },
      failed: { x: 785, y: 250, label: "FAILED\n재시도 대상", kind: "fail" },
      nrf: { x: 920, y: 250, label: "규칙 위반\n재시도 안 함", kind: "fail" },
      stuck: { x: 535, y: 340, label: "15분 넘게 IN_PROGRESS\n→ 유형별 Slack 요약", kind: "fail" },
      recover: { x: 790, y: 340, label: "복구 워커: 유형·상태로 조회\n→ payload로 그 업무만 재실행" },
    },
    edges: [
      ["req", "create"], ["create", "pub"], ["pub", "consume"], ["consume", "work"], ["work", "done", "성공"],
      ["pub", "sendFail", "발행 실패", { anchor: "start", labelDx: 8, labelDy: 4 }], ["consume", "skip", "중복", { anchor: "start", labelDx: 8, labelDy: 4 }],
      ["work", "failed", "예외", { anchor: "end", labelDx: -6, labelDy: 0 }], ["work", "nrf", "규칙 위반", { anchor: "start", labelDx: 8, labelDy: -2 }],
      ["consume", "stuck", "15분 정체", { anchor: "start", labelDx: 8, labelDy: 4 }], ["stuck", "recover"], ["failed", "recover"], ["recover", "work", "재실행", { bend: -80, anchor: "end", labelDx: -8 }],
    ],
    scenarios: [
      { key: "ok", label: "정상", path: ["req", "create", "pub", "consume", "work", "done"] },
      { key: "fail", label: "처리 실패", path: ["req", "create", "pub", "consume", "work", "failed", "recover", "work", "done"] },
      { key: "stuck", label: "장기 정체", path: ["req", "create", "pub", "consume", "stuck", "recover", "work", "done"] },
      { key: "dup", label: "중복 수신", path: ["req", "create", "pub", "consume", "skip"] },
      { key: "send", label: "발행 실패", path: ["req", "create", "pub", "sendFail"] },
      { key: "rule", label: "규칙 위반", path: ["req", "create", "pub", "consume", "work", "nrf"] },
    ],
    notes: {
      req: "포인트 업무가 끝나면 후속 처리를 위한 내부 이벤트를 만듭니다.",
      create: "이벤트를 CREATED 상태로 저장하고, 다시 실행할 때 쓸 payload를 PostgreSQL JSONB로 함께 남깁니다.",
      pub: "Kafka로 발행합니다.",
      consume: "consumer가 받으면 IN_PROGRESS로 바꿉니다. CREATED인 이벤트만 실행해 같은 이벤트가 두 번 처리되지 않게 합니다.",
      work: "이벤트 유형에 맞는 업무를 실행합니다.",
      done: "업무가 끝나면 COMPLETED가 됩니다.",
      sendFail: "발행 단계에서 실패한 이벤트는 SEND_FAILED로 따로 분류해, 처리 단계 실패와 구분합니다.",
      skip: "이미 처리 중이거나 끝난 이벤트는 건너뜁니다.",
      failed: "그 밖의 예외는 별도 트랜잭션으로 FAILED를 기록해 재시도 대상으로 남깁니다.",
      nrf: "업무 규칙 위반은 다시 실행해도 같은 결과라서 재시도하지 않는 실패로 기록합니다.",
      stuck: "IN_PROGRESS로 15분 넘게 멈춘 이벤트를 유형별로 묶어 Slack 한 건으로 알립니다.",
      recover: "복구 워커가 유형과 상태로 대상을 찾고, 저장한 payload로 그 업무만 같은 이벤트 ID로 다시 실행합니다. 업무별 복구 경로는 8개입니다.",
    },
  },
  // Point batches, as implemented: cursor-based paging; archive moves 10 tables per chunk in a fixed order.
  batch: {
    view: [940, 395],
    nodes: {
      base: { x: 70, y: 80, label: "기준 시각 고정" },
      scan: { x: 245, y: 80, label: "커서 다음 후보를\n한 구간씩 조회", kind: "gate" },
      pick: { x: 435, y: 80, label: "대상 회원 선별\n· 중복 제거" },
      expire: { x: 625, y: 80, label: "회원 청크 단위로\n소멸 처리" },
      stat: { x: 830, y: 80, label: "끝 → 일별 통계\n이벤트 발행", kind: "done" },
      aStart: { x: 70, y: 290, label: "상한 ID ·\n보관 기준 고정" },
      aRead: { x: 255, y: 290, label: "상태·보관 기간으로\n후보 조회", kind: "gate" },
      aMove: { x: 480, y: 290, label: "청크마다 테이블 10개를\n정해진 순서로 이동" },
      aStop: { x: 680, y: 290, label: "중단", kind: "fail" },
      aRerun: { x: 840, y: 290, label: "시작 ID를 지정해\n다시 실행" },
    },
    edges: [
      ["base", "scan"], ["scan", "pick", "있음"], ["pick", "expire"], ["expire", "scan", "커서 이동", { lift: 50 }], ["scan", "stat", "더 없음", { bend: 120, labelDy: 18 }],
      ["aStart", "aRead"], ["aRead", "aMove"], ["aMove", "aRead", "다음 청크", { lift: 46 }], ["aMove", "aStop", "장애"], ["aStop", "aRerun"], ["aRerun", "aRead", "남은 범위부터", { below: true, lift: 54, labelDy: 16 }],
    ],
    scenarios: [
      { key: "expire", label: "소멸 (페이지 단위)", path: ["base", "scan", "pick", "expire", "scan", "pick", "expire", "scan", "stat"] },
      { key: "archive", label: "아카이브", path: ["aStart", "aRead", "aMove", "aRead", "aMove"] },
      { key: "rerun", label: "아카이브 중단 후 재실행", path: ["aStart", "aRead", "aMove", "aStop", "aRerun", "aRead", "aMove"] },
    ],
    notes: {
      base: "소멸 기준 시각을 먼저 고정합니다.",
      scan: "커서 다음의 후보 원장을 한 구간씩 읽습니다. 걸러진 후보도 커서는 앞으로 갑니다.",
      pick: "대상 회원만 남기고 중복을 없앱니다.",
      expire: "회원을 청크로 나눠 소멸 대상을 처리합니다. 한 번에 전부 읽지 않습니다.",
      stat: "더 읽을 후보가 없으면 끝나고, 일별 소멸 통계 이벤트를 발행합니다.",
      aStart: "아카이브 단계 시작 시 상한 ID와 보관 기준일을 한 번 고정합니다.",
      aRead: "상태와 보관 기간 조건으로 옮길 후보 ID를 읽습니다.",
      aMove: "청크마다 원장·상태·이력·거래 기록 등 테이블 10개를 참조 관계에 맞는 순서로 아카이브로 옮깁니다.",
      aDone: "",
      aStop: "중간에 멈춰도 이미 옮긴 청크는 원본에서 빠져 있습니다.",
      aRerun: "시작 ID를 지정해 다시 실행하면 남은 범위부터 이어서 옮깁니다.",
    },
  },
  // Feed serving, as implemented: last stage pulls from the previous one (Re-Rank ← SPR ← FPR).
  search: {
    view: [980, 360],
    nodes: {
      req: { x: 60, y: 80, label: "피드 요청", kind: "gate" },
      snap: { x: 215, y: 80, label: "스냅샷에서\n한 페이지 꺼내기", kind: "gate" },
      hit: { x: 215, y: 205, label: "응답 · 본 공고 기록", kind: "done" },
      src: { x: 435, y: 80, label: "검색 소스 병렬 조회\n(소스별 필터·정렬·벡터)", kind: "gate" },
      drop: { x: 435, y: 205, label: "실패한 소스만 건너뜀", kind: "fail" },
      fpr: { x: 665, y: 80, label: "FPR: 병합·차단·\n중복 제거·점수화" },
      rerank: { x: 870, y: 80, label: "SPR → Re-Rank\n(회사별 다양화)" },
      append: { x: 870, y: 205, label: "스냅샷에 추가 후\n한 페이지 응답", kind: "done" },
      first: { x: 665, y: 310, label: "캐시 없이\n첫 페이지만 계산해 응답", kind: "done" },
    },
    edges: [
      ["req", "snap"], ["snap", "hit", "있음", { anchor: "start", labelDx: 8, labelDy: 4 }], ["snap", "src", "비어 있음"], ["req", "first", "캐시 우회 · 세션 없음", { bend: 120, labelDy: 18 }],
      ["src", "fpr"], ["src", "drop", "일부 실패", { anchor: "start", labelDx: 8, labelDy: 4 }], ["drop", "fpr"], ["fpr", "rerank"], ["rerank", "append"],
    ],
    scenarios: [
      { key: "hit", label: "스냅샷 있음", path: ["req", "snap", "hit"] },
      { key: "refill", label: "스냅샷 비어 있음", path: ["req", "snap", "src", "fpr", "rerank", "append"] },
      { key: "partial", label: "소스 일부 실패", path: ["req", "snap", "src", "drop", "fpr", "rerank", "append"] },
      { key: "bypass", label: "캐시 우회", path: ["req", "first"] },
    ],
    notes: {
      req: "요청마다 캐시를 쓸지, 우회할지 정합니다.",
      snap: "저장된 스냅샷에서 다음 페이지를 꺼냅니다.",
      hit: "꺼낸 페이지를 응답하고 본 공고로 기록합니다.",
      src: "비어 있으면 앞 단계로 거슬러 채웁니다. 검색 소스는 병렬로 조회하고, 소스마다 필터·정렬·벡터 규칙과 타임아웃이 다릅니다.",
      drop: "한 소스가 시간 안에 응답하지 않거나 실패하면 그 소스만 건너뛰고 계속합니다.",
      fpr: "FPR 단계에서 후보를 합치고, 차단 대상을 거르고, 같은 공고·같은 내용을 중복 제거한 뒤 점수를 매깁니다.",
      rerank: "SPR을 거쳐 Re-Rank에서 회사가 몰리지 않게 순서를 섞습니다.",
      append: "결과를 스냅샷 뒤에 붙이고 한 페이지를 응답합니다. 저장이 실패해도 계산한 결과로 응답합니다.",
      first: "캐시를 우회하거나 세션이 없으면 Redis 캐시 없이 첫 페이지만 계산해 응답합니다.",
    },
  },
  jpa: {
    nodes: {
      mock: { x: 84, y: 80, label: "Mock 테스트는 통과" },
      bad: { x: 220, y: 80, label: "데이터가\n잘못 저장됨", kind: "fail" },
      repro: { x: 380, y: 80, label: "실제 영속성\n컨텍스트로 재현" },
      cause: { x: 540, y: 80, label: "원인 확인:\n변경 감지 누락", kind: "gate" },
      find: { x: 540, y: 200, label: "영향받은 데이터 찾기" },
      fix: { x: 380, y: 200, label: "보정 스크립트 실행" },
      done: { x: 220, y: 200, label: "약 200만 건 보정", kind: "done" },
    },
    edges: [["mock", "bad"], ["bad", "repro"], ["repro", "cause"], ["cause", "find"], ["find", "fix"], ["fix", "done"]],
    scenarios: [{ key: "fix", label: "재현과 보정", path: ["mock", "bad", "repro", "cause", "find", "fix", "done"] }],
    notes: {
      mock: "Mock 기반 테스트에서는 문제가 드러나지 않았습니다.",
      bad: "JPA 변경 감지 오류로 데이터가 잘못 저장되고 있었습니다.",
      repro: "실제 영속성 컨텍스트를 쓰는 테스트로 같은 상황을 재현했습니다.",
      cause: "변경 감지가 누락되는 지점을 원인으로 확인했습니다.",
      find: "잘못 저장된 데이터를 찾아 범위를 확정했습니다.",
      fix: "보정 스크립트로 데이터를 바로잡았습니다.",
      done: "약 200만 건을 보정했습니다.",
    },
  },
};

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const el = (name, attrs = {}, parent) => {
  const node = document.createElementNS(NS, name);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  parent?.append(node);
  return node;
};
const html = (tag, attrs = {}, text = "") => {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  if (text) node.textContent = text;
  return node;
};

function nodeBox(n) {
  const lines = n.label.split("\n");
  const width = Math.max(...lines.map((l) => [...l].reduce((sum, ch) => sum + (/[\u3131-\uD79D]/.test(ch) ? 12.5 : 7.4), 0))) + 26;
  return { w: Math.max(92, Math.min(230, width)), h: lines.length > 1 ? 50 : 34, lines };
}

// Edge geometry: straight between box borders, or an arc for back-edges on the same row.
function edgePath(a, b, boxes, offset = 0, opts = {}) {
  const A0 = boxes.get(a), B0 = boxes.get(b);
  // shift both ends sideways so a two-way pair does not overlap
  const vx = B0.x - A0.x, vy = B0.y - A0.y, vl = Math.hypot(vx, vy) || 1;
  const ox = (-vy / vl) * offset, oy = (vx / vl) * offset;
  const A = { ...A0, x: A0.x + ox, y: A0.y + oy }, B = { ...B0, x: B0.x + ox, y: B0.y + oy };
  const dx = B.x - A.x, dy = B.y - A.y;
  const exit = (box, vx, vy) => {
    const sx = box.w / 2 / Math.abs(vx || 1e-6), sy = box.h / 2 / Math.abs(vy || 1e-6);
    const s = Math.min(sx, sy);
    return [box.x + vx * s, box.y + vy * s];
  };
  if (Math.abs(dy) < 4 && dx < 0) {
    // backward on the same row: arc above (or below)
    const s = opts.below ? 1 : -1;
    const [x1, y1] = [A.x, A.y + (s * A.h) / 2], [x2, y2] = [B.x, B.y + (s * B.h) / 2];
    const lift = opts.lift ?? 46;
    return `M${x1} ${y1} C${x1} ${y1 + s * lift} ${x2} ${y2 + s * lift} ${x2} ${y2}`;
  }
  if (opts.bend) {
    const len0 = Math.hypot(dx, dy) || 1;
    const [x1, y1] = exit(A, dx / len0, dy / len0);
    const [x2, y2] = exit(B, -dx / len0, -dy / len0);
    const nx = (-dy / len0) * opts.bend, ny = (dx / len0) * opts.bend;
    return `M${x1} ${y1} C${x1 + dx * 0.25 + nx} ${y1 + dy * 0.25 + ny} ${x2 - dx * 0.25 + nx} ${y2 - dy * 0.25 + ny} ${x2} ${y2}`;
  }
  const len = Math.hypot(dx, dy) || 1;
  const [x1, y1] = exit(A, dx / len, dy / len);
  const [x2, y2] = exit(B, -dx / len, -dy / len);
  if (Math.abs(dx) > 4 && Math.abs(dy) > 4) {
    // gentle elbow curve
    return `M${x1} ${y1} C${x1 + dx * 0.15} ${y1 + dy * 0.6} ${x2 - dx * 0.15} ${y2 - dy * 0.6} ${x2} ${y2}`;
  }
  return `M${x1} ${y1} L${x2} ${y2}`;
}

export function mountFlows(root = document) {
  root.querySelectorAll("[data-flow]").forEach((figure) => {
    const def = FLOWS[figure.dataset.flow];
    if (!def || figure.dataset.flowReady) return;
    figure.dataset.flowReady = "true";
    build(figure, def);
  });
}

function build(figure, def) {
  const staticList = figure.querySelector(".flow__steps");
  const stage = html("div", { class: "flow__stage" });
  const [vw, vh] = def.view || [760, 300];
  const svg = el("svg", { viewBox: `0 0 ${vw} ${vh}`, class: "flow__svg", "aria-hidden": "true", focusable: "false" });
  stage.append(svg);
  const defs = el("defs", {}, svg);
  const marker = el("marker", { id: `arrow-${figure.dataset.flow}`, viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse" }, defs);
  el("path", { d: "M0 0L10 5L0 10z", class: "flow__arrowhead" }, marker);

  const boxes = new Map();
  Object.entries(def.nodes).forEach(([id, n]) => { if (n.label) boxes.set(id, { ...n, ...nodeBox(n) }); });

  const edgeLayer = el("g", { class: "flow__edges" }, svg);
  const edges = new Map();
  const keys = new Set(def.edges.map(([a, b]) => `${a}>${b}`));
  def.edges.forEach(([a, b, label, opts = {}]) => {
    const twoWay = keys.has(`${b}>${a}`);
    const d = edgePath(a, b, boxes, twoWay ? 9 : 0, opts);
    const g = el("g", { class: "flow__edge" }, edgeLayer);
    const path = el("path", { d, "marker-end": `url(#arrow-${figure.dataset.flow})` }, g);
    if (label) {
      const len = path.getTotalLength();
      const p = path.getPointAtLength(len / 2);
      const dxL = opts.labelDx ?? 0, dyL = opts.labelDy ?? -7;
      el("text", { x: p.x + dxL, y: p.y + dyL, class: "flow__edge-label", "text-anchor": opts.anchor || "middle" }, g).textContent = label;
    }
    edges.set(`${a}>${b}`, { g, path });
  });

  const nodeLayer = el("g", { class: "flow__nodes" }, svg);
  const nodes = new Map();
  boxes.forEach((b, id) => {
    const g = el("g", { class: `flow__node flow__node--${b.kind || "step"}`, "data-node": id, transform: `translate(${b.x} ${b.y})` }, nodeLayer);
    if (b.kind === "gate") el("rect", { x: -b.w / 2, y: -b.h / 2, width: b.w, height: b.h, rx: b.h / 2 }, g);
    else el("rect", { x: -b.w / 2, y: -b.h / 2, width: b.w, height: b.h, rx: 6 }, g);
    const t = el("text", { "text-anchor": "middle", y: b.lines.length > 1 ? -4 : 5 }, g);
    b.lines.forEach((line, i) => { const s = el("tspan", { x: 0, dy: i ? 17 : 0 }, t); s.textContent = line; });
    nodes.set(id, g);
  });
  const token = el("circle", { r: 6, class: "flow__token", cx: 0, cy: 0 }, svg);

  // controls
  const bar = html("div", { class: "flow__bar" });
  const tabs = html("div", { class: "flow__scenarios", role: "group", "aria-label": "시나리오" });
  def.scenarios.forEach((s, i) => {
    const b = html("button", { type: "button", "data-scenario": s.key, "aria-pressed": String(i === 0) }, s.label);
    tabs.append(b);
  });
  if (def.scenarios.length < 2) tabs.hidden = true;
  const ctrl = html("div", { class: "flow__ctrl" });
  const prev = html("button", { type: "button", "aria-label": "이전 단계" }, "←");
  const play = html("button", { type: "button", class: "flow__play" }, "▶ 재생");
  const next = html("button", { type: "button", "aria-label": "다음 단계" }, "→");
  const count = html("span", { class: "flow__count", "aria-hidden": "true" });
  ctrl.append(prev, play, next, count);
  bar.append(tabs, ctrl);
  const note = html("p", { class: "flow__note", "aria-live": "polite" });
  const list = html("ol", { class: "flow__list" });

  staticList.replaceWith(stage);
  stage.after(bar, note, list);
  figure.classList.add("is-interactive");

  let scenario = def.scenarios[0];
  let index = 0;
  let playing = false;
  let anim = 0;
  let timer = 0;

  const renderList = () => {
    list.replaceChildren(...scenario.path.map((id, i) => {
      const li = html("li", {}, "");
      const b = html("button", { type: "button", "data-step": String(i) }, def.nodes[id].label.replace("\n", " "));
      li.append(b);
      return li;
    }));
  };
  const paintState = () => {
    const pathSet = new Set(scenario.path);
    const pastEdges = new Set();
    const pathEdges = new Set();
    scenario.path.forEach((id, i) => {
      if (i === 0) return;
      const key = `${scenario.path[i - 1]}>${id}`;
      pathEdges.add(key);
      if (i <= index) pastEdges.add(key);
    });
    nodes.forEach((g, id) => {
      g.classList.toggle("is-off", !pathSet.has(id));
      g.classList.toggle("is-past", scenario.path.slice(0, index).includes(id));
      g.classList.toggle("is-current", scenario.path[index] === id);
    });
    edges.forEach(({ g }, key) => {
      g.classList.toggle("is-off", !pathEdges.has(key));
      g.classList.toggle("is-past", pastEdges.has(key));
    });
    const id = scenario.path[index];
    note.textContent = `${index + 1}/${scenario.path.length} · ${def.nodes[id].label.replace("\n", " ")} — ${def.notes[id]}`;
    count.textContent = `${index + 1} / ${scenario.path.length}`;
    list.querySelectorAll("button").forEach((b, i) => {
      b.classList.toggle("is-current", i === index);
      b.classList.toggle("is-past", i < index);
      if (i === index) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
    });
    prev.disabled = index === 0;
    next.disabled = index === scenario.path.length - 1;
    // narrow screens scroll the chart horizontally: keep the current node centred
    if (stage.scrollWidth > stage.clientWidth + 4) {
      const box = boxes.get(id);
      stage.scrollTo({ left: (box.x / vw) * svg.clientWidth - stage.clientWidth / 2, behavior: reduce ? "auto" : "smooth" });
    }
  };
  const restAt = (b) => ({ x: b.x - b.w / 2 + 3, y: b.y - b.h / 2 + 1 });
  const placeToken = (id) => {
    cancelAnimationFrame(anim);
    const p = restAt(boxes.get(id));
    token.setAttribute("cx", p.x);
    token.setAttribute("cy", p.y);
  };
  const settleToken = (id) => {
    const p = restAt(boxes.get(id));
    if (reduce) { placeToken(id); return; }
    const x0 = Number(token.getAttribute("cx")), y0 = Number(token.getAttribute("cy")), start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / 160);
      token.setAttribute("cx", x0 + (p.x - x0) * t);
      token.setAttribute("cy", y0 + (p.y - y0) * t);
      if (t < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  };
  const travel = (from, to, done) => {
    cancelAnimationFrame(anim);
    const edge = edges.get(`${from}>${to}`);
    if (reduce || !edge) { placeToken(to); done?.(); return; }
    const len = edge.path.getTotalLength();
    const duration = Math.min(900, Math.max(380, len * 3.2));
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const p = edge.path.getPointAtLength(len * ease(t));
      token.setAttribute("cx", p.x);
      token.setAttribute("cy", p.y);
      if (t < 1) anim = requestAnimationFrame(step);
      else { settleToken(to); done?.(); }
    };
    anim = requestAnimationFrame(step);
  };
  const go = (target, animate = true) => {
    target = Math.max(0, Math.min(scenario.path.length - 1, target));
    if (target === index) { paintState(); return; }
    const from = scenario.path[index];
    const forwardOne = target === index + 1;
    index = target;
    if (animate && forwardOne) { travel(from, scenario.path[index], paintState); paintState(); }
    else { placeToken(scenario.path[index]); paintState(); }
  };
  const stop = () => {
    playing = false;
    note.setAttribute("aria-live", "polite"); // user-driven steps are announced once
    clearTimeout(timer);
    play.textContent = index === scenario.path.length - 1 ? "↺ 다시" : "▶ 재생";
    play.setAttribute("aria-pressed", "false");
  };
  const tick = () => {
    if (!playing) return;
    if (index >= scenario.path.length - 1) { stop(); return; }
    go(index + 1);
    timer = setTimeout(tick, reduce ? 1400 : 1150);
  };
  const start = () => {
    if (index >= scenario.path.length - 1) { index = 0; placeToken(scenario.path[0]); paintState(); }
    playing = true;
    note.setAttribute("aria-live", "off"); // autoplay must not narrate every step
    play.textContent = "❚❚ 멈춤";
    play.setAttribute("aria-pressed", "true");
    timer = setTimeout(tick, 500);
  };
  const choose = (key) => {
    stop();
    scenario = def.scenarios.find((s) => s.key === key) || def.scenarios[0];
    tabs.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.scenario === key)));
    index = 0;
    renderList();
    placeToken(scenario.path[0]);
    paintState();
    start();
  };

  tabs.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) choose(b.dataset.scenario); });
  prev.addEventListener("click", () => { stop(); go(index - 1); });
  next.addEventListener("click", () => { stop(); go(index + 1); });
  play.addEventListener("click", () => (playing ? stop() : start()));
  list.addEventListener("click", (e) => { const b = e.target.closest("button[data-step]"); if (b) { stop(); go(Number(b.dataset.step)); } });
  svg.addEventListener("click", (e) => {
    const g = e.target.closest("[data-node]");
    if (!g) return;
    const i = scenario.path.indexOf(g.dataset.node, index) >= 0 ? scenario.path.indexOf(g.dataset.node, index) : scenario.path.indexOf(g.dataset.node);
    if (i >= 0) { stop(); go(i); }
  });
  figure.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea")) return;
    if (e.key === "ArrowRight") { e.preventDefault(); stop(); go(index + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); stop(); go(index - 1); }
  });

  renderList();
  placeToken(scenario.path[0]);
  paintState();
  stop();
  // Play once when the diagram first becomes visible (e.g. describe opened).
  if (!reduce && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && entry.intersectionRatio > 0.6) { io.disconnect(); start(); }
    }, { threshold: [0, 0.6, 1] });
    io.observe(stage);
  }
}
