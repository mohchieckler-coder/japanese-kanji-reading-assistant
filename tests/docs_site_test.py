import argparse
import hashlib
import json
import zipfile
import xml.etree.ElementTree as ElementTree
from pathlib import Path
from urllib.parse import unquote, urlparse

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
DOCS_ROOT = ROOT / "docs"
ARTIFACTS = ROOT / "artifacts"
PUBLIC_BASE = "https://mohchieckler-coder.github.io/japanese-kanji-reading-assistant/"
VERSION = "2.6.0"
ARCHIVE_PREFIX = f"japanese-furigana-ai-{VERSION}"
DOWNLOAD = DOCS_ROOT / "downloads" / f"{ARCHIVE_PREFIX}.zip"
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

OPEN_GRAPH_LOCALES = {
    "zh-CN": "zh_CN",
    "en": "en_US",
    "ja": "ja_JP",
    "ko": "ko_KR",
    "vi": "vi_VN",
}

NATIVE_LANGUAGE_LABELS = {
    "zh-CN": "简体中文",
    "en": "English",
    "ja": "日本語",
    "ko": "한국어",
    "vi": "Tiếng Việt",
}

PRIVACY_PAGE_EXPECTATIONS = {
    "zh-CN": ("隐私政策｜日语汉字 AI 读音助手", "隐私政策"),
    "en": ("Privacy Policy | Japanese Kanji Reading Assistant", "Privacy Policy"),
    "ja": ("プライバシーポリシー｜日本語漢字読み方アシスタント", "プライバシーポリシー"),
    "ko": ("개인정보 처리방침｜일본어 한자 읽기 도우미", "개인정보 처리방침"),
    "vi": ("Chính sách quyền riêng tư｜Trợ lý đọc Kanji tiếng Nhật", "Chính sách quyền riêng tư"),
}

PRIVACY_API_TRANSPORT_EXPECTATIONS = {
    "zh-CN": (
        "API Key 会作为认证信息随 API 请求发送给该服务商。",
        "远程端点必须使用 HTTPS；仅 localhost 和 127.0.0.1 回环地址允许 HTTP。",
    ),
    "en": (
        "Your API Key is sent to that provider as authentication information with API requests.",
        "Remote endpoints must use HTTPS; only the localhost and 127.0.0.1 loopback addresses may use HTTP.",
    ),
    "ja": (
        "API Key は、API リクエストの認証情報としてそのプロバイダーへ送信されます。",
        "リモートエンドポイントでは HTTPS が必須です。HTTP を使用できるのは localhost と 127.0.0.1 のループバックアドレスだけです。",
    ),
    "ko": (
        "API Key는 API 요청의 인증 정보로 해당 제공업체에 전송됩니다.",
        "원격 엔드포인트는 HTTPS를 사용해야 하며 HTTP는 localhost와 127.0.0.1 루프백 주소에서만 사용할 수 있습니다.",
    ),
    "vi": (
        "API Key của bạn được gửi đến nhà cung cấp đó dưới dạng thông tin xác thực cùng yêu cầu API.",
        "Điểm cuối từ xa phải dùng HTTPS; chỉ các địa chỉ loopback localhost và 127.0.0.1 mới được dùng HTTP.",
    ),
}

ALLOWED_EXTERNAL_LINK_PREFIXES = (
    "https://github.com/mohchieckler-coder/japanese-kanji-reading-assistant/issues",
    "https://www.edrdg.org/",
    "https://creativecommons.org/",
)
DISALLOWED_EXTENSION_UI_LANGUAGE_LABELS = ("vietnamese", "tiếng việt", "越南语")

VIEWPORTS = {
    "desktop": {"width": 1440, "height": 900},
    "localized-desktop-boundary": {"width": 1161, "height": 900},
    "localized-compact-boundary": {"width": 1160, "height": 900},
    "localized-review": {"width": 910, "height": 698},
    "desktop-boundary": {"width": 901, "height": 900},
    "compact-boundary": {"width": 900, "height": 900},
    "ipad": {"width": 820, "height": 1180},
    "mobile": {"width": 390, "height": 844},
    "narrow": {"width": 320, "height": 700},
}
NO_SCRIPT_VIEWPORTS = {
    name: VIEWPORTS[name]
    for name in (
        "mobile",
        "ipad",
        "compact-boundary",
        "desktop-boundary",
        "localized-compact-boundary",
        "localized-desktop-boundary",
        "desktop",
    )
}
CHINESE_NAV_MAX_WIDTH = 900
LOCALIZED_NAV_MAX_WIDTH = 1160
REQUIRED_HOME_IDS = {"top", "product", "features", "privacy", "install", "faq"}


