export const REPOSITORY = "ch4570/ch4570-archive";
export const REPOSITORY_OWNER_ID = 91787050;
export const MAIN_BRANCH = "main";
export const GITHUB_API_VERSION = "2026-03-10";
export const PUBLISH_WORKFLOW = "publish-content.yml";

export const DOCUMENTS = {
  home: { name: "홈", path: "index.html" },
  resume: { name: "이력서", path: "resume/index.html" },
  career: { name: "경력기술서", path: "career/index.html" },
  portfolio: { name: "포트폴리오", path: "portfolio/index.html" },
} as const;

export type DocumentKey = keyof typeof DOCUMENTS;

export const DOCUMENT_KEYS = Object.freeze(
  Object.keys(DOCUMENTS) as DocumentKey[],
);

export const MAX_DRAFT_BYTES = 768 * 1024;
export const SESSION_DURATION_SECONDS = 8 * 60 * 60;
export const LOGIN_WINDOW_SECONDS = 15 * 60;
export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_BLOCK_SECONDS = 60 * 60;
