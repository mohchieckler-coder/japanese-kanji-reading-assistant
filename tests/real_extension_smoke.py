import json
import os
import shutil
import tempfile
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
EXTENSION = Path(os.environ.get("EXTENSION_PATH", ROOT / "dist")).resolve()
API_REQUESTS = []


class LocalCompatibleApi(BaseHTTPRequestHandler):
    def log_message(self, _format, *_args):
        pass

    def do_GET(self):
        if self.path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
            return
        if self.path != "/page":
            self.send_error(404)
            return
        body = (
            "<!doctype html><html lang='ja'><meta charset='utf-8'>"
            "<title>実拡張テスト</title><main><p id='source'>日本語の新聞を読みます。</p>"
            "<p id='okurigana-loanword'>麻辣湯と麻辣烫を食べる。低い層から発せられ、使われた。申し込む。</p>"
            "<p id='foreign-names'>北朝鮮の金正恩氏、中国の李強首相、ベトナムの阮富仲元書記長</p>"
            "<p id='loanword-origins'>コンピューター、クーデター、アルバイト、パエリア、パン、キムチ。</p>"
            "</main></html>"
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "authorization, content-type")
        self.end_headers()

    def do_POST(self):
        if self.path != "/v1/chat/completions":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", "0"))
        request_body = self.rfile.read(length).decode("utf-8")
        API_REQUESTS.append(
            {
                "authorization": self.headers.get("Authorization", ""),
                "body": json.loads(request_body),
            }
        )
        response = json.dumps(
            {
                "model": "real-extension-test",
                "choices": [{"message": {"content": "真实扩展译文"}}],
                "usage": {"prompt_tokens": 9, "completion_tokens": 4, "total_tokens": 13},
            },
            ensure_ascii=False,
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(response)))
        self.end_headers()
        self.wfile.write(response)


