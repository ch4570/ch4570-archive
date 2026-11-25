// 홈 지도·프로젝트 카드의 단일 원본.
// 지도의 키워드 노드, 흐름 띠, 필터 칩, 카드(미니 도식 포함), 상세 창의 문구는 모두 여기서 만든다.
// index.html의 해당 구역은 `npm run build:home`(scripts/build-home.mjs)이 이 파일에서 다시 쓰고,
// 브라우저의 assets/home.js도 같은 파일을 읽는다. 구역을 손으로 고치지 말고 이 파일을 고친다.
// 흐름도(assets/flow.js의 FLOWS)와 문구가 어긋나지 않는지는 scripts/home-data.test.mjs가 검사한다.

/** 분야 칩. 개수는 카드의 axes에서 센다. */
export const AXES = [
  { id: "event", label: "이벤트" },
  { id: "batch", label: "배치" },
  { id: "integrity", label: "정합성" },
  { id: "search", label: "검색·피드" },
  { id: "migrate", label: "전환·테스트" },
  { id: "oss", label: "오픈소스" },
];

/** 지도 한가운데(허브)와 키워드 노드 좌표는 1000×520 좌표계다. */
export const HUB = [500, 340];

const step = (a, b = "", { mo = false, cls = "" } = {}) => ({ a, b, mo, cls });

/**
 * 키워드 5개. 순서·원인 같은 관계는 사이트에 없으므로 노드끼리 잇지 않고 허브에서만 뻗는다.
 * caption은 지도 노드 아래 한 줄(<b>는 숫자 강조), desc는 화면 읽기 도구용 한 문장이다.
 * shell.out은 쉘 줄에 찍히는 결과 줄이며, 모두 카드·흐름도에 있는 문장이다.
 */
export const KEYWORDS = [
  {
    id: "record", word: "기록", tone: "stop", axis: "event", card: "event", x: 11, y: 31, cap: "b",
    path: "M500 340 C 330 360, 200 320, 184 161",
    caption: "이벤트 상태 <b>6개</b>로 멈춘 곳 추적",
    desc: "이벤트의 발행·처리 단계를 상태로 남겨 어디서 멈췄는지 추적합니다.",
    shell: { cmd: "cat event.flow", out: "상태 6개 · 15분 넘게 멈추면 Slack 알림" },
    strip: [
      step("이벤트 저장", "CREATED", { mo: true }), step("Kafka", "발행"), step("수신", "IN_PROGRESS", { mo: true }),
      step("성공하면 COMPLETED", "예외는 재시도 대상 FAILED", { cls: "k-done" }),
    ],
  },
  {
    id: "resume", word: "이어 가기", tone: "ok", axis: "batch", card: "batch", x: 33, y: 13.5, cap: "r",
    path: "M500 340 C 480 220, 360 170, 330 97",
    caption: "참조 순서대로 옮기다 멈추면 <b>시작 ID</b>를 지정해 남은 범위부터",
    desc: "중단된 배치는 시작 ID를 지정해 남은 범위부터 다시 실행합니다.",
    shell: { cmd: "cat batch.flow", out: "참조 순서대로 이동 · 중단되면 시작 ID를 지정해 남은 범위부터 다시 실행" },
    strip: [
      step("아카이브 테이블", "정해진 순서로 이동"), step("중단되면", "시작 ID 지정", { cls: "k-fail" }),
      step("남은 범위부터", "재실행", { cls: "k-done" }),
    ],
  },
  {
    id: "cause", word: "원인", tone: "stop", axis: "integrity", card: "jpa", x: 35, y: 48, cap: "b",
    path: "M500 340 C 480 300, 450 260, 424 250",
    caption: "<b>약 200만 건</b>을 바로잡기 전에 원인부터 재현했습니다",
    desc: "JPA 변경 감지 오류는 재현으로 원인을 확인한 뒤 보정했습니다.",
    shell: { cmd: "cat jpa.flow", out: "실제 영속성 컨텍스트에서 재현 → 변경 감지 누락 확인 → 약 200만 건 보정" },
    strip: [
      step("Mock 테스트", "통과"), step("데이터가", "잘못 저장됨", { cls: "k-fail" }), step("영속성 컨텍스트", "재현"),
      step("원인 확인", "변경 감지 누락"), step("보정 스크립트"), step("약 200만 건", "보정", { cls: "k-done" }),
    ],
  },
  {
    id: "test", word: "테스트 먼저", tone: "pre", axis: "migrate", card: "boot", x: 61, y: 33, cap: "b",
    path: "M500 340 C 500 280, 520 220, 536 170",
    caption: "테스트 <b>0개</b>에서 <b>300개+</b>로",
    desc: "Spring Boot 3 전환 전에 회귀 테스트부터 보강했습니다.",
    shell: { cmd: "cat boot.compare", out: "테스트 0개 → 300개+ · Spring Boot 2.3.8 → 3.3.3 전환 전" },
    strip: [
      step("Spring Boot", "2.3.8 → 3.3.3 전환"), step("테스트 0개", "", { cls: "k-fail" }), step("회귀 테스트부터", "보강"),
      step("300개+", "", { cls: "k-done" }),
    ],
  },
  {
    id: "split", word: "분리", tone: "pre", axis: "search", card: "search", x: 86, y: 17.5, cap: "b",
    path: "M500 340 C 640 340, 740 200, 786 91",
    caption: "느린 조회 경로를 격리",
    desc: "조회 경로마다 500ms 타임아웃을 두어 늦은 경로만 빼고 응답합니다.",
    shell: { cmd: "cat search.flow", out: "조회 경로 병렬 실행 · 경로별 500ms 타임아웃" },
    list: true,
    strip: [
      step("조회 경로", "병렬 실행"), step("경로별 500ms", "타임아웃"),
      step("늦은 경로만", "제외하고 응답"),
    ],
  },
];

