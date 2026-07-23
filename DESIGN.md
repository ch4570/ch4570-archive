# Signal Grid Design System

서민재의 이력서, 경력기술서, 엔지니어링 포트폴리오를 위한 화면 규칙입니다. `npx getdesign@latest add nvidia`로 받은 프리셋에서 각진 그리드, 선명한 녹색, 얇은 구분선 원칙을 참고했습니다. NVIDIA의 로고, 상표 표현, 전용 서체는 사용하지 않습니다.

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
