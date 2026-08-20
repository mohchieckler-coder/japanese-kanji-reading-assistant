import {
  FOREIGN_PERSON_NAMES,
  PERSON_COUNTRY_HINTS,
  PERSON_ROLE_HINTS,
  getForeignPersonNameParts
} from "./person-name-readings.mjs";

const KANJI_PATTERN = /[\p{Script=Han}々〆ヶ]/u;
const SINGLE_KANJI_PATTERN = /^[\p{Script=Han}々〆ヶ]$/u;
const HORIZONTAL_SPACE = "[\\p{Zs}\\t]*";
const WEEKDAY_ABBREVIATION_READINGS = Object.freeze({
  日: "にち",
  月: "げつ",
  火: "か",
  水: "すい",
  木: "もく",
  金: "きん",
  土: "ど"
});
const CLOSING_PARENTHESIS = Object.freeze({
  "(": ")",
  "（": "）"
});
const SPECIAL_DAY_READINGS = Object.freeze({
  1: "ついたち",
  2: "ふつか",
  3: "みっか",
  4: "よっか",
  5: "いつか",
  6: "むいか",
  7: "なのか",
  8: "ようか",
  9: "ここのか",
  10: "とおか",
  14: "じゅうよっか",
  20: "はつか",
  24: "にじゅうよっか"
});
const PEOPLE_COUNTER_READINGS = Object.freeze({
  "1": "ひとり",
  "１": "ひとり",
  一: "ひとり",
  "2": "ふたり",
  "２": "ふたり",
  二: "ふたり"
});
const EXACT_PHRASE_READINGS = Object.freeze([
  ["妊娠高血圧腎症", "にんしんこうけつあつじんしょう"],
  ["博士課程", "はくしかてい"],
  ["日本研究", "にほんけんきゅう"],
  ["日本初", "にほんはつ"],
  ["頭頸部", "とうけいぶ"],
  ["幹細胞", "かんさいぼう"],
  ["浸透圧", "しんとうあつ"],
  ["トピ主様", "とぴぬしさま"],
  ["スレ主様", "すれぬしさま"],
  ["トピ立て", "とぴたて"],
  ["スレ立て", "すれたて"],
  ["トピ主", "とぴぬし"],
  ["スレ主", "すれぬし"],
  ["相転移", "そうてんい"],
  ["平均場", "へいきんば"],
  ["骨髄", "こつずい"],
  ["協働", "きょうどう"],
  ["自治厨", "じちちゅう"],
  ["既読", "きどく"],
  ["公録", "こうろく"],
  ["売り時", "うりどき"],
  ["昨夏", "さっか"],
  ["一人一人", "ひとりひとり"],
  ["二人組", "ふたりぐみ"],
  ["膵", "すい"]
].sort(([left], [right]) => right.length - left.length));
const ROUND_COUNTER_READINGS = Object.freeze({
  一: "いっかい",
  六: "ろっかい",
  八: "はっかい",
  十: "じゅっかい",
  百: "ひゃっかい"
});
const SPLIT_COMPOUND_READINGS = Object.freeze([
  {
    surface: "妊娠高血圧腎症",
    parts: [
      ["妊", 0, "にん"], ["娠", 1, "しん"], ["高", 2, "こう"],
      ["血", 3, "けつ"], ["圧", 4, "あつ"], ["腎", 5, "じん"], ["症", 6, "しょう"],
      ["妊娠", 0, "にんしん"], ["血圧", 3, "けつあつ"], ["腎症", 5, "じんしょう"]
    ]
  },
  {
    surface: "博士課程",
    parts: [
      ["博", 0, "はく"], ["士", 1, "し"], ["課", 2, "か"], ["程", 3, "てい"],
      ["博士", 0, "はくし"], ["課程", 2, "かてい"]
    ]
  },
  {
    surface: "日本研究",
    parts: [
      ["日", 0, "に"], ["本", 1, "ほん"], ["研", 2, "けん"], ["究", 3, "きゅう"],
      ["日本", 0, "にほん"], ["研究", 2, "けんきゅう"]
    ]
  },
  {
    surface: "幹細胞",
    parts: [
      ["幹", 0, "かん"], ["細", 1, "さい"], ["胞", 2, "ぼう"], ["細胞", 1, "さいぼう"]
    ]
  },
  {
    surface: "頭頸部",
    parts: [["頭", 0, "とう"], ["頸", 1, "けい"], ["部", 2, "ぶ"]]
  },
  {
    surface: "浸透圧",
    parts: [
      ["浸", 0, "しん"], ["透", 1, "とう"], ["圧", 2, "あつ"], ["浸透", 0, "しんとう"]
    ]
  },
  {
    surface: "日本初",
    parts: [
      ["日", 0, "に"], ["本", 1, "ほん"], ["初", 2, "はつ"],
      ["日本", 0, "にほん"], ["本初", 1, "ほんはつ"]
    ]
  },
  {
    surface: "相転移",
    parts: [
      ["相", 0, "そう"], ["転", 1, "てん"], ["移", 2, "い"], ["転移", 1, "てんい"]
    ]
  },
  {
    surface: "平均場",
    parts: [
      ["平", 0, "へい"], ["均", 1, "きん"], ["場", 2, "ば"], ["平均", 0, "へいきん"]
    ]
  },
  {
    surface: "自治厨",
    parts: [
      ["自", 0, "じ"], ["治", 1, "ち"], ["厨", 2, "ちゅう"], ["自治", 0, "じち"]
    ]
  },
  {
    surface: "売り時",
    parts: [["売り", 0, "うり"], ["時", 2, "どき"]]
  },
  {
    surface: "骨髄",
    parts: [["骨", 0, "こつ"], ["髄", 1, "ずい"]]
  },
  {
    surface: "協働",
    parts: [["協", 0, "きょう"], ["働", 1, "どう"]]
  },
  {
    surface: "既読",
    parts: [["既", 0, "き"], ["読", 1, "どく"]]
  },
  {
    surface: "公録",
    parts: [["公", 0, "こう"], ["録", 1, "ろく"]]
  },
  {
    surface: "昨夏",
    parts: [["昨", 0, "さっ"], ["夏", 1, "か"]]
  },
  {
    surface: "中日",
    parts: [["中", 0, "ちゅう"], ["日", 1, "にち"]]
  },
  {
    surface: "巨人",
    parts: [["巨", 0, "きょ"], ["人", 1, "じん"]]
  },
  {
    surface: "非常",
    parts: [["非", 0, "ひ"], ["常", 1, "じょう"]]
  }
]);

