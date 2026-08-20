import {
  MAX_TOKEN_USAGE_BYTES,
  MAX_TOKEN_USAGE_RECORDS,
  MAX_API_RESPONSE_BYTES,
  MAX_TRANSLATION_HISTORY_BYTES,
  MAX_TRANSLATION_HISTORY,
  TRANSLATION_REQUEST_TIMEOUT_MS,
  TranslationError,
  buildChatCompletionRequest,
  buildChatCompletionsUrl,
  createRecordId,
  getApiOriginPattern,
  limitRecordsByUtf8Bytes,
  mergeTranslationSettings,
  normalizeStoredSettings,
  normalizeTokenUsage,
  parseApiResponseText,
  parseChatCompletionResponse,
  prependBounded,
  redactSecrets,
  sanitizePageMetadata,
  sanitizeSettingsForClient,
  summarizeTokenUsage,
  toSafeError,
  validateTranslationInput
} from "./translation-core.mjs";

const STORAGE_KEYS = Object.freeze({
  settings: "translationSettings",
  history: "translationHistory",
  usage: "translationTokenUsage"
});

const SUPPORTED_MESSAGES = new Set([
  "GET_TRANSLATION_DASHBOARD",
  "SAVE_TRANSLATION_SETTINGS",
  "TRANSLATE_TEXT",
  "TEST_TRANSLATION_CONNECTION",
  "DELETE_TRANSLATION_HISTORY_ITEM",
  "CLEAR_TRANSLATION_HISTORY",
  "CLEAR_TOKEN_USAGE",
  "OPEN_TRANSLATION_OPTIONS"
]);
const CONTENT_SCRIPT_MESSAGES = new Set(["TRANSLATE_TEXT", "OPEN_TRANSLATION_OPTIONS"]);

let storageMutationQueue = Promise.resolve();

function enqueueStorageMutation(operation) {
  const task = storageMutationQueue.then(operation, operation);
  storageMutationQueue = task.catch(() => undefined);
  return task;
}

async function protectLocalStorage() {
  if (typeof chrome.storage?.local?.setAccessLevel !== "function") {
    throw new TranslationError(
      "STORAGE_SECURITY_UNAVAILABLE",
      "当前浏览器无法安全保护本地翻译设置"
    );
  }
  try {
    await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  } catch {
    throw new TranslationError(
      "STORAGE_SECURITY_UNAVAILABLE",
      "无法启用本地翻译设置安全保护"
    );
  }
}

async function initializeBackground() {
  await protectLocalStorage();
}

let backgroundReady = null;

function ensureBackgroundReady() {
  if (!backgroundReady) {
    const attempt = initializeBackground();
    backgroundReady = attempt;
    attempt.catch(() => {
      if (backgroundReady === attempt) {
        backgroundReady = null;
      }
    });
  }
  return backgroundReady;
}

ensureBackgroundReady().catch(() => undefined);
chrome.runtime.onInstalled.addListener(() => {
  ensureBackgroundReady().catch(() => undefined);
});
chrome.runtime.onStartup?.addListener(() => {
  ensureBackgroundReady().catch(() => undefined);
});

function safeStoredText(value, apiKey = "") {
  return redactSecrets(String(value || ""), apiKey ? [apiKey] : []);
}

function sanitizedHistory(value, apiKey = "") {
  if (!Array.isArray(value)) {
    return [];
  }
  const records = value.slice(0, MAX_TRANSLATION_HISTORY).map((entry) => ({
    id: safeStoredText(entry?.id, apiKey),
    timestamp: safeStoredText(entry?.timestamp, apiKey),
    sourceText: safeStoredText(entry?.sourceText, apiKey),
    translatedText: safeStoredText(entry?.translatedText, apiKey),
    pageUrl: safeStoredText(entry?.pageUrl, apiKey),
    pageTitle: safeStoredText(entry?.pageTitle, apiKey),
    selectionType: safeStoredText(entry?.selectionType || "selection", apiKey),
    model: safeStoredText(entry?.model, apiKey),
    targetLanguage: safeStoredText(entry?.targetLanguage, apiKey),
    usage: normalizeTokenUsage(entry?.usage)
  }));
  return limitRecordsByUtf8Bytes(
    records,
    MAX_TRANSLATION_HISTORY,
    MAX_TRANSLATION_HISTORY_BYTES
  );
}

