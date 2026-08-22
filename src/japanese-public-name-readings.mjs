const VERIFIED_AT = "2026-08-22";

/**
 * Primary or first-party pages used to verify public-name spellings/readings.
 *
 * Some sports bodies publish Latin-script readings rather than kana. Those
 * romanizations are still useful here because the catalog stores whole-name
 * boundaries and never guesses a reading character by character.
 */
export const JAPANESE_PUBLIC_NAME_SOURCES = Object.freeze({
  "kantei-takaichi-2026": Object.freeze({
    url: "https://www.kantei.go.jp/jp/104/meibo/daijin/takaichi_sanae.html",
    note: "Prime Minister's Office profile explicitly lists 高市早苗 as たかいち さなえ"
  }),
  "shugiin-ishiba-2026": Object.freeze({
    url: "https://www.shugiin.go.jp/internet/itdb_english.nsf/html/statics/member/e033.htm",
    note: "House of Representatives member profile gives the official romanization ISHIBA Shigeru"
  }),
  "mlb-ohtani-player": Object.freeze({
    url: "https://www.mlb.com/ja/player/shohei-ohtani-660271",
    note: "MLB player profile and canonical slug identify 大谷翔平 as Shohei Ohtani"
  }),
  "mlb-suzuki-player": Object.freeze({
    url: "https://www.mlb.com/ja/player/seiya-suzuki-673548",
    note: "MLB player profile and canonical slug identify 鈴木誠也 as Seiya Suzuki"
  }),
  "joc-hanyu-pyeongchang": Object.freeze({
    url: "https://joc.or.jp/games/olympic/pyeongchang/sports/figure/team/hanyuyuzuru.html",
    note: "Japanese Olympic Committee profile explicitly lists 羽生結弦 as はにゅう ゆづる"
  }),
  "shogi-fujii-player": Object.freeze({
    url: "https://www.shogi.or.jp/player/sota_fujii",
    note: "Japan Shogi Association player profile gives the official name and romanization Sota Fujii"
  }),
  "jfa-samurai-blue-2022": Object.freeze({
    url: "https://www.jfa.jp/samuraiblue/worldcup_2022/squad/",
    note: "Japan Football Association squad lists official Japanese names and Latin-script readings"
  }),
  "shinchosha-murakami": Object.freeze({
    url: "https://www.shinchosha.co.jp/writer/2982/",
    note: "Author's publisher profile explicitly lists 村上春樹 as ムラカミ・ハルキ"
  }),
  "ghibli-miyazaki": Object.freeze({
    url: "https://www.ghibli.jp/docs/0718kenpo.pdf",
    relatedUrl: "https://www.ghibli.jp/profile/",
    note: "Studio Ghibli identifies the director as みやざき・はやお and uses both 宮崎 and official-form 宮﨑 spellings"
  }),
  "utokyo-ueno-2019": Object.freeze({
    url: "https://www.u-tokyo.ac.jp/focus/ja/articles/z1301_00014.html",
    note: "University of Tokyo commencement page explicitly lists 上野千鶴子 as うえの ちづこ"
  })
});

function defineName(definition) {
  const { surfaces, components: rawComponents, ...metadata } = definition;
  const components = rawComponents.map((component) => Object.freeze({ ...component }));
  const componentReading = components.map((component) => component.reading).join("");

  if (componentReading !== definition.reading) {
    throw new Error(`Japanese public name components do not reconstruct ${definition.id}`);
  }
  if (!JAPANESE_PUBLIC_NAME_SOURCES[definition.sourceId]) {
    throw new Error(`Japanese public name source is missing for ${definition.id}`);
  }
  if (components.length !== 2) {
    throw new Error(`Japanese public name must use family/given-name boundaries: ${definition.id}`);
  }
  for (const surface of surfaces) {
    const componentLength = components.reduce((total, component) => total + component.length, 0);
    if (componentLength !== surface.length) {
      throw new Error(`Japanese public name components do not reconstruct ${surface}`);
    }
  }

  return Object.freeze({
    country: "japan",
    locale: "ja-JP",
    confidence: "unique",
    verifiedAt: VERIFIED_AT,
    ...metadata,
    surfaces: Object.freeze([...surfaces]),
    components: Object.freeze(components)
  });
}

