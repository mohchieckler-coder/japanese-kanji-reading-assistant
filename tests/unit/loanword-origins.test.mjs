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
    ["パン", "pt", "葡", "pão"],
    ["イクラ", "ru", "露", "икра"],
    ["ギョーザ", "zh", "中", "餃子"],
    ["キムチ", "ko", "韓", "김치"],
    ["スキー", "no", "諾", "ski"],
    ["サウナ", "fi", "芬", "sauna"],
    ["ヨーグルト", "tr", "土", "yoğurt"]
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

test("does not guess proper names, onomatopoeia, or wasei-eigo", () => {
  assert.deepEqual(findLoanwordMatches("トランプ氏がワクワクしながらパソコンを使った"), []);
  assert.deepEqual(
    findLoanwordMatches("トランプ氏はトランプで遊んだ").map(({ surface, origin }) => [surface, origin]),
    [["トランプ", "trump"]]
  );
  assert.equal(getLoanwordOrigin("サラリーマン"), null);
  assert.equal(getLoanwordOrigin("コンセント"), null);
  assert.equal(getLoanwordOrigin("スマホ"), null);
  assert.equal(getLoanwordOrigin("ピカピカ"), null);
});

test("rejects non-string matching input without mutating the catalog", () => {
  assert.throws(() => findLoanwordMatches(null), /requires a string/u);
  assert.equal(getLoanwordOrigin(null), null);
  assert.throws(() => formatLoanwordAnnotation(null), /entry is required/u);
});
