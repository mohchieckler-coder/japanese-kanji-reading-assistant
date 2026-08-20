import assert from "node:assert/strict";
import test from "node:test";

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function selectStoredValues(storage, keys) {
  if (keys === null || keys === undefined) {
    return clone(storage);
  }
  const result = {};
  if (typeof keys === "string") {
    if (Object.hasOwn(storage, keys)) result[keys] = clone(storage[keys]);
    return result;
  }
  if (Array.isArray(keys)) {
    for (const key of keys) {
      if (Object.hasOwn(storage, key)) result[key] = clone(storage[key]);
    }
    return result;
  }
  for (const [key, fallback] of Object.entries(keys)) {
    result[key] = Object.hasOwn(storage, key) ? clone(storage[key]) : clone(fallback);
  }
  return result;
}

function sendRuntimeMessage(listener, message, sender = {
  url: "chrome-extension://integration-test/options.html",
  origin: "chrome-extension://integration-test"
}) {
  return new Promise((resolve, reject) => {
    const keepChannelOpen = listener(message, sender, resolve);
    if (keepChannelOpen !== true) {
      reject(new Error(`Message channel was not kept open for ${message.type}`));
    }
  });
}

test("background isolates credentials, calls a compatible API, and survives storage failures", async () => {
  const storage = {};
  const permissionChecks = [];
  const fetchCalls = [];
  const listeners = [];
  let releaseStorageProtection;
  let failHistoryWrites = false;
  let responseMode = "success";
  let optionsOpened = false;
  const storageProtectionGate = new Promise((resolve) => {
    releaseStorageProtection = resolve;
  });

  globalThis.chrome = {
    storage: {
      local: {
        async get(keys) {
          return selectStoredValues(storage, keys);
        },
        async set(values) {
          if (failHistoryWrites && Object.hasOwn(values, "translationHistory")) {
            throw new Error("QUOTA_BYTES exceeded");
          }
          Object.assign(storage, clone(values));
        },
        async setAccessLevel(details) {
          assert.deepEqual(details, { accessLevel: "TRUSTED_CONTEXTS" });
          await storageProtectionGate;
        }
      }
    },
    permissions: {
      async contains(details) {
        permissionChecks.push(clone(details));
        return true;
      }
    },
    runtime: {
      getURL(path = "") {
        return `chrome-extension://integration-test/${path}`;
      },
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
      onMessage: {
        addListener(listener) {
          listeners.push(listener);
        }
      },
      async openOptionsPage() {
        optionsOpened = true;
      }
    }
  };

  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url, init });
    const payload = {
      model: "compatible-test-model",
      choices: [{ message: { content: "测试译文" } }],
      usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 }
    };
    const body = JSON.stringify(payload);
    const declaredLength = responseMode === "too-large" ? 3_000_000 : new TextEncoder().encode(body).length;
    return {
      ok: true,
      status: 200,
      headers: {
        get(name) {
          return name.toLowerCase() === "content-length" ? String(declaredLength) : null;
        }
      },
      async json() {
        return clone(payload);
      },
      async text() {
        return body;
      }
    };
  };

  await import(`../../src/background.js?integration=${Date.now()}`);
  assert.equal(listeners.length, 1);
  const listener = listeners[0];
  const apiKey = "fake-integration-secret-1234";
  let saveSettled = false;
  const firstSave = sendRuntimeMessage(listener, {
    type: "SAVE_TRANSLATION_SETTINGS",
    settings: {
      baseUrl: "https://api.example.test/v1",
      model: "compatible-test-model",
      targetLanguage: "zh-CN",
      uiLanguage: "zh-CN",
      apiKey
    }
  }).then((result) => {
    saveSettled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(saveSettled, false, "messages must wait for storage access protection");
  releaseStorageProtection();
  const saveResponse = await firstSave;
  assert.equal(saveResponse.ok, true);
  assert.equal(saveResponse.settings.hasApiKey, true);
  assert.equal(saveResponse.settings.uiLanguage, "zh-CN");
  assert.equal("apiKey" in saveResponse.settings, false);
  assert.equal(JSON.stringify(saveResponse).includes(apiKey), false);

  const [uiLanguageSave, targetLanguageSave] = await Promise.all([
    sendRuntimeMessage(listener, {
      type: "SAVE_TRANSLATION_SETTINGS",
      settings: { uiLanguage: "ko" }
    }),
    sendRuntimeMessage(listener, {
      type: "SAVE_TRANSLATION_SETTINGS",
      settings: { targetLanguage: "en" }
    })
  ]);
  assert.equal(uiLanguageSave.ok, true);
  assert.equal(targetLanguageSave.ok, true);
  assert.equal(storage.translationSettings.uiLanguage, "ko");
  assert.equal(storage.translationSettings.targetLanguage, "en");
  assert.equal(storage.translationSettings.baseUrl, "https://api.example.test/v1");
  assert.equal(storage.translationSettings.model, "compatible-test-model");
  assert.equal(storage.translationSettings.apiKey, apiKey);

  const trustedOptionsDashboard = await sendRuntimeMessage(
    listener,
    { type: "GET_TRANSLATION_DASHBOARD" },
    {
      url: "chrome-extension://integration-test/options.html",
      tab: { id: 6, url: "chrome-extension://integration-test/options.html" }
    }
  );
  assert.equal(trustedOptionsDashboard.ok, true);

  const forbiddenDashboard = await sendRuntimeMessage(
    listener,
    { type: "GET_TRANSLATION_DASHBOARD" },
    { tab: { id: 7, url: "https://example.test/page" } }
  );
  assert.equal(forbiddenDashboard.ok, false);
  assert.equal(forbiddenDashboard.code, "PRIVILEGED_MESSAGE_FORBIDDEN");

  const translationResponse = await sendRuntimeMessage(
    listener,
    {
      type: "TRANSLATE_TEXT",
      text: "日本語を勉強します。",
      selectionType: "sentence",
      pageUrl: `https://example.test/news?marker=${apiKey}`,
      pageTitle: `新闻 ${apiKey}`
    },
    { tab: { url: "https://ignored.example.test", title: "ignored" } }
  );
  assert.equal(translationResponse.ok, true);
  assert.equal(translationResponse.translation, "测试译文");
  assert.deepEqual(translationResponse.usage, {
    inputTokens: 12,
    outputTokens: 6,
    totalTokens: 18
  });
  assert.equal(translationResponse.historySaved, true);
  assert.equal(translationResponse.usageSaved, true);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, "https://api.example.test/v1/chat/completions");
  assert.equal(fetchCalls[0].init.method, "POST");
  assert.equal(fetchCalls[0].init.credentials, "omit");
  assert.equal(fetchCalls[0].init.headers.Authorization, `Bearer ${apiKey}`);
  const requestBody = JSON.parse(fetchCalls[0].init.body);
  assert.equal(requestBody.model, "compatible-test-model");
  assert.equal(requestBody.messages.at(-1).content, "日本語を勉強します。");
  assert.deepEqual(permissionChecks.at(-1), { origins: ["https://api.example.test/*"] });
  assert.equal(storage.translationHistory.length, 1);
  assert.equal(storage.translationTokenUsage.length, 1);
  assert.equal(storage.translationHistory[0].pageUrl, "https://ignored.example.test");
  assert.equal(storage.translationHistory[0].pageTitle, "ignored");
  assert.equal(JSON.stringify(storage.translationHistory).includes(apiKey), false);
  assert.equal(JSON.stringify(storage.translationTokenUsage).includes(apiKey), false);

  const dashboard = await sendRuntimeMessage(listener, { type: "GET_TRANSLATION_DASHBOARD" });
  assert.equal(dashboard.ok, true);
  assert.equal(JSON.stringify(dashboard).includes(apiKey), false);
  assert.equal(dashboard.usageSummary.totalTokens, 18);

  failHistoryWrites = true;
  const nonFatalStorageFailure = await sendRuntimeMessage(listener, {
    type: "TRANSLATE_TEXT",
    text: "保存失败也要返回译文",
    selectionType: "sentence"
  });
  assert.equal(nonFatalStorageFailure.ok, true);
  assert.equal(nonFatalStorageFailure.translation, "测试译文");
  assert.equal(nonFatalStorageFailure.historySaved, false);
  assert.equal(nonFatalStorageFailure.usageSaved, true);
  failHistoryWrites = false;

  responseMode = "too-large";
  const oversizedResponse = await sendRuntimeMessage(listener, {
    type: "TRANSLATE_TEXT",
    text: "超大响应",
    selectionType: "word"
  });
  assert.equal(oversizedResponse.ok, false);
  assert.equal(oversizedResponse.code, "API_RESPONSE_TOO_LARGE");
  responseMode = "success";

  const opened = await sendRuntimeMessage(listener, { type: "OPEN_TRANSLATION_OPTIONS" });
  assert.equal(opened.ok, true);
  assert.equal(optionsOpened, true);

  const cleared = await sendRuntimeMessage(listener, {
    type: "SAVE_TRANSLATION_SETTINGS",
    settings: { clearApiKey: true },
    clearApiKey: true
  });
  assert.equal(cleared.ok, true);
  assert.equal(cleared.settings.hasApiKey, false);
  assert.equal(storage.translationSettings.apiKey, "");
  assert.equal(JSON.stringify(storage).includes(apiKey), false);

  const missingKey = await sendRuntimeMessage(listener, {
    type: "TRANSLATE_TEXT",
    text: "翻译",
    selectionType: "word"
  });
  assert.equal(missingKey.ok, false);
  assert.equal(missingKey.code, "API_KEY_MISSING");

  delete globalThis.fetch;
  delete globalThis.chrome;
});

