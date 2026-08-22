// Curated foreign proper names are intentionally kept separate from lexical
// loanwords. `countryMark` identifies the person's country affiliation or the
// place's country; it does not describe a donor language.

const VERIFIED_AT = "2026-08-22";

function freezeSource([id, title, url]) {
  return Object.freeze({ id, title, url });
}

export const PROPER_NAME_SOURCES = Object.freeze(Object.fromEntries([
  ["mofa-heads-2026", "外務省：各国の元首名等一覧表", "https://www.mofa.go.jp/mofaj/ms/po/page22_001297.html"],
  ["mofa-kyiv-2022", "外務省：ウクライナの首都等の呼称の変更", "https://www.mofa.go.jp/mofaj/press/release/press1_000813.html"],
  ["govuk-thatcher", "GOV.UK: History of Baroness Thatcher", "https://www.gov.uk/government/history/past-prime-ministers/margaret-thatcher"],
  ["taylor-swift-official", "Taylor Swift official website", "https://www.taylorswift.com/"],
  ["beyonce-official", "Beyoncé official website", "https://www.beyonce.com/"],
  ["tesla-elon-musk", "Tesla: Elon Musk", "https://www.tesla.com/elon-musk"],
  ["inter-miami-messi", "Inter Miami CF: Lionel Messi", "https://www.intermiamicf.com/players/lionel-messi/"],
  ["uefa-ronaldo", "UEFA: Cristiano Ronaldo", "https://www.uefa.com/european-qualifiers/teams/players/63706--cristiano-ronaldo/"],
  ["real-madrid-mbappe", "Real Madrid: Kylian Mbappé", "https://www.realmadrid.com/en-US/football/first-team/players/kylian-mbappe"],
  ["nyc-official", "The City of New York", "https://www.nyc.gov/"],
  ["london-official", "Mayor of London", "https://www.london.gov.uk/"],
  ["paris-official", "Ville de Paris", "https://www.paris.fr/"],
  ["berlin-official", "Berlin.de", "https://www.berlin.de/"],
  ["rome-official", "Roma Capitale", "https://www.comune.roma.it/"],
  ["madrid-official", "Ayuntamiento de Madrid", "https://www.madrid.es/"],
  ["moscow-official", "Official website of the Mayor of Moscow", "https://www.mos.ru/"],
  ["kyiv-official", "Kyiv City Council", "https://kyivcity.gov.ua/"],
  ["seoul-official", "Seoul Metropolitan Government", "https://www.seoul.go.kr/"],
  ["hanoi-official", "Hanoi Portal", "https://hanoi.gov.vn/"],
  ["vienna-official", "City of Vienna", "https://www.wien.gv.at/"],
  ["munich-official", "City of Munich", "https://stadt.muenchen.de/"],
].map((definition) => {
  const source = freezeSource(definition);
  return [source.id, source];
})));

