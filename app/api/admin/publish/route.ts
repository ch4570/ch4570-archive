import type { NextRequest } from "next/server";

import { requireAdminEnabled, requirePublishEnabled } from "@/lib/admin/config";
import { AdminError } from "@/lib/admin/errors";
import {
  adminApiError,
  adminJson,
  assertCsrf,
  assertTrustedOrigin,
  readJsonBody,
  requireAdminSession,
} from "@/lib/admin/http";
import { publishJobDto, startPublish } from "@/lib/admin/publish";

type PublishRequest = {
  revisionId?: unknown;
  revisionVersion?: unknown;
  idempotencyKey?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    requireAdminEnabled();
    requirePublishEnabled();
    assertTrustedOrigin(request);
    const session = await requireAdminSession(request);
    assertCsrf(request, session);
    const body = await readJsonBody<PublishRequest>(request, 4096);
    if (typeof body.revisionId !== "string" || !/^[0-9a-f-]{36}$/u.test(body.revisionId)) {
      throw new AdminError(400, "INVALID_REVISION", "게시할 초안 ID가 올바르지 않습니다.");
    }
    if (!Number.isInteger(body.revisionVersion) || Number(body.revisionVersion) < 1) {
      throw new AdminError(400, "INVALID_REVISION", "게시할 초안 버전이 올바르지 않습니다.");
    }
    if (typeof body.idempotencyKey !== "string" || !/^[0-9a-f-]{36}$/u.test(body.idempotencyKey)) {
      throw new AdminError(400, "INVALID_IDEMPOTENCY_KEY", "게시 요청 ID가 올바르지 않습니다.");
    }
    const job = await startPublish({
      revisionId: body.revisionId,
      revisionVersion: Number(body.revisionVersion),
      idempotencyKey: body.idempotencyKey,
    });
    return adminJson({ job: publishJobDto(job) }, { status: 202 });
  } catch (error) {
    return adminApiError(error);
  }
}
