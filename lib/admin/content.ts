import { createHash } from "node:crypto";

import {
  assertEditableOnlyChanges,
  inferEditableTimeDatetime,
  replaceEditableContents,
  scanEditableRegions,
  validateInlineHtml,
} from "../../admin/editor-core.js";

import {
  DOCUMENT_KEYS,
  DOCUMENTS,
  type DocumentKey,
} from "@/lib/admin/constants";
import { AdminError } from "@/lib/admin/errors";
import type { DraftChange, DraftPayload } from "@/lib/admin/types";

export type RepositorySnapshot = {
  baseSha: string;
  sources: Record<DocumentKey, string>;
};

type EditableRegion = {
  id: string;
  innerHTML: string;
  tagName: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asChange(value: unknown): DraftChange | null {
  if (!isRecord(value) || typeof value.original !== "string" || typeof value.value !== "string") {
    return null;
  }
  if (value.original.length > 20_000 || value.value.length > 20_000) {
    throw new AdminError(413, "FIELD_TOO_LARGE", "문구 하나의 길이가 너무 깁니다.");
  }
  return { original: value.original, value: value.value };
}

function draftChecksum(payload: DraftPayload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function validateDraftInput(
  value: unknown,
  snapshot: RepositorySnapshot,
): {
  payload: DraftPayload;
  checksum: string;
  workingSources: Partial<Record<DocumentKey, string>>;
  changeCount: number;
} {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.documents)) {
    throw new AdminError(400, "INVALID_DRAFT", "초안 형식이 올바르지 않습니다.");
  }

  for (const key of Object.keys(value.documents)) {
    if (!DOCUMENT_KEYS.includes(key as DocumentKey)) {
      throw new AdminError(400, "UNKNOWN_DOCUMENT", "허용되지 않은 문서가 포함되어 있습니다.");
    }
  }

  const documents: DraftPayload["documents"] = {};
  const workingSources: Partial<Record<DocumentKey, string>> = {};
  let changeCount = 0;

  for (const documentKey of DOCUMENT_KEYS) {
    const submittedDocument = value.documents[documentKey];
    if (submittedDocument === undefined) continue;
    if (!isRecord(submittedDocument)) {
      throw new AdminError(400, "INVALID_DOCUMENT", "문서 초안 형식이 올바르지 않습니다.");
    }

    const source = snapshot.sources[documentKey];
    const regions = scanEditableRegions(source) as EditableRegion[];
    const regionById = new Map(regions.map((region) => [region.id, region]));
    const normalizedEntries: Array<[string, DraftChange]> = [];

    for (const id of Object.keys(submittedDocument).sort()) {
      const change = asChange(submittedDocument[id]);
      const region = regionById.get(id);
      if (!change || !region) {
        throw new AdminError(400, "UNKNOWN_EDIT_ID", `${DOCUMENTS[documentKey].name}에 없는 문구입니다.`);
      }
      if (region.innerHTML !== change.original) {
        throw new AdminError(409, "STALE_CONTENT", `${id} 문구의 공개 원본이 변경되었습니다.`);
      }
      if (change.value === change.original) continue;
      try {
        validateInlineHtml(change.value);
        if (region.tagName === "time") inferEditableTimeDatetime(change.value);
      } catch (error) {
        const message = error instanceof Error ? error.message : `${id} 문구 형식이 올바르지 않습니다.`;
        throw new AdminError(400, "INVALID_EDITABLE_HTML", message);
      }
      normalizedEntries.push([id, change]);
      changeCount += 1;
    }

    if (!normalizedEntries.length) continue;
    documents[documentKey] = Object.fromEntries(normalizedEntries);
    const replacements = new Map(normalizedEntries.map(([id, change]) => [id, change.value]));
    const workingSource = replaceEditableContents(source, replacements) as string;
    assertEditableOnlyChanges(source, workingSource);
    workingSources[documentKey] = workingSource;
  }

  if (!changeCount) {
    throw new AdminError(400, "EMPTY_DRAFT", "게시할 변경사항이 없습니다.");
  }

  const payload: DraftPayload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    documents,
  };
  return {
    payload,
    checksum: draftChecksum(payload),
    workingSources,
    changeCount,
  };
}