const FOREIGN_PERSON_SURFACES = Object.freeze(FOREIGN_PERSON_NAMES.flatMap((entry) =>
  entry.surfaces.map((surface) => Object.freeze({
    entry,
    surface,
    parts: Object.freeze(getForeignPersonNameParts(entry, surface))
  }))
).sort((left, right) => right.surface.length - left.surface.length));
const ALL_PERSON_COUNTRY_HINTS = Object.freeze(Object.values(PERSON_COUNTRY_HINTS).flat());
const PROVIDED_READING_PATTERN = /^([\p{Script=Han}々〆ヶ]{2,6})[\p{Zs}\t]*([\(（])[\p{Zs}\t]*([\p{Script=Hiragana}\p{Script=Katakana}ー・･\p{Zs}\t]{2,48})[\p{Zs}\t]*([\)）])/u;

export function containsKanji(value) {
  return KANJI_PATTERN.test(value);
}

export function katakanaToHiragana(value) {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint >= 0x30a1 && codePoint <= 0x30f6) {
      return String.fromCodePoint(codePoint - 0x60);
    }
    return character;
  }).join("");
}

function parseJapaneseNumber(value) {
  return Number(value.replace(/[０-９]/g, (digit) =>
    String.fromCodePoint(digit.codePointAt(0) - 0xfee0)
  ));
}

function normalizeContext(context) {
  return {
    prefix: typeof context?.prefix === "string" ? context.prefix : "",
    suffix: typeof context?.suffix === "string" ? context.suffix : ""
  };
}

function startsWithAny(value, candidates) {
  return candidates.some((candidate) => value.startsWith(candidate));
}

function endsWithAny(value, candidates) {
  return candidates.some((candidate) => value.endsWith(candidate));
}

function normalizeProvidedReading(value) {
  return value.trim().replace(/[\p{Zs}\t]+/gu, "・").replaceAll("･", "・");
}

function personRoleImmediatelyFollows(textAfter, roleHints = PERSON_ROLE_HINTS) {
  const withoutHorizontalSpace = textAfter.replace(/^[\p{Zs}\t]+/u, "");
  return startsWithAny(withoutHorizontalSpace, roleHints);
}