function sanitizedUsageRecords(value, apiKey = "") {
  if (!Array.isArray(value)) {
    return [];
  }
  const records = value.slice(0, MAX_TOKEN_USAGE_RECORDS).map((entry) => ({
    id: safeStoredText(entry?.id, apiKey),
    timestamp: safeStoredText(entry?.timestamp, apiKey),
    operation: entry?.operation === "connection-test" ? "connection-test" : "translation",
    pageUrl: safeStoredText(entry?.pageUrl, apiKey),
    pageTitle: safeStoredText(entry?.pageTitle, apiKey),
    selectionType: safeStoredText(entry?.selectionType || "selection", apiKey),
    model: safeStoredText(entry?.model, apiKey),
    targetLanguage: safeStoredText(entry?.targetLanguage, apiKey),
    usage: normalizeTokenUsage(entry?.usage)
  }));
  return limitRecordsByUtf8Bytes(records, MAX_TOKEN_USAGE_RECORDS, MAX_TOKEN_USAGE_BYTES);
}

async function getDashboard() {
  const stored = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  const configuredApiKey = normalizeStoredSettings(stored[STORAGE_KEYS.settings]).apiKey;
  const history = sanitizedHistory(stored[STORAGE_KEYS.history], configuredApiKey);
  const usageRecords = sanitizedUsageRecords(stored[STORAGE_KEYS.usage], configuredApiKey);
  const usageSummary = summarizeTokenUsage(usageRecords);
  return {
    settings: sanitizeSettingsForClient(stored[STORAGE_KEYS.settings]),
    history,
    usageRecords,
    usageSummary,
    summary: usageSummary
  };
}

function saveSettings(message) {
  return enqueueStorageMutation(async () => {
    const stored = await chrome.storage.local.get(STORAGE_KEYS.settings);
    const previousSettings = normalizeStoredSettings(stored[STORAGE_KEYS.settings]);
    const changes = {
      ...(message.payload && typeof message.payload === "object" ? message.payload : {}),
      ...(message.settings && typeof message.settings === "object" ? message.settings : {})
    };
    if (!message.payload && !message.settings) {
      Object.assign(changes, message);
    }
    if (message.clearApiKey === true) {
      changes.clearApiKey = true;
    }
    if (message.apiKeyAction === "clear") {
      changes.apiKeyAction = "clear";
    }
    const settings = mergeTranslationSettings(
      previousSettings,
      changes
    );
    const updates = { [STORAGE_KEYS.settings]: settings };
    if (previousSettings.apiKey && !settings.apiKey) {
      const records = await chrome.storage.local.get([STORAGE_KEYS.history, STORAGE_KEYS.usage]);
      updates[STORAGE_KEYS.history] = sanitizedHistory(
        records[STORAGE_KEYS.history],
        previousSettings.apiKey
      );
      updates[STORAGE_KEYS.usage] = sanitizedUsageRecords(
        records[STORAGE_KEYS.usage],
        previousSettings.apiKey
      );
    }
    await chrome.storage.local.set(updates);
    return getDashboard();
  });
}

async function requireHostPermission(baseUrl) {
  if (typeof chrome.permissions?.contains !== "function") {
    throw new TranslationError("HOST_PERMISSION_REQUIRED", "扩展缺少翻译接口访问权限");
  }
  const origin = getApiOriginPattern(baseUrl);
  const granted = await chrome.permissions.contains({ origins: [origin] });
  if (!granted) {
    throw new TranslationError(
      "HOST_PERMISSION_REQUIRED",
      "尚未授权访问该 BaseURL，请保存设置并允许主机访问权限"
    );
  }
}

async function readResponseTextWithLimit(response) {
  const contentLength = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_API_RESPONSE_BYTES) {
    throw new TranslationError("API_RESPONSE_TOO_LARGE", "翻译接口响应体过大");
  }

  const reader = response.body?.getReader?.();
  if (!reader) {
    return response.text();
  }

  const decoder = new TextDecoder();
  const parts = [];
  let receivedBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      parts.push(decoder.decode());
      return parts.join("");
    }
    receivedBytes += value?.byteLength || 0;
    if (receivedBytes > MAX_API_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new TranslationError("API_RESPONSE_TOO_LARGE", "翻译接口响应体过大");
    }
    parts.push(decoder.decode(value, { stream: true }));
  }
}

