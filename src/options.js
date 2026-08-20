"use strict";

const i18n = globalThis.JP_TRANSLATION_I18N;
if (!i18n) {
  throw new Error("Management localization catalog is unavailable");
}

const state = {
  settings: {
    baseUrl: "",
    model: "",
    targetLanguage: "zh-CN",
    uiLanguage: "zh-CN",
    hasApiKey: false,
    apiKeyHint: ""
  },
  history: [],
  usageRecords: [],
  summary: {},
  dashboardPhase: "loading",
  dashboardError: ""
};

const sectionCopy = {
  api: ["nav.api", "page.api.description"],
  language: ["nav.language", "page.language.description"],
  history: ["nav.history", "page.history.description"],
  usage: ["nav.usage", "page.usage.description"]
};

const UI_LANGUAGE_NAMES = {
  "zh-CN": "中文",
  en: "English",
  ja: "日本語",
  ko: "한국어"
};

const elements = {};

function byId(id) {
  return document.getElementById(id);
}

function t(key, params = {}) {
  return i18n.translate(state.settings.uiLanguage, key, params);
}

function targetLanguageName(code) {
  const key = `target.${code}`;
  const translated = t(key);
  return translated === key ? code : translated;
}

function getErrorMessage(error) {
  if (typeof error?.code === "string") {
    const key = `error.${error.code}`;
    const translated = t(key);
    if (translated !== key) {
      return translated;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return t("error.generic");
}

function runtimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }
      if (response?.success === false || response?.ok === false) {
        const error = new Error(response.error || response.message || t("error.background"));
        error.code = response.code || "";
        reject(error);
        return;
      }
      resolve(response?.data ?? response);
    });
  });
}

function setBusy(button, busy, busyKey) {
  if (!button) {
    return;
  }
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.dataset.busyKey = busyKey;
    button.textContent = t(busyKey);
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
  } else {
    button.textContent = button.dataset.i18n
      ? t(button.dataset.i18n)
      : button.dataset.originalText || button.textContent;
    button.disabled = false;
    button.removeAttribute("aria-busy");
    delete button.dataset.originalText;
    delete button.dataset.busyKey;
  }
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast${type === "error" ? " is-error" : ""}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.textContent = message;
  elements.toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 4200);
}

function updateTargetLanguageCopy() {
  [...elements.targetLanguage.options].forEach((option) => {
    option.textContent = targetLanguageName(option.value);
  });
  elements.languagePreview.textContent = targetLanguageName(elements.targetLanguage.value);
}

function updateKeyVisibilityButton() {
  const reveal = elements.apiKey.type === "password";
  const key = reveal ? "button.showKey" : "button.hideKey";
  elements.toggleKeyVisibility.textContent = t(key);
  elements.toggleKeyVisibility.setAttribute("aria-label", `${t(key)} API Key`);
}

function updateConnectionBadge() {
  elements.connectionStatus.classList.remove("is-loading", "is-missing");
  const dot = document.createElement("span");
  dot.setAttribute("aria-hidden", "true");
  if (state.dashboardPhase === "loading") {
    elements.connectionStatus.classList.add("is-loading");
    elements.connectionStatus.replaceChildren(dot, document.createTextNode(t("status.loading")));
    return;
  }
  if (state.dashboardPhase === "error") {
    elements.connectionStatus.classList.add("is-missing");
    elements.connectionStatus.replaceChildren(dot, document.createTextNode(t("status.unavailable")));
    return;
  }
  if (state.settings.hasApiKey && state.settings.baseUrl && state.settings.model) {
    elements.connectionStatus.replaceChildren(dot, document.createTextNode(t("status.configured")));
  } else {
    elements.connectionStatus.classList.add("is-missing");
    elements.connectionStatus.replaceChildren(dot, document.createTextNode(t("status.missing")));
  }
}

function updateKeyHint() {
  if (state.settings.hasApiKey) {
    elements.apiKeyHint.textContent = state.settings.apiKeyHint
      ? t("key.savedWithHint", { hint: state.settings.apiKeyHint })
      : t("key.saved");
  } else {
    elements.apiKeyHint.textContent = t("key.notConfigured");
  }
}

function renderDashboardError() {
  if (state.dashboardPhase !== "error") {
    return;
  }
  elements.loadingState.replaceChildren(document.createTextNode(t("error.dashboardLoad", {
    message: state.dashboardError || t("error.generic")
  })));
}

