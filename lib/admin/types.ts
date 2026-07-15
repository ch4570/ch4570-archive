import type { DocumentKey } from "@/lib/admin/constants";

export type DraftChange = {
  original: string;
  value: string;
};

export type DraftPayload = {
  version: 1;
  updatedAt: string;
  documents: Partial<Record<DocumentKey, Record<string, DraftChange>>>;
};

export type ContentRevisionStatus = "draft" | "publishing" | "published" | "failed";

export type ContentRevision = {
  id: string;
  baseSha: string;
  payload: DraftPayload;
  checksum: string;
  status: ContentRevisionStatus;
  version: number;
  publishedSha: string | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
};

export type PublishJobStatus =
  | "preparing"
  | "queued"
  | "in_progress"
  | "published"
  | "warning"
  | "failed";

export type PublishJob = {
  id: string;
  revisionId: string;
  idempotencyKey: string;
  status: PublishJobStatus;
  draftRef: string | null;
  draftSha: string | null;
  runId: number | null;
  runUrl: string | null;
  htmlUrl: string | null;
  publishedSha: string | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
};
