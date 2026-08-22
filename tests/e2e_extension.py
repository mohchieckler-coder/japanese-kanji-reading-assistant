from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / "artifacts"


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, _format, *_args):
        pass


def send_message(page, message_type):
    return page.evaluate(
        """(messageType) => new Promise((resolve, reject) => {
          const listener = window.__furiganaMessageListener;
          if (!listener) {
            reject(new Error('message listener was not registered'));
            return;
          }
          const keepChannelOpen = listener({ type: messageType }, {}, resolve);
          if (keepChannelOpen !== true && messageType !== 'GET_FURIGANA_STATUS') {
            reject(new Error('asynchronous response channel was not kept open'));
          }
        })""",
        message_type,
    )


def element_annotations(page, selector):
    return page.eval_on_selector_all(
        f"{selector} ruby[data-jp-furigana]",
        "elements => elements.map((ruby) => [ruby.dataset.jpOriginal, ruby.querySelector('rt').textContent])",
    )


def assert_annotation(page, selector, surface, reading):
    annotations = element_annotations(page, selector)
    assert [surface, reading] in annotations, (
        f"{selector}: expected {surface}={reading}, got {annotations}"
    )


handler = partial(QuietHandler, directory=str(ROOT))
server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
thread = Thread(target=server.serve_forever, daemon=True)
thread.start()
base_url = f"http://127.0.0.1:{server.server_port}"