function personRoleImmediatelyPrecedes(textBefore, roleHints = PERSON_ROLE_HINTS) {
  const withoutHorizontalSpace = textBefore.replace(/[\p{Zs}\t]+$/u, "");
  return roleHints.some((role) =>
    withoutHorizontalSpace.endsWith(role) || withoutHorizontalSpace.endsWith(`${role}の`)
  );
}

const COUNTRY_AFFILIATION_PATTERN = /^[\p{Zs}\t]*(?:(?:の|・|、|政府(?:の)?|共産党(?:の)?|国家(?:主席)?(?:の)?|政権(?:の)?|代表(?:の)?|首脳(?:の)?|大統領府(?:の)?)[\p{Zs}\t]*)?$/u;

function hasCountryHint(entry, contextualText, start, end) {
  const hints = entry ? PERSON_COUNTRY_HINTS[entry.country] : ALL_PERSON_COUNTRY_HINTS;
  const before = contextualText.slice(Math.max(0, start - 36), start);
  const after = contextualText.slice(end, Math.min(contextualText.length, end + 36));
  const lastBoundary = Math.max(
    before.lastIndexOf("。"), before.lastIndexOf("！"), before.lastIndexOf("？"),
    before.lastIndexOf("!"), before.lastIndexOf("?"), before.lastIndexOf("；"),
    before.lastIndexOf(";"), before.lastIndexOf("\n"), before.lastIndexOf("\r")
  );
  const sameSentenceBefore = before.slice(lastBoundary + 1);
  const afterBoundary = after.search(/[。！？!?；;\r\n]/u);
  const sameSentenceAfter = afterBoundary === -1 ? after : after.slice(0, afterBoundary);
  return hints.some((hint) => {
    const hintStart = sameSentenceBefore.lastIndexOf(hint);
    if (hintStart !== -1) {
      const between = sameSentenceBefore.slice(hintStart + hint.length);
      if (COUNTRY_AFFILIATION_PATTERN.test(between)) {
        return true;
      }
    }
    const afterName = sameSentenceAfter.replace(/^[\p{Zs}\t、・]+/u, "");
    if (!afterName.startsWith(hint)) {
      return false;
    }
    return personRoleImmediatelyFollows(
      afterName.slice(hint.length),
      entry?.roleHints || PERSON_ROLE_HINTS
    );
  });
}

function hasRequiredPersonContext(entry, contextualText, start, end) {
  if (entry.confidence !== "contextual") {
    return true;
  }
  const textBefore = contextualText.slice(0, start);
  const textAfter = contextualText.slice(end);
  return hasCountryHint(entry, contextualText, start, end)
    || personRoleImmediatelyFollows(textAfter, entry.roleHints)
    || personRoleImmediatelyPrecedes(textBefore, entry.roleHints);
}

function hasPersonNameBoundary(contextualText, start, end, entry = null) {
  const textBefore = contextualText.slice(0, start);
  const textAfter = contextualText.slice(end);
  const boundaryAfter = textAfter.replace(/^[\p{Zs}\t]+/u, "");
  if (entry && startsWithAny(boundaryAfter, entry.blockedSuffixes)) {
    return false;
  }

  const previousCharacter = Array.from(textBefore).at(-1) || "";
  if (SINGLE_KANJI_PATTERN.test(previousCharacter)) {
    const countryHints = entry ? PERSON_COUNTRY_HINTS[entry.country] : ALL_PERSON_COUNTRY_HINTS;
    if (!endsWithAny(textBefore, countryHints)) {
      return false;
    }
  }

  const nextCharacter = Array.from(boundaryAfter)[0] || "";
  if (SINGLE_KANJI_PATTERN.test(nextCharacter)) {
    const allowedSuffixes = entry
      ? [...PERSON_ROLE_HINTS, ...entry.roleHints]
      : PERSON_ROLE_HINTS;
    if (!startsWithAny(boundaryAfter, allowedSuffixes)) {
      return false;
    }
  }
  return true;
}

function findForeignPersonSurface(surface) {
  return FOREIGN_PERSON_SURFACES.find((candidate) => candidate.surface === surface) || null;
}

