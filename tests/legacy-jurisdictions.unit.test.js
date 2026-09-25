import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readLegacyJurisdictions, matchesLegacyJurisdictions } from '../payload/engine/lib/legacy-jurisdictions.js';

test('shared reader preserves existing absent, empty and malformed fallback without normalizing strings', () => {
  for (const record of [{}, { applies: {} }, { applies: null }, { applies: [] },
    { applies: { jurisdictions: 'eu' } }, { applies: { jurisdictions: [] } }]) {
    assert.deepEqual(readLegacyJurisdictions(record), []);
  }
  const record = { applies: { jurisdictions: ['eu-eaa', 1, ' us-ca ', null] } };
  assert.deepEqual(readLegacyJurisdictions(record), ['eu-eaa', ' us-ca ']);
  assert.equal(record.applies.jurisdictions.length, 4);
});

test('shared scope rule keeps any overlap and legacy unrestricted/unscoped cases', () => {
  const cases = [
    [[], ['us-ca'], true], [['eu-eaa'], [], true], [[], [], true],
    [['eu-eaa'], ['us-ca'], false], [['eu-eaa'], ['us-ca', 'eu-eaa'], true],
    [['eu-eaa', 'us-ca'], ['us-ca'], true], [['eu-eaa'], ['EU-EAA'], false],
  ];
  for (const [applies, asked, expected] of cases) {
    assert.equal(matchesLegacyJurisdictions(Object.freeze(applies), Object.freeze(asked)), expected);
  }
});
