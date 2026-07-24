# Signal Grid Design System

서민재의 이력서, 경력기술서, 엔지니어링 포트폴리오를 위한 화면 규칙입니다. `npx getdesign@latest add nvidia`로 받은 프리셋에서 각진 그리드, 선명한 녹색, 얇은 구분선 원칙을 참고했습니다. NVIDIA의 로고, 상표 표현, 전용 서체는 사용하지 않습니다.

`career/`는 이 문서 아래의 **Career Page — Slack-derived Editorial Contract**를 별도 표면 계약으로 사용합니다. `.career-page` 안에서는 해당 계약의 aubergine, 90px pill, 16px card, pastel hero gradient가 기존 Signal Grid의 라임·2px radius·무그라디언트 규칙보다 우선하며, 이 예외는 이력서와 포트폴리오에 전파하지 않습니다.

## Design Direction

- 밝은 배경 위에서 긴 기술 문서를 빠르게 훑을 수 있어야 합니다.
- 큰 검정 면보다 검정 헤더와 규칙선으로 구조를 잡습니다.
- 라임은 버튼, 현재 위치, 핵심 숫자처럼 시선이 먼저 가야 하는 곳에만 씁니다.
- 도식의 보조 색은 장식이 아니라 역할을 구분합니다.
- 카드의 깊이는 둥근 모서리와 큰 그림자보다 선, 면, 간격으로 표현합니다.

## Color Tokens

| Token | Value | Usage |
| --- | --- | --- |
| `--canvas` | `#f5f6f3` | 페이지 바탕 |
| `--canvas-overlay` | `rgba(245, 246, 243, 0.97)` | 고정 내비게이션 아래의 캔버스 면 |
| `--surface` | `#ffffff` | 문서와 카드 |
| `--surface-soft` | `#f0f2ef` | 섹션 구분, 사이드바 |
| `--surface-raised` | `#fafbf9` | 포트폴리오 히어로 면 |
| `--surface-document` | `#f8f9f7` | 이력서 문서 헤더 면 |
| `--surface-control` | `#f4f4f4` | 인쇄용 보조 패널과 관리자 컨트롤 면 |
| `--surface-placeholder` | `#e9edf0` | 이미지 로딩·대체 면 |
| `--ink` | `#11150f` | 제목, 헤더, 주요 선 |
| `--ink-soft` | `#30382d` | 본문 |
| `--muted` | `#667064` | 보조 설명, 날짜 |
| `--inverse-ink` | `#ffffff` | 검정 면 위의 글자 |
| `--line` | `#d9dfd5` | 기본 구분선 |
| `--line-strong` | `#aeb9aa` | 강조 구분선 |
| `--selection` | `#d7eeae` | 텍스트 선택 배경 |
| `--lime` | `#76b900` | CTA, 활성 상태, 주요 노드 |
| `--lime-hover` | `#66a400` | 라임 인터랙션 상태 |
| `--lime-soft` | `#edf7dc` | 성과와 결과 배경 |
| `--green-ink` | `#416f00` | 작은 링크와 라임 계열 글자 |
| `--teal` | `#007b83` | 외부 시스템, 비동기 경로 |
| `--teal-soft` | `#e4f5f3` | 도식의 비동기 면 |
| `--teal-faint` | `#f2f9f8` | 이력서 프로젝트 강조 면 |
| `--coral` | `#b95016` | 장애, 복구 경로 |
| `--coral-hover` | `#bc4d39` | 장애 버튼 인터랙션 상태 |
| `--coral-soft` | `#fff0e6` | 장애·복구 보조 면 |
| `--blue` | `#3c6e9e` | 완료 결과 |
| `--blue-soft` | `#eaf2f8` | 완료 결과 보조 면 |
| `--yellow` | `#c89500` | 보조 지표 |
| `--yellow-soft` | `#fff6d8` | 보조 지표 면 |
| `--focus` | `#006c78` | 키보드 포커스 링 |
| `--header-surface` | `rgba(17, 21, 15, 0.97)` | 고정 헤더 면 |
| `--header-line` | `#2d342a` | 헤더 하단선 |
| `--header-muted` | `#bdc5ba` | 헤더 비활성 링크 |
| `--header-control-line` | `#697265` | 헤더 컨트롤 테두리 |
| `--shadow` | `0 12px 32px rgba(20, 32, 16, 0.07)` | 호버 피드백 |

