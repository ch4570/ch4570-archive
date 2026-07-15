import { randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

import { isVercelRuntime } from "@/lib/admin/config";
import { matchesCsrfToken } from "@/lib/admin/session";

export function loginCsrfCookieName() {
  return isVercelRuntime() ? "__Host-ch4570_login_csrf" : "ch4570_login_csrf_dev";
}

export function createLoginCsrfToken() {
  return randomBytes(32).toString("base64url");
}

export function setLoginCsrfCookie(response: NextResponse, token: string) {
  response.cookies.set(loginCsrfCookieName(), token, {
    httpOnly: true,
    secure: isVercelRuntime(),
    sameSite: "strict",
    path: "/",
    maxAge: 10 * 60,
    priority: "high",
  });
}

export function clearLoginCsrfCookie(response: NextResponse) {
  response.cookies.set(loginCsrfCookieName(), "", {
    httpOnly: true,
    secure: isVercelRuntime(),
    sameSite: "strict",
    path: "/",
    expires: new Date(0),
  });
}

export function matchesLoginCsrf(request: NextRequest, formToken: string) {
  const cookieToken = request.cookies.get(loginCsrfCookieName())?.value || "";
  return matchesCsrfToken(cookieToken, formToken);
}