export const JAPANESE_PUBLIC_NAMES = Object.freeze([
  defineName({
    id: "takaichi-sanae",
    surfaces: ["高市早苗"], reading: "たかいちさなえ",
    components: [{ length: 2, reading: "たかいち" }, { length: 2, reading: "さなえ" }],
    sourceId: "kantei-takaichi-2026"
  }),
  defineName({
    id: "ishiba-shigeru",
    surfaces: ["石破茂"], reading: "いしばしげる",
    components: [{ length: 2, reading: "いしば" }, { length: 1, reading: "しげる" }],
    sourceId: "shugiin-ishiba-2026"
  }),
  defineName({
    id: "ohtani-shohei",
    surfaces: ["大谷翔平"], reading: "おおたにしょうへい",
    components: [{ length: 2, reading: "おおたに" }, { length: 2, reading: "しょうへい" }],
    sourceId: "mlb-ohtani-player"
  }),
  defineName({
    id: "suzuki-seiya",
    surfaces: ["鈴木誠也"], reading: "すずきせいや",
    components: [{ length: 2, reading: "すずき" }, { length: 2, reading: "せいや" }],
    sourceId: "mlb-suzuki-player"
  }),
  defineName({
    id: "hanyu-yuzuru",
    surfaces: ["羽生結弦"], reading: "はにゅうゆづる",
    components: [{ length: 2, reading: "はにゅう" }, { length: 2, reading: "ゆづる" }],
    sourceId: "joc-hanyu-pyeongchang"
  }),
  defineName({
    id: "fujii-sota",
    surfaces: ["藤井聡太"], reading: "ふじいそうた",
    components: [{ length: 2, reading: "ふじい" }, { length: 2, reading: "そうた" }],
    sourceId: "shogi-fujii-player"
  }),
  defineName({
    id: "ito-junya",
    surfaces: ["伊東純也"], reading: "いとうじゅんや",
    components: [{ length: 2, reading: "いとう" }, { length: 2, reading: "じゅんや" }],
    sourceId: "jfa-samurai-blue-2022"
  }),
  defineName({
    id: "kubo-takefusa",
    surfaces: ["久保建英"], reading: "くぼたけふさ",
    components: [{ length: 2, reading: "くぼ" }, { length: 2, reading: "たけふさ" }],
    sourceId: "jfa-samurai-blue-2022"
  }),
  defineName({
    id: "mitoma-kaoru",
    surfaces: ["三笘薫"], reading: "みとまかおる",
    components: [{ length: 2, reading: "みとま" }, { length: 1, reading: "かおる" }],
    sourceId: "jfa-samurai-blue-2022"
  }),
  defineName({
    id: "moriyasu-hajime",
    surfaces: ["森保一"], reading: "もりやすはじめ",
    components: [{ length: 2, reading: "もりやす" }, { length: 1, reading: "はじめ" }],
    sourceId: "jfa-samurai-blue-2022"
  }),
  defineName({
    id: "murakami-haruki",
    surfaces: ["村上春樹"], reading: "むらかみはるき",
    components: [{ length: 2, reading: "むらかみ" }, { length: 2, reading: "はるき" }],
    sourceId: "shinchosha-murakami"
  }),
  defineName({
    id: "miyazaki-hayao",
    surfaces: ["宮崎駿", "宮﨑駿"], reading: "みやざきはやお",
    components: [{ length: 2, reading: "みやざき" }, { length: 1, reading: "はやお" }],
    sourceId: "ghibli-miyazaki"
  }),
  defineName({
    id: "ueno-chizuko",
    surfaces: ["上野千鶴子"], reading: "うえのちづこ",
    components: [{ length: 2, reading: "うえの" }, { length: 3, reading: "ちづこ" }],
    sourceId: "utokyo-ueno-2019"
  })
]);

/**
 * Return safe matching units for a public name.
 *
 * Only family-name, given-name, and whole-name ranges are emitted. This lets
 * the DOM matcher rebuild a name split by inline elements (for example
 * `<b>久保</b><span>建英</span>`) without inventing per-kanji readings.
 */
export function getJapanesePublicNameParts(entry, surface) {
  if (!entry?.surfaces?.includes(surface)) {
    return Object.freeze([]);
  }

  const parts = [];
  let start = 0;
  for (let first = 0; first < entry.components.length; first += 1) {
    let length = 0;
    let reading = "";
    for (let last = first; last < entry.components.length; last += 1) {
      length += entry.components[last].length;
      reading += entry.components[last].reading;
      parts.push(Object.freeze({
        surface: surface.slice(start, start + length),
        start,
        reading
      }));
    }
    start += entry.components[first].length;
  }
  return Object.freeze(parts);
}
