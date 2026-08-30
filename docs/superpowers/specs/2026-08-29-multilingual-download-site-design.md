# Multilingual Download Website Design

**Date:** 2026-08-29
**Status:** Approved in conversation
**Project:** Japanese Kanji Reading Assistant

## 1. Goal

Expand the existing static download website from Simplified Chinese to five independently addressable languages so international users can understand the product, installation process, and privacy policy before downloading the extension.

The supported website locales are:

| Locale | Native label | Path under project base | Privacy path under project base |
| --- | --- | --- | --- |
| Simplified Chinese | 简体中文 | `./` | `privacy.html` |
| English | English | `en/` | `en/privacy.html` |
| Japanese | 日本語 | `ja/` | `ja/privacy.html` |
| Korean | 한국어 | `ko/` | `ko/privacy.html` |
| Vietnamese | Tiếng Việt | `vi/` | `vi/privacy.html` |

The project base is `https://mohchieckler-coder.github.io/japanese-kanji-reading-assistant/`. A leading slash must not be used for internal locale links because `/en/` would incorrectly resolve against `mohchieckler-coder.github.io` instead of the GitHub Pages project base.

## 2. Scope

### In scope

- Localize the complete public homepage into English, Japanese, Korean, and Vietnamese while keeping Simplified Chinese at the current root URL.
- Localize the complete privacy policy into the same five languages.
- Add a responsive and accessible language selector to every homepage and privacy page.
- Keep navigation, privacy links, and calls to action within the selected locale.
- Preserve the current visual identity, responsive layout, download artifact, and static GitHub Pages architecture.
- Add international SEO metadata and a sitemap for all localized pages.
- Extend automated tests to cover every locale and supported viewport.

### Out of scope

- Adding Vietnamese as an extension interface language. Vietnamese is a website locale only unless the extension is separately updated later.
- Translating Japanese examples that demonstrate furigana, katakana origins, or other Japanese-language behavior. Their surrounding explanations will be localized.
- Automatic redirection based on browser language, IP address, or geography.
- Changing the extension package or generating a new release archive.
- Adding a server, framework, external font, analytics service, or third-party translation runtime.

## 3. Architecture

The website remains a collection of static HTML, CSS, JavaScript, and asset files served directly by GitHub Pages.

The Chinese homepage and privacy page remain at their current paths for backward compatibility. Each additional locale receives its own directory containing `index.html` and `privacy.html`. Localized pages share the existing root-level `styles.css`, `script.js`, `assets/`, and `downloads/` resources through relative paths.

Internal links use paths appropriate to the current directory. For example, the Chinese homepage links to English with `./en/`, while the Japanese homepage links to English with `../en/`. Canonical, alternate-language, sitemap, and robots metadata use complete absolute GitHub Pages URLs. Automated tests must reject accidental origin-root paths such as `/en/` and `/assets/...`.

This intentionally avoids client-side string replacement. Each page has real localized HTML that works before JavaScript loads, can be indexed independently, and remains usable when JavaScript is disabled.

The directory shape is:

```text
docs/
├── index.html
├── privacy.html
├── en/
│   ├── index.html
│   └── privacy.html
├── ja/
│   ├── index.html
│   └── privacy.html
├── ko/
│   ├── index.html
│   └── privacy.html
├── vi/
│   ├── index.html
│   └── privacy.html
├── assets/
├── downloads/
├── script.js
├── styles.css
├── sitemap.xml
└── robots.txt
```

No locale page may duplicate the ZIP download. Every download call to action must resolve to the same root-level release artifact and verified SHA-256 value shown by the Chinese page.

## 4. Language Selector

The language selector will use progressively enhanced semantic HTML: a `<details>` control with a `<summary>` showing the current language and a list of real anchor links for all five locales.

Behavior requirements:

- It works with mouse, touch, keyboard, and screen readers.
- It works without JavaScript; JavaScript may enhance it by preserving the current section hash during a language switch.
- The current locale is exposed with `aria-current="page"`.
- Native language names are always used: `简体中文`, `English`, `日本語`, `한국어`, and `Tiếng Việt`.
- No flag icons are used because languages do not map one-to-one to countries.
- On desktop, the control sits in the header alongside the primary navigation.
- At tablet and mobile widths, it is included in the expanded mobile navigation and uses a full-width touch target of at least 44 px in both dimensions.
- Switching from a known section such as `#features`, `#privacy`, or `#install` preserves that section when the target locale has the same section ID. Without JavaScript, the target homepage still opens correctly at the top.
- Locale switching preserves page type: a homepage links to other localized homepages, while a privacy page links to other localized privacy pages.
- Selecting a locale changes to a real locale URL. All subsequent internal links remain in that locale; no browser-language redirect is performed.

## 5. Content Localization Rules

Every human-facing website string will be professionally localized, including:

- Header navigation and mobile navigation labels
- Product introduction and value proposition
- Trust and feature summaries
- Feature walkthroughs and annotations
- Translation-management explanation
- Privacy summary
- Installation steps and download calls to action
- Frequently asked questions
- Footer and accessibility labels
- Page titles, meta descriptions, structured data, and image alternative text
- The full privacy policy

Product names, version numbers, SHA-256 values, file names, API names, and URLs must remain exact. Japanese examples remain Japanese and retain appropriate `lang="ja"`; translations or Chinese output shown inside examples keep their own language attribute.

Claims must reflect current product behavior. In particular, the website can advertise five website languages, but must not claim the extension UI supports Vietnamese. Existing references to the extension's four interface languages must remain limited to the actual supported interface locales.

Translations should favor natural product language rather than literal sentence-by-sentence substitution. Security and privacy meanings must remain equivalent across all privacy pages.

## 6. Responsive and Visual Design

