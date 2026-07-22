---
name: pdf-to-theorem-json
description: Convert an accepted research-paper PDF into source-faithful theorem-and-proof JSON for the PACMan reader using full-document text and image review, author-source cross-checking, PDF start coordinates, MathJax HTML, dependency encoding, and browser validation. Use when asked to extract all numbered theorem-like results and proofs from a PDF, create an accepted paper JSON named after its PDF slug, or prepare theorem data for web/paper-viewer.html.
---

# Converting a paper PDF to theorem JSON

This is production research infrastructure for a nationwide project, not a hobby or demo. Work slowly enough to be complete and auditable. Never guess missing text, theorem types, numbering, proof boundaries, metadata, or PDF locations.

## Required output

For `accepted/<slug>.pdf`, create `accepted/<slug>.json`. The paper JSON contains no bibliographic metadata: its only top-level fields are `id` and `theorems`. Title, authors, year, venue, arXiv, DOI, Semantic Scholar URL, checksum, and PDF path belong only in `accepted-papers-metadata.json`.

Use source-faithful, human-readable HTML and MathJax, not Lean, Isabelle, paraphrases, or proof summaries. A minimal result has this form:

```json
[
  {
    "id": "<slug>",
    "theorems": [
      {
        "id": "theorem-3-2",
        "type": "Theorem",
        "number": "3.2",
        "title": "Short navigation title",
        "section": "3.1 Section title",
        "proofOrganization": "direct",
        "dependencies": ["lemma-3-1"],
        "statementHtml": "<p>Exact statement text ...</p>",
        "proofHtml": "<p>Exact proof text ...</p>",
        "pdfStart": {
          "statement": { "page": 12, "y": 184.2 },
          "proof": { "page": 13, "y": 72.6 }
        }
      }
    ]
  }
]
```

`page` is one-based. `y` is the vertical coordinate in PDF points measured from the top of the page, normally the `yMin` of the first printed line from `pdftotext -bbox-layout`. Record the beginning of the theorem label/statement and the beginning of the actual proof. For a deferred or composite proof, the proof location is where that proof really begins, even if it is on a later page or in another section.

If the paper gives no proof, set `proofHtml` to `""` and omit `pdfStart.proof`. Never duplicate the statement coordinate as a fake proof coordinate. Prefer stable `proofOrganization` values such as `direct`, `deferred`, `composite`, `immediate-preceding`, `stated-without-proof`, `quoted-without-proof`, `cited-without-proof`, or `omitted`; put paper-specific nuance in `proofNote` rather than inventing a new value.

Do not create crops. Do not record `x`, `yEnd`, width, height, rectangles, page ranges, `sourcePages`, or an `images` array. Only the statement and proof starting page/Y are needed for scrolling. Old examples may contain legacy bounding-box data; do not copy it into new conversions. The checked-in viewer derives page labels and scroll destinations from `pdfStart` at runtime.

Optional fields such as `role` and `proofNote` may explain navigation or unusual proof organization, but they must not replace or alter the exact statement or proof. If the paper gives no theorem title, a conservative short `title` may be added for navigation; it is editorial and must not be inserted into `statementHtml`.

## Extraction procedure

1. Verify the PDF identity and its matching record in `accepted-papers-metadata.json`. The JSON `id` and filename must equal the basename of that record's `pdf_path`. If the record is absent or ambiguous, stop and report it; do not invent metadata.

2. Read the whole PDF, not only grep hits or selected pages. At minimum, run `pdfinfo`, extract the complete file with `pdftotext -layout`, and review the text in manageable consecutive chunks from first page to last page. Also render the complete PDF to page images (for example with `pdftoppm`) and visually scan every page; then inspect every statement and proof page at a legible resolution. Page images are required evidence because `pdftotext` can lose or corrupt mathematical notation and layout. Keep all extracted text, bbox XML, page images, downloaded comparison sources, and browser harnesses in a `mktemp -d` directory outside the repository.

3. Build a written inventory of numbered theorem-like results and their proofs: Theorem, Lemma, Proposition, Corollary, Claim, Fact, Observation, and any paper-specific equivalent. Record the printed type, number, statement page, proof organization, and proof page before transcription. Include a main theorem whose proof is an entire later section, and connect deferred appendix proofs to its result. Exclude definitions unless explicitly requested. Reconcile totals both overall and by type; papers can reuse a printed number or interleave types in one numbering sequence, so never infer counts from the largest numeral.

