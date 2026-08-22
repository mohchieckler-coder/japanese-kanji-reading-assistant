# Third-Party Notices

The browser extension distribution includes third-party software and data
bundled into the generated JavaScript and local dictionary assets. npm package
versions are resolved by `package-lock.json`; the JMdict conversion is pinned by
the generated data metadata and its reproducible generator.

This notice does not select or grant a license for this project's original
source code. It only identifies the licenses that apply to the listed
third-party components.

| Component | Version | Relationship | License and notice files |
| --- | ---: | --- | --- |
| kuromoji | 0.1.2 | Direct runtime dependency; tokenizer code and dictionary assets are distributed | [Apache-2.0 license](third_party_licenses/kuromoji/LICENSE-2.0.txt), [upstream notice](third_party_licenses/kuromoji/NOTICE.md) |
| async | 2.6.4 | Runtime dependency of kuromoji; bundled into the content script | [MIT license](third_party_licenses/async/LICENSE) |
| lodash | 4.18.1 | Runtime dependency of async; bundled into the content script | [MIT license](third_party_licenses/lodash/LICENSE) |
| doublearray | 0.0.2 | Runtime dependency of kuromoji; bundled into the content script | [MIT license](third_party_licenses/doublearray/LICENSE.txt) |
| zlibjs | 0.3.1 | Runtime dependency of kuromoji; bundled into the content script | [MIT license](third_party_licenses/zlibjs/LICENSE) |
| JMdict English data | 2026-08-17 via jmdict-simplified 3.6.2+20260817122448 | A filtered table of complete, explicitly sourced, non-wasei katakana loanword origins is bundled locally | [JMdict notice](third_party_licenses/jmdict/JMdict-NOTICE.md), [EDRDG General Dictionary Licence](third_party_licenses/jmdict/EDRDG-GENERAL-DICTIONARY-LICENCE.txt), [CC BY-SA 4.0 legal code](third_party_licenses/jmdict/CC-BY-SA-4.0.txt) |
| 国立国語研究所「外来語」言い換え提案 | 第1回～第4回総集編 | Reference source for 78 independently reviewed lexical origin facts; explanatory prose and the source table are not redistributed verbatim | [NINJAL source page](https://www2.ninjal.ac.jp/gairaigo/Teian1_4/iikaego.html) |

The npm files under `third_party_licenses/` are verbatim copies shipped by the
corresponding packages. JMdict attribution and licence files accompany the
generated subset. The NINJAL reference layer stores only independently reviewed
term/origin facts plus a source identifier. Before each published update,
refresh third-party copies and regenerate the JMdict table from a current pinned
release.
