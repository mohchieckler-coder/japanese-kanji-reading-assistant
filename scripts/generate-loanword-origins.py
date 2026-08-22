#!/usr/bin/env python3
"""Generate a conservative katakana loanword-origin table from JMdict JSON.

The input is a pinned jmdict-simplified English JSON release. Only complete,
non-wasei source records with an explicit source word are eligible. Surfaces
with conflicting source records are omitted instead of guessed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path


CANONICAL_LANGUAGES = {
    "eng": "eng",
    "ger": "ger",
    "fre": "fre",
    "spa": "spa",
    "ita": "ita",
    "dut": "dut",
    "por": "por",
    "rus": "rus",
    "chi": "chi",
    "kor": "kor",
    "lat": "lat",
    "gre": "gre",
    "grc": "gre",
    "vie": "vie",
    "san": "san",
    "tur": "tur",
    "tha": "tha",
    "hin": "hin",
    "fin": "fin",
    "swe": "swe",
    "mon": "mon",
    "hun": "hun",
    "may": "may",
    "dan": "dan",
    "nor": "nor",
    "cze": "cze",
}
WHITESPACE = re.compile(r"\s+")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract unambiguous katakana loanword origins from JMdict JSON."
    )
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--source-version", required=True)
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--source-sha256", required=True)
    parser.add_argument(
        "--review-output",
        type=Path,
        help=(
            "Optional JSON queue of common katakana forms that were not safe to "
            "generate. This is evidence for manual review, never runtime data."
        ),
    )
    return parser.parse_args()


def is_katakana_surface(value: str) -> bool:
    characters = list(value)
    if len(characters) < 2:
        return False
    if not any("ァ" <= character <= "ヺ" for character in characters):
        return False
    return all(
        "ァ" <= character <= "ヺ" or character in {"ー", "・", "ヽ", "ヾ"}
        for character in characters
    )


def normalize_origin(value: object) -> str:
    if not isinstance(value, str):
        return ""
    normalized = WHITESPACE.sub(" ", unicodedata.normalize("NFC", value).strip())
    if not normalized or len(normalized) > 80:
        return ""
    if any(unicodedata.category(character) in {"Cc", "Cs"} for character in normalized):
        return ""
    return normalized


def extract(data: dict) -> tuple[list[tuple[str, str, str]], int, int]:
    candidates: dict[str, set[tuple[str, str]]] = defaultdict(set)
    sourced_word_ids: dict[str, set[str]] = defaultdict(set)
    common_unattributed_word_ids: dict[str, set[str]] = defaultdict(set)

    for word in data.get("words", []):
        forms = {
            item.get("text", "")
            for item in word.get("kana", [])
            if is_katakana_surface(item.get("text", ""))
        }
        if not forms:
            continue
        common_forms = {
            item.get("text", "")
            for item in word.get("kana", [])
            if item.get("common") is True
            and item.get("text", "") in forms
        }
        word_id = str(word.get("id", ""))

        for sense in word.get("sense", []):
            sources: set[tuple[str, str]] = set()
            for source in sense.get("languageSource", []):
                language = CANONICAL_LANGUAGES.get(source.get("lang"))
                origin = normalize_origin(source.get("text"))
                if (
                    language
                    and origin
                    and source.get("full") is True
                    and source.get("wasei") is False
                ):
                    sources.add((language, origin))
            restrictions = sense.get("appliesToKana", ["*"])
            applicable_forms = forms if "*" in restrictions else forms.intersection(restrictions)
            if not sources:
                applicable_common_forms = common_forms.intersection(applicable_forms)
                for surface in applicable_common_forms:
                    common_unattributed_word_ids[surface].add(word_id)
                continue

            for surface in applicable_forms:
                candidates[surface].update(sources)
                sourced_word_ids[surface].add(word_id)

    # A source attached to a rare homograph must not leak onto a different,
    # common word with the same katakana spelling. For example, JMdict records
    # サッカー=sucker, プロ=German Pro(zent), and リード=German Lied in sourced
    # entries, while their common soccer/pro/lead senses are separate entries
    # without source fields. Treating the sourced record as globally unique
    # produces confident-looking but incorrect annotations on ordinary pages.
    common_homographs = {
        surface
        for surface, unattributed_ids in common_unattributed_word_ids.items()
        if surface in candidates
        and len(candidates[surface]) == 1
        and any(
            word_id not in sourced_word_ids[surface]
            for word_id in unattributed_ids
        )
    }

    entries = [
        (surface, *next(iter(sources)))
        for surface, sources in candidates.items()
        if len(sources) == 1 and surface not in common_homographs
    ]
    entries.sort(key=lambda item: item[0])
    ambiguous_count = sum(len(sources) > 1 for sources in candidates.values())
    return entries, ambiguous_count, len(common_homographs)


def build_review_queue(
    data: dict,
    generated_surfaces: set[str],
) -> list[dict[str, object]]:
    """Return deterministic, review-only evidence for common omitted forms.

    A katakana spelling and an English gloss are not proof that the word is a
    loanword (e.g. native words, sound-symbolic words, and names are also often
    written in katakana). Consequently this queue must never be merged into the
    runtime table automatically.
    """

    queue: dict[str, dict[str, object]] = {}
    for word in data.get("words", []):
        common_forms = {
            item.get("text", "")
            for item in word.get("kana", [])
            if item.get("common") is True
            and is_katakana_surface(item.get("text", ""))
            and item.get("text", "") not in generated_surfaces
        }
        if not common_forms:
            continue

        reasons: set[str] = set()
        glosses: set[str] = set()
        fields: set[str] = set()
        misc: set[str] = set()
        source_evidence: set[tuple[str, bool | None, bool | None, str]] = set()
        for sense in word.get("sense", []):
            glosses.update(
                normalize_origin(gloss.get("text"))
                for gloss in sense.get("gloss", [])
                if gloss.get("lang") == "eng" and normalize_origin(gloss.get("text"))
            )
            fields.update(sense.get("field", []))
            misc.update(sense.get("misc", []))

            sources = sense.get("languageSource", [])
            if not sources:
                reasons.add("no_language_source")
                continue
            for source in sources:
                language = source.get("lang", "")
                origin = normalize_origin(source.get("text"))
                source_evidence.add(
                    (language, source.get("full"), source.get("wasei"), origin)
                )
                if language not in CANONICAL_LANGUAGES:
                    reasons.add("unsupported_language")
                if not origin:
                    reasons.add("missing_source_text")
                if source.get("full") is not True:
                    reasons.add("partial_source")
                if source.get("wasei") is not False:
                    reasons.add("wasei_or_unknown")

        if not reasons:
            reasons.add("ambiguous_or_restricted_source")

        for surface in common_forms:
            record = queue.setdefault(
                surface,
                {
                    "surface": surface,
                    "wordIds": set(),
                    "reasons": set(),
                    "glosses": set(),
                    "fields": set(),
                    "misc": set(),
                    "languageSources": set(),
                },
            )
            record["wordIds"].add(str(word.get("id", "")))
            record["reasons"].update(reasons)
            record["glosses"].update(glosses)
            record["fields"].update(fields)
            record["misc"].update(misc)
            record["languageSources"].update(source_evidence)

    rendered = []
    for surface, record in sorted(queue.items()):
        rendered.append(
            {
                "surface": surface,
                "wordIds": sorted(record["wordIds"]),
                "reasons": sorted(record["reasons"]),
                "glosses": sorted(record["glosses"]),
                "fields": sorted(record["fields"]),
                "misc": sorted(record["misc"]),
                "languageSources": [
                    {
                        "lang": language,
                        "full": full,
                        "wasei": wasei,
                        "text": origin or None,
                    }
                    for language, full, wasei, origin in sorted(
                        record["languageSources"],
                        key=lambda source: (
                            source[0],
                            str(source[1]),
                            str(source[2]),
                            source[3],
                        ),
                    )
                ],
            }
        )
    return rendered


def render(
    entries: list[tuple[str, str, str]],
    *,
    dictionary_date: str,
    source_version: str,
    source_url: str,
    source_sha256: str,
    ambiguous_count: int,
    common_homograph_count: int,
) -> str:
    metadata = {
        "dictionaryDate": dictionary_date,
        "sourceVersion": source_version,
        "sourceUrl": source_url,
        "sourceSha256": source_sha256.upper(),
        "entryCount": len(entries),
        "ambiguousSurfacesOmitted": ambiguous_count,
        "commonHomographicSurfacesOmitted": common_homograph_count,
        "license": "CC BY-SA 4.0 / EDRDG General Dictionary Licence",
    }
    lines = [
        "// Generated by scripts/generate-loanword-origins.py; do not edit by hand.",
        "// Derived from JMdict data. See THIRD_PARTY_NOTICES.md and third_party_licenses/jmdict/.",
        f"export const JMDICT_LOANWORD_ORIGIN_METADATA = Object.freeze({json.dumps(metadata, ensure_ascii=False, separators=(',', ':'))});",
        "",
        "export const JMDICT_LOANWORD_ORIGINS = Object.freeze([",
    ]
    lines.extend(
        f"  Object.freeze({json.dumps(entry, ensure_ascii=False, separators=(',', ':'))}),"
        for entry in entries
    )
    lines.extend(["]);", ""])
    return "\n".join(lines).replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")


def main() -> None:
    args = parse_args()
    source_bytes = args.input.read_bytes()
    actual_sha256 = hashlib.sha256(source_bytes).hexdigest().upper()
    expected_sha256 = args.source_sha256.upper()
    if actual_sha256 != expected_sha256:
        raise SystemExit(
            f"JMdict JSON SHA-256 mismatch: expected {expected_sha256}, got {actual_sha256}"
        )

    data = json.loads(source_bytes)
    entries, ambiguous_count, common_homograph_count = extract(data)
    if len(entries) < 500:
        raise SystemExit(f"Unexpectedly small generated dictionary: {len(entries)} entries")

    output = render(
        entries,
        dictionary_date=str(data.get("dictDate", "")),
        source_version=args.source_version,
        source_url=args.source_url,
        source_sha256=actual_sha256,
        ambiguous_count=ambiguous_count,
        common_homograph_count=common_homograph_count,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(output, encoding="utf-8", newline="\n")

    if args.review_output:
        review_queue = build_review_queue(
            data,
            {surface for surface, _language, _origin in entries},
        )
        review_document = {
            "sourceVersion": args.source_version,
            "sourceSha256": actual_sha256,
            "warning": (
                "Review evidence only. Katakana spelling and English glosses are "
                "not sufficient evidence for automatic inclusion."
            ),
            "candidateCount": len(review_queue),
            "candidates": review_queue,
        }
        args.review_output.parent.mkdir(parents=True, exist_ok=True)
        args.review_output.write_text(
            json.dumps(review_document, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
            newline="\n",
        )
        print(
            f"Wrote {len(review_queue)} common omitted forms for manual review "
            f"at {args.review_output}."
        )
    print(
        f"Generated {len(entries)} unambiguous origins at {args.output} "
        f"({ambiguous_count} source-conflicted and {common_homograph_count} "
        "common homographic surfaces omitted)."
    )


if __name__ == "__main__":
    main()
