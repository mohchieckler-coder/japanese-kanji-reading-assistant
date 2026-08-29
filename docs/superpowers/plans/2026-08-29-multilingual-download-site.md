# Multilingual Download Website Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task by task. Before changing production files, use `superpowers:using-git-worktrees` to create an isolated worktree from the current commit.

**Goal:** Add independently addressable Simplified Chinese, English, Japanese, Korean, and Vietnamese versions of the static download homepage and privacy policy while preserving the current design, release ZIP, responsiveness, accessibility, and GitHub Pages project path.

**Architecture:** Keep plain static HTML/CSS/JavaScript. Chinese remains in `docs/`; English, Japanese, Korean, and Vietnamese live in `docs/en/`, `docs/ja/`, `docs/ko/`, and `docs/vi/`. All ten HTML pages share root assets and the same download ZIP. Real anchor links provide no-JavaScript locale switching; the existing script only enhances menu labels and hash preservation. Canonical, `hreflang`, sitemap, and robots metadata use absolute GitHub Pages URLs.

**Tech Stack:** Semantic HTML5, existing vanilla CSS, existing vanilla JavaScript, Python 3, Playwright, `xml.etree.ElementTree`, GitHub Pages.

**Approved design:** `docs/superpowers/specs/2026-08-29-multilingual-download-site-design.md`

---

## Execution constraints

- Work from an isolated `codex/multilingual-download-site` branch/worktree created from the approved specification commit.
- Do not push, deploy, or change the GitHub Pages configuration unless the user explicitly requests publication in a later step.
- Do not rebuild, replace, rename, or duplicate `docs/downloads/japanese-furigana-ai-2.6.0.zip`.
- Do not add a framework, package dependency, remote font, analytics request, or runtime translation service.
- Preserve the Japanese text used in product demonstrations. Localize the surrounding explanation, control labels, metadata, and accessibility text.
- Treat Vietnamese as a website locale only. Never describe it as a supported extension interface language.
- Use `apply_patch` for hand-authored file changes.

## Task 1: Define the failing multilingual website contract

**Files:**

- Modify: `tests/docs_site_test.py`

### Step 1: Replace single-page constants with a locale matrix

Add constants equivalent to:

```python
DOCS_ROOT = ROOT / "docs"
PUBLIC_BASE = "https://mohchieckler-coder.github.io/japanese-kanji-reading-assistant/"
EXPECTED_DOWNLOAD_SHA256 = "D9F1D1D8F6A7B98AEC19DB91B562FA7A5B1589681CFB07C670C66C17AD755CD4"

LOCALES = {
    "zh-CN": {
        "directory": DOCS_ROOT,
        "public_home": PUBLIC_BASE,
        "public_privacy": f"{PUBLIC_BASE}privacy.html",
        "title_fragment": "日语汉字 AI 读音助手",
        "h1_fragment": "从每一个汉字开始",
    },
    "en": {
        "directory": DOCS_ROOT / "en",
        "public_home": f"{PUBLIC_BASE}en/",
        "public_privacy": f"{PUBLIC_BASE}en/privacy.html",
        "title_fragment": "Japanese Kanji Reading Assistant",
        "h1_fragment": "every kanji",
    },
    "ja": {
        "directory": DOCS_ROOT / "ja",
        "public_home": f"{PUBLIC_BASE}ja/",
        "public_privacy": f"{PUBLIC_BASE}ja/privacy.html",
        "title_fragment": "日本語漢字読み方アシスタント",
        "h1_fragment": "漢字一つひとつ",
    },
    "ko": {
        "directory": DOCS_ROOT / "ko",
        "public_home": f"{PUBLIC_BASE}ko/",
        "public_privacy": f"{PUBLIC_BASE}ko/privacy.html",
        "title_fragment": "일본어 한자 읽기 도우미",
        "h1_fragment": "한자 하나하나",
    },
    "vi": {
        "directory": DOCS_ROOT / "vi",
        "public_home": f"{PUBLIC_BASE}vi/",
        "public_privacy": f"{PUBLIC_BASE}vi/privacy.html",
        "title_fragment": "Trợ lý đọc Kanji tiếng Nhật",
        "h1_fragment": "từng chữ Kanji",
    },
}
```

Keep the existing fixed expected ZIP hash and independently calculate the real file hash. Do not replace the fixed value with a dynamically generated expectation.