function findPageProvidedPersonName(text, start, contextualText, contextualOffset) {
  const match = text.slice(start).match(PROVIDED_READING_PATTERN);
  if (!match || CLOSING_PARENTHESIS[match[2]] !== match[4]) {
    return null;
  }
  const surface = match[1];
  const reading = normalizeProvidedReading(match[3]);
  if (!/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(reading)) {
    return null;
  }

  const known = findForeignPersonSurface(surface);
  const contextualStart = contextualOffset + start;
  const contextualEnd = contextualStart + surface.length;
  if (!hasPersonNameBoundary(contextualText, contextualStart, contextualEnd, known?.entry || null)) {
    return null;
  }

  if (!known) {
    const parentheticalEnd = contextualOffset + start + match[0].length;
    const afterParenthetical = contextualText.slice(parentheticalEnd);
    if (
      !hasCountryHint(null, contextualText, contextualStart, contextualEnd)
      || !personRoleImmediatelyFollows(afterParenthetical)
    ) {
      return null;
    }
  }

  return {
    start,
    end: start + surface.length,
    surface,
    reading,
    priority: 3,
    source: "page"
  };
}

function findKnownPersonName(text, start, contextualText, contextualOffset) {
  for (const candidate of FOREIGN_PERSON_SURFACES) {
    if (!text.startsWith(candidate.surface, start)) {
      continue;
    }
    const contextualStart = contextualOffset + start;
    const contextualEnd = contextualStart + candidate.surface.length;
    if (
      hasPersonNameBoundary(contextualText, contextualStart, contextualEnd, candidate.entry)
      && hasRequiredPersonContext(candidate.entry, contextualText, contextualStart, contextualEnd)
    ) {
      return {
        start,
        end: start + candidate.surface.length,
        surface: candidate.surface,
        reading: candidate.entry.reading,
        priority: 2,
        source: candidate.entry.id
      };
    }
  }
  return null;
}

function findCrossBoundaryPersonParts(text, contextualText, contextualOffset) {
  const currentStart = contextualOffset;
  const currentEnd = contextualOffset + text.length;
  const matches = [];
  for (const candidate of FOREIGN_PERSON_SURFACES) {
    let nameStart = contextualText.indexOf(
      candidate.surface,
      Math.max(0, currentStart - candidate.surface.length + 1)
    );
    while (nameStart !== -1 && nameStart < currentEnd) {
      const nameEnd = nameStart + candidate.surface.length;
      const crossesBoundary = nameStart < currentStart || nameEnd > currentEnd;
      if (
        crossesBoundary
        && nameEnd > currentStart
        && hasPersonNameBoundary(contextualText, nameStart, nameEnd, candidate.entry)
        && hasRequiredPersonContext(candidate.entry, contextualText, nameStart, nameEnd)
      ) {
        const overlapStart = Math.max(nameStart, currentStart);
        const overlapEnd = Math.min(nameEnd, currentEnd);
        const relativeStart = overlapStart - nameStart;
        const overlapSurface = contextualText.slice(overlapStart, overlapEnd);
        const part = candidate.parts.find((item) =>
          item.start === relativeStart && item.surface === overlapSurface
        );
        if (part) {
          matches.push({
            start: overlapStart - currentStart,
            end: overlapEnd - currentStart,
            surface: overlapSurface,
            reading: part.reading,
            priority: 1,
            source: candidate.entry.id
          });
        }
      }
      nameStart = contextualText.indexOf(candidate.surface, nameStart + 1);
    }
  }
  return matches;
}

function findForeignPersonNameMatches(text, context) {
  const normalizedContext = normalizeContext(context);
  const contextualText = `${normalizedContext.prefix}${text}${normalizedContext.suffix}`;
  const contextualOffset = normalizedContext.prefix.length;
  const candidates = [];
  for (let start = 0; start < text.length; start += 1) {
    const pageProvided = findPageProvidedPersonName(text, start, contextualText, contextualOffset);
    const known = findKnownPersonName(text, start, contextualText, contextualOffset);
    if (pageProvided) {
      candidates.push(pageProvided);
    } else if (known) {
      candidates.push(known);
    }
  }
  candidates.push(...findCrossBoundaryPersonParts(text, contextualText, contextualOffset));
  candidates.sort((left, right) =>
    left.start - right.start
    || right.priority - left.priority
    || (right.end - right.start) - (left.end - left.start)
  );

  const matches = [];
  let consumedUntil = 0;
  for (const candidate of candidates) {
    if (candidate.start < consumedUntil) {
      continue;
    }
    matches.push(candidate);
    consumedUntil = candidate.end;
  }
  return matches;
}

