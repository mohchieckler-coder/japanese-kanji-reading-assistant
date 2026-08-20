export const DEFAULT_TRANSLATION_SETTINGS = Object.freeze({
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  targetLanguage: "zh-CN",
  uiLanguage: "zh-CN"
});

export const MAX_TRANSLATION_TEXT_LENGTH = 12_000;
export const MAX_TRANSLATION_OUTPUT_LENGTH = 48_000;
export const MAX_API_RESPONSE_BYTES = 2 * 1024 * 1024;
export const MAX_BASE_URL_LENGTH = 2_048;
export const MAX_API_KEY_LENGTH = 4_096;
export const MAX_TRANSLATION_HISTORY = 500;
export const MAX_TOKEN_USAGE_RECORDS = 1_000;
export const MAX_TRANSLATION_HISTORY_BYTES = 4 * 1024 * 1024;
export const MAX_TOKEN_USAGE_BYTES = 512 * 1024;
export const TRANSLATION_REQUEST_TIMEOUT_MS = 45_000;

const SELECTION_TYPES = new Set(["word", "sentence", "paragraph", "selection"]);
export const SUPPORTED_UI_LANGUAGES = Object.freeze(["zh-CN", "en", "ja", "ko"]);
const SUPPORTED_UI_LANGUAGE_SET = new Set(SUPPORTED_UI_LANGUAGES);
const TARGET_LANGUAGE_NAMES = Object.freeze({
  "zh-CN": "Simplified Chinese",
  "zh-TW": "Traditional Chinese",
  en: "English",
  ko: "Korean",
  ja: "Japanese",
  fr: "French",
  de: "German",
  es: "Spanish",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  th: "Thai",
  vi: "Vietnamese",
  id: "Indonesian"
});

export class TranslationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TranslationError";
    this.code = code;
  }
}

function cleanString(value, maximumLength = Number.POSITIVE_INFINITY) {
  return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}

function finiteTokenCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

export function validateBaseUrl(value) {
  const input = cleanString(value || DEFAULT_TRANSLATION_SETTINGS.baseUrl);
  if (input.length > MAX_BASE_URL_LENGTH || /[\u0000-\u001f\u007f]/u.test(input)) {
    throw new TranslationError("INVALID_BASE_URL", "BaseURL 长度或字符无效");
  }
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new TranslationError("INVALID_BASE_URL", "BaseURL 不是有效的网址");
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new TranslationError(
      "INVALID_BASE_URL",
      "BaseURL 不能包含账号、密码、查询参数或片段"
    );
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname.startsWith("[") || hostname.includes(":")) {
    throw new TranslationError("INVALID_BASE_URL", "暂不支持 IPv6 BaseURL");
  }
  const localHttp = url.protocol === "http:"
    && (hostname === "localhost" || hostname === "127.0.0.1");
  if (url.protocol !== "https:" && !localHttp) {
    throw new TranslationError(
      "INSECURE_BASE_URL",
      "BaseURL 必须使用 HTTPS；仅 localhost 或 127.0.0.1 可使用 HTTP"
    );
  }

  const normalizedPath = url.pathname.replace(/\/+$/u, "");
  url.pathname = normalizedPath || "/";
  return url.toString().replace(/\/$/u, "");
}

export function buildChatCompletionsUrl(baseUrl) {
  const normalized = validateBaseUrl(baseUrl);
  if (/\/chat\/completions$/u.test(new URL(normalized).pathname)) {
    return normalized;
  }
  return `${normalized}/chat/completions`;
}

export function getApiOriginPattern(baseUrl) {
  const url = new URL(validateBaseUrl(baseUrl));
  return `${url.protocol}//${url.hostname}/*`;
}

export function validateModel(value) {
  const model = cleanString(value || DEFAULT_TRANSLATION_SETTINGS.model);
  if (!model || model.length > 160 || /[\u0000-\u001f\u007f]/u.test(model)) {
    throw new TranslationError("INVALID_MODEL", "模型名称无效");
  }
  return model;
}

export function validateApiKey(value) {
  const apiKey = cleanString(value);
  if (apiKey.length > MAX_API_KEY_LENGTH || /[\u0000-\u001f\u007f]/u.test(apiKey)) {
    throw new TranslationError("INVALID_API_KEY", "API Key 长度或字符无效");
  }
  return apiKey;
}

export function validateTargetLanguage(value) {
  const targetLanguage = cleanString(value || DEFAULT_TRANSLATION_SETTINGS.targetLanguage);
  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u.test(targetLanguage)) {
    throw new TranslationError("INVALID_TARGET_LANGUAGE", "目标语言代码无效");
  }
  return targetLanguage;
}

export function validateUiLanguage(value) {
  const uiLanguage = cleanString(value || DEFAULT_TRANSLATION_SETTINGS.uiLanguage);
  if (!SUPPORTED_UI_LANGUAGE_SET.has(uiLanguage)) {
    throw new TranslationError("INVALID_UI_LANGUAGE", "管理面板界面语言无效");
  }
  return uiLanguage;
}

