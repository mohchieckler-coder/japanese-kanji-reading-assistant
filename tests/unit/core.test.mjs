import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import kuromoji from "kuromoji";
import {
  buildAnnotationSegments,
  containsKanji,
  getContextualReading,
  katakanaToHiragana
} from "../../src/core.mjs";

const require = createRequire(import.meta.url);
const pathShim = require("../../src/path-shim.cjs");
const realTokenizerPromise = new Promise((resolve, reject) => {
  kuromoji.builder({
    dicPath: path.resolve("node_modules", "kuromoji", "dict")
  }).build((error, tokenizer) => {
    if (error) {
      reject(error);
      return;
    }
    resolve(tokenizer);
  });
});

async function annotateWithRealDictionary(text, context = {}) {
  const tokenizer = await realTokenizerPromise;
  return buildAnnotationSegments(text, tokenizer, context);
}

function assertReading(segments, surface, reading, sourceText) {
  assert.ok(
    segments.some((segment) => segment.text === surface && segment.reading === reading),
    `${sourceText}: expected ${surface}=${reading}, got ${JSON.stringify(segments)}`
  );
}

test("detects Japanese kanji and iteration marks", () => {
  assert.equal(containsKanji("東京"), true);
  assert.equal(containsKanji("時々"), true);
  assert.equal(containsKanji("ひらがなだけ"), false);
});

test("converts katakana readings to hiragana", () => {
  assert.equal(katakanaToHiragana("トウキョウ"), "とうきょう");
  assert.equal(katakanaToHiragana("スーパー"), "すーぱー");
});

test("creates ruby-ready segments without changing source text", () => {
  const tokenizer = {
    tokenize: () => [
      { surface_form: "東京", reading: "トウキョウ" },
      { surface_form: "へ", reading: "ヘ" },
      { surface_form: "行く", reading: "イク" }
    ]
  };
  const segments = buildAnnotationSegments("東京へ行く", tokenizer);
  assert.deepEqual(segments, [
    { text: "東京", reading: "とうきょう" },
    { text: "へ", reading: null },
    { text: "行く", reading: "いく" }
  ]);
  assert.equal(segments.map((segment) => segment.text).join(""), "東京へ行く");
});

test("fails safely when tokenizer output cannot reconstruct source text", () => {
  const tokenizer = {
    tokenize: () => [{ surface_form: "別の文", reading: "ベツノブン" }]
  };
  assert.deepEqual(buildAnnotationSegments("東京", tokenizer), [
    { text: "東京", reading: null }
  ]);
});

test("dictionary path joining preserves extension and web URL schemes", () => {
  assert.equal(
    pathShim.join("chrome-extension://example-id/dict/", "base.dat.gz"),
    "chrome-extension://example-id/dict/base.dat.gz"
  );
  assert.equal(
    pathShim.join("https://example.test/dict/", "base.dat.gz"),
    "https://example.test/dict/base.dat.gz"
  );
});

test("recognizes all seven weekday abbreviations in round parentheses", () => {
  const expectedReadings = {
    日: "にち",
    月: "げつ",
    火: "か",
    水: "すい",
    木: "もく",
    金: "きん",
    土: "ど"
  };

  for (const [weekday, reading] of Object.entries(expectedReadings)) {
    const halfWidth = `23日(${weekday})`;
    const fullWidth = `２４日\u3000（\u00a0${weekday}\u3000）`;
    assert.equal(getContextualReading(halfWidth, halfWidth.lastIndexOf(weekday), weekday), reading);
    assert.equal(getContextualReading(fullWidth, fullWidth.lastIndexOf(weekday), weekday), reading);
  }
});

test("does not override ordinary words or mismatched parentheses", () => {
  assert.equal(getContextualReading("月を見る", 0, "月"), null);
  assert.equal(getContextualReading("太陽の日", 3, "日"), null);
  assert.equal(getContextualReading("商品区分（月）", 5, "月"), null);
  assert.equal(getContextualReading("太陽（日）", 3, "日"), null);
  assert.equal(getContextualReading("（火）", 1, "火"), null);
  assert.equal(getContextualReading("0日(水)", 3, "水"), null);
  assert.equal(getContextualReading("32日(月)", 4, "月"), null);
  assert.equal(getContextualReading("23日（月)", 4, "月"), null);
  assert.equal(getContextualReading("23日(月）", 4, "月"), null);
  assert.equal(getContextualReading("23日(\n月)", 5, "月"), null);
  assert.equal(getContextualReading("23日\n（金）", 5, "金"), null);
  assert.equal(getContextualReading("23日（土曜日）", 4, "土"), null);
  assert.equal(getContextualReading("(月）", 1, "月"), null);
});