function getSplitCompoundReading(
  contextualText,
  contextualStart,
  surface,
  currentTextStart,
  currentTextEnd
) {
  const tokenEnd = contextualStart + surface.length;
  for (const compound of SPLIT_COMPOUND_READINGS) {
    let compoundStart = contextualText.indexOf(
      compound.surface,
      Math.max(0, contextualStart - compound.surface.length + 1)
    );
    while (compoundStart !== -1 && compoundStart <= contextualStart) {
      const compoundEnd = compoundStart + compound.surface.length;
      if (tokenEnd <= compoundEnd) {
        const crossesTextBoundary = compoundStart < currentTextStart || compoundEnd > currentTextEnd;
        if (crossesTextBoundary) {
          const relativeStart = contextualStart - compoundStart;
          const matchingPart = compound.parts.find(([partSurface, partStart]) =>
            partStart === relativeStart && partSurface === surface
          );
          if (matchingPart) {
            return matchingPart[2];
          }
        }
      }
      compoundStart = contextualText.indexOf(compound.surface, compoundStart + 1);
    }
  }
  return null;
}

function getPairedWeekdayContext(textBefore, textAfter) {
  const closingMatch = textAfter.match(new RegExp(`^${HORIZONTAL_SPACE}([\\)）])`, "u"));
  if (!closingMatch) {
    return null;
  }

  const japaneseDateMatch = textBefore.match(new RegExp(
    `(?:^|[^0-9０-９])([0-9０-９]{1,2})日${HORIZONTAL_SPACE}([\\(（])${HORIZONTAL_SPACE}$`,
    "u"
  ));
  if (japaneseDateMatch) {
    const dayNumber = parseJapaneseNumber(japaneseDateMatch[1]);
    if (
      dayNumber >= 1
      && dayNumber <= 31
      && CLOSING_PARENTHESIS[japaneseDateMatch[2]] === closingMatch[1]
    ) {
      return true;
    }
  }

  const bareDayMatch = textBefore.match(new RegExp(
    `(?:^|[^\\p{Letter}\\p{Number}.．/／-])([0-9０-９]{1,2})${HORIZONTAL_SPACE}([\\(（])${HORIZONTAL_SPACE}$`,
    "u"
  ));
  if (bareDayMatch) {
    const dayNumber = parseJapaneseNumber(bareDayMatch[1]);
    if (
      dayNumber >= 1
      && dayNumber <= 31
      && CLOSING_PARENTHESIS[bareDayMatch[2]] === closingMatch[1]
    ) {
      return true;
    }
  }

  const dottedDateMatch = textBefore.match(new RegExp(
    `(?:^|[^0-9０-９])([0-9０-９]{1,2})[.．/／-]([0-9０-９]{1,2})${HORIZONTAL_SPACE}([\\(（])${HORIZONTAL_SPACE}$`,
    "u"
  ));
  if (!dottedDateMatch) {
    return null;
  }

  const monthNumber = parseJapaneseNumber(dottedDateMatch[1]);
  const dayNumber = parseJapaneseNumber(dottedDateMatch[2]);
  return monthNumber >= 1
    && monthNumber <= 12
    && dayNumber >= 1
    && dayNumber <= 31
    && CLOSING_PARENTHESIS[dottedDateMatch[3]] === closingMatch[1];
}