const DEFINITIONS = Object.freeze([
  // Current and historical political figures. Full names are exact; the
  // surname or commonly used single-name form requires nearby person, office,
  // or country context.
  {
    id: "person-donald-trump", entityKind: "person", countryMark: "米",
    origin: "Donald J. Trump", sourceIds: ["mofa-heads-2026"],
    exact: ["ドナルド・J・トランプ", "ドナルド・Ｊ・トランプ", "ドナルド・トランプ"],
    contextual: ["トランプ"], contextHints: ["米国", "アメリカ", "ホワイトハウス", "共和党"]
  },
  {
    id: "person-emmanuel-macron", entityKind: "person", countryMark: "仏",
    origin: "Emmanuel Macron", sourceIds: ["mofa-heads-2026"],
    exact: ["エマニュエル・マクロン"], contextual: ["マクロン"],
    contextHints: ["フランス", "仏国", "エリゼ宮"]
  },
  {
    id: "person-friedrich-merz", entityKind: "person", countryMark: "独",
    origin: "Friedrich Merz", sourceIds: ["mofa-heads-2026"],
    exact: ["フリードリヒ・メルツ"], contextual: ["メルツ"],
    contextHints: ["ドイツ", "独国", "キリスト教民主同盟", "CDU"]
  },
  {
    id: "person-keir-starmer", entityKind: "person", countryMark: "英",
    origin: "Keir Starmer", sourceIds: ["mofa-heads-2026"],
    exact: ["キア・スターマー"], contextual: ["スターマー"],
    contextHints: ["英国", "イギリス", "労働党", "ダウニング街"]
  },
  {
    id: "person-vladimir-putin", entityKind: "person", countryMark: "露",
    origin: "Владимир Путин", sourceIds: ["mofa-heads-2026"],
    exact: ["ウラジーミル・ウラジーミロヴィチ・プーチン", "ウラジーミル・プーチン"], contextual: ["プーチン"],
    contextHints: ["ロシア", "露国", "クレムリン"],
    surfaceOrigins: {
      "ウラジーミル・ウラジーミロヴィチ・プーチン": "Владимир Владимирович Путин"
    }
  },
  {
    id: "person-volodymyr-zelenskyy", entityKind: "person", countryMark: "宇",
    origin: "Володимир Зеленський", sourceIds: ["mofa-heads-2026"],
    exact: ["ヴォロディーミル・ゼレンスキー", "ヴォロディミル・ゼレンスキー", "ウォロディミル・ゼレンスキー"],
    contextual: ["ゼレンスキー"], contextHints: ["ウクライナ", "宇国", "キーウ"]
  },
  {
    id: "person-narendra-modi", entityKind: "person", countryMark: "印",
    origin: "Narendra Modi", sourceIds: ["mofa-heads-2026"],
    exact: ["ナレンドラ・モディ"], contextual: ["モディ"],
    contextHints: ["インド", "印国", "インド人民党", "BJP"]
  },
  {
    id: "person-luiz-inacio-lula-da-silva", entityKind: "person", countryMark: "伯",
    origin: "Luiz Inácio Lula da Silva", sourceIds: ["mofa-heads-2026"],
    exact: ["ルイス・イナシオ・ルーラ・ダ・シルヴァ", "ルイス・イナシオ・ルーラ・ダ・シルバ", "ルイス・イナシオ・ルーラ・ダシルバ"],
    contextual: ["ルーラ"], contextHints: ["ブラジル", "伯国", "労働者党"]
  },
  {
    id: "person-giorgia-meloni", entityKind: "person", countryMark: "伊",
    origin: "Giorgia Meloni", sourceIds: ["mofa-heads-2026"],
    exact: ["ジョルジャ・メローニ"], contextual: ["メローニ"],
    contextHints: ["イタリア", "伊国", "イタリアの同胞"]
  },
  {
    id: "person-margaret-thatcher", entityKind: "person", countryMark: "英",
    origin: "Margaret Thatcher", sourceIds: ["govuk-thatcher"],
    exact: ["マーガレット・サッチャー"], contextual: ["サッチャー"],
    contextHints: ["英国", "イギリス", "保守党", "鉄の女"]
  },

  // Public figures in music, business, and sport.
  {
    id: "person-taylor-swift", entityKind: "person", countryMark: "米",
    origin: "Taylor Swift", sourceIds: ["taylor-swift-official"],
    exact: ["テイラー・スウィフト"], contextual: ["スウィフト"],
    contextHints: ["米国", "アメリカ", "グラミー"]
  },
  {
    id: "person-beyonce", entityKind: "person", countryMark: "米",
    origin: "Beyoncé", sourceIds: ["beyonce-official"],
    exact: ["ビヨンセ"], contextual: [], contextHints: []
  },
  {
    id: "person-elon-musk", entityKind: "person", countryMark: "米",
    origin: "Elon Musk", sourceIds: ["tesla-elon-musk"],
    exact: ["イーロン・マスク"], contextual: ["マスク"],
    contextHints: ["テスラ", "スペースX", "SpaceX", "米国", "アメリカ"]
  },
  {
    id: "person-lionel-messi", entityKind: "person", countryMark: "亜",
    origin: "Lionel Messi", sourceIds: ["inter-miami-messi"],
    exact: ["リオネル・メッシ"], contextual: ["メッシ"],
    contextHints: ["アルゼンチン", "亜国", "インテル・マイアミ"]
  },
  {
    id: "person-cristiano-ronaldo", entityKind: "person", countryMark: "葡",
    origin: "Cristiano Ronaldo", sourceIds: ["uefa-ronaldo"],
    exact: ["クリスティアーノ・ロナウド"], contextual: ["ロナウド"],
    contextHints: ["ポルトガル", "葡国", "アルナスル"]
  },
  {
    id: "person-kylian-mbappe", entityKind: "person", countryMark: "仏",
    origin: "Kylian Mbappé", sourceIds: ["real-madrid-mbappe"],
    exact: ["キリアン・エムバペ", "キリアン・エムバッペ"],
    contextual: ["エムバペ", "エムバッペ"],
    contextHints: ["フランス", "仏国", "レアル・マドリード"]
  },

  // High-confidence city names use the city's local/official form.
  { id: "place-new-york", entityKind: "place", countryMark: "米", origin: "New York", sourceIds: ["nyc-official"], exact: ["ニューヨーク"], contextual: [], contextHints: [] },
  { id: "place-london", entityKind: "place", countryMark: "英", origin: "London", sourceIds: ["london-official"], exact: ["ロンドン"], contextual: [], contextHints: [] },
  { id: "place-paris", entityKind: "place", countryMark: "仏", origin: "Paris", sourceIds: ["paris-official"], exact: ["パリ"], contextual: [], contextHints: [] },
  { id: "place-berlin", entityKind: "place", countryMark: "独", origin: "Berlin", sourceIds: ["berlin-official"], exact: ["ベルリン"], contextual: [], contextHints: [] },
  { id: "place-rome", entityKind: "place", countryMark: "伊", origin: "Roma", sourceIds: ["rome-official"], exact: ["ローマ"], contextual: [], contextHints: [] },
  { id: "place-madrid", entityKind: "place", countryMark: "西", origin: "Madrid", sourceIds: ["madrid-official"], exact: ["マドリード"], contextual: [], contextHints: [] },
  { id: "place-moscow", entityKind: "place", countryMark: "露", origin: "Москва", sourceIds: ["moscow-official"], exact: ["モスクワ"], contextual: [], contextHints: [] },
  { id: "place-kyiv", entityKind: "place", countryMark: "宇", origin: "Київ", sourceIds: ["mofa-kyiv-2022", "kyiv-official"], exact: ["キーウ"], contextual: [], contextHints: [] },
  { id: "place-seoul", entityKind: "place", countryMark: "韓", origin: "서울", sourceIds: ["seoul-official"], exact: ["ソウル"], contextual: [], contextHints: [] },
  { id: "place-hanoi", entityKind: "place", countryMark: "越", origin: "Hà Nội", sourceIds: ["hanoi-official"], exact: ["ハノイ"], contextual: [], contextHints: [] },
  { id: "place-vienna", entityKind: "place", countryMark: "墺", origin: "Wien", sourceIds: ["vienna-official"], exact: ["ウィーン"], contextual: [], contextHints: [] },
  { id: "place-munich", entityKind: "place", countryMark: "独", origin: "München", sourceIds: ["munich-official"], exact: ["ミュンヘン"], contextual: [], contextHints: [] }
]);

