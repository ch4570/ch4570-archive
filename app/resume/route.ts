import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { publicDocumentResponse } from "@/lib/public-document";

export const dynamic = "force-static";

export async function GET() {
  const source = await readFile(
    join(/*turbopackIgnore: true*/ process.cwd(), "resume", "index.html"),
    "utf8",
  );
  return publicDocumentResponse(source);
}
