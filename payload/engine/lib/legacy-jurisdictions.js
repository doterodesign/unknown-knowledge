/** Legacy Knowledge scope compatibility; no new authored universality claim. */
export function readLegacyJurisdictions(record) {
  const applies = record?.applies;
  return applies !== null && typeof applies === 'object' && !Array.isArray(applies)
    && Array.isArray(applies.jurisdictions)
    ? applies.jurisdictions.filter((value) => typeof value === 'string') : [];
}

/** The existing resolver's exact any-overlap inclusion rule. */
export function matchesLegacyJurisdictions(applies, asked) {
  return asked.length === 0 || applies.length === 0 || applies.some((value) => asked.includes(value));
}
