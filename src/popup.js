"use strict";

const i18n = globalThis.JP_TRANSLATION_I18N;
const statusElement = document.getElementById("status");
const toggleButton = document.getElementById("toggle");
const loanwordOriginButton = document.getElementById("toggle-loanword-origins");
const loanwordOriginStatusElement = document.getElementById("loanword-origin-status");
const openOptionsButton = document.getElementById("open-options");
const translationStatusElement = document.getElementById("translation-status");
const translationBadgeElement = document.getElementById("translation-badge");
const uiLanguageSelect = document.getElementById("ui-language");
const uiLanguageStatus = document.getElementById("ui-language-status");
const POPUP_BUILD_VERSION = "__EXTENSION_VERSION__";

let activeTabId = null;
let currentLocale = "zh-CN";
let manifestVersionMismatch = false;
let furiganaState = { phase: "checking" };
let loanwordOriginState = { phase: "checking" };
let translationState = { phase: "checking" };
let openOptionsState = "initializing";
let localeFeedback = null;
let localeFeedbackRevision = 0;
let localeSelectionRevision = 0;
let toggleOperationBusy = false;
let loanwordOperationBusy = false;

function normalizeLocale(value) {
  return i18n?.normalizeLocale(value) || "zh-CN";
}

function t(key, params = {}) {
  return i18n?.translate(currentLocale, key, params) || key;
}

function localizeError(error) {
  const code = typeof error?.code === "string" ? error.code : "";
  if (code) {
    const key = `error.${code}`;
    const localized = t(key);
    if (localized !== key) {
      return localized;
    }
  }
  return error instanceof Error ? error.message : String(error || t("error.generic"));
}

function targetLanguageLabel(code) {
  const normalizedCode = String(code || "zh-CN");
  const key = `target.${normalizedCode}`;
  const localized = t(key);
  return localized === key ? normalizedCode : localized;
}

function renderStaticText() {
  document.documentElement.lang = currentLocale;
  document.title = t("popup.document.title");
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  uiLanguageSelect.value = currentLocale;
  const languageAria = t("popup.uiLanguage.aria");
  uiLanguageSelect.setAttribute("aria-label", languageAria);
  uiLanguageSelect.title = languageAria;
}

function renderFurigana() {
  const phase = furiganaState?.phase || "ready";
  const phaseBusy = phase === "checking" || phase === "loading";
  toggleButton.disabled = toggleOperationBusy || ["checking", "loading", "system-page", "no-tab", "version-mismatch"].includes(phase);
  toggleButton.setAttribute("aria-busy", String(toggleOperationBusy || phaseBusy));

  if (phase === "checking") {
    statusElement.textContent = t("popup.status.checking");
    toggleButton.textContent = t("popup.button.enable");
  } else if (phase === "loading") {
    statusElement.textContent = t("popup.status.loading");
    toggleButton.textContent = t("popup.button.analyzing");
  } else if (phase === "enabled") {
    const count = new Intl.NumberFormat(currentLocale).format(Number(furiganaState.count) || 0);
    statusElement.textContent = t("popup.status.enabled", { count });
    toggleButton.textContent = t("popup.button.remove");
  } else if (phase === "idle") {
    statusElement.textContent = t("popup.status.idle");
    toggleButton.textContent = t("popup.button.reannotate");
  } else if (phase === "error") {
    const message = furiganaState.errorKey
      ? t(furiganaState.errorKey)
      : localizeError(furiganaState.message || t("popup.status.unknownError"));
    statusElement.textContent = t("popup.status.error", { message });
    toggleButton.textContent = t("popup.button.retry");
  } else if (phase === "system-page") {
    statusElement.textContent = t("popup.status.systemPage");
    toggleButton.textContent = t("popup.button.enable");
  } else if (phase === "no-tab") {
    statusElement.textContent = t("popup.status.noActiveTab");
    toggleButton.textContent = t("popup.button.enable");
  } else if (phase === "version-mismatch") {
    statusElement.textContent = t("popup.status.versionMismatch", {
      runtimeVersion: furiganaState.runtimeVersion,
      buildVersion: furiganaState.buildVersion
    });
    toggleButton.textContent = t("popup.button.enable");
  } else {
    statusElement.textContent = t("popup.status.ready");
    toggleButton.textContent = t("popup.button.enable");
    toggleButton.disabled = false;
  }

  if (toggleOperationBusy && phase !== "loading") {
    toggleButton.textContent = t("popup.button.analyzing");
    toggleButton.disabled = true;
  }
}