const CONTEXTUAL_BLOCKERS = Object.freeze({
  // Country context alone is not enough when the following grammar clearly
  // denotes playing cards rather than the person. Keep the list verb-focused
  // so genuine phrases such as トランプを支持する remain eligible.
  "トランプ": /^[\s\u3000」』）)、,:：]*(?:カード|ゲーム|占い|の[\s\u3000]*(?:カード|ゲーム|札|絵柄|ルール|遊び方)|を[\s\u3000]*(?:楽し|遊|切|配|引|シャッフル)|で[\s\u3000]*(?:遊|勝負)|が[\s\u3000]*(?:配ら|配布))/u,
  // Likewise, block the common object constructions around a face mask even
  // on US/Tesla pages, while allowing マスク氏・マスクCEO and person verbs.
  "マスク": /^[\s\u3000」』）)、,:：]*(?:着用|装着|着脱|必須|不要|不足|生活|販売|需要|供給|市場|規制|義務|の[\s\u3000]*(?:着用|装着|着脱|使用|不足|着け方|販売|需要|供給|規制|義務)|を[\s\u3000]*(?:着用|装着|着脱|着け|付け|外し|する|した|して|しない|します)|が[\s\u3000]*(?:必要|必須|不足|品薄)|で[\s\u3000]*(?:感染|予防|防止))/u,
  "ローマ": /^字/u,
  "ソウル": /^(?:・?ミュージック|・?フード|・?シンガー)/u
});

