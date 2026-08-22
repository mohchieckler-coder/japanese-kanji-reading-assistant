import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import kuromoji from "kuromoji";
import { buildAnnotationSegments } from "../../src/core.mjs";
import {
  KATAKANA_READING_OVERRIDES,
  getKatakanaReadingOverride
} from "../../src/katakana-reading-overrides.mjs";

const KATAKANA_READING_PATTERN = /^[\p{Script=Katakana}ー・]+$/u;
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

function characterTokenizer(text) {
  return {
    tokenize: () => Array.from(text, (surface_form) => ({
      surface_form,
      reading: surface_form === "麻" ? "アサ" : undefined
    }))
  };
}

test("keeps exact katakana overrides immutable, unique, and auditable", () => {
  assert.equal(Object.isFrozen(KATAKANA_READING_OVERRIDES), true);
  assert.equal(new Set(KATAKANA_READING_OVERRIDES.map(([surface]) => surface)).size,
    KATAKANA_READING_OVERRIDES.length);

  for (const entry of KATAKANA_READING_OVERRIDES) {
    assert.equal(Object.isFrozen(entry), true);
    assert.match(entry[1], KATAKANA_READING_PATTERN, entry[0]);
  }
});

test("maps Japanese, simplified Chinese, and traditional Chinese spellings of 麻辣湯", () => {
  for (const surface of ["麻辣湯", "麻辣烫", "麻辣燙"]) {
    assert.equal(getKatakanaReadingOverride(surface), "マーラータン", surface);
  }
  assert.equal(getKatakanaReadingOverride("麻辣"), null);
  assert.equal(getKatakanaReadingOverride("湯"), null);
});

test("applies 麻辣湯 aliases as one katakana ruby segment across tokenizer boundaries", () => {
  for (const surface of ["麻辣湯", "麻辣烫", "麻辣燙"]) {
    const text = `${surface}を食べる`;
    const segments = buildAnnotationSegments(text, characterTokenizer(text));
    assert.deepEqual(
      segments.find((segment) => segment.text === surface),
      { text: surface, reading: "マーラータン" },
      `${surface}: ${JSON.stringify(segments)}`
    );
    assert.equal(segments.map((segment) => segment.text).join(""), text);
  }
});

test("overrides Kuromoji's split 麻辣湯 analysis with the conventional loanword reading", async () => {
  const tokenizer = await realTokenizerPromise;
  const rawTokens = tokenizer.tokenize("麻辣湯");
  assert.deepEqual(rawTokens.map((token) => token.surface_form), ["麻", "辣", "湯"]);

  const segments = buildAnnotationSegments("麻辣湯", tokenizer);
  assert.deepEqual(segments, [{ text: "麻辣湯", reading: "マーラータン" }]);
});
