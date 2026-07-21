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

Do not create crops. Do not record `x`, `yEnd`, width, height, rectangles, page ranges, `sourcePages`, or an `images` array. Only the statement and proof starting page/Y are needed for scrolling. The current example JSON and viewer still contain legacy bounding-box data; do not copy that legacy representation into new conversions.

Optional fields such as `role` and `proofNote` may explain navigation or unusual proof organization, but they must not replace or alter the exact statement or proof. If the paper gives no theorem title, a conservative short `title` may be added for navigation; it is editorial and must not be inserted into `statementHtml`.

## Extraction procedure

1. Verify the PDF identity and its matching record in `accepted-papers-metadata.json`. The JSON `id` and filename must equal the basename of that record's `pdf_path`. If the record is absent or ambiguous, stop and report it; do not invent metadata.

2. Read the whole PDF, not only grep hits or selected pages. At minimum, run `pdfinfo`, extract the complete file with `pdftotext -layout`, and review the text in manageable consecutive chunks from first page to last page. Also render the complete PDF to page images (for example with `pdftoppm`) and visually scan every page; then inspect every statement and proof page at a legible resolution. Page images are required evidence because `pdftotext` can lose or corrupt mathematical notation and layout.

3. Build a complete inventory of numbered theorem-like results and their proofs: Theorem, Lemma, Proposition, Corollary, Claim, Fact, Observation, and any paper-specific equivalent. Include a main theorem whose proof is an entire later section, and connect deferred appendix proofs to their result. Exclude definitions unless explicitly requested. Reconcile the final JSON count against this inventory.

4. If official author LaTeX source is available, inspect all source files and theorem/proof environments. It is usually the safest transcription source, but the supplied PDF is the authoritative version and layout: confirm that source version, numbering, statement, and proof agree with the PDF. If they differ, follow the supplied PDF and document the discrepancy.

5. Transcribe the complete statement and the proof as the paper presents them. Preserve wording, equations, logical order, case splits, proof sketches, and composite organization. Check every formula symbol-by-symbol against the rendered PDF page or matching author source; never trust extracted text alone for mathematics. Pay particular attention to subscripts, superscripts, accents, inequality direction, minus signs, norm/absolute-value bars, calligraphic and blackboard-bold letters, cases, aligned rows, and equation numbers. Do not “improve,” shorten, silently repair, or formalize the mathematics. Do not omit surrounding proof text merely because it is outside a `proof` environment.

6. Convert to semantic HTML (`p`, lists, tables where needed) with MathJax delimiters `\(...\)` and `\[...\]`. Expand author-only LaTeX macros or add a justified viewer macro; remove source-only commands such as labels. Check every formula in the browser. Automated Pandoc/LaTeX conversion is a starting aid, not evidence of fidelity.

7. Run `pdftotext -bbox-layout` and locate the first line of each statement and proof. Verify each page/Y visually against the rendered PDF. Do not estimate coordinates from screenshot pixels unless they are converted to the documented top-origin PDF-point system.

8. Encode cross-result dependencies with stable IDs such as `lemma-3-1`; every dependency must resolve to an included result. Preserve the printed result type exactly so a lemma is encoded as `"type": "Lemma"`, not inferred from its number or title.

## Due-diligence checks

Before declaring completion:

- Parse the JSON and confirm the top-level paper object has exactly `id` and `theorems`.
- Check that result IDs are unique, dependency IDs resolve, and numbering/type match the PDF.
- Compare every statement and proof against the rendered PDF page images and, when available, the matching author source; verify every equation visually rather than relying on `pdftotext`.
- Confirm every inventoried proved result occurs exactly once; investigate omissions and duplicates.
- Confirm each `pdfStart` opens the original PDF at the beginning of the correct statement or proof.
- Render every entry through `web/paper-viewer.html`; check MathJax, internal links, typography, and browser-console errors.
- Run `node build-accepted-catalog.js`. Metadata shown by both HTML pages must come from `accepted-papers-metadata.json`, never from the paper JSON.
- Serve with `node serve-theorem-reader.js` and smoke-test the catalogue, theorem selection, local JSON link, full scrollable PDF, and PDF navigation.

Keep rendered pages and other temporary extraction files outside the corpus. They are inspection aids, not deliverables. The deliverable is the verified paper JSON; do not add per-paper HTML, copied metadata, cropped images, or handwritten catalogue entries.
