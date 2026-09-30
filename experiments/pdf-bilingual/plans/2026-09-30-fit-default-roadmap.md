# FIT default: production priority and acceptance

2026-09-30, owner direction. DESIGN §16 delegates PDF-specific design to these plans and REPORT.
This roadmap changes priorities; it does not enable FIT in the reader or mark a release as accepted.

## Product priority

FIT is the first optimization target. The owner considers the current five-language FIT output strong enough to
defer small differences in translated length, including slightly shorter Korean text. First make its implementation
general, efficient and stable, then replace the PDF reader's current translation layout with FIT as the default.
After that acceptance, refine local paragraph correspondence, page layout and length through controlled language
experiments while preserving natural typography. Equal page counts alone are not a quality target.

The H-rule comparison remains a secondary research/control track. Native-PDF block replacement is supporting
performance research, not the current replacement for FIT and not a reason to defer its production work.

## Verified implementation gap

At this checkout, `spikes/visual-eval.mjs` creates FIT through translated-document trial compiles and measured
original/translated unit heights. CJK can take three translated-document compiles; alphabetic scripts take two or
three. The original/font probes and each compile's normal TeX reruns are additional work. The production reader's
`src/pdf-reader/engine/live.mjs` does not call this FIT procedure; it uses its own draft/final compile scheduling.
This is a code audit of the checkout, not verification of which build is deployed for users.

Moving the experiment's trial loop directly into the reader would add work. Removing it does not establish that
the same visual result survives. Both performance and visual equivalence need evidence before default activation.
Existing language-dependent fonts, encoding, hyphenation and space handling remain needed. The fitting mechanism
should stay shared, with explicit writing-system/language data, rather than a separate algorithm per language.

## Delivery sequence

1. Pin a reproducible baseline for the current reader and accepted experimental FIT: same source, translated text,
   compiler resources and device. Reproduce outstanding title/table/author/overflow flags separately from minor
   language length differences. Fix shared defects before attributing them to a language profile.
2. Extract the common FIT policy and explicit typography bounds into a reusable design. Keep body typography,
   headings, front matter, captions, table cells and untouched source graphics distinct. Preserve the paper's own
   baseline and font roles; no forced page lock or scaling an entire figure/table to repair paragraph length.
3. Implement and validate a runtime candidate without additional whole-paper FIT calibration compiles. Offline
   measurements may inform bounded profiles or a deterministic estimate; neither is assumed to reproduce measured
   FIT until compared. If equivalent quality needs extra trials, that candidate fails the performance requirement.
4. Integrate the accepted candidate into existing reader scheduling, cache/version semantics and compiler fallback.
   Reopening must reuse valid output; changed layout policy must invalidate typeset output while retaining valid
   translated text. Confirm cancellation, service/language changes, missing glyphs and failed compiles recover.
5. Activate FIT as the default only after the browser quality/performance gates pass. Deployment is a separate step;
   the current default remains until this candidate is accepted. Expand the corpus after the small review round
   has no obvious failures, in keeping with the owner's five-paper review preference.

## Performance and quality gates

- Compare first readable translation, local/preview update latency, final output latency, compiler calls, font/file
  transfers, main-thread work and memory against the current reader, on the same cached text. Include cold startup,
  warm updates and reopen, and report failures rather than timings only for successful regions.
- No added whole-document trial loop for FIT. Existing TeX draft/final reruns must be counted, not labelled a zero
  compile path. The eventual real-time block-replacement requirement remains separate: the current TeX reader still
  compiles documents, and the native overlay prototype has not passed coverage or end-to-end acceptance.
- Establish no regression in measured runtime performance before default activation. The native prototype's warm
  sub-millisecond fitting is not an end-to-end reader baseline and cannot substitute for this comparison.
- No lost translated content, missing figures/tables, unreadable table scaling, missing glyphs or visible overflow.
  Check titles, authors, captions, cell contents, references and inline math as well as body paragraphs. Minor
  translation-length/page differences are acceptable in this stage when readability and content are preserved.
- Required repository checks and actual browser PDF behavior must pass; test success alone is not visual acceptance.

## Language refinement after the default is stable

Freeze source, translation/provider/model, compiler/resources, font family, shared mechanism and all parameters
except the one under study. Change one of size, tracking, leading, or a justified role-specific rule at a time;
check paragraph occupation, page/column drift, readable typography and runtime costs together. Keep all five
languages as regression controls. Choose each next language by remaining reproduced issues, not a fixed length
ratio or an assumption that every CJK language shares the same natural spacing.
