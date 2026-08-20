import argparse
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import unquote, urlparse

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
DICTIONARY = DIST / "dict"
ARTIFACTS = ROOT / "artifacts" / "live-sites"
REPORT_PATH = ROOT / "artifacts" / "live-site-audit.json"
KNOWN_READINGS = {
    "20日": "はつか",
    "24日": "にじゅうよっか",
    "1人": "ひとり",
    "１人": "ひとり",
    "一人": "ひとり",
    "2人": "ふたり",
    "２人": "ふたり",
    "二人": "ふたり",
    "一人一人": "ひとりひとり",
    "二人組": "ふたりぐみ",
    "一回": "いっかい",
    "六回": "ろっかい",
    "八回": "はっかい",
    "十回": "じゅっかい",
    "百回": "ひゃっかい",
    "博士課程": "はくしかてい",
    "日本研究": "にほんけんきゅう",
    "日本初": "にほんはつ",
    "協働": "きょうどう",
    "相転移": "そうてんい",
    "平均場": "へいきんば",
    "骨髄": "こつずい",
    "幹細胞": "かんさいぼう",
    "妊娠高血圧腎症": "にんしんこうけつあつじんしょう",
    "頭頸部": "とうけいぶ",
    "浸透圧": "しんとうあつ",
    "膵": "すい",
    "昨夏": "さっか",
    "既読": "きどく",
    "自治厨": "じちちゅう",
    "公録": "こうろく",
    "売り時": "うりどき",
    "トピ立て": "とぴたて",
    "スレ立て": "すれたて",
}

SITES = [
    {
        "category": "news",
        "name": "NHK News",
        "url": "https://news.web.nhk/newsweb",
    },
    {
        "category": "news",
        "name": "Weathernews",
        "url": "https://weathernews.jp/",
    },
    {
        "category": "news",
        "name": "tenki.jp",
        "url": "https://tenki.jp/",
    },
    {
        "category": "sports",
        "name": "Yahoo Sports",
        "url": "https://sports.yahoo.co.jp/",
    },
    {
        "category": "sports",
        "name": "Nikkan Sports Scores",
        "url": "https://www.nikkansports.com/baseball/professional/score/",
    },
    {
        "category": "sports",
        "name": "Doshin Sports",
        "url": "https://www.doshinsports.com/live-npb/?kd_page=schedule",
    },
    {
        "category": "forum",
        "name": "Yahoo Chiebukuro",
        "url": "https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q1110642126",
    },
    {
        "category": "forum",
        "name": "Qiita Community Article",
        "url": "https://qiita.com/yamad365/items/3c63ce41b4c93267389f",
    },
    {
        "category": "forum",
        "name": "Chicago Japanese Bulletin Board",
        "url": "https://kaigai-bbs.com/usa/chi/",
    },
    {
        "category": "academic",
        "name": "Nihon University Research",
        "url": "https://www.nihon-u.ac.jp/research/project/web_presentation/",
    },
    {
        "category": "academic",
        "name": "J-STAGE Japanese Education",
        "url": "https://www.jstage.jst.go.jp/article/jtje/27/0/27_75/_article/-char/ja",
    },
    {
        "category": "academic",
        "name": "J-STAGE Information Science",
        "url": "https://www.jstage.jst.go.jp/article/jkg/73/6/73_200/_article/-char/ja",
    },
]

MOCK_CHROME = """
(() => {
  const chromeObject = window.chrome || {};
  chromeObject.runtime = {
    getURL: (path) => `${location.origin}/__jp_ext__/${path}`,
    onMessage: {
      addListener: (listener) => { window.__furiganaMessageListener = listener; }
    }
  };
  window.chrome = chromeObject;
})();
"""


def safe_slug(value):
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def dictionary_route(route, request):
    filename = Path(unquote(urlparse(request.url).path)).name
    dictionary_file = DICTIONARY / filename
    if not dictionary_file.is_file():
        route.fulfill(status=404, body="missing dictionary file")
        return
    route.fulfill(
        status=200,
        path=str(dictionary_file),
        content_type="application/gzip",
        headers={"Access-Control-Allow-Origin": "*"},
    )


def compact_annotations(raw_annotations):
    counts = Counter()
    examples = defaultdict(list)
    for annotation in raw_annotations:
        key = (annotation["surface"], annotation["reading"])
        counts[key] += 1
        context = " ".join(annotation.get("context", "").split())[:100]
        if context and context not in examples[key] and len(examples[key]) < 2:
            examples[key].append(context)

    return [
        {
            "surface": surface,
            "reading": reading,
            "count": count,
            "examples": examples[(surface, reading)],
        }
        for (surface, reading), count in counts.most_common(400)
    ]


def validate_annotations(raw_annotations):
    if not raw_annotations:
        raise RuntimeError("extension enabled but produced zero annotations")

    errors = []
    validated_targets = 0
    for annotation in raw_annotations:
        surface = annotation.get("surface", "")
        reading = annotation.get("reading", "")
        if not surface or not reading:
            errors.append(f"empty ruby payload: {annotation!r}")
        if annotation.get("base_text") != surface:
            errors.append(
                f"ruby source mismatch: data={surface!r}, base={annotation.get('base_text')!r}"
            )
        if annotation.get("nested"):
            errors.append(f"nested plugin ruby: {surface!r}")
        if annotation.get("inside_skipped"):
            errors.append(f"ruby inside skipped content: {surface!r}")
        expected = KNOWN_READINGS.get(surface)
        if expected is not None:
            validated_targets += 1
            if reading != expected:
                errors.append(f"known reading mismatch: {surface}={reading}, expected {expected}")

    if errors:
        preview = "; ".join(errors[:8])
        raise RuntimeError(f"annotation validation failed ({len(errors)} issues): {preview}")
    return validated_targets