function renderLoanwordOrigins() {
  const phase = loanwordOriginState?.phase || "idle";
  const phaseBusy = phase === "checking" || phase === "loading";
  const blocked = ["checking", "loading", "system-page", "no-tab", "version-mismatch"].includes(phase);
  const enabled = phase === "enabled";

  loanwordOriginButton.disabled = loanwordOperationBusy || blocked;
  loanwordOriginButton.setAttribute("aria-busy", String(loanwordOperationBusy || phaseBusy));
  loanwordOriginButton.setAttribute("aria-pressed", String(enabled));
  loanwordOriginButton.classList.toggle("active", enabled);
  loanwordOriginStatusElement.classList.toggle("error", phase === "error");

  if (phase === "checking") {
    loanwordOriginStatusElement.textContent = t("popup.loanword.status.checking");
    loanwordOriginButton.textContent = t("popup.loanword.button.enable");
  } else if (phase === "loading") {
    loanwordOriginStatusElement.textContent = t("popup.loanword.status.loading");
    loanwordOriginButton.textContent = t("popup.loanword.button.analyzing");
  } else if (phase === "enabled") {
    const count = new Intl.NumberFormat(currentLocale).format(Number(loanwordOriginState.count) || 0);
    loanwordOriginStatusElement.textContent = Number(loanwordOriginState.count) > 0
      ? t("popup.loanword.status.enabled", { count })
      : t("popup.loanword.status.enabledEmpty");
    loanwordOriginButton.textContent = t("popup.loanword.button.remove");
  } else if (phase === "error") {
    const message = loanwordOriginState.errorKey
      ? t(loanwordOriginState.errorKey)
      : localizeError(loanwordOriginState.message || t("popup.status.unknownError"));
    loanwordOriginStatusElement.textContent = t("popup.loanword.status.error", { message });
    loanwordOriginButton.textContent = t("popup.loanword.button.retry");
  } else if (phase === "system-page") {
    loanwordOriginStatusElement.textContent = t("popup.loanword.status.systemPage");
    loanwordOriginButton.textContent = t("popup.loanword.button.enable");
  } else if (phase === "no-tab") {
    loanwordOriginStatusElement.textContent = t("popup.loanword.status.noActiveTab");
    loanwordOriginButton.textContent = t("popup.loanword.button.enable");
  } else if (phase === "version-mismatch") {
    loanwordOriginStatusElement.textContent = t("popup.loanword.status.versionReload");
    loanwordOriginButton.textContent = t("popup.loanword.button.enable");
  } else {
    loanwordOriginStatusElement.textContent = phase === "idle"
      ? t("popup.loanword.status.idle")
      : t("popup.loanword.status.ready");
    loanwordOriginButton.textContent = t("popup.loanword.button.enable");
    loanwordOriginButton.disabled = false;
  }

  if (loanwordOperationBusy && phase !== "loading") {
    loanwordOriginButton.textContent = t("popup.loanword.button.analyzing");
    loanwordOriginButton.disabled = true;
  }
}

