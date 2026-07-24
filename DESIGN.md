# Pastel Ledger Design System

서민재의 홈, 이력서, 경력기술서, 엔지니어링 포트폴리오를 하나의 채용 경험으로 묶는 디자인 계약입니다. 정확한 기술 문서의 밀도는 유지하되, 따뜻한 파스텔 면과 실제 인물 사진을 사용해 “무슨 일을 했는가”와 “누가 했는가”를 동시에 빠르게 이해하게 합니다.

공개 레퍼런스인 `https://getdesign.md/slack/design-md`에서는 밝은 캔버스, 둥근 표면, 제한된 짙은 강조색, 넉넉한 여백만 원칙으로 차용합니다. Slack 로고, 문구, 자산, 전용 서체, 레이아웃 복제는 사용하지 않습니다.

## Direction

- 전체 인상은 **warm, precise, human**입니다.
- 밝은 아이보리 캔버스 위에 블러시, 라일락, 세이지, 스카이, 버터 면을 제한적으로 배치합니다.
- 파스텔은 정보 그룹을 구분하는 표면입니다. 장식만을 위한 무지개 그라디언트나 반복 카드에는 사용하지 않습니다.
- 짙은 플럼 잉크를 모든 페이지의 공통 중심색으로 사용합니다.
- 실제 프로필 사진은 신뢰를 만드는 핵심 자산입니다. 홈에서는 크게, 문서 화면에서는 작은 identity portrait로 사용합니다.
- 결과 문장은 문제 설명보다 먼저 보이고, 기술명과 수치는 리터럴 텍스트로 남깁니다.
- 화면과 A4 인쇄는 같은 정보 위계를 사용하되 인쇄에서는 장식과 그림자를 평면화합니다.

## Tokens

### Color

| Token | Value | Usage |
| --- | --- | --- |
| `--canvas` | `#fbf8f5` | 전체 배경 |
| `--canvas-overlay` | `rgba(251, 248, 245, 0.92)` | sticky header |
| `--surface` | `#fffdfb` | 기본 문서·카드 |
| `--surface-strong` | `#ffffff` | 사진·도식 면 |
| `--pastel-blush` | `#fbe9e7` | 홈·경력 강조 면 |
| `--pastel-lilac` | `#eee9f8` | 현재 위치·연표 |
| `--pastel-sage` | `#e6f0e9` | 운영·안정성 결과 |
| `--pastel-sky` | `#e6f0f5` | 데이터·구조 표면 |
| `--pastel-butter` | `#f8efcf` | 수치·주의 환기 |
| `--ink` | `#2c2230` | 제목·핵심 텍스트 |
| `--ink-soft` | `#4f4652` | 본문 |
| `--muted` | `#675c69` | 날짜·보조 문구 |
| `--inverse-ink` | `#ffffff` | 짙은 면 위 텍스트 |
| `--line` | `#ded5df` | 기본 hairline |
| `--line-strong` | `#c3b7c5` | 강조 경계 |
| `--primary` | `#6e4c71` | CTA·활성 상태 |
| `--primary-strong` | `#533457` | hover·대표 결과 |
| `--link` | `#355f6d` | 본문 링크 |
| `--focus` | `#116b75` | 키보드 포커스 |
| `--selection` | `#e7dcef` | 텍스트 선택 |
| `--shadow-soft` | `0 16px 42px rgba(74, 48, 73, 0.09)` | 큰 화면의 부드러운 깊이 |
| `--shadow-hover` | `0 20px 50px rgba(74, 48, 73, 0.14)` | 상호작용 카드 hover |

`--muted`는 모든 파스텔 면에서 4.5:1 이상의 대비를 유지합니다. 흰 글자는 `--primary`보다 밝은 면에 사용하지 않습니다.

반투명 면, tinted hairline, 그림자, radius는 컴포넌트 안에서 값을 새로 만들지 않고 아래 semantic family만 사용합니다.