def run_browser(base_url, extension_path):
    with tempfile.TemporaryDirectory(prefix="jp-furigana-extension-") as profile:
        with sync_playwright() as playwright:
            context = playwright.chromium.launch_persistent_context(
                profile,
                channel="chromium",
                headless=True,
                args=[
                    f"--disable-extensions-except={extension_path}",
                    f"--load-extension={extension_path}",
                    "--enable-logging=stderr",
                    "--v=1",
                ],
            )
            try:
                worker = context.service_workers[0] if context.service_workers else None
                if worker is None:
                    try:
                        worker = context.wait_for_event("serviceworker", timeout=15_000)
                    except PlaywrightTimeoutError as error:
                        raise AssertionError("Manifest V3 Service Worker did not start") from error

                extension_id = worker.url.split("/")[2]
                worker_errors = []
                worker_console = []
                worker.on("close", lambda: worker_errors.append("service worker closed"))
                worker.on("console", lambda message: worker_console.append(f"{message.type}: {message.text}"))
                manifest = worker.evaluate("chrome.runtime.getManifest()")
                assert manifest.get("version") == "2.5.0", manifest
                options = context.new_page()
                page_errors = []
                console_errors = []
                options.on("pageerror", lambda error: page_errors.append(str(error)))
                options.on(
                    "console",
                    lambda message: console_errors.append(message.text) if message.type == "error" else None,
                )
                options.goto(f"chrome-extension://{extension_id}/options.html")
                options.wait_for_load_state("networkidle")
                options.locator("#section-api").wait_for(state="visible")
                dashboard = options.evaluate(
                    """() => new Promise((resolve) => {
                      chrome.runtime.sendMessage({ type: 'GET_TRANSLATION_DASHBOARD' }, (response) => {
                        resolve({ response, lastError: chrome.runtime.lastError?.message || '' });
                      });
                    })"""
                )
                options_status = options.locator("#connection-status").inner_text()
                options_loading = options.locator("#loading-state").inner_text()
                target = context.new_page()
                target_errors = []
                target_console_errors = []
                target.on("pageerror", lambda error: target_errors.append(str(error)))
                target.on(
                    "console",
                    lambda message: target_console_errors.append(message.text)
                    if message.type == "error"
                    else None,
                )
                target.goto(f"{base_url}/page")
                target.wait_for_load_state("networkidle")

                # Headless Chromium cannot operate its browser-level optional-permission bubble.
                # The DOM E2E suite covers that user-gesture path; here we keep the real MV3
                # worker/storage/message/fetch/content-script integration and grant only the
                # permission check inside this isolated temporary browser process.
                save_result = options.evaluate(
                    """(settings) => new Promise((resolve) => {
                      chrome.runtime.sendMessage(
                        { type: 'SAVE_TRANSLATION_SETTINGS', settings },
                        (response) => resolve({ response, lastError: chrome.runtime.lastError?.message || '' })
                      );
                    })""",
                    {
                        "baseUrl": f"{base_url}/v1",
                        "model": "real-extension-test",
                        "targetLanguage": "en",
                        "apiKey": "fake-local-integration-key",
                    },
                )
                assert save_result["lastError"] == "", save_result
                assert save_result["response"] and save_result["response"].get("ok") is True, save_result
                options.reload()
                options.locator("#section-api").wait_for(state="visible")
                options.get_by_text("API 已配置", exact=True).wait_for()
                options.locator("#ui-language").select_option("ko")
                options.get_by_text("인터페이스 언어를 한국어(으)로 변경했습니다", exact=True).wait_for()
                options.reload()
                options.locator("#section-api").wait_for(state="visible")
                assert options.locator("html").get_attribute("lang") == "ko"
                assert options.locator("#ui-language").input_value() == "ko"
                assert options.locator("#target-language").input_value() == "en"
                options.get_by_text("API 설정 완료", exact=True).wait_for()
                target_tab_id = options.evaluate(
                    """async (url) => {
                      const tabs = await chrome.tabs.query({});
                      return tabs.find((tab) => tab.url === url)?.id;
                    }""",
                    target.url,
                )
                assert target_tab_id, "Could not find the local Japanese page tab"
                options.evaluate(
                    """async (tabId) => {
                      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
                    }""",
                    target_tab_id,
                )
                target.locator("ruby[data-jp-furigana]").first.wait_for(timeout=30_000)
                controller_versions = options.evaluate(
                    """async (tabId) => {
                      const [injection] = await chrome.scripting.executeScript({
                        target: { tabId },
                        func: () => ({
                          translation: globalThis.__japaneseSelectionTranslationController__?.buildVersion,
                          loanword: globalThis.__japaneseLoanwordOriginController__?.buildVersion,
                          furigana: globalThis.__japaneseFuriganaAiController__?.buildVersion,
                        }),
                      });
                      return injection.result;
                    }""",
                    target_tab_id,
                )
                assert controller_versions == {
                    "translation": "2.5.0",
                    "loanword": "2.5.0",
                    "furigana": "2.5.0",
                }, controller_versions
                foreign_name_annotations = target.eval_on_selector_all(
                    "#foreign-names ruby[data-jp-furigana]",
                    "elements => elements.map((ruby) => [ruby.dataset.jpOriginal, ruby.querySelector('rt').textContent])",
                )
                for expected in [
                    ["金正恩", "キム・ジョンウン"],
                    ["李強", "リー・チアン"],
                    ["阮富仲", "グエン・フー・チョン"],
                ]:
                    assert expected in foreign_name_annotations, foreign_name_annotations
                okurigana_annotations = target.eval_on_selector_all(
                    "#okurigana-loanword ruby[data-jp-furigana]",
                    "elements => elements.map((ruby) => [ruby.dataset.jpOriginal, ruby.querySelector('rt').textContent])",
                )
                for expected in [
                    ["麻辣湯", "マーラータン"],
                    ["麻辣烫", "マーラータン"],
                    ["食", "た"],
                    ["低", "ひく"],
                    ["発", "はっ"],
                    ["使", "つか"],
                    ["申", "もう"],
                    ["込", "こ"],
                ]:
                    assert expected in okurigana_annotations, okurigana_annotations
                assert all(
                    not any("ぁ" <= character <= "ゖ" or "ァ" <= character <= "ヺ" for character in surface)
                    for surface, _ in okurigana_annotations
                ), okurigana_annotations
                initial_loanword_status = options.evaluate(
                    """async (tabId) => chrome.tabs.sendMessage(
                      tabId,
                      { type: 'GET_LOANWORD_ORIGIN_STATUS' }
                    )""",
                    target_tab_id,
                )
                assert initial_loanword_status == {
                    "phase": "idle",
                    "enabled": False,
                    "count": 0,
                    "message": "",
                }, initial_loanword_status
                assert target.locator("ruby[data-jp-loanword-origin]").count() == 0
                enabled_loanword_status = options.evaluate(
                    """async (tabId) => chrome.tabs.sendMessage(
                      tabId,
                      { type: 'TOGGLE_LOANWORD_ORIGINS' }
                    )""",
                    target_tab_id,
                )
                assert enabled_loanword_status["phase"] == "enabled", enabled_loanword_status
                target.wait_for_function(
                    "() => document.querySelectorAll('#loanword-origins ruby[data-jp-loanword-origin]').length === 6"
                )
                real_loanword_annotations = target.eval_on_selector_all(
                    "#loanword-origins ruby[data-jp-loanword-origin]",
                    "elements => elements.map((ruby) => [ruby.dataset.jpOriginal, ruby.querySelector('rt').textContent])",
                )
                assert real_loanword_annotations == [
                    ["コンピューター", "computer"],
                    ["クーデター", "（仏）coup d'État"],
                    ["アルバイト", "（独）Arbeit"],
                    ["パエリア", "（西）paella"],
                    ["パン", "（葡）pão"],
                    ["キムチ", "（韓）김치"],
                ], real_loanword_annotations
                real_furigana_status = options.evaluate(
                    """async (tabId) => chrome.tabs.sendMessage(
                      tabId,
                      { type: 'GET_FURIGANA_STATUS' }
                    )""",
                    target_tab_id,
                )
                assert real_furigana_status["phase"] == "enabled", real_furigana_status
                assert target.locator("ruby[data-jp-furigana]").count() > 0
                disabled_loanword_status = options.evaluate(
                    """async (tabId) => chrome.tabs.sendMessage(
                      tabId,
                      { type: 'TOGGLE_LOANWORD_ORIGINS' }
                    )""",
                    target_tab_id,
                )
                assert disabled_loanword_status == {
                    "phase": "idle",
                    "enabled": False,
                    "count": 0,
                    "message": "",
                }, disabled_loanword_status
                assert target.locator("ruby[data-jp-loanword-origin]").count() == 0
                assert target.locator("#loanword-origins").inner_html() == (
                    "コンピューター、クーデター、アルバイト、パエリア、パン、キムチ。"
                )
                assert options.evaluate(
                    """async (tabId) => (await chrome.tabs.sendMessage(
                      tabId,
                      { type: 'GET_FURIGANA_STATUS' }
                    )).phase""",
                    target_tab_id,
                ) == "enabled"
                target.evaluate(
                    """() => {
                      const source = document.querySelector('#source');
                      const range = document.createRange();
                      range.selectNodeContents(source);
                      const selection = window.getSelection();
                      selection.removeAllRanges();
                      selection.addRange(range);
                      source.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                    }"""
                )

                selection_state = None
                for _ in range(100):
                    selection_state = options.evaluate(
                        """async (tabId) => {
                          const [injection] = await chrome.scripting.executeScript({
                            target: { tabId },
                            func: () => {
                              const controller = globalThis.__japaneseSelectionTranslationController__;
                              return controller ? {
                                text: controller.lastSelection?.text || '',
                                type: controller.lastSelection?.selectionType || '',
                                actionVisible: !controller.actionButton.hidden
                              } : null;
                            }
                          });
                          return injection.result;
                        }""",
                        target_tab_id,
                    )
                    if selection_state and selection_state["actionVisible"]:
                        break
                    time.sleep(0.05)
                assert selection_state == {
                    "text": "日本語の新聞を読みます。",
                    "type": "sentence",
                    "actionVisible": True,
                }, selection_state
                options.evaluate(
                    """async (tabId) => {
                      await chrome.scripting.executeScript({
                        target: { tabId },
                        func: () => globalThis.__japaneseSelectionTranslationController__.actionButton.click()
                      });
                    }""",
                    target_tab_id,
                )
                translation_result = None
                for _ in range(100):
                    translation_result = options.evaluate(
                        """async (tabId) => {
                          const [injection] = await chrome.scripting.executeScript({
                            target: { tabId },
                            func: () => {
                              const controller = globalThis.__japaneseSelectionTranslationController__;
                              return {
                                translation: controller.translation.textContent,
                                usage: controller.usage.textContent,
                                error: controller.status.hidden ? '' : controller.status.textContent
                              };
                            }
                          });
                          return injection.result;
                        }""",
                        target_tab_id,
                    )
                    if translation_result and translation_result["translation"]:
                        break
                    time.sleep(0.05)
                assert translation_result["translation"] == "真实扩展译文", translation_result
                assert "合计 13" in translation_result["usage"], translation_result
                expected_authorization = "Bearer " + "fake-local-integration-key"
                assert API_REQUESTS and API_REQUESTS[-1]["authorization"] == expected_authorization
                assert API_REQUESTS[-1]["body"]["messages"][-1]["content"] == "日本語の新聞を読みます。"
                system_prompt = API_REQUESTS[-1]["body"]["messages"][0]["content"]
                assert "English" in system_prompt and "Korean" not in system_prompt, system_prompt

                popup = context.new_page()
                popup_errors = []
                popup_console_errors = []
                popup.on("pageerror", lambda error: popup_errors.append(str(error)))
                popup.on(
                    "console",
                    lambda message: popup_console_errors.append(message.text)
                    if message.type == "error"
                    else None,
                )
                popup.goto(f"chrome-extension://{extension_id}/popup.html")
                popup.wait_for_load_state("networkidle")
                popup.locator("#ui-language").wait_for()
                assert popup.locator("html").get_attribute("lang") == "ko"
                assert popup.title() == "일본어 한자 AI 읽기 도우미"
                assert popup.locator("#ui-language").input_value() == "ko"
                assert popup.locator("#ui-language").get_attribute("aria-label") == "팝업 인터페이스 언어 선택"
                assert popup.locator("#toggle-loanword-origins").inner_text() == "가타카나 외래어에 원어 표시"
                assert popup.locator("#translation-heading").inner_text() == "선택 번역"
                assert popup.locator("#translation-badge").inner_text() == "설정됨"
                popup_status = popup.locator("#translation-status").inner_text()
                assert popup_status == "번역 언어: 영어 · 모델: real-extension-test", popup_status

                popup.locator("#ui-language").select_option("ja")
                popup.get_by_text("表示言語を日本語に変更しました", exact=True).wait_for()
                assert popup.locator("html").get_attribute("lang") == "ja"
                assert popup.title() == "日本語漢字 AI 読み方アシスタント"
                assert popup.locator("#toggle-loanword-origins").inner_text() == "カタカナ外来語に原語を表示"
                assert popup.locator("#translation-status").inner_text() == "翻訳先：英語 · モデル：real-extension-test"
                popup_dashboard = popup.evaluate(
                    """() => chrome.runtime.sendMessage({ type: 'GET_TRANSLATION_DASHBOARD' })"""
                )
                assert popup_dashboard["settings"]["uiLanguage"] == "ja", popup_dashboard
                assert popup_dashboard["settings"]["targetLanguage"] == "en", popup_dashboard
                options.close()
                with context.expect_page(timeout=10_000) as opened_info:
                    popup.locator("#open-options").click()
                opened_options = opened_info.value
                opened_options_errors = []
                opened_options_console_errors = []
                opened_options.on("pageerror", lambda error: opened_options_errors.append(str(error)))
                opened_options.on(
                    "console",
                    lambda message: opened_options_console_errors.append(message.text)
                    if message.type == "error"
                    else None,
                )
                opened_options.wait_for_load_state("networkidle")
                opened_options.locator("#section-api").wait_for(state="visible")
                assert opened_options.locator("html").get_attribute("lang") == "ja"
                assert opened_options.locator("#ui-language").input_value() == "ja"
                assert opened_options.locator("#target-language").input_value() == "en"
                print(
                    {
                        "extension_id": extension_id,
                        "version": manifest.get("version"),
                        "dashboard": dashboard,
                        "options_status": ascii(options_status),
                        "options_loading": ascii(options_loading),
                        "popup_status": ascii(popup_status),
                        "selection_state": selection_state,
                        "translation_result": translation_result,
                        "controller_versions": controller_versions,
                        "loanword_annotations": ascii(real_loanword_annotations),
                        "foreign_name_annotations": ascii(foreign_name_annotations),
                        "opened_options_url": opened_options.url,
                        "worker_errors": worker_errors,
                        "worker_console": worker_console,
                        "page_errors": page_errors,
                        "console_errors": console_errors,
                        "popup_errors": popup_errors,
                        "popup_console_errors": popup_console_errors,
                        "popup_dashboard": ascii(popup_dashboard),
                        "target_errors": target_errors,
                        "target_console_errors": target_console_errors,
                        "opened_options_errors": opened_options_errors,
                        "opened_options_console_errors": opened_options_console_errors,
                    }
                )
                assert dashboard["lastError"] == "", dashboard
                assert dashboard["response"] and dashboard["response"].get("ok") is True, dashboard
                assert options_status == "配置未完成", options_status
                assert not page_errors, page_errors
                assert not console_errors, console_errors
                assert not popup_errors, popup_errors
                assert not popup_console_errors, popup_console_errors
                assert not target_errors, target_errors
                assert not target_console_errors, target_console_errors
                assert not opened_options_errors, opened_options_errors
                assert not opened_options_console_errors, opened_options_console_errors
                assert not worker_errors, worker_errors
                assert not [entry for entry in worker_console if entry.startswith("error:")], worker_console
                assert opened_options.url == f"chrome-extension://{extension_id}/options.html"
            finally:
                context.close()


def main():
    API_REQUESTS.clear()
    server = ThreadingHTTPServer(("127.0.0.1", 0), LocalCompatibleApi)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with tempfile.TemporaryDirectory(prefix="jp-furigana-extension-copy-") as extension_temp:
            extension_path = Path(extension_temp) / "extension"
            shutil.copytree(EXTENSION, extension_path)
            manifest_path = extension_path / "manifest.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            # A deterministic host grant keeps the real-extension smoke test free of
            # Chromium's browser-chrome permission dialog, which Playwright cannot drive.
            manifest["host_permissions"] = ["http://127.0.0.1/*"]
            manifest_path.write_text(
                json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            run_browser(f"http://127.0.0.1:{server.server_port}", extension_path)
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


if __name__ == "__main__":
    main()
