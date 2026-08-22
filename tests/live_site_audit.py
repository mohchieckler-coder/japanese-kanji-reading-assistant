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
        "name": "Asahi News",
        "url": "https://www.asahi.com/articles/DA3S16528387.html",
    },
    {
        "category": "news",
        "name": "Asahi Takaichi Thatcher Layout Regression",
        "url": "https://www.asahi.com/sp/articles/ASV8P3V62V8PUTFK00HM.html",
    },
    {
        "category": "sports",
        "name": "Yahoo Sports Article",
        "url": "https://news.yahoo.co.jp/articles/23331cd5c79e0ef5f9e014f7dbe5604d50443ffa",
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

KATAKANA_CANDIDATE_PATTERN = re.compile(r"[\u30a0-\u30ffー・]{2,}")
KNOWN_LOANWORD_ANNOTATIONS = {
    "ニュース": "news",
    "サイト": "site",
    "メンバー": "member",
    "ドラフト": "draft",
    "サッカー": "soccer",
    "ルポ": "（仏）reportage",
    "マーラータン": "（中）málàtàng",
}
CONTEXTUAL_LOANWORD_ANNOTATIONS = {
    # プロ is intentionally suppressed unless the surrounding DOM establishes
    # a professional/sports meaning. Validate it whenever the matcher emits it,
    # but do not require isolated surface occurrences to be annotated.
    "プロ": "professional",
}

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


def compact_katakana_candidates(body_text):
    counts = Counter(KATAKANA_CANDIDATE_PATTERN.findall(body_text))
    return [
        {"surface": surface, "count": count}
        for surface, count in counts.most_common(400)
    ]


def compact_loanword_annotations(raw_annotations):
    counts = Counter()
    examples = defaultdict(list)
    for annotation in raw_annotations:
        key = (
            annotation.get("surface", ""),
            annotation.get("origin", ""),
            annotation.get("language", ""),
        )
        counts[key] += 1
        context = " ".join(annotation.get("context", "").split())[:140]
        if context and context not in examples[key] and len(examples[key]) < 2:
            examples[key].append(context)

    return [
        {
            "surface": surface,
            "origin": origin,
            "language": language,
            "count": count,
            "examples": examples[(surface, origin, language)],
        }
        for (surface, origin, language), count in counts.most_common(400)
    ]


def validate_loanword_annotations(raw_annotations, candidate_surfaces):
    errors = []
    validated_targets = 0
    annotations_by_surface = defaultdict(list)
    for annotation in raw_annotations:
        surface = annotation.get("surface", "")
        origin = annotation.get("origin", "")
        annotations_by_surface[surface].append(origin)
        if not surface or not origin:
            errors.append(f"empty loanword ruby payload: {annotation!r}")
        if annotation.get("base_text") != surface:
            errors.append(
                f"loanword ruby source mismatch: data={surface!r}, "
                f"base={annotation.get('base_text')!r}"
            )
        if annotation.get("nested"):
            errors.append(f"nested loanword ruby: {surface!r}")
        if annotation.get("inside_skipped"):
            errors.append(f"loanword ruby inside skipped content: {surface!r}")
        expected = (
            KNOWN_LOANWORD_ANNOTATIONS.get(surface)
            or CONTEXTUAL_LOANWORD_ANNOTATIONS.get(surface)
        )
        if expected is not None:
            validated_targets += 1
            if origin != expected:
                errors.append(
                    f"known loanword mismatch: {surface}={origin}, expected {expected}"
                )
    for surface, expected in KNOWN_LOANWORD_ANNOTATIONS.items():
        if surface not in candidate_surfaces:
            continue
        if expected not in annotations_by_surface.get(surface, []):
            errors.append(
                f"known loanword missing: {surface}, expected annotation {expected}"
            )
    if errors:
        preview = "; ".join(errors[:8])
        raise RuntimeError(
            f"loanword annotation validation failed ({len(errors)} issues): {preview}"
        )
    return validated_targets


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
        "loanword_annotation_count": 0,
        "validated_loanword_target_count": 0,
        "validated_target_count": 0,
        "annotations": [],
        "loanword_annotations": [],
        "katakana_candidates": [],
        "eligible_katakana_candidates": [],
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
        result["katakana_candidates"] = compact_katakana_candidates(body_text)
        eligible_loanword_text = page.evaluate(
            """() => {
              const skippedSelector = [
                'script', 'style', 'noscript', 'textarea', 'input', 'select', 'option',
                'button', 'code', 'pre', 'kbd', 'samp', 'ruby', 'rt', 'rp', 'svg', 'math',
                '[hidden]', '[aria-hidden="true"]',
                '[contenteditable]:not([contenteditable="false"])'
              ].join(',');
              const chunks = [];
              const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
              while (walker.nextNode()) {
                const node = walker.currentNode;
                const parent = node.parentElement;
                if (!parent || !/[\u30A1-\u30FA\u30FD\u30FE\u30FC]/u.test(node.nodeValue || '')) continue;
                if (parent.closest(skippedSelector)) continue;
                if (!parent.closest('main, article, [role="main"]')
                    && parent.closest('header, nav, [role="navigation"]')) continue;
                let hidden = false;
                for (let current = parent; current; current = current.parentElement) {
                  const style = getComputedStyle(current);
                  if (current.hidden || current.getAttribute('aria-hidden') === 'true'
                      || style.display === 'none' || style.visibility === 'hidden'
                      || style.visibility === 'collapse' || style.contentVisibility === 'hidden') {
                    hidden = true;
                    break;
                  }
                }
                if (!hidden) chunks.push(node.nodeValue || '');
              }
              return chunks.join('\\n');
            }"""
        )
        result["eligible_katakana_candidates"] = compact_katakana_candidates(
            eligible_loanword_text
        )

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

        loanword_status = page.evaluate(
            "async () => window.__japaneseLoanwordOriginController__?.enable()"
        )
        if not loanword_status or loanword_status.get("phase") != "enabled":
            raise RuntimeError(f"loanword extension status: {loanword_status}")

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
        raw_loanword_annotations = page.eval_on_selector_all(
            "ruby[data-jp-loanword-origin]",
            """elements => elements.map((ruby) => ({
              surface: ruby.dataset.jpOriginal,
              origin: ruby.querySelector('rt')?.textContent || '',
              language: ruby.dataset.jpLoanwordLanguage || '',
              context: (ruby.parentElement?.innerText || '').slice(0, 500),
              base_text: Array.from(ruby.childNodes)
                .filter((node) => node.nodeType === Node.TEXT_NODE)
                .map((node) => node.nodeValue || '')
                .join(''),
              nested: Boolean(ruby.querySelector('ruby')),
              inside_skipped: Boolean(ruby.parentElement?.closest(
                "script,style,noscript,textarea,input,select,option,button,code,pre,kbd,samp,rt,rp,svg,math,[hidden],[aria-hidden='true'],[contenteditable]:not([contenteditable='false'])"
              ))
            }))""",
        )
        validated_loanword_target_count = validate_loanword_annotations(
            raw_loanword_annotations,
            {item["surface"] for item in result["eligible_katakana_candidates"]},
        )
        result["status"] = "passed"
        result["annotation_count"] = len(raw_annotations)
        result["loanword_annotation_count"] = len(raw_loanword_annotations)
        result["validated_loanword_target_count"] = validated_loanword_target_count
        result["validated_target_count"] = validated_target_count
        result["annotations"] = compact_annotations(raw_annotations)
        result["loanword_annotations"] = compact_loanword_annotations(
            raw_loanword_annotations
        )
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
            f"{target_site['name']} ({page_result['annotation_count']} readings, "
            f"{page_result['loanword_annotation_count']} loanword origins)",
            flush=True,
        )

    browser_context.close()
    browser.close()

summary = {
    "site_count": len(results),
    "passed_count": sum(result["status"] == "passed" for result in results),
    "failed_count": sum(result["status"] != "passed" for result in results),
    "annotation_count": sum(result["annotation_count"] for result in results),
    "loanword_annotation_count": sum(
        result["loanword_annotation_count"] for result in results
    ),
    "validated_target_count": sum(result["validated_target_count"] for result in results),
    "validated_loanword_target_count": sum(
        result["validated_loanword_target_count"] for result in results
    ),
    "results": results,
}
REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
REPORT_PATH.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
print(
    f"Live audit complete: {summary['passed_count']}/{summary['site_count']} pages, "
    f"{summary['annotation_count']} annotations, "
    f"{summary['loanword_annotation_count']} loanword origins, "
    f"{summary['validated_target_count']} known-reading checks, "
    f"{summary['validated_loanword_target_count']} known-loanword checks. "
    f"Report: {REPORT_PATH}"
)
if summary["failed_count"]:
    raise SystemExit(1)
