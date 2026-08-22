import test from "node:test";
import assert from "node:assert/strict";
import {
  JAPANESE_PUBLIC_NAMES,
  JAPANESE_PUBLIC_NAME_SOURCES,
  getJapanesePublicNameParts
} from "../../src/japanese-public-name-readings.mjs";

const EXPECTED_READINGS = Object.freeze({
  高市早苗: "たかいちさなえ",
  石破茂: "いしばしげる",
  大谷翔平: "おおたにしょうへい",
  鈴木誠也: "すずきせいや",
  羽生結弦: "はにゅうゆづる",
  藤井聡太: "ふじいそうた",
  伊東純也: "いとうじゅんや",
  久保建英: "くぼたけふさ",
  三笘薫: "みとまかおる",
  森保一: "もりやすはじめ",
  村上春樹: "むらかみはるき",
  宮崎駿: "みやざきはやお",
  宮﨑駿: "みやざきはやお",
  上野千鶴子: "うえのちづこ"
});

test("Japanese public-name catalog is immutable, auditable, and reconstructable", () => {
  assert.equal(Object.isFrozen(JAPANESE_PUBLIC_NAMES), true);
  assert.equal(Object.isFrozen(JAPANESE_PUBLIC_NAME_SOURCES), true);
  assert.ok(JAPANESE_PUBLIC_NAMES.length >= 13);

  const seenSurfaces = new Set();
  for (const entry of JAPANESE_PUBLIC_NAMES) {
    assert.equal(Object.isFrozen(entry), true, entry.id);
    assert.equal(Object.isFrozen(entry.surfaces), true, entry.id);
    assert.equal(Object.isFrozen(entry.components), true, entry.id);
    assert.equal(entry.country, "japan", entry.id);
    assert.equal(entry.locale, "ja-JP", entry.id);
    assert.equal(entry.confidence, "unique", entry.id);
    assert.match(entry.verifiedAt, /^\d{4}-\d{2}-\d{2}$/u, entry.id);
    assert.match(entry.reading, /^[\p{Script=Hiragana}ー]+$/u, entry.id);
    assert.equal(entry.components.length, 2, `${entry.id}: split only at family/given boundary`);
    assert.equal(entry.components.every(Object.isFrozen), true, entry.id);
    assert.equal(entry.components.map((component) => component.reading).join(""), entry.reading);

    const source = JAPANESE_PUBLIC_NAME_SOURCES[entry.sourceId];
    assert.ok(source, `${entry.id}: missing source ${entry.sourceId}`);
    assert.equal(Object.isFrozen(source), true, entry.sourceId);
    assert.match(source.url, /^https:\/\//u, entry.sourceId);

    for (const surface of entry.surfaces) {
      assert.equal(seenSurfaces.has(surface), false, `duplicate Japanese public-name surface: ${surface}`);
      seenSurfaces.add(surface);
      assert.equal(
        entry.components.reduce((length, component) => length + component.length, 0),
        surface.length,
        `${entry.id}: component lengths do not reconstruct ${surface}`
      );
      const whole = getJapanesePublicNameParts(entry, surface).find((part) =>
        part.start === 0 && part.surface === surface
      );
      assert.equal(whole?.reading, entry.reading, `${entry.id}: whole-name part mismatch`);
    }
  }
});

test("verified readings cover the requested high-risk public names and spelling variants", () => {
  const actual = Object.fromEntries(JAPANESE_PUBLIC_NAMES.flatMap((entry) =>
    entry.surfaces.map((surface) => [surface, entry.reading])
  ));
  assert.deepEqual(actual, EXPECTED_READINGS);

  // These are common tokenizer/name-dictionary failure modes and must not regress.
  assert.notEqual(actual.羽生結弦, "はぶけつげん");
  assert.notEqual(actual.久保建英, "くぼけんえい");
  assert.notEqual(actual.森保一, "もりほいち");
  assert.notEqual(actual.三笘薫, "さんせんかおる");
});

test("parts expose family, given, and whole names without speculative per-kanji splits", () => {
  const entry = JAPANESE_PUBLIC_NAMES.find((candidate) => candidate.id === "hanyu-yuzuru");
  const parts = getJapanesePublicNameParts(entry, "羽生結弦");

  assert.equal(Object.isFrozen(parts), true);
  assert.deepEqual(parts, [
    { surface: "羽生", start: 0, reading: "はにゅう" },
    { surface: "羽生結弦", start: 0, reading: "はにゅうゆづる" },
    { surface: "結弦", start: 2, reading: "ゆづる" }
  ]);
  assert.equal(parts.some((part) => part.surface === "羽" || part.surface === "結"), false);
});

test("whole-name parts can rebuild a name split across inline DOM nodes", () => {
  const entry = JAPANESE_PUBLIC_NAMES.find((candidate) => candidate.id === "kubo-takefusa");
  const inlineChunks = ["久保", "建英"];
  const joinedSurface = inlineChunks.join("");
  const parts = getJapanesePublicNameParts(entry, joinedSurface);

  assert.deepEqual(
    parts.find((part) => part.start === 0 && part.surface === joinedSurface),
    { surface: "久保建英", start: 0, reading: "くぼたけふさ" }
  );
  assert.deepEqual(
    inlineChunks.map((chunk, index) => parts.find((part) =>
      part.surface === chunk && part.start === (index === 0 ? 0 : inlineChunks[0].length)
    )?.reading),
    ["くぼ", "たけふさ"]
  );
});

test("parts reject unregistered spellings instead of guessing", () => {
  const entry = JAPANESE_PUBLIC_NAMES.find((candidate) => candidate.id === "miyazaki-hayao");
  assert.deepEqual(getJapanesePublicNameParts(entry, "宮澤駿"), []);
  assert.deepEqual(getJapanesePublicNameParts(null, "宮崎駿"), []);
});