### Step 2: Add incremental test selection

Use `argparse` to support repeatable `--locale` values and `--skip-global`. With no arguments, test every locale and all global SEO files. These options allow each locale to be completed and verified without weakening the default full gate.

```python
parser.add_argument("--locale", action="append", choices=LOCALES)
parser.add_argument("--skip-global", action="store_true")
selected = args.locale or list(LOCALES)
```

### Step 3: Add shared structural assertions

Create helpers that verify for every homepage and privacy page:

- Expected file exists and loads without console/page errors.
- `<html lang>` matches the locale.
- Localized title and one localized `h1` exist.
- All required homepage section IDs exist and privacy has exactly eight policy sections.
- Canonical URL is self-referencing.
- Exactly five locale alternates plus one `x-default` are present.
- Homepage `x-default` points to `PUBLIC_BASE`; privacy `x-default` points to `${PUBLIC_BASE}privacy.html`.
- Language links use native labels, have `hreflang`, mark the current page with `aria-current="page"`, preserve page type, and never start with an origin-root path such as `/en/`.
- Local assets resolve from disk and no runtime HTTP(S) resource is loaded.
- Download links resolve to the single ZIP; displayed checksums equal both the fixed expected hash and the calculated file hash.
- JSON-LD parses. Homepages use `SoftwareApplication`; privacy pages use `WebPage`; `url` and `inLanguage` match the page.
- IDs are unique and hash links have targets.

Use `xml.etree.ElementTree` to validate `sitemap.xml`, and assert that its `loc` set exactly equals the ten canonical URLs. Assert `robots.txt` contains the absolute sitemap URL.

### Step 4: Expand browser interaction and layout assertions

For each selected homepage at 1440, 820, 390, and 320 px:

- Measure horizontal overflow before interaction.
- Open the locale `<details>` and remeasure overflow and bounding boxes.
- On widths at or below 800 px, open the mobile menu, verify focus, open the locale selector inside it, and check 44 by 44 px touch bounds.
- Verify Escape still closes the mobile menu and restores focus.
- Save locale-qualified screenshots such as `artifacts/docs-site-en-mobile.png`.

For privacy pages, test desktop and mobile interaction states. Add a JavaScript-disabled browser context that can visibly reach homepage sections, every locale link, the privacy link, and the download link.

### Step 5: Run the new default test and confirm it fails for missing locale pages

Run:

```powershell
npm run test:site
```

Expected: failure identifies the first missing localized page or missing locale selector. The failure must be an assertion for the new requirement, not a syntax/import error.

### Step 6: Commit the test contract

```powershell
git add -- tests/docs_site_test.py
git commit -m "test: define multilingual website contract"
```

## Task 2: Build the shared language selector and localize the existing Chinese pages

**Files:**

- Modify: `docs/index.html`
- Modify: `docs/privacy.html`
- Modify: `docs/styles.css`
- Modify: `docs/script.js`

### Step 1: Add Chinese SEO metadata

Add to the Chinese homepage and privacy page:

- Self-canonical absolute URL.
- Five `rel="alternate"` links for `zh-CN`, `en`, `ja`, `ko`, and `vi`.
- Correct page-type-specific `x-default`.
- Localized Open Graph title, description, URL, type, and locale metadata.
- `url` and `inLanguage` on the homepage `SoftwareApplication` JSON-LD.
- `WebPage` JSON-LD on the privacy page.

Use homepage canonical `https://mohchieckler-coder.github.io/japanese-kanji-reading-assistant/` and privacy canonical `https://mohchieckler-coder.github.io/japanese-kanji-reading-assistant/privacy.html`.

### Step 2: Add semantic selector markup

Insert one `<details class="language-switcher" data-language-switcher>` into the homepage navigation and one into a new `.policy-actions` region on the privacy page. Use real relative anchors:

```html
<details class="language-switcher" data-language-switcher>
  <summary aria-label="选择网站语言">
    <span aria-hidden="true">文</span>
    <span>简体中文</span>
  </summary>
  <ul>
    <li><a href="./" hreflang="zh-CN" lang="zh-CN" aria-current="page" data-locale-link>简体中文</a></li>
    <li><a href="en/" hreflang="en" lang="en" data-locale-link>English</a></li>
    <li><a href="ja/" hreflang="ja" lang="ja" data-locale-link>日本語</a></li>
    <li><a href="ko/" hreflang="ko" lang="ko" data-locale-link>한국어</a></li>
    <li><a href="vi/" hreflang="vi" lang="vi" data-locale-link>Tiếng Việt</a></li>
  </ul>
</details>
```

