import {
  JMDICT_LOANWORD_ORIGINS,
  JMDICT_LOANWORD_ORIGIN_METADATA
} from "./data/loanword-origins-jmdict.mjs";

export { JMDICT_LOANWORD_ORIGIN_METADATA };

// Curated origins for established katakana loanwords.
//
// This catalog is deliberately conservative. It records only words whose
// source language and source form are well established; proper names,
// onomatopoeia, and speculative wasei-eigo expansions do not belong here.
// `language` identifies the immediate donor language normally cited by
// Japanese dictionaries, while `countryMark` uses the conventional Japanese
// one-kanji country abbreviation requested by the UI.

const REVIEWED_AT = "2026-08-22";

export const LOANWORD_LANGUAGE_MARKS = Object.freeze({
  en: null,
  fr: "仏",
  de: "独",
  es: "西",
  it: "伊",
  nl: "蘭",
  pt: "葡",
  ru: "露",
  zh: "中",
  ko: "韓",
  no: "諾",
  fi: "芬",
  tr: "土",
  la: "羅",
  el: "希",
  vi: "越",
  sa: "梵",
  th: "泰",
  hi: "印",
  sv: "瑞",
  mn: "蒙",
  hu: "洪",
  ms: "馬",
  da: "丁",
  cs: "捷"
});

