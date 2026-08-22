import test from "node:test";
import assert from "node:assert/strict";
import {
  JMDICT_LOANWORD_ORIGIN_METADATA,
  LOANWORD_LANGUAGE_MARKS,
  LOANWORD_ORIGINS,
  findLoanwordMatches,
  formatLoanwordAnnotation,
  getLoanwordOrigin
} from "../../src/loanword-origins.mjs";

const KATAKANA_SURFACE_PATTERN = /^[\p{Script=Katakana}ー・]+$/u;

test("loanword catalog is immutable, unique, and auditable", () => {
  assert.equal(Object.isFrozen(LOANWORD_LANGUAGE_MARKS), true);
  assert.equal(Object.isFrozen(LOANWORD_ORIGINS), true);

  const ids = new Set();
  const surfaces = new Set();
  for (const entry of LOANWORD_ORIGINS) {
    assert.equal(Object.isFrozen(entry), true, entry.id);
    assert.equal(Object.isFrozen(entry.surfaces), true, entry.id);
    assert.equal(ids.has(entry.id), false, `duplicate id: ${entry.id}`);
    ids.add(entry.id);
    assert.ok(["high", "dictionary"].includes(entry.confidence), entry.id);
    assert.ok(["curated", "jmdict"].includes(entry.source), entry.id);
    assert.equal(entry.confidence === "high", entry.source === "curated", entry.id);
    assert.match(entry.reviewedAt, /^\d{4}-\d{2}-\d{2}$/u, entry.id);
    assert.equal(typeof entry.origin, "string", entry.id);
    assert.ok(entry.origin.length > 0, entry.id);
    assert.ok(Object.hasOwn(LOANWORD_LANGUAGE_MARKS, entry.language), entry.id);
    assert.equal(entry.countryMark, LOANWORD_LANGUAGE_MARKS[entry.language], entry.id);
    assert.equal(entry.languageCode, entry.language, entry.id);
    assert.equal(entry.languageLabel, entry.countryMark, entry.id);

    for (const surface of entry.surfaces) {
      assert.match(surface, KATAKANA_SURFACE_PATTERN, `${entry.id}: ${surface}`);
      assert.equal(surfaces.has(surface), false, `duplicate surface: ${surface}`);
      surfaces.add(surface);
      assert.equal(getLoanwordOrigin(surface), entry, surface);
    }
  }

  assert.ok(LOANWORD_ORIGINS.length >= 3000, "catalog should include the pinned JMdict layer");
  assert.ok(surfaces.size > LOANWORD_ORIGINS.length, "catalog should exercise spelling aliases");
});

test("pins and exposes auditable JMdict generation metadata", () => {
  assert.equal(Object.isFrozen(JMDICT_LOANWORD_ORIGIN_METADATA), true);
  assert.equal(JMDICT_LOANWORD_ORIGIN_METADATA.dictionaryDate, "2026-08-17");
  assert.equal(JMDICT_LOANWORD_ORIGIN_METADATA.sourceVersion, "3.6.2+20260817122448");
  assert.match(JMDICT_LOANWORD_ORIGIN_METADATA.sourceSha256, /^[A-F0-9]{64}$/u);
  assert.ok(JMDICT_LOANWORD_ORIGIN_METADATA.entryCount >= 2900);
  assert.ok(JMDICT_LOANWORD_ORIGIN_METADATA.ambiguousSurfacesOmitted > 0);
  assert.ok(JMDICT_LOANWORD_ORIGIN_METADATA.commonHomographicSurfacesOmitted > 0);

  const generated = getLoanwordOrigin("アイオリ");
  assert.equal(generated.source, "jmdict");
  assert.equal(generated.confidence, "dictionary");
  assert.equal(formatLoanwordAnnotation(generated), "（仏）aïoli");
});