function renderTranslation() {
  translationBadgeElement.classList.remove("ready");
  translationStatusElement.title = "";

  if (translationState.phase === "configured") {
    const language = targetLanguageLabel(translationState.settings?.targetLanguage);
    const model = translationState.settings?.model || t("popup.value.notSet");
    translationBadgeElement.textContent = t("popup.badge.configured");
    translationBadgeElement.classList.add("ready");
    translationStatusElement.textContent = t("popup.translation.configured", { language, model });
  } else if (translationState.phase === "not-configured") {
    translationBadgeElement.textContent = t("popup.badge.notConfigured");
    translationStatusElement.textContent = t("popup.translation.notConfigured");
  } else if (translationState.phase === "version-mismatch") {
    translationBadgeElement.textContent = t("popup.badge.reload");
    translationStatusElement.textContent = t("popup.translation.versionReload");
  } else if (translationState.phase === "reload-error") {
    translationBadgeElement.textContent = t("popup.badge.reload");
    translationStatusElement.textContent = t("popup.translation.reloadFailed", {
      message: localizeError(translationState.error)
    });
  } else if (translationState.phase === "open-error") {
    translationBadgeElement.textContent = t("popup.badge.notConfigured");
    translationStatusElement.textContent = t("popup.translation.openFailed", {
      message: localizeError(translationState.error)
    });
  } else if (translationState.phase === "unavailable") {
    translationBadgeElement.textContent = t("popup.badge.notConfigured");
    translationStatusElement.textContent = t("popup.translation.backendUnavailable");
    translationStatusElement.title = t("popup.translation.backendUnavailable");
  } else {
    translationBadgeElement.textContent = t("popup.badge.checking");
    translationStatusElement.textContent = t("popup.translation.checking");
  }
}

function renderOpenOptions() {
  const busy = ["initializing", "opening", "reloading"].includes(openOptionsState);
  openOptionsButton.disabled = busy;
  openOptionsButton.setAttribute("aria-busy", String(busy));
  if (openOptionsState === "reloading") {
    openOptionsButton.textContent = t("popup.button.reloading");
  } else if (openOptionsState === "opening") {
    openOptionsButton.textContent = t("popup.button.opening");
  } else {
    openOptionsButton.textContent = t(manifestVersionMismatch ? "popup.button.reload" : "popup.button.openOptions");
  }
}

function renderLocaleFeedback() {
  uiLanguageStatus.classList.toggle("visible", Boolean(localeFeedback));
  uiLanguageStatus.classList.toggle("error", localeFeedback?.kind === "error");
  uiLanguageStatus.textContent = localeFeedback ? t(localeFeedback.key, localeFeedback.params) : "";
}

function applyLocale(locale) {
  currentLocale = normalizeLocale(locale);
  renderStaticText();
  renderFurigana();
  renderLoanwordOrigins();
  renderTranslation();
  renderOpenOptions();
  renderLocaleFeedback();
}

function updateFuriganaState(status) {
  furiganaState = status || { phase: "ready" };
  renderFurigana();
}

function updateLoanwordOriginState(status) {
  loanwordOriginState = status || { phase: "ready" };
  renderLoanwordOrigins();
}

function showLocaleFeedback(key, params, kind = "success") {
  localeFeedbackRevision += 1;
  const revision = localeFeedbackRevision;
  localeFeedback = { key, params, kind };
  renderLocaleFeedback();
  globalThis.setTimeout(() => {
    if (localeFeedbackRevision === revision) {
      localeFeedback = null;
      renderLocaleFeedback();
    }
  }, kind === "error" ? 6000 : 3000);
}

function renderVersionMismatch() {
  const runtimeVersion = chrome.runtime.getManifest?.().version || "";
  const buildVersion = POPUP_BUILD_VERSION;
  if (!runtimeVersion || buildVersion.startsWith("__") || runtimeVersion === buildVersion) {
    return false;
  }

  manifestVersionMismatch = true;
  furiganaState = { phase: "version-mismatch", runtimeVersion, buildVersion };
  loanwordOriginState = { phase: "version-mismatch" };
  translationState = { phase: "version-mismatch" };
  uiLanguageSelect.disabled = true;
  renderFurigana();
  renderLoanwordOrigins();
  renderTranslation();
  renderOpenOptions();
  return true;
}

function sendTabMessage(type) {
  return chrome.tabs.sendMessage(activeTabId, { type });
}

async function injectContentScriptForLoanwordOrigins() {
  const target = { tabId: activeTabId };
  await chrome.scripting.executeScript({
    target,
    func: () => {
      globalThis.__JP_LOANWORD_ONLY_BOOTSTRAP__ = true;
    }
  });
  try {
    await chrome.scripting.executeScript({
      target,
      files: ["content.js"]
    });
  } catch (error) {
    try {
      await chrome.scripting.executeScript({
        target,
        func: () => {
          delete globalThis.__JP_LOANWORD_ONLY_BOOTSTRAP__;
        }
      });
    } catch {
      // Keep the original injection error; cleanup is best effort only.
    }
    throw error;
  }
}