test("overrides a tokenizer's ambiguous reading inside a news date", () => {
  const tokenizer = {
    tokenize: () => [
      { surface_form: "24", reading: undefined },
      { surface_form: "日", reading: "ニチ" },
      { surface_form: "（", reading: "（" },
      { surface_form: "月", reading: "*" },
      { surface_form: "）", reading: "）" }
    ]
  };
  const segments = buildAnnotationSegments("24日（月）", tokenizer);
  assert.equal(segments.find((segment) => segment.text === "月").reading, "げつ");
});

test("reads the month marker as gatsu after valid calendar month numbers", () => {
  for (const text of ["1月1日", "8月19日", "12月31日", "２０２６年８月１９日"]) {
    const monthIndex = text.indexOf("月");
    assert.equal(getContextualReading(text, monthIndex, "月"), "がつ", text);
  }
  assert.equal(getContextualReading("0月1日", 1, "月"), null);
  assert.equal(getContextualReading("13月1日", 2, "月"), null);
  assert.equal(getContextualReading("月を見る", 0, "月"), null);
  assert.equal(getContextualReading("8か月間", 2, "月"), null);
});

test("reads rain as ame in a delimited weather pair without changing compounds", () => {
  const headline = "衛星画像/雨・風の予想";
  assert.equal(getContextualReading(headline, headline.indexOf("雨"), "雨"), "あめ");
  assert.equal(getContextualReading("雨・風", 0, "雨"), "あめ");
  assert.equal(getContextualReading("画像：雨・風", 3, "雨"), "あめ");
  assert.equal(getContextualReading("雨と風", 0, "雨"), null);
  assert.equal(getContextualReading("雨量と豪雨と梅雨", 0, "雨量"), null);
  assert.equal(getContextualReading("豪雨", 0, "豪雨"), null);
  assert.equal(getContextualReading("梅雨", 0, "梅雨"), null);
  assert.equal(getContextualReading("酸性雨・風", 2, "雨"), null);
});

test("integrates calendar month and standalone rain overrides with tokenizer output", () => {
  const dateTokenizer = {
    tokenize: () => [
      { surface_form: "8", reading: undefined },
      { surface_form: "月", reading: "ツキ" },
      { surface_form: "19", reading: undefined },
      { surface_form: "日", reading: "ニチ" }
    ]
  };
  const dateSegments = buildAnnotationSegments("8月19日", dateTokenizer);
  assert.equal(dateSegments.find((segment) => segment.text === "月").reading, "がつ");

  const weatherTokenizer = {
    tokenize: () => [
      { surface_form: "/", reading: undefined },
      { surface_form: "雨", reading: "ウ" },
      { surface_form: "・", reading: "・" },
      { surface_form: "風", reading: "カゼ" }
    ]
  };
  const weatherSegments = buildAnnotationSegments("/雨・風", weatherTokenizer);
  assert.equal(weatherSegments.find((segment) => segment.text === "雨").reading, "あめ");
});

test("recognizes weekday abbreviations in validated dotted dates and adjacent context", () => {
  assert.equal(
    getContextualReading("月", 0, "月", { prefix: "08.17 (", suffix: ")" }),
    "げつ"
  );
  assert.equal(
    getContextualReading("木", 0, "木", { prefix: "2026.08.20 （", suffix: "）" }),
    "もく"
  );
  assert.equal(getContextualReading("木", 0, "木", { prefix: "20(", suffix: ")" }), "もく");
  assert.equal(getContextualReading("月", 0, "月", { prefix: "40(", suffix: ")" }), null);
  assert.equal(getContextualReading("月", 0, "月", { prefix: "13.17 (", suffix: ")" }), null);
  assert.equal(getContextualReading("月", 0, "月", { prefix: "08.32 (", suffix: ")" }), null);
  assert.equal(getContextualReading("月", 0, "月", { prefix: "08.17\n(", suffix: ")" }), null);
  assert.equal(getContextualReading("月額", 0, "月額", { prefix: "08.17 (", suffix: ")" }), null);
});

