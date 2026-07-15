import {
  assertEditableOnlyChanges,
  inferEditableTimeDatetime,
  replaceEditableContents,
  scanEditableRegions,
  validateInlineHtml,
} from "./editor-core.js";

const REPOSITORY = "ch4570/ch4570-archive";
const REPOSITORY_OWNER_ID = 91787050;
const MAIN_BRANCH = "main";
const API_VERSION = "2026-03-10";
const API_ROOT = `https://api.github.com/repos/${REPOSITORY}`;
const DRAFT_KEY = "ch4570-copy-admin-draft-v1";
const CACHE_KEY = "ch4570-copy-admin-source-v1";
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

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const isLocalDevelopment = LOCAL_HOSTS.has(window.location.hostname);
const state = {
  activeDocument: "resume",
  activeSections: {},
  sources: new Map(),
  models: new Map(),
  changes: new Map(),
  conflicts: new Set(),
  invalidFields: new Map(),
  selectedEditId: "",
  loading: true,
  publishing: false,
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
  githubToken: document.querySelector("#github-token"),
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
    isLocalDevelopment ||
    changeTotal === 0 ||
    state.invalidFields.size > 0 ||
    state.conflicts.size > 0;
  elements.publishButton.disabled = blocked;
  if (isLocalDevelopment) {
    elements.publishButton.title = "실제 배포 주소의 관리자 화면에서 게시할 수 있습니다.";
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
const persistDraft = () => {
  window.clearTimeout(saveTimer);
  saveTimer = 0;
  const changeTotal = countChanges();
  const saved = changeTotal === 0 ? (storage.remove(DRAFT_KEY), true) : storage.write(DRAFT_KEY, serializeDraft());
  if (saved) {
    setSaveState(changeTotal ? "브라우저에 초안 저장됨" : "원본과 동일");
  } else {
    setSaveState("초안을 저장하지 못함", "error");
  }
  updateGlobalStatus();
  return saved;
};

const saveDraft = () => {
  window.clearTimeout(saveTimer);
  setSaveState("저장 중", "saving");
  saveTimer = window.setTimeout(persistDraft, 140);
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

const fetchSource = async (documentConfig) => {
  const url = new URL(`../${documentConfig.path}`, import.meta.url);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${documentConfig.name} 원본을 불러오지 못했습니다. (${response.status})`);
  return response.text();
};

const fetchBundle = async ({ force = false } = {}) => {
  const cached = storage.read(CACHE_KEY);
  let sources;
  let fromCache = false;
  try {
    const entries = await Promise.all(
      Object.values(DOCUMENTS).map(async (documentConfig) => [
        documentConfig.key,
        await fetchSource(documentConfig),
      ]),
    );
    sources = Object.fromEntries(entries);
  } catch (error) {
    if (!cached?.sources) throw error;
    sources = cached.sources;
    fromCache = true;
  }

  if (!isLocalDevelopment || force) {
    storage.write(CACHE_KEY, { sources, savedAt: new Date().toISOString() });
  }
  return { sources, fromCache };
};

const restoreDraft = (draft) => {
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
};

const loadDocuments = async ({ force = false } = {}) => {
  state.loading = true;
  updateGlobalStatus();
  clearAdminError();
  elements.fields.setAttribute("aria-busy", "true");
  setSaveState("원본 불러오는 중", "saving");

  try {
    const draft = storage.read(DRAFT_KEY);
    const bundle = await fetchBundle({ force });
    state.sources.clear();
    state.models.clear();

    for (const documentConfig of Object.values(DOCUMENTS)) {
      const source = bundle.sources[documentConfig.key];
      const model = buildDocumentModel(source, documentConfig);
      state.sources.set(documentConfig.key, source);
      state.models.set(documentConfig.key, model);
      state.activeSections[documentConfig.key] ||= model.sections[0]?.id || "";
    }

    restoreDraft(draft);
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
    } else if (bundle.fromCache) {
      setSaveState(countChanges() ? "저장된 초안 복원됨" : "저장된 원본 사용 중");
    } else {
      setSaveState(countChanges() ? "저장된 초안 복원됨" : "최신 원본");
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

const resetDraft = () => {
  if (!countChanges() && !state.invalidFields.size && !state.conflicts.size) return;
  if (!window.confirm("브라우저에 저장한 모든 문구 수정을 지우고 현재 공개 원본으로 되돌릴까요?")) return;
  window.clearTimeout(saveTimer);
  saveTimer = 0;
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
  if (countChanges() && !window.confirm("저장한 초안은 유지한 채 GitHub의 최신 원본과 다시 비교할까요?")) return;
  persistDraft();
  storage.remove(CACHE_KEY);
  await loadDocuments({ force: true });
};

const githubRequest = async (path, token, { method = "GET", body } = {}) => {
  const response = await fetch(path.startsWith("http") ? path : `${API_ROOT}${path}`, {
    method,
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": API_VERSION,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
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
    const error = new Error(payload?.message || `GitHub 요청이 실패했습니다. (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return payload;
};

const decodeBase64Utf8 = (encoded) => {
  const binary = window.atob(encoded.replace(/\s+/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const buildTrustedWorkingSources = async (token, baseSha) => {
  const workingSources = new Map();
  for (const [documentKey, changes] of state.changes) {
    if (!changes.size) continue;
    const documentConfig = DOCUMENTS[documentKey];
    const content = await githubRequest(
      `/contents/${documentConfig.path}?ref=${encodeURIComponent(baseSha)}`,
      token,
    );
    if (content?.type !== "file" || content.encoding !== "base64" || typeof content.content !== "string") {
      throw new Error(`${documentConfig.name} 원본을 GitHub에서 확인하지 못했습니다.`);
    }
    const source = decodeBase64Utf8(content.content);
    const trustedRegions = new Map(scanEditableRegions(source).map((region) => [region.id, region]));
    for (const [id, change] of changes) {
      if (trustedRegions.get(id)?.innerHTML !== change.original) {
        const error = new Error(`${id} 문구의 원본이 바뀌었습니다.`);
        error.status = 409;
        throw error;
      }
    }
    const replacements = new Map([...changes].map(([id, change]) => [id, change.value]));
    const workingSource = replaceEditableContents(source, replacements);
    assertEditableOnlyChanges(source, workingSource);
    workingSources.set(documentKey, workingSource);
  }
  return workingSources;
};

const deleteDraftRef = async (token, draftRef, expectedSha) => {
  const refPath = draftRef.replace(/^refs\//u, "");
  let currentRef;
  try {
    currentRef = await githubRequest(`/git/ref/${refPath}`, token);
  } catch (error) {
    if (error.status === 404) return true;
    throw error;
  }
  if (currentRef.object.sha !== expectedSha) return false;
  await githubRequest(`/git/refs/${refPath}`, token, { method: "DELETE" });
  return true;
};

const randomDraftRef = () => {
  const bytes = new Uint8Array(4);
  window.crypto.getRandomValues(bytes);
  const suffix = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `refs/heads/content-drafts/admin-${timestamp}-${suffix}`;
};

const draftCommitMessage = (changeTotal) => `Stage owner-authored application copy

Prepare ${changeTotal} reviewed copy block${changeTotal === 1 ? "" : "s"} for the guarded publication workflow.

Constraint: Editable prose only; layout and diagram markup remain locked
Confidence: high
Scope-risk: narrow
Reversibility: clean
Tested: Client-side editable-boundary validation and live preview
Not-tested: PDF pagination before the publication workflow`;

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
  if (error.status === 401) return "GitHub 토큰을 확인해 주세요. 토큰은 저장되지 않았습니다.";
  if (error.status === 403) return "토큰에 이 저장소의 Contents·Actions 쓰기 권한이 있는지 확인해 주세요.";
  if (error.status === 409) return "게시하는 동안 원본이 바뀌었습니다. 원본을 다시 불러온 뒤 확인해 주세요.";
  if (error.status === 422) return "GitHub가 초안 브랜치를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.";
  return error.message || "게시 중 오류가 발생했습니다.";
};

const pollWorkflow = async (runUrl, token) => {
  const deadline = Date.now() + 45 * 60 * 1000;
  while (Date.now() < deadline) {
    const run = await githubRequest(runUrl, token);
    if (run.status === "completed") return run;
    const message = run.status === "queued" ? "게시 작업이 대기 중입니다." : "문구와 PDF를 검증하고 있습니다.";
    setPublishFeedback({ message, progress: run.status === "queued" ? 58 : 72, link: run.html_url });
    await sleep(6000);
  }
  throw new Error("게시 검증이 45분 안에 끝나지 않았습니다. GitHub Actions에서 진행 상황을 확인해 주세요.");
};

const publishChanges = async (event) => {
  event.preventDefault();
  if (state.publishing || elements.publishButton.disabled) return;

  const token = elements.githubToken.value.trim();
  elements.githubToken.value = "";
  if (!token) {
    setPublishFeedback({ message: "GitHub 토큰을 입력해 주세요.", progress: 0, error: true });
    elements.githubToken.focus();
    return;
  }

  state.publishing = true;
  elements.publishSubmit.disabled = true;
  elements.publishCancel.disabled = true;
  document.querySelectorAll("[data-dialog-cancel]").forEach((button) => {
    button.disabled = true;
  });
  updateGlobalStatus();
  let runLink = "";
  let draftRef = "";
  let draftCommitSha = "";
  let workflowStarted = false;

  try {
    setPublishFeedback({ message: "GitHub 계정을 확인하고 있습니다.", progress: 5 });
    const user = await githubRequest("https://api.github.com/user", token);
    if (user.id !== REPOSITORY_OWNER_ID) {
      const error = new Error("이 저장소 소유자 계정의 토큰만 사용할 수 있습니다.");
      error.status = 401;
      throw error;
    }

    setPublishFeedback({ message: "최신 원본과 초안을 비교하고 있습니다.", progress: 12 });
    const mainRef = await githubRequest(`/git/ref/heads/${MAIN_BRANCH}`, token);
    const publishBaseSha = mainRef.object.sha;
    const workingSources = await buildTrustedWorkingSources(token, publishBaseSha);
    const baseCommit = await githubRequest(`/git/commits/${publishBaseSha}`, token);
    setPublishFeedback({ message: "검증용 초안을 만들고 있습니다.", progress: 22 });

    const treeEntries = await Promise.all(
      [...workingSources].map(async ([documentKey, source]) => {
        const blob = await githubRequest("/git/blobs", token, {
          method: "POST",
          body: { content: source, encoding: "utf-8" },
        });
        return {
          path: DOCUMENTS[documentKey].path,
          mode: "100644",
          type: "blob",
          sha: blob.sha,
        };
      }),
    );
    const tree = await githubRequest("/git/trees", token, {
      method: "POST",
      body: { base_tree: baseCommit.tree.sha, tree: treeEntries },
    });
    const draftCommit = await githubRequest("/git/commits", token, {
      method: "POST",
      body: {
        message: draftCommitMessage(countChanges()),
        tree: tree.sha,
        parents: [publishBaseSha],
      },
    });
    draftCommitSha = draftCommit.sha;
    draftRef = randomDraftRef();
    await githubRequest("/git/refs", token, {
      method: "POST",
      body: { ref: draftRef, sha: draftCommit.sha },
    });

    setPublishFeedback({ message: "자동 검증과 PDF 생성을 시작합니다.", progress: 48 });
    const dispatch = await githubRequest("/actions/workflows/publish-content.yml/dispatches", token, {
      method: "POST",
      body: {
        ref: MAIN_BRANCH,
        inputs: {
          draft_ref: draftRef,
          draft_sha: draftCommit.sha,
          base_sha: publishBaseSha,
        },
      },
    });
    if (!dispatch?.workflow_run_id || !dispatch?.run_url) {
      throw new Error("게시 작업 ID를 받지 못했습니다. GitHub Actions에서 실행 여부를 확인해 주세요.");
    }
    workflowStarted = true;
    runLink = dispatch.html_url;
    setPublishFeedback({ message: "게시 작업이 대기 중입니다.", progress: 55, link: runLink });

    const run = await pollWorkflow(dispatch.run_url, token);
    runLink = run.html_url || runLink;
    let pagesDeploymentSucceeded = true;
    if (run.conclusion !== "success") {
      const jobs = await githubRequest(run.jobs_url, token);
      const publishJob = jobs.jobs?.find((job) => job.name === "publish");
      if (publishJob?.conclusion !== "success") {
        throw new Error(`자동 검증이 통과하지 못했습니다. (${run.conclusion || "unknown"})`);
      }
      pagesDeploymentSucceeded = false;
    }

    await deleteDraftRef(token, draftRef, draftCommitSha).catch(() => false);

    storage.remove(DRAFT_KEY);
    storage.remove(CACHE_KEY);
    state.changes.clear();
    state.conflicts.clear();
    state.invalidFields.clear();
    setPublishFeedback({
      message: pagesDeploymentSucceeded
        ? "게시가 완료되었습니다. 공개 사이트 배포가 이어서 반영됩니다."
        : "콘텐츠와 PDF는 게시되었습니다. GitHub Pages 배포만 실패해 Actions에서 다시 실행해야 합니다.",
      progress: 100,
      link: runLink,
      error: !pagesDeploymentSucceeded,
    });
    await loadDocuments({ force: true });
  } catch (error) {
    if (draftRef && !workflowStarted) {
      await deleteDraftRef(token, draftRef, draftCommitSha).catch(() => false);
    }
    setPublishFeedback({
      message: friendlyPublishError(error),
      progress: elements.publishProgress.value || 0,
      link: runLink,
      error: true,
    });
  } finally {
    state.publishing = false;
    elements.publishSubmit.disabled = false;
    elements.publishCancel.disabled = false;
    document.querySelectorAll("[data-dialog-cancel]").forEach((button) => {
      button.disabled = false;
    });
    updateGlobalStatus();
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
  window.setTimeout(() => elements.githubToken.focus(), 0);
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
