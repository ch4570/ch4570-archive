import {
  inferEditableTimeDatetime,
  mergeDraftPayloads,
  scanEditableRegions,
  validateInlineHtml,
} from "./editor-core.js";

const ADMIN_API_ROOT = "/api/admin";
const csrfToken = document.querySelector('meta[name="admin-csrf-token"]')?.content || "";
const DRAFT_KEY = "ch4570-copy-admin-draft-v1";
const CACHE_KEY = "ch4570-copy-admin-source-v1";
const PUBLISH_KEY = "ch4570-copy-admin-publish-v1";
const DOCUMENTS = {
  home: {
    key: "home",
    name: "홈",
    englishName: "Home",
    path: "index.html",
    previewPath: "../",
  },
  resume: {
    key: "resume",
    name: "이력서",
    englishName: "Resume",
    path: "resume/index.html",
    previewPath: "../resume/",
  },
  career: {
    key: "career",
    name: "경력기술서",
    englishName: "Career Description",
    path: "career/index.html",
    previewPath: "../career/",
  },
  portfolio: {
    key: "portfolio",
    name: "포트폴리오",
    englishName: "Portfolio",
    path: "portfolio/index.html",
    previewPath: "../portfolio/",
  },
};

const state = {
  activeDocument: "resume",
  activeSections: {},
  sources: new Map(),
  models: new Map(),
  changes: new Map(),
  conflicts: new Set(),
  invalidFields: new Map(),
  selectedEditId: "",
  baseSha: "",
  serverRevisionId: null,
  serverRevisionVersion: null,
  publishEnabled: false,
  serverAvailable: true,
  loading: true,
  publishing: false,
  publishMonitorJobId: null,
};

const elements = {
  app: document.querySelector("#admin-app"),
  documentTabs: document.querySelector("#document-tabs"),
  sectionList: document.querySelector("#section-list"),
  search: document.querySelector("#copy-search"),
  fields: document.querySelector("#editor-fields"),
  previewFrame: document.querySelector("#preview-frame"),
  previewStage: document.querySelector("#preview-stage"),
  saveState: document.querySelector("#save-state"),
  saveSummary: document.querySelector(".admin-save-summary"),
  changeCount: document.querySelector("#change-count"),
  publishButton: document.querySelector("#publish-button"),
  resetDraft: document.querySelector("#reset-draft"),
  reloadContent: document.querySelector("#reload-content"),
  empty: document.querySelector("#editor-empty"),
  error: document.querySelector("#admin-error"),
  errorTitle: document.querySelector("#admin-error strong"),
  errorMessage: document.querySelector("#admin-error [data-error-message]"),
  editorTitle: document.querySelector("#editor-title"),
  editorMeta: document.querySelector("#editor-section-meta"),
  activeDocumentNames: document.querySelectorAll("[data-active-document-name]"),
  mobileEditorTab: document.querySelector("#mobile-editor-tab"),
  mobilePreviewTab: document.querySelector("#mobile-preview-tab"),
  publishDialog: document.querySelector("#publish-dialog"),
  publishForm: document.querySelector("#publish-form"),
  publishCancel: document.querySelector("#publish-cancel"),
  publishSubmit: document.querySelector("#publish-submit"),
  publishProgress: document.querySelector("#publish-progress"),
  publishStatus: document.querySelector("#publish-status"),
  publishRunLink: document.querySelector("#publish-run-link"),
};

const sleep = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

const storage = {
  read(key) {
    try {
      const value = window.localStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  },
  write(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  remove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // The editor still works for the current tab when storage is unavailable.
    }
  },
};

const readDraftEnvelope = () => {
  const stored = storage.read(DRAFT_KEY);
  if (stored?.draft?.version === 1) return stored;
  if (stored?.version === 1) {
    return { draft: stored, revisionId: null, revisionVersion: null };
  }
  return null;
};

const writeDraftEnvelope = (draft) =>
  storage.write(DRAFT_KEY, {
    draft,
    revisionId: state.serverRevisionId,
    revisionVersion: state.serverRevisionVersion,
  });

