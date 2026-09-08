# 행성 간 업적 흐름

네 SVG는 각기 독립된 경력 사례다. 행성의 크기와 궤도 간 거리는 설명을 위한 구성으로, 처리량이나 개선율의 비례를 나타내지 않는다. 기존 사실은 `portfolio/index.html`, `career/index.html`, `assets/diagrams/feed-serving.svg`, `design/archify/feed-serving.architecture.json`에서 가져왔다.

| 파일 | 실제 흐름 · 보존한 사실 | 이미지 대체 설명 |
| --- | --- | --- |
| `assets/diagrams/orbit-jpa.svg` | 실제 영속성 컨텍스트에서 오류 재현 → 변경 감지 원인·오류 데이터 식별 → 보정 스크립트로 약 200만 건 보정. Spring Boot 전환 테스트 수치는 별개라 넣지 않았다. | 실제 저장 환경에서 JPA 오류를 재현하고 원인과 대상을 식별한 뒤 약 200만 건을 보정한 흐름 |
| `assets/diagrams/orbit-event.svg` | 발행 전 중단과 발행 후 업무 처리 실패를 분리 → PostgreSQL 상태·JSONB payload 보존 → 완료되지 않은 업무만 선택 재실행 → 업무 완료. 9종 이벤트·6개 상태·8개 복구 경로는 각각 단위가 다르다. | 이벤트 발행 실패와 처리 실패를 구분해 기록하고 저장한 상태와 payload로 필요한 업무만 복구하는 흐름 |
| `assets/diagrams/orbit-batch.svg` | 페이지 단위 처리 → 배치별 진행 위치 기록 → 중단 후 기록한 지점부터 남은 범위 처리. 별도 궤도에는 9개 API·13개 시나리오·3·5·10개 동시 요청 이후 잔액·원장·예산·후속 이벤트 검증을 표시했다. | 진행 위치를 기록해 배치를 중단 지점부터 재개하는 흐름과, 별도로 수행한 동시 요청 정합성 검증 |
| `assets/diagrams/orbit-feed.svg` | Feed API → Orchestrator → Snapshot 조회. Hit은 결과 반환, Empty는 9개 검색 소스 → FPR 중복·노출 이력 제거 → SPR 점수화 → Re-Rank 재정렬 → 새 Snapshot 저장. Orchestrator의 캐시 우회 경로를 별도 선으로 보존했다. | Snapshot Hit이면 결과를 반환하고, Empty이면 검색 후보를 중복 제거·점수화·재정렬해 새 Snapshot을 저장하는 개인화 피드 흐름 |

피드 SVG는 데이터의 처리 순서를 나타낸다. Archify JSON의 pull 호출 의존 방향을 데이터 이동 방향이라고 설명하지 않는다. 원본 `feed-serving.svg`는 인쇄와 확대 열람을 위해 유지한다.

모든 SVG는 1000×420 viewBox, 접근 가능한 title·desc, 외부 의존성이 없는 벡터 행성·광원·화살표로 구성했다. 상세 글씨는 15–17px, 주요 이름은 20–30px다. 데스크톱에서는 약 760px 이상의 너비를 확보하고, 좁은 화면에서는 읽을 수 있는 텍스트 흐름을 우선 제공한다. 원본 도식은 확대하거나 가로로 스크롤할 수 있어야 한다.

검증: 네 파일 XML 파싱 통과. 설치된 Chrome에서 실제 SVG 이미지로 네 장을 렌더링해 행성, 한국어, 화살표를 확인했고, 피드 분기 선과 설명의 겹침을 수정했다.