test("background retries trusted storage protection after a transient startup failure", async () => {
  const listeners = [];
  let protectionAttempts = 0;
  let rejectFirstProtection;
  const firstProtection = new Promise((_resolve, reject) => {
    rejectFirstProtection = reject;
  });
  globalThis.chrome = {
    storage: {
      local: {
        async get() {
          return {};
        },
        async set() {},
        async setAccessLevel() {
          protectionAttempts += 1;
          if (protectionAttempts === 1) {
            await firstProtection;
          }
        }
      }
    },
    permissions: { async contains() { return true; } },
    runtime: {
      getURL(path = "") {
        return `chrome-extension://retry-test/${path}`;
      },
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
      onMessage: { addListener(listener) { listeners.push(listener); } },
      async openOptionsPage() {}
    }
  };

  await import(`../../src/background.js?retry=${Date.now()}`);
  assert.equal(listeners.length, 1);
  const firstMessage = sendRuntimeMessage(listeners[0], { type: "GET_TRANSLATION_DASHBOARD" });
  rejectFirstProtection(new Error("temporary storage API failure"));
  const firstResponse = await firstMessage;
  assert.equal(firstResponse.ok, false);
  assert.equal(firstResponse.code, "STORAGE_SECURITY_UNAVAILABLE");

  const secondResponse = await sendRuntimeMessage(
    listeners[0],
    { type: "GET_TRANSLATION_DASHBOARD" },
    { url: "chrome-extension://retry-test/options.html", origin: "chrome-extension://retry-test" }
  );
  assert.equal(secondResponse.ok, true);
  assert.equal(protectionAttempts, 2);
  delete globalThis.chrome;
});
