import test from "node:test";
import assert from "node:assert/strict";

await import(`../../src/options-i18n.js?test=${Date.now()}`);

const i18n = globalThis.JP_TRANSLATION_I18N;

test("management localization catalogs cover Chinese, English, Japanese, and Korean", () => {
  assert.deepEqual(i18n.supportedLocales, ["zh-CN", "en", "ja", "ko"]);
  const referenceKeys = i18n.catalogKeys("zh-CN");
  assert.ok(referenceKeys.length > 100);

  for (const locale of i18n.supportedLocales) {
    assert.deepEqual(i18n.catalogKeys(locale), referenceKeys, `${locale} catalog keys differ`);
    for (const key of referenceKeys) {
      const output = i18n.translate(locale, key, {
        count: 2,
        total: 3,
        hint: "••••1234",
        key: "API key",
        language: "English",
        message: "details",
        model: "test-model",
        runtimeVersion: "2.1.0",
        buildVersion: "2.3.0",
        title: "sample"
      });
      assert.ok(output && output !== key, `${locale}:${key} is missing`);
      assert.doesNotMatch(output, /\{[A-Za-z][A-Za-z0-9]*\}/u, `${locale}:${key} has an unresolved parameter`);
    }
  }
});

test("management localization falls back safely and handles English record plurals", () => {
  assert.equal(i18n.normalizeLocale("fr"), "zh-CN");
  assert.equal(i18n.translate("en", "history.count", { count: 1 }), "1 record");
  assert.equal(i18n.translate("en", "history.count", { count: 2 }), "2 records");
  assert.equal(
    i18n.translate("en", "history.searchCount", { count: 1, total: 2 }),
    "Found 1 of 2 records"
  );
  assert.equal(i18n.translate("ja", "target.ko"), "韓国語");
  assert.equal(i18n.translate("ko", "target.ja"), "일본어");
});