const CURATED_LOANWORD_DEFINITIONS = Object.freeze([
  // English. English origins intentionally have no country mark.
  ["en-account", "en", "account", ["アカウント"]],
  ["en-access", "en", "access", ["アクセス"]],
  ["en-update", "en", "update", ["アップデート"]],
  ["en-algorithm", "en", "algorithm", ["アルゴリズム"]],
  ["en-animation", "en", "animation", ["アニメーション"]],
  ["en-event", "en", "event", ["イベント"]],
  ["en-interview", "en", "interview", ["インタビュー"]],
  ["en-web", "en", "web", ["ウェブ"]],
  ["en-engine", "en", "engine", ["エンジン"]],
  ["en-online", "en", "online", ["オンライン"]],
  ["en-offline", "en", "offline", ["オフライン"]],
  ["en-camera", "en", "camera", ["カメラ"]],
  ["en-cloud", "en", "cloud", ["クラウド"]],
  ["en-click", "en", "click", ["クリック"]],
  ["en-game", "en", "game", ["ゲーム"]],
  ["en-content", "en", "content", ["コンテンツ"]],
  ["en-computer", "en", "computer", ["コンピューター", "コンピュータ"]],
  ["en-server", "en", "server", ["サーバー", "サーバ"]],
  ["en-site", "en", "site", ["サイト"]],
  ["en-system", "en", "system", ["システム"]],
  ["en-sports", "en", "sports", ["スポーツ"]],
  ["en-smartphone", "en", "smartphone", ["スマートフォン"]],
  ["en-security", "en", "security", ["セキュリティ"]],
  ["en-software", "en", "software", ["ソフトウェア"]],
  ["en-download", "en", "download", ["ダウンロード"]],
  ["en-data", "en", "data", ["データ"]],
  ["en-database", "en", "database", ["データベース", "データ・ベース"]],
  ["en-digital", "en", "digital", ["デジタル"]],
  ["en-television", "en", "television", ["テレビ"]],
  ["en-network", "en", "network", ["ネットワーク"]],
  ["en-news", "en", "news", ["ニュース"]],
  ["en-hardware", "en", "hardware", ["ハードウェア"]],
  ["en-file", "en", "file", ["ファイル"]],
  ["en-browser", "en", "browser", ["ブラウザー", "ブラウザ"]],
  ["en-privacy", "en", "privacy", ["プライバシー"]],
  ["en-program", "en", "program", ["プログラム"]],
  ["en-page", "en", "page", ["ページ"]],
  ["en-mail", "en", "mail", ["メール"]],
  ["en-model", "en", "model", ["モデル"]],
  ["en-link", "en", "link", ["リンク"]],
  ["en-login", "en", "login", ["ログイン"]],
  ["en-report", "en", "report", ["レポート"]],
  ["en-hotel", "en", "hotel", ["ホテル"]],
  ["en-taxi", "en", "taxi", ["タクシー"]],
  ["en-bus", "en", "bus", ["バス"]],
  ["en-sandwich", "en", "sandwich", ["サンドイッチ"]],

  // French.
  ["fr-coup-etat", "fr", "coup d'État", ["クーデター"]],
  ["fr-enquete", "fr", "enquête", ["アンケート"]],
  ["fr-atelier", "fr", "atelier", ["アトリエ"]],
  ["fr-a-la-carte", "fr", "à la carte", ["アラカルト", "ア・ラ・カルト"]],
  ["fr-hors-doeuvre", "fr", "hors-d'œuvre", ["オードブル"]],
  ["fr-gourmet", "fr", "gourmet", ["グルメ"]],
  ["fr-concours", "fr", "concours", ["コンクール"]],
  ["fr-conte", "fr", "conte", ["コント"]],
  ["fr-genre", "fr", "genre", ["ジャンル"]],
  ["fr-dessin", "fr", "dessin", ["デッサン"]],
  ["fr-debut", "fr", "début", ["デビュー"]],
  ["fr-ballet", "fr", "ballet", ["バレエ"]],
  ["fr-boutique", "fr", "boutique", ["ブティック"]],
  ["fr-mayonnaise", "fr", "mayonnaise", ["マヨネーズ"]],
  ["fr-reportage", "fr", "reportage", ["ルポルタージュ"]],
  ["fr-silhouette", "fr", "silhouette", ["シルエット"]],
  ["fr-crayon", "fr", "crayon", ["クレヨン"]],
  ["fr-restaurant", "fr", "restaurant", ["レストラン"]],
  ["fr-etiquette", "fr", "étiquette", ["エチケット"]],
  ["fr-cabaret", "fr", "cabaret", ["キャバレー"]],
  ["fr-parfait", "fr", "parfait", ["パフェ"]],
  ["fr-potage", "fr", "potage", ["ポタージュ"]],
  ["fr-croissant", "fr", "croissant", ["クロワッサン"]],
  ["fr-chanson", "fr", "chanson", ["シャンソン"]],

  // German.
  ["de-arbeit", "de", "Arbeit", ["アルバイト"]],
  ["de-allergie", "de", "Allergie", ["アレルギー"]],
  ["de-energie", "de", "Energie", ["エネルギー"]],
  ["de-gips", "de", "Gips", ["ギプス"]],
  ["de-karte", "de", "Karte", ["カルテ"]],
  ["de-neurose", "de", "Neurose", ["ノイローゼ"]],
  ["de-maerchen", "de", "Märchen", ["メルヘン"]],
  ["de-gelaende", "de", "Gelände", ["ゲレンデ"]],
  ["de-rucksack", "de", "Rucksack", ["リュックサック"]],
  ["de-seminar", "de", "Seminar", ["ゼミナール"]],
  ["de-thema", "de", "Thema", ["テーマ"]],
  ["de-vakzin", "de", "Vakzin", ["ワクチン"]],
  ["de-natrium", "de", "Natrium", ["ナトリウム"]],
  ["de-kalium", "de", "Kalium", ["カリウム"]],

  // Spanish.
  ["es-guerrilla", "es", "guerrilla", ["ゲリラ"]],
  ["es-tortilla", "es", "tortilla", ["トルティーヤ"]],
  ["es-salsa", "es", "salsa", ["サルサ"]],
  ["es-paella", "es", "paella", ["パエリア"]],
  ["es-flamenco", "es", "flamenco", ["フラメンコ"]],
  ["es-siesta", "es", "siesta", ["シエスタ"]],
  ["es-macho", "es", "macho", ["マッチョ"]],
  ["es-el-nino", "es", "El Niño", ["エルニーニョ"]],
  ["es-armadillo", "es", "armadillo", ["アルマジロ"]],

  // Italian.
  ["it-opera", "it", "opera", ["オペラ"]],
  ["it-sonata", "it", "sonata", ["ソナタ"]],
  ["it-tempo", "it", "tempo", ["テンポ"]],
  ["it-piano", "it", "piano", ["ピアノ"]],
  ["it-forte", "it", "forte", ["フォルテ"]],
  ["it-soprano", "it", "soprano", ["ソプラノ"]],
  ["it-aria", "it", "aria", ["アリア"]],
  ["it-ballerina", "it", "ballerina", ["バレリーナ"]],
  ["it-carpaccio", "it", "carpaccio", ["カルパッチョ"]],
  ["it-tiramisu", "it", "tiramisù", ["ティラミス"]],
  ["it-pasta", "it", "pasta", ["パスタ"]],
  ["it-pizza", "it", "pizza", ["ピザ"]],
  ["it-risotto", "it", "risotto", ["リゾット"]],
  ["it-gelato", "it", "gelato", ["ジェラート"]],
  ["it-espresso", "it", "espresso", ["エスプレッソ"]],
  ["it-cappuccino", "it", "cappuccino", ["カプチーノ"]],

  // Dutch (historical direct loans into Japanese).
  ["nl-glas", "nl", "glas", ["ガラス"]],
  ["nl-koffie", "nl", "koffie", ["コーヒー"]],
  ["nl-bier", "nl", "bier", ["ビール"]],
  ["nl-ransel", "nl", "ransel", ["ランドセル"]],
  ["nl-gom", "nl", "gom", ["ゴム"]],
  ["nl-blik", "nl", "blik", ["ブリキ"]],
  ["nl-pincet", "nl", "pincet", ["ピンセット"]],
  ["nl-mes", "nl", "mes", ["メス"]],
  ["nl-orgel", "nl", "orgel", ["オルゴール"]],
  ["nl-lens", "nl", "lens", ["レンズ"]],

  // Portuguese (historical direct loans into Japanese).
  ["pt-pao", "pt", "pão", ["パン"]],
  ["pt-botao", "pt", "botão", ["ボタン"]],
  ["pt-capa", "pt", "capa", ["カッパ"]],
  ["pt-sabao", "pt", "sabão", ["シャボン"]],
  ["pt-vidro", "pt", "vidro", ["ビードロ"]],
  ["pt-confeito", "pt", "confeito", ["コンペイトウ", "コンペイトー"]],
  ["pt-tabaco", "pt", "tabaco", ["タバコ"]],
  ["pt-jorro", "pt", "jorro", ["ジョウロ"]],
  ["pt-carta", "pt", "carta", ["カルタ"]],
  ["pt-cristao", "pt", "cristão", ["キリシタン"]],

  // Russian.
  ["ru-ikra", "ru", "икра", ["イクラ"]],
  ["ru-norma", "ru", "норма", ["ノルマ"]],
  ["ru-kombinat", "ru", "комбинат", ["コンビナート"]],
  ["ru-troika", "ru", "тройка", ["トロイカ"]],
  ["ru-pechka", "ru", "печка", ["ペチカ"]],
  ["ru-pirozhki", "ru", "пирожки", ["ピロシキ"]],
  ["ru-borshch", "ru", "борщ", ["ボルシチ"]],
  ["ru-vodka", "ru", "водка", ["ウォッカ"]],

  // Other high-confidence direct loans.
  ["zh-jiaozi", "zh", "餃子", ["ギョーザ", "ギョウザ"]],
  ["zh-shaomai", "zh", "燒賣", ["シューマイ"]],
  ["zh-chaofan", "zh", "炒飯", ["チャーハン"]],
  ["zh-majiang", "zh", "麻將", ["マージャン"]],
  ["zh-wulong", "zh", "烏龍", ["ウーロン"]],
  ["ko-gimchi", "ko", "김치", ["キムチ"]],
  ["ko-bibimbap", "ko", "비빔밥", ["ビビンバ", "ピビンパ"]],
  ["ko-namul", "ko", "나물", ["ナムル"]],
  ["ko-makgeolli", "ko", "막걸리", ["マッコリ"]],
  ["ko-jjigae", "ko", "찌개", ["チゲ"]],
  ["ko-tteokbokki", "ko", "떡볶이", ["トッポッキ"]],
  ["no-ski", "no", "ski", ["スキー"]],
  ["fi-sauna", "fi", "sauna", ["サウナ"]],
  ["tr-yogurt", "tr", "yoğurt", ["ヨーグルト"]]
]);