def page_file(locale, page_type):
    name = "index.html" if page_type == "home" else "privacy.html"
    return LOCALES[locale]["directory"] / name


def canonical_url(locale, page_type):
    return LOCALES[locale][f"public_{page_type}"]


def compact_nav_max_width(locale):
    return CHINESE_NAV_MAX_WIDTH if locale == "zh-CN" else LOCALIZED_NAV_MAX_WIDTH


def assert_archive_integrity():
    assert DOWNLOAD.is_file(), f"Missing release ZIP: {DOWNLOAD}"
    assert list(DOWNLOAD.parent.glob("*.zip")) == [DOWNLOAD]
    actual_hash = hashlib.sha256(DOWNLOAD.read_bytes()).hexdigest().upper()
    assert actual_hash == EXPECTED_DOWNLOAD_SHA256
    with zipfile.ZipFile(DOWNLOAD) as archive:
        names = archive.namelist()
        assert len(names) == len(set(name.casefold() for name in names))
        assert archive.testzip() is None
        assert {name.split("/", 1)[0] for name in names} == {ARCHIVE_PREFIX}
        assert all(name.startswith(f"{ARCHIVE_PREFIX}/") for name in names)
        assert not any(".." in Path(name).parts for name in names)
        blocked_suffixes = (".pem", ".key", ".p12", ".pfx", ".jks", ".keystore")
        assert not any(name.lower().endswith(blocked_suffixes) for name in names)
        assert not any("/.git/" in name.lower() or "/.env" in name.lower() for name in names)
        assert any(name.endswith("/THIRD_PARTY_NOTICES.md") for name in names)
        license_names = [name for name in names if "/third_party_licenses/" in name and not name.endswith("/")]
        assert len(license_names) == 9
        manifest_names = [name for name in names if name.endswith("/manifest.json")]
        assert manifest_names == [f"{ARCHIVE_PREFIX}/manifest.json"]
        assert names[0] == manifest_names[0]
        manifest = json.loads(archive.read(manifest_names[0]))
        assert manifest["manifest_version"] == 3
        assert manifest["version"] == VERSION
        archived_files = {
            name.removeprefix(f"{ARCHIVE_PREFIX}/") for name in names if not name.endswith("/")
        }
        dist_files = {
            path.relative_to(ROOT / "dist").as_posix()
            for path in (ROOT / "dist").rglob("*")
            if path.is_file()
        }
        assert archived_files == dist_files
    return actual_hash


def assert_no_horizontal_overflow(page, name):
    dimensions = page.evaluate(
        """() => ({
          viewport: document.documentElement.clientWidth,
          page: document.documentElement.scrollWidth,
          body: document.body.scrollWidth
        })"""
    )
    assert dimensions["page"] <= dimensions["viewport"] + 1, f"{name}: document overflows {dimensions}"
    assert dimensions["body"] <= dimensions["viewport"] + 1, f"{name}: body overflows {dimensions}"


def assert_local_assets_resolve(page, name):
    asset_urls = page.evaluate(
        """() => [...document.querySelectorAll('img[src], script[src], link[rel="stylesheet"][href], link[rel="icon"][href]')]
          .map((element) => new URL(element.getAttribute('src') || element.getAttribute('href'), document.baseURI).href)"""
    )
    for asset_url in asset_urls:
        parsed = urlparse(asset_url)
        assert parsed.scheme == "file", f"{name}: asset is not local: {asset_url}"
        local_path = Path(unquote(parsed.path.lstrip("/")))
        assert local_path.is_file(), f"{name}: local asset does not resolve: {asset_url}"
    external_resources = page.evaluate(
        """() => performance.getEntriesByType('resource')
          .map((entry) => entry.name)
          .filter((url) => /^https?:/i.test(url))"""
    )
    assert external_resources == [], f"{name}: unexpected HTTP(S) resources {external_resources}"


