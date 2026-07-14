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
| Canvas | `#f5f6f3` | 페이지 바탕 |
| Surface | `#ffffff` | 문서와 카드 |
| Surface soft | `#f0f2ef` | 섹션 구분, 사이드바 |
| Ink | `#11150f` | 제목, 헤더, 주요 선 |
| Ink soft | `#30382d` | 본문 |
| Muted | `#667064` | 보조 설명, 날짜 |
| Line | `#d9dfd5` | 기본 구분선 |
| Lime | `#76b900` | CTA, 활성 상태, 주요 노드 |
| Lime soft | `#edf7dc` | 성과와 결과 배경 |
| Teal | `#007b83` | 외부 시스템, 비동기 경로 |
| Coral | `#b95016` | 장애, 복구 경로 |
| Blue | `#3c6e9e` | 완료 결과 |
| Yellow | `#c89500` | 보조 지표 |

라임 바탕에는 검정 글자를 사용합니다. 본문 링크나 작은 글자에 라임 원색을 직접 쓰지 않고 `#416f00`을 사용합니다.

## Typography

- 기본 서체: `Pretendard`, `Apple SD Gothic Neo`, `Noto Sans KR`, system sans-serif
- 화면 제목: 700-800 weight, 줄 간격 1.08-1.22
- 본문: 400-600 weight, 줄 간격 1.6-1.7
- 영문 레이블: 10-12px, 700 weight, uppercase
- 자간은 항상 `0`

## Shape And Spacing

- Radius: `2px`
- 기본 간격 단위: `4px`
- 카드 안쪽 여백: 24-32px
- 화면 섹션 간격: 64-88px
- 그림자는 호버 피드백에만 작게 사용합니다.
- 그라디언트와 장식용 광원 효과는 사용하지 않습니다.

## Components

### Header

검정 바탕과 라임 브랜드 마크를 씁니다. 브랜드 마크는 홈으로 연결하고, 현재 문서는 라임 하단선으로 표시합니다. 모바일에서도 이력서·경력기술서·포트폴리오 링크를 유지합니다.

### Buttons

주요 버튼은 라임 바탕과 검정 글자, 보조 버튼은 흰 바탕과 진한 테두리를 씁니다. 높이는 최소 40px, radius는 2px입니다.

### Metrics

네 개 지표는 흰 면과 검정 hairline으로 묶고 라임 상단선으로만 강조합니다. 홈의 작은 화면에서는 2x2 배열을 유지합니다.

### Document Cards

문서 카드는 1px 테두리와 5px 상단 규칙선을 씁니다. 큰 그림자나 둥근 외곽선 없이 제목과 이동 행동이 한눈에 이어져야 합니다.

### Architecture Diagrams

- Service: 검정 상단선
- Store: 옅은 라임 면
- External / async: 청록 면과 점선
- Risk / recovery: 주황 면과 선
- Result: 파랑 면과 선

한 도식에서 강조색은 의미가 있는 노드와 경로에만 적용합니다.

## Responsive And Print

- Desktop: 콘텐츠 최대 폭 1180px
- Tablet: 900px 이하에서 문서와 도식을 한 열로 전환
- Mobile: 420px 이하에서도 홈 지표는 2x2, 나머지 긴 지표는 한 열. 복잡한 도식은 제목을 먼저 보여주고 사용자가 전체 구조를 펼칩니다.
- Print: A4, 배경색을 제거한 흑백 대비. 이력서는 2쪽, 경력기술서는 5쪽 안팎, 포트폴리오는 사례별 페이지 구성을 우선

## Accessibility

- 모든 인터랙션은 `:focus-visible` 표시를 제공합니다.
- 색만으로 현재 위치를 알리지 않고 선, 텍스트, 배경을 함께 사용합니다.
- `prefers-reduced-motion`에서 전환 시간을 제거합니다.
- 본문과 배경은 WCAG AA 수준의 대비를 유지합니다.