function applyUiLanguage(locale) {
  state.settings.uiLanguage = i18n.normalizeLocale(locale);
  document.documentElement.lang = state.settings.uiLanguage;
  document.title = t("document.title");
  elements.uiLanguage.value = state.settings.uiLanguage;
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.dataset.busyKey || element.dataset.i18n;
    element.textContent = t(key);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder));
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
    element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
  });
  updateTargetLanguageCopy();
  updateKeyVisibilityButton();
  updateKeyHint();
  updateConnectionBadge();
  showSection(location.hash.slice(1), false);
  renderHistory();
  renderUsage();
  renderDashboardError();
}

function parseApiOrigin(baseUrl) {
  const rawBaseUrl = baseUrl.trim();
  let url;
  try {
    url = new URL(rawBaseUrl);
  } catch {
    throw new Error(t("error.baseUrlInvalid"));
  }
  if (url.username || url.password) {
    throw new Error(t("error.baseUrlCredentials"));
  }
  if (rawBaseUrl.includes("?") || rawBaseUrl.includes("#")) {
    throw new Error(t("error.baseUrlQuery"));
  }
  const isLocalHttp = url.protocol === "http:"
    && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (url.protocol !== "https:" && !isLocalHttp) {
    throw new Error(t("error.baseUrlHttps"));
  }
  if (!url.hostname) {
    throw new Error(t("error.baseUrlHost"));
  }
  return `${url.protocol}//${url.hostname}/*`;
}

function requestOriginPermission(originPattern) {
  return new Promise((resolve, reject) => {
    chrome.permissions.request({ origins: [originPattern] }, (granted) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }
      if (!granted) {
        reject(new Error(t("error.permissionDenied")));
        return;
      }
      resolve();
    });
  });
}

function containsOriginPermission(originPattern) {
  if (typeof chrome.permissions?.contains !== "function") {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      chrome.permissions.contains({ origins: [originPattern] }, (contains) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          resolve(null);
          return;
        }
        resolve(Boolean(contains));
      });
    } catch {
      resolve(null);
    }
  });
}

function removeOriginPermission(originPattern) {
  if (!originPattern || typeof chrome.permissions?.remove !== "function") {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    try {
      chrome.permissions.remove({ origins: [originPattern] }, (removed) => {
        const runtimeError = chrome.runtime.lastError;
        resolve(runtimeError ? false : Boolean(removed));
      });
    } catch {
      resolve(false);
    }
  });
}

function configuredOrigin(baseUrl) {
  if (!baseUrl) {
    return null;
  }
  try {
    const url = new URL(baseUrl);
    if ((url.protocol === "https:" || url.protocol === "http:") && url.hostname) {
      return `${url.protocol}//${url.hostname}/*`;
    }
    return null;
  } catch {
    return null;
  }
}

function currentSettings(includeApiKey = false) {
  const settings = {
    baseUrl: elements.baseUrl.value.trim().replace(/\/+$/, ""),
    model: elements.model.value.trim(),
    targetLanguage: elements.targetLanguage.value
  };
  const apiKey = elements.apiKey.value.trim();
  if (includeApiKey && apiKey) {
    settings.apiKey = apiKey;
  }
  return settings;
}

function validateSettings(settings) {
  parseApiOrigin(settings.baseUrl);
  if (!settings.model) {
    throw new Error(t("error.modelRequired"));
  }
  if (!settings.targetLanguage) {
    throw new Error(t("error.targetRequired"));
  }
}

function showSection(sectionName, updateHash = true) {
  const section = sectionCopy[sectionName] ? sectionName : "api";
  document.querySelectorAll("[data-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.panel !== section;
  });
  document.querySelectorAll(".nav-item").forEach((button) => {
    const active = button.dataset.section === section;
    button.classList.toggle("is-active", active);
    if (active) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });
  const [titleKey, descriptionKey] = sectionCopy[section];
  elements.pageTitle.textContent = t(titleKey);
  elements.pageDescription.textContent = t(descriptionKey);
  if (updateHash) {
    history.replaceState(null, "", `#${section}`);
  }
}

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function firstNumber(record, keys) {
  for (const key of keys) {
    if (record?.[key] !== undefined && record?.[key] !== null) {
      return safeNumber(record[key]);
    }
  }
  return 0;
}