def assert_ids_and_hash_links(page, name):
    duplicate_ids = page.evaluate(
        """() => [...document.querySelectorAll('[id]')]
          .map((element) => element.id)
          .filter((id, index, ids) => ids.indexOf(id) !== index)"""
    )
    assert duplicate_ids == [], f"{name}: duplicate ids {duplicate_ids}"
    missing_anchor_targets = page.evaluate(
        """() => [...document.querySelectorAll('a[href^="#"]')]
          .map((link) => link.getAttribute('href'))
          .filter((href) => href.length > 1 && !document.querySelector(href))"""
    )
    assert missing_anchor_targets == [], f"{name}: missing hash targets {missing_anchor_targets}"


def assert_internal_links_resolve(page, name):
    links = page.locator("a[href]")
    for index in range(links.count()):
        link = links.nth(index)
        href = link.get_attribute("href")
        assert href, f"{name}: anchor {index} has an empty href"
        if href.startswith("#"):
            continue
        resolved_href = link.evaluate("(element) => new URL(element.href).href")
        parsed = urlparse(resolved_href)
        if parsed.scheme == "file":
            target = Path(unquote(parsed.path.lstrip("/")))
            assert target.is_relative_to(DOCS_ROOT), f"{name}: local link leaves docs: {href}"
        elif parsed.netloc == urlparse(PUBLIC_BASE).netloc:
            assert resolved_href.startswith(PUBLIC_BASE), f"{name}: public link leaves public base: {href}"
        else:
            assert any(resolved_href.startswith(prefix) for prefix in ALLOWED_EXTERNAL_LINK_PREFIXES), (
                f"{name}: unapproved external link: {href}"
            )


def assert_extension_ui_language_contract(page, locale):
    language_blocks = page.locator("[data-extension-ui-languages]")
    assert language_blocks.count() >= 1, f"{locale}: mark extension UI language copy with data-extension-ui-languages"
    for index in range(language_blocks.count()):
        language_copy = language_blocks.nth(index).inner_text().casefold()
        assert not any(label in language_copy for label in DISALLOWED_EXTENSION_UI_LANGUAGE_LABELS), (
            f"{locale}: extension UI languages must not claim Vietnamese support"
        )


def assert_no_browser_language_redirect(browser, locale):
    browser_locale = "ja-JP" if locale == "en" else "en-US"
    context = browser.new_context(locale=browser_locale)
    page = context.new_page()
    for page_type in ("home", "privacy"):
        requested_url = page_file(locale, page_type).as_uri()
        page.goto(requested_url, wait_until="load")
        page.wait_for_timeout(100)
        assert page.url == requested_url, (
            f"{locale} {page_type}: browser locale {browser_locale} redirected from the requested static page"
        )
    context.close()


def assert_seo_metadata(page, locale, page_type):
    expected_url = canonical_url(locale, page_type)
    canonical_links = page.locator('head link[rel="canonical"]')
    assert canonical_links.count() == 1, f"{locale} {page_type}: canonical must be self-referencing"
    assert canonical_links.first.get_attribute("href") == expected_url

    alternate_links = page.locator('head link[rel="alternate"][hreflang]')
    assert alternate_links.count() == 6, f"{locale} {page_type}: require five alternates and x-default"
    actual_alternates = {
        alternate_links.nth(index).get_attribute("hreflang"): alternate_links.nth(index).get_attribute("href")
        for index in range(alternate_links.count())
    }
    expected_alternates = {language: canonical_url(language, page_type) for language in LOCALES}
    expected_alternates["x-default"] = PUBLIC_BASE if page_type == "home" else f"{PUBLIC_BASE}privacy.html"
    assert actual_alternates == expected_alternates

    open_graph_locale = page.locator('head meta[property="og:locale"]')
    assert open_graph_locale.count() == 1
    assert open_graph_locale.first.get_attribute("content") == OPEN_GRAPH_LOCALES[locale]
    open_graph_alternates = page.locator('head meta[property="og:locale:alternate"]')
    actual_open_graph_alternates = [
        open_graph_alternates.nth(index).get_attribute("content")
        for index in range(open_graph_alternates.count())
    ]
    expected_open_graph_alternates = [
        open_graph_locale
        for language, open_graph_locale in OPEN_GRAPH_LOCALES.items()
        if language != locale
    ]
    assert actual_open_graph_alternates == expected_open_graph_alternates, (
        f"{locale} {page_type}: require each of the other four OG locales exactly once"
    )
    assert len(actual_open_graph_alternates) == len(set(actual_open_graph_alternates)) == 4

    json_ld_nodes = page.locator('script[type="application/ld+json"]')
    json_ld = [json.loads(json_ld_nodes.nth(index).inner_text()) for index in range(json_ld_nodes.count())]
    expected_type = "SoftwareApplication" if page_type == "home" else "WebPage"
    matching_nodes = [node for node in json_ld if node.get("@type") == expected_type]
    assert len(matching_nodes) == 1, f"{locale} {page_type}: missing JSON-LD type"
    assert matching_nodes[0]["url"] == expected_url
    assert matching_nodes[0]["inLanguage"] == locale


