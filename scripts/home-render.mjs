// assets/home-data.js의 원본을 홈 HTML 조각으로 바꾼다. 계산과 문자열 조립만 하고 파일은 건드리지 않는다.
import { AXES, CARDS, HUB, KEYWORDS, STATUS_LABEL } from "../assets/home-data.js";

export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
const n = (v) => String(Math.round(v * 10) / 10);

/* ---------- 미니 도식 ---------- */
const anchorOf = (b, side) => ({ r: [b.x + b.w, b.y + b.h / 2], l: [b.x, b.y + b.h / 2], t: [b.x + b.w / 2, b.y], b: [b.x + b.w / 2, b.y + b.h] })[side];
const isMono = (line) => /^[A-Z_#0-9 ]+$/.test(line) || line.includes("_");

function nodeSvg(b, i) {
  const lines = b.label.split("|");
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, lh = 14;
  const y0 = cy - ((lines.length - 1) * lh) / 2;
  const text = lines.map((line, j) => {
    const mono = b.mono ? b.mono.includes(j) : isMono(line);
    return `<text class="${mono ? "m" : "t"}" x="${n(cx)}" y="${n(y0 + j * lh)}" text-anchor="middle" dominant-baseline="central">${esc(line)}</text>`;
  }).join("");
  return `<g class="n k-${b.kind || "step"}" style="--i:${i}"><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="7"/>${text}</g>`;
}

function edgeSvg(nodes, [a, b, sa, sb, opt = {}], uid) {
  const [x1, y1] = anchorOf(nodes[a], sa), [x2, y2] = anchorOf(nodes[b], sb);
  let d;
  if (Math.abs(x1 - x2) < 2 || Math.abs(y1 - y2) < 2) d = `M${n(x1)} ${n(y1)} L${n(x2)} ${n(y2)}`;
  else {
    const dx = "tb".includes(sa) ? 0 : sa === "r" ? 30 : -30, dy = "lr".includes(sa) ? 0 : sa === "b" ? 30 : -30;
    const ex = "tb".includes(sb) ? 0 : sb === "r" ? 30 : -30, ey = "lr".includes(sb) ? 0 : sb === "b" ? 30 : -30;
    d = `M${n(x1)} ${n(y1)} C${n(x1 + dx)} ${n(y1 + dy)} ${n(x2 + ex)} ${n(y2 + ey)} ${n(x2)} ${n(y2)}`;
  }
  return `<path class="e ${opt.cls || ""}" d="${d}" marker-end="url(#ah-${uid})"/>`;
}

function barsSvg(bars) {
  return bars.map((r) => {
    if (r.lane) return `<text class="ln" x="0" y="${r.y}">${esc(r.text)}</text>`;
    return `<text class="t" x="0" y="${r.y}" dominant-baseline="central">${esc(r.text)}</text>`
      + `<rect class="${r.strong ? "bar1" : "bar0"}" x="${r.x}" y="${r.y - 7}" width="${r.width}" height="14" rx="${r.strong ? 3 : 1.5}"/>`
      + `<text class="m${r.strong ? " b" : ""}" x="${r.strong ? r.x + r.width + 8 : r.x + r.width + 9}" y="${r.y}" dominant-baseline="central">${esc(r.value)}</text>`;
  }).join("");
}

export function miniSvg(card) {
  const m = card.mini, uid = card.id;
  const nodes = m.nodes;
  let body = (m.lanes || []).map(([t, y]) => `<text class="ln" x="0" y="${y}">${esc(t)}</text>`).join("");
  body += m.edges.map((e) => edgeSvg(nodes, e, uid)).join("");
  body += Object.values(nodes).map((b, i) => nodeSvg(b, i)).join("");
  if (m.bars) body += barsSvg(m.bars);
  const head = `<svg class="mini" viewBox="0 0 360 204" role="img" aria-labelledby="mt-${uid}" focusable="false"><title id="mt-${uid}">${esc(m.title)}</title>`;
  if (m.plain) return head + body + "</svg>";
  const defs = `<defs><marker id="ah-${uid}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z"/></marker></defs>`;
  return `${head}${defs}<g transform="translate(0 ${n((204 - m.h) / 2)})">${body}</g></svg>`;
}

export function ossSvg(oss) {
  const rows = oss.rows.map((r, i) => {
    const y = 28 + i * 52;
    return `<a href="${r.href}" target="_blank" rel="noreferrer" aria-label="${esc(r.name)} ${esc(r.state)}"><g class="n k-${r.kind}" style="--i:${i}"><rect x="0" y="${y}" width="360" height="42" rx="7"/>`
      + `<text class="t" x="14" y="${y + 21}" dominant-baseline="central">${esc(r.name)}</text><text class="m" x="346" y="${y + 21}" text-anchor="end" dominant-baseline="central">${esc(r.state)}</text></g></a>`;
  }).join("");
  return `<svg class="mini" viewBox="0 0 360 204" role="group" aria-labelledby="mt-oss" focusable="false"><title id="mt-oss">${esc(oss.title)}</title>${rows}</svg>`;
}

/* ---------- 카드 ---------- */
const kwWord = (id) => KEYWORDS.find((k) => k.id === id)?.word;

function detailHtml(card) {
  const d = card.detail;
  const dl = `<dl class="desc">\n${d.rows.map(([dt, dd]) => `<dt>${dt}</dt><dd>${dd}</dd>`).join("\n")}\n</dl>`;
  const flow = d.flow
    ? `<figure class="flow" data-flow="${d.flow}" aria-labelledby="flow-${d.flow}-title"><figcaption id="flow-${d.flow}-title" class="flow__title">처리 흐름 <span class="dim">· 시나리오를 고르거나 단계를 눌러 보세요</span></figcaption><ol class="flow__steps">${d.steps.map((s) => `<li>${s}</li>`).join("")}</ol></figure>`
    : "";
  const diagram = d.diagram
    ? `<details class="diagram" open><summary>피드 서빙 구조도 보기</summary><figure><div class="diagram__viewport" tabindex="0" role="region" aria-label="피드 서빙 구조도. 좁은 화면에서는 가로로 스크롤할 수 있습니다."><img src="./assets/diagrams/feed-serving.svg" alt="피드 서빙 구조도: API, Orchestrator, Snapshot, 검색 소스와 FPR·SPR·Re-Rank 책임 경계" width="1000" height="360" loading="lazy" /></div><figcaption>요청 → 스냅샷 조회 → Hit이면 응답. Empty이면 검색 소스 → 중복 제거 → 점수화 → 재정렬 → 새 스냅샷 저장 → 응답.</figcaption></figure></details>`
    : "";
  const links = d.links ? `<p class="desc__links">${d.links}</p>` : "";
  return `<div class="detail">${dl}${flow}${diagram}${links}</div>`;
}

export function cardHtml(card) {
  if (card.miniOss) {
    return `<article class="card" id="case-${card.id}" data-axes="${card.axes.join(" ")}">\n  <div><figure class="card__fig">${ossSvg(card.miniOss)}</figure></div>\n  <div><h3>${esc(card.title)}</h3><p class="card__m"><span>${esc(card.summary)}</span></p></div>\n</article>`;
  }
  const kw = card.kw ? `<span class="kwtag" data-kw="${card.kw}">${esc(kwWord(card.kw))}</span>` : "";
  const attrs = `${card.kw ? ` data-kw="${card.kw}"` : ""} id="case-${card.id}" data-axes="${card.axes.join(" ")}"`;
  const tech = card.tech ? `<p class="tech">${esc(card.tech)}</p>` : "";
  return `<article class="card"${attrs}>
  <div><figure class="card__fig">${miniSvg(card)}<span class="go js-only" aria-hidden="true">자세히 ↗</span></figure></div>
  <div>
    <h3><button type="button" class="card__t" aria-haspopup="dialog">${esc(card.title)}<span class="sr-only"> — 상세 내용과 처리 순서 열기</span></button></h3>
    <p class="card__m">${kw}<span>${esc(card.org)}</span><span>${esc(card.period)}</span><span class="st st--${card.status}">${STATUS_LABEL[card.status]}</span></p>
    <p class="card__res">${card.result}</p>${tech}
  </div>
  ${detailHtml(card)}
</article>`;
}

export const renderCards = () => CARDS.map(cardHtml).join("\n");

/* ---------- 필터 칩 ---------- */
export function renderChips() {
  const count = (id) => CARDS.filter((c) => c.axes.includes(id)).length;
  const chip = (id, label, c, on) => `<button type="button" class="chip" data-axis="${id}" aria-pressed="${on}">${esc(label)}<small>${c}</small></button>`;
  return [chip("all", "전체", CARDS.length, "true"), ...AXES.map((a) => chip(a.id, a.label, count(a.id), "false"))].join("\n    ");
}

/* ---------- 지도 ---------- */
export function renderMinimap() {
  const order = ["resume", "record", "cause", "test", "split"].map((id) => KEYWORDS.find((k) => k.id === id));
  const items = order.map((k) => `<li><button type="button" class="mm__b" data-kw="${k.id}" data-go-axis="${k.axis}">${esc(k.word)}</button></li>`);
  return `<ol>${items.join('<li class="mm__e" aria-hidden="true">·</li>')}</ol><span class="mm__tok" aria-hidden="true"></span>`;
}

const stripItem = (s, i) => `<li class="${s.cls}" style="--i:${i}"><span>${esc(s.a)}</span>${s.b ? `<span class="${s.mo ? "mo" : "sub"}">${esc(s.b)}</span>` : ""}</li>`;

export function renderMap() {
  const [hx, hy] = HUB;
  const edges = KEYWORDS.map((k) => `<path class="edge" data-from="hub" data-to="${k.id}" d="${k.path}"/>`).join("");
  const nodes = KEYWORDS.map((k) => `<li class="node node--${k.tone}" data-kw="${k.id}" data-cap="${k.cap}" style="--x:${k.x};--y:${k.y}"><a class="node__a" href="#projects" data-go-axis="${k.axis}" data-kw="${k.id}"><span class="node__pill"><span class="node__w">${esc(k.word)}</span></span><span class="node__n">${k.caption}</span><span class="node__d sr-only"> — ${esc(k.desc)}</span></a></li>`).join("\n");
  const first = KEYWORDS[0];
  const strips = KEYWORDS.map((k) => `<ol class="steps${k.list ? " steps--list" : ""}" data-kw="${k.id}" aria-label="${esc(k.word)} 흐름" hidden>${k.strip.map(stripItem).join("")}</ol>`).join("\n");
  return `<svg class="map__svg" viewBox="0 0 1000 520" preserveAspectRatio="none" aria-hidden="true" focusable="false" data-hub="${hx} ${hy}">${edges}</svg>
      <ul class="kws" aria-label="키워드">
${nodes}
      </ul>
      <span class="hub" aria-hidden="true"></span><span class="token" aria-hidden="true"></span>
      <div class="strip">
        <div class="strip__head"><p class="strip__t"><b data-strip-k></b><span data-strip-t></span></p>
          <span class="strip__a js-only flex"><button type="button" class="open" data-open-case="${first.card}" aria-haspopup="dialog">처리 순서 보기 →</button><a class="open" href="#projects" data-go-axis="${first.axis}" data-more>관련 프로젝트 보기 →</a></span></div>
${strips}
      </div>`;
}

/** index.html에서 다시 쓰는 구역 이름 → 내용. */
export const REGIONS = { mm: renderMinimap, map: renderMap, chips: renderChips, cards: renderCards };