function freezeDefinition(rawDefinition) {
  const exact = Object.freeze([...rawDefinition.exact]);
  const contextual = Object.freeze([...rawDefinition.contextual]);
  const surfaces = Object.freeze([...exact, ...contextual]);
  const sourceIds = Object.freeze([...rawDefinition.sourceIds]);
  const contextHints = Object.freeze([...rawDefinition.contextHints]);
  const surfaceOrigins = Object.freeze({ ...(rawDefinition.surfaceOrigins ?? {}) });
  for (const surface of Object.keys(surfaceOrigins)) {
    if (!surfaces.includes(surface)) {
      throw new Error(`Unknown proper-name origin-override surface: ${surface}`);
    }
  }
  for (const sourceId of sourceIds) {
    if (!PROPER_NAME_SOURCES[sourceId]) {
      throw new Error(`Unknown proper-name source: ${sourceId}`);
    }
  }
  return Object.freeze({
    id: rawDefinition.id,
    entityKind: rawDefinition.entityKind,
    countryMark: rawDefinition.countryMark,
    origin: rawDefinition.origin,
    surfaces,
    exactSurfaces: exact,
    contextualSurfaces: contextual,
    contextHints,
    surfaceOrigins,
    source: sourceIds[0],
    sourceIds,
    verifiedAt: VERIFIED_AT
  });
}

export const PROPER_NAME_ORIGINS = Object.freeze(DEFINITIONS.map(freezeDefinition));

const SURFACE_INDEX = new Map();
const CANDIDATES_BY_FIRST_CHARACTER = new Map();
for (const entry of PROPER_NAME_ORIGINS) {
  for (const surface of entry.surfaces) {
    if (SURFACE_INDEX.has(surface)) {
      throw new Error(`Duplicate proper-name surface: ${surface}`);
    }
    const contextual = entry.contextualSurfaces.includes(surface);
    const surfaceOrigin = entry.surfaceOrigins[surface] ?? entry.origin;
    const resolvedEntry = surfaceOrigin === entry.origin
      ? entry
      : Object.freeze({ ...entry, origin: surfaceOrigin, matchedSurface: surface });
    const candidate = Object.freeze({ surface, entry: resolvedEntry, contextual });
    SURFACE_INDEX.set(surface, resolvedEntry);
    const candidates = CANDIDATES_BY_FIRST_CHARACTER.get(surface[0]) ?? [];
    candidates.push(candidate);
    CANDIDATES_BY_FIRST_CHARACTER.set(surface[0], candidates);
  }
}
for (const [firstCharacter, candidates] of CANDIDATES_BY_FIRST_CHARACTER) {
  candidates.sort((left, right) =>
    right.surface.length - left.surface.length || left.surface.localeCompare(right.surface, "ja")
  );
  CANDIDATES_BY_FIRST_CHARACTER.set(firstCharacter, Object.freeze(candidates));
}

const KATAKANA_NAME_CHARACTER = /^[\p{Script=Katakana}ーｰ・]$/u;
const PERSON_ROLE_BEFORE = /(?:大統領|首相|元大統領|前大統領|元首相|前首相|歌手|俳優|女優|実業家|起業家|選手|監督|CEO|最高経営責任者|アーティスト)(?:の|、|\s)*$/u;
const PERSON_ROLE_AFTER = /^(?:氏|さん|大統領|首相|元大統領|前大統領|元首相|前首相|政権|政府|陣営|候補|閣下|歌手|俳優|女優|実業家|起業家|選手|監督|CEO|最高経営責任者|アーティスト)/u;