export function normalizeStoredSettings(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const storedUiLanguage = cleanString(source.uiLanguage);
  return {
    baseUrl: cleanString(source.baseUrl) || DEFAULT_TRANSLATION_SETTINGS.baseUrl,
    model: cleanString(source.model) || DEFAULT_TRANSLATION_SETTINGS.model,
    targetLanguage: cleanString(source.targetLanguage) || DEFAULT_TRANSLATION_SETTINGS.targetLanguage,
    uiLanguage: SUPPORTED_UI_LANGUAGE_SET.has(storedUiLanguage)
      ? storedUiLanguage
      : DEFAULT_TRANSLATION_SETTINGS.uiLanguage,
    apiKey: cleanString(source.apiKey)
  };
}

export function mergeTranslationSettings(current = {}, changes = {}) {
  const existing = normalizeStoredSettings(current);
  const input = changes && typeof changes === "object" ? changes : {};
  const clearingApiKey = input.clearApiKey === true || input.apiKeyAction === "clear";
  let apiKey;
  if (clearingApiKey) {
    apiKey = "";
  } else if (typeof input.apiKey === "string" && input.apiKey.trim()) {
    apiKey = validateApiKey(input.apiKey);
  } else {
    apiKey = validateApiKey(existing.apiKey);
  }

  let baseUrl = validateBaseUrl(input.baseUrl ?? existing.baseUrl);
  let model = validateModel(input.model ?? existing.model);
  if (clearingApiKey) {
    // Clearing credentials must never deadlock on a previously contaminated public field.
    if (existing.apiKey && baseUrl.includes(existing.apiKey)) {
      baseUrl = DEFAULT_TRANSLATION_SETTINGS.baseUrl;
    }
    if (existing.apiKey && model.includes(existing.apiKey)) {
      model = DEFAULT_TRANSLATION_SETTINGS.model;
    }
  } else {
    const configuredSecrets = [...new Set([existing.apiKey, apiKey].filter(Boolean))];
    if (
      configuredSecrets.some((secret) => baseUrl.includes(secret) || model.includes(secret))
    ) {
      throw new TranslationError(
        "SENSITIVE_SETTING_REJECTED",
        "BaseURL 或模型名称不能包含当前或之前的 API Key"
      );
    }
  }
  return {
    baseUrl,
    model,
    targetLanguage: validateTargetLanguage(input.targetLanguage ?? existing.targetLanguage),
    uiLanguage: validateUiLanguage(input.uiLanguage ?? existing.uiLanguage),
    apiKey
  };
}

export function sanitizeSettingsForClient(settings) {
  const normalized = normalizeStoredSettings(settings);
  const hasApiKey = Boolean(normalized.apiKey);
  return {
    baseUrl: redactSecrets(normalized.baseUrl, hasApiKey ? [normalized.apiKey] : []),
    model: redactSecrets(normalized.model, hasApiKey ? [normalized.apiKey] : []),
    targetLanguage: redactSecrets(
      normalized.targetLanguage,
      hasApiKey ? [normalized.apiKey] : []
    ),
    uiLanguage: normalized.uiLanguage,
    hasApiKey,
    apiKeyHint: hasApiKey
      ? normalized.apiKey.length > 4
        ? `••••${normalized.apiKey.slice(-4)}`
        : "已配置"
      : ""
  };
}

export function validateTranslationInput(payload = {}) {
  if (!payload || typeof payload !== "object") {
    throw new TranslationError("INVALID_REQUEST", "翻译请求格式无效");
  }
  if (typeof payload.text !== "string" || !payload.text.trim()) {
    throw new TranslationError("INVALID_TEXT", "请选择需要翻译的文字");
  }
  const text = payload.text.trim();
  if (text.length > MAX_TRANSLATION_TEXT_LENGTH) {
    throw new TranslationError(
      "TEXT_TOO_LONG",
      `单次翻译最多支持 ${MAX_TRANSLATION_TEXT_LENGTH} 个字符`
    );
  }
  const selectionType = cleanString(payload.selectionType || "selection").toLowerCase();
  if (!SELECTION_TYPES.has(selectionType)) {
    throw new TranslationError("INVALID_SELECTION_TYPE", "划词类型无效");
  }
  return {
    text,
    selectionType,
    targetLanguage: validateTargetLanguage(
      payload.targetLanguage || DEFAULT_TRANSLATION_SETTINGS.targetLanguage
    )
  };
}

export function buildChatCompletionRequest({ text, targetLanguage, selectionType, model }) {
  const validated = validateTranslationInput({ text, targetLanguage, selectionType });
  const safeModel = validateModel(model);
  const languageName = TARGET_LANGUAGE_NAMES[validated.targetLanguage]
    || `the language identified by BCP 47 code ${validated.targetLanguage}`;
  const unit = validated.selectionType === "word"
    ? "selected Japanese word or short phrase"
    : "selected Japanese text";

  return {
    model: safeModel,
    messages: [
      {
        role: "system",
        content: `You are a precise translation engine. Translate the ${unit} into ${languageName}. Preserve meaning, names, numbers, tone, and formatting. Return only the translation, with no explanation, labels, or quotation marks.`
      },
      { role: "user", content: validated.text }
    ],
    temperature: 0.2
  };
}