export function getContextualReading(text, tokenStart, surface, context = {}) {
  const normalizedContext = normalizeContext(context);
  const contextualText = `${normalizedContext.prefix}${text}${normalizedContext.suffix}`;
  const contextualStart = normalizedContext.prefix.length + tokenStart;
  const textBefore = contextualText.slice(0, contextualStart);
  const textAfter = contextualText.slice(contextualStart + surface.length);
  const splitCompoundReading = getSplitCompoundReading(
    contextualText,
    contextualStart,
    surface,
    normalizedContext.prefix.length,
    normalizedContext.prefix.length + text.length
  );
  if (splitCompoundReading) {
    return splitCompoundReading;
  }

  if (surface === "雨") {
    const followsHardBoundary = /(?:^|[/／:：|｜、，,（(【「『])[\p{Zs}\t]*$/u.test(textBefore);
    const startsWeatherPair = /^[\p{Zs}\t]*・/u.test(textAfter);
    if (followsHardBoundary && startsWeatherPair) {
      return "あめ";
    }
  }

  if (surface === "月") {
    const monthMatch = textBefore.match(/(?:^|[^0-9０-９])([0-9０-９]{1,2})$/u);
    if (monthMatch) {
      const monthNumber = parseJapaneseNumber(monthMatch[1]);
      if (monthNumber >= 1 && monthNumber <= 12) {
        return "がつ";
      }
    }
  }

  if (surface === "笑" || surface === "泣") {
    const openingMatch = textBefore.match(/([\(（])[\p{Zs}\t]*$/u);
    const closingMatch = textAfter.match(/^[\p{Zs}\t]*([\)）])/u);
    if (
      openingMatch
      && closingMatch
      && CLOSING_PARENTHESIS[openingMatch[1]] === closingMatch[1]
    ) {
      return surface === "笑" ? "わらい" : "なき";
    }
  }

  if (surface === "辛い" && /^[\p{Zs}\t]*(?:焼きそば|料理|食べ物|食品|ラーメン|カレー|味)/u.test(textAfter)) {
    return "からい";
  }

  if (
    surface === "後"
    && /^から/u.test(textAfter)
    && /(?:^|[。．.!！?？、，,（(【「『])[\p{Zs}\t]*$/u.test(textBefore)
  ) {
    return "あと";
  }

  if (surface === "立て" && /(?:トピ|スレ)$/u.test(textBefore)) {
    return "たて";
  }

  if (surface === "主" && /(?:トピ|スレ)$/u.test(textBefore) && /^(?:さん|様)/u.test(textAfter)) {
    return "ぬし";
  }

  const weekdayReading = WEEKDAY_ABBREVIATION_READINGS[surface];
  if (!weekdayReading || surface.length !== 1) {
    return null;
  }

  return getPairedWeekdayContext(textBefore, textAfter) ? weekdayReading : null;
}

function createTokenEntries(tokens) {
  let start = 0;
  return tokens.map((token) => {
    const entry = {
      token,
      start,
      end: start + token.surface_form.length
    };
    start = entry.end;
    return entry;
  });
}

function findExactPhrase(text, start, tokenIndexByStart) {
  for (const [surface, reading] of EXACT_PHRASE_READINGS) {
    if (!text.startsWith(surface, start)) {
      continue;
    }
    const nextTokenIndex = tokenIndexByStart.get(start + surface.length);
    if (nextTokenIndex !== undefined) {
      return { surface, reading, nextTokenIndex };
    }
  }
  return null;
}

function followsValidCalendarMonth(textBefore) {
  const match = textBefore.match(/(?:^|[^0-9０-９])([0-9０-９]{1,2})月[\p{Zs}\t]*$/u);
  if (!match) {
    return false;
  }
  const monthNumber = parseJapaneseNumber(match[1]);
  return monthNumber >= 1 && monthNumber <= 12;
}

function startsPairedWeekday(textAfter) {
  const match = textAfter.match(/^[\p{Zs}\t]*([\(（])[\p{Zs}\t]*[日月火水木金土][\p{Zs}\t]*([\)）])/u);
  return Boolean(match && CLOSING_PARENTHESIS[match[1]] === match[2]);
}

function findSpecialDay(text, start, tokenIndexByStart, context) {
  const match = text.slice(start).match(/^([0-9０-９]{1,2})日(間)?/u);
  if (!match) {
    return null;
  }

  const dayNumber = parseJapaneseNumber(match[1]);
  const ordinaryReading = SPECIAL_DAY_READINGS[dayNumber];
  if (!ordinaryReading) {
    return null;
  }

  const surface = match[0];
  const nextTokenIndex = tokenIndexByStart.get(start + surface.length);
  if (nextTokenIndex === undefined) {
    return null;
  }

  const normalizedContext = normalizeContext(context);
  const textBefore = `${normalizedContext.prefix}${text.slice(0, start)}`;
  const textAfter = `${text.slice(start + surface.length)}${normalizedContext.suffix}`;
  if (!match[2] && textAfter.startsWith("本")) {
    return null;
  }

  if (match[2]) {
    const dayReading = dayNumber === 1 ? "いちにち" : ordinaryReading;
    return { surface, reading: `${dayReading}かん`, nextTokenIndex };
  }

  if (dayNumber === 1) {
    if (followsValidCalendarMonth(textBefore) || startsPairedWeekday(textAfter)) {
      return { surface, reading: ordinaryReading, nextTokenIndex };
    }
    if (/^(?:目|後|前|以内|以上|以下|未満|程度)/u.test(textAfter)) {
      return { surface, reading: "いちにち", nextTokenIndex };
    }
    return null;
  }

  return { surface, reading: ordinaryReading, nextTokenIndex };
}

function findPeopleCounter(text, start, tokenIndexByStart, context) {
  const match = text.slice(start).match(/^([12１２一二])人/u);
  if (!match) {
    return null;
  }

  const surface = match[0];
  const nextTokenIndex = tokenIndexByStart.get(start + surface.length);
  if (nextTokenIndex === undefined) {
    return null;
  }

  const normalizedContext = normalizeContext(context);
  const textAfter = `${text.slice(start + surface.length)}${normalizedContext.suffix}`;
  if (/^[称前月日年者物]/u.test(textAfter)) {
    return null;
  }

  return {
    surface,
    reading: PEOPLE_COUNTER_READINGS[match[1]],
    nextTokenIndex
  };
}

function findRoundCounter(text, start, tokenIndexByStart, context) {
  const match = text.slice(start).match(/^([一六八十百])回/u);
  if (!match) {
    return null;
  }

  const normalizedContext = normalizeContext(context);
  const previousCharacter = Array.from(`${normalizedContext.prefix}${text.slice(0, start)}`).at(-1) ?? "";
  if (/[一二三四五六七八九十百千万兆]/u.test(previousCharacter)) {
    return null;
  }

  const surface = match[0];
  const nextTokenIndex = tokenIndexByStart.get(start + surface.length);
  if (nextTokenIndex === undefined) {
    return null;
  }

  return {
    surface,
    reading: ROUND_COUNTER_READINGS[match[1]],
    nextTokenIndex
  };
}

function buildBaseAnnotationSegments(text, tokenizer, context = {}) {
  if (!containsKanji(text)) {
    return [{ text, reading: null }];
  }

  const tokens = tokenizer.tokenize(text);
  if (tokens.map((token) => token.surface_form).join("") !== text) {
    return [{ text, reading: null }];
  }

  const entries = createTokenEntries(tokens);
  const tokenIndexByStart = new Map(entries.map((entry, index) => [entry.start, index]));
  tokenIndexByStart.set(text.length, entries.length);

  const segments = [];
  let index = 0;
  while (index < entries.length) {
    const entry = entries[index];
    const phrase = findExactPhrase(text, entry.start, tokenIndexByStart)
      ?? findSpecialDay(text, entry.start, tokenIndexByStart, context)
      ?? findPeopleCounter(text, entry.start, tokenIndexByStart, context)
      ?? findRoundCounter(text, entry.start, tokenIndexByStart, context);
    if (phrase) {
      segments.push({ text: phrase.surface, reading: phrase.reading });
      index = phrase.nextTokenIndex;
      continue;
    }

    const dictionaryReading = entry.token.reading && entry.token.reading !== "*"
      ? katakanaToHiragana(entry.token.reading)
      : null;
    const reading = getContextualReading(text, entry.start, entry.token.surface_form, context)
      ?? dictionaryReading;
    segments.push({
      text: entry.token.surface_form,
      reading: containsKanji(entry.token.surface_form) ? reading : null
    });
    index += 1;
  }

  return segments;
}

export function buildAnnotationSegments(text, tokenizer, context = {}) {
  if (!containsKanji(text)) {
    return [{ text, reading: null }];
  }

  const matches = findForeignPersonNameMatches(text, context);
  if (matches.length === 0) {
    return buildBaseAnnotationSegments(text, tokenizer, context);
  }

  const normalizedContext = normalizeContext(context);
  const segments = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start > cursor) {
      segments.push(...buildBaseAnnotationSegments(
        text.slice(cursor, match.start),
        tokenizer,
        {
          prefix: `${normalizedContext.prefix}${text.slice(0, cursor)}`,
          suffix: `${text.slice(match.start)}${normalizedContext.suffix}`
        }
      ));
    }
    segments.push({ text: match.surface, reading: match.reading });
    cursor = match.end;
  }
  if (cursor < text.length) {
    segments.push(...buildBaseAnnotationSegments(
      text.slice(cursor),
      tokenizer,
      {
        prefix: `${normalizedContext.prefix}${text.slice(0, cursor)}`,
        suffix: normalizedContext.suffix
      }
    ));
  }
  return segments;
}
