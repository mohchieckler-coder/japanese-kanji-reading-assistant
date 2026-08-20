import kuromoji from "kuromoji";
import { buildAnnotationSegments, containsKanji } from "./core.mjs";
import {
  FOREIGN_PERSON_NAMES,
  getForeignPersonNameParts,
  PERSON_COUNTRY_HINTS,
  PERSON_ROLE_HINTS
} from "./person-name-readings.mjs";

const CONTROLLER_KEY = "__japaneseFuriganaAiController__";
const RUBY_ATTRIBUTE = "data-jp-furigana";
const FOREIGN_PERSON_RUBY_ATTRIBUTE = "data-jp-foreign-person";
const STYLE_ID = "jp-furigana-ai-style";
const TOAST_ID = "jp-furigana-ai-toast";
const TRANSLATION_CONTROLLER_KEY = "__japaneseSelectionTranslationController__";
const TRANSLATION_UI_ATTRIBUTE = "data-jp-translation-ui";
const TRANSLATION_CONTROLLER_ATTRIBUTE = "data-jp-translation-controller";
const CONTENT_BUILD_VERSION = "__EXTENSION_VERSION__";
const MAX_TRANSLATION_CHARACTERS = 12000;
const SKIPPED_SELECTOR = [
  "script",
  "style",
  "noscript",
  "textarea",
  "input",
  "select",
  "option",
  "button",
  "code",
  "pre",
  "kbd",
  "samp",
  "ruby",
  "rt",
  "rp",
  "svg",
  "math",
  `[${TRANSLATION_UI_ATTRIBUTE}]`,
  "[hidden]",
  "[aria-hidden='true']",
  "[contenteditable]:not([contenteditable='false'])"
].join(",");
const CONTEXT_CANDIDATE_PATTERN = /[日月火水木金土雨笑泣辛後立主人妊娠高血圧腎症博士課程本研究幹細胞頭頸部浸透初相転移平均場自治厨売時骨髄協働既読公録昨夏中巨非常]/u;
const CONTEXT_MUTATION_PATTERN = /[()（）0-9０-９日月火水木金土]/u;
const escapeRegularExpression = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const foreignPersonNameCharacters = [...new Set(
  FOREIGN_PERSON_NAMES.flatMap((entry) => entry.surfaces.flatMap((surface) => Array.from(surface)))
)];
const foreignPersonMutationTerms = [...new Set([
  ...FOREIGN_PERSON_NAMES.flatMap((entry) => [
    ...entry.surfaces,
    ...entry.roleHints,
    ...entry.blockedSuffixes
  ]),
  ...Object.values(PERSON_COUNTRY_HINTS).flat(),
  ...PERSON_ROLE_HINTS
])].filter(Boolean).sort((left, right) => right.length - left.length);
const FOREIGN_PERSON_CONTEXT_PATTERN = new RegExp(
  foreignPersonNameCharacters.map(escapeRegularExpression).join("|"),
  "u"
);
const FOREIGN_PERSON_MUTATION_PATTERN = new RegExp(
  foreignPersonMutationTerms.map(escapeRegularExpression).join("|"),
  "u"
);
const FOREIGN_PERSON_SURFACE_PATTERN = new RegExp(
  FOREIGN_PERSON_NAMES.flatMap((entry) => entry.surfaces)
    .sort((left, right) => right.length - left.length)
    .map(escapeRegularExpression)
    .join("|"),
  "u"
);
const foreignPersonAnnotationSignatures = new Set(
  FOREIGN_PERSON_NAMES.flatMap((entry) => entry.surfaces.flatMap((surface) =>
    getForeignPersonNameParts(entry, surface).map((part) => `${part.surface}\u0000${part.reading}`)
  ))
);
const CONTEXT_CHARACTER_LIMIT = 48;
const CONTEXT_NODE_LIMIT = 64;
const INLINE_DISPLAYS = new Set(["inline", "inline-block", "inline-flex", "inline-grid", "contents"]);
const SEMANTIC_INLINE_TAGS = new Set([
  "A",
  "ABBR",
  "B",
  "BDI",
  "BDO",
  "CITE",
  "EM",
  "I",
  "LABEL",
  "MARK",
  "Q",
  "S",
  "SMALL",
  "SPAN",
  "STRONG",
  "SUB",
  "SUP",
  "TIME",
  "U"
]);
const HARD_BOUNDARY_TAGS = new Set([
  "BR",
  "HR",
  "IMG",
  "PICTURE",
  "VIDEO",
  "AUDIO",
  "CANVAS",
  "IFRAME",
  "OBJECT",
  "EMBED"
]);
const TRANSLATION_BLOCK_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DD",
  "DIV",
  "DL",
  "DT",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "SECTION",
  "TABLE",
  "TD",
  "TH",
  "TR",
  "UL"
]);

function containsContextCandidate(value) {
  return CONTEXT_CANDIDATE_PATTERN.test(value) || FOREIGN_PERSON_CONTEXT_PATTERN.test(value);
}

function containsContextMutation(value) {
  return CONTEXT_MUTATION_PATTERN.test(value) || FOREIGN_PERSON_MUTATION_PATTERN.test(value);
}

function appendSelectionFragmentText(node, chunks) {
  if (node.nodeType === Node.TEXT_NODE) {
    chunks.push(node.nodeValue || "");
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    Array.from(node.childNodes || []).forEach((child) => appendSelectionFragmentText(child, chunks));
    return;
  }

  const element = node;
  if (
    element.matches(`rt, rp, [${TRANSLATION_UI_ATTRIBUTE}]`)
    || element.closest(`[${TRANSLATION_UI_ATTRIBUTE}]`)
  ) {
    return;
  }
  if (element.tagName === "BR") {
    chunks.push("\n");
    return;
  }

  Array.from(element.childNodes).forEach((child) => appendSelectionFragmentText(child, chunks));
  if (TRANSLATION_BLOCK_TAGS.has(element.tagName) && !chunks.at(-1)?.endsWith("\n")) {
    chunks.push("\n");
  }
}