test("merges special calendar days without assigning a whole-word reading to 日 alone", async () => {
  const cases = [
    ["8月1日", "1日", "ついたち"],
    ["2日", "2日", "ふつか"],
    ["3日後", "3日", "みっか"],
    ["4日", "4日", "よっか"],
    ["5日", "5日", "いつか"],
    ["6日", "6日", "むいか"],
    ["7日", "7日", "なのか"],
    ["8日", "8日", "ようか"],
    ["9日", "9日", "ここのか"],
    ["10日", "10日", "とおか"],
    ["14日", "14日", "じゅうよっか"],
    ["20日", "20日", "はつか"],
    ["24日", "24日", "にじゅうよっか"],
    ["２０日", "２０日", "はつか"],
    ["1日後", "1日", "いちにち"],
    ["1日間", "1日間", "いちにちかん"],
    ["3日間", "3日間", "みっかかん"]
  ];

  for (const [text, surface, reading] of cases) {
    const segments = await annotateWithRealDictionary(text);
    assertReading(segments, surface, reading, text);
    assert.equal(segments.map((segment) => segment.text).join(""), text);
  }

  const falseDate = await annotateWithRealDictionary("3日本初記録種");
  assert.equal(falseDate.some((segment) => segment.text === "3日"), false);
  assertReading(falseDate, "日本初", "にほんはつ", "3日本初記録種");
  for (const text of ["32日", "120日"]) {
    const segments = await annotateWithRealDictionary(text);
    assert.equal(segments.some((segment) => segment.text === text), false, text);
  }
});

test("merges irregular people and round counters only at token boundaries", async () => {
  const positives = [
    ["1人", "ひとり"],
    ["１人", "ひとり"],
    ["一人", "ひとり"],
    ["2人", "ふたり"],
    ["２人", "ふたり"],
    ["二人", "ふたり"],
    ["一人一人", "ひとりひとり"],
    ["1人旅", "ひとり"],
    ["2人暮らし", "ふたり"],
    ["二人組", "ふたりぐみ"],
    ["1人用", "ひとり"],
    ["一回", "いっかい"],
    ["第六回", "ろっかい"],
    ["八回", "はっかい"],
    ["十回", "じゅっかい"],
    ["百回", "ひゃっかい"]
  ];
  for (const [text, reading] of positives) {
    const segments = await annotateWithRealDictionary(text);
    const peopleSurface = text.match(/^[12１２一二]人/u)?.[0];
    const surface = text === "第六回"
      ? "六回"
      : ["一人一人", "二人組"].includes(text)
        ? text
        : peopleSurface || text;
    assertReading(segments, surface, reading, text);
    assert.equal(segments.map((segment) => segment.text).join(""), text);
  }

  for (const text of ["12人", "21人", "一人称", "二人称", "一人前", "二人三脚"]) {
    const segments = await annotateWithRealDictionary(text);
    assert.equal(segments.some((segment) => ["1人", "2人", "一人", "二人"].includes(segment.text)), false, text);
  }
  const numberedRound = await annotateWithRealDictionary("第108回");
  assert.equal(numberedRound.some((segment) => segment.text === "108回"), false);
  assertReading(numberedRound, "回", "かい", "第108回");
  const largeRound = await annotateWithRealDictionary("六百回");
  assert.equal(largeRound.some((segment) => segment.text === "百回"), false);
  const splitLargeRound = await annotateWithRealDictionary("百回", { prefix: "六" });
  assert.equal(splitLargeRound.some((segment) => segment.text === "百回"), false);
  const around = await annotateWithRealDictionary("一回り");
  assert.equal(around.some((segment) => segment.text === "一回"), false);
  const splitFirstPerson = await annotateWithRealDictionary("1人", { suffix: "称" });
  assert.equal(splitFirstPerson.some((segment) => segment.text === "1人"), false);
  assertReading(splitFirstPerson, "人", "にん", "1人|称");
  for (const text of ["12人", "21人"]) {
    assertReading(await annotateWithRealDictionary(text), "人", "にん", text);
  }
  assertReading(await annotateWithRealDictionary("一人称"), "一人称", "いちにんしょう", "一人称");
  assertReading(await annotateWithRealDictionary("二人称"), "二人称", "ににんしょう", "二人称");
  assertReading(await annotateWithRealDictionary("一人前"), "人前", "にんまえ", "一人前");
  assertReading(await annotateWithRealDictionary("二人三脚"), "二人三脚", "ににんさんきゃく", "二人三脚");
});