test("formats English without a country mark and non-English with Japanese country marks", () => {
  const computer = getLoanwordOrigin("コンピューター");
  assert.equal(computer.language, "en");
  assert.equal(computer.countryMark, null);
  assert.equal(formatLoanwordAnnotation(computer), "computer");

  const coupEtat = getLoanwordOrigin("クーデター");
  assert.deepEqual(
    { language: coupEtat.language, mark: coupEtat.countryMark, annotation: formatLoanwordAnnotation(coupEtat) },
    { language: "fr", mark: "仏", annotation: "（仏）coup d'État" }
  );

  const arbeit = getLoanwordOrigin("アルバイト");
  assert.deepEqual(
    { language: arbeit.language, mark: arbeit.countryMark, annotation: formatLoanwordAnnotation(arbeit) },
    { language: "de", mark: "独", annotation: "（独）Arbeit" }
  );
});

test("matches longest surface at each position and never overlaps", () => {
  const text = "データベースとデータ、コンピューターとコンピュータ。";
  const matches = findLoanwordMatches(text);
  assert.deepEqual(
    matches.map(({ surface, origin }) => [surface, origin]),
    [
      ["データベース", "database"],
      ["データ", "data"],
      ["コンピューター", "computer"],
      ["コンピュータ", "computer"]
    ]
  );
  assert.equal(matches.every((match) => match.display === match.annotation), true);
  assert.equal(matches.every((match) => match.languageCode === match.language), true);
  for (let index = 1; index < matches.length; index += 1) {
    assert.ok(matches[index - 1].end <= matches[index].start);
  }
  assert.equal(Object.isFrozen(matches), true);
  assert.equal(matches.every(Object.isFrozen), true);
});

test("preserves exact text slices and reconstructs the source around matches", () => {
  const text = "速報：クーデター後にアルバイトを始め、ティラミスを食べた。";
  const matches = findLoanwordMatches(text);
  let cursor = 0;
  let reconstructed = "";
  for (const match of matches) {
    reconstructed += text.slice(cursor, match.start);
    assert.equal(text.slice(match.start, match.end), match.surface);
    reconstructed += match.surface;
    cursor = match.end;
  }
  reconstructed += text.slice(cursor);
  assert.equal(reconstructed, text);
  assert.deepEqual(
    matches.map(({ annotation }) => annotation),
    ["（仏）coup d'État", "（独）Arbeit", "（伊）tiramisù"]
  );
});

test("requires complete katakana coverage and safely segments known compounds", () => {
  assert.deepEqual(findLoanwordMatches("コンピューターを使う").map(({ surface }) => surface), ["コンピューター"]);
  assert.deepEqual(findLoanwordMatches("（クーデター）、アルバイト先").map(({ surface }) => surface), ["クーデター", "アルバイト"]);

  assert.deepEqual(findLoanwordMatches("スーパーコンピューター"), []);
  assert.deepEqual(
    findLoanwordMatches("ニュースサイト").map(({ surface, annotation }) => [surface, annotation]),
    [["ニュース", "news"], ["サイト", "site"]]
  );
  assert.deepEqual(
    findLoanwordMatches("オンラインゲーム").map(({ surface, annotation }) => [surface, annotation]),
    [["オンライン", "online"], ["ゲーム", "game"]]
  );
  assert.deepEqual(findLoanwordMatches("ニュースピカピカ"), []);
  assert.deepEqual(findLoanwordMatches("データベース化").map(({ surface }) => surface), ["データベース"]);
  assert.deepEqual(
    findLoanwordMatches("コンピューター・ニュース").map(({ surface }) => surface),
    ["コンピューター", "ニュース"]
  );
  assert.deepEqual(
    findLoanwordMatches("ア・ラ・カルト").map(({ surface, annotation }) => [surface, annotation]),
    [["ア・ラ・カルト", "（仏）à la carte"]]
  );
});

test("covers the requested and representative high-confidence language groups", () => {
  const cases = [
    ["ニュース", "en", null, "news"],
    ["クーデター", "fr", "仏", "coup d'État"],
    ["アルバイト", "de", "独", "Arbeit"],
    ["パエリア", "es", "西", "paella"],
    ["オペラ", "it", "伊", "opera"],
    ["コーヒー", "nl", "蘭", "koffie"],
    ["シャボン", "pt", "葡", "sabão"],
    ["イクラ", "ru", "露", "икра"],
    ["ギョーザ", "zh", "中", "餃子"],
    ["キムチ", "ko", "韓", "김치"],
    ["スキー", "no", "諾", "ski"],
    ["サウナ", "fi", "芬", "sauna"]
  ];

  for (const [surface, language, countryMark, origin] of cases) {
    const entry = getLoanwordOrigin(surface);
    assert.ok(entry, surface);
    assert.deepEqual(
      { language: entry.language, countryMark: entry.countryMark, origin: entry.origin },
      { language, countryMark, origin },
      surface
    );
  }
});