4. If official author LaTeX source is available, inspect all source files and theorem/proof environments. It is usually the safest transcription source, but the supplied PDF is the authoritative version and layout. Compare title/date, page count, result numbering, statement wording, and proof organization before treating another PDF, PostScript file, or source archive as matching. Author-hosted files are often earlier conference drafts or later revisions. If versions differ, use the supplied PDF, use the other version only as a legibility aid, and document the discrepancy.

5. Transcribe the complete statement and the proof as the paper presents them. Preserve wording, equations, logical order, case splits, proof sketches, and composite organization. Check every formula symbol-by-symbol against the rendered PDF page or matching author source; never trust extracted text alone for mathematics. Pay particular attention to subscripts, superscripts, accents, inequality direction, minus signs, norm/absolute-value bars, calligraphic and blackboard-bold letters, cases, aligned rows, and equation numbers. Do not “improve,” shorten, silently repair, or formalize the mathematics. Do not omit surrounding proof text merely because it is outside a `proof` environment.

6. Convert to semantic HTML (`p`, lists, tables where needed) with MathJax delimiters `\(...\)` and `\[...\]`. Expand author-only LaTeX macros or add a justified viewer macro; remove source-only commands such as labels. Use JSON-aware serialization where practical and parse the file immediately after each substantial write; raw patch transport commonly corrupts backslashes. Check every formula in the browser. Automated Pandoc/LaTeX conversion is a starting aid, not evidence of fidelity.

7. Run `pdftotext -bbox-layout` and locate the first line of each statement and proof. Use the containing line's `yMin`, not a later word-level coordinate. Verify each page/Y visually against the rendered PDF. Do not estimate coordinates from screenshot pixels unless they are converted to the documented top-origin PDF-point system.

8. Encode cross-result dependencies with stable IDs such as `lemma-3-1`; every dependency must resolve to an included result. Preserve the printed result type exactly so a lemma is encoded as `"type": "Lemma"`, not inferred from its number or title.

## Batch and recovery discipline

- Give each paper exactly one active writer. In concurrent batches, do not run the shared `node build-accepted-catalog.js` while another paper JSON may be half-written; build in an isolated temporary copy, then run one shared rebuild after every paper parses and validates.
- Treat a surviving JSON after a crash or interruption as an untrusted draft, even if it parses and has the expected result count. Re-read the whole PDF and re-audit every statement, proof, formula, dependency, and coordinate before resuming from it. Parsed drafts have contained shortened proofs, paraphrases, wrong equations, inequality errors, and fake proof starts.
- Do not declare completion from file presence or an inventory milestone. Completion requires the final validation report below.

## Due-diligence checks

Before declaring completion:

- Run `python3 .agents/skills/pdf-to-theorem-json/scripts/validate_theorem_json.py accepted/<slug>.json --metadata accepted-papers-metadata.json --pdf-dir accepted`. Fix every failure rather than weakening the validator.
- Parse the JSON and confirm the top-level paper object has exactly `id` and `theorems`.
- Check that result IDs are unique, dependency IDs resolve, and numbering/type match the PDF.
- Confirm `proofHtml` and `pdfStart.proof` are either both present or both absent; a cited, quoted, or omitted proof has neither proof text nor a proof coordinate.
- Compare every statement and proof against the rendered PDF page images and, when available, the matching author source; verify every equation visually rather than relying on `pdftotext`.
- Confirm every inventoried proved result occurs exactly once; investigate omissions and duplicates.
- Confirm each `pdfStart` opens the original PDF at the beginning of the correct statement or proof.
- Render every entry through `web/paper-viewer.html`; check MathJax, internal links, typography, raw delimiters, `<mjx-merror>`, and browser-console errors. Pay particular attention to `\tag` placement inside aligned environments.
- Run `node build-accepted-catalog.js` only when no concurrent writer can leave partial JSON. Metadata shown by both HTML pages must come from `accepted-papers-metadata.json`, never from the paper JSON.
- Serve with `node serve-theorem-reader.js` and smoke-test the catalogue, theorem selection, local JSON link, full scrollable PDF, and PDF navigation. HTTP 200/206 alone is insufficient: verify `PDFViewerApplication.pdfDocument.numPages`, click both statement and proof buttons when present, and confirm PDF.js scrolls to the expected page and vertical position without adding an overlay. If headless PDF.js remains at `0 of 0` or stalls on `initializedPromise`, repair or replace the temporary harness (for example with Playwright plus the system Chrome); never report navigation as passed from range serving alone.

Keep rendered pages and other temporary extraction files outside the corpus. They are inspection aids, not deliverables. The deliverable is the verified paper JSON; do not add per-paper HTML, copied metadata, cropped images, or handwritten catalogue entries.
