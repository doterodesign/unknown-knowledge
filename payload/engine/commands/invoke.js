import { readSync, openSync, closeSync } from 'node:fs';
import { parseArgs as parseFlags, UsageError } from '../lib/cli.js';
import { invoke, interfaceResultSucceeded } from '../api/index.js';

export const USAGE = 'usage: invoke.js --request <JSONfile> --max-request-bytes <bytes> --max-output-bytes <bytes>';
const capacity = value => {
  if (!/^\d+$/.test(value ?? '') || !Number.isSafeInteger(Number(value))) throw new UsageError('Supply explicit nonnegative byte capacities.');
  return Number(value);
};

export async function main(argv) {
  const { options } = parseFlags(argv, { value: ['request', 'max-request-bytes', 'max-output-bytes'] });
  if (!options.request) throw new UsageError('Supply --request.');
  const inputLimit = capacity(options['max-request-bytes']);
  const outputLimit = capacity(options['max-output-bytes']);
  // A bounded read catches concurrent growth too; stat-before-read would not.
  const fd = openSync(options.request, 'r');
  let bytes;
  try {
    bytes = Buffer.alloc(Math.min(inputLimit, 65536));
    const chunks = []; let total = 0;
    for (;;) {
      const count = readSync(fd, bytes, 0, Math.min(bytes.length, inputLimit - total), null);
      if (count === 0) break;
      total += count; chunks.push(Buffer.from(bytes.subarray(0, count)));
    }
    if (readSync(fd, Buffer.alloc(1), 0, 1, null)) throw new UsageError('Interface request exceeds --max-request-bytes.');
    bytes = Buffer.concat(chunks);
  } finally { closeSync(fd); }
  let request;
  try { request = JSON.parse(bytes.toString('utf8')); }
  catch (error) { if (!(error instanceof SyntaxError)) throw error; throw new UsageError('Request must be valid JSON.'); }
  const result = await invoke(request);
  const text = `${JSON.stringify(result)}\n`;
  if (Buffer.byteLength(text) > outputLimit) throw new UsageError('Interface result exceeds --max-output-bytes.');
  process.stdout.write(text);
  return interfaceResultSucceeded(result) ? 0 : 2;
}
