import {
  JAPANESE_PUBLIC_NAMES,
  JAPANESE_PUBLIC_NAME_SOURCES,
  getJapanesePublicNameParts
} from "./japanese-public-name-readings.mjs";

const VERIFIED_AT = "2026-08-22";

export { JAPANESE_PUBLIC_NAMES, JAPANESE_PUBLIC_NAME_SOURCES };

export const PERSON_NAME_SOURCES = Object.freeze({
  "mofa-heads-2026-08-20": Object.freeze({
    url: "https://www.mofa.go.jp/mofaj/ms/po/page22_001297.html",
    note: "Japanese Ministry of Foreign Affairs list of current heads of state and ministers"
  }),
  "mofa-north-korea-2022-04-21": Object.freeze({
    url: "https://www.mofa.go.jp/mofaj/area/n_korea/data.html",
    note: "Japanese Ministry of Foreign Affairs North Korea country data"
  }),
  "mofa-vietnam-country-data": Object.freeze({
    url: "https://www.mofa.go.jp/mofaj/area/vietnam/data.html",
    note: "Japanese Ministry of Foreign Affairs Vietnam country data and official katakana spellings"
  }),
  "mofa-korea-official-pages": Object.freeze({
    url: "https://www.mofa.go.jp/mofaj/a_o/na/kr/pageit_000001_02236.html",
    note: "Japanese Ministry of Foreign Affairs Korean leader spellings"
  })
});

export const PERSON_COUNTRY_HINTS = Object.freeze({
  china: Object.freeze(["中国", "中華人民共和国", "中国共産党", "北京"]),
  korea: Object.freeze(["韓国", "大韓民国", "ソウル"]),
  northKorea: Object.freeze(["北朝鮮", "朝鮮民主主義人民共和国", "朝鮮労働党", "平壌"]),
  vietnam: Object.freeze([
    "ベトナム社会主義共和国", "ベトナム共産党", "ベトナム", "越南", "ハノイ"
  ])
});

export const PERSON_ROLE_HINTS = Object.freeze([
  "氏", "さん", "大統領", "国家主席", "主席", "首相", "総理", "外相", "外務大臣",
  "外交部長", "総書記", "書記長", "国務委員長", "最高指導者", "副首相", "長官",
  "元書記長", "元国家主席", "元大統領", "元首相", "前大統領", "前首相", "前主席", "前外相",
  "議長", "議員", "候補", "代表", "会長", "監督", "選手", "棋士", "教授", "博士", "政権"
]);

function defineName(definition) {
  const {
    surfaces,
    components: rawComponents,
    blockedSuffixes = [],
    roleHints = [],
    ...metadata
  } = definition;
  const components = rawComponents.map((component) => Object.freeze({ ...component }));
  const componentReading = components.map((component) => component.reading).join("");
  if (componentReading !== definition.reading) {
    throw new Error(`Foreign person name components do not reconstruct ${definition.id}`);
  }
  return Object.freeze({
    verifiedAt: VERIFIED_AT,
    confidence: "unique",
    ...metadata,
    surfaces: Object.freeze([...surfaces]),
    components: Object.freeze(components),
    blockedSuffixes: Object.freeze([...blockedSuffixes]),
    roleHints: Object.freeze([...roleHints])
  });
}

