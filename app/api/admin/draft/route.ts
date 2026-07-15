import type { NextRequest } from "next/server";

import { requireAdminEnabled } from "@/lib/admin/config";
import { validateDraftInput } from "@/lib/admin/content";
import { AdminError } from "@/lib/admin/errors";
import { getRepositorySnapshot } from "@/lib/admin/github";
import {
  adminApiError,
  adminJson,
  assertCsrf,
  assertTrustedOrigin,
  readJsonBody,
  requireAdminSession,
} from "@/lib/admin/http";
import { deleteDraftRevision, saveDraftRevision } from "@/lib/admin/store";
import type { DraftPayload } from "@/lib/admin/types";

type SaveDraftRequest = {
  baseSha?: unknown;
  draft?: DraftPayload;
  revisionId?: unknown;
  revisionVersion?: unknown;
};

function optionalRevisionId(value: unknown) {
  if (value == null) return null;
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/u.test(value)) {
    throw new AdminError(400, "INVALID_REVISION", "초안 ID가 올바르지 않습니다.");
  }
  return value;
}

function optionalRevisionVersion(value: unknown) {
  if (value == null) return null;
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new AdminError(400, "INVALID_REVISION", "초안 버전이 올바르지 않습니다.");
  }
  return Number(value);
}

export async function PUT(request: NextRequest) {
  try {
    requireAdminEnabled();
    assertTrustedOrigin(request);
    const session = await requireAdminSession(request);
    assertCsrf(request, session);
    const body = await readJsonBody<SaveDraftRequest>(request);
    if (typeof body.baseSha !== "string" || !/^[0-9a-f]{40}$/u.test(body.baseSha)) {
      throw new AdminError(400, "INVALID_BASE", "공개 원본 버전이 올바르지 않습니다.");
    }
    const snapshot = await getRepositorySnapshot();
    if (snapshot.baseSha !== body.baseSha) {
      throw new AdminError(409, "STALE_BASE", "공개 원본이 변경되었습니다. 초안을 다시 확인해 주세요.");
    }
    const validated = validateDraftInput(body.draft, snapshot);
    const revision = await saveDraftRevision({
      baseSha: snapshot.baseSha,
      payload: validated.payload,
      checksum: validated.checksum,
      revisionId: optionalRevisionId(body.revisionId),
      revisionVersion: optionalRevisionVersion(body.revisionVersion),
    });
    return adminJson({
      revision: {
        id: revision.id,
        version: revision.version,
        baseSha: revision.baseSha,
        status: revision.status,
        draft: revision.payload,
      },
      changeCount: validated.changeCount,
    });
  } catch (error) {
    return adminApiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    requireAdminEnabled();
    assertTrustedOrigin(request);
    const session = await requireAdminSession(request);
    assertCsrf(request, session);
    const body = await readJsonBody<SaveDraftRequest>(request, 4096);
    const revisionId = optionalRevisionId(body.revisionId);
    const revisionVersion = optionalRevisionVersion(body.revisionVersion);
    if (revisionId && revisionVersion) await deleteDraftRevision(revisionId, revisionVersion);
    return adminJson({ cleared: true });
  } catch (error) {
    return adminApiError(error);
  }
}
