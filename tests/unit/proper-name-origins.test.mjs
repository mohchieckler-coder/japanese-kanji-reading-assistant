import test from "node:test";
import assert from "node:assert/strict";
import {
  PROPER_NAME_ORIGINS,
  PROPER_NAME_SOURCES,
  findProperNameMatches,
  formatProperNameAnnotation,
  getProperNameOrigin
} from "../../src/proper-name-origins.mjs";

test("proper-name catalog is immutable, separate, unique, and auditable", () => {
  assert.equal(Object.isFrozen(PROPER_NAME_ORIGINS), true);
  assert.equal(Object.isFrozen(PROPER_NAME_SOURCES), true);

  const ids = new Set();
  const surfaces = new Set();
  for (const entry of PROPER_NAME_ORIGINS) {
    assert.equal(Object.isFrozen(entry), true, entry.id);
    assert.equal(Object.isFrozen(entry.surfaces), true, entry.id);
    assert.equal(Object.isFrozen(entry.sourceIds), true, entry.id);
    assert.equal(Object.isFrozen(entry.surfaceOrigins), true, entry.id);
    assert.equal(ids.has(entry.id), false, entry.id);
    ids.add(entry.id);
    assert.ok(["person", "place"].includes(entry.entityKind), entry.id);
    assert.match(entry.verifiedAt, /^\d{4}-\d{2}-\d{2}$/u, entry.id);
    assert.ok(PROPER_NAME_SOURCES[entry.source], entry.id);
    assert.ok(entry.sourceIds.length > 0, entry.id);
    for (const sourceId of entry.sourceIds) {
      const source = PROPER_NAME_SOURCES[sourceId];
      assert.ok(source, `${entry.id}: ${sourceId}`);
      assert.match(source.url, /^https:\/\//u, sourceId);
    }
    for (const surface of entry.surfaces) {
      assert.equal(surfaces.has(surface), false, surface);
      surfaces.add(surface);
      const resolvedEntry = getProperNameOrigin(surface);
      assert.equal(resolvedEntry.id, entry.id, surface);
      assert.equal(resolvedEntry.origin, entry.surfaceOrigins[surface] ?? entry.origin, surface);
    }
  }

  assert.equal(getProperNameOrigin("コンピューター"), null, "lexical loanwords stay out");
});

test("covers official full forms for the requested political figures", () => {
  const cases = [
    ["ドナルド・トランプ", "Donald J. Trump", "米"],
    ["エマニュエル・マクロン", "Emmanuel Macron", "仏"],
    ["フリードリヒ・メルツ", "Friedrich Merz", "独"],
    ["キア・スターマー", "Keir Starmer", "英"],
    ["ウラジーミル・プーチン", "Владимир Путин", "露"],
    ["ウラジーミル・ウラジーミロヴィチ・プーチン", "Владимир Владимирович Путин", "露"],
    ["ヴォロディーミル・ゼレンスキー", "Володимир Зеленський", "宇"],
    ["ヴォロディミル・ゼレンスキー", "Володимир Зеленський", "宇"],
    ["ナレンドラ・モディ", "Narendra Modi", "印"],
    ["ルイス・イナシオ・ルーラ・ダ・シルバ", "Luiz Inácio Lula da Silva", "伯"],
    ["ルイス・イナシオ・ルーラ・ダ・シルヴァ", "Luiz Inácio Lula da Silva", "伯"],
    ["ジョルジャ・メローニ", "Giorgia Meloni", "伊"],
    ["マーガレット・サッチャー", "Margaret Thatcher", "英"]
  ];

  for (const [surface, origin, countryMark] of cases) {
    const [match] = findProperNameMatches(`${surface}が会談した`);
    assert.deepEqual(
      { surface: match.surface, origin: match.origin, countryMark: match.countryMark, entityKind: match.entityKind },
      { surface, origin, countryMark, entityKind: "person" },
      surface
    );
    assert.equal(match.annotation, `（${countryMark}）${origin}`);
    assert.equal(match.display, match.annotation);
  }
});

test("covers requested celebrities and athletes without generic-word leakage", () => {
  const cases = [
    ["テイラー・スウィフト", "Taylor Swift", "米"],
    ["ビヨンセ", "Beyoncé", "米"],
    ["イーロン・マスク", "Elon Musk", "米"],
    ["リオネル・メッシ", "Lionel Messi", "亜"],
    ["クリスティアーノ・ロナウド", "Cristiano Ronaldo", "葡"],
    ["キリアン・エムバペ", "Kylian Mbappé", "仏"]
  ];
  for (const [surface, origin, countryMark] of cases) {
    const match = findProperNameMatches(surface)[0];
    assert.deepEqual(
      { origin: match.origin, countryMark: match.countryMark, entityKind: match.entityKind },
      { origin, countryMark, entityKind: "person" },
      surface
    );
  }

  assert.deepEqual(findProperNameMatches("マスク着用をお願いします"), []);
  assert.deepEqual(findProperNameMatches("米国ではマスク着用を推奨する"), []);
});

test("requires person, office, or country context for shortened person names", () => {
  assert.deepEqual(findProperNameMatches("トランプが置かれた"), []);
  assert.deepEqual(findProperNameMatches("マスクを外した"), []);
  assert.deepEqual(findProperNameMatches("メッシな机"), []);

  assert.equal(findProperNameMatches("トランプ氏が演説した")[0].origin, "Donald J. Trump");
  assert.equal(findProperNameMatches("マクロン大統領が会見した")[0].origin, "Emmanuel Macron");
  assert.equal(findProperNameMatches("歌手スウィフトの新作")[0].origin, "Taylor Swift");
  assert.equal(findProperNameMatches("メッシ選手が得点した")[0].origin, "Lionel Messi");
  assert.equal(findProperNameMatches("フランスのエムバペが出場した")[0].origin, "Kylian Mbappé");
  assert.equal(findProperNameMatches("マスク", { suffix: "氏" })[0].origin, "Elon Musk");
  assert.equal(findProperNameMatches("ルーラ", { countryMark: "伯" })[0].origin, "Luiz Inácio Lula da Silva");
});

test("rejects the required homographic and compound negative examples", () => {
  assert.deepEqual(findProperNameMatches("トランプカードで遊ぶ", { personContext: true }), []);
  assert.deepEqual(findProperNameMatches("マスク着用", { personContext: true }), []);
  assert.deepEqual(findProperNameMatches("ソウルミュージック"), []);
  assert.deepEqual(findProperNameMatches("ソウル・ミュージック"), []);
  assert.deepEqual(findProperNameMatches("ローマ字入力"), []);
});

test("blocks natural card and face-mask grammar without suppressing real people", () => {
  for (const text of [
    "米国ではマスクの着用を推奨する",
    "米国ではマスクを着用する",
    "米国ではマスク 着用を推奨する",
    "米国ではマスクが不足している",
    "アメリカでトランプを楽しむ",
    "アメリカでトランプで遊ぶ",
    "アメリカでトランプのカードを配る"
  ]) {
    assert.deepEqual(findProperNameMatches(text), [], text);
  }

  const truePeople = [
    ["米国のマスク氏が新製品を発表した", "Elon Musk"],
    ["テスラのマスクCEOが説明した", "Elon Musk"],
    ["米国のマスクを支持する投資家", "Elon Musk"],
    ["アメリカのトランプ大統領が演説した", "Donald J. Trump"],
    ["アメリカでトランプを支持する", "Donald J. Trump"],
    ["トランプ氏がカードで遊んだ", "Donald J. Trump"]
  ];
  for (const [text, origin] of truePeople) {
    assert.equal(findProperNameMatches(text)[0]?.origin, origin, text);
  }
});

test("uses a live official first-party profile for Cristiano Ronaldo", () => {
  assert.deepEqual(PROPER_NAME_SOURCES["uefa-ronaldo"], {
    id: "uefa-ronaldo",
    title: "UEFA: Cristiano Ronaldo",
    url: "https://www.uefa.com/european-qualifiers/teams/players/63706--cristiano-ronaldo/"
  });
});

test("covers requested city names with local forms and location country marks", () => {
  const cases = [
    ["ニューヨーク", "New York", "米"],
    ["ロンドン", "London", "英"],
    ["パリ", "Paris", "仏"],
    ["ベルリン", "Berlin", "独"],
    ["ローマ", "Roma", "伊"],
    ["マドリード", "Madrid", "西"],
    ["モスクワ", "Москва", "露"],
    ["キーウ", "Київ", "宇"],
    ["ソウル", "서울", "韓"],
    ["ハノイ", "Hà Nội", "越"],
    ["ウィーン", "Wien", "墺"],
    ["ミュンヘン", "München", "独"]
  ];
  for (const [surface, origin, countryMark] of cases) {
    const [match] = findProperNameMatches(`${surface}で会議を開く`);
    assert.deepEqual(
      { surface: match.surface, origin: match.origin, countryMark: match.countryMark, entityKind: match.entityKind },
      { surface, origin, countryMark, entityKind: "place" },
      surface
    );
  }
});

test("returns longest non-overlapping UTF-16-compatible matches", () => {
  const text = "ドナルド・トランプ氏はニューヨークからパリへ向かった。";
  const matches = findProperNameMatches(text);
  assert.deepEqual(matches.map(({ surface }) => surface), ["ドナルド・トランプ", "ニューヨーク", "パリ"]);
  assert.equal(Object.isFrozen(matches), true);
  assert.equal(matches.every(Object.isFrozen), true);
  assert.equal(matches.every((match) => text.slice(match.start, match.end) === match.surface), true);
  assert.equal(matches.every((match) => Object.isFrozen(match.sourceIds)), true);
  for (let index = 1; index < matches.length; index += 1) {
    assert.ok(matches[index - 1].end <= matches[index].start);
  }
});

test("validates API inputs and annotation shape", () => {
  const entry = getProperNameOrigin("パリ");
  assert.equal(formatProperNameAnnotation(entry), "（仏）Paris");
  assert.throws(() => formatProperNameAnnotation(null), /entry is required/u);
  assert.throws(() => findProperNameMatches(null), /requires a string/u);
  assert.throws(() => findProperNameMatches("パリ", null), /context must be an object/u);
  assert.equal(getProperNameOrigin(null), null);
});