async function readStatus() {
  try {
    return await sendTabMessage("GET_FURIGANA_STATUS");
  } catch {
    return { phase: "not-injected" };
  }
}

async function readLoanwordOriginStatus() {
  try {
    return await sendTabMessage("GET_LOANWORD_ORIGIN_STATUS");
  } catch {
    return { phase: "ready" };
  }
}

async function waitForReady() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const status = await readStatus();
    updateFuriganaState(status);
    const phase = status?.phase;
    if (phase !== "loading" && phase !== "idle") {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  updateFuriganaState({ phase: "error", errorKey: "popup.status.dictionaryTimeout" });
}

async function waitForLoanwordOriginsReady() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const status = await readLoanwordOriginStatus();
    updateLoanwordOriginState(status);
    if (status?.phase !== "loading") {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  updateLoanwordOriginState({
    phase: "error",
    errorKey: "popup.loanword.status.timeout"
  });
}

async function readStoredUiLanguage() {
  try {
    if (typeof chrome.storage?.local?.get !== "function") {
      return "";
    }
    const stored = await chrome.storage.local.get("translationSettings");
    return stored?.translationSettings?.uiLanguage || "";
  } catch {
    return "";
  }
}

async function loadTranslationDashboard() {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const dashboard = await chrome.runtime.sendMessage({ type: "GET_TRANSLATION_DASHBOARD" });
      if (dashboard?.ok === false) {
        const error = new Error(dashboard.error || t("popup.translation.backgroundError"));
        error.code = dashboard.code || "";
        throw error;
      }
      return dashboard || {};
    } catch (error) {
      lastError = error;
      if (attempt < 4) {
        await new Promise((resolve) => setTimeout(resolve, 120 * (attempt + 1)));
      }
    }
  }
  throw lastError || new Error(t("popup.translation.backgroundError"));
}

async function initialize() {
  const mismatch = renderVersionMismatch();
  const initialLocaleRevision = localeSelectionRevision;
  const storedLocale = await readStoredUiLanguage();
  if (localeSelectionRevision === initialLocaleRevision) {
    applyLocale(storedLocale || "zh-CN");
  }
  if (mismatch) {
    openOptionsState = "idle";
    renderOpenOptions();
    return;
  }

  const dashboardPromise = loadTranslationDashboard();
  const activeTabPromise = Promise.resolve()
    .then(() => chrome.tabs.query({ active: true, currentWindow: true }))
    .then((tabs) => ({ tabs }), (error) => ({ error }));

  try {
    const dashboard = await dashboardPromise;
    const settings = dashboard?.settings || {};
    if (localeSelectionRevision === initialLocaleRevision) {
      applyLocale(settings.uiLanguage || storedLocale || "zh-CN");
    }
    translationState = settings.hasApiKey
      ? { phase: "configured", settings }
      : { phase: "not-configured", settings };
  } catch (error) {
    translationState = { phase: "unavailable", error };
  } finally {
    uiLanguageSelect.disabled = false;
    uiLanguageSelect.setAttribute("aria-busy", "false");
    openOptionsState = "idle";
    renderOpenOptions();
  }
  renderTranslation();

  const activeTabResult = await activeTabPromise;
  if (activeTabResult.error) {
    updateFuriganaState({ phase: "error", message: activeTabResult.error });
    updateLoanwordOriginState({ phase: "error", message: activeTabResult.error });
    return;
  }
  const tabs = activeTabResult.tabs;
  const [tab] = tabs || [];
  if (!tab?.id) {
    updateFuriganaState({ phase: "no-tab" });
    updateLoanwordOriginState({ phase: "no-tab" });
    return;
  }
  activeTabId = tab.id;

  if (!/^(https?|file):/i.test(tab.url || "")) {
    updateFuriganaState({ phase: "system-page" });
    updateLoanwordOriginState({ phase: "system-page" });
    return;
  }

  const [furiganaStatus, loanwordStatus] = await Promise.all([
    readStatus(),
    readLoanwordOriginStatus()
  ]);
  updateFuriganaState(furiganaStatus);
  updateLoanwordOriginState(loanwordStatus);
  if (loanwordStatus?.phase === "loading") {
    await waitForLoanwordOriginsReady();
  }
}

