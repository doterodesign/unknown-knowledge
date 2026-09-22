/** Registry membership from its authoritative parsed document. */
import { validateRecord } from './validate-record.js';

/**
 * Duplicate declarations are errors, never reconciled into approval. `rows`
 * retains unique original entries for the loader's typed authorizer edges;
 * consumers must require ok before using either membership set.
 */
export function indexRegistryValues(document) {
  const { errors } = validateRecord('registry', document);
  const result = { ok: errors.length === 0, minted: new Set(), suppressed: new Set(), rows: [], diagnostics: [...errors] };
  if (!result.ok) return result;
  const declared = new Map();
  for (const [index, entry] of document.values.entries()) {
    const status = entry.status === 'suppressed' ? 'suppressed' : 'minted';
    const first = declared.get(entry.value);
    if (first !== undefined) {
      result.diagnostics.push({ code: 'duplicate-registry-value', path: `values[${index}].value`,
        message: first === status
          ? `value "${entry.value}" is declared twice, both times as ${status} — a value is declared once, and a duplicate row leaves two warrants with no way to tell which one governs`
          : `value "${entry.value}" is declared as both ${first} and ${status} — a registry cannot mint and refuse the same value, and resolving the contradiction by file order would be a governance decision nobody made` });
      continue;
    }
    declared.set(entry.value, status);
    result[status].add(entry.value);
    result.rows.push({ index, entry });
  }
  result.ok = result.diagnostics.length === 0;
  return result;
}