test("covers common loanwords across news, forums, academic writing, and sports", () => {
  const domainCases = {
    news: [
      ["インフレ", "inflation"],
      ["ミサイル", "missile"],
      ["サミット", "summit"],
      ["インタビュー", "interview"],
      ["コメント", "comment"],
      ["メディア", "media"],
      ["スクープ", "scoop"]
    ],
    forum: [
      ["アカウント", "account"],
      ["スレッド", "thread"],
      ["ハッシュタグ", "hashtag"],
      ["ログイン", "login"],
      ["ブログ", "blog"],
      ["ユーザー", "user"],
      ["リプライ", "reply"],
      ["フォロワー", "follower"],
      ["コミュニティ", "community"]
    ],
    academic: [
      ["アルゴリズム", "algorithm"],
      ["データベース", "database"],
      ["シミュレーション", "simulation"],
      ["プロトコル", "protocol"],
      ["エビデンス", "evidence"],
      ["カリキュラム", "curriculum"],
      ["メタアナリシス", "meta-analysis"]
    ],
    sports: [
      ["ドラフト", "draft"],
      ["チーム", "team"],
      ["メンバー", "member"],
      ["リーグ", "league"],
      ["トーナメント", "tournament"],
      ["スタジアム", "stadium"],
      ["コーチ", "coach"],
      ["ゴール", "goal"],
      ["サッカー", "soccer"],
      ["ラグビー", "rugby"],
      ["オリンピック", "Olympic"]
    ]
  };

  const failures = [];
  for (const [domain, cases] of Object.entries(domainCases)) {
    for (const [surface, origin] of cases) {
      const entry = getLoanwordOrigin(surface);
      if (!entry) {
        failures.push(`${domain}: missing ${surface}`);
        continue;
      }
      const actual = {
        language: entry.language,
        countryMark: entry.countryMark,
        origin: entry.origin,
        annotation: formatLoanwordAnnotation(entry)
      };
      const expected = { language: "en", countryMark: null, origin, annotation: origin };
      if (!Object.keys(expected).every((key) => actual[key] === expected[key])) {
        failures.push(`${domain}: ${surface} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    }
  }
  assert.deepEqual(failures, []);
});

test("uses Japanese country marks for non-English words found in multiple domains", () => {
  const cases = [
    ["アンケート", "fr", "仏", "enquête"],
    ["プロフィール", "fr", "仏", "profil"],
    ["カルテ", "de", "独", "Karte"],
    ["ゼミナール", "de", "独", "Seminar"],
    ["ゲレンデ", "de", "独", "Gelände"],
    ["パエリア", "es", "西", "paella"],
    ["シャボン", "pt", "葡", "sabão"],
    ["キムチ", "ko", "韓", "김치"]
  ];

  for (const [surface, language, countryMark, origin] of cases) {
    const entry = getLoanwordOrigin(surface);
    assert.ok(entry, surface);
    assert.deepEqual(
      {
        language: entry.language,
        countryMark: entry.countryMark,
        origin: entry.origin,
        annotation: formatLoanwordAnnotation(entry)
      },
      { language, countryMark, origin, annotation: `（${countryMark}）${origin}` },
      surface
    );
  }
});

test("segments only fully known multi-domain compounds", () => {
  const cases = [
    ["ニュースサイト", [["ニュース", "news"], ["サイト", "site"]]],
    ["オンラインニュース", [["オンライン", "online"], ["ニュース", "news"]]],
    ["スポーツニュース", [["スポーツ", "sports"], ["ニュース", "news"]]],
    ["データベースシステム", [["データベース", "database"], ["システム", "system"]]],
    ["コンピューターシミュレーション", [["コンピューター", "computer"], ["シミュレーション", "simulation"]]]
  ];

  const failures = [];
  for (const [text, expected] of cases) {
    const actual = findLoanwordMatches(text).map(({ surface, annotation }) => [surface, annotation]);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      failures.push(`${text}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  }
  assert.deepEqual(failures, []);
});

test("does not guess proper names, onomatopoeia, or wasei-eigo", () => {
  assert.deepEqual(findLoanwordMatches("トランプ氏がワクワクしながらパソコンを使った"), []);
  assert.deepEqual(
    findLoanwordMatches("トランプ政権のニュース").map(({ surface }) => surface),
    ["ニュース"]
  );
  assert.deepEqual(findLoanwordMatches("トランプファミリーの動向"), []);
  assert.deepEqual(findLoanwordMatches("トランプ氏はトランプで遊んだ"), []);
  assert.equal(getLoanwordOrigin("トランプ"), null);
  assert.equal(getLoanwordOrigin("サラリーマン"), null);
  assert.equal(getLoanwordOrigin("コンセント"), null);
  assert.equal(getLoanwordOrigin("スマホ"), null);
  assert.equal(getLoanwordOrigin("ピカピカ"), null);
});

test("does not annotate broader proper-name, sound-symbolic, native, or wasei-eigo samples", () => {
  const groups = {
    properNames: ["ムラカミ", "サトウ", "スズキ", "タナカ", "オオタニ"],
    geographicNames: ["ロシア", "オランダ", "ギリシャ", "イギリス", "ドイツ", "イタリア", "トルコ", "パレスチナ", "ヨーロッパ", "モスクワ", "ウィーン", "ミュンヘン", "プラハ", "サイゴン"],
    soundSymbolic: ["ワクワク", "ドキドキ", "キラキラ", "ゴロゴロ", "ピカピカ"],
    nativeKatakana: ["カタカナ", "ケガ", "ダメ", "ゴミ"],
    waseiEigo: ["サラリーマン", "コンセント", "パソコン", "スマホ", "オフィスレディー", "ベビーカー", "ガソリンスタンド"],
    ambiguousOrigins: [
      "リード", "ウイルス", "ウィルス", "アル", "イオン", "イス",
      "カテゴリー", "カテゴリ", "ガス", "スイス",
      "クラブ", "スプリント", "タイム", "チップ", "フレーズ", "ブロック",
      "ドン", "トランプ", "バス", "パン", "ボタン", "マラソン", "メジャー",
      "メス", "ヨーグルト", "リスク", "リスト", "カッパ", "ロコ", "ロン"
    ]
  };

  for (const [group, surfaces] of Object.entries(groups)) {
    for (const surface of surfaces) {
      assert.equal(getLoanwordOrigin(surface), null, `${group}: ${surface}`);
      assert.deepEqual(findLoanwordMatches(surface), [], `${group}: ${surface}`);
    }
  }
});

test("requires professional context before expanding the ambiguous clipping プロ", () => {
  const entry = getLoanwordOrigin("プロ");
  assert.ok(entry);
  assert.equal(entry.origin, "professional");
  assert.deepEqual(findLoanwordMatches("プロ"), []);
  assert.deepEqual(
    findLoanwordMatches("プロ", { suffix: "用" }).map(({ surface, origin }) => [surface, origin]),
    [["プロ", "professional"]]
  );
  assert.deepEqual(findLoanwordMatches("プロパガンダ"), []);
  assert.deepEqual(
    findLoanwordMatches("プロ野球の選手").map(({ surface, origin }) => [surface, origin]),
    [["プロ", "professional"]]
  );
  assert.deepEqual(
    findLoanwordMatches("現役プロが指導する").map(({ surface, origin }) => [surface, origin]),
    [["プロ", "professional"]]
  );
});

test("rejects non-string matching input without mutating the catalog", () => {
  assert.throws(() => findLoanwordMatches(null), /requires a string/u);
  assert.equal(getLoanwordOrigin(null), null);
  assert.throws(() => formatLoanwordAnnotation(null), /entry is required/u);
});