On `privacy.html`, point each locale to its corresponding privacy page rather than its homepage.

### Step 3: Make navigation labels locale-neutral

Add localized data to each menu button:

```html
data-menu-open-label="打开导航菜单"
data-menu-close-label="关闭导航菜单"
```

Change `docs/script.js` so `setMenuOpen()` reads these values instead of hard-coded Chinese. Add progressive hash preservation only for homepage locale links and only for the shared IDs `top`, `product`, `features`, `privacy`, `install`, and `faq`.

Do not interfere with ordinary locale navigation when the hash is absent, invalid, or the current page is a privacy page.

### Step 4: Add responsive selector and no-JavaScript styles

In `docs/styles.css`, add focused selectors for:

- `.language-switcher`, its summary, list, links, current state, and focus-visible state.
- `.policy-actions`.
- Desktop alignment inside `.site-nav`.
- Full-width selector presentation in the mobile menu.
- Right-edge containment so the menu never exits the viewport.
- Forced-colors and reduced-motion compatibility.

Update the no-JavaScript mobile fallback so the fixed-height header does not hide links: let the header become content-height, wrap navigation below the brand, and expose section links, locale links, privacy, and download navigation. Add `class="no-js"`, the existing early class replacement script, and `script.js` to the privacy page so it follows the same enhancement model.

### Step 5: Run the Chinese-only test

```powershell
python tests/docs_site_test.py --locale zh-CN --skip-global
```

Expected: pass at all four homepage widths, both privacy widths, and JavaScript-disabled mode. The default full test may still fail because the four new locale directories do not yet exist.

### Step 6: Commit the shared shell

```powershell
git add -- docs/index.html docs/privacy.html docs/styles.css docs/script.js
git commit -m "feat: add accessible website language selector"
```

## Task 3: Add the English homepage and privacy policy

**Files:**

- Create: `docs/en/index.html`
- Create: `docs/en/privacy.html`

### Step 1: Create the English homepage

Copy the approved Chinese structure, then localize every human-facing string. Use:

- `lang="en"`
- Product name: `Japanese Kanji Reading Assistant`
- Primary heading concept: `Read Japanese websites, starting with every kanji.`
- Relative shared resources: `../styles.css`, `../script.js`, and `../assets/...`
- Download path: `../downloads/japanese-furigana-ai-2.6.0.zip`
- Same-locale privacy path: `privacy.html`
- Locale links: `../`, `./`, `../ja/`, `../ko/`, and `../vi/`

Preserve Japanese demonstration text with `lang="ja"`. Do not translate source text in furigana or loanword demonstrations.

### Step 2: Create the English privacy page

Translate all eight sections faithfully, retaining exact claims about local processing, API BaseURL requests, HTTPS exceptions, history limits, Token limits, permissions, deletion, and GitHub Issues. Use `WebPage` JSON-LD and privacy-to-privacy locale links.

### Step 3: Verify English only

```powershell
python tests/docs_site_test.py --locale en --skip-global
```

Expected: pass with no console error, missing asset, broken relative link, overflow, or untranslated accessibility label outside explicitly language-tagged examples.

### Step 4: Commit English pages

```powershell
git add -- docs/en/index.html docs/en/privacy.html
git commit -m "feat: add English website pages"
```

## Task 4: Add the Japanese homepage and privacy policy

**Files:**

- Create: `docs/ja/index.html`
- Create: `docs/ja/privacy.html`

### Step 1: Create natural Japanese product copy

Use:

- `lang="ja"`
- Product name: `日本語漢字読み方アシスタント`
- Primary heading concept: `日本語のウェブページを、漢字一つひとつから読み解く。`
- Japanese navigation, installation instructions, FAQ, accessibility labels, and metadata.
- The same relative resource, locale, privacy, and download rules as English.

Keep demonstration source text Japanese without redundantly translating it. Distinguish website-language availability from the extension's four actual interface languages.

### Step 2: Translate the privacy policy

Use clear Japanese privacy terminology and preserve every quantitative and technical fact. Keep permission names (`activeTab`, `scripting`, `storage`), API terms, localhost rules, and record limits exact.