The existing visual system, typography, colors, illustrations, and section order remain unchanged. The language selector is the only new primary visual control.

The layout must remain visually stable at the existing tested widths:

- Desktop: 1440 px
- iPad/tablet: 820 px
- Mobile: 390 px
- Narrow mobile: 320 px

Long English, Korean, and Vietnamese labels must wrap without covering navigation, buttons, cards, or mockups. The selector menu must stay within the viewport and must not create horizontal scrolling. Interactive header and locale controls use touch targets of at least 44 by 44 px at tablet and mobile widths.

## 7. Navigation and Progressive Enhancement

All important functionality uses ordinary links and remains available without JavaScript:

- Section navigation
- Locale navigation
- Privacy-policy navigation
- Download links

`script.js` continues to manage the existing mobile menu, active-section state, header behavior, and copyright year. It will be made locale-neutral by reading translated accessible labels from HTML data attributes instead of hard-coding Chinese strings. It may also add the current hash to locale links when the same section exists in another locale.

The document starts in an explicit no-JavaScript state and the script changes that state only after it runs. At tablet and mobile widths, this fallback keeps the primary navigation and locale selector reachable when JavaScript is disabled. With JavaScript enabled, the current compact toggle behavior is retained.

Failure of the enhancement script must not hide content or prevent downloads.

## 8. SEO and Metadata

Each localized homepage and privacy page will provide:

- A correct HTML `lang` value: `zh-CN`, `en`, `ja`, `ko`, or `vi`
- A localized `<title>` and meta description
- A self-referencing absolute canonical URL using the directory form for homepages (`.../`, `.../en/`, and so on) and the explicit `privacy.html` form for privacy pages
- Alternate `hreflang` links for all five locales
- An `x-default` alternate pointing to the equivalent Simplified Chinese page: the Chinese homepage for homepages and `privacy.html` for privacy pages
- Localized Open Graph metadata where the existing page provides it; `og:url` matches canonical, and `og:locale` plus its alternates match the HTML locale set
- Localized structured data: homepages retain `SoftwareApplication` with consistent factual product fields plus locale-specific `url` and `inLanguage`; privacy pages use `WebPage` with their own canonical URL and language

`sitemap.xml` will list the exact canonical URL set for all ten public HTML pages. `robots.txt` will allow normal indexing and point to the sitemap with an absolute URL. No external runtime resource will be introduced.

## 9. Testing Strategy

Implementation follows test-driven development: add or update tests first, confirm the new expectations fail, implement the smallest complete change, then rerun the full quality gate.

Automated website tests will verify:

1. All ten localized pages exist and parse successfully.
2. Every page uses the expected HTML `lang`, localized title, and localized primary heading.
3. Canonical, `hreflang`, and `x-default` links form a complete and correct locale set, including the distinct homepage and privacy-page `x-default` mappings.
4. Language-selector links resolve and mark the current locale correctly, map homepage to homepage and privacy page to privacy page, and never escape the GitHub Pages project base.
5. Homepage section IDs remain consistent so hash preservation is safe.
6. Privacy pages retain all required policy sections.
7. Tests read the current ZIP, calculate its SHA-256 value, and confirm that every download button resolves to that file and every displayed checksum matches the calculated value.
8. No page has missing local assets, missing hash targets, duplicate IDs, or unexpected external resources.
9. The mobile menu and language selector are keyboard accessible and their focus state remains visible.
10. With JavaScript disabled in a real browser, users can reach home, privacy, locale, and download links at mobile and desktop widths.
11. Every locale has no horizontal overflow at 1440, 820, 390, and 320 px in the initial state, expanded mobile-menu state, and expanded language-selector state; element bounds are also checked for clipping and overlap.
12. `sitemap.xml` is valid XML, its `loc` set exactly matches the ten canonical URLs, and `robots.txt` exposes the absolute sitemap URL.
13. Website-language copy may list Vietnamese, while extension-interface-language copy is restricted to the four languages the extension actually supports and never describes Vietnamese as an extension UI language.
14. Existing Chinese-site behavior remains unchanged except for the new language selector and international metadata.

Automated checks cannot establish translation quality by themselves. Each localized page and privacy policy also receives an independent semantic review against the Chinese source, with special attention to data collection, permissions, networking, version information, installation restrictions, and supported-language claims. Any unresolved wording is called out for owner review before publication.

If any test fails, the failure will be diagnosed, fixed, and the complete test suite rerun until it passes.

## 10. Acceptance Criteria

The feature is complete when:

- Users can reach the homepage and privacy policy in all five languages through stable URLs.
- Users can switch language from every localized page on desktop, iPad, and mobile.
- No automatic browser-language redirect occurs.
- Internal navigation stays in the selected locale.
- Each locale downloads the exact same latest extension package.
- Search engines receive correct canonical, alternate-language, and sitemap metadata.
- The site works without JavaScript and has no responsive overflow in the supported viewport matrix.
- Each translation has completed an independent semantic review, and any legal or factual ambiguity has been presented to the owner instead of silently guessed.
- All updated website tests and the repository's complete verification command pass.

## 11. Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Localized pages drift structurally | Test required section IDs, navigation targets, locale links, and download metadata across all locales. |
| Translation changes factual claims | Keep versions, hashes, API terminology, and supported-extension-language claims as explicit invariants. |
| Header becomes crowded | Move the selector into the existing mobile navigation at tablet/mobile breakpoints and test long labels. |
| Relative links break in locale directories | Resolve every local resource and navigation link in automated tests. |
| JavaScript failure blocks locale switching | Use real anchor links and treat hash preservation as progressive enhancement only. |
| SEO pages are treated as duplicates | Provide localized copy, self-canonical URLs, complete `hreflang`, and sitemap entries. |
