import type { NextRequest } from "next/server";

import { adminOrigin } from "@/lib/admin/config";
import { MAX_DRAFT_BYTES } from "@/lib/admin/constants";
import { AdminError, asAdminError } from "@/lib/admin/errors";
import { matchesCsrfToken, readAdminSession, type AdminSession } from "@/lib/admin/session";

export const ADMIN_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
} as const;

export function assertTrustedOrigin(request: NextRequest) {
  if (request.headers.get("origin") !== adminOrigin()) {
    throw new AdminError(403, "INVALID_ORIGIN", "허용되지 않은 요청입니다.");
  }
}

export function assertLoginOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== adminOrigin()) {
    throw new AdminError(403, "INVALID_ORIGIN", "허용되지 않은 요청입니다.");
  }
}

export async function requireAdminSession(request: NextRequest) {
  const session = await readAdminSession(request);
  if (!session) throw new AdminError(401, "UNAUTHORIZED", "로그인이 필요합니다.");
  return session;
}

export function assertCsrf(request: NextRequest, session: AdminSession, formToken?: string | null) {
  const token = formToken ?? request.headers.get("x-csrf-token");
  if (!matchesCsrfToken(session.csrf, token)) {
    throw new AdminError(403, "INVALID_CSRF", "요청을 다시 시도해 주세요.");
  }
}

export async function readJsonBody<T>(request: NextRequest, maxBytes = MAX_DRAFT_BYTES) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0];
  if (contentType !== "application/json") {
    throw new AdminError(415, "UNSUPPORTED_MEDIA_TYPE", "JSON 요청만 허용됩니다.");
  }
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > maxBytes) {
    throw new AdminError(413, "PAYLOAD_TOO_LARGE", "초안이 너무 큽니다.");
  }
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new AdminError(413, "PAYLOAD_TOO_LARGE", "초안이 너무 큽니다.");
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AdminError(400, "INVALID_JSON", "요청 형식이 올바르지 않습니다.");
  }
}

export function adminJson(payload: unknown, init: ResponseInit = {}) {
  return Response.json(payload, {
    ...init,
    headers: { ...ADMIN_NO_STORE_HEADERS, ...init.headers },
  });
}

export function adminApiError(error: unknown) {
  const normalized = asAdminError(error);
  if (normalized.status >= 500) console.error(normalized);
  return adminJson(
    {
      error: {
        code: normalized.code,
        message:
          normalized.status >= 500
            ? "서버에서 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."
            : normalized.message,
      },
    },
    { status: normalized.status },
  );
}
