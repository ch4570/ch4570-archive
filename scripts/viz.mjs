// 제출 문서(이력서·경력기술서·포트폴리오)의 도식 SVG를 만드는 재사용 모듈.
// 값은 랠릿 프로필 또는 저장소 문서에 실제로 있는 숫자만 쓴다. 값이 둘뿐이면 추세선이 아니라
// 전후 막대로 그리고, 막대 길이는 값에 비례한다. 계산해서 만든 중간값·추세는 넣지 않는다.
// 각 도식은 data-viz(식별자)와 data-src(출처)를 달고, SVG는 aria-hidden이다(같은 숫자가 본문
// 글머리에 글자로 있다). VIZ[id].facts는 같은 문서 본문에 글자로 있어야 하는 값이며
// scripts/viz-consistency.test.mjs가 도식 마크업과 본문 숫자가 어긋나지 않는지 검사한다.

const svg = (w, h, inner) =>
  `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false"><defs><marker id="ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 1l7 3-7 3z" class="v-arrow"/></marker></defs>${inner}</svg>`;
// 화살촉 marker id가 문서 안에서 겹치지 않도록 도식 식별자를 붙인다.
const wrap = (id, src, inner, cls = "") =>
  `<div class="viz${cls ? ` ${cls}` : ""}" data-viz="${id}" data-src="${src}">${inner.replaceAll('id="ah"', `id="ah-${id}"`).replaceAll("url(#ah)", `url(#ah-${id})`)}</div>`;
const text = (x, y, cls, s, anchor = "start") =>
  `<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}">${s}</text>`;
const box = (x, y, w, h, cls, rx = 4) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" class="${cls}"/>`;
const arrow = (x1, y1, x2, y2) =>
  `<path d="M${x1} ${y1}L${x2} ${y2}" class="v-line" marker-end="url(#ah)"/>`;
const r1 = (n) => Math.round(n * 10) / 10;

const SRC = {
  rds: "랠릿 프로젝트 08: Live RDS CPU 99% 과점유 → 평균 3%",
  tests: "랠릿 프로젝트 08: 테스트 0개 → 300개+",
  s3: "랠릿 프로젝트 08: S3 미삭제 60,325건, 771.61 GB",
  funnel: "랠릿 프로젝트 02: 1차 500건 → 2차 100건 → 재정렬, 20건 응답",
  paths: "랠릿 프로젝트 02: 9개 조회 경로, 경로별 500ms 타임아웃",
  approval: "랠릿 경력 01·프로젝트 01: 신청, 검증, 승인, 승인 뒤 캐시 갱신",
  endpoints: "랠릿 프로젝트 01: 노드 나열 → Primary·reader endpoint",
  events: "랠릿 프로젝트 05: 6개 상태, 15분 초과 알림 / 저장소 문서: 이벤트 9종, 복구 경로 8개",
  archive: "랠릿 프로젝트 05: 참조 순서대로 이동, 중단되면 시작 ID를 지정해 남은 범위부터 재실행",
  duplicate: "랠릿 프로젝트 05: 60초, 클릭 정보 5개 키",
  expiry: "랠릿 프로젝트 05: 광고 노출 종료일 576건",
  timeline: "랠릿 경력 01~04 재직 기간",
};

function bars({ id, src, title, rows, max, maxW = 124, labelW = 56 }) {
  let g = text(0, 12, "v-cap", title);
  rows.forEach((r, i) => {
    const y = 26 + i * 26;
    const w = (r.value / max) * maxW;
    g += text(0, y + 12, "v-l", r.label);
    g +=
      r.value === 0
        ? `<path d="M${labelW} ${y - 1}v16" class="v-tick"/>`
        : box(labelW, y, Math.max(r1(w), 2.5), 15, r.after ? "v-after" : "v-before", 2);
    g += text(labelW + Math.max(r1(w), 2.5) + 6, y + 12, "v-n", r.text);
  });
  return wrap(id, src, svg(270, 26 + rows.length * 26, g));
}

function stat({ id, src, title, big, lines }) {
  let g = text(0, 12, "v-cap", title) + text(0, 46, "v-big", big);
  lines.forEach((l, i) => (g += text(0, 66 + i * 16, "v-l", l)));
  return wrap(id, src, svg(270, 66 + lines.length * 16 + 2, g));
}

const builders = {
  "rds-cpu": () =>
    bars({ id: "rds-cpu", src: SRC.rds, title: "Live RDS CPU", max: 100, rows: [{ label: "개선 전", value: 99, text: "99%" }, { label: "개선 후", value: 3, text: "평균 3%", after: true }] }),
  "test-count": () =>
    bars({ id: "test-count", src: SRC.tests, title: "Drive 서비스 테스트", max: 300, maxW: 110, rows: [{ label: "도입 전", value: 0, text: "0개" }, { label: "도입 후", value: 300, text: "300개+", after: true }] }),
  "s3-cleanup": () =>
    stat({ id: "s3-cleanup", src: SRC.s3, title: "S3 미삭제 파일", big: "60,325건", lines: ["찾아서 삭제", "771.61 GB 점유 해소"] }),
  "feed-paths": () => {
    let g = text(0, 12, "v-cap", "후보 조회 경로 · 병렬");
    for (let i = 0; i < 9; i++) g += box((i % 3) * 27, 24 + Math.floor(i / 3) * 27, 21, 21, "v-hi", 3);
    g += text(92, 40, "v-lb", "경로 9개를 동시에 실행");
    g += text(92, 60, "v-l", '경로마다 <tspan class="v-n">500ms</tspan> 타임아웃');
    g += text(92, 78, "v-l", "늦은 경로만 빼고 응답");
    return wrap("feed-paths", SRC.paths, svg(270, 108, g));
  },
  "feed-funnel": () => {
    const rows = [["1차 랭킹", 500, "500건"], ["2차 랭킹", 100, "100건"], ["재정렬 · 응답", 20, "20건"]];
    let g = text(0, 12, "v-cap", "후보 수 · 3단계 랭킹");
    rows.forEach(([l, v, t], i) => {
      const y = 26 + i * 26;
      const w = Math.max(r1((v / 500) * 124), 2.5);
      g += text(0, y + 12, "v-l", l) + box(80, y, w, 15, i === 2 ? "v-after" : "v-before", 2) + text(80 + w + 6, y + 12, "v-n", t);
    });
    return wrap("feed-funnel", SRC.funnel, svg(270, 108, g));
  },
  approval: () => {
    const xs = [0, 88, 176, 264], labels = ["신청", "검증", "승인", "캐시 갱신"];
    let g = text(0, 12, "v-cap", "코드 변경 승인 흐름");
    xs.forEach((x, i) => {
      g += box(x, 24, 66, 30, i === 2 ? "v-hi" : "v-box");
      g += text(x + 33, 43, "v-lb", labels[i], "middle");
      if (i < 3) g += arrow(x + 68, 39, xs[i + 1] - 2, 39);
    });
    g += text(165, 76, "v-s", "검증: 사이트별 정합성", "middle") + text(165, 92, "v-s", "승인 직전 재판정", "middle");
    return wrap("approval", SRC.approval, svg(330, 100, g), "viz--wide viz--max");
  },
  endpoints: () => {
    let g = text(0, 12, "v-cap", "이전 · 노드 나열") + text(186, 12, "v-cap", "이후 · endpoint");
    g += box(0, 38, 34, 40, "v-box") + text(17, 62, "v-lb", "앱", "middle");
    ["node A", "node B", "…"].forEach((t, i) => {
      const y = 22 + i * 28;
      g += box(70, y, 76, 22, "v-box") + text(108, y + 15, "v-d", t, "middle") + arrow(36, 58, 68, y + 11);
    });
    g += box(186, 38, 34, 40, "v-box") + text(203, 62, "v-lb", "앱", "middle");
    g += box(256, 24, 74, 24, "v-hi") + text(293, 40, "v-d", "Primary", "middle") + arrow(222, 52, 254, 38);
    g += box(256, 68, 74, 24, "v-box") + text(293, 84, "v-d", "reader", "middle") + arrow(222, 66, 254, 80);
    return wrap("endpoints", SRC.endpoints, svg(330, 104, g), "viz--wide viz--max");
  },
  "event-recovery": () => {
    let g = text(0, 12, "v-cap", "이벤트 실패 단계 · 복구 · 정체 알림");
    const row1 = [["이벤트 9종", 0, 82], ["발행", 102, 52], ["처리", 174, 52], ["완료", 246, 52]];
    row1.forEach(([t, x, w], i) => {
      g += box(x, 22, w, 26, i === 3 ? "v-hi" : "v-box") + text(x + w / 2, 39, "v-lb", t, "middle");
      if (i < 3) g += arrow(x + w + 2, 35, row1[i + 1][1] - 2, 35);
    });
    g += text(306, 39, "v-n", "상태 6개");
    g += box(78, 70, 80, 22, "v-dash") + text(118, 85, "v-s", "발행 전 멈춤", "middle") + arrow(128, 50, 118, 68);
    g += box(166, 70, 80, 22, "v-dash") + text(206, 85, "v-s", "처리 중 실패", "middle") + arrow(200, 50, 206, 68);
    g += box(10, 114, 110, 34, "v-box") + text(65, 128, "v-sb", "payload 저장", "middle") + text(65, 142, "v-s", "(JSONB)", "middle");
    g += box(140, 114, 100, 34, "v-box") + text(190, 128, "v-sb", "복구 경로 8개", "middle") + text(190, 142, "v-s", "업무별", "middle");
    g += box(260, 114, 100, 34, "v-hi") + text(310, 128, "v-sb", "실패한 업무만", "middle") + text(310, 142, "v-sb", "다시 실행", "middle");
    g += `<path d="M118 94V104H65V112" class="v-line" marker-end="url(#ah)"/><path d="M206 94V104H65" class="v-line"/>`;
    g += arrow(122, 131, 138, 131) + arrow(242, 131, 258, 131);
    g += box(0, 162, 360, 24, "v-dash") + text(180, 178, "v-s", "IN_PROGRESS 15분 초과 → 유형별로 묶어 Slack 알림", "middle");
    return wrap("event-recovery", SRC.events, svg(360, 190, g), "viz--wide viz--max");
  },
  "archive-batch": () => {
    // 개수가 아니라 흐름만 그린다: 참조 순서대로 이동 → 중단 → 시작 ID 지정 → 남은 범위부터 재실행.
    const xs = [0, 87, 174, 261];
    let g = text(0, 12, "v-cap", "아카이브 배치 · 중단 뒤 이어 실행");
    g += box(xs[0], 24, 69, 36, "v-box") + text(xs[0] + 34.5, 40, "v-sb", "참조 순서대로", "middle") + text(xs[0] + 34.5, 54, "v-sb", "이동", "middle");
    g += box(xs[1], 24, 69, 36, "v-dash") + text(xs[1] + 34.5, 46, "v-sb", "중단", "middle");
    g += box(xs[2], 24, 69, 36, "v-box") + text(xs[2] + 34.5, 40, "v-sb", "시작 ID", "middle") + text(xs[2] + 34.5, 54, "v-sb", "지정", "middle");
    g += box(xs[3], 24, 69, 36, "v-hi") + text(xs[3] + 34.5, 40, "v-sb", "남은 범위부터", "middle") + text(xs[3] + 34.5, 54, "v-sb", "재실행", "middle");
    for (let i = 0; i < 3; i++) g += arrow(xs[i] + 71, 42, xs[i + 1] - 2, 42);
    return wrap("archive-batch", SRC.archive, svg(330, 72, g), "viz--wide viz--max");
  },
  "stat-duplicate-click": () =>
    stat({ id: "stat-duplicate-click", src: SRC.duplicate, title: "중복 클릭 차단", big: "60초", lines: ["클릭 정보 5개 키 일치 시", "차감 없이 어뷰징 로그 기록"] }),
  "stat-ad-end-date": () =>
    stat({ id: "stat-ad-end-date", src: SRC.expiry, title: "광고 노출 종료일", big: "576건", lines: ["일괄 보정"] }),
  timeline: () => {
    // 달 단위 위치. m=0은 2022.11, 오른쪽 끝은 2026.12 직전(현재). 재직 사이 빈 기간은 칠하지 않는다.
    const x0 = 70, per = 280 / 48;
    const lanes = [
      ["웍스피어", 31, 48, "2025.06 – 현재", true],
      ["토스랩", 19, 30, "2024.06 – 2025.04"],
      ["오케스트로", 10, 19, "2023.09 – 2024.05"],
      ["즐거운", 0, 4, "2022.11 – 2023.02"],
    ];
    let g = "";
    [[2, "2023"], [14, "2024"], [26, "2025"], [38, "2026"]].forEach(([m, y]) => {
      const x = r1(x0 + m * per);
      g += `<path d="M${x} 6V104" class="v-grid"/>` + text(x, 120, "v-cap", y, "middle");
    });
    lanes.forEach(([n, a, b, d, hi], i) => {
      const y = 12 + i * 24, xa = r1(x0 + a * per), xb = r1(x0 + b * per);
      g += text(0, y + 12, "v-lb", n) + box(xa, y, r1(xb - xa), 17, hi ? "v-after" : "v-before", 2);
      g += hi ? text(xa + 6, y + 12.5, "v-d", d) : text(xb + 6, y + 12.5, "v-d", d);
    });
    return wrap("timeline", SRC.timeline, svg(360, 126, g), "viz--wide viz--max");
  },
};

/** facts: 같은 문서 본문(도식 밖)에 글자로 있어야 하는 값. */
export const VIZ = {
  "rds-cpu": { facts: ["99%", "3%"] },
  "test-count": { facts: ["0개", "300개+"] },
  "s3-cleanup": { facts: ["60,325건", "771.61 GB"] },
  "feed-paths": { facts: ["9개", "500ms"] },
  "feed-funnel": { facts: ["500건", "100건", "20건"] },
  approval: { facts: ["신청", "검증", "승인", "캐시"] },
  endpoints: { facts: ["Primary", "reader"] },
  "event-recovery": { facts: ["9종", "6개", "8개", "15분"] },
  "archive-batch": { facts: ["시작 ID"] },
  "stat-duplicate-click": { facts: ["60초", "5개"] },
  "stat-ad-end-date": { facts: ["576건"] },
  timeline: { facts: ["2022.11", "2023.02", "2023.09", "2024.05", "2024.06", "2025.04", "2025.06"] },
};
for (const id of Object.keys(VIZ)) VIZ[id].build = builders[id];

export const render = (id) => {
  if (!builders[id]) throw new Error(`unknown diagram: ${id}`);
  return builders[id]();
};
export const row = (...ids) => `<div class="viz-row">${ids.map(render).join("")}</div>`;
export const row2 = (...ids) => `<div class="viz-row viz-row--2">${ids.map(render).join("")}</div>`;