export function normalizeTokenUsage(usage = {}) {
  const source = usage && typeof usage === "object" ? usage : {};
  const inputTokens = finiteTokenCount(source.prompt_tokens ?? source.input_tokens ?? source.inputTokens);
  const outputTokens = finiteTokenCount(
    source.completion_tokens ?? source.output_tokens ?? source.outputTokens
  );
  const reportedTotal = finiteTokenCount(source.total_tokens ?? source.totalTokens);
  return {
    inputTokens,
    outputTokens,
    totalTokens: Math.max(reportedTotal, inputTokens + outputTokens)
  };
}

function contentPartToText(part) {
  if (typeof part === "string") {
    return part;
  }
  if (!part || typeof part !== "object") {
    return "";
  }
  if (typeof part.text === "string") {
    return part.text;
  }
  if (part.text && typeof part.text.value === "string") {
    return part.text.value;
  }
  return "";
}

export function parseChatCompletionResponse(payload) {
  const choice = payload?.choices?.[0];
  const content = choice?.message?.content ?? choice?.text;
  const translation = Array.isArray(content)
    ? content.map(contentPartToText).join("").trim()
    : cleanString(content);
  if (!translation) {
    throw new TranslationError("INVALID_API_RESPONSE", "翻译接口没有返回有效文本");
  }
  if (translation.length > MAX_TRANSLATION_OUTPUT_LENGTH) {
    throw new TranslationError(
      "TRANSLATION_OUTPUT_TOO_LONG",
      `翻译接口返回内容超过 ${MAX_TRANSLATION_OUTPUT_LENGTH} 个字符`
    );
  }
  return {
    translation,
    model: cleanString(payload?.model),
    usage: normalizeTokenUsage(payload?.usage)
  };
}

export function parseApiResponseText(text) {
  if (typeof text !== "string") {
    throw new TranslationError("INVALID_API_RESPONSE", "翻译接口返回了无法解析的数据");
  }
  if (utf8ByteLength(text) > MAX_API_RESPONSE_BYTES) {
    throw new TranslationError("API_RESPONSE_TOO_LARGE", "翻译接口响应体过大");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new TranslationError("INVALID_API_RESPONSE", "翻译接口返回了无法解析的数据");
  }
}

export function prependBounded(record, records, maximum) {
  const existing = Array.isArray(records) ? records : [];
  const safeMaximum = Math.max(0, Math.floor(Number(maximum) || 0));
  return [record, ...existing].slice(0, safeMaximum);
}

export function utf8ByteLength(value) {
  return new TextEncoder().encode(String(value)).byteLength;
}

export function limitRecordsByUtf8Bytes(records, maximumCount, maximumBytes) {
  const list = Array.isArray(records) ? records : [];
  const countLimit = Math.max(0, Math.floor(Number(maximumCount) || 0));
  const byteLimit = Math.max(2, Math.floor(Number(maximumBytes) || 0));
  const result = [];
  let bytes = 2; // JSON array brackets.
  for (const record of list.slice(0, countLimit)) {
    let encoded;
    try {
      encoded = utf8ByteLength(JSON.stringify(record));
    } catch {
      break;
    }
    const separator = result.length ? 1 : 0;
    if (bytes + separator + encoded > byteLimit) {
      break;
    }
    result.push(record);
    bytes += separator + encoded;
  }
  return result;
}

export function summarizeTokenUsage(records) {
  const list = Array.isArray(records) ? records : [];
  return list.reduce(
    (summary, record) => {
      const usage = normalizeTokenUsage(record?.usage || record);
      summary.requests += 1;
      summary.inputTokens += usage.inputTokens;
      summary.outputTokens += usage.outputTokens;
      summary.totalTokens += usage.totalTokens;
      return summary;
    },
    { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  );
}

export function createRecordId(prefix = "record", now = Date.now(), random = Math.random()) {
  const randomPart = Math.floor(Math.abs(random) * 0x100000000).toString(36);
  return `${prefix}-${Math.floor(now).toString(36)}-${randomPart}`;
}

export function sanitizePageMetadata(payload = {}, sender = {}) {
  return {
    pageUrl: cleanString(sender?.tab?.url || payload.pageUrl, 2_048),
    pageTitle: cleanString(sender?.tab?.title || payload.pageTitle, 500)
  };
}

export function redactSecrets(value, secrets = []) {
  let message = typeof value === "string" ? value : String(value || "");
  for (const secret of secrets) {
    if (typeof secret === "string" && secret) {
      message = message.split(secret).join("[REDACTED]");
    }
  }
  return message
    .replace(/Bearer\s+[^\s"']+/giu, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/gu, "[REDACTED]");
}

export function toSafeError(error, secrets = []) {
  if (error instanceof TranslationError) {
    return { code: error.code, message: redactSecrets(error.message, secrets) };
  }
  return { code: "TRANSLATION_ERROR", message: "翻译服务暂时不可用，请稍后重试" };
}
