import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "dist");
const requiredFiles = [
  "manifest.json",
  "popup.html",
  "popup.css",
  "popup.js",
  "content.js",
  "background.js",
  "options.html",
  "options.css",
  "options-i18n.js",
  "options.js"
];
const requiredIconSizes = [16, 32, 48, 128];
const requiredThirdPartyFiles = [
  "THIRD_PARTY_NOTICES.md",
  "third_party_licenses/kuromoji/LICENSE-2.0.txt",
  "third_party_licenses/kuromoji/NOTICE.md",
  "third_party_licenses/async/LICENSE",
  "third_party_licenses/lodash/LICENSE",
  "third_party_licenses/doublearray/LICENSE.txt",
  "third_party_licenses/zlibjs/LICENSE"
];

function readPngSize(path) {
  const data = readFileSync(path);
  const pngSignature = "89504e470d0a1a0a";
  if (data.subarray(0, 8).toString("hex") !== pngSignature) {
    throw new Error(`Not a valid PNG file: ${path}`);
  }
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
    colorType: data[25]
  };
}

for (const file of requiredFiles) {
  const path = join(output, file);
  if (!existsSync(path) || statSync(path).size === 0) {
    throw new Error(`Missing or empty build artifact: ${file}`);
  }
}

for (const file of requiredThirdPartyFiles) {
  const path = join(output, file);
  if (!existsSync(path) || statSync(path).size === 0) {
    throw new Error(`Missing or empty third-party notice artifact: ${file}`);
  }
}

const manifest = JSON.parse(readFileSync(join(output, "manifest.json"), "utf8"));
const packageMetadata = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (manifest.manifest_version !== 3) {
  throw new Error("manifest_version must be 3");
}
if (manifest.version !== packageMetadata.version) {
  throw new Error(`Manifest version ${manifest.version} does not match package version ${packageMetadata.version}`);
}
if (Number.parseInt(manifest.minimum_chrome_version, 10) < 120) {
  throw new Error("minimum_chrome_version must protect the storage access-level requirement");
}
for (const permission of ["activeTab", "scripting", "storage"]) {
  if (!manifest.permissions?.includes(permission)) {
    throw new Error(`Missing permission: ${permission}`);
  }
}
if (manifest.background?.service_worker !== "background.js") {
  throw new Error("Manifest background service worker is missing");
}
if (manifest.options_ui?.page !== "options.html" || manifest.options_ui?.open_in_tab !== true) {
  throw new Error("Manifest options_ui configuration is invalid");
}
for (const origin of ["https://*/*", "http://localhost/*", "http://127.0.0.1/*"]) {
  if (!manifest.optional_host_permissions?.includes(origin)) {
    throw new Error(`Missing optional host permission: ${origin}`);
  }
}
if (manifest.optional_host_permissions?.includes("http://*/*")) {
  throw new Error("Remote plain-HTTP optional permission must not be declared");
}

for (const size of requiredIconSizes) {
  const expectedPath = `icons/icon-${size}.png`;
  if (manifest.icons?.[size] !== expectedPath || manifest.action?.default_icon?.[size] !== expectedPath) {
    throw new Error(`Manifest icon mapping is invalid for ${size}px`);
  }
  const icon = readPngSize(join(output, expectedPath));
  if (icon.width !== size || icon.height !== size) {
    throw new Error(`Icon ${expectedPath} is ${icon.width}x${icon.height}, expected ${size}x${size}`);
  }
  if (icon.colorType !== 6) {
    throw new Error(`Icon ${expectedPath} must use RGBA color for transparency`);
  }
}

const dictionaryFiles = readdirSync(join(output, "dict")).filter((file) => file.endsWith(".gz"));
if (dictionaryFiles.length < 10) {
  throw new Error(`Dictionary copy looks incomplete: found ${dictionaryFiles.length} gzip files`);
}

const contentBundle = readFileSync(join(output, "content.js"), "utf8");
if (!contentBundle.includes("__japaneseFuriganaAiController__")) {
  throw new Error("Content bundle does not contain the controller marker");
}
if (!contentBundle.includes("TRANSLATE_TEXT")) {
  throw new Error("Content bundle does not contain selection translation support");
}
if (contentBundle.includes("__EXTENSION_VERSION__")) {
  throw new Error("Content build-version placeholder was not replaced");
}
if (!contentBundle.includes(`CONTENT_BUILD_VERSION = "${packageMetadata.version}"`)) {
  throw new Error("Content bundle does not contain the package build version");
}

const backgroundBundle = readFileSync(join(output, "background.js"), "utf8");
for (const marker of ["TRANSLATE_TEXT", "GET_TRANSLATION_DASHBOARD", "translationSettings"]) {
  if (!backgroundBundle.includes(marker)) {
    throw new Error(`Background bundle is missing marker: ${marker}`);
  }
}

for (const file of ["content.js", "background.js", "popup.js", "options.js", "options-i18n.js"]) {
  const source = readFileSync(join(output, file), "utf8");
  if (/\beval\s*\(/u.test(source) || /\b(?:new\s+)?Function\s*\(/u.test(source)) {
    throw new Error(`${file} contains dynamic code construction forbidden by the Chrome Web Store`);
  }
}

const optionsI18nBundle = readFileSync(join(output, "options-i18n.js"), "utf8");
for (const marker of ["zh-CN", "English", "日本語", "한국어", "JP_TRANSLATION_I18N"]) {
  if (!optionsI18nBundle.includes(marker)) {
    throw new Error(`Shared localization catalog is missing marker: ${marker}`);
  }
}

const popupHtml = readFileSync(join(output, "popup.html"), "utf8");
const popupI18nIndex = popupHtml.indexOf('<script src="options-i18n.js"></script>');
const popupScriptIndex = popupHtml.indexOf('<script src="popup.js"></script>');
if (popupI18nIndex < 0 || popupScriptIndex < 0 || popupI18nIndex > popupScriptIndex) {
  throw new Error("Popup must load the shared localization catalog before popup.js");
}

const popupBundle = readFileSync(join(output, "popup.js"), "utf8");
if (popupBundle.includes("__EXTENSION_VERSION__")) {
  throw new Error("Popup build-version placeholder was not replaced");
}
if (!popupBundle.includes(`const POPUP_BUILD_VERSION = "${packageMetadata.version}"`)) {
  throw new Error("Popup does not contain the package build version");
}
for (const marker of ["JP_TRANSLATION_I18N", "uiLanguage", "SAVE_TRANSLATION_SETTINGS"]) {
  if (!popupBundle.includes(marker)) {
    throw new Error(`Popup localization support is missing marker: ${marker}`);
  }
}

console.log(
  `Build validation passed (${dictionaryFiles.length} dictionary files, ${requiredIconSizes.length} icons, ${requiredThirdPartyFiles.length} third-party notice files).`
);