def assert_local_language_link_target(resolved_href, expected_path, name):
    parsed = urlparse(resolved_href)
    assert parsed.scheme == "file", f"{name}: language link must resolve to a local file URI"
    resolved_path = Path(unquote(parsed.path.lstrip("/")))
    assert resolved_path == expected_path, f"{name}: language link points to the wrong local page"


def assert_language_links(page, locale, page_type):
    language_links = page.locator('a[hreflang]')
    assert language_links.count() == 5, f"{locale} {page_type}: locale selector must expose five language links"
    seen_languages = set()
    for index in range(language_links.count()):
        link = language_links.nth(index)
        language = link.get_attribute("hreflang")
        assert language in LOCALES
        assert language not in seen_languages
        seen_languages.add(language)
        label = link.text_content()
        assert label is not None
        assert label.strip() == NATIVE_LANGUAGE_LABELS[language], (
            f"{locale} {page_type}: {language} needs its exact native label"
        )
        href = link.get_attribute("href")
        assert href and not href.startswith("/"), f"{locale} {page_type}: language links must be relative, not origin-root"
        resolved_href = link.evaluate("(element) => new URL(element.href).href")
        expected_path = LOCALES[language]["directory"] if page_type == "home" else page_file(language, page_type)
        assert_local_language_link_target(resolved_href, expected_path, f"{locale} {page_type}: {language}")
        assert (link.get_attribute("aria-current") == "page") == (language == locale)
    assert seen_languages == set(LOCALES)


def assert_page_foundation(page, locale, page_type, actual_download_hash):
    site_file = page_file(locale, page_type)
    assert site_file.is_file(), f"{locale} {page_type}: missing localized page {site_file}"
    page.goto(site_file.as_uri(), wait_until="load")
    page.wait_for_function("() => [...document.images].every((image) => image.complete && image.naturalWidth > 0)")

    assert page.locator("html").get_attribute("lang") == locale
    assert page.locator("html").evaluate("element => element.classList.contains('js')")
    assert not page.locator("html").evaluate("element => element.classList.contains('no-js')")
    assert page.locator("h1").count() == 1
    h1_text = page.locator("h1").inner_text().strip()
    assert_language_links(page, locale, page_type)
    if page_type == "home":
        assert LOCALES[locale]["title_fragment"] in page.title()
        assert LOCALES[locale]["h1_fragment"] in h1_text
        assert_extension_ui_language_contract(page, locale)
    else:
        expected_title, expected_h1 = PRIVACY_PAGE_EXPECTATIONS[locale]
        assert page.title() == expected_title
        assert h1_text == expected_h1

    if page_type == "home":
        actual_ids = {element_id for element_id in REQUIRED_HOME_IDS if page.locator(f"#{element_id}").count() == 1}
        assert actual_ids == REQUIRED_HOME_IDS, f"{locale}: missing required homepage sections {REQUIRED_HOME_IDS - actual_ids}"
        download_links = page.locator("a[download]")
        assert download_links.count() >= 1, f"{locale}: homepage must expose a ZIP download link"
        for index in range(download_links.count()):
            link = download_links.nth(index)
            assert link.evaluate("(element) => new URL(element.href).href") == DOWNLOAD.as_uri()
        displayed_hashes = page.locator(".download-hash code")
        assert displayed_hashes.count() >= 1, f"{locale}: homepage must display its SHA-256"
        for index in range(displayed_hashes.count()):
            displayed_hash = displayed_hashes.nth(index).inner_text().strip().upper()
            assert displayed_hash == EXPECTED_DOWNLOAD_SHA256
            assert displayed_hash == actual_download_hash
    else:
        assert page.locator(".policy-card section").count() == 8
        policy_copy = " ".join(page.locator(".policy-card").inner_text().split())
        for expected_sentence in PRIVACY_API_TRANSPORT_EXPECTATIONS[locale]:
            assert expected_sentence in policy_copy, (
                f"{locale}: privacy policy must describe authentication and the HTTPS/loopback exception accurately"
            )

    assert page.locator("img:not([alt])").count() == 0
    assert_seo_metadata(page, locale, page_type)
    assert_local_assets_resolve(page, f"{locale}-{page_type}")
    assert_ids_and_hash_links(page, f"{locale}-{page_type}")
    assert_internal_links_resolve(page, f"{locale}-{page_type}")