export const FOREIGN_PERSON_NAMES = Object.freeze([
  defineName({
    id: "xi-jinping", country: "china", locale: "zh-CN",
    surfaces: ["習近平", "习近平"], reading: "シージンピン",
    components: [{ length: 1, reading: "シー" }, { length: 1, reading: "ジン" }, { length: 1, reading: "ピン" }],
    sourceId: "mofa-heads-2026-08-20"
  }),
  defineName({
    id: "li-qiang", country: "china", locale: "zh-CN", confidence: "contextual",
    surfaces: ["李強", "李强"], reading: "リー・チアン",
    components: [{ length: 1, reading: "リー・" }, { length: 1, reading: "チアン" }],
    roleHints: ["首相", "総理", "国務院総理"], sourceId: "mofa-heads-2026-08-20"
  }),
  defineName({
    id: "wang-yi", country: "china", locale: "zh-CN", confidence: "contextual",
    surfaces: ["王毅"], reading: "ワン・イー",
    components: [{ length: 1, reading: "ワン・" }, { length: 1, reading: "イー" }],
    roleHints: ["外相", "外務大臣", "外交部長", "政治局員"], sourceId: "mofa-heads-2026-08-20"
  }),

  defineName({
    id: "kim-jong-un", country: "northKorea", locale: "ko-KP",
    surfaces: ["金正恩"], reading: "キム・ジョンウン",
    components: [{ length: 1, reading: "キム・" }, { length: 1, reading: "ジョン" }, { length: 1, reading: "ウン" }],
    sourceId: "mofa-north-korea-2022-04-21"
  }),
  defineName({
    id: "kim-yo-jong", country: "northKorea", locale: "ko-KP",
    surfaces: ["金与正", "金與正"], reading: "キム・ヨジョン",
    components: [{ length: 1, reading: "キム・" }, { length: 1, reading: "ヨ" }, { length: 1, reading: "ジョン" }],
    sourceId: "mofa-north-korea-2022-04-21"
  }),
  defineName({
    id: "kim-il-sung", country: "northKorea", locale: "ko-KP",
    surfaces: ["金日成"], reading: "キム・イルソン",
    components: [{ length: 1, reading: "キム・" }, { length: 1, reading: "イル" }, { length: 1, reading: "ソン" }],
    sourceId: "mofa-north-korea-2022-04-21"
  }),
  defineName({
    id: "kim-jong-il", country: "northKorea", locale: "ko-KP",
    surfaces: ["金正日"], reading: "キム・ジョンイル",
    components: [{ length: 1, reading: "キム・" }, { length: 1, reading: "ジョン" }, { length: 1, reading: "イル" }],
    sourceId: "mofa-north-korea-2022-04-21"
  }),
  defineName({
    id: "choe-ryong-hae", country: "northKorea", locale: "ko-KP",
    surfaces: ["崔竜海", "崔龍海"], reading: "チェ・リョンヘ",
    components: [{ length: 1, reading: "チェ・" }, { length: 1, reading: "リョン" }, { length: 1, reading: "ヘ" }],
    sourceId: "mofa-north-korea-2022-04-21"
  }),
  defineName({
    id: "jo-yong-won", country: "northKorea", locale: "ko-KP",
    surfaces: ["趙甬元"], reading: "チョ・ヨンウォン",
    components: [{ length: 1, reading: "チョ・" }, { length: 1, reading: "ヨン" }, { length: 1, reading: "ウォン" }],
    sourceId: "mofa-north-korea-2022-04-21"
  }),
  defineName({
    id: "pak-jong-chon", country: "northKorea", locale: "ko-KP",
    surfaces: ["朴正天"], reading: "パク・ジョンチョン",
    components: [{ length: 1, reading: "パク・" }, { length: 1, reading: "ジョン" }, { length: 1, reading: "チョン" }],
    sourceId: "mofa-north-korea-2022-04-21"
  }),
  defineName({
    id: "kim-tok-hun", country: "northKorea", locale: "ko-KP",
    surfaces: ["金徳訓"], reading: "キム・ドックン",
    components: [{ length: 1, reading: "キム・" }, { length: 1, reading: "ドッ" }, { length: 1, reading: "クン" }],
    sourceId: "mofa-north-korea-2022-04-21"
  }),
  defineName({
    id: "ri-son-gwon", country: "northKorea", locale: "ko-KP",
    surfaces: ["李善権", "李善權"], reading: "リ・ソングォン",
    components: [{ length: 1, reading: "リ・" }, { length: 1, reading: "ソン" }, { length: 1, reading: "グォン" }],
    sourceId: "mofa-north-korea-2022-04-21"
  }),

  defineName({
    id: "lee-jae-myung", country: "korea", locale: "ko-KR",
    surfaces: ["李在明"], reading: "イ・ジェミョン",
    components: [{ length: 1, reading: "イ・" }, { length: 1, reading: "ジェ" }, { length: 1, reading: "ミョン" }],
    sourceId: "mofa-heads-2026-08-20"
  }),
  defineName({
    id: "yoon-suk-yeol", country: "korea", locale: "ko-KR",
    surfaces: ["尹錫悦"], reading: "ユン・ソンニョル",
    components: [{ length: 1, reading: "ユン・" }, { length: 1, reading: "ソン" }, { length: 1, reading: "ニョル" }],
    sourceId: "mofa-korea-official-pages"
  }),
  defineName({
    id: "moon-jae-in", country: "korea", locale: "ko-KR",
    surfaces: ["文在寅"], reading: "ムン・ジェイン",
    components: [{ length: 1, reading: "ムン・" }, { length: 1, reading: "ジェ" }, { length: 1, reading: "イン" }],
    sourceId: "mofa-korea-official-pages"
  }),
  defineName({
    id: "park-geun-hye", country: "korea", locale: "ko-KR",
    surfaces: ["朴槿恵", "朴槿惠"], reading: "パク・クネ",
    components: [{ length: 1, reading: "パク・" }, { length: 1, reading: "ク" }, { length: 1, reading: "ネ" }],
    sourceId: "mofa-korea-official-pages"
  }),
  defineName({
    id: "lee-myung-bak", country: "korea", locale: "ko-KR",
    surfaces: ["李明博"], reading: "イ・ミョンバク",
    components: [{ length: 1, reading: "イ・" }, { length: 1, reading: "ミョン" }, { length: 1, reading: "バク" }],
    sourceId: "mofa-korea-official-pages"
  }),
  defineName({
    id: "roh-moo-hyun", country: "korea", locale: "ko-KR",
    surfaces: ["盧武鉉"], reading: "ノ・ムヒョン",
    components: [{ length: 1, reading: "ノ・" }, { length: 1, reading: "ム" }, { length: 1, reading: "ヒョン" }],
    sourceId: "mofa-korea-official-pages"
  }),
  defineName({
    id: "kim-dae-jung", country: "korea", locale: "ko-KR",
    surfaces: ["金大中"], reading: "キム・デジュン",
    components: [{ length: 1, reading: "キム・" }, { length: 1, reading: "デ" }, { length: 1, reading: "ジュン" }],
    sourceId: "mofa-korea-official-pages"
  }),
  defineName({
    id: "kim-young-sam", country: "korea", locale: "ko-KR",
    surfaces: ["金泳三"], reading: "キム・ヨンサム",
    components: [{ length: 1, reading: "キム・" }, { length: 1, reading: "ヨン" }, { length: 1, reading: "サム" }],
    sourceId: "mofa-korea-official-pages"
  }),
  defineName({
    id: "chun-doo-hwan", country: "korea", locale: "ko-KR",
    surfaces: ["全斗煥"], reading: "チョン・ドゥファン",
    components: [{ length: 1, reading: "チョン・" }, { length: 1, reading: "ドゥ" }, { length: 1, reading: "ファン" }],
    sourceId: "mofa-korea-official-pages"
  }),

  defineName({
    id: "nguyen-phu-trong", country: "vietnam", locale: "vi",
    surfaces: ["阮富仲"], reading: "グエン・フー・チョン",
    components: [{ length: 1, reading: "グエン・" }, { length: 1, reading: "フー・" }, { length: 1, reading: "チョン" }],
    sourceId: "mofa-vietnam-country-data"
  }),
  defineName({
    id: "nguyen-xuan-phuc", country: "vietnam", locale: "vi",
    surfaces: ["阮春福"], reading: "グエン・スアン・フック",
    components: [{ length: 1, reading: "グエン・" }, { length: 1, reading: "スアン・" }, { length: 1, reading: "フック" }],
    sourceId: "mofa-vietnam-country-data"
  }),
  defineName({
    id: "vo-nguyen-giap", country: "vietnam", locale: "vi",
    surfaces: ["武元甲"], reading: "ヴォー・グエン・ザップ",
    components: [{ length: 1, reading: "ヴォー・" }, { length: 1, reading: "グエン・" }, { length: 1, reading: "ザップ" }],
    sourceId: "mofa-vietnam-country-data"
  }),
  defineName({
    id: "vo-van-thuong", country: "vietnam", locale: "vi",
    surfaces: ["武文賞"], reading: "ヴォー・ヴァン・トゥオン",
    components: [{ length: 1, reading: "ヴォー・" }, { length: 1, reading: "ヴァン・" }, { length: 1, reading: "トゥオン" }],
    sourceId: "mofa-vietnam-country-data"
  }),
  defineName({
    id: "to-lam", country: "vietnam", locale: "vi", confidence: "contextual",
    surfaces: ["蘇林"], reading: "トー・ラム",
    components: [{ length: 1, reading: "トー・" }, { length: 1, reading: "ラム" }],
    roleHints: ["書記長", "総書記", "国家主席", "主席"], sourceId: "mofa-vietnam-country-data"
  }),
  defineName({
    id: "luong-cuong", country: "vietnam", locale: "vi", confidence: "contextual",
    surfaces: ["梁強", "梁强"], reading: "ルオン・クオン",
    components: [{ length: 1, reading: "ルオン・" }, { length: 1, reading: "クオン" }],
    roleHints: ["国家主席", "主席"], sourceId: "mofa-heads-2026-08-20"
  }),
  defineName({
    id: "pham-minh-chinh", country: "vietnam", locale: "vi", confidence: "contextual",
    surfaces: ["范明政"], reading: "ファム・ミン・チン",
    components: [{ length: 1, reading: "ファム・" }, { length: 1, reading: "ミン・" }, { length: 1, reading: "チン" }],
    roleHints: ["首相"], sourceId: "mofa-heads-2026-08-20"
  }),
  defineName({
    id: "bui-thanh-son", country: "vietnam", locale: "vi", confidence: "contextual",
    surfaces: ["裴青山"], reading: "ブイ・タイン・ソン",
    components: [{ length: 1, reading: "ブイ・" }, { length: 1, reading: "タイン・" }, { length: 1, reading: "ソン" }],
    roleHints: ["外相", "外務大臣", "副首相"], sourceId: "mofa-heads-2026-08-20"
  }),
  defineName({
    id: "tran-thanh-man", country: "vietnam", locale: "vi",
    surfaces: ["陳青敏"], reading: "チャン・タイン・マン",
    components: [{ length: 1, reading: "チャン・" }, { length: 1, reading: "タイン・" }, { length: 1, reading: "マン" }],
    sourceId: "mofa-vietnam-country-data"
  }),
  defineName({
    id: "ho-chi-minh", country: "vietnam", locale: "vi", confidence: "contextual",
    surfaces: ["胡志明"], reading: "ホー・チ・ミン",
    components: [{ length: 1, reading: "ホー・" }, { length: 1, reading: "チ・" }, { length: 1, reading: "ミン" }],
    roleHints: ["主席", "革命家", "建国の父"],
    blockedSuffixes: ["市", "空港", "駅", "市内", "通り", "廟"],
    sourceId: "mofa-vietnam-country-data"
  })
]);

export function getForeignPersonNameParts(entry, surface) {
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
        reading: reading.replace(/・$/u, "")
      }));
    }
    start += entry.components[first].length;
  }
  return parts;
}

export const VERIFIED_PERSON_NAMES = Object.freeze([
  ...FOREIGN_PERSON_NAMES,
  ...JAPANESE_PUBLIC_NAMES
]);

export function getVerifiedPersonNameParts(entry, surface) {
  if (entry?.country === "japan") {
    return getJapanesePublicNameParts(entry, surface);
  }
  return Object.freeze(getForeignPersonNameParts(entry, surface));
}
