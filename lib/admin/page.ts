import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

import { ADMIN_NO_STORE_HEADERS } from "@/lib/admin/http";

const LOGIN_ERRORS: Record<string, string> = {
  invalid: "비밀번호를 확인해 주세요.",
  blocked: "로그인 시도가 잠시 제한되었습니다. 잠시 후 다시 시도해 주세요.",
  unavailable: "로그인 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
};

const EDITOR_CSP = [
  "default-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "font-src 'self' data:",
  "frame-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const LOGIN_CSP = [
  "default-src 'none'",
  "style-src 'self'",
  "img-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join("; ");

function escapeAttribute(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] as string;
  });
}

function htmlResponse(source: string, csp: string, status = 200) {
  return new NextResponse(source, {
    status,
    headers: {
      ...ADMIN_NO_STORE_HEADERS,
      "Content-Security-Policy": csp,
      "Content-Type": "text/html; charset=utf-8",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    },
  });
}

export async function editorPageResponse(csrf: string) {
  const source = await readFile(join(process.cwd(), "admin/index.html"), "utf8");
  const rendered = source
    .replace("__ADMIN_CSRF_META__", escapeAttribute(csrf))
    .replace("__ADMIN_CSRF_FORM__", escapeAttribute(csrf));
  const response = htmlResponse(rendered, EDITOR_CSP);
  response.headers.set("Referrer-Policy", "same-origin");
  return response;
}

export function loginPageResponse(errorCode: string | null = null, csrf = "") {
  const error = errorCode ? LOGIN_ERRORS[errorCode] : null;
  const source = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#f3f5f1">
  <meta name="robots" content="noindex, nofollow, noarchive">
  <title>관리자 로그인 · 서민재</title>
  <link rel="stylesheet" href="/assets/design-system.css">
  <link rel="stylesheet" href="/api/admin/assets/login.css">
</head>
<body class="admin-login-body">
  <main class="admin-login-main">
    <section class="admin-login-panel" aria-labelledby="login-title">
      <header class="admin-login-brand">
        <a href="/" class="admin-login-mark" aria-label="공개 사이트로 이동">SM</a>
        <span>서민재 문서 편집기</span>
      </header>
      <div class="admin-login-copy">
        <h1 id="login-title">로그인</h1>
        <span>비밀번호를 입력하세요.</span>
      </div>
      ${error ? `<p class="admin-login-error" role="alert">${escapeAttribute(error)}</p>` : ""}
      <form class="admin-login-form" action="/api/admin/login/" method="post">
        <input type="hidden" name="csrf" value="${escapeAttribute(csrf)}">
        <label for="admin-password">비밀번호</label>
        <div class="admin-password-field">
          <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="18" height="11" x="3" y="11" rx="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
          <input id="admin-password" name="password" type="password" required maxlength="256" autocomplete="current-password" autofocus>
        </div>
        <button type="submit">
          로그인
          <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6"></path>
          </svg>
        </button>
      </form>
      <footer>
        <span>ch4570-archive</span>
        <a href="/">공개 문서 보기</a>
      </footer>
    </section>
  </main>
</body>
</html>`;
  const response = htmlResponse(source, LOGIN_CSP);
  response.headers.set("Referrer-Policy", "same-origin");
  return response;
}

export function adminNotFoundResponse() {
  return new Response("Not Found", {
    status: 404,
    headers: ADMIN_NO_STORE_HEADERS,
  });
}