function tokenValues(record) {
  const nestedUsage = record?.usage && typeof record.usage === "object"
    ? record.usage
    : null;
  const sources = nestedUsage ? [nestedUsage, record] : [record];
  const readToken = (keys) => {
    for (const source of sources) {
      for (const key of keys) {
        if (source?.[key] !== undefined && source?.[key] !== null) {
          return { found: true, value: safeNumber(source[key]) };
        }
      }
    }
    return { found: false, value: 0 };
  };
  const input = readToken(["inputTokens", "promptTokens", "input_tokens", "prompt_tokens"]);
  const output = readToken(["outputTokens", "completionTokens", "output_tokens", "completion_tokens"]);
  const total = readToken(["totalTokens", "total_tokens", "tokens"]);
  return {
    input: input.value,
    output: output.value,
    total: total.found ? total.value : input.value + output.value
  };
}

function getRecordDate(record) {
  return record?.createdAt || record?.timestamp || record?.date || record?.time || null;
}

function formatDateTime(value) {
  if (!value) {
    return t("time.unknown");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return new Intl.DateTimeFormat(state.settings.uiLanguage, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function localDateKey(value) {
  const date = value ? new Date(value) : new Date(NaN);
  if (Number.isNaN(date.getTime())) {
    const raw = typeof value === "string" ? value.match(/^\d{4}-\d{2}-\d{2}/)?.[0] : null;
    return raw || t("date.unknown");
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat(state.settings.uiLanguage).format(safeNumber(value));
}

function normalizeHistoryRecord(record, index) {
  let pageUrl = "";
  const rawPageUrl = String(record?.pageUrl ?? record?.url ?? "");
  try {
    const parsedPageUrl = new URL(rawPageUrl);
    if (parsedPageUrl.protocol === "https:" || parsedPageUrl.protocol === "http:") {
      pageUrl = parsedPageUrl.href;
    }
  } catch {
    pageUrl = "";
  }
  return {
    id: record?.id ?? record?._id ?? String(index),
    source: String(record?.sourceText ?? record?.source ?? record?.originalText ?? record?.original ?? ""),
    translation: String(record?.translatedText ?? record?.translation ?? record?.targetText ?? record?.result ?? ""),
    pageTitle: String(record?.pageTitle ?? record?.title ?? t("history.unknownPage")),
    pageUrl,
    createdAt: getRecordDate(record),
    tokens: tokenValues(record).total
  };
}

function createEmptyState(title, description) {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  const icon = document.createElement("span");
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "訳";
  const strong = document.createElement("strong");
  strong.textContent = title;
  const paragraph = document.createElement("p");
  paragraph.textContent = description;
  empty.append(icon, strong, paragraph);
  return empty;
}

function renderHistory() {
  const normalized = state.history.map(normalizeHistoryRecord);
  const query = elements.historySearch.value.trim().toLocaleLowerCase();
  const records = query
    ? normalized.filter((record) => [record.source, record.translation, record.pageTitle]
      .some((value) => value.toLocaleLowerCase().includes(query)))
    : normalized;

  elements.historyCount.textContent = query
    ? t("history.searchCount", { count: records.length, total: normalized.length })
    : t("history.count", { count: records.length });
  elements.historyList.replaceChildren();

  if (records.length === 0) {
    elements.historyList.append(createEmptyState(
      query ? t("history.noMatchTitle") : t("history.emptyTitle"),
      query ? t("history.noMatchDescription") : t("history.emptyDescription")
    ));
    return;
  }

  const fragment = document.createDocumentFragment();
  records.forEach((record) => {
    const item = document.createElement("article");
    item.className = "history-item";

    const copy = document.createElement("div");
    copy.className = "history-copy";
    const source = document.createElement("p");
    source.className = "history-text source";
    source.textContent = record.source || t("history.sourceEmpty");
    const translation = document.createElement("p");
    translation.className = "history-text translation";
    translation.textContent = record.translation || t("history.translationEmpty");

    const meta = document.createElement("div");
    meta.className = "history-meta";
    const page = document.createElement(record.pageUrl ? "a" : "span");
    page.textContent = record.pageTitle;
    if (record.pageUrl) {
      page.href = record.pageUrl;
      page.target = "_blank";
      page.rel = "noreferrer";
      page.title = record.pageUrl;
    }
    const time = document.createElement("span");
    time.textContent = formatDateTime(record.createdAt);
    const tokens = document.createElement("span");
    tokens.textContent = t("token.label", { count: formatNumber(record.tokens) });
    meta.append(page, time, tokens);
    copy.append(source, translation, meta);

    const remove = document.createElement("button");
    remove.className = "delete-item";
    remove.type = "button";
    remove.textContent = t("history.delete");
    remove.dataset.historyId = String(record.id);
    remove.setAttribute("aria-label", t("history.deleteAria", {
      title: record.source.slice(0, 24) || t("history.untitled")
    }));
    item.append(copy, remove);
    fragment.append(item);
  });
  elements.historyList.append(fragment);
}

function aggregateUsage() {
  const days = new Map();
  state.usageRecords.forEach((record) => {
    const key = localDateKey(getRecordDate(record));
    const tokens = tokenValues(record);
    const count = firstNumber(record, ["requestCount", "requests", "count"]) || 1;
    const current = days.get(key) || { date: key, requests: 0, input: 0, output: 0, total: 0 };
    current.requests += count;
    current.input += tokens.input;
    current.output += tokens.output;
    current.total += tokens.total;
    days.set(key, current);
  });
  return [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
}

function readSummaryValue(keys, fallback) {
  for (const key of keys) {
    if (state.summary?.[key] !== undefined && state.summary?.[key] !== null) {
      return safeNumber(state.summary[key]);
    }
  }
  return fallback;
}

function renderUsage() {
  const days = aggregateUsage();
  const calculated = days.reduce((sum, day) => ({
    requests: sum.requests + day.requests,
    input: sum.input + day.input,
    output: sum.output + day.output,
    total: sum.total + day.total
  }), { requests: 0, input: 0, output: 0, total: 0 });

  const input = readSummaryValue(["inputTokens", "promptTokens", "input_tokens"], calculated.input);
  const output = readSummaryValue(["outputTokens", "completionTokens", "output_tokens"], calculated.output);
  const total = readSummaryValue(["totalTokens", "total_tokens", "tokens"], calculated.total || input + output);
  const requests = readSummaryValue(["requestCount", "requests", "count"], calculated.requests);
  elements.metricTotal.textContent = formatNumber(total);
  elements.metricInput.textContent = formatNumber(input);
  elements.metricOutput.textContent = formatNumber(output);
  elements.metricRequests.textContent = formatNumber(requests);

  elements.usageTableBody.replaceChildren();
  elements.usageEmpty.hidden = days.length > 0;
  elements.usageTableBody.closest(".table-scroll").hidden = days.length === 0;
  const fragment = document.createDocumentFragment();
  days.forEach((day) => {
    const row = document.createElement("tr");
    [day.date, day.requests, day.input, day.output, day.total].forEach((value, index) => {
      const cell = document.createElement("td");
      cell.textContent = index === 0 ? String(value) : formatNumber(value);
      row.append(cell);
    });
    fragment.append(row);
  });
  elements.usageTableBody.append(fragment);
}

function applyDashboard(data) {
  const settings = data?.settings || {};
  state.settings = {
    baseUrl: String(settings.baseUrl || ""),
    model: String(settings.model || ""),
    targetLanguage: String(settings.targetLanguage || "zh-CN"),
    uiLanguage: i18n.normalizeLocale(settings.uiLanguage),
    hasApiKey: Boolean(settings.hasApiKey),
    apiKeyHint: String(settings.apiKeyHint || "")
  };
  state.history = Array.isArray(data?.history) ? data.history : [];
  state.usageRecords = Array.isArray(data?.usageRecords) ? data.usageRecords : [];
  state.summary = data?.summary && typeof data.summary === "object" ? data.summary : {};
  state.dashboardPhase = "ready";
  state.dashboardError = "";

  elements.baseUrl.value = state.settings.baseUrl;
  elements.model.value = state.settings.model;
  elements.apiKey.value = "";
  const languageExists = [...elements.targetLanguage.options]
    .some((option) => option.value === state.settings.targetLanguage);
  elements.targetLanguage.value = languageExists ? state.settings.targetLanguage : "zh-CN";
  applyUiLanguage(state.settings.uiLanguage);
}

async function refreshDashboard() {
  const dashboard = await runtimeMessage({ type: "GET_TRANSLATION_DASHBOARD" });
  applyDashboard(dashboard || {});
}

async function saveConnectionSettings() {
  const settings = currentSettings(true);
  validateSettings(settings);
  const newOrigin = parseApiOrigin(settings.baseUrl);
  const oldOrigin = configuredOrigin(state.settings.baseUrl);
  const previousPermissionCheck = containsOriginPermission(newOrigin);
  const permissionRequest = requestOriginPermission(newOrigin);
  const [permissionBeforeSave] = await Promise.all([
    previousPermissionCheck,
    permissionRequest
  ]);
  try {
    await runtimeMessage({
      type: "SAVE_TRANSLATION_SETTINGS",
      settings
    });
  } catch (error) {
    if (permissionBeforeSave === false) {
      await removeOriginPermission(newOrigin);
    }
    throw error;
  }
  if (oldOrigin && oldOrigin !== newOrigin) {
    await removeOriginPermission(oldOrigin);
  }
  await refreshDashboard();
}

async function testCurrentConnection() {
  const settings = currentSettings(true);
  validateSettings(settings);
  const testOrigin = parseApiOrigin(settings.baseUrl);
  const savedOrigin = configuredOrigin(state.settings.baseUrl);
  const previousPermissionCheck = containsOriginPermission(testOrigin);
  const permissionRequest = requestOriginPermission(testOrigin);
  const [permissionBeforeTest] = await Promise.all([
    previousPermissionCheck,
    permissionRequest
  ]);
  try {
    return await runtimeMessage({
      type: "TEST_TRANSLATION_CONNECTION",
      settings
    });
  } finally {
    if (permissionBeforeTest === false && testOrigin !== savedOrigin) {
      await removeOriginPermission(testOrigin);
    }
  }
}

async function saveTargetLanguage() {
  await runtimeMessage({
    type: "SAVE_TRANSLATION_SETTINGS",
    settings: {
      targetLanguage: elements.targetLanguage.value
    }
  });
  await refreshDashboard();
}

async function saveUiLanguage(uiLanguage) {
  const dashboard = await runtimeMessage({
    type: "SAVE_TRANSLATION_SETTINGS",
    settings: { uiLanguage }
  });
  state.settings.uiLanguage = i18n.normalizeLocale(
    dashboard?.settings?.uiLanguage || uiLanguage
  );
}

async function clearSavedApiKey() {
  const payload = {
    type: "SAVE_TRANSLATION_SETTINGS",
    settings: {
      clearApiKey: true
    },
    clearApiKey: true
  };
  await runtimeMessage(payload);
  await refreshDashboard();
}

function bindElements() {
  Object.assign(elements, {
    pageTitle: byId("page-title"),
    pageDescription: byId("page-description"),
    connectionStatus: byId("connection-status"),
    loadingState: byId("loading-state"),
    uiLanguage: byId("ui-language"),
    apiForm: byId("api-form"),
    apiKey: byId("api-key"),
    apiKeyHint: byId("api-key-hint"),
    baseUrl: byId("base-url"),
    model: byId("model"),
    toggleKeyVisibility: byId("toggle-key-visibility"),
    saveApi: byId("save-api"),
    testConnection: byId("test-connection"),
    clearApiKey: byId("clear-api-key"),
    languageForm: byId("language-form"),
    targetLanguage: byId("target-language"),
    languagePreview: byId("language-preview-value"),
    saveLanguage: byId("save-language"),
    historySearch: byId("history-search"),
    historyCount: byId("history-count"),
    historyList: byId("history-list"),
    clearHistory: byId("clear-history"),
    metricTotal: byId("metric-total"),
    metricInput: byId("metric-input"),
    metricOutput: byId("metric-output"),
    metricRequests: byId("metric-requests"),
    usageTableBody: byId("usage-table-body"),
    usageEmpty: byId("usage-empty"),
    clearUsage: byId("clear-usage"),
    toastRegion: byId("toast-region")
  });
}

function bindEvents() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => showSection(button.dataset.section));
  });

  elements.toggleKeyVisibility.addEventListener("click", () => {
    const reveal = elements.apiKey.type === "password";
    elements.apiKey.type = reveal ? "text" : "password";
    updateKeyVisibilityButton();
  });

  elements.uiLanguage.addEventListener("change", async () => {
    const previousLanguage = state.settings.uiLanguage;
    const nextLanguage = i18n.normalizeLocale(elements.uiLanguage.value);
    applyUiLanguage(nextLanguage);
    elements.uiLanguage.disabled = true;
    elements.uiLanguage.setAttribute("aria-busy", "true");
    try {
      await saveUiLanguage(nextLanguage);
      applyUiLanguage(state.settings.uiLanguage);
      showToast(t("toast.uiSaved", { language: UI_LANGUAGE_NAMES[state.settings.uiLanguage] }));
    } catch (error) {
      applyUiLanguage(previousLanguage);
      showToast(getErrorMessage(error), "error");
    } finally {
      elements.uiLanguage.disabled = false;
      elements.uiLanguage.removeAttribute("aria-busy");
      elements.uiLanguage.focus();
    }
  });

  elements.targetLanguage.addEventListener("change", () => {
    elements.languagePreview.textContent = targetLanguageName(elements.targetLanguage.value);
  });

  elements.apiForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setBusy(elements.saveApi, true, "busy.permission");
    try {
      await saveConnectionSettings();
      showToast(t("toast.apiSaved"));
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setBusy(elements.saveApi, false);
    }
  });

  elements.languageForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setBusy(elements.saveLanguage, true, "busy.saving");
    try {
      await saveTargetLanguage();
      showToast(t("toast.targetSaved", {
        language: targetLanguageName(elements.targetLanguage.value)
      }));
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setBusy(elements.saveLanguage, false);
    }
  });

  elements.testConnection.addEventListener("click", async () => {
    setBusy(elements.testConnection, true, "busy.testing");
    try {
      await testCurrentConnection();
      showToast(t("toast.connectionSuccess"));
    } catch (error) {
      showToast(t("error.connectionFailed", { message: getErrorMessage(error) }), "error");
    } finally {
      setBusy(elements.testConnection, false);
    }
  });

  elements.clearApiKey.addEventListener("click", async () => {
    if (!state.settings.hasApiKey) {
      showToast(t("toast.noKey"), "error");
      return;
    }
    if (!window.confirm(t("confirm.clearKey"))) {
      return;
    }
    setBusy(elements.clearApiKey, true, "busy.clearing");
    try {
      await clearSavedApiKey();
      showToast(t("toast.keyCleared"));
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setBusy(elements.clearApiKey, false);
    }
  });

  elements.historySearch.addEventListener("input", renderHistory);
  elements.historyList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-history-id]");
    if (!button) {
      return;
    }
    setBusy(button, true, "busy.deleting");
    try {
      const sourceRecord = state.history.find((record, index) => {
        const id = record?.id ?? record?._id ?? String(index);
        return String(id) === button.dataset.historyId;
      });
      const id = sourceRecord?.id ?? sourceRecord?._id ?? button.dataset.historyId;
      await runtimeMessage({ type: "DELETE_TRANSLATION_HISTORY_ITEM", id });
      await refreshDashboard();
      showToast(t("toast.historyDeleted"));
    } catch (error) {
      setBusy(button, false);
      showToast(getErrorMessage(error), "error");
    }
  });

  elements.clearHistory.addEventListener("click", async () => {
    if (state.history.length === 0) {
      showToast(t("toast.noHistory"), "error");
      return;
    }
    if (!window.confirm(t("confirm.clearHistory"))) {
      return;
    }
    setBusy(elements.clearHistory, true, "busy.clearing");
    try {
      await runtimeMessage({ type: "CLEAR_TRANSLATION_HISTORY" });
      await refreshDashboard();
      showToast(t("toast.historyCleared"));
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setBusy(elements.clearHistory, false);
    }
  });

  elements.clearUsage.addEventListener("click", async () => {
    const hasUsage = state.usageRecords.length > 0 || [
      state.summary?.totalTokens,
      state.summary?.inputTokens,
      state.summary?.outputTokens,
      state.summary?.requestCount,
      state.summary?.requests
    ].some((value) => safeNumber(value) > 0);
    if (!hasUsage) {
      showToast(t("toast.noUsage"), "error");
      return;
    }
    if (!window.confirm(t("confirm.clearUsage"))) {
      return;
    }
    setBusy(elements.clearUsage, true, "busy.clearing");
    try {
      await runtimeMessage({ type: "CLEAR_TOKEN_USAGE" });
      await refreshDashboard();
      showToast(t("toast.usageCleared"));
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setBusy(elements.clearUsage, false);
    }
  });
}

async function initialize() {
  bindElements();
  applyUiLanguage(state.settings.uiLanguage);
  bindEvents();
  showSection(location.hash.slice(1), false);
  try {
    await refreshDashboard();
    elements.loadingState.hidden = true;
    document.querySelector(`[data-panel="${sectionCopy[location.hash.slice(1)] ? location.hash.slice(1) : "api"}"]`).hidden = false;
  } catch (error) {
    state.dashboardPhase = "error";
    state.dashboardError = getErrorMessage(error);
    updateConnectionBadge();
    renderDashboardError();
    showToast(getErrorMessage(error), "error");
  }
}

document.addEventListener("DOMContentLoaded", initialize);