/* ---- 미니 도식 ----
 * 카드 위쪽 그림. 360×(H) 좌표, 노드는 ['x','y','w','h'] + 줄바꿈('|')이 든 label.
 * 열은 세 개(0·128·256, 너비 104)다. 라벨은 카드 문구·FLOWS에 이미 있는 말만 쓴다. */
const COL = [0, 128, 256];
const nd = (col, y, label, kind = "step", extra = {}) => ({ x: COL[col], y, w: 104, h: 42, label, kind, ...extra });

const MINIS = {
  jpa: {
    title: "Mock 테스트는 통과했지만 데이터가 잘못 저장됨. 실제 영속성 컨텍스트로 재현해 변경 감지 누락을 확인하고, 영향받은 데이터를 찾아 보정 스크립트로 약 200만 건을 바로잡음.",
    h: 132,
    nodes: {
      mock: nd(0, 8, "Mock 테스트|통과"), bad: nd(1, 8, "데이터가|잘못 저장됨", "fail"), repro: nd(2, 8, "실제 영속성|컨텍스트 재현"),
      cause: nd(2, 82, "원인 확인|변경 감지 누락", "gate"), fix: nd(1, 82, "영향 데이터 찾아|보정 스크립트"), done: nd(0, 82, "약 200만 건|보정", "done"),
    },
    edges: [["mock", "bad", "r", "l"], ["bad", "repro", "r", "l"], ["repro", "cause", "b", "t"], ["cause", "fix", "l", "r"], ["fix", "done", "l", "r"]],
  },
  boot: {
    title: "Spring Boot 2.3.8에서 3.3.3으로 전환하기 전에 회귀 테스트를 먼저 보강. 테스트 수는 0개에서 300개+.",
    h: 148,
    nodes: { from: nd(0, 8, "Spring Boot|2.3.8"), mid: nd(1, 8, "회귀 테스트|먼저 보강", "gate"), to: nd(2, 8, "Spring Boot|3.3.3", "done") },
    edges: [["from", "mid", "r", "l"], ["mid", "to", "r", "l"]],
    bars: [
      { text: "회귀 테스트 수", y: 82, lane: true },
      { text: "전환 전", y: 106, value: "0개", width: 3, x: 62 },
      { text: "전환 중", y: 132, value: "300+", width: 240, x: 62, strong: true },
    ],
  },
  event: {
    title: "이벤트를 CREATED로 저장하고 Kafka로 발행. 수신하면 IN_PROGRESS, 업무를 실행해 COMPLETED. 발행 실패는 SEND_FAILED로 분류하고, 예외는 재시도 대상 FAILED로 기록하고, 복구 워커가 그 업무만 다시 실행.",
    h: 192,
    nodes: {
      save: nd(0, 8, "이벤트 저장|CREATED"), pub: nd(1, 8, "Kafka|발행", "gate"), rx: nd(2, 8, "수신|IN_PROGRESS", "gate"),
      sf: nd(0, 76, "SEND_FAILED|발행 실패", "fail"), ok: nd(1, 76, "COMPLETED", "done"), work: nd(2, 76, "업무 실행", "gate"),
      rec: nd(1, 142, "복구 워커|그 업무만 재실행"), fail: nd(2, 142, "FAILED|재시도 대상", "fail"),
    },
    edges: [
      ["save", "pub", "r", "l"], ["pub", "rx", "r", "l"], ["rx", "work", "b", "t"], ["work", "ok", "l", "r"], ["pub", "sf", "b", "t"],
      ["work", "fail", "b", "t"], ["fail", "rec", "l", "r"], ["rec", "ok", "t", "b", { cls: "dash" }],
    ],
  },
  batch: {
    title: "소멸 배치는 커서로 한 구간씩 읽어 청크 단위로 처리하고 끝나면 일별 통계 이벤트를 발행. 아카이브 배치는 청크마다 테이블을 정해진 순서로 옮기고, 중단되면 시작 ID를 지정해 남은 범위부터 다시 실행.",
    h: 158,
    lanes: [["소멸 배치 · 커서 기반", 12], ["아카이브 배치", 98]],
    nodes: {
      scan: nd(0, 24, "한 구간씩|조회", "gate"), exp: nd(1, 24, "청크 단위|소멸 처리"), stat: nd(2, 24, "끝 → 일별|통계 이벤트", "done"),
      mv: nd(0, 110, "아카이브 테이블|정해진 순서"), stop: nd(1, 110, "중단", "fail"), rerun: nd(2, 110, "시작 ID 지정|재실행"),
    },
    edges: [["scan", "exp", "r", "l"], ["exp", "stat", "r", "l"], ["mv", "stop", "r", "l"], ["stop", "rerun", "r", "l"]],
  },
  search: {
    title: "스냅샷에 페이지가 있으면 바로 응답. 비어 있으면 검색 소스를 병렬 조회하고, 실패한 소스만 건너뜀. FPR에서 병합·중복 제거·점수화, SPR과 Re-Rank를 거쳐 스냅샷에 추가하고 한 페이지를 응답.",
    h: 192,
    nodes: {
      snap: nd(0, 8, "스냅샷에서|한 페이지", "gate"), src: nd(1, 8, "비면 검색 소스|병렬 조회", "gate"), fpr: nd(2, 8, "FPR 병합|중복 제거·점수화"),
      hit: nd(0, 76, "있으면 응답|본 공고 기록", "done"), drop: nd(1, 76, "실패한 소스만|건너뜀", "fail"), rr: nd(2, 76, "SPR → Re-Rank|회사별 다양화"),
      save: nd(2, 142, "스냅샷 추가|한 페이지 응답", "done"),
    },
    edges: [["snap", "src", "r", "l"], ["src", "fpr", "r", "l"], ["snap", "hit", "b", "t"], ["src", "drop", "b", "t"], ["fpr", "rr", "b", "t"], ["rr", "save", "b", "t"]],
  },
  test: {
    title: "테스트 공통 모듈에서 Base, Mock, WebMvc, JPA 진입점으로 나눠 필요한 설정만 불러옴. 느린 테스트 범위와 컨텍스트 재사용을 조정해 추가 자원 없이 CI 메모리 부족을 해소.",
    h: 192,
    nodes: {
      mod: { x: 0, y: 8, w: 360, h: 40, label: "테스트 공통 모듈|Fixture · Mock · WebMvc · JPA 설정", kind: "gate" },
      b: { x: 0, y: 74, w: 78, h: 34, label: "Base", kind: "step" }, m: { x: 94, y: 74, w: 78, h: 34, label: "Mock", kind: "step" },
      w: { x: 188, y: 74, w: 78, h: 34, label: "WebMvc", kind: "step" }, j: { x: 282, y: 74, w: 78, h: 34, label: "JPA", kind: "step" },
      ci: { x: 0, y: 138, w: 164, h: 42, label: "느린 테스트·컨텍스트|재사용 조정", kind: "step" },
      ok: { x: 196, y: 138, w: 164, h: 42, label: "추가 자원 없이|CI 메모리 부족 해소", kind: "done" },
    },
    edges: [["mod", "b", "b", "t"], ["mod", "m", "b", "t"], ["mod", "w", "b", "t"], ["mod", "j", "b", "t"], ["ci", "ok", "r", "l"]],
  },
  // 관계를 말하지 않는 카드는 화살표 없이 만든 것을 나열만 한다.
  gateway: {
    title: "Spring Cloud Gateway에 Spring Security·JWT 인증·인가를 적용하고, SonarQube·Jenkins 연동 API와 OpenSearch 동적 쿼리를 만듦.",
    h: 204,
    lanes: [["오케스트로에서 만든 것", 62]],
    nodes: {
      gw: { x: 0, y: 76, w: 104, h: 44, label: "Gateway|인증·인가", kind: "step" },
      sq: { x: 128, y: 76, w: 104, h: 44, label: "SonarQube|Jenkins 연동", kind: "step", mono: [0] },
      os: { x: 256, y: 76, w: 104, h: 44, label: "OpenSearch|동적 쿼리", kind: "step", mono: [0] },
    },
    edges: [],
    plain: true,
  },
};