| Family | Tokens | Usage |
| --- | --- | --- |
| Glass | `--glass-subtle`, `--glass-muted`, `--glass-default`, `--glass-strong` | label, callout, button, floating panel |
| Plum line | `--line-ink-faint`, `--line-ink-soft`, `--line-ink-medium`, `--line-ink-strong`, `--line-ink-accent`, `--line-ink-hover` | divider부터 hover 경계까지 위계 순서 |
| Teal line | `--line-link-soft`, `--line-link-medium` | capability와 diagram 경계 |
| Pastel wash | `--wash-blush`, `--wash-butter`, `--wash-sage-soft`, `--wash-sage`, `--wash-lilac` | 큰 사례 면을 위한 제한된 tint |
| Elevation | `--shadow-header`, `--shadow-control`, `--shadow-card`, `--shadow-panel`, `--shadow-soft`, `--shadow-feature`, `--shadow-hover` | header부터 featured outcome까지 깊이 순서 |
| Radius | `--radius-control`, `--radius-brand`, `--radius-card`, `--radius-card-lg`, `--radius-panel`, `--radius-portrait`, `--radius-document`, `--radius-decoration`, `--radius-pill` | 12px부터 pill까지 component scale |

기존 의미 토큰은 새 공통 토큰에 매핑합니다.

| Legacy token | Mapping |
| --- | --- |
| `--lime`, `--coral`, `--teal`, `--blue`, `--yellow` | `--primary`, `--primary`, `--link`, `--link`, `--primary` |
| `--lime-soft`, `--coral-soft` | `--pastel-sage`, `--pastel-blush` |
| `--teal-soft`, `--teal-faint`, `--blue-soft` | `--pastel-sky` |
| `--yellow-soft` | `--pastel-butter` |
| `--green-ink` | `--primary-strong` |

### Type

- Font stack: `Pretendard`, `SUIT`, `Apple SD Gothic Neo`, `Noto Sans KR`, system sans-serif.
- Display: 700–800 weight, `-0.035em`, 1.05–1.16 line height.
- Section heading: 700 weight, `-0.024em`, 1.16–1.28 line height.
- Body: 400–600 weight, 1.62–1.72 line height.
- Metadata: 12–14px, 650–700 weight, 1.4 line height.
- Desktop display / section: 68px / 42px.
- Tablet display / section: 50px / 34px.
- Mobile display / section: 38px / 28px.
- 본문은 화면에서 16px 미만으로 줄이지 않습니다. 조밀한 표와 메타데이터만 12–15px를 허용합니다.
- 한국어 문장 전체에 `nowrap`을 사용하지 않습니다. 기술명·날짜·짧은 역할 단위만 의미 있는 span으로 보호합니다.

### Geometry And Rhythm

- Spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96px.
- Content width: 1184px.
- Reading measure: 720px.
- Screen inset: 20px at 375, 32px at 768, 48px at 1280.
- Radius: controls 999px, small cards 16px, large surfaces 24px, photos 22px.
- Touch target: at least 44×44px.
- Screen section rhythm: 56px mobile, 72px tablet, 96px desktop.
- 그림자는 큰 identity surface와 hover 가능한 카드에만 사용합니다. 문서 본문을 카드 그림자로 반복 분절하지 않습니다.

## Shared Primitives

### Site Header

- 모든 공개 페이지에서 `SM / 서민재` 홈 링크, 이력서, 경력기술서, 포트폴리오 순서를 공유합니다.
- 아이보리 반투명 배경, 1px hairline, 72px 높이입니다.
- 현재 문서는 라일락 pill과 `aria-current`로 표시합니다.
- 오른쪽의 이메일 또는 PDF 행동은 짙은 플럼 pill입니다.
- 700px 이하에서는 텍스트 브랜드를 줄이고, 문서 링크와 PDF 44px 행동은 유지합니다.