function getSelectedSourceText(selection, range) {
  const fragment = range.cloneContents();
  if (!fragment.querySelector?.("rt, rp")) {
    return selection.toString().trim();
  }

  const chunks = [];
  Array.from(fragment.childNodes).forEach((node) => appendSelectionFragmentText(node, chunks));
  return chunks.join("").trim();
}

function classifySelection(text) {
  const sentenceEndCount = (text.match(/(?:。|[！？!?]+)/gu) || []).length;
  if (/\r|\n/u.test(text) || sentenceEndCount >= 2 || text.length >= 180) {
    return "paragraph";
  }
  if (sentenceEndCount === 1 || /\s/u.test(text) || text.length >= 24) {
    return "sentence";
  }
  return "word";
}

function selectionTypeLabel(selectionType) {
  if (selectionType === "paragraph") {
    return "段落";
  }
  if (selectionType === "sentence") {
    return "句子";
  }
  return "词语";
}

function getUsableRangeRect(range) {
  const rects = Array.from(range.getClientRects());
  const rect = [...rects].reverse().find((item) => item.width > 0 || item.height > 0)
    || range.getBoundingClientRect();
  if (!rect || (!rect.width && !rect.height)) {
    return null;
  }
  return {
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
    width: rect.width,
    height: rect.height
  };
}

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) {
        return;
      }
      settled = true;
      callback(value);
    };
    try {
      const possiblePromise = chrome.runtime.sendMessage(message, (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          finish(reject, new Error(runtimeError.message));
          return;
        }
        finish(resolve, response);
      });
      if (possiblePromise?.then) {
        possiblePromise.then(
          (response) => finish(resolve, response),
          (error) => finish(reject, error)
        );
      }
    } catch (error) {
      finish(reject, error);
    }
  });
}

function normalizeTokenUsage(payload) {
  const usage = payload?.usage || payload?.tokenUsage || payload?.tokens || {};
  const inputTokens = Number(usage.inputTokens ?? usage.input_tokens ?? usage.promptTokens ?? usage.prompt_tokens);
  const outputTokens = Number(usage.outputTokens ?? usage.output_tokens ?? usage.completionTokens ?? usage.completion_tokens);
  const explicitTotal = Number(usage.totalTokens ?? usage.total_tokens ?? usage.total);
  const hasInput = Number.isFinite(inputTokens);
  const hasOutput = Number.isFinite(outputTokens);
  const totalTokens = Number.isFinite(explicitTotal)
    ? explicitTotal
    : hasInput || hasOutput
      ? (hasInput ? inputTokens : 0) + (hasOutput ? outputTokens : 0)
      : null;
  return {
    inputTokens: hasInput ? inputTokens : null,
    outputTokens: hasOutput ? outputTokens : null,
    totalTokens
  };
}

function getTranslationPayload(response) {
  const payload = response?.data || response?.result || response;
  const responseErrorCode = response?.error?.code || response?.code || payload?.error?.code || payload?.code;
  if (
    !response
    || response.ok === false
    || response.success === false
    || payload?.ok === false
    || response?.error
    || /CONFIG_REQUIRED|HOST_PERMISSION_REQUIRED/u.test(String(responseErrorCode || "").toUpperCase())
  ) {
    const errorValue = response?.error || payload?.error || response;
    const error = new Error(
      typeof errorValue === "string"
        ? errorValue
        : errorValue?.message || response?.message || "翻译服务没有返回有效结果。"
    );
    error.code = errorValue?.code || response?.code || payload?.code || "TRANSLATION_FAILED";
    throw error;
  }

  const translation = payload?.translation
    ?? payload?.translatedText
    ?? payload?.translated_text
    ?? payload?.text
    ?? payload?.content;
  if (typeof translation !== "string" || !translation.trim()) {
    const error = new Error("翻译服务没有返回译文，请重试。");
    error.code = "EMPTY_TRANSLATION";
    throw error;
  }
  return {
    translation: translation.trim(),
    targetLanguage: payload?.targetLanguage
      ?? payload?.target_language
      ?? payload?.target
      ?? response?.targetLanguage
      ?? "目标语言",
    selectionType: payload?.selectionType,
    usage: normalizeTokenUsage(payload)
  };
}

function sanitizeTranslationErrorMessage(value) {
  return String(value || "")
    .replace(/\b(?:sk|key)-[A-Za-z0-9_-]{8,}\b/giu, "[已隐藏]")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/giu, "Bearer [已隐藏]")
    .slice(0, 240);
}

function describeTranslationError(error) {
  const code = String(error?.code || "").toUpperCase();
  const message = sanitizeTranslationErrorMessage(error?.message || error);
  if (/CONFIG_REQUIRED|API_KEY_MISSING|API_KEY_(?:NOT_)?CONFIGURED|NOT_CONFIGURED/u.test(code + message.toUpperCase())) {
    return {
      message: "尚未配置翻译 API。请打开管理面板填写 OpenAI 兼容 API Key、BaseURL 和模型。",
      showOptions: true
    };
  }
  if (/HOST_PERMISSION_REQUIRED|HOST_PERMISSION|PERMISSION_DENIED/u.test(code + message.toUpperCase())) {
    return {
      message: "当前 API BaseURL 尚未获得访问权限。请打开管理面板检查地址并完成授权。",
      showOptions: true
    };
  }
  if (/AUTHENTICATION_FAILED|API_ACCESS_DENIED|UNAUTHORIZED|FORBIDDEN|\b401\b|\b403\b/u.test(code + message.toUpperCase())) {
    return {
      message: "API 鉴权失败。请打开管理面板检查 API Key、BaseURL 和服务权限。",
      showOptions: true
    };
  }
  if (/EXTENSION CONTEXT INVALIDATED|RECEIVING END DOES NOT EXIST/u.test(message.toUpperCase())) {
    return {
      message: "扩展刚刚更新，请刷新当前网页后再试。",
      showOptions: false
    };
  }
  return {
    message: message ? `翻译失败：${message}` : "翻译失败，请稍后重试。",
    showOptions: false
  };
}