test("corrects high-confidence compound parts split across inline text nodes", async () => {
  const splitCases = [
    ["博士", { suffix: "課程" }, "博士", "はくし"],
    ["課程", { prefix: "博士" }, "課程", "かてい"],
    ["中", { suffix: "日" }, "中", "ちゅう"],
    ["日", { prefix: "中" }, "日", "にち"],
    ["巨", { suffix: "人" }, "巨", "きょ"],
    ["人", { prefix: "巨" }, "人", "じん"],
    ["非", { suffix: "常" }, "非", "ひ"],
    ["常", { prefix: "非" }, "常", "じょう"],
    ["3日", { suffix: "本初記録" }, "日", "に"],
    ["本初記録", { prefix: "3日" }, "本初", "ほんはつ"],
    ["骨", { suffix: "髄" }, "骨", "こつ"],
    ["髄", { prefix: "骨" }, "髄", "ずい"]
  ];
  for (const [text, context, surface, reading] of splitCases) {
    const segments = await annotateWithRealDictionary(text, context);
    assertReading(segments, surface, reading, `${context.prefix || ""}|${text}|${context.suffix || ""}`);
    assert.equal(segments.map((segment) => segment.text).join(""), text);
  }
});

test("applies longest high-confidence academic, sports, and community phrase readings", async () => {
  const cases = [
    ["博士課程", "はくしかてい"],
    ["日本研究", "にほんけんきゅう"],
    ["協働", "きょうどう"],
    ["日本初", "にほんはつ"],
    ["相転移", "そうてんい"],
    ["平均場", "へいきんば"],
    ["骨髄", "こつずい"],
    ["幹細胞", "かんさいぼう"],
    ["妊娠高血圧腎症", "にんしんこうけつあつじんしょう"],
    ["頭頸部", "とうけいぶ"],
    ["浸透圧", "しんとうあつ"],
    ["膵", "すい"],
    ["昨夏", "さっか"],
    ["既読", "きどく"],
    ["自治厨", "じちちゅう"],
    ["公録", "こうろく"],
    ["売り時", "うりどき"],
    ["トピ立て", "とぴたて"],
    ["スレ立て", "すれたて"],
    ["トピ主", "とぴぬし"],
    ["トピ主様", "とぴぬしさま"],
    ["スレ主", "すれぬし"],
    ["スレ主様", "すれぬしさま"]
  ];
  const text = cases.map(([surface]) => surface).join("・");
  const segments = await annotateWithRealDictionary(text);
  for (const [surface, reading] of cases) {
    assertReading(segments, surface, reading, text);
  }
  assert.equal(segments.map((segment) => segment.text).join(""), text);
});

test("keeps ordinary meanings outside exact phrase and online-slang contexts", async () => {
  const ordinary = await annotateWithRealDictionary(
    "博士は先生です。日本語を研究する。木の幹と頭が痛い。場所と相手。神主様。3日後から開始。"
  );
  assertReading(ordinary, "博士", "はかせ", "ordinary meanings");
  assertReading(ordinary, "幹", "みき", "ordinary meanings");
  assertReading(ordinary, "頭", "あたま", "ordinary meanings");
  assertReading(ordinary, "神主", "かんぬし", "ordinary meanings");
  assertReading(ordinary, "後", "ご", "ordinary meanings");
  assert.equal(ordinary.some((segment) => segment.text === "日本初"), false);

  const firstDay = await annotateWithRealDictionary("日本初日");
  assert.equal(firstDay.some((segment) => segment.text === "日本初"), false);
  assertReading(firstDay, "初日", "しょにち", "日本初日");
});

test("annotates verified Chinese, Korean, North Korean, and Vietnamese names as whole names", async () => {
  const cases = [
    ["北朝鮮の金正恩氏", "金正恩", "キム・ジョンウン"],
    ["中国の習近平主席", "習近平", "シージンピン"],
    ["中国の习近平主席", "习近平", "シージンピン"],
    ["韓国の李在明大統領", "李在明", "イ・ジェミョン"],
    ["文在寅政権", "文在寅", "ムン・ジェイン"],
    ["ベトナムの阮富仲元書記長", "阮富仲", "グエン・フー・チョン"],
    ["ベトナムの范明政氏", "范明政", "ファム・ミン・チン"]
  ];
  for (const [text, surface, reading] of cases) {
    const segments = await annotateWithRealDictionary(text);
    assertReading(segments, surface, reading, text);
    assert.equal(segments.map((segment) => segment.text).join(""), text);
  }
});