try:
    ARTIFACTS.mkdir(exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()
        console_errors = []
        failed_responses = []
        page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
        page.on("response", lambda response: failed_responses.append(f"{response.status} {response.url}") if response.status >= 400 else None)
        page.add_init_script(
            f"""
            window.chrome = {{
              runtime: {{
                getURL: (path) => {base_url!r} + '/dist/' + path,
                lastError: undefined,
                sendMessage: (message, callback) => {{
                  window.__translationMessages = window.__translationMessages || [];
                  window.__translationMessages.push(message);
                  if (message.type === 'TRANSLATE_TEXT') {{
                    if (window.__translationMockError) {{
                      const errorResponse = window.__translationMockError;
                      window.__translationMockError = null;
                      window.setTimeout(() => callback(errorResponse), 0);
                      return;
                    }}
                    window.setTimeout(() => callback({{
                      ok: true,
                      translation: '<img src=x onerror="window.__translationXss=true">安全译文',
                      targetLanguage: 'zh-CN',
                      selectionType: message.selectionType,
                      usage: {{ inputTokens: 12, outputTokens: 6, totalTokens: 18 }}
                    }}), 0);
                    return;
                  }}
                  if (message.type === 'OPEN_TRANSLATION_OPTIONS') {{
                    window.__translationOptionsOpened = true;
                    window.setTimeout(() => callback({{ ok: true, opened: true }}), 0);
                    return;
                  }}
                  window.setTimeout(() => callback({{ ok: false, error: 'Unexpected message' }}), 0);
                }},
                onMessage: {{
                  addListener: (listener) => {{
                    window.__furiganaMessageListener = listener;
                  }}
                }}
              }}
            }};
            window.__japaneseSelectionTranslationController__ = {{ buildVersion: '2.0.0' }};
            window.__japaneseFuriganaAiController__ = {{ buildVersion: '2.0.0' }};
            document.addEventListener('mouseup', () => {{
              if (!window.__simulateStaleTranslationController) return;
              window.setTimeout(() => {{
                let stale = document.getElementById('stale-translation-host');
                if (!stale) {{
                  stale = document.createElement('div');
                  stale.id = 'stale-translation-host';
                  stale.setAttribute('data-jp-translation-ui', '');
                  stale.setAttribute('aria-live', 'polite');
                }}
                document.documentElement.append(stale);
              }}, 0);
            }}, true);
            """
        )
        page.goto(f"{base_url}/tests/fixtures/sample.html")
        page.wait_for_load_state("networkidle")
        page.add_script_tag(url=f"{base_url}/dist/content.js")

        try:
            page.wait_for_function(
                "() => window.__japaneseFuriganaAiController__?.phase !== 'loading'",
                timeout=30_000,
            )
            startup_status = send_message(page, "GET_FURIGANA_STATUS")
            assert startup_status["phase"] == "enabled", startup_status
            assert page.locator("ruby[data-jp-furigana]").count() >= 6
            assert page.evaluate(
                "window.__japaneseSelectionTranslationController__.buildVersion === '2.4.1'"
            )
            assert page.evaluate(
                "window.__japaneseFuriganaAiController__.buildVersion === '2.4.1'"
            )
        except Exception:
            status = send_message(page, "GET_FURIGANA_STATUS") if page.evaluate("Boolean(window.__furiganaMessageListener)") else None
            print(f"Diagnostic status: {status}")
            print(f"Diagnostic console errors: {console_errors}")
            print(f"Diagnostic failed responses: {failed_responses}")
            raise

        annotations = page.eval_on_selector_all(
            "ruby[data-jp-furigana]",
            "elements => elements.map((ruby) => ({ text: ruby.dataset.jpOriginal, reading: ruby.querySelector('rt').textContent }))",
        )
        assert {"text": "東京", "reading": "とうきょう"} in annotations
        assert {"text": "漢字", "reading": "かんじ"} in annotations
        weekday_cases = {
            "weekday-sun": ("日", "にち"),
            "weekday-mon": ("月", "げつ"),
            "weekday-tue": ("火", "か"),
            "weekday-wed": ("水", "すい"),
            "weekday-thu": ("木", "もく"),
            "weekday-fri": ("金", "きん"),
            "weekday-sat": ("土", "ど"),
        }
        for element_id, (surface, reading) in weekday_cases.items():
            matching_readings = page.eval_on_selector_all(
                f"#{element_id} ruby[data-jp-furigana]",
                "(elements, expectedSurface) => elements.filter((ruby) => ruby.dataset.jpOriginal === expectedSurface).map((ruby) => ruby.querySelector('rt').textContent)",
                surface,
            )
            assert reading in matching_readings, f"{element_id}: expected {surface}={reading}, got {matching_readings}"
        ordinary_month_readings = page.eval_on_selector_all(
            "#ordinary-month ruby[data-jp-furigana]",
            "elements => elements.filter((ruby) => ruby.dataset.jpOriginal === '月').map((ruby) => ruby.querySelector('rt').textContent)",
        )
        assert "つき" in ordinary_month_readings
        assert "げつ" not in ordinary_month_readings
        calendar_month_readings = page.eval_on_selector_all(
            "#weather-headline ruby[data-jp-furigana]",
            "elements => elements.filter((ruby) => ruby.dataset.jpOriginal === '月').map((ruby) => ruby.querySelector('rt').textContent)",
        )
        assert calendar_month_readings == ["がつ", "がつ"]
        rain_readings = page.eval_on_selector_all(
            "#weather-headline ruby[data-jp-furigana]",
            "elements => elements.filter((ruby) => ruby.dataset.jpOriginal === '雨').map((ruby) => ruby.querySelector('rt').textContent)",
        )
        assert rain_readings == ["あめ"]
        compound_annotations = page.eval_on_selector_all(
            "#weather-compounds ruby[data-jp-furigana]",
            "elements => elements.map((ruby) => [ruby.dataset.jpOriginal, ruby.querySelector('rt').textContent])",
        )
        assert ["雨量", "うりょう"] in compound_annotations
        assert ["豪雨", "ごうう"] in compound_annotations
        assert ["梅雨", "つゆ"] in compound_annotations
        assert ["雨", "う"] in compound_annotations
        for surface, reading in [
            ("20日", "はつか"),
            ("24日", "にじゅうよっか"),
            ("木", "もく"),
            ("月", "げつ"),
        ]:
            assert_annotation(page, "#special-days", surface, reading)
        assert_annotation(page, "#split-weekday-date", "木", "もく")
        assert_annotation(page, "#split-dot-date", "月", "げつ")
        assert_annotation(page, "#split-bare-date", "木", "もく")
        assert_annotation(page, "#invalid-dot-date", "月", "つき")
        assert_annotation(page, "#blocked-weekday-date", "木", "き")

        for surface, reading in [
            ("六回", "ろっかい"),
            ("一回", "いっかい"),
            ("八回", "はっかい"),
            ("十回", "じゅっかい"),
            ("百回", "ひゃっかい"),
            ("昨夏", "さっか"),
        ]:
            assert_annotation(page, "#round-counters", surface, reading)
        assert ["108回", "ひゃくはっかい"] not in element_annotations(page, "#round-counters")

        for surface, reading in [
            ("既読", "きどく"),
            ("自治厨", "じちちゅう"),
            ("公録", "こうろく"),
            ("売", "う"),
            ("時", "どき"),
            ("立", "た"),
            ("主様", "ぬしさま"),
            ("笑", "わらい"),
            ("泣", "なき"),
        ]:
            assert_annotation(page, "#community-phrases", surface, reading)
        community_annotations = element_annotations(page, "#community-phrases")
        assert ["後", "あと"] in community_annotations
        assert ["後", "ご"] in community_annotations
        assert ["辛", "から"] in community_annotations
        assert ["辛", "つら"] in community_annotations
        assert not any(any("ぁ" <= character <= "ゖ" or "ァ" <= character <= "ヺ" for character in surface)
                       for surface, _ in community_annotations)

        okurigana_annotations = element_annotations(page, "#okurigana-loanword")
        for expected in [
            ["麻辣湯", "マーラータン"],
            ["麻辣烫", "マーラータン"],
            ["食", "た"],
            ["低", "ひく"],
            ["発", "はっ"],
            ["使", "つか"],
            ["読", "よ"],
            ["申", "もう"],
            ["込", "こ"],
        ]:
            assert expected in okurigana_annotations, (
                f"okurigana/loanword regression: expected {expected}, got {okurigana_annotations}"
            )
        assert not any(any("ぁ" <= character <= "ゖ" or "ァ" <= character <= "ヺ" for character in surface)
                       for surface, _ in okurigana_annotations)
        assert page.locator("#okurigana-loanword").evaluate(
            """(element) => {
              const clone = element.cloneNode(true);
              clone.querySelectorAll('rt').forEach((reading) => reading.remove());
              return clone.textContent;
            }"""
        ) == "麻辣湯と麻辣烫を食べる。地位が低い層ほど、子どもから発せられた話が使われた。お読みいただき、申し込む。"

        spacing_layout = page.evaluate(
            """() => {
              const lineTops = (selector) => {
                const root = document.querySelector(selector);
                const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
                const tops = [];
                while (walker.nextNode()) {
                  const node = walker.currentNode;
                  if (node.parentElement?.closest('rt, rp')) continue;
                  for (let offset = 0; offset < node.length; offset += 1) {
                    const range = document.createRange();
                    range.setStart(node, offset);
                    range.setEnd(node, offset + 1);
                    const rect = range.getBoundingClientRect();
                    if (rect.width || rect.height) tops.push(Math.round(rect.top * 2) / 2);
                  }
                }
                return [...new Set(tops)].length;
              };
              const sample = document.querySelector('#ruby-spacing-regression');
              const rubies = [...sample.querySelectorAll('ruby[data-jp-furigana]')];
              return {
                referenceLines: lineTops('#ruby-spacing-reference'),
                annotatedLines: lineTops('#ruby-spacing-regression'),
                clientWidth: sample.clientWidth,
                scrollWidth: sample.scrollWidth,
                rubyStyles: rubies.map((ruby) => {
                  const reading = ruby.querySelector('rt');
                  const rubyStyle = getComputedStyle(ruby);
                  const readingStyle = getComputedStyle(reading);
                  return {
                    surface: ruby.dataset.jpOriginal,
                    rubyAlign: rubyStyle.rubyAlign,
                    rubyOverhang: rubyStyle.rubyOverhang,
                    letterSpacing: readingStyle.letterSpacing,
                    wordSpacing: readingStyle.wordSpacing,
                    textAlign: readingStyle.textAlign,
                    textIndent: readingStyle.textIndent,
                    whiteSpace: readingStyle.whiteSpace
                  };
                })
              };
            }"""
        )
        assert spacing_layout["rubyStyles"], spacing_layout
        for ruby_style in spacing_layout["rubyStyles"]:
            assert ruby_style == {
                "surface": ruby_style["surface"],
                "rubyAlign": "center",
                "rubyOverhang": "auto",
                "letterSpacing": "normal",
                "wordSpacing": "0px",
                "textAlign": "center",
                "textIndent": "0px",
                "whiteSpace": "nowrap",
            }, ruby_style
        assert spacing_layout["scrollWidth"] <= spacing_layout["clientWidth"] + 1, spacing_layout
        assert spacing_layout["annotatedLines"] <= spacing_layout["referenceLines"] + 1, spacing_layout

        for surface, reading in [
            ("1人", "ひとり"),
            ("2人", "ふたり"),
            ("一人", "ひとり"),
            ("二人", "ふたり"),
            ("一人一人", "ひとりひとり"),
        ]:
            assert_annotation(page, "#people-counters", surface, reading)
        people_positive_annotations = element_annotations(page, "#people-counters")
        assert sum(annotation == ["1人", "ひとり"] for annotation in people_positive_annotations) == 3
        assert sum(annotation == ["2人", "ふたり"] for annotation in people_positive_annotations) == 2
        assert sum(annotation == ["二人", "ふたり"] for annotation in people_positive_annotations) == 1
        assert ["二人組", "ふたりぐみ"] in people_positive_annotations
        people_negative_annotations = element_annotations(page, "#people-counter-negatives")
        for surface in ["1人", "2人", "一人", "二人"]:
            assert not any(annotation[0] == surface for annotation in people_negative_annotations)
        assert ["一人称", "いちにんしょう"] in people_negative_annotations
        assert ["二人称", "ににんしょう"] in people_negative_annotations
        assert ["人前", "にんまえ"] in people_negative_annotations
        assert ["二人三脚", "ににんさんきゃく"] in people_negative_annotations
        split_counter_annotations = element_annotations(page, "#split-counter-negative")
        assert ["1人", "ひとり"] not in split_counter_annotations
        assert ["人", "にん"] in split_counter_annotations
        assert ["称", "しょう"] in split_counter_annotations

        for surface, reading in [
            ("博士課程", "はくしかてい"),
            ("日本研究", "にほんけんきゅう"),
            ("協働", "きょうどう"),
            ("日本初", "にほんはつ"),
            ("相転移", "そうてんい"),
            ("平均場", "へいきんば"),
            ("骨髄", "こつずい"),
            ("幹細胞", "かんさいぼう"),
            ("妊娠高血圧腎症", "にんしんこうけつあつじんしょう"),
            ("頭頸部", "とうけいぶ"),
            ("浸透圧", "しんとうあつ"),
            ("膵", "すい"),
        ]:
            assert_annotation(page, "#academic-phrases", surface, reading)
        assert_annotation(page, "#ordinary-meanings", "博士", "はかせ")
        assert_annotation(page, "#ordinary-meanings", "幹", "みき")
        assert_annotation(page, "#ordinary-meanings", "頭", "あたま")
        assert_annotation(page, "#ordinary-meanings", "神主", "かんぬし")
        assert_annotation(page, "#ordinary-meanings", "初日", "しょにち")
        assert ["日本初", "にほんはつ"] not in element_annotations(page, "#ordinary-meanings")
        for surface, reading in [
            ("博士", "はくし"),
            ("課程", "かてい"),
            ("中", "ちゅう"),
            ("日", "にち"),
            ("巨", "きょ"),
            ("人", "じん"),
            ("非", "ひ"),
            ("常", "じょう"),
            ("本初", "ほんはつ"),
            ("骨", "こつ"),
            ("髄", "ずい"),
        ]:
            assert_annotation(page, "#split-compounds", surface, reading)
        assert_annotation(page, "#split-compounds", "日", "に")
        assert ["3日", "みっか"] not in element_annotations(page, "#split-compounds")

        for surface, reading in [
            ("金正恩", "キム・ジョンウン"),
            ("習近平", "シージンピン"),
            ("李在明", "イ・ジェミョン"),
            ("阮富仲", "グエン・フー・チョン"),
        ]:
            assert_annotation(page, "#foreign-name-unique", surface, reading)
        for surface, reading in [
            ("李強", "リー・チアン"),
            ("王毅", "ワン・イー"),
            ("蘇林", "トー・ラム"),
            ("梁強", "ルオン・クオン"),
            ("范明政", "ファム・ミン・チン"),
            ("裴青山", "ブイ・タイン・ソン"),
            ("胡志明", "ホー・チ・ミン"),
        ]:
            assert_annotation(page, "#foreign-name-contextual", surface, reading)
        assert_annotation(page, "#foreign-name-provided", "張偉", "チャン・ウェイ")
        for surface, reading in [
            ("金", "キム"),
            ("正恩", "ジョンウン"),
            ("習近", "シージン"),
            ("平", "ピン"),
            ("李在", "イ・ジェ"),
            ("明", "ミョン"),
            ("崔", "チェ"),
            ("竜", "リョン"),
            ("海", "ヘ"),
            ("全", "チョン"),
            ("斗", "ドゥ"),
            ("煥", "ファン"),
        ]:
            assert_annotation(page, "#foreign-name-split", surface, reading)
        negative_person_annotations = element_annotations(page, "#foreign-name-negatives")
        for forbidden in [
            ["李強", "リー・チアン"],
            ["王毅", "ワン・イー"],
            ["蘇林", "トー・ラム"],
            ["胡志明", "ホー・チ・ミン"],
        ]:
            assert forbidden not in negative_person_annotations
        assert page.locator("#code ruby").count() == 0
        assert page.locator("#editable ruby").count() == 0
        assert page.locator("#existing ruby").count() == 0

        page.evaluate(
            """() => {
              const paragraph = document.createElement('p');
              paragraph.id = 'dynamic';
              paragraph.textContent = '明日は大阪へ行きます。';
              document.querySelector('main').append(paragraph);
            }"""
        )
        page.wait_for_selector("#dynamic ruby[data-jp-furigana]")

        page.evaluate(
            """() => {
              const paragraph = document.createElement('p');
              paragraph.id = 'dynamic-split';
              const date = document.createElement('span');
              date.textContent = '24日（';
              paragraph.append(date);
              document.querySelector('main').append(paragraph);
            }"""
        )
        page.wait_for_selector("#dynamic-split ruby[data-jp-furigana]")
        assert_annotation(page, "#dynamic-split", "24日", "にじゅうよっか")
        page.evaluate(
            """() => {
              const weekday = document.createElement('strong');
              weekday.textContent = '月';
              const closing = document.createElement('span');
              closing.textContent = '）';
              document.querySelector('#dynamic-split').append(weekday, closing);
            }"""
        )
        page.wait_for_selector("#dynamic-split strong ruby[data-jp-furigana]")
        assert_annotation(page, "#dynamic-split", "月", "げつ")

        page.evaluate(
            """() => {
              const paragraph = document.createElement('p');
              paragraph.id = 'delayed-closing-date';
              const opening = document.createElement('span');
              opening.textContent = '20日（';
              const weekday = document.createElement('strong');
              weekday.textContent = '木';
              paragraph.append(opening, weekday);
              document.querySelector('main').append(paragraph);
            }"""
        )
        page.wait_for_selector("#delayed-closing-date strong ruby[data-jp-furigana]")
        assert_annotation(page, "#delayed-closing-date", "木", "き")
        page.evaluate(
            """() => {
              const closing = document.createElement('span');
              closing.textContent = '）';
              document.querySelector('#delayed-closing-date').append(closing);
            }"""
        )
        page.wait_for_function(
            """() => document.querySelector('#delayed-closing-date strong ruby rt')?.textContent === 'もく'"""
        )
        assert_annotation(page, "#delayed-closing-date", "木", "もく")

        page.evaluate(
            """() => {
              const paragraph = document.createElement('p');
              paragraph.id = 'character-data-update';
              const liveText = document.createElement('span');
              liveText.textContent = '--';
              paragraph.append(liveText);
              document.querySelector('main').append(paragraph);
            }"""
        )
        page.wait_for_timeout(100)
        page.evaluate("() => { document.querySelector('#character-data-update span').firstChild.nodeValue = '中日勝利'; }")
        page.wait_for_selector("#character-data-update ruby[data-jp-furigana]")
        assert_annotation(page, "#character-data-update", "中日", "ちゅうにち")

        page.evaluate(
            """() => {
              const paragraph = document.createElement('p');
              paragraph.id = 'dynamic-foreign-name';
              const name = document.createElement('span');
              name.textContent = '蘇林';
              paragraph.append(name);
              document.querySelector('main').append(paragraph);
            }"""
        )
        page.wait_for_selector("#dynamic-foreign-name ruby[data-jp-furigana]")
        assert ["蘇林", "トー・ラム"] not in element_annotations(page, "#dynamic-foreign-name")
        page.evaluate(
            """() => {
              const context = document.createElement('strong');
              context.id = 'dynamic-foreign-context';
              context.textContent = 'ベトナム国家主席';
              document.querySelector('#dynamic-foreign-name').append(context);
            }"""
        )
        page.wait_for_function(
            """() => [...document.querySelectorAll('#dynamic-foreign-name ruby[data-jp-furigana]')]
              .some((ruby) => ruby.dataset.jpOriginal === '蘇林' && ruby.querySelector('rt')?.textContent === 'トー・ラム')"""
        )
        page.evaluate("() => document.querySelector('#dynamic-foreign-context').remove()")
        page.wait_for_function(
            """() => ![...document.querySelectorAll('#dynamic-foreign-name ruby[data-jp-furigana]')]
              .some((ruby) => ruby.dataset.jpOriginal === '蘇林' && ruby.querySelector('rt')?.textContent === 'トー・ラム')"""
        )

        page.evaluate(
            """() => {
              const paragraph = document.createElement('p');
              paragraph.id = 'dynamic-person-role';
              const name = document.createElement('span');
              name.textContent = '胡志明';
              paragraph.append(name);
              document.querySelector('main').append(paragraph);
            }"""
        )
        page.wait_for_selector("#dynamic-person-role ruby[data-jp-furigana]")
        assert ["胡志明", "ホー・チ・ミン"] not in element_annotations(page, "#dynamic-person-role")
        page.evaluate(
            """() => {
              const role = document.createElement('strong');
              role.id = 'dynamic-person-role-hint';
              role.textContent = '革命家';
              document.querySelector('#dynamic-person-role').append(role);
            }"""
        )
        page.wait_for_function(
            """() => [...document.querySelectorAll('#dynamic-person-role ruby[data-jp-furigana]')]
              .some((ruby) => ruby.dataset.jpOriginal === '胡志明' && ruby.querySelector('rt')?.textContent === 'ホー・チ・ミン')"""
        )
        page.evaluate("() => document.querySelector('#dynamic-person-role-hint').remove()")
        page.wait_for_function(
            """() => ![...document.querySelectorAll('#dynamic-person-role ruby[data-jp-furigana]')]
              .some((ruby) => ruby.dataset.jpOriginal === '胡志明' && ruby.querySelector('rt')?.textContent === 'ホー・チ・ミン')"""
        )

        page.evaluate(
            """() => {
              const paragraph = document.createElement('p');
              paragraph.id = 'dynamic-split-person';
              const first = document.createElement('span');
              first.textContent = '全';
              const second = document.createElement('i');
              second.textContent = '斗';
              paragraph.append(first, second);
              document.querySelector('main').append(paragraph);
            }"""
        )
        page.wait_for_selector("#dynamic-split-person ruby[data-jp-furigana]")
        page.evaluate(
            """() => {
              const last = document.createElement('u');
              last.id = 'dynamic-split-person-last';
              last.textContent = '煥';
              document.querySelector('#dynamic-split-person').append(last);
            }"""
        )
        page.wait_for_function(
            """() => {
              const annotations = [...document.querySelectorAll('#dynamic-split-person ruby[data-jp-furigana]')]
                .map((ruby) => [ruby.dataset.jpOriginal, ruby.querySelector('rt')?.textContent]);
              return [['全', 'チョン'], ['斗', 'ドゥ'], ['煥', 'ファン']]
                .every((expected) => annotations.some((actual) => actual[0] === expected[0] && actual[1] === expected[1]));
            }"""
        )
        page.evaluate("() => document.querySelector('#dynamic-split-person-last').remove()")
        page.wait_for_function(
            """() => ![...document.querySelectorAll('#dynamic-split-person ruby[data-jp-furigana]')]
              .some((ruby) => ['チョン', 'ドゥ', 'ファン'].includes(ruby.querySelector('rt')?.textContent))"""
        )

        page.evaluate(
            """() => {
              const fixture = document.createElement('section');
              fixture.id = 'translation-fixture';
              const sentence = document.createElement('p');
              sentence.id = 'translation-sentence';
              sentence.textContent = '日本語を勉強します。';
              const word = document.createElement('code');
              word.id = 'translation-word';
              word.textContent = '天気';
              const paragraph = document.createElement('code');
              paragraph.id = 'translation-paragraph';
              paragraph.textContent = '第一文です。第二文です。';
              fixture.append(sentence, word, paragraph);
              document.querySelector('main').append(fixture);
            }"""
        )
        page.wait_for_selector("#translation-sentence ruby[data-jp-furigana]")

        def select_translation_fixture(selector):
            page.evaluate(
                """(selector) => {
                  const target = document.querySelector(selector);
                  const range = document.createRange();
                  range.selectNodeContents(target);
                  const selection = window.getSelection();
                  selection.removeAllRanges();
                  selection.addRange(range);
                  target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                }""",
                selector,
            )
            page.wait_for_function(
                """() => {
                  const controller = window.__japaneseSelectionTranslationController__;
                  return controller && !controller.actionButton.hidden;
                }"""
            )
            return page.evaluate(
                """() => ({
                  text: window.__japaneseSelectionTranslationController__.lastSelection.text,
                  type: window.__japaneseSelectionTranslationController__.lastSelection.selectionType,
                  label: window.__japaneseSelectionTranslationController__.actionButton.textContent
                })"""
            )

        sentence_selection = select_translation_fixture("#translation-sentence")
        assert sentence_selection == {
            "text": "日本語を勉強します。",
            "type": "sentence",
            "label": "翻译句子",
        }, sentence_selection
        page.evaluate("() => window.__japaneseSelectionTranslationController__.actionButton.click()")
        page.wait_for_function(
            """() => window.__japaneseSelectionTranslationController__.translation.textContent.includes('安全译文')"""
        )
        translation_ui = page.evaluate(
            """() => {
              const controller = window.__japaneseSelectionTranslationController__;
              return {
                translation: controller.translation.textContent,
                target: controller.targetValue.textContent,
                usage: controller.usage.textContent,
                imageCount: controller.shadowRoot.querySelectorAll('img').length,
                xssTriggered: Boolean(window.__translationXss),
                request: window.__translationMessages.at(-1)
              };
            }"""
        )
        assert translation_ui["translation"] == '<img src=x onerror="window.__translationXss=true">安全译文'
        assert translation_ui["target"] == "zh-CN"
        assert "合计 18" in translation_ui["usage"]
        assert translation_ui["imageCount"] == 0
        assert not translation_ui["xssTriggered"]
        assert translation_ui["request"]["text"] == "日本語を勉強します。"
        assert translation_ui["request"]["selectionType"] == "sentence"

        page.evaluate("window.__simulateStaleTranslationController = true")
        word_selection = select_translation_fixture("#translation-word")
        assert word_selection["text"] == "天気"
        assert word_selection["type"] == "word"
        page.wait_for_function("() => !document.getElementById('stale-translation-host')")
        page.evaluate("window.__simulateStaleTranslationController = false")
        page.evaluate("() => window.__japaneseSelectionTranslationController__.actionButton.click()")
        page.wait_for_function(
            """() => window.__translationMessages.filter((item) => item.type === 'TRANSLATE_TEXT').length === 2"""
        )
        assert page.evaluate("window.__translationMessages.at(-1).selectionType") == "word"

        paragraph_selection = select_translation_fixture("#translation-paragraph")
        assert paragraph_selection["text"] == "第一文です。第二文です。"
        assert paragraph_selection["type"] == "paragraph"
        page.evaluate("() => window.__japaneseSelectionTranslationController__.actionButton.click()")
        page.wait_for_function(
            """() => window.__translationMessages.filter((item) => item.type === 'TRANSLATE_TEXT').length === 3"""
        )
        assert page.evaluate("window.__translationMessages.at(-1).selectionType") == "paragraph"

        page.evaluate(
            """() => {
              window.__translationMockError = {
                ok: false,
                code: 'API_KEY_MISSING',
                error: '请先在管理面板配置 API Key'
              };
            }"""
        )
        select_translation_fixture("#translation-word")
        page.evaluate("() => window.__japaneseSelectionTranslationController__.actionButton.click()")
        page.wait_for_function(
            """() => !window.__japaneseSelectionTranslationController__.optionsButton.hidden"""
        )
        error_ui = page.evaluate(
            """() => {
              const controller = window.__japaneseSelectionTranslationController__;
              return {
                message: controller.status.textContent,
                button: controller.optionsButton.textContent
              };
            }"""
        )
        assert "尚未配置翻译 API" in error_ui["message"]
        assert error_ui["button"] == "打开管理面板"
        page.evaluate("() => window.__japaneseSelectionTranslationController__.optionsButton.click()")
        page.wait_for_function("() => Boolean(window.__translationOptionsOpened)")

        first_count = page.locator("ruby[data-jp-furigana]").count()
        page.evaluate("window.__translationControllerBefore = window.__japaneseSelectionTranslationController__")
        page.add_script_tag(url=f"{base_url}/dist/content.js")
        page.wait_for_timeout(150)
        assert page.locator("ruby[data-jp-furigana]").count() == first_count
        assert page.locator("ruby[data-jp-furigana] ruby[data-jp-furigana]").count() == 0
        assert page.evaluate(
            """() => [...document.querySelectorAll('[data-jp-translation-ui]')]
              .filter((element) => element === window.__japaneseSelectionTranslationController__.host).length === 1"""
        )
        assert page.evaluate(
            "window.__translationControllerBefore === window.__japaneseSelectionTranslationController__"
        )

        disabled = send_message(page, "TOGGLE_FURIGANA")
        assert disabled["phase"] == "idle"
        assert page.locator("ruby[data-jp-furigana]").count() == 0
        assert "東京で新しい技術を発表" in page.locator("h1").inner_text()
        assert page.locator("#dynamic-split").inner_text() == "24日（月）"
        assert page.locator("#delayed-closing-date").inner_text() == "20日（木）"
        assert page.locator("#character-data-update").inner_text() == "中日勝利"
        assert page.locator("#foreign-name-split").inner_text() == "金正恩、習近平、李在明、崔竜海、全斗煥"
        assert page.locator("#foreign-name-split span").count() == 5
        assert page.locator("#foreign-name-split strong").count() == 1
        assert page.locator("#foreign-name-split em").count() == 1
        assert page.locator("#foreign-name-split b").count() == 1
        assert page.locator("#foreign-name-split i").count() == 2
        assert page.locator("#foreign-name-split u").count() == 2

        enabled = send_message(page, "TOGGLE_FURIGANA")
        assert enabled["phase"] == "enabled"
        assert page.locator("ruby[data-jp-furigana]").count() >= 6
        assert_annotation(page, "#dynamic-split", "月", "げつ")
        assert_annotation(page, "#delayed-closing-date", "木", "もく")
        assert_annotation(page, "#character-data-update", "中日", "ちゅうにち")
        assert_annotation(page, "#foreign-name-unique", "金正恩", "キム・ジョンウン")
        assert_annotation(page, "#foreign-name-split", "正恩", "ジョンウン")

        page.screenshot(path=str(ARTIFACTS / "furigana-e2e.png"), full_page=True)
        assert not console_errors, f"Browser console errors: {console_errors}"

        popup = context.new_page()
        popup_errors = []
        popup.on("console", lambda message: popup_errors.append(message.text) if message.type == "error" else None)
        popup.add_init_script(
            """
            window.__scriptInjected = false;
            window.__popupMessages = [];
            const readPopupSettings = () => {
              let persisted = {};
              try { persisted = JSON.parse(localStorage.getItem('translationSettingsMock') || '{}'); } catch {}
              return {
                baseUrl: 'https://api.example.test/v1',
                model: 'test-model',
                targetLanguage: persisted.targetLanguage || 'zh-CN',
                uiLanguage: persisted.uiLanguage || 'zh-CN',
                hasApiKey: true,
                apiKeyHint: '••••1234'
              };
            };
            window.chrome = {
              runtime: {
                  getManifest: () => ({ version: '2.4.1' }),
                sendMessage: async (message) => {
                  window.__popupMessages.push(structuredClone(message));
                  if (message.type === 'GET_TRANSLATION_DASHBOARD') {
                    return {
                      settings: readPopupSettings(),
                      history: [],
                      usageRecords: [],
                      usageSummary: { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: 0 }
                    };
                  }
                  if (message.type === 'SAVE_TRANSLATION_SETTINGS') {
                    const settings = readPopupSettings();
                    const next = { ...settings, ...(message.settings || {}) };
                    localStorage.setItem('translationSettingsMock', JSON.stringify({
                      targetLanguage: next.targetLanguage,
                      uiLanguage: next.uiLanguage
                    }));
                    return {
                      ok: true,
                      settings: next,
                      history: [],
                      usageRecords: [],
                      usageSummary: { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: 0 }
                    };
                  }
                  throw new Error(`Unexpected runtime message: ${message.type}`);
                },
                openOptionsPage: async () => { window.__optionsOpened = true; }
              },
              tabs: {
                query: async () => [{ id: 42, url: 'https://example.test/news' }],
                sendMessage: async (_tabId, message) => {
                  if (!window.__scriptInjected) throw new Error('Receiving end does not exist');
                  if (message.type === 'GET_FURIGANA_STATUS') {
                    return { phase: 'enabled', enabled: true, count: 8, message: '' };
                  }
                  return { phase: 'idle', enabled: false, count: 0, message: '' };
                }
              },
              scripting: {
                executeScript: async () => { window.__scriptInjected = true; }
              }
            };
            """
        )
        popup.goto(f"{base_url}/dist/popup.html")
        popup.wait_for_load_state("networkidle")
        popup.locator("#ui-language").wait_for()
        popup_locale_expectations = [
            {
                "locale": "en",
                "title": "Japanese Kanji AI Reading Assistant",
                "ready": "Enable readings for Japanese kanji and translate selected text.",
                "enable": "Enable readings and selection translation",
                "configured_badge": "Configured",
                "translation": "Translate to: Simplified Chinese · Model: test-model",
                "open": "Open translation management",
                "saved": "Interface language changed to English",
                "aria": "Choose the popup interface language",
            },
            {
                "locale": "ja",
                "title": "日本語漢字 AI 読み方アシスタント",
                "ready": "有効にすると漢字にふりがなを表示し、選択したテキストを翻訳できます。",
                "enable": "ふりがなと選択翻訳を有効にする",
                "configured_badge": "設定済み",
                "translation": "翻訳先：簡体字中国語 · モデル：test-model",
                "open": "翻訳管理パネルを開く",
                "saved": "表示言語を日本語に変更しました",
                "aria": "ポップアップの表示言語を選択",
            },
            {
                "locale": "ko",
                "title": "일본어 한자 AI 읽기 도우미",
                "ready": "활성화하면 한자 읽기를 표시하고 선택한 텍스트를 번역할 수 있습니다.",
                "enable": "읽기 및 선택 번역 활성화",
                "configured_badge": "설정됨",
                "translation": "번역 언어: 중국어(간체) · 모델: test-model",
                "open": "번역 관리 패널 열기",
                "saved": "인터페이스 언어를 한국어(으)로 변경했습니다",
                "aria": "팝업 인터페이스 언어 선택",
            },
            {
                "locale": "zh-CN",
                "title": "日语汉字 AI 读音助手",
                "ready": "点击启用后，将显示平假名读音，并可选中文字翻译。",
                "enable": "启用当前页读音与划词翻译",
                "configured_badge": "已配置",
                "translation": "目标语：简体中文 · 模型：test-model",
                "open": "打开翻译管理面板",
                "saved": "界面语言已切换为中文",
                "aria": "选择弹窗界面语言",
            },
        ]
        for expected in popup_locale_expectations:
            popup.locator("#ui-language").select_option(expected["locale"])
            popup.get_by_text(expected["saved"], exact=True).wait_for()
            assert popup.locator("html").get_attribute("lang") == expected["locale"]
            assert popup.title() == expected["title"]
            assert popup.locator("#ui-language").get_attribute("aria-label") == expected["aria"]
            assert popup.locator("#ui-language").get_attribute("title") == expected["aria"]
            assert popup.locator("#status").inner_text() == expected["ready"]
            assert popup.locator("#toggle").inner_text() == expected["enable"]
            assert popup.locator("#translation-badge").inner_text() == expected["configured_badge"]
            assert popup.locator("#translation-status").inner_text() == expected["translation"]
            assert popup.locator("#open-options").inner_text() == expected["open"]
            for key in [
                "popup.uiLanguage.label",
                "popup.title",
                "popup.translation.heading",
                "popup.privacy",
            ]:
                assert popup.locator(f'[data-i18n="{key}"]').inner_text() == popup.evaluate(
                    "([locale, key]) => JP_TRANSLATION_I18N.translate(locale, key)",
                    [expected["locale"], key],
                )
            popup_save = popup.evaluate(
                "window.__popupMessages.filter((message) => message.type === 'SAVE_TRANSLATION_SETTINGS').at(-1)"
            )
            assert popup_save["settings"] == {"uiLanguage": expected["locale"]}
            persisted = popup.evaluate(
                "JSON.parse(localStorage.getItem('translationSettingsMock'))"
            )
            assert persisted == {"targetLanguage": "zh-CN", "uiLanguage": expected["locale"]}
            popup_layout = popup.evaluate(
                """() => ({
                  bodyClientWidth: document.body.clientWidth,
                  bodyScrollWidth: document.body.scrollWidth,
                  mainClientWidth: document.querySelector('main').clientWidth,
                  mainScrollWidth: document.querySelector('main').scrollWidth,
                  controls: [...document.querySelectorAll('button, .translation-card')].map((element) => ({
                    clientWidth: element.clientWidth,
                    scrollWidth: element.scrollWidth,
                    height: element.getBoundingClientRect().height,
                  })),
                })"""
            )
            assert popup_layout["bodyScrollWidth"] <= popup_layout["bodyClientWidth"], popup_layout
            assert popup_layout["mainScrollWidth"] <= popup_layout["mainClientWidth"], popup_layout
            for control in popup_layout["controls"]:
                assert control["scrollWidth"] <= control["clientWidth"], popup_layout
                assert control["height"] > 0, popup_layout
            popup.locator("body").screenshot(
                path=str(ARTIFACTS / f"popup-{expected['locale']}.png")
            )

        popup.locator("#ui-language").select_option("ko")
        popup.get_by_text("인터페이스 언어를 한국어(으)로 변경했습니다", exact=True).wait_for()
        popup.get_by_role("button", name="읽기 및 선택 번역 활성화").click()
        popup.get_by_text("현재 페이지의 8곳에 읽기를 표시했습니다.", exact=True).wait_for()
        assert popup.get_by_role("button", name="읽기 제거(선택 번역은 유지)").is_enabled()
        popup.get_by_role("button", name="번역 관리 패널 열기").click()
        assert popup.evaluate("Boolean(window.__optionsOpened)")
        assert not popup_errors, f"Popup console errors: {popup_errors}"

        stale_popup = context.new_page()
        stale_popup_errors = []
        stale_popup.on(
            "console",
            lambda message: stale_popup_errors.append(message.text) if message.type == "error" else None,
        )
        stale_popup.add_init_script(
            """
            window.chrome = {
              runtime: {
                getManifest: () => ({ version: '1.1.0' }),
                sendMessage: async (message) => {
                  if (message.type === 'GET_TRANSLATION_DASHBOARD') {
                    return {
                      settings: {
                        baseUrl: 'https://api.example.test/v1',
                        model: 'test-model',
                        targetLanguage: 'zh-CN',
                        uiLanguage: 'ko',
                        hasApiKey: true,
                        apiKeyHint: '••••1234'
                      },
                      history: [],
                      usageRecords: [],
                      usageSummary: { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: 0 }
                    };
                  }
                  throw new Error(`Unexpected runtime message: ${message.type}`);
                },
                reload: () => { window.__extensionReloaded = true; }
              },
              storage: {
                local: {
                  get: async () => ({ translationSettings: { uiLanguage: 'ko' } })
                }
              }
            };
            """
        )
        stale_popup.goto(f"{base_url}/dist/popup.html")
        stale_popup.wait_for_load_state("networkidle")
        stale_popup.get_by_text(
            "Chrome은 아직 이전 버전 1.1.0을 실행 중이지만 디스크 파일은 2.4.1(으)로 업데이트되었습니다.",
            exact=True,
        ).wait_for()
        stale_popup.get_by_text(
            "아래 버튼으로 확장 프로그램을 다시 로드한 후 현재 웹페이지를 새로고침하세요.",
            exact=True,
        ).wait_for()
        assert stale_popup.locator("html").get_attribute("lang") == "ko"
        assert stale_popup.title() == "일본어 한자 AI 읽기 도우미"
        assert stale_popup.locator("#ui-language").get_attribute("aria-label") == "팝업 인터페이스 언어 선택"
        stale_popup.get_by_role("button", name="지금 확장 프로그램 다시 로드").click()
        assert stale_popup.evaluate("Boolean(window.__extensionReloaded)")
        assert not stale_popup_errors, f"Stale popup console errors: {stale_popup_errors}"
        stale_popup.close()

        delayed_popup = context.new_page()
        delayed_popup_errors = []
        delayed_popup.on(
            "console",
            lambda message: delayed_popup_errors.append(message.text) if message.type == "error" else None,
        )
        delayed_popup.add_init_script(
            """
            window.__delayedSettings = { targetLanguage: 'en', uiLanguage: 'zh-CN' };
            window.chrome = {
              runtime: {
                  getManifest: () => ({ version: '2.4.1' }),
                sendMessage: async (message) => {
                  if (message.type === 'GET_TRANSLATION_DASHBOARD') {
                    return await new Promise((resolve) => {
                      window.__resolveDelayedDashboard = () => resolve({
                        ok: true,
                        settings: {
                          baseUrl: 'https://api.example.test/v1',
                          model: 'slow-model',
                          targetLanguage: window.__delayedSettings.targetLanguage,
                          uiLanguage: window.__delayedSettings.uiLanguage,
                          hasApiKey: true,
                          apiKeyHint: '••••1234'
                        },
                        history: [],
                        usageRecords: [],
                        usageSummary: { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: 0 }
                      });
                    });
                  }
                  if (message.type === 'SAVE_TRANSLATION_SETTINGS') {
                    return await new Promise((resolve) => {
                      window.__resolveDelayedSave = () => {
                        window.__delayedSettings = {
                          ...window.__delayedSettings,
                          ...(message.settings || {})
                        };
                        resolve({ ok: true, settings: { ...window.__delayedSettings } });
                      };
                    });
                  }
                  throw new Error(`Unexpected runtime message: ${message.type}`);
                },
                openOptionsPage: async () => {}
              },
              storage: {
                local: {
                  get: async () => await new Promise((resolve) => {
                    window.__resolveDelayedStorage = () => resolve({
                      translationSettings: { uiLanguage: 'zh-CN' }
                    });
                  })
                }
              },
              tabs: {
                query: async () => [{ id: 51, url: 'https://example.test/news' }],
                sendMessage: async () => { throw new Error('Receiving end does not exist'); },
                create: async () => ({})
              },
              scripting: { executeScript: async () => {} }
            };
            """
        )
        delayed_popup.goto(f"{base_url}/dist/popup.html", wait_until="domcontentloaded")
        delayed_popup.wait_for_function("Boolean(window.__resolveDelayedStorage)")
        assert delayed_popup.locator("#ui-language").is_disabled()
        assert delayed_popup.locator("#ui-language").get_attribute("aria-busy") == "true"
        assert delayed_popup.locator("#open-options").is_disabled()
        delayed_popup.evaluate("window.__resolveDelayedStorage()")
        delayed_popup.wait_for_function("Boolean(window.__resolveDelayedDashboard)")
        assert delayed_popup.locator("#ui-language").is_disabled()
        assert delayed_popup.locator("#open-options").is_disabled()
        delayed_popup.evaluate("window.__resolveDelayedDashboard()")
        delayed_popup.locator("#ui-language").wait_for(state="visible")
        delayed_popup.wait_for_function("!document.querySelector('#ui-language').disabled")
        assert delayed_popup.locator("#open-options").is_enabled()
        assert delayed_popup.locator("html").get_attribute("lang") == "zh-CN"
        delayed_popup.locator("#ui-language").select_option("en")
        delayed_popup.wait_for_function("Boolean(window.__resolveDelayedSave)")
        assert delayed_popup.locator("#ui-language").is_disabled()
        assert delayed_popup.locator("html").get_attribute("lang") == "en"
        delayed_popup.evaluate("window.__resolveDelayedSave()")
        delayed_popup.get_by_text("Interface language changed to English", exact=True).wait_for()
        assert delayed_popup.locator("#ui-language").is_enabled()
        assert delayed_popup.locator("#ui-language").input_value() == "en"
        assert delayed_popup.locator("html").get_attribute("lang") == "en"
        assert delayed_popup.evaluate("window.__delayedSettings") == {
            "targetLanguage": "en",
            "uiLanguage": "en",
        }
        assert not delayed_popup_errors, f"Delayed popup console errors: {delayed_popup_errors}"
        delayed_popup.close()

        options = context.new_page()
        options.set_viewport_size({"width": 1440, "height": 960})
        options_errors = []
        options.on(
            "console",
            lambda message: options_errors.append(message.text) if message.type == "error" else None,
        )
        options.add_init_script(
            """
            window.__optionsMessages = [];
            window.__permissionRequests = [];
            window.__permissionRemovals = [];
            window.__grantedOrigins = new Set(['https://api.openai.com/*']);
            let persistedSettings = {};
            try { persistedSettings = JSON.parse(localStorage.getItem('translationSettingsMock') || '{}'); } catch {}
            window.__dashboard = {
              settings: {
                baseUrl: 'https://api.openai.com/v1',
                model: 'gpt-4o-mini',
                targetLanguage: persistedSettings.targetLanguage || 'zh-CN',
                uiLanguage: persistedSettings.uiLanguage || 'zh-CN',
                hasApiKey: false,
                apiKeyHint: ''
              },
              history: [{
                id: 'history-1',
                timestamp: '2026-08-20T03:00:00.000Z',
                sourceText: '<img src=x onerror="window.__optionsXss=true">原文',
                translatedText: '<script>window.__optionsXss=true</script>译文',
                pageTitle: '测试新闻',
                pageUrl: 'https://example.test/news',
                selectionType: 'sentence',
                model: 'test-model',
                targetLanguage: 'zh-CN',
                usage: { inputTokens: 12, outputTokens: 6, totalTokens: 18 }
              }],
              usageRecords: [{
                id: 'usage-1',
                timestamp: '2026-08-20T03:00:00.000Z',
                operation: 'translation',
                model: 'test-model',
                targetLanguage: 'zh-CN',
                usage: { inputTokens: 12, outputTokens: 6, totalTokens: 18 }
              }],
              usageSummary: { requests: 1, inputTokens: 12, outputTokens: 6, totalTokens: 18 },
              summary: { requests: 1, inputTokens: 12, outputTokens: 6, totalTokens: 18 }
            };
            window.confirm = () => true;
            window.chrome = {
              runtime: {
                lastError: undefined,
                sendMessage: (message, callback) => {
                  window.__optionsMessages.push(structuredClone(message));
                  const finish = (value) => window.setTimeout(() => callback(value), 0);
                  if (message.type === 'GET_TRANSLATION_DASHBOARD') {
                    finish({ ok: true, ...structuredClone(window.__dashboard) });
                    return;
                  }
                  if (message.type === 'SAVE_TRANSLATION_SETTINGS') {
                    const changes = message.settings || {};
                    if (changes.baseUrl) window.__dashboard.settings.baseUrl = changes.baseUrl;
                    if (changes.model) window.__dashboard.settings.model = changes.model;
                    if (changes.targetLanguage) window.__dashboard.settings.targetLanguage = changes.targetLanguage;
                    if (changes.uiLanguage) window.__dashboard.settings.uiLanguage = changes.uiLanguage;
                    localStorage.setItem('translationSettingsMock', JSON.stringify({
                      targetLanguage: window.__dashboard.settings.targetLanguage,
                      uiLanguage: window.__dashboard.settings.uiLanguage
                    }));
                    if (changes.apiKey) {
                      window.__dashboard.settings.hasApiKey = true;
                      window.__dashboard.settings.apiKeyHint = '••••-key';
                    }
                    if (message.clearApiKey || changes.clearApiKey) {
                      window.__dashboard.settings.hasApiKey = false;
                      window.__dashboard.settings.apiKeyHint = '';
                    }
                    finish({ ok: true, ...structuredClone(window.__dashboard) });
                    return;
                  }
                  if (message.type === 'TEST_TRANSLATION_CONNECTION') {
                    finish({ ok: true, translation: '你好', usage: { totalTokens: 3 } });
                    return;
                  }
                  if (message.type === 'DELETE_TRANSLATION_HISTORY_ITEM') {
                    window.__dashboard.history = window.__dashboard.history.filter((entry) => entry.id !== message.id);
                    finish({ ok: true, ...structuredClone(window.__dashboard) });
                    return;
                  }
                  if (message.type === 'CLEAR_TRANSLATION_HISTORY') {
                    window.__dashboard.history = [];
                    finish({ ok: true, ...structuredClone(window.__dashboard) });
                    return;
                  }
                  if (message.type === 'CLEAR_TOKEN_USAGE') {
                    window.__dashboard.usageRecords = [];
                    window.__dashboard.summary = { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 };
                    window.__dashboard.usageSummary = structuredClone(window.__dashboard.summary);
                    finish({ ok: true, ...structuredClone(window.__dashboard) });
                    return;
                  }
                  finish({ ok: false, error: `Unexpected runtime message: ${message.type}` });
                }
              },
              permissions: {
                contains: (request, callback) => {
                  const contained = request.origins.every((origin) => window.__grantedOrigins.has(origin));
                  window.setTimeout(() => callback(contained), 0);
                },
                request: (request, callback) => {
                  window.__permissionRequests.push(structuredClone(request));
                  request.origins.forEach((origin) => window.__grantedOrigins.add(origin));
                  window.setTimeout(() => callback(true), 0);
                },
                remove: (request, callback) => {
                  window.__permissionRemovals.push(structuredClone(request));
                  request.origins.forEach((origin) => window.__grantedOrigins.delete(origin));
                  window.setTimeout(() => callback(true), 0);
                }
              }
            };
            """
        )
        options.goto(f"{base_url}/dist/options.html")
        options.wait_for_load_state("networkidle")
        options.locator("#section-api").wait_for(state="visible")
        assert options.locator("#api-key").input_value() == ""
        assert options.locator("html").get_attribute("lang") == "ko"
        assert options.locator("#ui-language").input_value() == "ko"
        assert options.locator("#target-language").input_value() == "zh-CN"
        assert options.locator("#connection-status").inner_text() == "설정 미완료"

        options.locator("#base-url").fill("https://draft.example.test/v1")
        options.locator("#model").fill("draft-model")
        options.locator("#api-key").fill("draft-key")
        locale_expectations = [
            {
                "locale": "en",
                "title": "Japanese Kanji AI Reading Assistant · Management",
                "nav": "Translation History",
                "key_placeholder": "Leave blank to keep the current key",
                "search_placeholder": "Search source, translation, or page title",
                "sidebar_aria": "Management navigation",
                "summary_aria": "Token summary",
                "show_key": "Show",
                "toast": "Interface language changed to English",
            },
            {
                "locale": "ja",
                "title": "日本語漢字 AI 読み方アシスタント · 管理パネル",
                "nav": "翻訳履歴",
                "key_placeholder": "空欄のまま保存すると現在のキーを保持します",
                "search_placeholder": "原文、翻訳、ページタイトルを検索",
                "sidebar_aria": "管理パネルのナビゲーション",
                "summary_aria": "Token の概要",
                "show_key": "表示",
                "toast": "表示言語を日本語に変更しました",
            },
            {
                "locale": "ko",
                "title": "일본어 한자 AI 읽기 도우미 · 관리 패널",
                "nav": "번역 기록",
                "key_placeholder": "비워 두면 현재 키를 유지합니다",
                "search_placeholder": "원문, 번역문 또는 페이지 제목 검색",
                "sidebar_aria": "관리 패널 탐색",
                "summary_aria": "Token 요약",
                "show_key": "표시",
                "toast": "인터페이스 언어를 한국어(으)로 변경했습니다",
            },
            {
                "locale": "zh-CN",
                "title": "日语汉字 AI 读音助手 · 管理面板",
                "nav": "翻译历史",
                "key_placeholder": "留空表示保留当前密钥",
                "search_placeholder": "搜索原文、译文或页面标题",
                "sidebar_aria": "管理面板导航",
                "summary_aria": "Token 汇总",
                "show_key": "显示",
                "toast": "界面语言已切换为中文",
            },
        ]
        for expected in locale_expectations:
            options.locator("#ui-language").select_option(expected["locale"])
            options.get_by_text(expected["toast"], exact=True).wait_for()
            assert options.locator("html").get_attribute("lang") == expected["locale"]
            assert options.title() == expected["title"]
            assert options.locator('[data-i18n="nav.history"]').inner_text() == expected["nav"]
            assert options.locator("#api-key").get_attribute("placeholder") == expected["key_placeholder"]
            assert options.locator("#history-search").get_attribute("placeholder") == expected["search_placeholder"]
            assert options.locator(".sidebar").get_attribute("aria-label") == expected["sidebar_aria"]
            assert options.locator(".metric-grid").get_attribute("aria-label") == expected["summary_aria"]
            assert options.locator("#toggle-key-visibility").inner_text() == expected["show_key"]
            if expected["locale"] == "en":
                assert options.locator("#connection-status").inner_text() == "Setup incomplete"
                assert options.locator("#api-key-hint").inner_text() == "No key configured"
                assert options.locator("#history-count").inner_text() == "1 record"
                assert options.locator("#history-list [data-history-id]").inner_text() == "Delete"
                assert options.locator("#history-list [data-history-id]").get_attribute(
                    "aria-label"
                ).startswith("Delete translation record:")
                options.locator("#toggle-key-visibility").click()
                assert options.locator("#toggle-key-visibility").inner_text() == "Hide"
                assert options.locator("#toggle-key-visibility").get_attribute("aria-label") == "Hide API Key"
                options.locator("#toggle-key-visibility").click()
            ui_message = options.evaluate(
                "window.__optionsMessages.filter((message) => message.type === 'SAVE_TRANSLATION_SETTINGS').at(-1)"
            )
            assert ui_message["settings"] == {"uiLanguage": expected["locale"]}
            assert options.locator("#base-url").input_value() == "https://draft.example.test/v1"
            assert options.locator("#model").input_value() == "draft-model"
            assert options.locator("#api-key").input_value() == "draft-key"
            layout = options.evaluate(
                """() => ({
                  innerWidth: window.innerWidth,
                  scrollWidth: document.documentElement.scrollWidth,
                  scrollX: window.scrollX,
                  sidebarRight: document.querySelector('.sidebar').getBoundingClientRect().right,
                  mainLeft: document.querySelector('.main-content').getBoundingClientRect().left,
                  headingLeft: document.querySelector('#page-title').getBoundingClientRect().left,
                  navItems: [...document.querySelectorAll('.nav-item')].map((item) => {
                    const itemBox = item.getBoundingClientRect();
                    const labelBox = item.lastElementChild.getBoundingClientRect();
                    return {
                      itemLeft: itemBox.left,
                      itemRight: itemBox.right,
                      labelLeft: labelBox.left,
                      labelRight: labelBox.right,
                      labelHeight: labelBox.height,
                    };
                  }),
                })"""
            )
            assert layout["scrollWidth"] <= layout["innerWidth"], layout
            assert layout["scrollX"] == 0, layout
            assert layout["mainLeft"] >= layout["sidebarRight"], layout
            assert layout["headingLeft"] >= layout["sidebarRight"], layout
            for nav_item in layout["navItems"]:
                assert nav_item["itemLeft"] <= nav_item["labelLeft"], layout
                assert nav_item["labelRight"] <= nav_item["itemRight"], layout
                assert nav_item["labelHeight"] <= 44, layout
            options.screenshot(
                path=str(ARTIFACTS / f"translation-options-{expected['locale']}.png"),
                full_page=True,
            )

        # The popup and management panel share one persisted uiLanguage setting,
        # while targetLanguage remains independent in both directions.
        options.locator("#ui-language").select_option("ja")
        synced_toast = options.locator("#toast-region .toast").last
        synced_toast.wait_for()
        assert synced_toast.inner_text() == "表示言語を日本語に変更しました"
        popup.reload()
        popup.wait_for_load_state("networkidle")
        popup.locator("#ui-language").wait_for()
        assert popup.locator("html").get_attribute("lang") == "ja"
        assert popup.locator("#ui-language").input_value() == "ja"
        assert popup.title() == "日本語漢字 AI 読み方アシスタント"
        assert popup.locator("#translation-status").inner_text() == "翻訳先：簡体字中国語 · モデル：test-model"
        popup.locator("#ui-language").select_option("zh-CN")
        popup.get_by_text("界面语言已切换为中文", exact=True).wait_for()
        options.reload()
        options.wait_for_load_state("networkidle")
        options.locator("#section-api").wait_for(state="visible")
        assert options.locator("html").get_attribute("lang") == "zh-CN"
        assert options.locator("#ui-language").input_value() == "zh-CN"
        assert options.locator("#target-language").input_value() == "zh-CN"
        assert not popup_errors, f"Popup console errors after language synchronization: {popup_errors}"
        popup.close()

        options.get_by_role("button", name="翻译目标语言").click()
        options.locator("#target-language").select_option("ja")
        options.locator("#save-language").click()
        options.get_by_text("翻译目标语言已切换为日语", exact=True).wait_for()
        options.locator("#ui-language").select_option("ko")
        latest_toast = options.locator("#toast-region .toast").last
        latest_toast.wait_for()
        assert latest_toast.inner_text() == "인터페이스 언어를 한국어(으)로 변경했습니다"
        assert options.locator("#target-language").input_value() == "ja"
        assert options.locator("#language-preview-value").inner_text() == "일본어"
        options.reload()
        options.wait_for_load_state("networkidle")
        options.locator("#section-language").wait_for(state="visible")
        assert options.locator("html").get_attribute("lang") == "ko"
        assert options.locator("#ui-language").input_value() == "ko"
        assert options.locator("#target-language").input_value() == "ja"
        assert options.locator("#language-preview-value").inner_text() == "일본어"
        options.locator("#ui-language").select_option("zh-CN")
        options.get_by_text("界面语言已切换为中文", exact=True).wait_for()
        options.locator("#target-language").select_option("zh-CN")
        options.locator("#save-language").click()
        options.get_by_text("翻译目标语言已切换为简体中文", exact=True).wait_for()

        options.get_by_role("button", name="翻译历史").click()
        options.locator("#history-list .history-item").wait_for()
        assert options.locator("#history-list img, #history-list script").count() == 0
        assert '<img src=x onerror="window.__optionsXss=true">原文' in options.locator("#history-list").inner_text()
        assert "18 Token" in options.locator("#history-list").inner_text()
        assert not options.evaluate("Boolean(window.__optionsXss)")

        options.get_by_role("button", name="Token 消耗").click()
        assert options.locator("#metric-total").inner_text() == "18"
        assert options.locator("#metric-input").inner_text() == "12"
        assert options.locator("#metric-output").inner_text() == "6"
        assert options.locator("#metric-requests").inner_text() == "1"
        usage_row = options.locator("#usage-table-body tr").first
        assert usage_row.locator("td").all_inner_texts()[1:] == ["1", "12", "6", "18"]
        options.screenshot(path=str(ARTIFACTS / "translation-options.png"), full_page=True)

        options.get_by_role("button", name="API 配置").click()
        options.locator("#base-url").fill("http://localhost:11434/v1/")
        options.locator("#model").fill("local-test-model")
        options.locator("#api-key").fill("fake-dashboard-key")
        options.locator("#save-api").click()
        options.get_by_text("API 配置已保存", exact=True).wait_for()
        assert options.locator("#api-key").input_value() == ""
        assert options.evaluate("window.__permissionRequests.at(-1).origins[0]") == "http://localhost/*"
        assert options.evaluate("window.__permissionRemovals.at(-1).origins[0]") == "https://api.openai.com/*"
        saved_message = options.evaluate(
            "window.__optionsMessages.filter((message) => message.type === 'SAVE_TRANSLATION_SETTINGS').at(-1)"
        )
        assert saved_message["settings"]["baseUrl"] == "http://localhost:11434/v1"
        assert saved_message["settings"]["apiKey"] == "fake-dashboard-key"

        options.locator("#base-url").fill("https://api.example.test/v1")
        options.locator("#model").fill("current-form-model")
        options.locator("#api-key").fill("second-fake-key")
        options.locator("#test-connection").click()
        options.get_by_text("连接成功，翻译服务可以正常使用", exact=True).wait_for()
        tested_message = options.evaluate(
            "window.__optionsMessages.filter((message) => message.type === 'TEST_TRANSLATION_CONNECTION').at(-1)"
        )
        assert tested_message["settings"] == {
            "baseUrl": "https://api.example.test/v1",
            "model": "current-form-model",
            "targetLanguage": "zh-CN",
            "apiKey": "second-fake-key",
        }
        assert options.evaluate("window.__permissionRequests.at(-1).origins[0]") == "https://api.example.test/*"
        assert options.evaluate("window.__permissionRemovals.at(-1).origins[0]") == "https://api.example.test/*"
        assert not options.evaluate("window.__grantedOrigins.has('https://api.example.test/*')")

        options.locator("#base-url").fill("https://unsaved.example.test/v1")
        options.get_by_role("button", name="目标语言").click()
        options.locator("#target-language").select_option("en")
        options.locator("#save-language").click()
        options.get_by_text("翻译目标语言已切换为英语", exact=True).wait_for()
        language_message = options.evaluate(
            "window.__optionsMessages.filter((message) => message.type === 'SAVE_TRANSLATION_SETTINGS').at(-1)"
        )
        assert language_message["settings"] == {"targetLanguage": "en"}

        options.get_by_role("button", name="API 配置").click()
        permission_counts_before_clear = options.evaluate(
            "() => [window.__permissionRequests.length, window.__permissionRemovals.length]"
        )
        options.locator("#base-url").fill("http://remote.example.test/v1")
        options.locator("#clear-api-key").click()
        options.get_by_text("API Key 已清除", exact=True).wait_for()
        clear_message = options.evaluate(
            "window.__optionsMessages.filter((message) => message.type === 'SAVE_TRANSLATION_SETTINGS').at(-1)"
        )
        assert clear_message.get("clearApiKey") is True
        assert clear_message["settings"].get("clearApiKey") is True
        assert options.evaluate(
            "() => [window.__permissionRequests.length, window.__permissionRemovals.length]"
        ) == permission_counts_before_clear

        options.get_by_role("button", name="翻译历史").click()
        options.locator("#history-list [data-history-id]").click()
        options.get_by_text("翻译记录已删除", exact=True).wait_for()
        assert "0 条记录" in options.locator("#history-count").inner_text()

        options.get_by_role("button", name="Token 消耗").click()
        options.locator("#clear-usage").click()
        options.get_by_text("Token 消耗统计已清空", exact=True).wait_for()
        assert options.locator("#metric-total").inner_text() == "0"
        assert not options_errors, f"Options console errors: {options_errors}"
        options.close()
        browser.close()

    print("End-to-end DOM test passed.")
finally:
    server.shutdown()
    server.server_close()
    thread.join(timeout=5)