라임 바탕에는 `--ink`를 사용합니다. 본문 링크나 작은 글자에는 라임 원색 대신 `--green-ink`를 사용합니다.

## Typography

- 기본 서체: `Pretendard`, `Apple SD Gothic Neo`, `Noto Sans KR`, system sans-serif
- 화면 제목: 700-800 weight, 줄 간격 1.08-1.22
- 본문: 400-600 weight, 줄 간격 1.6-1.7
- 영문 레이블: 10-12px, 700 weight, uppercase
- 자간은 항상 `0`
- 검색되어야 하는 기술명과 복합 표현은 소스와 PDF에 리터럴 문자열로 남기고, 줄바꿈 제어가 필요하면 의미가 있는 `nowrap` 요소를 사용합니다. 보이지 않는 word joiner 문자는 사용하지 않습니다.

### Screen Typography Tokens

| Token | Value | Usage |
| --- | --- | --- |
| `--type-micro` | `9px` | 최소 상태 레이블 |
| `--type-label-xs` | `10px` | 지표·스토리 레이블 |
| `--type-caption` | `11px` | 캡션과 보조 정보 |
| `--type-label` | `12px` | 키커와 메타데이터 |
| `--type-ui` | `13px` | 내비게이션과 컨트롤 |
| `--type-body-sm` | `14px` | 조밀한 본문 |
| `--type-body-md` | `15px` | 보조 본문 |
| `--type-body` | `16px` | 기본 본문 |
| `--type-body-lg` | `17px` | 강조 본문 |
| `--type-heading-xs` | `18px` | 작은 제목 |
| `--type-heading-sm` | `19px` | 카드·스토리 제목 |
| `--type-heading-md` | `20px` | 중간 제목 |
| `--type-heading-lg` | `21px` | 경력 프로젝트 제목 |
| `--type-heading-xl` | `22px` | 문서 소제목 |
| `--type-title-xs` | `25px` | 반응형 문서 제목 |
| `--type-title-sm` | `28px` | 모바일 사례 제목 |
| `--type-title-md` | `30px` | 경력 회사 제목 |
| `--type-title-lg` | `32px` | 태블릿 섹션 제목 |
| `--type-display-xs` | `40px` | 사례 제목 |
| `--type-display-sm` | `42px` | 화면 섹션 제목 |
| `--type-display-md` | `43px` | 반응형 이력서 이름 |
| `--type-display-lg` | `50px` | 중간 화면 대표 제목 |
| `--type-display-xl` | `52px` | 태블릿 홈 이름 |
| `--type-display-2xl` | `54px` | 이력서 이름 |
| `--type-display-3xl` | `62px` | 포트폴리오 대표 제목 |
| `--type-display-4xl` | `64px` | 대표 화면 제목 |
| `--type-display-5xl` | `82px` | 데스크톱 홈 이름 |

화면의 모든 `font-size` 선언은 이 최상위 `:root` 토큰을 사용합니다. 화면 크기는 기존 렌더링 값을 그대로 보존합니다.

### Print Typography Tokens

| Token | Value | Usage |
| --- | --- | --- |
| `--print-type-micro` | `7pt` | 인쇄 최소 메타데이터 |
| `--print-type-fine` | `7.8pt` | 조밀한 인쇄 보조 정보 |
| `--print-type-label` | `8pt` | 인쇄 레이블 |
| `--print-type-caption` | `8.4pt` | 작은 캡션 |
| `--print-type-caption-lg` | `8.5pt` | 큰 캡션과 주석 |
| `--print-type-body-sm` | `9pt` | 조밀한 인쇄 본문 |
| `--print-type-body-md` | `9.2pt` | 프로젝트 인쇄 본문 |
| `--print-type-body` | `9.5pt` | 기본 인쇄 본문 |
| `--print-type-body-lg` | `10pt` | 강조 인쇄 본문 |
| `--print-type-heading-xs` | `10.5pt` | 최소 인쇄 제목 |
| `--print-type-heading-sm` | `11pt` | 작은 인쇄 제목 |
| `--print-type-heading-md` | `11.5pt` | 중간 인쇄 제목 |
| `--print-type-heading-lg` | `12pt` | 큰 인쇄 제목 |
| `--print-type-display-xs` | `18pt` | 인쇄 섹션 제목 |
| `--print-type-display-sm` | `19pt` | 인쇄 사례 제목 |
| `--print-type-display-md` | `22pt` | 큰 인쇄 사례 제목 |
| `--print-type-display-lg` | `27pt` | 경력기술서 대표 제목 |
| `--print-type-display-xl` | `28pt` | 포트폴리오 대표 제목 |
| `--print-type-display-2xl` | `31pt` | 이력서 대표 제목 |

