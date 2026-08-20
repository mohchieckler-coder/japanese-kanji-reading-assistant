import hashlib
import json
import zipfile
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "docs" / "index.html"
ARTIFACTS = ROOT / "artifacts"
DOWNLOAD = ROOT / "docs" / "downloads" / "japanese-furigana-ai-2.3.0.zip"
DOWNLOAD_SHA256 = "A39AA56AA16019C2A00F36F8605DD1D18E9365F86A336AC0615E7A9B167EDDE0"

VIEWPORTS = {
    "desktop": {"width": 1440, "height": 900},
    "ipad": {"width": 820, "height": 1180},
    "mobile": {"width": 390, "height": 844},
    "narrow": {"width": 320, "height": 700},
}


def assert_page_foundation(page, name):
    page.goto(SITE.as_uri(), wait_until="load")
    page.wait_for_function(
        "() => [...document.images].every((image) => image.complete && image.naturalWidth > 0)"
    )

    assert page.title().startswith("日语汉字 AI 读音助手")
    assert page.locator("h1").count() == 1
    assert "从每一个汉字开始" in page.locator("h1").inner_text()
    assert page.locator("#features").count() == 1
    assert page.locator("#install li").count() == 4
    assert page.locator("#privacy").count() == 1
    assert page.locator(".download-hash code").inner_text() == DOWNLOAD_SHA256
    assert page.locator("img:not([alt])").count() == 0
    external_resources = page.evaluate(
        """() => performance.getEntriesByType('resource')
          .map((entry) => entry.name)
          .filter((url) => /^https?:/i.test(url))"""
    )
    assert external_resources == [], f"{name}: unexpected external resources {external_resources}"

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
    assert missing_anchor_targets == [], f"{name}: missing anchors {missing_anchor_targets}"

    dimensions = page.evaluate(
        """() => ({
          viewport: document.documentElement.clientWidth,
          page: document.documentElement.scrollWidth,
          body: document.body.scrollWidth
        })"""
    )
    assert dimensions["page"] <= dimensions["viewport"] + 1, (
        f"{name}: document overflows horizontally {dimensions}"
    )
    assert dimensions["body"] <= dimensions["viewport"] + 1, (
        f"{name}: body overflows horizontally {dimensions}"
    )


def main():
    ARTIFACTS.mkdir(exist_ok=True)
    assert DOWNLOAD.is_file()
    assert hashlib.sha256(DOWNLOAD.read_bytes()).hexdigest().upper() == DOWNLOAD_SHA256
    with zipfile.ZipFile(DOWNLOAD) as archive:
        names = archive.namelist()
        blocked_suffixes = (".pem", ".key", ".p12", ".pfx", ".jks", ".keystore")
        assert not any(name.lower().endswith(blocked_suffixes) for name in names)
        assert not any("/.git/" in name.lower() or "/.env" in name.lower() for name in names)
        assert any(name.endswith("/THIRD_PARTY_NOTICES.md") for name in names)
        license_names = [name for name in names if "/third_party_licenses/" in name and not name.endswith("/")]
        assert len(license_names) == 6
        manifest_name = next(name for name in names if name.endswith("/manifest.json"))
        manifest = json.loads(archive.read(manifest_name))
        assert manifest["version"] == "2.3.0"
    console_errors = []
    page_errors = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)

        for name, viewport in VIEWPORTS.items():
            page = browser.new_page(viewport=viewport)
            page.on(
                "console",
                lambda message, page_name=name: console_errors.append(
                    f"{page_name}: {message.text}"
                ) if message.type == "error" else None,
            )
            page.on(
                "pageerror",
                lambda error, page_name=name: page_errors.append(f"{page_name}: {error}"),
            )

            assert_page_foundation(page, name)
            download_link = page.locator('a[download][href$="japanese-furigana-ai-2.3.0.zip"]').first
            assert download_link.is_visible()

            if viewport["width"] <= 800:
                menu = page.locator("[data-menu-toggle]")
                assert menu.is_visible(), f"{name}: mobile menu button is hidden"
                assert menu.get_attribute("aria-expanded") == "false"
                menu.click()
                assert menu.get_attribute("aria-expanded") == "true"
                assert page.locator("[data-nav]").evaluate(
                    "(element) => element.classList.contains('is-open')"
                )
                page.keyboard.press("Escape")
                assert menu.get_attribute("aria-expanded") == "false"
                assert menu.evaluate("(element) => document.activeElement === element")
                menu.click()
                page.locator('[data-nav] a[href="#features"]').click()
                assert menu.get_attribute("aria-expanded") == "false"
                menu.focus()
                page.keyboard.press("Tab")
                assert page.locator('a[download][href$="japanese-furigana-ai-2.3.0.zip"]').first.evaluate(
                    "(element) => document.activeElement === element"
                )
            else:
                assert page.locator("[data-menu-toggle]").is_hidden()
                assert page.locator("[data-nav]").is_visible()

            first_faq = page.locator("#faq details").first
            first_faq.locator("summary").click()
            assert first_faq.get_attribute("open") is not None
            first_faq.locator("summary").focus()
            page.keyboard.press("Escape")
            assert first_faq.locator("summary").evaluate(
                "(element) => document.activeElement === element"
            )

            if name != "narrow":
                page.evaluate("() => window.scrollTo(0, 0)")
                page.wait_for_timeout(100)
                page.screenshot(
                    path=str(ARTIFACTS / f"docs-site-{name}.png"),
                    full_page=True,
                )
            page.close()

        no_script_context = browser.new_context(
            viewport={"width": 390, "height": 844},
            java_script_enabled=False,
        )
        no_script_page = no_script_context.new_page()
        no_script_page.goto(SITE.as_uri(), wait_until="load")
        assert no_script_page.locator("h1").is_visible()
        assert no_script_page.locator("#features").is_visible()
        assert no_script_page.locator('.site-nav a[href="#install"]').is_visible()
        no_script_widths = no_script_page.evaluate(
            "() => [document.documentElement.clientWidth, document.documentElement.scrollWidth]"
        )
        assert no_script_widths[1] <= no_script_widths[0] + 1
        no_script_context.close()

        browser.close()

    assert console_errors == [], f"Console errors: {console_errors}"
    assert page_errors == [], f"Page errors: {page_errors}"
    print("Documentation site responsive test passed.")


if __name__ == "__main__":
    main()
