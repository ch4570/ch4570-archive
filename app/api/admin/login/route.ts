import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireAdminEnabled, requiredSecret } from "@/lib/admin/config";
import { AdminError } from "@/lib/admin/errors";
import { assertLoginOrigin } from "@/lib/admin/http";
import {
  clearLoginCsrfCookie,
  matchesLoginCsrf,
} from "@/lib/admin/login-csrf";
import { verifyPassword } from "@/lib/admin/password";
import {
  clearLoginFailures,
  loginBucketKey,
  loginRetryAfterSeconds,
  recordLoginFailure,
} from "@/lib/admin/rate-limit";
import { createAdminSession, setAdminSessionCookie } from "@/lib/admin/session";

function loginRedirect(request: NextRequest, error?: string) {
  const target = new URL("/admin/", request.url);
  if (error) target.searchParams.set("error", error);
  return NextResponse.redirect(target, 303);
}

async function readLoginForm(request: NextRequest) {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/x-www-form-urlencoded") {
    throw new AdminError(400, "INVALID_LOGIN_BODY", "로그인 요청 형식이 올바르지 않습니다.");
  }
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (!Number.isFinite(declaredLength) || declaredLength < 0 || declaredLength > 1024) {
    throw new AdminError(413, "LOGIN_BODY_TOO_LARGE", "로그인 요청이 너무 큽니다.");
  }

  const reader = request.body?.getReader();
  if (!reader) throw new AdminError(400, "INVALID_LOGIN_BODY", "로그인 요청이 비어 있습니다.");
  const decoder = new TextDecoder();
  let body = "";
  let receivedBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    receivedBytes += value.byteLength;
    if (receivedBytes > 1024) {
      await reader.cancel();
      throw new AdminError(413, "LOGIN_BODY_TOO_LARGE", "로그인 요청이 너무 큽니다.");
    }
    body += decoder.decode(value, { stream: true });
  }
  body += decoder.decode();

  const params = new URLSearchParams(body);
  const passwords = params.getAll("password");
  const csrfTokens = params.getAll("csrf");
  if (
    passwords.length !== 1 ||
    passwords[0].length > 256 ||
    csrfTokens.length !== 1 ||
    csrfTokens[0].length > 128
  ) {
    throw new AdminError(400, "INVALID_LOGIN_BODY", "비밀번호를 확인해 주세요.");
  }
  return { password: passwords[0], csrf: csrfTokens[0] };
}

export async function POST(request: NextRequest) {
  try {
    requireAdminEnabled();
    assertLoginOrigin(request);
    const login = await readLoginForm(request);
    if (!matchesLoginCsrf(request, login.csrf)) {
      throw new AdminError(403, "INVALID_LOGIN_CSRF", "로그인 화면을 새로 열어 주세요.");
    }

    const bucketKey = loginBucketKey(request);
    if (await loginRetryAfterSeconds(bucketKey)) return loginRedirect(request, "blocked");

    const valid = await verifyPassword(login.password, requiredSecret("ADMIN_PASSWORD_HASH", 64));
    if (!valid) {
      const retryAfter = await recordLoginFailure(bucketKey);
      return loginRedirect(request, retryAfter ? "blocked" : "invalid");
    }

    await clearLoginFailures(bucketKey);
    const session = await createAdminSession();
    const response = loginRedirect(request);
    setAdminSessionCookie(response, session);
    clearLoginCsrfCookie(response);
    return response;
  } catch (error) {
    if (!(error instanceof AdminError) || error.status >= 500) console.error(error);
    return loginRedirect(
      request,
      error instanceof AdminError && error.status < 500 ? "invalid" : "unavailable",
    );
  }
}
