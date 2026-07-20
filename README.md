# ch4570-archive

[이력서](https://ch4570-archive.vercel.app/resume/) · [경력기술서](https://ch4570-archive.vercel.app/career/) · [포트폴리오](https://ch4570-archive.vercel.app/portfolio/) · [기술 블로그](https://velog.io/@ch4570/posts)

## 이 저장소

이력서, 경력기술서, 포트폴리오를 한 저장소에서 관리하는 Next.js 애플리케이션입니다. 공개 문서는 정적 HTML과 제출용 PDF로 제공하고, 문구 수정은 비밀번호로 보호된 `/admin/`에서 처리합니다.

## 공개 문서

- `/` - 전체 소개와 문서 이동
- `/resume/` - 이력서
- `/career/` - 경력기술서
- `/portfolio/` - 포트폴리오
- `/pdf/` - 제출용 PDF 파일

Vercel이 운영 서비스입니다. 제출 전 원본 HTML·PDF와 Vercel 배포본의 핵심 문구·페이지 수가 일치하는지 확인합니다. GitHub Pages는 공개 HTML과 PDF만 제공하는 정적 대체 경로이며 관리자 화면은 포함하지 않습니다.

## 구조

- 원본 HTML 네 파일이 공개 문서의 기준입니다.
- Archify 원본 IR은 `design/archify/`, 배포용 정적 SVG는 `assets/diagrams/`에서 관리합니다.
- Next.js Route Handler가 원본 바이트를 그대로 응답합니다.
- 관리자는 `data-edit-id`가 지정된 문구만 수정할 수 있습니다. 레이아웃, 스타일, 도식 마크업은 서버 검증에서 잠깁니다.
- 초안, revision, 로그인 제한, 게시 작업은 libSQL에 저장합니다. 로컬은 SQLite 파일, 운영은 Turso를 사용합니다.
- 게시는 서버가 GitHub 초안 브랜치를 만든 뒤 Actions 검증을 통과한 변경만 `main`에 반영합니다.

## 로컬 실행

Node.js 24 이상이 필요합니다.

```bash
npm ci
npm run auth:setup-local
npm run db:init
npm run dev
```

`http://localhost:3000/admin/`에서 편집할 수 있습니다. 로컬 비밀번호는 macOS Keychain의 `ch4570-archive-admin` 서비스에 저장되며 다음 명령으로 확인합니다.

```bash
security find-generic-password -a ch4570 -s ch4570-archive-admin -w
```

## 운영 환경 변수

| 이름 | 용도 |
| --- | --- |
| `ADMIN_ORIGIN` | 운영 origin. 예: `https://ch4570-archive.vercel.app` |
| `ADMIN_PASSWORD_HASH` | scrypt 관리자 비밀번호 해시 |
| `ADMIN_SESSION_SECRET` | 관리자 세션 서명 키 |
| `ADMIN_SESSION_VERSION` | 세션 일괄 만료 버전 |
| `RATE_LIMIT_SECRET` | 로그인 제한 버킷 해시 키 |
| `TURSO_DATABASE_URL` | 운영 libSQL 주소 |
| `TURSO_AUTH_TOKEN` | 운영 libSQL 토큰 |
| `GITHUB_ADMIN_TOKEN` | 서버 전용 GitHub 게시 토큰 |
| `GITHUB_PUBLISH_ENABLED` | 운영 게시 기능 활성화 여부 |

비밀값은 Vercel Production의 Sensitive 환경 변수로만 저장합니다. Preview 배포에서는 관리자가 기본으로 비활성화됩니다. 운영 런타임은 DDL을 실행하지 않으므로 Vercel Production 환경 변수를 불러온 셸에서 migration 자격증명으로 `npm run db:init`을 한 번 실행해야 합니다. 이 명령만 실행 중에 migration을 명시적으로 활성화합니다.

## 검증

```bash
npm run lint
npm run typecheck
npm test
npm run validate:content
npm run build
sh scripts/export-pdfs.sh
```

PDF는 이력서 1쪽, 경력기술서 2쪽, 포트폴리오 3쪽을 기준으로 회귀 확인합니다.
내보내기 스크립트는 현재 디자인 시스템 CSS와 로컬 SVG를 PDF용 임시 HTML에 직접 포함하고, 기본 출력 경로를 사용할 때 Next.js의 `public/` 사본도 함께 갱신합니다.

피드 도식은 Archify `v2.11.0` (`ed0efcc763d358b78df845182b5ed24a9d165a1c`) CLI를 준비한 뒤 아래 명령으로 재생성합니다. 프로젝트 런타임 의존성은 추가하지 않습니다.

```bash
git clone --depth 1 --branch v2.11.0 https://github.com/tt-a1i/archify.git /tmp/archify-v2.11.0
ARCHIFY_CLI=/tmp/archify-v2.11.0/archify/bin/archify.mjs node scripts/export-archify-svg.mjs
```

라이선스 고지는 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)에 있습니다.