class SelectionTranslationController {
  constructor() {
    this.buildVersion = CONTENT_BUILD_VERSION;
    this.host = null;
    this.shadowRoot = null;
    this.actionButton = null;
    this.card = null;
    this.cardTitle = null;
    this.typeBadge = null;
    this.status = null;
    this.targetRow = null;
    this.targetValue = null;
    this.translation = null;
    this.usage = null;
    this.copyButton = null;
    this.retryButton = null;
    this.optionsButton = null;
    this.lastSelection = null;
    this.lastRequest = null;
    this.lastTranslation = "";
    this.anchorRect = null;
    this.selectionTimer = null;
    this.requestId = 0;
    this.install();
  }

  install() {
    this.ensureUi();
    document.addEventListener("mouseup", (event) => this.handleSelectionEvent(event), true);
    document.addEventListener("keyup", (event) => this.handleSelectionEvent(event), true);
    window.addEventListener("resize", () => this.keepUiInViewport(), { passive: true });
  }

  ensureUi() {
    if (!this.host) {
      this.createUi();
    }
    if (!this.host.isConnected) {
      (document.documentElement || document).append(this.host);
    }
    document.querySelectorAll(
      `[${TRANSLATION_UI_ATTRIBUTE}][aria-live="polite"]:not([role])`
    ).forEach((element) => {
      if (element !== this.host) {
        element.remove();
      }
    });
  }

