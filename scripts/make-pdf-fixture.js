/**
 * Build payload/adapter-fixtures/pdf/sample.pdf — the pdf adapter's fixture.
 *
 * The sample is HAND-CRAFTED rather than exported from a word processor so
 * EXPECTED.yaml is genuinely reviewable: every text-showing operation below is
 * visible in this file, so a reviewer can check the expectation against the
 * document's intent instead of against an opaque binary. It exercises exactly
 * the pdf@1 envelope and nothing beyond it:
 *
 *   page 1 — an UNCOMPRESSED content stream, with `Tj` and a `TJ` array
 *            (kerned text, the shape real PDFs emit), plus escapes: a
 *            balanced paren pair, an escaped paren, and an octal byte.
 *   page 2 — a FLATEDECODE content stream, with `'` (next-line-and-show)
 *            and a hex `<...>` string.
 *
 * Regenerate: node scripts/make-pdf-fixture.js
 * The build is deterministic — same script, byte-identical PDF — and the test
 * suite pins the committed bytes against EXPECTED.yaml, so a regeneration that
 * changed the document would fail loudly rather than drift.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const page1 = `BT
/F1 18 Tf 72 720 Td
(Odds feed onboarding) Tj
/F1 11 Tf 0 -28 Td
[(The provider must expose a websocket endpoint ) -200 (and a REST fallback.)] TJ
0 -16 Td
(Latency budget is 400ms \\(end-to-end\\), measured from ingest to price.) Tj
0 -16 Td
(Suspended \\050not settled\\051 is a distinct state.) Tj
ET
`;

const page2 = `BT
/F1 11 Tf 72 720 Td 16 TL
(Escalation) '
(Page the trading desk when the feed suspends for more than ninety seconds.) '
<50726F76696465722063726564656E7469616C73206172652073616E64626F7865642E> Tj
ET
`;

const compressed = deflateSync(Buffer.from(page2, 'latin1'));

/** Objects in file order; page objects appear before their content streams. */
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>',
  { stream: Buffer.from(page1, 'latin1'), dict: '' },
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
  { stream: compressed, dict: ' /Filter /FlateDecode' },
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
];

const chunks = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
const offsets = [];
let position = chunks[0].length;

objects.forEach((object, index) => {
  offsets.push(position);
  const header = Buffer.from(`${index + 1} 0 obj\n`, 'latin1');
  const body = typeof object === 'string'
    ? Buffer.from(`${object}\n`, 'latin1')
    : Buffer.concat([
      Buffer.from(`<< /Length ${object.stream.length}${object.dict} >>\nstream\n`, 'latin1'),
      object.stream,
      Buffer.from('\nendstream\n', 'latin1'),
    ]);
  const footer = Buffer.from('endobj\n', 'latin1');
  const full = Buffer.concat([header, body, footer]);
  chunks.push(full);
  position += full.length;
});

const xrefAt = position;
const xref = [`xref\n0 ${objects.length + 1}\n`, '0000000000 65535 f \n'];
for (const offset of offsets) xref.push(`${String(offset).padStart(10, '0')} 00000 n \n`);
chunks.push(Buffer.from(xref.join(''), 'latin1'));
chunks.push(Buffer.from(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`, 'latin1'));

const target = fileURLToPath(new URL('../payload/adapter-fixtures/pdf/sample.pdf', import.meta.url));
writeFileSync(target, Buffer.concat(chunks));
process.stdout.write(`wrote ${target}\n`);
