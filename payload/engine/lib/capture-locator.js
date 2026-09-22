/** Captured record locator shape; no file reads or authenticity/retention claims. */
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, required, optional = []) => object(value)
  && required.every((key) => Object.hasOwn(value, key))
  && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
const hash = (value, length) => typeof value === 'string'
  && (length ? value.length === length : [40, 64].includes(value.length)) && /^[0-9a-f]+(?![\s\S])$/.test(value);

/**
 * Exact repository-relative file/blob/SHA-256 locator, with an optional captured
 * source commit/tree. New candidate blobs need not name their enclosing commit.
 * A valid locator says nothing about whether its bytes are available or match.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isCaptureLocator(value) {
  if (!exactKeys(value, ['file', 'blob', 'sha256'], ['source'])
    || typeof value.file !== 'string' || value.file.trim() === ''
    || /[\\\0]/.test(value.file) || /^[a-zA-Z]:/.test(value.file)
    || value.file.split('/').some((part) => part === '' || part === '.' || part === '..')
    || !hash(value.blob) || !hash(value.sha256, 64)) return false;
  if (!Object.hasOwn(value, 'source')) return true;
  return exactKeys(value.source, ['commit', 'tree']) && hash(value.source.commit)
    && hash(value.source.tree) && value.source.commit.length === value.blob.length
    && value.source.tree.length === value.blob.length;
}