  createUi() {
    const host = document.createElement("div");
    host.setAttribute(TRANSLATION_UI_ATTRIBUTE, "");
    host.setAttribute(TRANSLATION_CONTROLLER_ATTRIBUTE, "active");
    host.setAttribute("aria-live", "polite");
    for (const [property, value] of Object.entries({
      all: "initial",
      position: "fixed",
      inset: "0 auto auto 0",
      width: "0",
      height: "0",
      overflow: "visible",
      pointerEvents: "none",
      zIndex: "2147483647"
    })) {
      host.style.setProperty(property.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`), value, "important");
    }

    const shadowRoot = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial !important; }
      *, *::before, *::after { box-sizing: border-box; }
      button { font: inherit; }
      [hidden] { display: none !important; }
      .action {
        position: fixed;
        z-index: 2147483647;
        min-height: 36px;
        padding: 8px 13px;
        border: 1px solid rgba(255,255,255,.28);
        border-radius: 999px;
        color: #fff;
        background: #175cd3;
        box-shadow: 0 8px 24px rgba(16,24,40,.28);
        cursor: pointer;
        pointer-events: auto;
        font: 600 13px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        white-space: nowrap;
      }
      .action:hover { background: #1849a9; }
      .action:focus-visible, .control:focus-visible {
        outline: 3px solid rgba(83,177,253,.55);
        outline-offset: 2px;
      }
      .card {
        position: fixed;
        z-index: 2147483647;
        width: min(390px, calc(100vw - 16px));
        max-height: min(520px, calc(100vh - 16px));
        overflow: auto;
        padding: 15px;
        border: 1px solid #d0d5dd;
        border-radius: 14px;
        color: #101828;
        background: #fff;
        box-shadow: 0 16px 48px rgba(16,24,40,.28);
        pointer-events: auto;
        font: 14px/1.55 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        text-align: left;
        word-break: break-word;
      }
      .header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
      .title { flex: 1; margin: 0; color: #101828; font-size: 15px; line-height: 1.3; font-weight: 700; }
      .badge {
        padding: 2px 8px;
        border-radius: 999px;
        color: #1849a9;
        background: #eff8ff;
        font-size: 12px;
        font-weight: 600;
      }
      .close {
        width: 30px;
        height: 30px;
        padding: 0;
        border: 0;
        border-radius: 8px;
        color: #475467;
        background: transparent;
        cursor: pointer;
        font-size: 20px;
        line-height: 1;
      }
      .close:hover { background: #f2f4f7; }
      .status { margin: 0; color: #475467; }
      .status.error { color: #b42318; }
      .target { display: flex; gap: 6px; margin-bottom: 8px; color: #667085; font-size: 12px; }
      .target strong { color: #344054; font-weight: 600; }
      .translation {
        min-height: 44px;
        max-height: 300px;
        overflow: auto;
        padding: 12px;
        border-radius: 10px;
        color: #101828;
        background: #f9fafb;
        white-space: pre-wrap;
        user-select: text;
      }
      .usage { margin-top: 8px; color: #667085; font-size: 12px; }
      .controls { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 13px; }
      .control {
        min-height: 34px;
        padding: 7px 11px;
        border: 1px solid #d0d5dd;
        border-radius: 8px;
        color: #344054;
        background: #fff;
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
      }
      .control:hover { background: #f9fafb; }
      .control.primary { border-color: #175cd3; color: #fff; background: #175cd3; }
      .control.primary:hover { background: #1849a9; }
      .control:disabled { opacity: .5; cursor: default; }
      .spinner::before {
        content: "";
        display: inline-block;
        width: 12px;
        height: 12px;
        margin-right: 7px;
        border: 2px solid #b2ccff;
        border-top-color: #175cd3;
        border-radius: 50%;
        vertical-align: -2px;
        animation: spin .8s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
    `;

    const actionButton = document.createElement("button");
    actionButton.type = "button";
    actionButton.className = "action";
    actionButton.hidden = true;
    actionButton.textContent = "翻译";
    actionButton.addEventListener("click", () => void this.translateLastSelection());

    const card = document.createElement("section");
    card.className = "card";
    card.hidden = true;
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "划词翻译结果");

    const header = document.createElement("div");
    header.className = "header";
    const cardTitle = document.createElement("h2");
    cardTitle.className = "title";
    cardTitle.textContent = "划词翻译";
    const typeBadge = document.createElement("span");
    typeBadge.className = "badge";
    typeBadge.textContent = "词语";
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "close";
    closeButton.setAttribute("aria-label", "关闭翻译结果");
    closeButton.textContent = "×";
    closeButton.addEventListener("click", () => this.hideAll());
    header.append(cardTitle, typeBadge, closeButton);

    const status = document.createElement("p");
    status.className = "status";
    status.hidden = true;

    const targetRow = document.createElement("div");
    targetRow.className = "target";
    targetRow.hidden = true;
    const targetLabel = document.createElement("span");
    targetLabel.textContent = "目标语言：";
    const targetValue = document.createElement("strong");
    targetRow.append(targetLabel, targetValue);

    const translation = document.createElement("div");
    translation.className = "translation";
    translation.hidden = true;
    translation.setAttribute("role", "document");

    const usage = document.createElement("div");
    usage.className = "usage";
    usage.hidden = true;

    const controls = document.createElement("div");
    controls.className = "controls";
    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "control primary";
    copyButton.textContent = "复制译文";
    copyButton.hidden = true;
    copyButton.addEventListener("click", () => void this.copyTranslation());
    const retryButton = document.createElement("button");
    retryButton.type = "button";
    retryButton.className = "control";
    retryButton.textContent = "重试";
    retryButton.hidden = true;
    retryButton.addEventListener("click", () => void this.retry());
    const optionsButton = document.createElement("button");
    optionsButton.type = "button";
    optionsButton.className = "control";
    optionsButton.textContent = "打开管理面板";
    optionsButton.hidden = true;
    optionsButton.addEventListener("click", () => void this.openOptions());
    controls.append(copyButton, retryButton, optionsButton);
    card.append(header, status, targetRow, translation, usage, controls);

    const protectUiInteraction = (event) => {
      event.stopPropagation();
      if (event.type === "mousedown") {
        event.preventDefault();
      }
    };
    ["pointerdown", "mousedown", "mouseup", "click", "dblclick", "keydown", "keyup"].forEach((type) => {
      shadowRoot.addEventListener(type, protectUiInteraction);
    });

    shadowRoot.append(style, actionButton, card);
    this.host = host;
    this.shadowRoot = shadowRoot;
    this.actionButton = actionButton;
    this.card = card;
    this.cardTitle = cardTitle;
    this.typeBadge = typeBadge;
    this.status = status;
    this.targetRow = targetRow;
    this.targetValue = targetValue;
    this.translation = translation;
    this.usage = usage;
    this.copyButton = copyButton;
    this.retryButton = retryButton;
    this.optionsButton = optionsButton;
  }

  isUiEvent(event) {
    return event.composedPath?.().includes(this.host) || event.target === this.host;
  }

  handleSelectionEvent(event) {
    if (this.isUiEvent(event)) {
      return;
    }
    if (event.type === "keyup" && ["Shift", "Control", "Alt", "Meta"].includes(event.key)) {
      return;
    }
    clearTimeout(this.selectionTimer);
    // A short delay lets a controller left behind by an extension reload run first;
    // ensureUi() then removes its stale, API-invalid Shadow DOM host.
    this.selectionTimer = setTimeout(() => this.updateSelection(), 16);
  }

  updateSelection() {
    this.ensureUi();
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      this.actionButton.hidden = true;
      return;
    }

    const range = selection.getRangeAt(0);
    const ancestor = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
    if (ancestor?.closest?.(`[${TRANSLATION_UI_ATTRIBUTE}]`)) {
      return;
    }

    const text = getSelectedSourceText(selection, range);
    if (!text) {
      this.actionButton.hidden = true;
      return;
    }
    const anchorRect = getUsableRangeRect(range);
    if (!anchorRect) {
      this.actionButton.hidden = true;
      return;
    }

    const selectionType = classifySelection(text);
    this.lastSelection = { text, selectionType };
    this.anchorRect = anchorRect;
    this.actionButton.textContent = `翻译${selectionTypeLabel(selectionType)}`;
    this.card.hidden = true;
    this.actionButton.hidden = false;
    this.positionElement(this.actionButton, anchorRect);
  }

  positionElement(element, anchorRect = this.anchorRect) {
    if (!anchorRect || element.hidden) {
      return;
    }
    element.style.visibility = "hidden";
    element.style.left = "8px";
    element.style.top = "8px";
    const measured = element.getBoundingClientRect();
    const width = measured.width || (element === this.card ? Math.min(390, window.innerWidth - 16) : 110);
    const height = measured.height || (element === this.card ? 180 : 36);
    const margin = 8;
    const centeredLeft = anchorRect.left + (anchorRect.width / 2) - (width / 2);
    const left = Math.max(margin, Math.min(centeredLeft, window.innerWidth - width - margin));
    const roomBelow = window.innerHeight - anchorRect.bottom;
    const preferredTop = roomBelow >= height + 12
      ? anchorRect.bottom + 8
      : anchorRect.top - height - 8;
    const top = Math.max(margin, Math.min(preferredTop, window.innerHeight - height - margin));
    element.style.left = `${Math.round(left)}px`;
    element.style.top = `${Math.round(top)}px`;
    element.style.visibility = "visible";
  }

  keepUiInViewport() {
    if (!this.actionButton?.hidden) {
      this.positionElement(this.actionButton);
    }
    if (!this.card?.hidden) {
      this.positionElement(this.card);
    }
  }