def open_locale_selector(page, selector_name):
    selector = page.locator("details:has(a[hreflang])")
    assert selector.count() == 1, f"{selector_name}: require one locale <details> selector"
    summary = selector.locator("summary")
    summary.focus()
    page.keyboard.press("Enter")
    assert selector.get_attribute("open") is not None
    summary.focus()
    page.keyboard.press("Space")
    assert selector.get_attribute("open") is None
    page.keyboard.press("Space")
    assert selector.get_attribute("open") is not None
    page.keyboard.press("Tab")
    first_language_link = selector.locator("a[hreflang]").first
    assert first_language_link.evaluate("element => document.activeElement === element"), (
        f"{selector_name}: Tab from the open native selector must reach the first language link"
    )
    assert_no_horizontal_overflow(page, f"{selector_name}-locale-open")
    bounds = selector.bounding_box()
    summary_bounds = summary.bounding_box()
    menu_bounds = selector.locator("ul").bounding_box()
    assert bounds and bounds["width"] > 0 and bounds["height"] > 0
    assert summary_bounds and summary_bounds["width"] > 0 and summary_bounds["height"] > 0
    assert menu_bounds and menu_bounds["width"] > 0 and menu_bounds["height"] > 0
    menu_containment = selector.locator("ul").evaluate(
        """menu => {
          const rect = menu.getBoundingClientRect();
          const tolerance = 1;
          const insideViewport = rect.left >= -tolerance
            && rect.top >= -tolerance
            && rect.right <= window.innerWidth + tolerance
            && rect.bottom <= window.innerHeight + tolerance;
          let ancestor = menu.parentElement;
          while (ancestor) {
            const style = getComputedStyle(ancestor);
            const scrollable = /(auto|scroll)/.test(style.overflowY)
              && ancestor.scrollHeight > ancestor.clientHeight;
            if (scrollable) {
              const ancestorRect = ancestor.getBoundingClientRect();
              const horizontallyContained = rect.left >= ancestorRect.left - tolerance
                && rect.right <= ancestorRect.right + tolerance;
              const verticallyReachable = menu.offsetTop >= 0
                && menu.offsetTop + menu.offsetHeight <= ancestor.scrollHeight + tolerance;
              return { insideViewport, inScrollableContainer: horizontallyContained && verticallyReachable };
            }
            ancestor = ancestor.parentElement;
          }
          return { insideViewport, inScrollableContainer: false };
        }"""
    )
    assert menu_containment["insideViewport"] or menu_containment["inScrollableContainer"], (
        f"{selector_name}: expanded language menu leaves both viewport and any scrollable container: "
        f"{menu_containment}"
    )
    current_language = selector.locator('a[aria-current="page"]')
    assert current_language.count() == 1
    assert current_language.evaluate("element => getComputedStyle(element).backgroundColor") == "rgb(255, 241, 239)", (
        f"{selector_name}: current language must use the defined soft red background"
    )
    return selector


def assert_touch_target(locator, name):
    bounds = locator.bounding_box()
    assert bounds and bounds["width"] >= 44 and bounds["height"] >= 44, f"{name}: touch target must be at least 44 by 44 px"