async function requestTranslation(settings, input) {
  if (!settings.apiKey) {
    throw new TranslationError("API_KEY_MISSING", "请先在管理面板配置 API Key");
  }
  if (input.text.includes(settings.apiKey)) {
    throw new TranslationError(
      "SENSITIVE_TEXT_REJECTED",
      "所选文本包含当前配置的 API Key，已阻止发送和记录"
    );
  }
  await requireHostPermission(settings.baseUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRANSLATION_REQUEST_TIMEOUT_MS);
  try {
    let response;
    try {
      response = await fetch(buildChatCompletionsUrl(settings.baseUrl), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify(buildChatCompletionRequest({
          ...input,
          model: settings.model
        })),
        cache: "no-store",
        credentials: "omit",
        signal: controller.signal
      });
    } catch (error) {
      if (controller.signal.aborted || error?.name === "AbortError") {
        throw new TranslationError("REQUEST_TIMEOUT", "翻译请求超时，请稍后重试");
      }
      throw new TranslationError("NETWORK_ERROR", "无法连接翻译接口，请检查 BaseURL 和网络");
    }

    if (!response.ok) {
      const code = response.status === 401
        ? "AUTHENTICATION_FAILED"
        : response.status === 403
          ? "API_ACCESS_DENIED"
          : response.status === 429
            ? "RATE_LIMITED"
            : `HTTP_${response.status}`;
      const message = response.status === 401
        ? "API Key 无效或已失效"
        : response.status === 403
          ? "翻译接口拒绝访问，请检查账号或模型权限"
          : response.status === 429
            ? "翻译接口请求过于频繁或额度不足"
            : `翻译接口请求失败（HTTP ${response.status}）`;
      throw new TranslationError(code, message);
    }

    let responseText;
    try {
      responseText = await readResponseTextWithLimit(response);
    } catch (error) {
      if (error instanceof TranslationError) {
        throw error;
      }
      if (controller.signal.aborted || error?.name === "AbortError") {
        throw new TranslationError("REQUEST_TIMEOUT", "翻译请求超时，请稍后重试");
      }
      throw new TranslationError("INVALID_API_RESPONSE", "翻译接口返回了无法解析的数据");
    }

    const payload = parseApiResponseText(responseText);
    const result = parseChatCompletionResponse(payload);
    if (
      result.translation.includes(settings.apiKey)
      || (result.model && result.model.includes(settings.apiKey))
    ) {
      throw new TranslationError("INVALID_API_RESPONSE", "翻译接口返回了不安全的数据");
    }
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

function buildUsageRecord({ operation, timestamp, page, input, settings, usage }) {
  const apiKey = settings.apiKey || "";
  return {
    id: createRecordId("usage"),
    timestamp,
    operation,
    pageUrl: safeStoredText(page.pageUrl, apiKey),
    pageTitle: safeStoredText(page.pageTitle, apiKey),
    selectionType: input.selectionType,
    model: safeStoredText(settings.model, apiKey),
    targetLanguage: input.targetLanguage,
    usage
  };
}

async function recordTranslation({ page, input, settings, result }) {
  const timestamp = new Date().toISOString();
  const apiKey = settings.apiKey || "";
  const historyEntry = {
    id: createRecordId("translation"),
    timestamp,
    sourceText: safeStoredText(input.text, apiKey),
    translatedText: safeStoredText(result.translation, apiKey),
    pageUrl: safeStoredText(page.pageUrl, apiKey),
    pageTitle: safeStoredText(page.pageTitle, apiKey),
    selectionType: input.selectionType,
    model: safeStoredText(result.model || settings.model, apiKey),
    targetLanguage: input.targetLanguage,
    usage: result.usage
  };
  const usageRecord = buildUsageRecord({
    operation: "translation",
    timestamp,
    page,
    input,
    settings: { ...settings, model: historyEntry.model },
    usage: result.usage
  });

  const saved = await enqueueStorageMutation(async () => {
    try {
      const stored = await chrome.storage.local.get([STORAGE_KEYS.history, STORAGE_KEYS.usage]);
      const history = limitRecordsByUtf8Bytes(
        prependBounded(historyEntry, stored[STORAGE_KEYS.history], MAX_TRANSLATION_HISTORY),
        MAX_TRANSLATION_HISTORY,
        MAX_TRANSLATION_HISTORY_BYTES
      );
      const usageRecords = limitRecordsByUtf8Bytes(
        prependBounded(usageRecord, stored[STORAGE_KEYS.usage], MAX_TOKEN_USAGE_RECORDS),
        MAX_TOKEN_USAGE_RECORDS,
        MAX_TOKEN_USAGE_BYTES
      );
      try {
        await chrome.storage.local.set({
          [STORAGE_KEYS.history]: history,
          [STORAGE_KEYS.usage]: usageRecords
        });
        return { historySaved: true, usageSaved: true };
      } catch {
        try {
          await chrome.storage.local.set({ [STORAGE_KEYS.usage]: usageRecords });
          return { historySaved: false, usageSaved: true };
        } catch {
          return { historySaved: false, usageSaved: false };
        }
      }
    } catch {
      return { historySaved: false, usageSaved: false };
    }
  });
  return { historyEntry, ...saved };
}

async function recordConnectionUsage({ input, settings, result }) {
  const timestamp = new Date().toISOString();
  const record = buildUsageRecord({
    operation: "connection-test",
    timestamp,
    page: { pageUrl: "", pageTitle: "" },
    input,
    settings: { ...settings, model: result.model || settings.model },
    usage: result.usage
  });
  return enqueueStorageMutation(async () => {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEYS.usage);
      const usageRecords = limitRecordsByUtf8Bytes(
        prependBounded(record, stored[STORAGE_KEYS.usage], MAX_TOKEN_USAGE_RECORDS),
        MAX_TOKEN_USAGE_RECORDS,
        MAX_TOKEN_USAGE_BYTES
      );
      await chrome.storage.local.set({ [STORAGE_KEYS.usage]: usageRecords });
      return true;
    } catch {
      return false;
    }
  });
}

