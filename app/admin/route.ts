import type { NextRequest } from "next/server";

import { requireAdminEnabled } from "@/lib/admin/config";
import { AdminError } from "@/lib/admin/errors";
import {
  createLoginCsrfToken,
  setLoginCsrfCookie,
} from "@/lib/admin/login-csrf";
import {
  adminNotFoundResponse,
  editorPageResponse,
  loginPageResponse,
} from "@/lib/admin/page";
import { readAdminSession } from "@/lib/admin/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    requireAdminEnabled();
    const session = await readAdminSession(request);
    if (!session) {
      const csrf = createLoginCsrfToken();
      const response = loginPageResponse(request.nextUrl.searchParams.get("error"), csrf);
      setLoginCsrfCookie(response, csrf);
      return response;
    }
    return editorPageResponse(session.csrf);
  } catch (error) {
    if (error instanceof AdminError && error.status === 404) return adminNotFoundResponse();
    console.error(error);
    const csrf = createLoginCsrfToken();
    const response = loginPageResponse("unavailable", csrf);
    setLoginCsrfCookie(response, csrf);
    return response;
  }
}