/** 오픈소스 카드의 미니 도식은 링크가 달린 세 줄이다. */
const OSS_ROWS = [
  { name: "Spring Kafka", state: "#2875 병합", kind: "done", href: "https://github.com/spring-projects/spring-kafka/pull/2875" },
  { name: "Spring Boot", state: "#38029 제안 반영", kind: "step", href: "https://github.com/spring-projects/spring-boot/pull/38029" },
  { name: "Spring Data JPA", state: "#3408 제안 반영", kind: "step", href: "https://github.com/spring-projects/spring-data-jpa/pull/3408" },
];

/* ---- 카드 상세 (문제·한 일·결과·기술, 흐름 설명, 링크) ----
 * 아래 문구는 이전 홈(index.html)의 프로젝트 설명을 그대로 옮긴 것이다. */
const DETAILS = {
  "jpa": {
    "rows": [
      [
        "문제",
        "Mock 테스트에서는 드러나지 않던 JPA 변경 감지 오류로 데이터가 잘못 저장되고 있었습니다."
      ],
      [
        "한 일",
        "<ul><li>실제 영속성 컨텍스트에서 오류를 재현해 원인을 확인했습니다.</li><li>영향받은 데이터를 찾아 보정 스크립트로 바로잡았습니다.</li></ul>"
      ],
      [
        "결과",
        "약 200만 건 보정"
      ],
      [
        "기술",
        "JPA"
      ]
    ],
    "flow": "jpa",
    "steps": [
      "Mock 테스트는 통과했지만 데이터가 잘못 저장되고 있었습니다.",
      "실제 영속성 컨텍스트로 재현해 변경 감지 누락을 원인으로 확인했습니다.",
      "영향받은 데이터를 찾아 보정 스크립트로 약 200만 건을 바로잡았습니다."
    ],
    "diagram": false,
    "links": "<a class=\"lnk\" href=\"./portfolio/#jpa\">재현·보정 과정 보기</a><a class=\"lnk\" href=\"https://velog.io/@ch4570/여러분이-열심히-짠-테스트는-안녕하십니까\" target=\"_blank\" rel=\"noreferrer\">관련 글 읽기</a>"
  },
  "boot": {
    "rows": [
      [
        "한 일",
        "<ul><li>Spring Boot 2.3.8 → 3.3.3 전환 전에 기존 동작을 검증할 회귀 테스트부터 보강했습니다.</li></ul>"
      ],
      [
        "결과",
        "테스트 0개 → 300개+"
      ],
      [
        "기술",
        "Spring Boot 2.3.8 → 3.3.3"
      ]
    ],
    "diagram": false
  },
  "event": {
    "rows": [
      [
        "문제",
        "발행 전에 멈춘 이벤트와 발행 뒤 개별 업무에서 실패한 이벤트는 확인할 데이터와 다시 실행할 범위가 달랐습니다."
      ],
      [
        "한 일",
        "<ul><li>Kafka 이벤트의 발행·처리 단계를 상태로 기록해 어느 지점에서 멈췄는지 추적할 수 있게 했습니다.</li><li>PostgreSQL JSONB에 저장한 payload로 업무별 복구 경로를 구현해, 실패한 업무만 다시 실행했습니다.</li><li>15분 넘게 멈춘 이벤트는 유형별로 묶어 Slack으로 알림을 보냈습니다.</li></ul>"
      ],
      [
        "결과",
        "상태 6개 · 15분 넘게 멈추면 Slack 알림"
      ],
      [
        "기술",
        "Kafka, PostgreSQL JSONB, Slack"
      ]
    ],
    "flow": "event",
    "steps": [
      "업무가 끝나면 이벤트를 CREATED로 저장하고 payload를 JSONB로 남깁니다.",
      "Kafka로 발행합니다. 발행 실패는 SEND_FAILED로 따로 분류합니다.",
      "consumer는 CREATED 이벤트만 IN_PROGRESS로 바꿔 실행하고, 이미 처리된 이벤트는 건너뜁니다.",
      "성공하면 COMPLETED, 예외는 재시도 대상 FAILED, 업무 규칙 위반은 재시도하지 않는 실패로 기록합니다.",
      "복구 워커가 유형·상태로 대상을 찾아 저장한 payload로 그 업무만 다시 실행합니다.",
      "IN_PROGRESS로 15분 넘게 멈춘 이벤트는 유형별로 묶어 Slack으로 알립니다."
    ],
    "diagram": false,
    "links": "<a class=\"lnk\" href=\"./portfolio/#event\">구현 과정 읽기</a>"
  },
  "batch": {
    "rows": [
      [
        "문제",
        "포인트 소멸·아카이브 배치가 중간에 멈춰도 처음부터 다시 돌리지 않고, 동시 요청 뒤에도 잔액이 맞는지 확인해야 했습니다."
      ],
      [
        "한 일",
        "<ul><li>소멸 대상을 한 번에 읽지 않고 페이지 단위로 처리했습니다.</li><li>아카이브 테이블을 청크마다 정해진 순서로 옮기고, 중단되면 시작 ID를 지정해 남은 범위부터 다시 실행할 수 있게 했습니다.</li><li>같은 락 키나 예산을 공유하는 요청을 동시에 실행한 뒤 잔액·원장·후속 이벤트를 대조했습니다.</li></ul>"
      ],
      [
        "결과",
        "중단돼도 시작 ID부터 이어 실행 · 동시 요청 뒤 잔액·원장 대조"
      ]
    ],
    "flow": "batch",
    "steps": [
      "커서 다음의 소멸 후보를 한 구간씩 읽고, 대상 회원을 청크 단위로 소멸 처리합니다.",
      "더 읽을 후보가 없으면 일별 소멸 통계 이벤트를 발행합니다.",
      "아카이브는 청크마다 테이블을 정해진 순서로 옮깁니다.",
      "중단되면 시작 ID를 지정해 남은 범위부터 다시 실행합니다."
    ],
    "diagram": false,
    "links": "<a class=\"lnk\" href=\"./portfolio/#point\">구현 과정 읽기</a>"
  },
  "search": {
    "rows": [
      [
        "문제",
        "개인화 피드에서 검색 소스별 정책과 실패 처리를 맡고, OpenSearch 후보 조회부터 캐시 저장까지 처리 단계를 나눴습니다."
      ],
      [
        "한 일",
        "<ul><li>9개 조회 경로에 필터·정렬·벡터 규칙과 경로별 500ms 타임아웃을 적용하고, 늦은 경로만 제외하고 응답합니다.</li><li>후보를 1차 500건, 2차 100건으로 좁혀 재정렬하고 20건을 응답하는 3단계 랭킹을 구현했습니다.</li><li>단계별 캐시로 다음 페이지 재계산을 줄이고 페이지 간 중복 노출을 막았습니다.</li></ul>"
      ],
      [
        "결과",
        "조회 경로 9개"
      ],
      [
        "기술",
        "OpenSearch, Redis"
      ]
    ],
    "flow": "search",
    "steps": [
      "캐시를 쓰는 요청은 스냅샷에서 다음 페이지를 꺼내 응답합니다.",
      "스냅샷이 비면 검색 소스를 병렬로 조회하고, 실패한 소스만 건너뜁니다.",
      "FPR에서 병합·차단·중복 제거·점수화를 하고, SPR과 Re-Rank를 거쳐 스냅샷에 붙인 뒤 응답합니다.",
      "세션이 없으면 캐시 없이 첫 페이지부터 계산해 응답합니다."
    ],
    "diagram": true,
    "links": "<a class=\"lnk\" href=\"./portfolio/#feed\">구현 과정 읽기</a>"
  },
  "test": {
    "rows": [
      [
        "한 일",
        "<ul><li>Fixture 생성, Mock 초기화, WebMvc·JPA·트랜잭션 설정을 공통 모듈로 모아 반복 준비 코드를 줄였습니다.</li><li>Base·Mock·WebMvc·JPA 진입점으로 나눠 테스트가 필요한 설정만 불러오도록 했습니다.</li><li>느린 테스트 범위와 Spring 컨텍스트 재사용 방식을 조정해, 추가 자원 없이 CI 메모리 부족을 해소했습니다.</li></ul>"
      ],
      [
        "초점",
        "테스트 표준화 · CI 안정화"
      ]
    ],
    "diagram": false
  },
  "gateway": {
    "rows": [
      [
        "한 일",
        "<ul><li>SonarQube·Jenkins 연동 API를 개발했습니다.</li><li>조건에 따라 OpenSearch 동적 쿼리를 생성하도록 했습니다.</li></ul>"
      ],
      [
        "기술",
        "Spring Cloud Gateway, Spring Security, JWT, OpenSearch"
      ]
    ],
    "diagram": false
  }
};

