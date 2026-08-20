from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "src" / "icons"
ARTIFACT_DIR = ROOT / "artifacts"
SIZES = (16, 32, 48, 128)


def render_icon(page, svg, size, output):
    page.set_viewport_size({"width": size, "height": size})
    page.set_content(
        f"""<!doctype html>
        <html><head><style>
          html, body {{ margin: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; }}
          svg {{ display: block; width: 100%; height: 100%; }}
        </style></head><body>{svg}</body></html>"""
    )
    page.wait_for_load_state("networkidle")
    page.screenshot(path=str(output), omit_background=True)


ICON_DIR.mkdir(parents=True, exist_ok=True)
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
svg_source = (ICON_DIR / "icon.svg").read_text(encoding="utf-8")

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(device_scale_factor=1)
    for icon_size in SIZES:
        render_icon(page, svg_source, icon_size, ICON_DIR / f"icon-{icon_size}.png")
    render_icon(page, svg_source, 512, ARTIFACT_DIR / "extension-icon-preview.png")
    browser.close()

print(f"Generated Chrome icons: {', '.join(str(size) for size in SIZES)} px")
