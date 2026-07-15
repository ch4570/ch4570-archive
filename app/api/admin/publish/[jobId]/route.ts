import type { NextRequest } from "next/server";

import { requireAdminEnabled } from "@/lib/admin/config";
import { AdminError } from "@/lib/admin/errors";
import { adminApiError, adminJson, requireAdminSession } from "@/lib/admin/http";
import { publishJobDto, refreshPublishJob } from "@/lib/admin/publish";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ jobId: string }> },
) {
  try {
    requireAdminEnabled();
    await requireAdminSession(request);
    const { jobId } = await context.params;
    if (!/^[0-9a-f-]{36}$/u.test(jobId)) {
      throw new AdminError(404, "JOB_NOT_FOUND", "게시 작업을 찾지 못했습니다.");
    }
    const job = await refreshPublishJob(jobId);
    return adminJson({ job: publishJobDto(job) });
  } catch (error) {
    return adminApiError(error);
  }
}