### Identity Portrait

- 원본은 `assets/profile.jpg`, 689×886, `alt="서민재 프로필 사진"`입니다.
- 본문 내 모든 사용은 명시적 `width`와 `height`, `aspect-ratio: 4 / 5`, `object-fit: cover`를 가집니다.
- 홈은 최대 360px, 문서·포트폴리오 화면은 108–144px입니다.
- 사진 뒤에는 서로 다른 단색 파스텔 종이 두 장을 겹친 듯한 프레임을 사용합니다. 사진 자체에 필터를 적용하거나 얼굴을 가리는 장식을 올리지 않습니다.
- 홈 사진은 eager, 아래쪽 또는 중복 사진은 lazy loading을 허용합니다.
- 이력서 PDF에서는 작은 사진을 유지할 수 있지만, 경력기술서·포트폴리오 PDF에서는 페이지 계약을 위해 숨깁니다.

### Buttons

- Primary: `--primary` 배경, 흰 글자, 48px 높이, pill.
- Secondary: 반투명 흰 면, `--line-strong` 경계, 48px 높이, pill.
- hover는 색과 그림자만 바꾸고 레이아웃을 움직이지 않습니다.
- `:focus-visible`은 3px teal outline과 3px offset입니다.

### Pastel Surface

- `blush`, `lilac`, `sage`, `sky`, `butter` 다섯 변형을 사용합니다.
- 한 viewport 안에 큰 파스텔 면은 최대 3종입니다.
- 같은 위계의 카드에 무작위 색을 쓰지 않고, 문서 종류나 정보 역할에 따라 반복합니다.
- 큰 hero는 하나의 기본 면과 두 개의 단색 pseudo shape로 깊이를 만듭니다. 전체 화면 rainbow gradient는 금지합니다.

### Document Card

- 16–20px radius, 1px tinted border, 24–32px inset.
- 제목, 한 줄 설명, 이동 affordance의 세 단계만 유지합니다.
- 홈의 세 문서는 라일락, 블러시, 스카이 표면으로 고정합니다.
- hover는 경계·그림자 변화만 사용하고 transform으로 주변 배치를 흔들지 않습니다.

### Evidence Row

- 순서: 기간 → 회사/범위 → 역할 → 결과.
- 데스크톱에서는 열, 모바일에서는 기간과 회사부터 세로로 쌓습니다.
- 색에만 의존하지 않고 크기·weight·위치로 계층을 구분합니다.

### Outcome Panel

- 일반 결과는 흰 면과 hairline을 사용합니다.
- 한 문서에 가장 강한 결과 하나만 `--primary-strong` 면과 흰 글자를 사용할 수 있습니다.
- 보조 결과는 세이지 또는 라일락 옅은 면과 3px 규칙선으로 표시합니다.
- 수치와 결과는 제목 또는 첫 문장에 위치합니다.

## Page Contracts

### Home

- Hero: copy 1fr + portrait 360px의 비대칭 2열. 모바일에서는 copy → photo 순서입니다.
- Hero surface는 블러시, 사진 frame은 라일락+버터입니다.
- 문서 카드 3개는 동일한 크기와 구조, 서로 다른 고정 파스텔 면을 사용합니다.
- 경력은 카드 묶음이 아니라 한 개의 흰 timeline surface 안에서 hairline으로 나눕니다.
- 첫 화면에서 이름, 직무, 대표 가치, 사진, 이력서 CTA가 보여야 합니다.

### Resume

- 화면에서는 큰 흰 문서가 아니라 부드러운 아이보리 캔버스 위 24px 문서 surface로 보입니다.
- Hero는 이름·요약, 작은 portrait, contact utility를 같은 identity block 안에 배치합니다.
- 기술은 라일락 요약 panel, 현재 경력은 결과 우선, 이전 경력은 hairline 목록으로 구성합니다.
- A4는 정확히 1페이지를 유지합니다. portrait는 68×88px 이하로 유지하고 연락처와 같은 상단 행에 둡니다.

