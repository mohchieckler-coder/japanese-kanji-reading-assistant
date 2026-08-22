// Exact overrides for foreign terms that are conventionally read in katakana.
//
// Keep this list conservative: each entry must have a reliable Japanese source
// for its reading, and aliases must represent the same term rather than a broad
// substring. The core matcher only applies an override across complete tokenizer
// boundaries, so these entries do not change ordinary readings of their parts.
const KATAKANA_READING_DEFINITIONS = Object.freeze([
  Object.freeze({
    surfaces: Object.freeze([
      "麻辣湯", // Standard Japanese spelling.
      "麻辣烫", // Simplified Chinese spelling reported by a user.
      "麻辣燙"  // Traditional Chinese spelling of the same dish name.
    ]),
    reading: "マーラータン",
    source: "https://kotobank.jp/word/%E9%BA%BB%E8%BE%A3%E6%B9%AF-3257872"
  })
]);

export const KATAKANA_READING_OVERRIDES = Object.freeze(
  KATAKANA_READING_DEFINITIONS
    .flatMap(({ surfaces, reading }) => surfaces.map((surface) =>
      Object.freeze([surface, reading])
    ))
    .sort(([left], [right]) => right.length - left.length)
);

export function getKatakanaReadingOverride(surface) {
  return KATAKANA_READING_OVERRIDES.find(([candidate]) => candidate === surface)?.[1] ?? null;
}