  async translateLastSelection() {
    const selected = this.lastSelection;
    if (!selected?.text.trim()) {
      return;
    }
    this.actionButton.hidden = true;
    this.lastRequest = {
      type: "TRANSLATE_TEXT",
      text: selected.text,
      selectionType: selected.selectionType,
      pageUrl: location.href,
      pageTitle: document.title
    };
    this.typeBadge.textContent = selectionTypeLabel(selected.selectionType);
    this.cardTitle.textContent = "划词翻译";
    this.card.hidden = false;
    this.positionElement(this.card);

    if (selected.text.length > MAX_TRANSLATION_CHARACTERS) {
      this.showError(
        `选中文本共 ${selected.text.length.toLocaleString()} 个字符，单次最多翻译 ${MAX_TRANSLATION_CHARACTERS.toLocaleString()} 个字符。`,
        false
      );
      return;
    }
    await this.runTranslation(this.lastRequest);
  }

  async runTranslation(request) {
    const currentRequestId = ++this.requestId;
    this.showLoading();
    try {
      const response = await sendRuntimeMessage(request);
      if (currentRequestId !== this.requestId) {
        return;
      }
      const result = getTranslationPayload(response);
      this.showResult(result);
    } catch (error) {
      if (currentRequestId !== this.requestId) {
        return;
      }
      const description = describeTranslationError(error);
      this.showError(description.message, description.showOptions);
    }
  }

  showLoading() {
    this.status.hidden = false;
    this.status.className = "status spinner";
    this.status.textContent = "正在翻译…";
    this.targetRow.hidden = true;
    this.translation.hidden = true;
    this.translation.textContent = "";
    this.usage.hidden = true;
    this.usage.textContent = "";
    this.copyButton.hidden = true;
    this.retryButton.hidden = true;
    this.optionsButton.hidden = true;
    this.positionElement(this.card);
  }

  showResult(result) {
    this.lastTranslation = result.translation;
    this.status.hidden = true;
    this.status.className = "status";
    this.targetValue.textContent = String(result.targetLanguage || "目标语言");
    this.targetRow.hidden = false;
    this.translation.textContent = result.translation;
    this.translation.hidden = false;

    const usageParts = [];
    if (result.usage.inputTokens !== null) {
      usageParts.push(`输入 ${result.usage.inputTokens.toLocaleString()}`);
    }
    if (result.usage.outputTokens !== null) {
      usageParts.push(`输出 ${result.usage.outputTokens.toLocaleString()}`);
    }
    if (result.usage.totalTokens !== null) {
      usageParts.push(`合计 ${result.usage.totalTokens.toLocaleString()}`);
    }
    this.usage.textContent = usageParts.length ? `Token：${usageParts.join(" · ")}` : "Token：服务未返回消耗数据";
    this.usage.hidden = false;
    this.copyButton.hidden = false;
    this.copyButton.disabled = false;
    this.copyButton.textContent = "复制译文";
    this.retryButton.hidden = false;
    this.optionsButton.hidden = true;
    this.positionElement(this.card);
  }

  showError(message, showOptions) {
    this.lastTranslation = "";
    this.status.hidden = false;
    this.status.className = "status error";
    this.status.textContent = message;
    this.targetRow.hidden = true;
    this.translation.hidden = true;
    this.translation.textContent = "";
    this.usage.hidden = true;
    this.copyButton.hidden = true;
    this.retryButton.hidden = false;
    this.optionsButton.hidden = !showOptions;
    this.positionElement(this.card);
  }

  async retry() {
    if (!this.lastRequest || this.lastRequest.text.length > MAX_TRANSLATION_CHARACTERS) {
      return;
    }
    await this.runTranslation(this.lastRequest);
  }

  async copyTranslation() {
    if (!this.lastTranslation) {
      return;
    }
    let copied = false;
    try {
      await navigator.clipboard.writeText(this.lastTranslation);
      copied = true;
    } catch (_error) {
      const fallback = document.createElement("textarea");
      fallback.value = this.lastTranslation;
      fallback.setAttribute("aria-hidden", "true");
      Object.assign(fallback.style, {
        position: "fixed",
        left: "-9999px",
        width: "1px",
        height: "1px",
        opacity: "0"
      });
      this.shadowRoot.append(fallback);
      fallback.select();
      try {
        copied = document.execCommand("copy");
      } finally {
        fallback.remove();
      }
    }

    if (copied) {
      this.copyButton.textContent = "已复制";
      setTimeout(() => {
        if (this.copyButton) {
          this.copyButton.textContent = "复制译文";
        }
      }, 1600);
    } else {
      this.copyButton.textContent = "复制失败";
    }
  }

  async openOptions() {
    this.optionsButton.disabled = true;
    this.optionsButton.textContent = "正在打开…";
    try {
      await sendRuntimeMessage({ type: "OPEN_TRANSLATION_OPTIONS" });
      this.optionsButton.textContent = "已打开管理面板";
    } catch (error) {
      this.status.hidden = false;
      this.status.className = "status error";
      this.status.textContent = describeTranslationError(error).message;
      this.optionsButton.textContent = "打开管理面板";
    } finally {
      this.optionsButton.disabled = false;
    }
  }

  hideAll() {
    this.requestId += 1;
    this.actionButton.hidden = true;
    this.card.hidden = true;
  }
}

function getDisplay(element, displayCache) {
  if (!displayCache.has(element)) {
    displayCache.set(element, getComputedStyle(element).display);
  }
  return displayCache.get(element);
}

function findInlineContextBoundaryFromElement(element, displayCache) {
  let current = element;
  let boundary = current;
  while (current && current !== document.body && current !== document.documentElement) {
    boundary = current;
    if (
      !SEMANTIC_INLINE_TAGS.has(current.tagName)
      && !INLINE_DISPLAYS.has(getDisplay(current, displayCache))
    ) {
      break;
    }
    current = current.parentElement;
  }
  return boundary;
}

function findInlineContextBoundary(node, displayCache) {
  return findInlineContextBoundaryFromElement(node.parentElement, displayCache);
}

