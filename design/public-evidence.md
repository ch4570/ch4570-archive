# 공개 경력·프로젝트 근거

확인일: 2026-09-07. 공개 웹 문서, 저장소 코드와 실제 커밋을 읽어 확인했다. 외부 프로젝트 테스트를 이번 포트폴리오 작업에서 실행한 것은 아니다.

| 화면의 주장 | 공개 근거 | 확인 범위 |
| --- | --- | --- |
| JPA 변경 감지 결함·약 200만 건 보정 | [직접 작성한 글, 2025-01-18](https://velog.io/@ch4570/여러분이-열심히-짠-테스트는-안녕하십니까) | `clearAutomatically`, 영속성 컨텍스트, 보정 스크립트와 수정 건수 |
| Boot 개선 제안 반영 | [#38029](https://github.com/spring-projects/spring-boot/pull/38029), [공식 반영 커밋](https://github.com/spring-projects/spring-boot/commit/0fbb1f7890adcc904782de2efb434c34dfe9531c) | 2023-10-26, `server.ports` 상수 추출. PR의 `merged_at`은 null이므로 제안 반영으로 표기 |
| Kafka 개선 제안 병합 | [#2875](https://github.com/spring-projects/spring-kafka/pull/2875) | 2023-11-02, 불변 컬렉션 및 빈 컬렉션 확인 개선 |
| Data JPA 개선 제안 반영 | [#3408](https://github.com/spring-projects/spring-data-jpa/pull/3408), [공식 반영 커밋](https://github.com/spring-projects/spring-data-jpa/commit/b6b5e20716630bac8ef20582af49855afd352a43) | 2024-04-22, 제네릭 타입·컬렉션 초기화·자원 정리. 초기 제안 전체가 그대로 병합됐다는 뜻은 아님 |
| OpenSearch 한글 플러그인 이식 | [저장소](https://github.com/ch4570/open-search-custom-plugin), [Kotlin 전환](https://github.com/ch4570/open-search-custom-plugin/commit/beb06b19f818), [2.19 이식](https://github.com/ch4570/open-search-custom-plugin/commit/b8ec3245b312) | Java Cafe 원작 기반, 2025.02–03. 공개 테스트 파일의 assertion 총 16개 확인. 이번 작업에서 테스트 실행 안 함 |
| Redis 락·트랜잭션 순서 비교 | [공개 이력](https://github.com/ch4570/redis-distributed-lock/commits/main/), [동시 요청 시나리오](https://github.com/ch4570/redis-distributed-lock/blob/main/src/test/kotlin/com/redis/example/service/ProductServiceTest.kt) | 2025.07–08, 학습·재현 예제. 100개 요청의 네 시나리오 작성. 실서비스 안전성·성능 또는 현재 테스트 통과를 주장하지 않음 |
| Transactional Outbox 단계별 구현 | [저장소](https://github.com/ch4570/transactional-outbox), [Polling Publisher 구현](https://github.com/ch4570/transactional-outbox/commit/fcef16ba2393) | 2024.06–07, 직접 발행 → 폴링 → Debezium을 버전별 구현한 학습 예제 |
| 이벤트 복구·검색 격리·배치 정합성·Boot 전환 테스트 160개 이상 | [변경 전 경력 원본](https://github.com/ch4570/ch4570-archive/blob/24c86c3/career/index.html), [기존 포트폴리오](https://github.com/ch4570/ch4570-archive/blob/24c86c3/portfolio/index.html) | 기존 공개 경력 주장. 이번에 사내 소스·운영 지표를 새로 검증하지 않음 |
| YouthCon 2025 발표 | [본인의 발표 후기](https://www.linkedin.com/posts/devseorex_ssqswmtgo-youthcon2025-activity-7410871152220405760-Ubd9) | 팀의 Spring 테스트 공통화 경험 발표. 정확한 행사 일자는 새로 단정하지 않음 |

## 공개 활동 집계

2026-09-07 13:44:40 KST, Authorization 헤더 없이 공개 API를 조회했다.

- [프로필 API](https://api.github.com/users/ch4570): 공개 저장소 62개, 팔로워 67명.
- [소유 저장소 목록](https://api.github.com/users/ch4570/repos?type=owner&per_page=100&page=1): 원본 45개 + 포크 17개 = 62개. `private=true` 항목 0개.
- GitHub 기여 그래프에는 익명 비공개 활동이 포함될 수 있어 공개 기여 수로 사용하지 않았다.

## 문장 유지 기준

JPA 보정 건수와 Boot 전환 테스트 수를 같은 원인·결과로 묶지 않는다. Spring 세 사례의 통합 표기는 “개선 제안 3건 반영”이다. 학습 프로젝트에는 실제 운영 안정성이나 성능 개선률을 붙이지 않는다. 공개 근거가 없는 현재 채용 가능 상태와 비공개 저장소 업적은 추가하지 않는다.