인쇄의 모든 `font-size` 선언은 `@media print` 안의 `:root` 토큰을 사용합니다. 6.8→7pt, 7.5·7.6→7.8pt, 8.2·8.3→8.4pt, 8.7·8.8→8.5pt, 9.4→9.5pt, 12.2→12pt만 기존 광학적 근사값으로 통합하고 나머지 크기는 보존합니다.

## Shape And Spacing

- Radius: `2px`
- 기본 간격 단위: `4px`
- 카드 안쪽 여백: 24-32px
- 화면 섹션 간격: 64-88px
- 그림자는 호버 피드백에만 작게 사용합니다.
- 그라디언트와 장식용 광원 효과는 사용하지 않습니다.

### Spacing Tokens

| Token | Value | Usage |
| --- | --- | --- |
| `--space-1` | `4px` | 최소 인라인 간격 |
| `--space-2` | `8px` | 아이콘·텍스트 간격 |
| `--space-3` | `12px` | 조밀한 컨트롤 여백 |
| `--space-4` | `16px` | 지표 셀 기본 여백 |
| `--space-5` | `20px` | 작은 카드 여백 |
| `--space-6` | `24px` | 내비게이션·스토리 기본 간격 |
| `--space-7` | `28px` | 넓은 본문 열 간격 |
| `--space-8` | `32px` | 문서 내부 구획 |
| `--space-10` | `40px` | 반응형 구획 |
| `--space-12` | `48px` | 화면 구간 |
| `--space-16` | `64px` | 사례 헤더 열과 큰 구간 |
| `--space-20` | `80px` | 데스크톱 히어로 간격 |
| `--space-22` | `88px` | 화면 섹션 간격 |
| `--career-date-rail` | `168px` | 경력기술서의 회사 기간 열. 인쇄에서는 `108px`로 축소 |

새로 바꾸는 레이아웃 간격은 이 4px 스케일을 사용합니다. 1-3px 규칙선과 기존 레이블의 5px·7px 베이스라인 보정은 광학적 예외로 유지하며 새 컴포넌트에 확장하지 않습니다.

## Components

### Header

검정 바탕과 라임 브랜드 마크를 씁니다. 브랜드 마크는 홈으로 연결하고, 현재 문서는 라임 하단선으로 표시합니다. 모바일에서도 이력서·경력기술서·포트폴리오 링크를 유지합니다.

### Browser Icon

브라우저 아이콘은 Ink 바탕과 Lime 정사각형을 겹친 인라인 SVG로 모든 공개 문서와 관리자 화면에서 공유합니다. 별도 네트워크 요청 없이 로드하며 둥근 모서리나 그림자를 추가하지 않습니다.

### Buttons

주요 버튼은 라임 바탕과 검정 글자, 보조 버튼은 흰 바탕과 진한 테두리를 씁니다. 높이는 최소 40px, radius는 2px입니다.

### Metrics

네 개 지표는 흰 면과 검정 hairline으로 묶고 라임 상단선으로만 강조합니다. 홈의 작은 화면에서는 2x2 배열을 유지합니다.

### Document Cards

문서 카드는 1px 테두리와 5px 상단 규칙선을 씁니다. 큰 그림자나 둥근 외곽선 없이 제목과 이동 행동이 한눈에 이어져야 합니다.

### Case Density

대표 사례는 헤더, 핵심 지표, 도식 한 장을 기본 골격으로 삼습니다. 구현 항목을 나열한 상세 카드와 다른 문서에 이미 있는 과거 경력은 포트폴리오에서 반복하지 않습니다. 같은 결론을 문장·카드·도식으로 중복 설명하지 않습니다.

### Career Timeline

경력기술서는 최신 경력부터 한 방향으로 읽히는 세로 타임라인을 사용합니다. 상단 요약과 회사별 상세 모두 `기간 → 회사·역할 → 문제와 결과` 순서로 스캔되며, 데스크톱과 인쇄에서는 기간을 왼쪽 날짜 레일에 고정합니다. 같은 회사의 후속 업무는 새 회사 블록처럼 반복하지 않고 하위 구획으로 이어 붙입니다. 모바일에서는 날짜를 회사명 위에 쌓고, 이전 경력도 2열로 압축하지 않습니다.