def assert_desktop_navigation_single_line(page, locale, viewport_name):
    for index, link in enumerate(page.locator("[data-nav] > a:not(.button)").all()):
        metrics = link.evaluate(
            """element => ({
              height: element.getBoundingClientRect().height,
              lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight)
            })"""
        )
        assert metrics["height"] <= metrics["lineHeight"] * 1.25, (
            f"{locale}-{viewport_name}: desktop nav link {index} wraps across lines: {metrics}"
        )


def assert_loanword_demo_layout(page, locale, viewport_name):
    demo = page.locator(".loanword-demo")
    assert demo.count() == 1, f"{locale}-{viewport_name}: require one structured loanword demo"
    samples = demo.locator(".loanword-sample")
    assert samples.count() == 4, f"{locale}-{viewport_name}: require four loanword samples"
    assert demo.locator(".loanword-country").all_text_contents() == ["仏", "独", "西"]

    for index in range(samples.count()):
        sample = samples.nth(index)
        origin = sample.locator(".loanword-origin")
        base = sample.locator(".loanword-base")
        assert origin.count() == 1 and base.count() == 1
        origin_bounds = origin.bounding_box()
        base_bounds = base.bounding_box()
        sample_bounds = sample.bounding_box()
        assert origin_bounds and base_bounds and sample_bounds
        assert origin_bounds["y"] + origin_bounds["height"] <= base_bounds["y"] + 1, (
            f"{locale}-{viewport_name}: loanword origin overlaps its katakana base at sample {index}"
        )
        assert origin_bounds["x"] >= sample_bounds["x"] - 1
        assert origin_bounds["x"] + origin_bounds["width"] <= sample_bounds["x"] + sample_bounds["width"] + 1
        assert base_bounds["x"] >= sample_bounds["x"] - 1
        assert base_bounds["x"] + base_bounds["width"] <= sample_bounds["x"] + sample_bounds["width"] + 1

    assert samples.nth(0).get_attribute("data-origin-language") == "en"
    assert samples.nth(0).locator(".loanword-country").count() == 0
    assert all(samples.nth(index).locator(".loanword-country").count() == 1 for index in range(1, 4))
    assert_no_horizontal_overflow(page, f"{locale}-{viewport_name}-loanword-demo")


def assert_homepage_interactions(page, locale, viewport_name, viewport):
    assert_no_horizontal_overflow(page, f"{locale}-{viewport_name}-before-interaction")

    if viewport["width"] <= compact_nav_max_width(locale):
        menu = page.locator("[data-menu-toggle]")
        assert menu.is_visible(), f"{locale}-{viewport_name}: mobile menu button is hidden"
        assert_touch_target(menu, f"{locale}-{viewport_name}-menu")
        menu.click()
        assert menu.get_attribute("aria-expanded") == "true"
        assert menu.evaluate("(element) => document.activeElement === element")
        mobile_selector = page.locator('[data-nav] details:has(a[hreflang])')
        assert mobile_selector.count() == 1, f"{locale}-{viewport_name}: mobile menu needs its locale selector"
        assert_touch_target(mobile_selector.locator("summary"), f"{locale}-{viewport_name}-locale-selector")
        open_locale_selector(page, f"{locale}-{viewport_name}")
        assert_no_horizontal_overflow(page, f"{locale}-{viewport_name}-menu-open")
        page.keyboard.press("Escape")
        assert menu.get_attribute("aria-expanded") == "false"
        assert menu.evaluate("(element) => document.activeElement === element")
    else:
        assert page.locator("[data-menu-toggle]").is_hidden()
        assert page.locator("[data-nav]").is_visible()
        assert_desktop_navigation_single_line(page, locale, viewport_name)
        open_locale_selector(page, f"{locale}-{viewport_name}")

    if viewport_name in ("localized-review", "mobile"):
        assert_loanword_demo_layout(page, locale, viewport_name)