function getContextRefreshRoot(target, displayCache) {
  let element = target.nodeType === Node.TEXT_NODE ? target.parentElement : target;
  if (!(element instanceof Element)) {
    return null;
  }
  const pluginRuby = element.closest(`ruby[${RUBY_ATTRIBUTE}]`);
  if (pluginRuby) {
    pluginRuby.dataset.jpOriginal = pluginRuby.firstChild?.textContent || pluginRuby.dataset.jpOriginal || "";
    element = pluginRuby.parentElement;
  }
  const boundary = findInlineContextBoundaryFromElement(element, displayCache);
  if (
    !boundary
    || ["HTML", "BODY", "MAIN", "ARTICLE", "SECTION", "UL", "OL", "TABLE"].includes(boundary.tagName)
    || (boundary.textContent?.length || 0) > 512
  ) {
    return null;
  }
  return boundary;
}

function collectMutationSourceText(node, limit = 512) {
  if (!node || limit <= 0) {
    return "";
  }
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.nodeValue || "").slice(0, limit);
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }
  if (node.matches(`ruby[${RUBY_ATTRIBUTE}]`)) {
    return (node.dataset.jpOriginal || node.firstChild?.textContent || "").slice(0, limit);
  }
  if (node.matches("rt, rp")) {
    return "";
  }
  let result = "";
  for (const child of node.childNodes) {
    result += collectMutationSourceText(child, limit - result.length);
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}

function mutationNodesContainContext(nodeList) {
  return Array.from(nodeList).some((node) =>
    containsContextMutation(collectMutationSourceText(node))
  );
}

function mutationNodesContainForeignNameCharacter(nodeList) {
  return Array.from(nodeList).some((node) =>
    FOREIGN_PERSON_CONTEXT_PATTERN.test(collectMutationSourceText(node))
  );
}

function contextualRootContainsForeignPerson(root) {
  return FOREIGN_PERSON_SURFACE_PATTERN.test(collectMutationSourceText(root));
}

function getElementDisposition(element, boundary, displayCache) {
  if (element.matches(`ruby[${RUBY_ATTRIBUTE}]`)) {
    return "plugin-ruby";
  }
  if (element.matches(SKIPPED_SELECTOR) || HARD_BOUNDARY_TAGS.has(element.tagName)) {
    return "barrier";
  }
  if (
    element === boundary
    || SEMANTIC_INLINE_TAGS.has(element.tagName)
    || INLINE_DISPLAYS.has(getDisplay(element, displayCache))
  ) {
    return "inline";
  }
  return "barrier";
}

function normalizeAdjacentText(value) {
  return value.replace(/[\r\n\f]+/g, " ");
}

function nextNodeAfter(node, boundary) {
  let current = node;
  while (current && current !== boundary) {
    if (current.nextSibling) {
      return current.nextSibling;
    }
    current = current.parentNode;
  }
  return null;
}

function previousNodeBefore(node, boundary) {
  let current = node;
  while (current && current !== boundary) {
    if (current.previousSibling) {
      return current.previousSibling;
    }
    current = current.parentNode;
  }
  return null;
}

function collectFollowingContext(node, boundary, displayCache) {
  let current = nextNodeAfter(node, boundary);
  let result = "";
  let visitedNodes = 0;

  while (current && visitedNodes < CONTEXT_NODE_LIMIT && result.length < CONTEXT_CHARACTER_LIMIT) {
    visitedNodes += 1;
    if (current.nodeType === Node.TEXT_NODE) {
      result += normalizeAdjacentText(current.nodeValue || "");
      current = nextNodeAfter(current, boundary);
      continue;
    }
    if (current.nodeType !== Node.ELEMENT_NODE) {
      current = nextNodeAfter(current, boundary);
      continue;
    }

    const disposition = getElementDisposition(current, boundary, displayCache);
    if (disposition === "barrier") {
      break;
    }
    if (disposition === "plugin-ruby") {
      result += normalizeAdjacentText(current.dataset.jpOriginal || "");
      current = nextNodeAfter(current, boundary);
      continue;
    }
    current = current.firstChild || nextNodeAfter(current, boundary);
  }

  return result.slice(0, CONTEXT_CHARACTER_LIMIT);
}

function collectPrecedingContext(node, boundary, displayCache) {
  let current = previousNodeBefore(node, boundary);
  let result = "";
  let visitedNodes = 0;

  while (current && visitedNodes < CONTEXT_NODE_LIMIT && result.length < CONTEXT_CHARACTER_LIMIT) {
    visitedNodes += 1;
    if (current.nodeType === Node.TEXT_NODE) {
      result = `${normalizeAdjacentText(current.nodeValue || "")}${result}`;
      current = previousNodeBefore(current, boundary);
      continue;
    }
    if (current.nodeType !== Node.ELEMENT_NODE) {
      current = previousNodeBefore(current, boundary);
      continue;
    }

    const disposition = getElementDisposition(current, boundary, displayCache);
    if (disposition === "barrier") {
      break;
    }
    if (disposition === "plugin-ruby") {
      result = `${normalizeAdjacentText(current.dataset.jpOriginal || "")}${result}`;
      current = previousNodeBefore(current, boundary);
      continue;
    }
    current = current.lastChild || previousNodeBefore(current, boundary);
  }

  return result.slice(-CONTEXT_CHARACTER_LIMIT);
}

function collectAdjacentInlineContext(node, displayCache) {
  if (!containsContextCandidate(node.nodeValue || "")) {
    return { prefix: "", suffix: "" };
  }
  const boundary = findInlineContextBoundary(node, displayCache);
  if (!boundary) {
    return { prefix: "", suffix: "" };
  }
  return {
    prefix: collectPrecedingContext(node, boundary, displayCache),
    suffix: collectFollowingContext(node, boundary, displayCache)
  };
}

