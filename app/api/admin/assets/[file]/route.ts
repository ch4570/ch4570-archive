import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { NextRequest } from "next/server";

import { requireAdminEnabled } from "@/lib/admin/config";
import { ADMIN_NO_STORE_HEADERS } from "@/lib/admin/http";
import { adminNotFoundResponse } from "@/lib/admin/page";
import { readAdminSession } from "@/lib/admin/session";

export const dynamic = "force-dynamic";

const ASSETS = {
  "admin.css": { file: "admin.css", contentType: "text/css; charset=utf-8", public: false },
  "admin.js": { file: "admin.js", contentType: "text/javascript; charset=utf-8", public: false },
  "editor-core.js": {
    file: "editor-core.js",
    contentType: "text/javascript; charset=utf-8",
    public: false,
  },
  "login.css": { file: "login.css", contentType: "text/css; charset=utf-8", public: true },
} as const;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ file: string }> },
) {
  try {
    requireAdminEnabled();
    const { file } = await context.params;
    const asset = ASSETS[file as keyof typeof ASSETS];
    if (!asset) return adminNotFoundResponse();
    if (!asset.public && !(await readAdminSession(request))) return adminNotFoundResponse();
    const source = await readFile(join(process.cwd(), "admin", asset.file));
    return new Response(source, {
      headers: {
        ...ADMIN_NO_STORE_HEADERS,
        "Content-Type": asset.contentType,
      },
    });
  } catch {
    return adminNotFoundResponse();
  }
}