### Architecture Diagrams

- 사례마다 도식은 최대 한 장만 둡니다.
- 주 경로와 책임 경계만 남기고 노드는 8-12개 안으로 제한합니다.
- 피드 서빙 도식은 Archify `v2.11.0`의 Architecture IR로 관리합니다.
- 원본 IR은 `design/archify/`, 배포용 light SVG는 `assets/diagrams/`에 둡니다.
- Archify HTML·스크립트·iframe은 서비스에 싣지 않고 빌드 시 생성한 정적 SVG만 사용합니다.
- 화면 캡션은 HTML에 두고 SVG에는 구조와 연결선만 남깁니다.

## Responsive And Print

- Desktop: 콘텐츠 최대 폭 1180px
- Tablet: 900px 이하에서 문서와 도식을 한 열로 전환
- Mobile: 420px 이하에서도 홈 지표는 2x2, 나머지 긴 지표는 한 열. 폭이 긴 도식은 단일 disclosure로 접고, 열었을 때만 가로로 탐색합니다.
- Print: A4, 라임 강조와 역할별 옅은 면색을 보존하고 화면용 반응형 규칙과 분리. 로컬 SVG는 PDF HTML에 data URI로 포함해 스타일과 경로가 빠지지 않게 합니다.

## Accessibility

- 모든 인터랙션은 `:focus-visible` 표시를 제공합니다.
- 색만으로 현재 위치를 알리지 않고 선, 텍스트, 배경을 함께 사용합니다.
- `prefers-reduced-motion`에서 전환 시간을 제거합니다.
- 본문과 배경은 WCAG AA 수준의 대비를 유지합니다.

---

## Career Page — Slack-derived Editorial Contract

### Source And Provenance

- Public source: `https://getdesign.md/slack/design-md`
- Verification: the public preview was inspected in Google Chrome 150 on 2026-07-24 at CSS widths 375 / 768 / 1280px with device scale factor 1.
- Runtime truth takes precedence over older read-only notes that rejected aubergine, pill controls, or gradients. The career adaptation uses the measured composition and tokens, not Slack logos, copy, screenshots, assets, or proprietary fonts.
- Korean typography remains `Pretendard`, `Apple SD Gothic Neo`, `Noto Sans KR`, system sans-serif. The runtime font measurement informs hierarchy only.

### Career Direction And Information Order

The career page is a warm, one-column hiring document: a light navigation row, one pastel identity/evidence band, one compact chronology card, and a sequence of outcome cards. Aubergine is scarce and meaningful: the download action, active navigation, timeline numerals, and one featured outcome surface. The reading order remains identity → evidence summary → reverse chronology → current employer → outcome evidence → prior employers.

The page must let a recruiter identify the candidate, role, approximately three years of experience, employer, dates, and strongest facts within ten seconds. An engineering reviewer must then be able to scan literal technology names and validation scope without decorative content interrupting the document.

### Career-only Token Mapping

All new visual declarations are scoped below `.career-page`. Raw career values are declared once as custom properties; career selectors consume those properties or the shared spacing/type scale.

#### Color And Surface Tokens

| Token | Value | Career usage |
| --- | --- | --- |
| `--career-primary` | `#4a154b` | PDF CTA, sparse accents, single featured outcome |
| `--career-primary-hover` | `#611f69` | CTA and active-pill hover |
| `--career-primary-active` | `#481a54` | pressed state |
| `--career-ink` | `#1d1d1d` | headings and body on light surfaces |
| `--career-muted` | `#696969` | dates, subtitles, supporting copy |
| `--career-canvas` | `#ffffff` | document and ordinary outcome cards |
| `--career-cream` | `#f4ede4` | outer canvas and alternate surface |
| `--career-lavender` | `#f9f0ff` | active navigation and quiet tint |
| `--career-peach` | `#fff0e6` | first hero-gradient stop |
| `--career-lavender-mid` | `#e9d8ff` | fourth hero-gradient stop |
| `--career-sage` | `#d8e6e0` | final hero-gradient stop |
| `--career-hairline` | `#e6e6e6` | ordinary cards and dividers |
| `--career-on-primary` | `#ffffff` | text on aubergine |
| `--career-on-primary-muted` | `#d9bdde` | supporting copy on aubergine |
| `--career-link` | `#1264a3` | focus ring and link affordance |
| `--career-hero-gradient` | `linear-gradient(120deg, #fff0e6 0%, #f4ede4 25%, #f9f0ff 50%, #e9d8ff 75%, #d8e6e0 100%)` | identity/evidence band only |
| `--career-overview-gradient` | `linear-gradient(135deg, #f4ede4 0%, #f9f0ff 100%)` | chronology summary card |