test("requires person context for ambiguous short foreign names and blocks place names", async () => {
  const positives = [
    ["中国の李強首相", "李強", "リー・チアン"],
    ["王毅外相", "王毅", "ワン・イー"],
    ["ベトナムの蘇林書記長", "蘇林", "トー・ラム"],
    ["ベトナムの蘇林さん", "蘇林", "トー・ラム"],
    ["ベトナム社会主義共和国の蘇林さん", "蘇林", "トー・ラム"],
    ["蘇林ベトナム国家主席", "蘇林", "トー・ラム"],
    ["梁強国家主席", "梁強", "ルオン・クオン"],
    ["范明政首相", "范明政", "ファム・ミン・チン"],
    ["裴青山外相", "裴青山", "ブイ・タイン・ソン"],
    ["胡志明主席", "胡志明", "ホー・チ・ミン"]
  ];
  for (const [text, surface, reading] of positives) {
    assertReading(await annotateWithRealDictionary(text), surface, reading, text);
  }

  for (const text of [
    "李強化策", "王毅然とした態度", "蘇林業", "胡志明市", "胡志明空港",
    "ベトナムの胡志明 市", "ベトナムの胡志明　空港",
    "ベトナム料理。蘇林さん", "ベトナム料理店で蘇林さんを取材",
    "中国に関する記事。李強さん", "中国料理店で李強さんに会った",
    "金曜日", "金子", "林芳正外相", "孫正義", "李下に冠を正さず"
  ]) {
    const segments = await annotateWithRealDictionary(text);
    assert.equal(
      segments.some((segment) => /^[\p{Script=Katakana}ー・]+$/u.test(segment.reading || "")),
      false,
      `${text}: unexpected foreign-name reading ${JSON.stringify(segments)}`
    );
  }
});

test("prefers explicit page readings and coordinates names split across inline nodes", async () => {
  const provided = await annotateWithRealDictionary("中国の張偉（チャン・ウェイ）氏が出席");
  assertReading(provided, "張偉", "チャン・ウェイ", "page-provided unknown person reading");

  const knownOverride = await annotateWithRealDictionary("習近平（しゅうきんぺい）主席");
  assertReading(knownOverride, "習近平", "しゅうきんぺい", "page-provided known person reading");

  const untrusted = await annotateWithRealDictionary("用語（ヨウゴ）を説明");
  assert.equal(untrusted.some((segment) => segment.text === "用語" && segment.reading === "ヨウゴ"), false);

  const splitSurname = await annotateWithRealDictionary("金", {
    prefix: "北朝鮮の",
    suffix: "正恩氏"
  });
  assert.deepEqual(splitSurname, [{ text: "金", reading: "キム" }]);
  const splitGivenName = await annotateWithRealDictionary("正恩", {
    prefix: "北朝鮮の金",
    suffix: "氏"
  });
  assert.deepEqual(splitGivenName, [{ text: "正恩", reading: "ジョンウン" }]);
  const splitChinese = await annotateWithRealDictionary("習近", { suffix: "平主席" });
  assert.deepEqual(splitChinese, [{ text: "習近", reading: "シージン" }]);

  for (const [fullName, parts, readings, surrounding] of [
    ["崔竜海", ["崔", "竜", "海"], ["チェ", "リョン", "ヘ"], ["北朝鮮の", "氏"]],
    ["文在寅", ["文", "在", "寅"], ["ムン", "ジェ", "イン"], ["韓国の", "前大統領"]],
    ["全斗煥", ["全", "斗", "煥"], ["チョン", "ドゥ", "ファン"], ["韓国の", "元大統領"]]
  ]) {
    for (let index = 0; index < parts.length; index += 1) {
      const prefix = `${surrounding[0]}${parts.slice(0, index).join("")}`;
      const suffix = `${parts.slice(index + 1).join("")}${surrounding[1]}`;
      const segments = await annotateWithRealDictionary(parts[index], { prefix, suffix });
      assert.deepEqual(segments, [{ text: parts[index], reading: readings[index] }], fullName);
    }
  }
});

test("uses conservative community and food contexts", async () => {
  const text = "後から確認する。3日後から開始。辛い焼きそばと仕事が辛い。(笑)（泣）";
  const segments = await annotateWithRealDictionary(text);
  const matchingAfter = segments.filter((segment) => segment.text === "後").map((segment) => segment.reading);
  assert.deepEqual(matchingAfter, ["あと", "ご"]);
  const matchingSpicy = segments.filter((segment) => segment.text === "辛い").map((segment) => segment.reading);
  assert.deepEqual(matchingSpicy, ["からい", "つらい"]);
  assertReading(segments, "笑", "わらい", text);
  assertReading(segments, "泣", "なき", text);
  assert.equal(segments.map((segment) => segment.text).join(""), text);

  const splitAfter = await annotateWithRealDictionary("後", { prefix: "。", suffix: "から確認" });
  assertReading(splitAfter, "後", "あと", "。|後|から確認");
  const splitSpicy = await annotateWithRealDictionary("辛い", { suffix: "食品" });
  assertReading(splitSpicy, "辛い", "からい", "辛い|食品");
});