const adminRequest = async (path, { method = "GET", body } = {}) => {
  const response = await fetch(`${ADMIN_API_ROOT}${path}`, {
    method,
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(method === "GET" ? {} : { "X-CSRF-Token": csrfToken }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const responseText = await response.text();
  let payload = null;
  if (responseText) {
    try {
      payload = JSON.parse(responseText);
    } catch {
      payload = null;
    }
  }
  if (!response.ok) {
    if (response.status === 401) window.location.assign("/admin/");
    const error = new Error(payload?.error?.message || `서버 요청이 실패했습니다. (${response.status})`);
    error.status = response.status;
    error.code = payload?.error?.code || "REQUEST_FAILED";
    throw error;
  }
  return payload;
};

const escapeSelector = (value) => {
  if (window.CSS?.escape) return window.CSS.escape(value);
  return value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
};

const toPlainText = (html) => {
  const template = document.createElement("template");
  template.innerHTML = html;
  return (template.content.textContent || "").replace(/\s+/g, " ").trim();
};

const compactLabel = (value, fallback = "문서") => {
  const text = (value || "").replace(/\s+/g, " ").trim();
  if (!text) return fallback;
  return text.length > 34 ? `${text.slice(0, 33)}…` : text;
};

const semanticLabel = (element) => {
  const labels = {
    H1: "대표 제목",
    H2: "섹션 제목",
    H3: "소제목",
    H4: "세부 제목",
    P: "본문",
    LI: "항목",
    DT: "구분",
    DD: "내용",
    TIME: "기간",
  };
  if (element.classList.contains("career-company")) return "회사";
  if (element.closest(".portfolio-profile")) return "프로필";
  return labels[element.tagName] || "문구";
};

const findSectionScope = (element) =>
  element.closest("section, article") || element.closest("header, main") || element.ownerDocument.body;

const findSectionLabel = (scope, element, documentConfig) => {
  const labelledBy = scope.getAttribute?.("aria-labelledby");
  if (labelledBy) {
    const label = scope.ownerDocument.getElementById(labelledBy);
    if (label?.textContent?.trim()) return compactLabel(label.textContent);
  }

  const heading = [...scope.querySelectorAll("h1, h2, h3")].find((candidate) => {
    const candidateScope = findSectionScope(candidate);
    return candidateScope === scope;
  });
  if (heading?.textContent?.trim()) return compactLabel(heading.textContent);

  const previousHeading = [...element.ownerDocument.querySelectorAll("h1, h2, h3")]
    .filter((candidate) => candidate.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)
    .at(-1);
  if (previousHeading?.textContent?.trim()) return compactLabel(previousHeading.textContent);
  return documentConfig.name;
};

const buildDocumentModel = (source, documentConfig) => {
  const regions = scanEditableRegions(source);
  if (!regions.length) throw new Error(`${documentConfig.name}에서 편집 가능한 문구를 찾지 못했습니다.`);

  const regionById = new Map(regions.map((region) => [region.id, region]));
  const parsed = new DOMParser().parseFromString(source, "text/html");
  const sectionKeys = new Map();
  const sectionById = new Map();
  const sections = [];
  const fields = [];
  const labelCounters = new Map();

  for (const element of parsed.querySelectorAll("[data-edit-id]")) {
    const id = element.dataset.editId;
    const region = regionById.get(id);
    if (!region) throw new Error(`${id} 편집 영역을 원본에서 찾지 못했습니다.`);

    const scope = findSectionScope(element);
    let sectionId = sectionKeys.get(scope);
    if (!sectionId) {
      sectionId = `${documentConfig.key}-section-${String(sections.length + 1).padStart(2, "0")}`;
      sectionKeys.set(scope, sectionId);
      const section = {
        id: sectionId,
        label: findSectionLabel(scope, element, documentConfig),
        fields: [],
      };
      sections.push(section);
      sectionById.set(sectionId, section);
    }

    const baseLabel = semanticLabel(element);
    const counterKey = `${sectionId}:${baseLabel}`;
    const labelIndex = (labelCounters.get(counterKey) || 0) + 1;
    labelCounters.set(counterKey, labelIndex);
    const field = {
      id,
      sectionId,
      tagName: region.tagName,
      label: `${baseLabel} ${String(labelIndex).padStart(2, "0")}`,
      originalHtml: region.innerHTML,
      searchText: `${baseLabel} ${toPlainText(region.innerHTML)}`.toLocaleLowerCase("ko"),
    };
    fields.push(field);
    sectionById.get(sectionId).fields.push(field);
  }

  return {
    config: documentConfig,
    regions,
    regionById,
    sections,
    fields,
  };
};

const getDocumentChanges = (documentKey, create = false) => {
  let changes = state.changes.get(documentKey);
  if (!changes && create) {
    changes = new Map();
    state.changes.set(documentKey, changes);
  }
  return changes;
};

const getFieldValue = (documentKey, field) =>
  getDocumentChanges(documentKey)?.get(field.id)?.value ?? field.originalHtml;

const fieldKey = (documentKey, editId) => `${documentKey}:${editId}`;

const validateFieldValue = (field, value) => {
  validateInlineHtml(value);
  if (field.tagName === "time") inferEditableTimeDatetime(value);
};

const countChanges = () =>
  [...state.changes.values()].reduce((total, documentChanges) => total + documentChanges.size, 0);

const setSaveState = (message, status = "saved") => {
  elements.saveState.textContent = message;
  elements.saveSummary?.classList.toggle("is-saving", status === "saving");
  elements.saveSummary?.classList.toggle("is-error", status === "error");
};

const updateGlobalStatus = () => {
  const changeTotal = countChanges();
  const hasDraftIssues = state.invalidFields.size > 0 || state.conflicts.size > 0;
  elements.changeCount.textContent = String(changeTotal);
  elements.changeCount.hidden = changeTotal === 0;
  elements.resetDraft.disabled = state.loading || state.publishing || (changeTotal === 0 && !hasDraftIssues);

  const blocked =
    state.loading ||
    state.publishing ||
    !state.serverAvailable ||
    !state.publishEnabled ||
    changeTotal === 0 ||
    state.invalidFields.size > 0 ||
    state.conflicts.size > 0;
  elements.publishButton.disabled = blocked;
  elements.fields.querySelectorAll("[contenteditable]").forEach((control) => {
    control.contentEditable = String(!state.loading && !state.publishing);
    control.setAttribute("aria-disabled", String(state.loading || state.publishing));
  });
  if (!state.publishEnabled) {
    elements.publishButton.title = "운영 관리자 화면에서만 게시할 수 있습니다.";
  } else if (!state.serverAvailable) {
    elements.publishButton.title = "서버 연결을 확인한 뒤 게시할 수 있습니다.";
  } else if (state.conflicts.size) {
    elements.publishButton.title = "원본과 충돌한 문구를 먼저 확인해 주세요.";
  } else if (state.invalidFields.size) {
    elements.publishButton.title = "형식 오류가 있는 문구를 먼저 수정해 주세요.";
  } else {
    elements.publishButton.removeAttribute("title");
  }
};

const serializeDraft = () => {
  const documents = {};
  for (const [documentKey, documentChanges] of state.changes) {
    if (!documentChanges.size) continue;
    documents[documentKey] = Object.fromEntries(documentChanges);
  }
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    documents,
  };
};

let saveTimer = 0;
let pendingDraftSync;
let draftSyncRunning = false;
let draftSyncPromise = Promise.resolve();

const syncDraftToServer = async (draft) => {
  if (!state.serverAvailable) return;
  if (!draft) {
    if (!state.serverRevisionId || !state.serverRevisionVersion) return;
    await adminRequest("/draft/", {
      method: "DELETE",
      body: {
        revisionId: state.serverRevisionId,
        revisionVersion: state.serverRevisionVersion,
      },
    });
    state.serverRevisionId = null;
    state.serverRevisionVersion = null;
    setSaveState("원본과 동일");
    return;
  }

  const response = await adminRequest("/draft/", {
    method: "PUT",
    body: {
      baseSha: state.baseSha,
      draft,
      revisionId: state.serverRevisionId,
      revisionVersion: state.serverRevisionVersion,
    },
  });
  state.serverRevisionId = response.revision.id;
  state.serverRevisionVersion = response.revision.version;
  writeDraftEnvelope(response.revision.draft);
  setSaveState("클라우드에 초안 저장됨");
};

const drainDraftSync = async () => {
  while (pendingDraftSync !== undefined) {
    const draft = pendingDraftSync;
    pendingDraftSync = undefined;
    try {
      await syncDraftToServer(draft);
    } catch (error) {
      state.serverAvailable = error.status === 409;
      showAdminError(
        error.message || "서버에 초안을 저장하지 못했습니다.",
        error.status === 409 ? "다른 창에서 초안이 변경되었습니다." : "초안을 저장하지 못했습니다.",
      );
      setSaveState(error.status === 409 ? "초안 충돌 확인 중" : "브라우저에만 초안 저장됨", "error");
      pendingDraftSync = undefined;
      if (error.status === 409) await loadDocuments({ force: true });
    }
  }
};

const queueDraftSync = (draft) => {
  if (!state.serverAvailable) return;
  pendingDraftSync = draft;
  if (draftSyncRunning) return;
  draftSyncRunning = true;
  draftSyncPromise = drainDraftSync().finally(() => {
    draftSyncRunning = false;
    if (pendingDraftSync !== undefined) queueDraftSync(pendingDraftSync);
  });
};

const flushDraftSync = () => draftSyncPromise;

const persistDraft = () => {
  window.clearTimeout(saveTimer);
  saveTimer = 0;
  const changeTotal = countChanges();
  const draft = changeTotal === 0 ? null : serializeDraft();
  const saved = draft ? writeDraftEnvelope(draft) : (storage.remove(DRAFT_KEY), true);
  if (saved) {
    if (state.invalidFields.size || state.conflicts.size) {
      setSaveState("브라우저에 초안 저장됨", "error");
    } else {
      setSaveState(changeTotal ? "서버에 저장 중" : "원본과 동일", changeTotal ? "saving" : "saved");
      queueDraftSync(draft);
    }
  } else {
    setSaveState("초안을 저장하지 못함", "error");
  }
  updateGlobalStatus();
  return saved;
};

const saveDraft = () => {
  window.clearTimeout(saveTimer);
  setSaveState("저장 중", "saving");
  saveTimer = window.setTimeout(persistDraft, 500);
};

const showAdminError = (message, title = "문서를 불러오지 못했습니다.") => {
  elements.errorTitle.textContent = title;
  elements.errorMessage.textContent = message;
  elements.error.hidden = false;
};

const clearAdminError = () => {
  elements.error.hidden = true;
};

const countFieldConflicts = (documentKey, fields) =>
  fields.reduce(
    (total, field) => total + Number(state.conflicts.has(fieldKey(documentKey, field.id))),
    0,
  );

const updateConflictIndicators = () => {
  elements.documentTabs.querySelectorAll("[data-document]").forEach((tab) => {
    const documentKey = tab.dataset.document;
    const model = state.models.get(documentKey);
    const count = model ? countFieldConflicts(documentKey, model.fields) : 0;
    tab.querySelector(".document-alert")?.remove();
    if (count) {
      const alert = document.createElement("span");
      alert.className = "document-alert";
      alert.textContent = String(count);
      alert.title = `충돌한 문구 ${count}개`;
      tab.append(alert);
    }
  });

  const activeModel = state.models.get(state.activeDocument);
  if (!activeModel) return;
  elements.sectionList.querySelectorAll("[data-section]").forEach((button) => {
    const section = activeModel.sections.find((candidate) => candidate.id === button.dataset.section);
    const count = section ? countFieldConflicts(state.activeDocument, section.fields) : 0;
    button.querySelector(".section-alert")?.remove();
    if (count) {
      const alert = document.createElement("span");
      alert.className = "section-alert";
      alert.textContent = String(count);
      alert.title = `충돌한 문구 ${count}개`;
      button.append(alert);
    }
  });
};

const fetchBundle = async () => {
  const cached = storage.read(CACHE_KEY);
  try {
    const response = await adminRequest("/documents/");
    state.baseSha = response.baseSha;
    state.serverRevisionId = response.revision?.id || null;
    state.serverRevisionVersion = response.revision?.version || null;
    state.publishEnabled = Boolean(response.publishEnabled);
    state.serverAvailable = true;
    storage.write(CACHE_KEY, {
      baseSha: response.baseSha,
      sources: response.sources,
      savedAt: new Date().toISOString(),
    });
    return {
      sources: response.sources,
      serverDraft: response.revision?.draft || null,
      revisionStatus: response.revision?.status || null,
      revisionError: response.revision?.error || null,
      activeJob: response.activeJob || null,
      fromCache: false,
    };
  } catch (error) {
    if (!cached?.sources) throw error;
    state.baseSha = cached.baseSha || "";
    state.serverRevisionId = null;
    state.serverRevisionVersion = null;
    state.publishEnabled = false;
    state.serverAvailable = false;
    return {
      sources: cached.sources,
      serverDraft: null,
      revisionStatus: null,
      revisionError: null,
      activeJob: null,
      fromCache: true,
    };
  }
};

const selectDraft = (localEnvelope, bundle) => {
  if (!localEnvelope) {
    return { draft: bundle.serverDraft, conflicts: [], needsSync: false };
  }
  if (bundle.fromCache) {
    return { draft: localEnvelope.draft, conflicts: [], needsSync: false };
  }
  if (!bundle.serverDraft) {
    return localEnvelope.revisionId
      ? { draft: null, conflicts: [], needsSync: false }
      : { draft: localEnvelope.draft, conflicts: [], needsSync: true };
  }
  if (
    localEnvelope.revisionId === state.serverRevisionId &&
    localEnvelope.revisionVersion === state.serverRevisionVersion
  ) {
    return {
      draft: localEnvelope.draft,
      conflicts: [],
      needsSync: JSON.stringify(localEnvelope.draft) !== JSON.stringify(bundle.serverDraft),
    };
  }
  const merged = mergeDraftPayloads(localEnvelope.draft, bundle.serverDraft);
  return {
    ...merged,
    needsSync:
      merged.conflicts.length === 0 &&
      JSON.stringify(merged.draft) !== JSON.stringify(bundle.serverDraft),
  };
};

const restoreDraft = (draft, mergeConflicts = []) => {
  state.changes.clear();
  state.conflicts.clear();
  state.invalidFields.clear();
  if (!draft?.documents || draft.version !== 1) return;

  for (const [documentKey, entries] of Object.entries(draft.documents)) {
    const model = state.models.get(documentKey);
    if (!model || !entries || typeof entries !== "object") continue;
    const documentChanges = getDocumentChanges(documentKey, true);

    for (const [id, savedChange] of Object.entries(entries)) {
      const field = model.fields.find((candidate) => candidate.id === id);
      if (!field || typeof savedChange?.value !== "string" || typeof savedChange?.original !== "string") continue;
      if (field.originalHtml === savedChange.value) continue;

      const key = fieldKey(documentKey, id);
      try {
        validateFieldValue(field, savedChange.value);
      } catch (error) {
        state.invalidFields.set(key, error.message);
        continue;
      }
      const rebased = field.originalHtml === savedChange.original;
      documentChanges.set(id, {
        original: rebased ? field.originalHtml : savedChange.original,
        value: savedChange.value,
      });
      if (!rebased) state.conflicts.add(key);
    }

    if (!documentChanges.size) state.changes.delete(documentKey);
  }

  for (const key of mergeConflicts) {
    const separator = key.indexOf(":");
    const documentKey = key.slice(0, separator);
    const editId = key.slice(separator + 1);
    if (getDocumentChanges(documentKey)?.has(editId)) state.conflicts.add(key);
  }
};

const loadDocuments = async ({ force = false } = {}) => {
  let activeJob = null;
  let needsSync = false;
  state.loading = true;
  updateGlobalStatus();
  clearAdminError();
  elements.fields.setAttribute("aria-busy", "true");
  setSaveState("원본 불러오는 중", "saving");

  try {
    const localEnvelope = readDraftEnvelope();
    const bundle = await fetchBundle({ force });
    const selected = selectDraft(localEnvelope, bundle);
    const draft = selected.draft;
    activeJob = bundle.activeJob;
    needsSync = selected.needsSync;
    if (activeJob) state.publishing = true;
    state.sources.clear();
    state.models.clear();

    for (const documentConfig of Object.values(DOCUMENTS)) {
      const source = bundle.sources[documentConfig.key];
      const model = buildDocumentModel(source, documentConfig);
      state.sources.set(documentConfig.key, source);
      state.models.set(documentConfig.key, model);
      state.activeSections[documentConfig.key] ||= model.sections[0]?.id || "";
    }

    restoreDraft(draft, selected.conflicts);
    if (draft) writeDraftEnvelope(draft);
    else storage.remove(DRAFT_KEY);
    const conflictCount = state.conflicts.size;
    if (conflictCount) {
      showAdminError(
        `최신 원본과 겹친 문구가 ${conflictCount}개 있습니다. 문서와 섹션의 표시를 따라가 내용을 다시 확인해 주세요.`,
        "최신 원본과 충돌한 문구가 있습니다.",
      );
      setSaveState("원본 충돌 확인 필요", "error");
    } else if (state.invalidFields.size) {
      showAdminError(
        `형식을 확인해야 하는 문구가 ${state.invalidFields.size}개 있습니다. 표시된 문구를 다시 입력해 주세요.`,
        "문구 형식을 확인해 주세요.",
      );
      setSaveState("문구 형식 확인 필요", "error");
    } else if (bundle.revisionError) {
      showAdminError(bundle.revisionError, "이전 게시 작업을 확인해 주세요.");
      setSaveState("게시 작업 확인 필요", "error");
    } else if (bundle.revisionStatus === "publishing") {
      setSaveState("게시 작업 확인 중", "saving");
    } else if (bundle.fromCache) {
      setSaveState(countChanges() ? "저장된 초안 복원됨" : "저장된 원본 사용 중");
    } else {
      setSaveState(countChanges() ? "클라우드 초안 복원됨" : "최신 원본");
    }
    renderActiveDocument({ reloadPreview: true });
  } catch (error) {
    showAdminError(error.message || "문서를 불러오지 못했습니다.");
    setSaveState("불러오기 실패", "error");
    elements.fields.replaceChildren();
    elements.empty.hidden = false;
  } finally {
    state.loading = false;
    elements.fields.removeAttribute("aria-busy");
    updateGlobalStatus();
  }
  if (needsSync && !state.conflicts.size && !activeJob) saveDraft();
  if (activeJob) void resumePublishJob(activeJob);
};

const renderSectionList = () => {
  const model = state.models.get(state.activeDocument);
  const activeSectionId = state.activeSections[state.activeDocument];
  const fragment = document.createDocumentFragment();

  model.sections.forEach((section, index) => {
    const button = document.createElement("button");
    button.className = "section-link";
    button.type = "button";
    button.dataset.section = section.id;
    const selected = section.id === activeSectionId;
    button.classList.toggle("is-active", selected);
    if (selected) button.setAttribute("aria-current", "true");

    const number = document.createElement("span");
    number.className = "section-index";
    number.textContent = String(index + 1).padStart(2, "0");
    const label = document.createElement("span");
    label.textContent = section.label;
    button.append(number, label);
    button.addEventListener("click", () => {
      state.activeSections[state.activeDocument] = section.id;
      elements.search.value = "";
      renderSectionList();
      renderEditorFields();
      elements.fields.querySelector("[contenteditable]")?.focus({ preventScroll: true });
    });
    fragment.append(button);
  });

  elements.sectionList.replaceChildren(fragment);
  updateConflictIndicators();
};

const insertPlainText = (control, text, singleLine) => {
  const normalized = singleLine ? text.replace(/\s+/g, " ") : text.replace(/\r\n?/g, "\n");
  const selection = window.getSelection();
  if (!selection?.rangeCount || !control.contains(selection.anchorNode)) {
    control.focus();
    selection?.selectAllChildren(control);
    selection?.collapseToEnd();
  }
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const fragment = document.createDocumentFragment();
  normalized.split("\n").forEach((line, index) => {
    if (index) fragment.append(document.createElement("br"));
    fragment.append(document.createTextNode(line));
  });
  const lastNode = fragment.lastChild;
  range.insertNode(fragment);
  if (lastNode) {
    range.setStartAfter(lastNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  control.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: normalized }));
};

const updatePreviewField = (field, value) => {
  const previewDocument = elements.previewFrame.contentDocument;
  if (!previewDocument) return;
  const target = previewDocument.querySelector(`[data-edit-id="${escapeSelector(field.id)}"]`);
  if (!target) return;
  target.innerHTML = value;
  if (field.tagName === "time") {
    target.setAttribute("datetime", inferEditableTimeDatetime(value));
  }
};

const selectPreviewField = (editId, { scroll = true } = {}) => {
  state.selectedEditId = editId;
  const previewDocument = elements.previewFrame.contentDocument;
  if (!previewDocument) return;
  previewDocument.querySelectorAll(".copy-admin-selected").forEach((element) => {
    element.classList.remove("copy-admin-selected");
  });
  const target = previewDocument.querySelector(`[data-edit-id="${escapeSelector(editId)}"]`);
  if (!target) return;
  target.classList.add("copy-admin-selected");
  if (scroll) target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
};

const applyPreview = () => {
  const previewDocument = elements.previewFrame.contentDocument;
  const model = state.models.get(state.activeDocument);
  if (!previewDocument || !model) return;

  let previewStyle = previewDocument.querySelector("#copy-admin-preview-style");
  if (!previewStyle) {
    previewStyle = previewDocument.createElement("style");
    previewStyle.id = "copy-admin-preview-style";
    previewStyle.textContent = `
      [data-edit-id] { scroll-margin: 25vh 0; }
      .copy-admin-selected { outline: 3px solid #76b900 !important; outline-offset: 4px !important; }
    `;
    previewDocument.head.append(previewStyle);
    previewDocument.addEventListener("click", (event) => {
      if (event.target.closest("a, button")) event.preventDefault();
    });
  }

  for (const field of model.fields) {
    if (state.invalidFields.has(fieldKey(state.activeDocument, field.id))) continue;
    const target = previewDocument.querySelector(`[data-edit-id="${escapeSelector(field.id)}"]`);
    if (!target) continue;
    const value = getFieldValue(state.activeDocument, field);
    target.innerHTML = value;
    if (field.tagName === "time") {
      target.setAttribute("datetime", inferEditableTimeDatetime(value));
    }
  }
  if (state.selectedEditId) selectPreviewField(state.selectedEditId, { scroll: false });
};

const loadPreviewDocument = () => {
  const source = state.sources.get(state.activeDocument);
  const config = DOCUMENTS[state.activeDocument];
  if (!source || !config) return;

  const previewDocument = new DOMParser().parseFromString(source, "text/html");
  previewDocument.querySelectorAll("script, meta[http-equiv='refresh']").forEach((element) => element.remove());
  const base = previewDocument.createElement("base");
  base.href = new URL(config.previewPath, window.location.href).href;
  previewDocument.head.prepend(base);
  elements.previewFrame.dataset.document = state.activeDocument;
  elements.previewFrame.srcdoc = `<!doctype html>\n${previewDocument.documentElement.outerHTML}`;
};

const handleFieldInput = (control, field, fieldElement) => {
  const documentKey = state.activeDocument;
  const key = fieldKey(documentKey, field.id);
  const value = control.innerHTML;
  let validationError = "";
  try {
    validateFieldValue(field, value);
    state.invalidFields.delete(key);
  } catch (error) {
    validationError = error.message || "허용되지 않는 서식이 포함되어 있습니다.";
    state.invalidFields.set(key, validationError);
  }

  const documentChanges = getDocumentChanges(documentKey, true);
  if (value === field.originalHtml) {
    documentChanges.delete(field.id);
    state.conflicts.delete(key);
    if (!documentChanges.size) state.changes.delete(documentKey);
  } else {
    documentChanges.set(field.id, { original: field.originalHtml, value });
    state.conflicts.delete(key);
  }

  const plainLength = toPlainText(value).length;
  const originalLength = Math.max(toPlainText(field.originalHtml).length, 1);
  const overlong = plainLength > Math.max(originalLength * 1.35, originalLength + 35);
  fieldElement.classList.toggle("is-invalid", Boolean(validationError));
  fieldElement.classList.toggle("is-conflict", state.conflicts.has(key));
  fieldElement.classList.toggle("is-overlong", overlong);
  const meta = fieldElement.querySelector("[data-field-meta]");
  if (validationError) {
    meta.textContent = validationError;
  } else if (overlong) {
    meta.textContent = `${plainLength}자 · 원문보다 길어 PDF 줄바꿈을 확인해 주세요.`;
  } else {
    meta.textContent = `${plainLength}자`;
  }

  if (!validationError) updatePreviewField(field, value);
  if (state.conflicts.size) {
    showAdminError(
      `최신 원본과 겹친 문구가 ${state.conflicts.size}개 있습니다. 문서와 섹션의 표시를 따라가 내용을 다시 확인해 주세요.`,
      "최신 원본과 충돌한 문구가 있습니다.",
    );
  } else if (state.invalidFields.size) {
    showAdminError(
      `형식을 확인해야 하는 문구가 ${state.invalidFields.size}개 있습니다. 표시된 문구를 다시 입력해 주세요.`,
      "문구 형식을 확인해 주세요.",
    );
  } else {
    clearAdminError();
  }
  updateConflictIndicators();
  updateGlobalStatus();
  saveDraft();
};

const renderEditorFields = () => {
  const model = state.models.get(state.activeDocument);
  if (!model) return;
  const query = elements.search.value.trim().toLocaleLowerCase("ko");
  const activeSectionId = state.activeSections[state.activeDocument];
  const visibleFields = model.fields.filter((field) => {
    if (query) {
      const workingText = toPlainText(getFieldValue(state.activeDocument, field)).toLocaleLowerCase("ko");
      return field.searchText.includes(query) || workingText.includes(query) || field.id.includes(query);
    }
    return field.sectionId === activeSectionId;
  });

  const fragment = document.createDocumentFragment();
  visibleFields.forEach((field) => {
    const value = getFieldValue(state.activeDocument, field);
    const plainLength = toPlainText(value).length;
    const originalLength = Math.max(toPlainText(field.originalHtml).length, 1);
    const compactTag = ["h1", "h2", "h3", "h4", "time", "div", "b", "span"].includes(field.tagName);
    const compactCopy = ["p", "li", "dt", "dd"].includes(field.tagName) && plainLength <= 60;
    const singleLine = !value.includes("<br") && (compactTag || compactCopy);
    const key = fieldKey(state.activeDocument, field.id);

    const fieldElement = document.createElement("article");
    fieldElement.className = "editor-field";
    fieldElement.dataset.editId = field.id;
    fieldElement.classList.toggle("is-conflict", state.conflicts.has(key));
    fieldElement.classList.toggle("is-invalid", state.invalidFields.has(key));
    fieldElement.classList.toggle(
      "is-overlong",
      plainLength > Math.max(originalLength * 1.35, originalLength + 35),
    );

    const header = document.createElement("div");
    header.className = "editor-field-head";
    const label = document.createElement("span");
    label.className = "editor-field-label";
    label.id = `label-${field.id}`;
    label.textContent = field.label;
    const code = document.createElement("span");
    code.className = "editor-field-meta";
    code.textContent = field.id;
    header.append(label, code);

    const control = document.createElement("div");
    control.className = "editor-control";
    control.id = `control-${field.id}`;
    control.contentEditable = "true";
    control.role = "textbox";
    control.spellcheck = true;
    control.dataset.singleLine = singleLine ? "true" : "false";
    control.setAttribute("aria-labelledby", label.id);
    control.setAttribute("aria-multiline", singleLine ? "false" : "true");
    control.innerHTML = value;

    const message = document.createElement("small");
    message.dataset.fieldMeta = "";
    if (state.conflicts.has(key)) {
      message.textContent = "최신 원본과 겹친 문구입니다. 내용을 확인하고 다시 입력해 주세요.";
    } else if (state.invalidFields.has(key)) {
      message.textContent = state.invalidFields.get(key);
    } else if (fieldElement.classList.contains("is-overlong")) {
      message.textContent = `${plainLength}자 · 원문보다 길어 PDF 줄바꿈을 확인해 주세요.`;
    } else {
      message.textContent = `${plainLength}자`;
    }

    control.addEventListener("focus", () => selectPreviewField(field.id));
    control.addEventListener("click", (event) => {
      if (event.target.closest("a")) event.preventDefault();
      selectPreviewField(field.id, { scroll: false });
    });
    control.addEventListener("beforeinput", (event) => {
      if (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak") {
        event.preventDefault();
        if (!singleLine) insertPlainText(control, "\n", false);
      }
    });
    control.addEventListener("paste", (event) => {
      event.preventDefault();
      insertPlainText(control, event.clipboardData.getData("text/plain"), singleLine);
    });
    control.addEventListener("drop", (event) => event.preventDefault());
    control.addEventListener("input", () => handleFieldInput(control, field, fieldElement));

    fieldElement.append(header, control, message);
    fragment.append(fieldElement);
  });

  elements.fields.replaceChildren(fragment);
  elements.empty.hidden = visibleFields.length > 0;
  const activeSection = model.sections.find((section) => section.id === activeSectionId);
  elements.editorMeta.textContent = query
    ? `검색 결과 ${visibleFields.length}개`
    : `${activeSection?.label || model.config.name} · 문구 ${visibleFields.length}개`;
};

const renderActiveDocument = ({ reloadPreview = false } = {}) => {
  const model = state.models.get(state.activeDocument);
  if (!model) return;
  const config = model.config;

  elements.documentTabs.querySelectorAll("[data-document]").forEach((tab) => {
    const selected = tab.dataset.document === state.activeDocument;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  elements.activeDocumentNames.forEach((element) => {
    element.textContent = config.name;
  });
  elements.editorTitle.textContent = `${config.name} 문구 편집`;
  elements.search.value = "";
  renderSectionList();
  renderEditorFields();
  updateConflictIndicators();

  if (reloadPreview || elements.previewFrame.dataset.document !== state.activeDocument) {
    loadPreviewDocument();
  } else {
    applyPreview();
  }
};

const setMobileView = (view) => {
  elements.app.dataset.mobileView = view;
  const editorSelected = view === "editor";
  elements.mobileEditorTab.setAttribute("aria-selected", String(editorSelected));
  elements.mobilePreviewTab.setAttribute("aria-selected", String(!editorSelected));
  (editorSelected ? document.querySelector("#editor-pane") : document.querySelector("#preview-pane"))?.focus({
    preventScroll: true,
  });
};

const resetDraft = async () => {
  if (!countChanges() && !state.invalidFields.size && !state.conflicts.size) return;
  if (!window.confirm("저장한 모든 문구 수정을 지우고 현재 공개 원본으로 되돌릴까요?")) return;
  window.clearTimeout(saveTimer);
  saveTimer = 0;
  const storedRevisionId = readDraftEnvelope()?.revisionId;
  if (!state.serverAvailable && storedRevisionId) {
    showAdminError(
      "서버에 연결한 뒤 다시 시도해 주세요. 서버 초안을 남긴 채 브라우저 내용만 지우지는 않습니다.",
      "초안을 아직 초기화하지 않았습니다.",
    );
    setSaveState("서버 연결 필요", "error");
    return;
  }
  try {
    if (state.serverRevisionId) {
      setSaveState("초안 초기화 중", "saving");
      await syncDraftToServer(null);
    }
  } catch (error) {
    showAdminError(error.message || "서버 초안을 초기화하지 못했습니다.", "초안을 아직 초기화하지 않았습니다.");
    setSaveState("초안 초기화 실패", "error");
    return;
  }
  state.changes.clear();
  state.conflicts.clear();
  state.invalidFields.clear();
  storage.remove(DRAFT_KEY);
  clearAdminError();
  setSaveState("원본과 동일");
  renderActiveDocument();
  updateGlobalStatus();
};

const reloadContent = async () => {
  if (countChanges() && !window.confirm("저장한 초안은 유지한 채 최신 공개 원본과 다시 비교할까요?")) return;
  persistDraft();
  await flushDraftSync();
  storage.remove(CACHE_KEY);
  await loadDocuments({ force: true });
};

const setPublishFeedback = ({ message, progress, link, error = false }) => {
  elements.publishStatus.textContent = message;
  elements.publishStatus.classList.toggle("is-error", error);
  if (typeof progress === "number") {
    elements.publishProgress.hidden = false;
    elements.publishProgress.value = progress;
  }
  if (link) {
    elements.publishRunLink.href = link;
    elements.publishRunLink.hidden = false;
  }
};

const friendlyPublishError = (error) => {
  if (error.status === 401) return "로그인 세션이 만료되었습니다. 다시 로그인해 주세요.";
  if (error.status === 403) return "게시 권한을 확인하지 못했습니다.";
  if (error.status === 409) return "공개 원본이나 초안이 바뀌었습니다. 다시 불러온 뒤 확인해 주세요.";
  return error.message || "게시 중 오류가 발생했습니다.";
};

const pollPublishJob = async (initialJob) => {
  const deadline = Date.now() + 45 * 60 * 1000;
  let job = initialJob;
  while (Date.now() < deadline) {
    if (["published", "warning", "failed"].includes(job.status)) return job;
    setPublishFeedback({
      message: job.message,
      progress: job.progress,
      link: job.htmlUrl,
    });
    await sleep(6000);
    try {
      const response = await adminRequest(`/publish/${encodeURIComponent(job.id)}/`);
      job = response.job;
    } catch (error) {
      if ([401, 403, 404, 409].includes(error.status)) throw error;
      setPublishFeedback({
        message: "서버 연결을 다시 시도하고 있습니다. 이 창을 닫아도 다음 접속에서 이어집니다.",
        progress: job.progress,
        link: job.htmlUrl,
        error: true,
      });
    }
  }
  throw new Error("게시 검증이 45분 안에 끝나지 않았습니다. GitHub Actions에서 진행 상황을 확인해 주세요.");
};

const setPublishControlsLocked = (locked) => {
  elements.publishSubmit.disabled = locked;
  elements.publishCancel.disabled = locked;
  document.querySelectorAll("[data-dialog-cancel]").forEach((button) => {
    button.disabled = locked;
  });
};

const completePublishJob = async (job) => {
  if (job.status === "failed") {
    const error = new Error(job.error || job.message);
    error.terminal = true;
    error.htmlUrl = job.htmlUrl;
    throw error;
  }

  const pagesDeploymentSucceeded = job.status === "published";
  storage.remove(DRAFT_KEY);
  storage.remove(CACHE_KEY);
  storage.remove(PUBLISH_KEY);
  state.changes.clear();
  state.conflicts.clear();
  state.invalidFields.clear();
  state.serverRevisionId = null;
  state.serverRevisionVersion = null;
  setPublishFeedback({
    message: pagesDeploymentSucceeded
      ? "게시가 완료되었습니다. 공개 사이트 배포가 이어서 반영됩니다."
      : "콘텐츠와 PDF는 게시되었습니다. GitHub Pages 배포만 실패해 Actions에서 다시 실행해야 합니다.",
    progress: 100,
    link: job.htmlUrl,
    error: !pagesDeploymentSucceeded,
  });
  await loadDocuments({ force: true });
};

const resumePublishJob = async (initialJob) => {
  if (state.publishMonitorJobId === initialJob.id) return;
  state.publishMonitorJobId = initialJob.id;
  state.publishing = true;
  setPublishControlsLocked(true);
  updateGlobalStatus();
  elements.publishProgress.hidden = false;
  if (!elements.publishDialog.open) elements.publishDialog.showModal();

  try {
    const job = await pollPublishJob(initialJob);
    await completePublishJob(job);
  } catch (error) {
    if (error.terminal) storage.remove(PUBLISH_KEY);
    setPublishFeedback({
      message: friendlyPublishError(error),
      progress: elements.publishProgress.value || 0,
      link: error.htmlUrl || initialJob.htmlUrl,
      error: true,
    });
    await loadDocuments({ force: true }).catch(() => undefined);
  } finally {
    state.publishMonitorJobId = null;
    state.publishing = false;
    setPublishControlsLocked(false);
    updateGlobalStatus();
  }
};

const publishChanges = async (event) => {
  event.preventDefault();
  if (state.publishing || elements.publishButton.disabled) return;

  state.publishing = true;
  setPublishControlsLocked(true);
  updateGlobalStatus();
  let runLink = "";

  try {
    persistDraft();
    await flushDraftSync();
    if (!state.serverAvailable || !state.serverRevisionId || !state.serverRevisionVersion) {
      throw new Error("초안이 서버에 저장되지 않았습니다. 원본을 다시 불러온 뒤 시도해 주세요.");
    }
    const rememberedPublish = storage.read(PUBLISH_KEY);
    const idempotencyKey =
      rememberedPublish?.revisionId === state.serverRevisionId &&
      typeof rememberedPublish.idempotencyKey === "string"
        ? rememberedPublish.idempotencyKey
        : window.crypto.randomUUID();
    storage.write(PUBLISH_KEY, {
      revisionId: state.serverRevisionId,
      idempotencyKey,
    });
    setPublishFeedback({ message: "서버에서 최신 원본과 초안을 비교하고 있습니다.", progress: 12 });
    const response = await adminRequest("/publish/", {
      method: "POST",
      body: {
        revisionId: state.serverRevisionId,
        revisionVersion: state.serverRevisionVersion,
        idempotencyKey,
      },
    });
    const job = await pollPublishJob(response.job);
    runLink = job.htmlUrl || "";
    await completePublishJob(job);
  } catch (error) {
    if (error.terminal || error.status) storage.remove(PUBLISH_KEY);
    setPublishFeedback({
      message: friendlyPublishError(error),
      progress: elements.publishProgress.value || 0,
      link: runLink,
      error: true,
    });
    await loadDocuments({ force: true }).catch(() => undefined);
  } finally {
    if (!state.publishMonitorJobId) {
      state.publishing = false;
      setPublishControlsLocked(false);
      updateGlobalStatus();
    }
  }
};

const openPublishDialog = () => {
  if (elements.publishButton.disabled) return;
  persistDraft();
  elements.publishProgress.hidden = true;
  elements.publishProgress.value = 0;
  elements.publishRunLink.hidden = true;
  elements.publishStatus.classList.remove("is-error");
  elements.publishStatus.textContent = `${countChanges()}개 문구를 검증한 뒤 HTML과 PDF를 함께 게시합니다.`;
  elements.publishDialog.showModal();
  window.setTimeout(() => elements.publishSubmit.focus(), 0);
};

elements.documentTabs.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-document]");
  if (!tab || tab.dataset.document === state.activeDocument || !DOCUMENTS[tab.dataset.document]) return;
  state.activeDocument = tab.dataset.document;
  state.selectedEditId = "";
  renderActiveDocument({ reloadPreview: true });
});
elements.documentTabs.addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  const tabs = [...elements.documentTabs.querySelectorAll("[data-document]")];
  const currentIndex = tabs.indexOf(document.activeElement);
  if (currentIndex < 0) return;
  event.preventDefault();
  const direction = event.key === "ArrowRight" ? 1 : -1;
  tabs[(currentIndex + direction + tabs.length) % tabs.length].click();
  tabs[(currentIndex + direction + tabs.length) % tabs.length].focus();
});
elements.search.addEventListener("input", renderEditorFields);
elements.previewFrame.addEventListener("load", applyPreview);
document.querySelector(".preview-controls").addEventListener("click", (event) => {
  const button = event.target.closest("[data-preview-mode]");
  if (!button) return;
  const mode = button.dataset.previewMode;
  elements.previewStage.dataset.mode = mode;
  document.querySelectorAll("[data-preview-mode]").forEach((candidate) => {
    candidate.setAttribute("aria-pressed", String(candidate === button));
  });
});
elements.mobileEditorTab.addEventListener("click", () => setMobileView("editor"));
elements.mobilePreviewTab.addEventListener("click", () => setMobileView("preview"));
elements.resetDraft.addEventListener("click", resetDraft);
elements.reloadContent.addEventListener("click", reloadContent);
elements.publishButton.addEventListener("click", openPublishDialog);
elements.publishForm.addEventListener("submit", publishChanges);
elements.publishCancel.addEventListener("click", () => {
  if (!state.publishing) elements.publishDialog.close();
});
document.querySelectorAll("[data-dialog-cancel]").forEach((button) => {
  button.addEventListener("click", () => {
    if (!state.publishing) elements.publishDialog.close();
  });
});
elements.publishDialog.addEventListener("cancel", (event) => {
  if (state.publishing) event.preventDefault();
});
window.addEventListener("storage", (event) => {
  if (event.key === DRAFT_KEY && !state.publishing) loadDocuments();
});
window.addEventListener("pagehide", persistDraft);

updateGlobalStatus();
loadDocuments();