const JMDICT_LANGUAGE_CODES = Object.freeze({
  eng: "en",
  fre: "fr",
  ger: "de",
  spa: "es",
  ita: "it",
  dut: "nl",
  por: "pt",
  rus: "ru",
  chi: "zh",
  kor: "ko",
  nor: "no",
  fin: "fi",
  tur: "tr",
  lat: "la",
  gre: "el",
  vie: "vi",
  san: "sa",
  tha: "th",
  hin: "hi",
  swe: "sv",
  mon: "mn",
  hun: "hu",
  may: "ms",
  dan: "da",
  cze: "cs"
});

const CURATED_SURFACES = new Set(
  CURATED_LOANWORD_DEFINITIONS.flatMap(([, , , surfaces]) => surfaces)
);

// JMdict supplies the broad, pinned dictionary layer. Curated entries win on
// duplicate spellings so reviewed modern forms and donor languages remain
// stable across future dictionary regeneration.
const GENERATED_LOANWORD_DEFINITIONS = JMDICT_LOANWORD_ORIGINS
  .filter(([surface]) => !CURATED_SURFACES.has(surface))
  .map(([surface, rawLanguage, origin], index) => {
    const language = JMDICT_LANGUAGE_CODES[rawLanguage];
    if (!language) {
      throw new Error(`Unknown JMdict loanword language: ${rawLanguage}`);
    }
    return Object.freeze([
      `jmdict-${rawLanguage}-${String(index).padStart(4, "0")}`,
      language,
      origin,
      Object.freeze([surface])
    ]);
  });