class FuriganaController {
  constructor() {
    this.buildVersion = CONTENT_BUILD_VERSION;
    this.phase = "idle";
    this.count = 0;
    this.errorMessage = "";
    this.tokenizer = null;
    this.tokenizerPromise = null;
    this.observer = null;
    this.pendingRoots = new Set();
    this.pendingContextRefreshRoots = new Set();
    this.flushTimer = null;
    this.runId = 0;
  }

  getStatus() {
    if (this.phase === "enabled") {
      this.syncCount();
    }
    return {
      phase: this.phase,
      enabled: this.phase === "enabled",
      count: this.count,
      message: this.errorMessage
    };
  }

  async toggle() {
    if (this.phase === "enabled" || this.phase === "loading") {
      this.disable();
      return this.getStatus();
    }

    await this.enable();
    return this.getStatus();
  }

  async enable() {
    if (this.phase === "enabled" || this.phase === "loading") {
      return;
    }

    const currentRun = ++this.runId;
    this.phase = "loading";
    this.errorMessage = "";
    this.showToast("正在本地分析日语读音…", "loading", 0);
    this.installStyle();

    try {
      const tokenizer = await this.getTokenizer();
      if (currentRun !== this.runId) {
        return;
      }

      this.count = 0;
      this.processRoot(document.body || document.documentElement, tokenizer);
      this.startObserver();
      this.phase = "enabled";
      this.showToast(`已标注 ${this.count} 处汉字读音`, "success");
    } catch (error) {
      if (currentRun !== this.runId) {
        return;
      }
      this.phase = "error";
      this.tokenizerPromise = null;
      this.errorMessage = error instanceof Error ? error.message : String(error);
      this.removeStyle();
      this.showToast(`标注失败：${this.errorMessage}`, "error", 6000);
      console.error("[日语汉字 AI 读音助手]", error);
    }
  }

  disable() {
    this.runId += 1;
    this.observer?.disconnect();
    this.observer = null;
    this.pendingRoots.clear();
    this.pendingContextRefreshRoots.clear();
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const changedParents = new Set();
    document.querySelectorAll(`ruby[${RUBY_ATTRIBUTE}]`).forEach((ruby) => {
      if (ruby.parentNode) {
        changedParents.add(ruby.parentNode);
      }
      ruby.replaceWith(document.createTextNode(ruby.dataset.jpOriginal || ruby.firstChild?.textContent || ""));
    });
    changedParents.forEach((parent) => parent.normalize());
    this.removeStyle();
    this.count = 0;
    this.phase = "idle";
    this.errorMessage = "";
    this.showToast("已移除读音标注", "success");
  }

  getTokenizer() {
    if (this.tokenizer) {
      return Promise.resolve(this.tokenizer);
    }

    if (!this.tokenizerPromise) {
      const dictionaryPath = chrome.runtime.getURL("dict/");
      this.tokenizerPromise = new Promise((resolve, reject) => {
        kuromoji.builder({ dicPath: dictionaryPath }).build((error, tokenizer) => {
          if (error) {
            reject(error);
            return;
          }
          this.tokenizer = tokenizer;
          resolve(tokenizer);
        });
      });
    }

    return this.tokenizerPromise;
  }