async function translateText(message, sender) {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.settings);
  const settings = mergeTranslationSettings(stored[STORAGE_KEYS.settings], {});
  const input = validateTranslationInput({
    text: message.text ?? message.payload?.text,
    selectionType: message.selectionType ?? message.payload?.selectionType,
    targetLanguage: message.targetLanguage
      ?? message.payload?.targetLanguage
      ?? settings.targetLanguage
  });
  const page = sanitizePageMetadata(message.payload || message, sender);
  const result = await requestTranslation(settings, input);
  const saved = await recordTranslation({ page, input, settings, result });
  return {
    translation: result.translation,
    targetLanguage: input.targetLanguage,
    selectionType: input.selectionType,
    usage: result.usage,
    historyEntry: saved.historyEntry,
    historySaved: saved.historySaved,
    usageSaved: saved.usageSaved
  };
}

async function testConnection(message) {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.settings);
  const settings = mergeTranslationSettings(
    stored[STORAGE_KEYS.settings],
    message.settings || message.payload || {}
  );
  const input = validateTranslationInput({
    text: "こんにちは",
    selectionType: "sentence",
    targetLanguage: settings.targetLanguage
  });
  const result = await requestTranslation(settings, input);
  const usageSaved = await recordConnectionUsage({ input, settings, result });
  return {
    translation: result.translation,
    targetLanguage: input.targetLanguage,
    selectionType: input.selectionType,
    model: result.model || settings.model,
    usage: result.usage,
    usageSaved
  };
}

async function deleteHistoryItem(message) {
  const id = String(message.id || message.historyId || message.payload?.id || "").trim();
  if (!id) {
    throw new TranslationError("INVALID_HISTORY_ID", "缺少需要删除的历史记录 ID");
  }
  await enqueueStorageMutation(async () => {
    const stored = await chrome.storage.local.get(STORAGE_KEYS.history);
    const history = Array.isArray(stored[STORAGE_KEYS.history])
      ? stored[STORAGE_KEYS.history].filter((entry) => entry?.id !== id)
      : [];
    await chrome.storage.local.set({ [STORAGE_KEYS.history]: history });
  });
  return getDashboard();
}

async function clearStorageList(key) {
  await enqueueStorageMutation(() => chrome.storage.local.set({ [key]: [] }));
  return getDashboard();
}

async function dispatchMessage(message, sender) {
  let trustedExtensionPage = false;
  if (typeof chrome.runtime?.getURL === "function") {
    const extensionRoot = chrome.runtime.getURL("");
    const extensionOrigin = extensionRoot.replace(/\/$/u, "");
    trustedExtensionPage = (
      typeof sender?.url === "string" && sender.url.startsWith(extensionRoot)
    ) || sender?.origin === extensionOrigin;
  }
  if (!CONTENT_SCRIPT_MESSAGES.has(message.type) && !trustedExtensionPage) {
    throw new TranslationError(
      "PRIVILEGED_MESSAGE_FORBIDDEN",
      "该操作只能从扩展管理页面执行"
    );
  }
  switch (message.type) {
    case "GET_TRANSLATION_DASHBOARD":
      return getDashboard();
    case "SAVE_TRANSLATION_SETTINGS":
      return saveSettings(message);
    case "TRANSLATE_TEXT":
      return translateText(message, sender);
    case "TEST_TRANSLATION_CONNECTION":
      return testConnection(message);
    case "DELETE_TRANSLATION_HISTORY_ITEM":
      return deleteHistoryItem(message);
    case "CLEAR_TRANSLATION_HISTORY":
      return clearStorageList(STORAGE_KEYS.history);
    case "CLEAR_TOKEN_USAGE":
      return clearStorageList(STORAGE_KEYS.usage);
    case "OPEN_TRANSLATION_OPTIONS":
      await chrome.runtime.openOptionsPage();
      return { opened: true };
    default:
      throw new TranslationError("UNKNOWN_MESSAGE", "不支持的后台消息");
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !SUPPORTED_MESSAGES.has(message.type)) {
    return undefined;
  }
  ensureBackgroundReady()
    .then(() => dispatchMessage(message, sender))
    .then((data) => sendResponse({ ok: true, ...data }))
    .catch((error) => {
      const safe = toSafeError(error);
      sendResponse({ ok: false, code: safe.code, error: safe.message });
    });
  return true;
});
