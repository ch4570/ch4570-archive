import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireAdminEnabled } from "@/lib/admin/config";
import { AdminError } from "@/lib/admin/errors";
import { adminApiError, assertCsrf, assertTrustedOrigin, requireAdminSession } from "@/lib/admin/http";
import { clearAdminSessionCookie } from "@/lib/admin/session";

export async function POST(request: NextRequest) {
  try {
    requireAdminEnabled();
    assertTrustedOrigin(request);
    const session = await requireAdminSession(request);
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 1024) throw new AdminError(413, "PAYLOAD_TOO_LARGE", "요청이 너무 큽니다.");
    const form = await request.formData();
    assertCsrf(request, session, typeof form.get("csrf") === "string" ? String(form.get("csrf")) : null);
    const response = NextResponse.redirect(new URL("/admin/", request.url), 303);
    clearAdminSessionCookie(response);
    return response;
  } catch (error) {
    return adminApiError(error);
  }
}