function defineLoanword([id, language, origin, rawSurfaces], source = "curated") {
  const countryMark = LOANWORD_LANGUAGE_MARKS[language];
  if (countryMark === undefined) {
    throw new Error(`Unknown loanword language: ${language}`);
  }
  const surfaces = Object.freeze([...rawSurfaces]);
  return Object.freeze({
    id,
    languageCode: language,
    languageLabel: countryMark,
    language,
    countryMark,
    origin,
    surfaces,
    confidence: source === "curated" ? "high" : "dictionary",
    reviewedAt: source === "curated"
      ? REVIEWED_AT
      : JMDICT_LOANWORD_ORIGIN_METADATA.dictionaryDate,
    source
  });
}

export const LOANWORD_ORIGINS = Object.freeze(
  [
    ...CURATED_LOANWORD_DEFINITIONS.map((definition) => defineLoanword(definition)),
    ...GENERATED_LOANWORD_DEFINITIONS.map((definition) => defineLoanword(definition, "jmdict"))
  ]
);

const SURFACE_INDEX = new Map();
for (const entry of LOANWORD_ORIGINS) {
  for (const surface of entry.surfaces) {
    if (SURFACE_INDEX.has(surface)) {
      throw new Error(`Duplicate loanword surface: ${surface}`);
    }
    SURFACE_INDEX.set(surface, entry);
  }
}

const MATCH_CANDIDATES_BY_FIRST_CHARACTER = new Map();
for (const [surface, entry] of SURFACE_INDEX) {
  const firstCharacter = surface[0];
  const candidates = MATCH_CANDIDATES_BY_FIRST_CHARACTER.get(firstCharacter) ?? [];
  candidates.push(Object.freeze({ surface, entry }));
  MATCH_CANDIDATES_BY_FIRST_CHARACTER.set(firstCharacter, candidates);
}
for (const [firstCharacter, candidates] of MATCH_CANDIDATES_BY_FIRST_CHARACTER) {
  candidates.sort((left, right) =>
    right.surface.length - left.surface.length || left.surface.localeCompare(right.surface, "ja")
  );
  MATCH_CANDIDATES_BY_FIRST_CHARACTER.set(firstCharacter, Object.freeze(candidates));
}

// The middle dot is punctuation and therefore a safe separator between two
// independently annotatable katakana words. It remains allowed *inside* an
// explicitly cataloged surface such as ア・ラ・カルト.
const KATAKANA_WORD_CHARACTER = /^[\p{Script=Katakana}ーｰ]$/u;

function isKatakanaWordCharacter(character) {
  return Boolean(character) && KATAKANA_WORD_CHARACTER.test(character);
}

