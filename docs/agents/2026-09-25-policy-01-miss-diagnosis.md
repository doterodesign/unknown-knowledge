# Held-out miss diagnosis: one policy case, current runtime, one of three repeats

Sanitized report. It contains no case prompt, expected answer, record titles, passage names,
quotes or record IDs. The full findings are in the custody directory (`diagnosis-policy-01.md`).

## Primary cause: `grader-error`

The reader had both gold-bundle records, cited them accurately, and gave the correct answer.
The grader sees tool-call inputs (file paths) but not their outputs. It flagged two citations
as fabricated or unsupported that match the read files word for word, or nearly so.

## Method

The policy installation was rebuilt for both runtimes and every engine command from all six
sessions was replayed in the installation root. Replayed output sizes match the recorded trace
byte counts, apart from a trailing newline.

## Answers

1. **Retrieval.** In the failing repeat, the first `ask` returned both gold records at ranks 1
   and 2 of 8. A second, differently worded `ask` returned one gold record at rank 5. The reader
   also opened both gold records and both source files. The two passing current-runtime repeats
   used different wording: their `ask` also returned both gold records at ranks 1 and 2 (in the
   reverse order). All three original-runtime repeats got zero results from `resolve` and found
   both gold records through the decisions catalog. Retrieval was not the problem.
2. **Misleading engine output.** No engine output led the reader to a wrong claim. The store
   has two ambiguities that affected the grader:
   (a) After the current runtime's identity migration, one gold record keeps its pre-migration
   file name while its entry carries a new ID. `ask` shows both, so the reader could see the
   mapping, but a grader that sees only paths cannot.
   (b) Some record bodies use source-local IDs, and those IDs collide with different store
   records. In the current runtime, one of these in-body IDs also matches the new ID of a gold
   record.
3. **Grader verdict: incorrect.** The citation flagged as a misquote is verbatim text from a
   read record, attributed to the right source. The record the grader called "never read" was
   read under its pre-migration file name. Its quote is a small tense paraphrase inside
   quotation marks. An original-runtime repeat used the same wording and passed. Both passing
   current-runtime repeats quoted the same clause as the failing one and passed too. The only
   visible difference is that they stated the ID-to-file mapping in the answer. The correct
   verdict for the failing repeat is `completed`.
4. **Primary cause:** `grader-error`. The contributing factor is the file-name/ID mismatch left
   by migration, together with in-body source-local IDs.
5. **Original runtime:** unlikely to fail the same way. There, the gold record's ID matches its
   file name, so a citation always lines up with a read path. The in-body ID collision exists in
   both runtimes. An original-runtime answer quoted the same clause and passed.

## Recommended fixes (generic)

- **Grader:** give the grader the tool outputs, or an index from each read path to the record
  IDs it contains, or the migration's old-to-new mapping. Citations could then be checked
  against content instead of file paths. Consider regrading this repeat under that input.
- **Runtime:** when identity migration assigns a new ID, rename the entry file to match, or
  record the mapping where readers and tools see it, so that cited IDs and read paths agree.
- **Evaluation corpus:** rewrite in-body source-local IDs to store IDs during materialization,
  or mark them as source-local, so they cannot collide with real store IDs.
