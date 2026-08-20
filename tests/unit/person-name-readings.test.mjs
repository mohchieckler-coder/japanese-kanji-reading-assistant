import test from "node:test";
import assert from "node:assert/strict";
import {
  FOREIGN_PERSON_NAMES,
  PERSON_NAME_SOURCES,
  getForeignPersonNameParts
} from "../../src/person-name-readings.mjs";

test("foreign person catalog is auditable, unique, and reconstructs every name", () => {
  const seenSurfaces = new Set();
  for (const entry of FOREIGN_PERSON_NAMES) {
    assert.ok(entry.id);
    assert.ok(["china", "korea", "northKorea", "vietnam"].includes(entry.country), entry.id);
    assert.ok(PERSON_NAME_SOURCES[entry.sourceId], `${entry.id}: missing source ${entry.sourceId}`);
    assert.match(entry.verifiedAt, /^\d{4}-\d{2}-\d{2}$/u);
    assert.match(entry.reading, /^[\p{Script=Katakana}ー・]+$/u, entry.id);
    assert.equal(entry.components.map((component) => component.reading).join(""), entry.reading);

    for (const surface of entry.surfaces) {
      assert.equal(seenSurfaces.has(surface), false, `duplicate foreign person surface: ${surface}`);
      seenSurfaces.add(surface);
      assert.equal(
        entry.components.reduce((length, component) => length + component.length, 0),
        surface.length,
        `${entry.id}: component lengths do not reconstruct ${surface}`
      );
      assert.equal(
        entry.components.every((component) => component.length === 1),
        true,
        `${entry.id}: every character boundary must have an explicit safe reading`
      );
      const whole = getForeignPersonNameParts(entry, surface).find((part) =>
        part.start === 0 && part.surface === surface
      );
      assert.equal(whole?.reading, entry.reading, `${entry.id}: whole-name part mismatch`);
    }
  }
});