def assert_compact_to_desktop_resize_cleanup(page, locale, viewport):
    menu = page.locator("[data-menu-toggle]")
    navigation = page.locator("[data-nav]")
    menu.click()
    assert menu.get_attribute("aria-expanded") == "true"
    assert navigation.evaluate("element => element.classList.contains('is-open')")
    assert page.locator("body").evaluate("element => element.classList.contains('menu-open')")

    desktop_width = compact_nav_max_width(locale) + 1
    page.set_viewport_size({"width": desktop_width, "height": viewport["height"]})
    page.wait_for_function(
        "width => window.innerWidth === width && window.matchMedia(`(min-width: ${width}px)`).matches",
        arg=desktop_width,
    )

    assert menu.is_hidden(), f"{locale}-ipad-resize: desktop toggle must be hidden"
    assert menu.get_attribute("aria-expanded") == "false"
    assert navigation.is_visible(), f"{locale}-ipad-resize: desktop navigation must be visible"
    assert not navigation.evaluate("element => element.classList.contains('is-open')")
    body_state = page.locator("body").evaluate(
        """element => ({
          menuOpen: element.classList.contains('menu-open'),
          overflow: getComputedStyle(element).overflow,
          overflowY: getComputedStyle(element).overflowY
        })"""
    )
    assert not body_state["menuOpen"]
    assert body_state["overflow"] != "hidden" and body_state["overflowY"] != "hidden", (
        f"{locale}-ipad-resize: body remains scroll-locked {body_state}"
    )

    page.set_viewport_size(viewport)
    page.wait_for_function("width => window.innerWidth === width", arg=viewport["width"])
    assert menu.is_visible(), f"{locale}-ipad-resize: compact toggle must return at 820px"
    assert menu.get_attribute("aria-expanded") == "false"


def assert_privacy_interactions(page, locale, viewport_name, viewport):
    assert_no_horizontal_overflow(page, f"{locale}-privacy-{viewport_name}-before-interaction")
    if viewport["width"] <= compact_nav_max_width(locale) and page.locator("[data-menu-toggle]").count():
        menu = page.locator("[data-menu-toggle]")
        assert_touch_target(menu, f"{locale}-privacy-{viewport_name}-menu")
        menu.click()
        assert menu.get_attribute("aria-expanded") == "true"
        open_locale_selector(page, f"{locale}-privacy-{viewport_name}")
        page.keyboard.press("Escape")
        assert menu.get_attribute("aria-expanded") == "false"
        assert menu.evaluate("(element) => document.activeElement === element")
    else:
        if page.locator("[data-menu-toggle]").count():
            assert page.locator("[data-menu-toggle]").is_hidden()
            assert_desktop_navigation_single_line(page, locale, f"privacy-{viewport_name}")
        open_locale_selector(page, f"{locale}-privacy-{viewport_name}")


def assert_javascript_disabled(playwright, locale):
    disabled_browser = playwright.chromium.launch(headless=True)
    context = disabled_browser.new_context(java_script_enabled=False)
    page = context.new_page()
    for viewport_name, viewport in NO_SCRIPT_VIEWPORTS.items():
        page.set_viewport_size(viewport)
        page.goto(page_file(locale, "home").as_uri(), wait_until="load")
        assert page.locator("html").get_attribute("class") == "no-js"
        assert page.locator("h1").is_visible()
        for section_id in REQUIRED_HOME_IDS:
            assert page.locator(f"#{section_id}").is_visible(), (
                f"{locale}-{viewport_name}: no-script cannot reach #{section_id}"
            )
        assert page.locator("[data-nav]").is_visible(), f"{locale}-{viewport_name}: no-script nav is hidden"
        assert page.locator('a[href="privacy.html"], a[href$="/privacy.html"]').first.is_visible()
        assert page.locator("a[download]").first.is_visible()
        selector = page.locator("details:has(a[hreflang])")
        selector.locator("summary").click()
        assert page.locator("a[hreflang]").count() == 5
        assert all(page.locator("a[hreflang]").nth(index).is_visible() for index in range(5))
        assert_no_horizontal_overflow(page, f"{locale}-{viewport_name}-no-script")
    context.close()
    disabled_browser.close()