  processRoot(root, tokenizer = this.tokenizer) {
    if (!root || !tokenizer) {
      return;
    }

    if (root.nodeType === Node.TEXT_NODE) {
      if (!this.isEligibleTextNode(root)) {
        return;
      }
      this.processTextNode(root, tokenizer, collectAdjacentInlineContext(root, new WeakMap()));
      return;
    }

    if (!(root instanceof Element || root instanceof Document || root instanceof DocumentFragment)) {
      return;
    }

    if (root instanceof Element && root.matches(SKIPPED_SELECTOR)) {
      return;
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => this.isEligibleTextNode(node)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT
    });
    const nodes = [];
    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }
    const displayCache = new WeakMap();
    const jobs = nodes.map((node) => ({
      node,
      context: collectAdjacentInlineContext(node, displayCache)
    }));
    jobs.forEach(({ node, context }) => this.processTextNode(node, tokenizer, context));
  }

  isEligibleTextNode(node) {
    if (!node.nodeValue || !containsKanji(node.nodeValue)) {
      return false;
    }
    const parent = node.parentElement;
    return Boolean(parent && !parent.closest(SKIPPED_SELECTOR));
  }

  processTextNode(node, tokenizer, context = {}) {
    if (!node.isConnected || !this.isEligibleTextNode(node)) {
      return;
    }

    const originalText = node.nodeValue;
    const segments = buildAnnotationSegments(originalText, tokenizer, context);
    if (!segments.some((segment) => segment.reading)) {
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const segment of segments) {
      if (!segment.reading) {
        fragment.append(document.createTextNode(segment.text));
        continue;
      }

      const ruby = document.createElement("ruby");
      ruby.setAttribute(RUBY_ATTRIBUTE, "");
      if (foreignPersonAnnotationSignatures.has(`${segment.text}\u0000${segment.reading}`)) {
        ruby.setAttribute(FOREIGN_PERSON_RUBY_ATTRIBUTE, "");
      }
      ruby.dataset.jpOriginal = segment.text;
      ruby.append(document.createTextNode(segment.text));
      const rt = document.createElement("rt");
      rt.textContent = segment.reading;
      ruby.append(rt);
      fragment.append(ruby);
      this.count += 1;
    }
    node.replaceWith(fragment);
  }

  syncCount() {
    this.count = document.querySelectorAll(`ruby[${RUBY_ATTRIBUTE}]`).length;
  }

  refreshContextualRoot(root, tokenizer = this.tokenizer) {
    if (!root?.isConnected || !tokenizer || !(root instanceof Element)) {
      return;
    }

    const changedParents = new Set();
    root.querySelectorAll(`ruby[${RUBY_ATTRIBUTE}]`).forEach((ruby) => {
      const original = ruby.dataset.jpOriginal || ruby.firstChild?.textContent || "";
      if (!containsContextCandidate(original)) {
        return;
      }
      if (ruby.parentNode) {
        changedParents.add(ruby.parentNode);
      }
      ruby.replaceWith(document.createTextNode(original));
    });
    if (changedParents.size === 0) {
      return;
    }
    changedParents.forEach((parent) => parent.normalize());
    this.processRoot(root, tokenizer);
  }

  observeDocumentChanges() {
    this.observer?.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      characterDataOldValue: true
    });
  }

  startObserver() {
    this.observer?.disconnect();
    this.observer = new MutationObserver((mutations) => {
      const displayCache = new WeakMap();
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          this.pendingRoots.add(mutation.target);
          const currentValue = mutation.target.nodeValue || "";
          const oldValue = mutation.oldValue || "";
          const directContextChange = containsContextMutation(currentValue)
            || containsContextMutation(oldValue);
          const personCharacterChange = FOREIGN_PERSON_CONTEXT_PATTERN.test(currentValue)
            || FOREIGN_PERSON_CONTEXT_PATTERN.test(oldValue);
          if (directContextChange || personCharacterChange) {
            const refreshRoot = getContextRefreshRoot(mutation.target, displayCache);
            if (
              refreshRoot
              && (
                directContextChange
                || contextualRootContainsForeignPerson(refreshRoot)
                || (FOREIGN_PERSON_CONTEXT_PATTERN.test(oldValue)
                  && Boolean(refreshRoot.querySelector(
                    `ruby[${RUBY_ATTRIBUTE}][${FOREIGN_PERSON_RUBY_ATTRIBUTE}]`
                  )))
              )
            ) {
              this.pendingContextRefreshRoots.add(refreshRoot);
            }
          }
          continue;
        }

        mutation.addedNodes.forEach((node) => this.pendingRoots.add(node));
        const directContextChange = mutationNodesContainContext(mutation.addedNodes)
          || mutationNodesContainContext(mutation.removedNodes);
        const personCharacterChange = mutationNodesContainForeignNameCharacter(mutation.addedNodes)
          || mutationNodesContainForeignNameCharacter(mutation.removedNodes);
        if (directContextChange || personCharacterChange) {
          const refreshRoot = getContextRefreshRoot(mutation.target, displayCache);
          if (
            refreshRoot
            && (
              directContextChange
              || contextualRootContainsForeignPerson(refreshRoot)
              || (mutationNodesContainForeignNameCharacter(mutation.removedNodes)
                && Boolean(refreshRoot.querySelector(
                  `ruby[${RUBY_ATTRIBUTE}][${FOREIGN_PERSON_RUBY_ATTRIBUTE}]`
                )))
            )
          ) {
            this.pendingContextRefreshRoots.add(refreshRoot);
          }
        }
      }
      this.scheduleFlush();
    });
    this.observeDocumentChanges();
  }

  scheduleFlush() {
    if (this.flushTimer !== null || this.phase !== "enabled") {
      return;
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      const roots = Array.from(this.pendingRoots);
      const refreshRoots = Array.from(this.pendingContextRefreshRoots);
      this.pendingRoots.clear();
      this.pendingContextRefreshRoots.clear();
      this.observer?.disconnect();
      try {
        refreshRoots.forEach((root) => this.refreshContextualRoot(root));
        roots.forEach((root) => this.processRoot(root));
        this.syncCount();
      } finally {
        if (this.phase === "enabled") {
          this.observeDocumentChanges();
        }
      }
    }, 60);
  }

  installStyle() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      ruby[${RUBY_ATTRIBUTE}] { ruby-position: over; }
      ruby[${RUBY_ATTRIBUTE}] > rt {
        font-size: 0.55em;
        line-height: 1;
        color: #b42318;
        font-weight: 600;
        user-select: none;
      }
    `;
    (document.head || document.documentElement).append(style);
  }

  removeStyle() {
    document.getElementById(STYLE_ID)?.remove();
  }

  showToast(message, kind = "success", duration = 2600) {
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement("div");
      toast.id = TOAST_ID;
      toast.setAttribute(TRANSLATION_UI_ATTRIBUTE, "");
      toast.setAttribute("role", "status");
      Object.assign(toast.style, {
        position: "fixed",
        zIndex: "2147483647",
        top: "18px",
        right: "18px",
        maxWidth: "340px",
        padding: "12px 16px",
        borderRadius: "10px",
        color: "#fff",
        font: "600 14px/1.45 system-ui, sans-serif",
        boxShadow: "0 8px 28px rgba(0, 0, 0, .24)",
        transition: "opacity .2s ease",
        pointerEvents: "none"
      });
      document.documentElement.append(toast);
    }
    toast.style.background = kind === "error" ? "#b42318" : kind === "loading" ? "#344054" : "#067647";
    toast.style.opacity = "1";
    toast.textContent = message;

    clearTimeout(toast.__jpFuriganaTimer);
    if (duration > 0) {
      toast.__jpFuriganaTimer = setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 220);
      }, duration);
    }
  }
}

if (globalThis[TRANSLATION_CONTROLLER_KEY]?.buildVersion !== CONTENT_BUILD_VERSION) {
  globalThis[TRANSLATION_CONTROLLER_KEY] = new SelectionTranslationController();
}

if (globalThis[CONTROLLER_KEY]?.buildVersion !== CONTENT_BUILD_VERSION) {
  const controller = new FuriganaController();
  globalThis[CONTROLLER_KEY] = controller;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "GET_FURIGANA_STATUS") {
      sendResponse(controller.getStatus());
      return false;
    }
    if (message?.type === "TOGGLE_FURIGANA") {
      controller.toggle().then(sendResponse);
      return true;
    }
    return false;
  });

  void controller.enable();
}