### Career Description

- 별도 Slack 전용 색 계약을 폐기하고 공통 Pastel Ledger 토큰만 사용합니다.
- Hero는 블러시 identity band + 작은 portrait + contact strip입니다.
- 연표는 라일락 surface, 프로젝트는 흰 outcome panels입니다.
- 약 200만 건 보정 결과 한 개만 짙은 플럼 featured panel로 허용합니다.
- 회사와 역할은 `h2(company) + small(role/product)`의 두 단계로 유지합니다.
- A4는 정확히 2페이지, 페이지 2 시작에 웍스피어 문맥을 유지합니다.

### Portfolio

- Hero는 스카이 identity surface와 작은 portrait/profile panel입니다.
- sticky case navigation은 흰 면과 라일락 활성 상태를 사용합니다.
- 각 사례는 번호, 결과 제목, 사실 4개, 상황/변경의 순서입니다.
- fact cells는 동일한 파스텔을 반복하지 않고 사례 단위로 한 가지 tint만 사용합니다.
- 다이어그램은 흰 배경과 hairline을 유지하며 텍스트와 선이 겹치지 않아야 합니다.
- A4는 정확히 3페이지를 유지합니다.

## Responsive

| Width | Inset | Header | Identity | Cards |
| --- | ---: | --- | --- | --- |
| 375px | 20px | compact brand, 44px targets | single column | single column |
| 768px | 32px | full nav | home 2 columns, docs compact portrait | 2 columns where meaningful |
| 1280px | 48px | full header | 720px copy + 360px portrait | bounded by 1184px |

- 200% 확대에서도 수평 스크롤이 없어야 합니다.
- portrait와 기술 다이어그램은 컨테이너 폭을 넘지 않습니다.
- sticky 요소는 콘텐츠를 가리지 않습니다.
- 375px에서 헤더는 문서 링크를 제거하지 않습니다.

## Print

- `@page`: A4, 10mm.
- 배경은 흰색, 본문은 검정/짙은 회색, 파스텔은 5–8% tint로 평면화합니다.
- sticky header, progress, 버튼, toast, portfolio side navigation은 숨깁니다.
- 그림자, decorative pseudo shape, 화면 전용 caption을 제거합니다.
- 텍스트와 링크는 선택 가능해야 하며 PDF 안에 화면 캡처를 넣지 않습니다.
- Resume 1쪽, Career 2쪽, Portfolio 3쪽 계약은 시각 효과보다 우선합니다.

## Accessibility And Performance

- 모든 의미 있는 사진과 도식은 구체적인 alt를 갖습니다.
- 색 외에 shape, label, weight로 상태를 구분합니다.
- `prefers-reduced-motion`에서는 scroll behavior와 transition을 제거합니다.
- 외부 폰트·이미지 요청을 추가하지 않습니다.
- 프로필 원본은 이미 로컬에 있으며 네트워크 실패와 무관하게 표시되어야 합니다.
- 이미지에는 크기와 aspect ratio를 선언해 CLS를 방지합니다.
- 링크와 버튼은 키보드 순서가 DOM 읽기 순서와 같아야 합니다.
- CJK 고아행, 단독 구분점, 잘린 기술명, 도식의 선·글자 겹침은 배포 차단 결함입니다.

## Explicit Exclusions

- Slack 로고·마케팅 카피·스크린샷·전용 자산 복제.
- generic purple-blue full-screen gradient, glassmorphism, glow, 무한 애니메이션.
- 프로필 사진의 AI 보정·얼굴 변형·stock image 대체.
- 새 런타임 의존성 또는 외부 웹폰트.
- 지원되지 않는 성과 수치와 기술 경험의 추가.
- 문서 전체를 각각 다른 브랜드처럼 보이게 하는 페이지별 독립 테마.