function isKatakanaNameCharacter(character) {
  return Boolean(character) && KATAKANA_NAME_CHARACTER.test(character);
}

function hasSafeBoundaries(text, start, end) {
  return !isKatakanaNameCharacter(text[start - 1]) && !isKatakanaNameCharacter(text[end]);
}

function isBlockedUse(text, surface, end, context) {
  const blocker = CONTEXTUAL_BLOCKERS[surface];
  if (!blocker) {
    return false;
  }
  const suffix = typeof context.suffix === "string" ? context.suffix : "";
  return blocker.test(`${text.slice(end)}${suffix}`);
}

function hasPersonContext(text, start, end, entry, context) {
  if (
    context.entityKind === "person"
    || context.personContext === true
    || context.roleContext === true
    || context.countryMark === entry.countryMark
  ) {
    return true;
  }

  const prefix = typeof context.prefix === "string" ? context.prefix : "";
  const suffix = typeof context.suffix === "string" ? context.suffix : "";
  const before = `${prefix}${text.slice(0, start)}`.slice(-24);
  const after = `${text.slice(end)}${suffix}`.slice(0, 24);
  if (PERSON_ROLE_BEFORE.test(before) || PERSON_ROLE_AFTER.test(after)) {
    return true;
  }

  const nearby = `${before}${after}`;
  return entry.contextHints.some((hint) => nearby.includes(hint));
}

function canMatchCandidate(text, start, candidate, context) {
  const end = start + candidate.surface.length;
  if (!text.startsWith(candidate.surface, start) || !hasSafeBoundaries(text, start, end)) {
    return false;
  }
  if (isBlockedUse(text, candidate.surface, end, context)) {
    return false;
  }
  return !candidate.contextual || hasPersonContext(text, start, end, candidate.entry, context);
}

export function formatProperNameAnnotation(entry) {
  if (!entry || typeof entry.origin !== "string" || typeof entry.countryMark !== "string") {
    throw new TypeError("A proper-name origin entry is required");
  }
  return `（${entry.countryMark}）${entry.origin}`;
}

export function getProperNameOrigin(surface) {
  return typeof surface === "string" ? SURFACE_INDEX.get(surface) ?? null : null;
}

function createMatch(text, start, surface, entry) {
  const end = start + surface.length;
  const annotation = formatProperNameAnnotation(entry);
  return Object.freeze({
    id: entry.id,
    start,
    end,
    surface: text.slice(start, end),
    origin: entry.origin,
    annotation,
    display: annotation,
    countryMark: entry.countryMark,
    entityKind: entry.entityKind,
    sourceIds: entry.sourceIds,
    verifiedAt: entry.verifiedAt
  });
}

// Returns longest-first-at-each-position, non-overlapping matches. Offsets are
// UTF-16 string offsets, matching DOM Text and Range APIs. `prefix` and
// `suffix` allow callers to carry context across adjacent DOM text nodes.
export function findProperNameMatches(text, context = {}) {
  if (typeof text !== "string") {
    throw new TypeError("Proper-name matching requires a string");
  }
  if (!context || typeof context !== "object") {
    throw new TypeError("Proper-name matching context must be an object");
  }

  const matches = [];
  let start = 0;
  while (start < text.length) {
    const candidates = CANDIDATES_BY_FIRST_CHARACTER.get(text[start]) ?? [];
    const candidate = candidates.find((item) => canMatchCandidate(text, start, item, context));
    if (!candidate) {
      const codePoint = text.codePointAt(start);
      start += codePoint > 0xFFFF ? 2 : 1;
      continue;
    }

    matches.push(createMatch(text, start, candidate.surface, candidate.entry));
    start += candidate.surface.length;
  }
  return Object.freeze(matches);
}