const num = (n, xl = false) => `<span class="num${xl ? " num--xl" : ""}">${n}</span>`;

/** 프로젝트 카드 8개. 순서는 JPA·Boot 전환이 먼저다. */
export const CARDS = [
  { id: "jpa", kw: "cause", axes: ["integrity"], title: "JPA 변경 감지 오류 재현과 데이터 보정", org: "토스랩", period: "2024.06–2025.04", status: "done",
    result: `약 ${num("200만", true)} 건 보정`, mini: MINIS.jpa, detail: DETAILS.jpa },
  { id: "boot", kw: "test", axes: ["migrate"], title: "Drive-Service Spring Boot 3 전환", org: "토스랩", period: "2024.06–2025.04", status: "done",
    result: `테스트 0개 → ${num("300", true)}개+`, mini: MINIS.boot, detail: DETAILS.boot },
  { id: "event", kw: "record", axes: ["event"], title: "Kafka 이벤트 실패 복구", org: "웍스피어", period: "2025.06–", status: "run",
    result: `상태 ${num(6)}개 · 15분 넘게 멈추면 Slack 알림`, mini: MINIS.event, detail: DETAILS.event },
  { id: "batch", kw: "resume", axes: ["batch", "integrity"], title: "배치 재시작과 포인트 정합성 검증", org: "웍스피어", period: "2025.06–", status: "run",
    result: "중단돼도 시작 ID부터 이어 실행 · 동시 요청 뒤 잔액·원장 대조", mini: MINIS.batch, detail: DETAILS.batch },
  { id: "search", kw: "split", axes: ["search"], title: "개인화 피드 검색 소스 실패 격리", org: "웍스피어", period: "2025.06–", status: "run",
    result: `조회 경로 ${num(9, true)}개`, mini: MINIS.search, detail: DETAILS.search },
  { id: "test", axes: ["migrate"], title: "테스트 공통 모듈과 CI 메모리 부족 해소", org: "웍스피어", period: "사내 개선", status: "run",
    result: "테스트 준비 코드를 공통 모듈로 모았고 테스트 범위와 컨텍스트 재사용을 조정해 CI 메모리 부족을 해소했습니다", mini: MINIS.test, detail: DETAILS.test },
  { id: "gateway", axes: ["search"], title: "Gateway 인증·인가와 검색 API", org: "오케스트로", period: "2023.09–2024.05", status: "done",
    result: "SonarQube·Jenkins 연동 API를 개발하고 OpenSearch 동적 쿼리를 생성하도록 했습니다",
    tech: "Spring Cloud Gateway · Spring Security · JWT · OpenSearch", mini: MINIS.gateway, detail: DETAILS.gateway },
  { id: "oss", axes: ["oss"], title: "오픈소스 기여", summary: "Spring Kafka PR은 병합됐고 Spring Boot와 Spring Data JPA에는 제안이 반영됐습니다.",
    miniOss: { title: "Spring Kafka PR은 병합됐고 Spring Boot와 Spring Data JPA에는 제안이 반영됨.", rows: OSS_ROWS } },
];

export const STATUS_LABEL = { done: "완료", run: "진행 중" };