def assert_shared_script_failure_fallback(browser, locale):
    context = browser.new_context(viewport=VIEWPORTS["ipad"])
    page = context.new_page()
    page.route("**/script.js", lambda route: route.abort("blockedbyclient"))
    for page_type in ("home", "privacy"):
        page.goto(page_file(locale, page_type).as_uri(), wait_until="load")
        assert page.locator("html").get_attribute("class") == "no-js", (
            f"{locale}-{page_type}: blocked shared script must preserve the no-js fallback"
        )
        selector = page.locator("details:has(a[hreflang])")
        assert selector.locator("summary").is_visible()
        selector.locator("summary").click()
        assert all(selector.locator("a[hreflang]").nth(index).is_visible() for index in range(5))
        if page_type == "home":
            assert page.locator("[data-nav]").is_visible(), f"{locale}: fallback navigation is hidden"
            assert page.locator("a[download]").first.is_visible()
        else:
            assert page.locator(".policy-actions .button").is_visible()
        assert_no_horizontal_overflow(page, f"{locale}-{page_type}-blocked-script")
    context.close()


def assert_global_seo_files():
    expected_page_files = {
        page_file(locale, page_type)
        for locale in LOCALES
        for page_type in ("home", "privacy")
    }
    missing_page_files = sorted(path for path in expected_page_files if not path.is_file())
    assert missing_page_files == [], f"Missing localized pages: {missing_page_files}"

    expected_urls = {
        *(locale["public_home"] for locale in LOCALES.values()),
        *(locale["public_privacy"] for locale in LOCALES.values()),
    }
    sitemap = DOCS_ROOT / "sitemap.xml"
    assert sitemap.is_file(), f"Missing sitemap: {sitemap}"
    root = ElementTree.parse(sitemap).getroot()
    locations = {element.text for element in root.iter() if element.tag.rsplit("}", 1)[-1] == "loc"}
    assert locations == expected_urls

    robots = DOCS_ROOT / "robots.txt"
    assert robots.is_file(), f"Missing robots.txt: {robots}"
    assert f"Sitemap: {PUBLIC_BASE}sitemap.xml" in robots.read_text(encoding="utf-8")


def parse_args():
    parser = argparse.ArgumentParser(description="Verify the multilingual static documentation site.")
    parser.add_argument("--locale", action="append", choices=LOCALES)
    parser.add_argument("--skip-global", action="store_true")
    return parser.parse_args()


def main():
    args = parse_args()
    selected = args.locale or list(LOCALES)
    ARTIFACTS.mkdir(exist_ok=True)
    actual_download_hash = assert_archive_integrity()
    console_errors = []
    page_errors = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        for locale in selected:
            for viewport_name, viewport in VIEWPORTS.items():
                page = browser.new_page(viewport=viewport)
                page.on("console", lambda message, name=f"{locale}-{viewport_name}": console_errors.append(f"{name}: {message.text}") if message.type == "error" else None)
                page.on("pageerror", lambda error, name=f"{locale}-{viewport_name}": page_errors.append(f"{name}: {error}"))
                assert_page_foundation(page, locale, "home", actual_download_hash)
                assert_homepage_interactions(page, locale, viewport_name, viewport)
                if viewport_name == "ipad":
                    assert_compact_to_desktop_resize_cleanup(page, locale, viewport)
                page.screenshot(path=str(ARTIFACTS / f"docs-site-{locale}-{viewport_name}.png"), full_page=True)
                page.close()

            privacy_viewports = {
                name: VIEWPORTS[name]
                for name in ("desktop", "desktop-boundary", "compact-boundary", "mobile")
            }
            for viewport_name, viewport in privacy_viewports.items():
                page = browser.new_page(viewport=viewport)
                page.on("console", lambda message, name=f"{locale}-privacy-{viewport_name}": console_errors.append(f"{name}: {message.text}") if message.type == "error" else None)
                page.on("pageerror", lambda error, name=f"{locale}-privacy-{viewport_name}": page_errors.append(f"{name}: {error}"))
                assert_page_foundation(page, locale, "privacy", actual_download_hash)
                assert_privacy_interactions(page, locale, viewport_name, viewport)
                page.screenshot(path=str(ARTIFACTS / f"docs-site-{locale}-privacy-{viewport_name}.png"), full_page=True)
                page.close()

            assert_javascript_disabled(playwright, locale)
            assert_shared_script_failure_fallback(browser, locale)
            assert_no_browser_language_redirect(browser, locale)
        browser.close()

    assert console_errors == [], f"Console errors: {console_errors}"
    assert page_errors == [], f"Page errors: {page_errors}"
    if not args.skip_global:
        assert_global_seo_files()
    print("Multilingual documentation site contract passed.")


if __name__ == "__main__":
    main()