#### Geometry, Rhythm, And Type Tokens

| Token | Value | Career usage |
| --- | --- | --- |
| `--career-content` | `1184px` | centered readable shell at 1280px with 48px insets |
| `--career-measure` | `720px` | hero and supporting-copy measure |
| `--career-inset` | `20px` | default/mobile horizontal inset |
| `--career-shell-inset` | `max(var(--career-inset), calc((100% - var(--career-content)) / 2))` | full-bleed band alignment |
| `--career-section-space` | `48px` | default/mobile section rhythm |
| `--career-hero-block` | `48px` | default/mobile hero vertical padding |
| `--career-hero-title` | `32px` | default/mobile identity title |
| `--career-section-title` | `28px` | default/mobile section heading |
| `--career-company-title` | `28px` | employer heading |
| `--career-project-title` | `19px` | outcome heading |
| `--career-card-gap` | `16px` | default/mobile card gap |
| `--career-card-padding` | `24px` | default/mobile outcome-card inset |
| `--career-contact-gap` | `8px` | contact-cell gap |
| `--career-action-height` | `48px` | download pill |
| `--career-touch-min` | `44px` | mobile contact and navigation targets |
| `--career-action-inline` | `28px` | pill horizontal padding |
| `--career-card-radius` | `16px` | cards and summary surface |
| `--career-pill-radius` | `90px` | active navigation and download action |
| `--career-hairline-width` | `1px` | card/divider rule |
| `--career-focus-width` | `3px` | keyboard focus outline |
| `--career-focus-offset` | `3px` | focus separation from the control |
| `--career-display-leading` | `1.12` | identity and section display type |
| `--career-heading-leading` | `1.3` | employer/project headings |
| `--career-body-leading` | `1.6` | Korean body copy |
| `--career-display-tracking` | `-0.012em` | runtime-equivalent display tracking |
| `--career-transition` | `180ms ease` | hover/focus/pressed feedback |

At 768px, `--career-inset / --career-hero-block / --career-hero-title` become `32px / 64px / 44px`; section title becomes `36px`, section rhythm `64px`, card gap `24px`, and card padding `32px`. At the desktop ladder used by the 1280px reference, they become `48px / 96px / 64px`; section title becomes `50px`, section rhythm `96px`, card gap `24px`, and card padding remains `32px`.

### Career Primitives

#### Light Career Header

- White, hairline-separated, shadowless sticky header.
- Navigation stays in DOM order. The current document uses a lavender pill with ink text; non-current links stay plain.
- The PDF download action is the single filled aubergine control, 48px high with 28px inline padding and 90px radius.
- Hover uses `--career-primary-hover`, pressed uses `--career-primary-active`, and `:focus-visible` uses a visible `--career-link` outline. Interaction transitions affect only color and transform.

#### Identity And Evidence Band

- One full-width `--career-hero-gradient` surface with no border, radius, or shadow.
- Content aligns to `--career-shell-inset`; title follows the 32 / 44 / 64px ladder and body measure stays at 720px.
- Identity, role, and factual evidence remain a single text column.
- Contact details form a compact utility strip after the evidence: 2 columns at 375px, 3 at 768px, 4 at 1280px. Each mobile link target is at least 44px high.
- Duplicate resume/portfolio contact links may be hidden below 700px, but DOM order and real link text remain unchanged.

#### Chronology Summary

- Cream-to-lavender 16px card on the white document track.
- Four rows remain reverse chronological and preserve date → employer → platform/role source order.
- Decimal-leading-zero row numbers are the sparse aubergine accent; row dividers use the hairline token.

#### Employer Heading

- Employer name is the h2 primary line.
- A reusable semantic `<small>` subtitle holds separate nowrap spans for role and product/platform. Spans wrap as units so separator glyphs cannot dangle.
- Dates are separate semantic `<time>` elements and remain visually subordinate.
- Continuation headings use the same `<small>` primitive for compact outcome labels and always repeat the employer context.