### Step 3: Verify and commit Japanese pages

```powershell
python tests/docs_site_test.py --locale ja --skip-global
git add -- docs/ja/index.html docs/ja/privacy.html
git commit -m "feat: add Japanese website pages"
```

## Task 5: Add the Korean homepage and privacy policy

**Files:**

- Create: `docs/ko/index.html`
- Create: `docs/ko/privacy.html`

### Step 1: Create natural Korean product copy

Use:

- `lang="ko"`
- Product name: `일본어 한자 읽기 도우미`
- Primary heading concept: `일본어 웹페이지를, 한자 하나하나부터 읽어 보세요.`
- Korean navigation, installation instructions, FAQ, accessibility labels, and metadata.
- The same relative resource, locale, privacy, and download rules.

### Step 2: Translate the privacy policy

Retain the same eight-section structure and exact facts. Avoid translating technical permission identifiers, URLs, API field names, quantities, or file names.

### Step 3: Verify and commit Korean pages

```powershell
python tests/docs_site_test.py --locale ko --skip-global
git add -- docs/ko/index.html docs/ko/privacy.html
git commit -m "feat: add Korean website pages"
```

## Task 6: Add the Vietnamese homepage and privacy policy

**Files:**

- Create: `docs/vi/index.html`
- Create: `docs/vi/privacy.html`

### Step 1: Create natural Vietnamese product copy

Use:

- `lang="vi"`
- Product name: `Trợ lý đọc Kanji tiếng Nhật`
- Primary heading concept: `Đọc hiểu trang web tiếng Nhật, bắt đầu từ từng chữ Kanji.`
- Vietnamese navigation, installation instructions, FAQ, accessibility labels, and metadata.
- The same relative resource, locale, privacy, and download rules.

The page may state that the website is available in Vietnamese. It must not list Vietnamese among the extension interface languages or imply that the management-panel UI is localized into Vietnamese.

### Step 2: Translate the privacy policy

Retain the same eight-section structure and exact data-processing facts. Preserve technical identifiers, URLs, numeric limits, security qualifications, and the distinction between local processing and user-initiated API transmission.

### Step 3: Verify and commit Vietnamese pages

```powershell
python tests/docs_site_test.py --locale vi --skip-global
git add -- docs/vi/index.html docs/vi/privacy.html
git commit -m "feat: add Vietnamese website pages"
```

## Task 7: Add global discovery files and complete international SEO

**Files:**

- Create: `docs/sitemap.xml`
- Create: `docs/robots.txt`
- Modify if needed: all ten localized HTML pages

### Step 1: Build the canonical sitemap

Create a valid XML sitemap containing exactly:

```text
https://mohchieckler-coder.github.io/japanese-kanji-reading-assistant/
https://mohchieckler-coder.github.io/japanese-kanji-reading-assistant/privacy.html
https://mohchieckler-coder.github.io/japanese-kanji-reading-assistant/en/
https://mohchieckler-coder.github.io/japanese-kanji-reading-assistant/en/privacy.html
https://mohchieckler-coder.github.io/japanese-kanji-reading-assistant/ja/
https://mohchieckler-coder.github.io/japanese-kanji-reading-assistant/ja/privacy.html
https://mohchieckler-coder.github.io/japanese-kanji-reading-assistant/ko/
https://mohchieckler-coder.github.io/japanese-kanji-reading-assistant/ko/privacy.html
https://mohchieckler-coder.github.io/japanese-kanji-reading-assistant/vi/
https://mohchieckler-coder.github.io/japanese-kanji-reading-assistant/vi/privacy.html
```

Use each canonical form only once. Do not add `/index.html` duplicates.

### Step 2: Add robots discovery

Create `docs/robots.txt`:

```text
User-agent: *
Allow: /

Sitemap: https://mohchieckler-coder.github.io/japanese-kanji-reading-assistant/sitemap.xml
```

### Step 3: Audit all metadata as a set

Confirm the ten canonical links exactly equal the sitemap set; each page contains five locale alternates; each homepage and privacy page has the correct distinct `x-default`; JSON-LD and Open Graph URLs match canonical; and no link uses `/en/`, `/ja/`, `/ko/`, `/vi/`, or `/assets/` as an origin-root path.

### Step 4: Run the complete site test

