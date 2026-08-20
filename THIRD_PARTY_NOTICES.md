# Third-Party Notices

The browser extension distribution includes third-party software bundled into the
generated JavaScript and local Japanese dictionary assets. The exact dependency
versions below are resolved by `package-lock.json`.

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

The files under `third_party_licenses/` are verbatim copies of the license and
notice files shipped by the corresponding installed npm packages. When a
dependency version changes, refresh these copies from the newly resolved
package before publishing a new build.