function hasSafeKatakanaBoundaries(text, start, end) {
  return !isKatakanaWordCharacter(text[start - 1]) &&
    !isKatakanaWordCharacter(text[end]);
}

const AMBIGUOUS_PERSON_NAME_SURFACES = new Set(["トランプ"]);
const PERSON_TITLE_AFTER = /^(?:氏|さん|大統領|前大統領|元大統領|首相|会長|選手|監督|容疑者|被告|議員)/u;

function looksLikePersonNameContext(text, surface, end) {
  return AMBIGUOUS_PERSON_NAME_SURFACES.has(surface) && PERSON_TITLE_AFTER.test(text.slice(end));
}

function findCompleteCompoundPath(text, runStart, runEnd) {
  const paths = new Map([[runEnd, Object.freeze([])]]);
  for (let position = runEnd - 1; position >= runStart; position -= 1) {
    const candidates = MATCH_CANDIDATES_BY_FIRST_CHARACTER.get(text[position]) ?? [];
    let bestPath = null;
    for (const candidate of candidates) {
      const end = position + candidate.surface.length;
      const suffix = paths.get(end);
      if (
        end > runEnd
        || !suffix
        || !text.startsWith(candidate.surface, position)
        || looksLikePersonNameContext(text, candidate.surface, end)
      ) {
        continue;
      }
      const path = Object.freeze([candidate, ...suffix]);
      if (!bestPath || path.length < bestPath.length) {
        bestPath = path;
      }
    }
    if (bestPath) {
      paths.set(position, bestPath);
    }
  }
  const path = paths.get(runStart);
  return path?.length >= 2 ? path : null;
}

function createMatch(text, start, surface, entry) {
  const end = start + surface.length;
  const annotation = formatLoanwordAnnotation(entry);
  return Object.freeze({
    id: entry.id,
    start,
    end,
    surface: text.slice(start, end),
    origin: entry.origin,
    languageCode: entry.languageCode,
    languageLabel: entry.languageLabel,
    display: annotation,
    // Backward-compatible aliases make the matcher easy to consume from
    // older content-controller prototypes.
    language: entry.language,
    countryMark: entry.countryMark,
    annotation
  });
}

export function formatLoanwordAnnotation(entry) {
  if (!entry || typeof entry.origin !== "string") {
    throw new TypeError("A loanword-origin entry is required");
  }
  return entry.countryMark ? `（${entry.countryMark}）${entry.origin}` : entry.origin;
}

export function getLoanwordOrigin(surface) {
  return typeof surface === "string" ? SURFACE_INDEX.get(surface) ?? null : null;
}

// Returns longest-first-at-each-position, non-overlapping matches. Offsets are
// UTF-16 string offsets, matching DOM Text node and Range APIs.
export function findLoanwordMatches(text) {
  if (typeof text !== "string") {
    throw new TypeError("Loanword matching requires a string");
  }

  const matches = [];
  let start = 0;
  while (start < text.length) {
    const candidates = MATCH_CANDIDATES_BY_FIRST_CHARACTER.get(text[start]) ?? [];
    const candidate = candidates.find(({ surface }) => {
      const end = start + surface.length;
      return text.startsWith(surface, start)
        && hasSafeKatakanaBoundaries(text, start, end)
        && !looksLikePersonNameContext(text, surface, end);
    });

    if (!candidate && isKatakanaWordCharacter(text[start]) && !isKatakanaWordCharacter(text[start - 1])) {
      let runEnd = start + 1;
      while (runEnd < text.length && isKatakanaWordCharacter(text[runEnd])) {
        runEnd += 1;
      }
      const compoundPath = findCompleteCompoundPath(text, start, runEnd);
      if (compoundPath) {
        let partStart = start;
        for (const part of compoundPath) {
          matches.push(createMatch(text, partStart, part.surface, part.entry));
          partStart += part.surface.length;
        }
      }
      start = runEnd;
      continue;
    }

    if (!candidate) {
      const codePoint = text.codePointAt(start);
      start += codePoint > 0xFFFF ? 2 : 1;
      continue;
    }

    const { surface, entry } = candidate;
    const end = start + surface.length;
    matches.push(createMatch(text, start, surface, entry));
    start = end;
  }

  return Object.freeze(matches);
}