def audit_page(context, bundle, site):
    print(f"[starting] {site['category']}: {site['name']}", flush=True)
    page = context.new_page()
    page.add_init_script(MOCK_CHROME)
    result = {
        **site,
        "final_url": None,
        "status": "error",
        "annotation_count": 0,
        "validated_target_count": 0,
        "annotations": [],
        "error": None,
    }

    try:
        page.goto(site["url"], wait_until="domcontentloaded", timeout=30_000)
        try:
            page.wait_for_load_state("networkidle", timeout=6_000)
        except PlaywrightTimeoutError:
            pass
        page.wait_for_timeout(1_000)
        result["final_url"] = page.url

        body_text = page.locator("body").inner_text(timeout=10_000)
        if not re.search(r"[\u3040-\u30ff\u3400-\u9fff]", body_text):
            raise RuntimeError("page did not expose Japanese body text")

        page.add_script_tag(content=bundle)
        page.wait_for_function(
            "() => window.__japaneseFuriganaAiController__?.phase !== 'loading'",
            timeout=30_000,
        )
        controller_status = page.evaluate(
            "() => window.__japaneseFuriganaAiController__?.getStatus()"
        )
        if controller_status.get("phase") != "enabled":
            raise RuntimeError(f"extension status: {controller_status}")

        raw_annotations = page.eval_on_selector_all(
            "ruby[data-jp-furigana]",
            """elements => elements.map((ruby) => ({
              surface: ruby.dataset.jpOriginal,
              reading: ruby.querySelector('rt')?.textContent || '',
              context: (ruby.parentElement?.innerText || '').slice(0, 500),
              base_text: Array.from(ruby.childNodes)
                .filter((node) => node.nodeType === Node.TEXT_NODE)
                .map((node) => node.nodeValue || '')
                .join(''),
              nested: Boolean(ruby.querySelector('ruby[data-jp-furigana]')),
              inside_skipped: Boolean(ruby.parentElement?.closest(
                "script,style,noscript,textarea,input,select,option,button,code,pre,kbd,samp,rt,rp,svg,math,[hidden],[aria-hidden='true'],[contenteditable]:not([contenteditable='false'])"
              ))
            }))""",
        )
        validated_target_count = validate_annotations(raw_annotations)
        result["status"] = "passed"
        result["annotation_count"] = len(raw_annotations)
        result["validated_target_count"] = validated_target_count
        result["annotations"] = compact_annotations(raw_annotations)
        screenshot_path = ARTIFACTS / f"{site['category']}-{safe_slug(site['name'])}.png"
        page.screenshot(path=str(screenshot_path), full_page=False)
        result["screenshot"] = str(screenshot_path.relative_to(ROOT)).replace("\\", "/")
    except Exception as error:
        result["error"] = str(error)
    finally:
        page.close()

    return result


parser = argparse.ArgumentParser(description="Audit the extension against live Japanese websites")
parser.add_argument("--limit", type=int, default=None, help="Only audit the first N selected sites")
parser.add_argument("--category", action="append", choices=["news", "sports", "forum", "academic"])
arguments = parser.parse_args()
selected_sites = [site for site in SITES if not arguments.category or site["category"] in arguments.category]
if arguments.limit is not None:
    selected_sites = selected_sites[: arguments.limit]

if not (DIST / "content.js").is_file():
    raise SystemExit("dist/content.js is missing; run npm run build first")

ARTIFACTS.mkdir(parents=True, exist_ok=True)
bundle_source = (DIST / "content.js").read_text(encoding="utf-8")
results = []

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    browser_context = browser.new_context(
        bypass_csp=True,
        ignore_https_errors=True,
        locale="ja-JP",
        viewport={"width": 1365, "height": 900},
    )
    browser_context.route("**/__jp_ext__/dict/*.gz", dictionary_route)

    for target_site in selected_sites:
        page_result = audit_page(browser_context, bundle_source, target_site)
        results.append(page_result)
        print(
            f"[{page_result['status']}] {target_site['category']}: "
            f"{target_site['name']} ({page_result['annotation_count']} annotations)",
            flush=True,
        )

    browser_context.close()
    browser.close()

summary = {
    "site_count": len(results),
    "passed_count": sum(result["status"] == "passed" for result in results),
    "failed_count": sum(result["status"] != "passed" for result in results),
    "annotation_count": sum(result["annotation_count"] for result in results),
    "validated_target_count": sum(result["validated_target_count"] for result in results),
    "results": results,
}
REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
REPORT_PATH.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
print(
    f"Live audit complete: {summary['passed_count']}/{summary['site_count']} pages, "
    f"{summary['annotation_count']} annotations, "
    f"{summary['validated_target_count']} known-reading checks. Report: {REPORT_PATH}"
)
if summary["failed_count"]:
    raise SystemExit(1)