#### Outcome Card

- Ordinary projects: white, 1px hairline, 16px radius, no shadow, 24px mobile padding and 32px from tablet upward.
- One and only one `.career-project--featured` surface is aubergine with white heading/body and muted-light supporting copy. It must not become a full-bleed dark section.
- Cream alternate cards are optional and sparse; the chronology card already satisfies the alternate-surface need.
- Strong text inside bullets uses medium/semi-bold weight so dense Korean copy does not become uniformly dark; factual metrics remain scannable.
- Cards are real semantic DOM sections, never raster or screenshot substitutes.

### Responsive Contract

| Reference width | Horizontal inset | Hero block padding | Hero title | Section heading | Contact columns | Card gap |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 375px | 20px | 48px | 32px / 1.12 | 28px / 1.12 | 2 | 16px |
| 768px | 32px | 64px | 44px / 1.12 | 36px / 1.12 | 3 | 24px |
| 1280px | 48px | 96px | 64px / 1.12 | 50px / 1.12 | 4 | 24px |

- Career content remains one column at every width. Only compact contact utilities change column count.
- At 200% zoom the document reflows without horizontal scrolling; no full heading or Korean sentence is forced into nowrap.
- Semantic subtitle spans may remain unbroken only when each unit comfortably fits the 375px content width.

### A4 Print Adaptation

- Output remains exactly two A4 pages with selectable text and existing page-flow ownership.
- The screen gradient flattens to a pale cream hero tint; chronology uses a pale lavender tint.
- All body and heading text prints black or near-black. Aubergine becomes a lighter accent for rules and the featured card is flattened to a pale tint rather than a dark full-bleed surface.
- Screen header, progress, and download controls remain hidden.
- Cards have no shadows. Ordinary outcomes flatten to compact hairline-separated rows and may split across a page when needed to preserve the two-page contract; the featured outcome keeps its pale card surface and `break-inside: avoid`. Employer headings and dates remain attached to the following outcome.
- Page 2 must begin with employer context before the first continuation project. Dates, reverse chronology, literal technical terms, and all `data-edit-id` seams remain unchanged.

Print-only token values:

| Token | Value | Usage |
| --- | --- | --- |
| `--career-print-canvas` | `#ffffff` | page background |
| `--career-print-hero` | `#faf5ef` | flattened hero |
| `--career-print-alt` | `#f8f3fb` | chronology and featured-card tint |
| `--career-print-primary` | `#744675` | lighter aubergine accent |
| `--career-print-ink` | `#000000` | print headings/body |
| `--career-print-muted` | `#333333` | print supporting text |
| `--career-print-hairline` | `#d7cbd7` | print dividers |

### Accessibility And COGA

- Keyboard users receive a non-color `:focus-visible` outline on navigation, download, and contact links; pressed and hover states remain distinct.
- Mobile controls and contact links meet the 44px target minimum; the PDF action stays 48px high.
- Contrast uses dark ink on white/cream/lavender and white on aubergine. Muted text is not used below readable body sizes on colored surfaces.
- `prefers-reduced-motion` removes transform feedback and transition duration.
- Wayfinding does not rely on color alone: current navigation has pill shape plus `aria-current`, employer subtitles create explicit hierarchy, and dates remain semantic `<time>`.
- COGA: one reading direction, predictable employer → outcome grouping, plain Korean result-led copy, restrained surface variants, and no decorative motion or memory-dependent interaction.
- CJK line breaking uses natural wrapping with only short semantic subtitle/metric units protected. Invisible joiners remain prohibited.

### Explicit Exclusions And Debt

- Excluded: reference-derived Slack brand copy, logos, proprietary fonts, screenshots, imagery, CTA phrases, marketing examples, footer imitation, and blue decorative accents. A factual mention of Slack as an operational notification tool remains part of the candidate evidence.
- Excluded: new packages, JavaScript behavior, decorative animation, shadows, glass, dark full-bleed print sections, unsupported metrics, and changes outside `.career-page`.
- The Signal Grid system remains authoritative for home, resume, portfolio, and admin.
- Accepted design debt: none. Any horizontal overflow, split Korean compound, third print page, missing page-2 employer context, or accessibility regression blocks delivery rather than entering debt.
