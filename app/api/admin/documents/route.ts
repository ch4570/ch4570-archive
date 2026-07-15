import type { NextRequest } from "next/server";

import { isPublishEnabled, requireAdminEnabled } from "@/lib/admin/config";
import { getRepositorySnapshot } from "@/lib/admin/github";
import { adminApiError, adminJson, requireAdminSession } from "@/lib/admin/http";
import {
  isTerminalPublishJob,
  publishJobDto,
  refreshPublishJob,
} from "@/lib/admin/publish";
import {
  getActiveRevision,
  getLatestPublishJobForRevision,
  resetOrphanedPublishingRevision,
} from "@/lib/admin/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    requireAdminEnabled();
    await requireAdminSession(request);
    const [snapshot, initialRevision] = await Promise.all([
      getRepositorySnapshot(),
      getActiveRevision(),
    ]);
    let revision = initialRevision;
    let activeJob = null;

    if (revision?.status === "publishing") {
      const storedJob = await getLatestPublishJobForRevision(revision.id);
      if (!storedJob) {
        await resetOrphanedPublishingRevision(
          revision.id,
          "게시 작업 기록을 찾지 못해 초안 상태로 되돌렸습니다.",
        );
        revision = await getActiveRevision();
      } else {
        const refreshedJob = await refreshPublishJob(storedJob.id).catch(() => storedJob);
        if (isTerminalPublishJob(refreshedJob)) {
          revision = await getActiveRevision();
        } else {
          activeJob = publishJobDto(refreshedJob);
        }
      }
    }

    return adminJson({
      baseSha: snapshot.baseSha,
      sources: snapshot.sources,
      publishEnabled: isPublishEnabled(),
      activeJob,
      revision: revision
        ? {
            id: revision.id,
            version: revision.version,
            baseSha: revision.baseSha,
            status: revision.status,
            draft: revision.payload,
            error: revision.error,
          }
        : null,
    });
  } catch (error) {
    return adminApiError(error);
  }
}