```powershell
npm run test:site
```

Expected: pass for all five locales, all page types, all viewports, all expanded interaction states, no-JavaScript mode, ZIP hash verification, sitemap, and robots.

### Step 5: Commit SEO files and any corrections

```powershell
git add -- docs/sitemap.xml docs/robots.txt docs/index.html docs/privacy.html docs/en docs/ja docs/ko docs/vi
git commit -m "feat: complete multilingual website discovery"
```

## Task 8: Perform semantic and factual localization review

**Files:**

- Review and modify if needed: `docs/en/index.html`
- Review and modify if needed: `docs/en/privacy.html`
- Review and modify if needed: `docs/ja/index.html`
- Review and modify if needed: `docs/ja/privacy.html`
- Review and modify if needed: `docs/ko/index.html`
- Review and modify if needed: `docs/ko/privacy.html`
- Review and modify if needed: `docs/vi/index.html`
- Review and modify if needed: `docs/vi/privacy.html`

### Step 1: Review each homepage against the Chinese source

Check section by section for equivalent meaning, natural product language, and unchanged facts:

- Product version is `2.6.0`.
- All locales download the same file and hash.
- Furigana and loanword-origin processing remain described as local.
- Only user-selected translation text is sent to the configured API.
- The extension interface is described as supporting Chinese, English, Japanese, and Korean only.
- Vietnamese is described only as a website language.
- Installation remains four steps and does not promise unsupported Safari/iOS behavior.

### Step 2: Review each privacy policy against the eight Chinese sections

Verify exact equivalence for:

- Single purpose
- Local processing
- User-initiated remote transmission
- No developer collection or sale
- 500-history/4 MiB and 1,000-token/512 KiB limits
- Permissions
- API-key security boundary
- Children, changes, and contact

Do not silently guess ambiguous legal wording. Record any unresolved wording for owner review before publication.

### Step 3: Rerun focused and full tests after every correction

```powershell
npm run test:site
git diff --check
```

### Step 4: Commit reviewed translations if changes were required

```powershell
git add -- docs/en docs/ja docs/ko docs/vi
git commit -m "fix: refine multilingual website copy"
```

Skip this commit if the review produces no file changes.

## Task 9: Run the complete repository quality gate and inspect artifacts

**Files:**

- Verify: `artifacts/docs-site-*.png`
- Verify: all files changed by Tasks 1–8

### Step 1: Run the complete site gate again

```powershell
npm run test:site
```

Expected final line: `Documentation site responsive test passed.`

### Step 2: Run the complete repository gate

```powershell
npm test
```

Expected: build, unit tests, extension E2E, extension smoke test, multilingual site test, and build validation all pass.

If any command fails, diagnose the first real failure, make the smallest correction, rerun the focused failing command, then rerun both `npm run test:site` and `npm test` from the beginning. Continue until both are green.

### Step 3: Inspect rendered artifacts

Inspect desktop, iPad, mobile, and narrow screenshots for all homepages, plus desktop/mobile privacy screenshots. Confirm:

- Header and language menu do not overlap.
- Long English, Korean, and Vietnamese text wraps naturally.
- Expanded language menus remain on-screen.
- No button text is clipped.
- Japanese examples retain the intended typography and annotations.
- Privacy policies remain readable on narrow screens.

If visual defects are found, fix CSS, rerun the affected locale test, regenerate screenshots, and repeat the full gates.

### Step 4: Final repository checks

```powershell
git diff --check
git status --short --branch
git log --oneline --decorate -10
```

Confirm no ZIP, build artifact, secret, API key, or unrelated user file changed. Do not push or deploy.

### Step 5: Commit final verification fixes if needed

```powershell
git add -- tests/docs_site_test.py docs/index.html docs/privacy.html docs/styles.css docs/script.js docs/en docs/ja docs/ko docs/vi docs/sitemap.xml docs/robots.txt
git commit -m "fix: finalize multilingual website verification"
```

Skip this commit when the working tree is already clean.

## Completion handoff

Report:

- The five stable homepage URLs and five privacy URLs.
- The exact ZIP filename and verified SHA-256.
- The responsive viewport matrix tested.
- `npm run test:site` and `npm test` outcomes.
- Any translation wording still requiring owner review.
- The local branch and commit range.
- That no remote push or GitHub Pages deployment was performed unless separately authorized.