uiLanguageSelect.addEventListener("change", async () => {
  const previousLocale = currentLocale;
  const nextLocale = normalizeLocale(uiLanguageSelect.value);
  if (nextLocale === previousLocale) {
    return;
  }

  localeSelectionRevision += 1;
  localeFeedback = null;
  applyLocale(nextLocale);
  uiLanguageSelect.disabled = true;
  uiLanguageSelect.setAttribute("aria-busy", "true");
  try {
    const response = await chrome.runtime.sendMessage({
      type: "SAVE_TRANSLATION_SETTINGS",
      settings: { uiLanguage: nextLocale }
    });
    if (response?.ok === false) {
      const error = new Error(response.error || t("error.generic"));
      error.code = response.code || "";
      throw error;
    }
    const savedLocale = normalizeLocale(response?.settings?.uiLanguage || nextLocale);
    applyLocale(savedLocale);
    showLocaleFeedback("popup.locale.saved", { language: t(`popup.locale.${savedLocale}`) });
  } catch (error) {
    applyLocale(previousLocale);
    showLocaleFeedback("popup.locale.saveFailed", { message: localizeError(error) }, "error");
  } finally {
    uiLanguageSelect.disabled = manifestVersionMismatch;
    uiLanguageSelect.setAttribute("aria-busy", "false");
  }
});

openOptionsButton.addEventListener("click", async () => {
  if (manifestVersionMismatch) {
    openOptionsState = "reloading";
    renderOpenOptions();
    try {
      await chrome.runtime.reload();
    } catch (error) {
      translationState = { phase: "reload-error", error };
      openOptionsState = "idle";
      renderTranslation();
      renderOpenOptions();
    }
    return;
  }

  openOptionsState = "opening";
  renderOpenOptions();
  try {
    await chrome.runtime.openOptionsPage();
  } catch {
    try {
      await chrome.tabs.create({ url: chrome.runtime.getURL("options.html") });
    } catch (error) {
      translationState = { phase: "open-error", error };
      openOptionsState = "idle";
      renderTranslation();
      renderOpenOptions();
    }
  }
});

toggleButton.addEventListener("click", async () => {
  toggleOperationBusy = true;
  renderFurigana();
  try {
    let status;
    try {
      status = await sendTabMessage("TOGGLE_FURIGANA");
    } catch {
      await chrome.scripting.executeScript({
        target: { tabId: activeTabId },
        files: ["content.js"]
      });
      status = await readStatus();
    }
    updateFuriganaState(status);
    if (status?.phase === "loading") {
      await waitForReady();
    }
  } catch (error) {
    updateFuriganaState({ phase: "error", message: error });
  } finally {
    toggleOperationBusy = false;
    renderFurigana();
  }
});

loanwordOriginButton.addEventListener("click", async () => {
  loanwordOperationBusy = true;
  renderLoanwordOrigins();
  try {
    let status;
    try {
      status = await sendTabMessage("TOGGLE_LOANWORD_ORIGINS");
    } catch {
      await injectContentScriptForLoanwordOrigins();
      status = await sendTabMessage("TOGGLE_LOANWORD_ORIGINS");
    }
    updateLoanwordOriginState(status);
    if (status?.phase === "loading") {
      await waitForLoanwordOriginsReady();
    }
  } catch (error) {
    updateLoanwordOriginState({ phase: "error", message: error });
  } finally {
    loanwordOperationBusy = false;
    renderLoanwordOrigins();
  }
});

initialize().catch((error) => {
  translationState = { phase: "unavailable", error };
  updateFuriganaState({ phase: "error", message: error });
  updateLoanwordOriginState({ phase: "error", message: error });
  renderTranslation();
});
