# The content-class ledger (lab/pdf/spikes/ledger.mjs)

Stage 1 of `docs/route/orphan-text.md`: our final pass as `wrapFinal` wraps it, and its ledger (`layout/ledger.mjs`), each paper's
letters by content class (`rules/content-classes.mjs`). Counts and ids only.

## Run of 2026-10-25 (engine `feat/generated-text` on `next` 37d84180)

The gate pack's bases (fx-next, made 2026-10-24), the pack's sources, the marking's texts:

| Paper | Units | Letters | Built classes % | Body % | References % | Tables % | Figures % | Contents % | Heads % | Orphan letters | ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1512.03385v1 | 320 | 41,682 | 87.2 | 83.9 | 10.3 | 3.0 | 2.4 | 0 | 0 | 0 | 423 |
| 1706.03762v7 | 176 | 28,963 | 81.3 | 77.7 | 17.4 | 2.4 | 0.5 | 0 | 0 | 0 | 485 |
| 1810.04805v2 | 282 | 48,159 | 79.8 | 77.8 | 17.7 | 1.8 | 1.8 | 0 | 0 | 0 | 319 |
| 2307.16209v1 | 466 | 193,077 | 88.6 | 88.5 | 4.7 | 0.1 | 0 | 4.3 | 1.6 | 883 | 1,973 |
| 2608.04322v1 | 312 | 51,547 | 78.5 | 73.2 | 18.0 | 5.1 | 2.2 | 0 | 0.7 | 0 | 494 |
| 2608.16117v1 | 123 | 66,410 | 83.9 | 83.8 | 15.8 | 0 | 0 | 0 | 0 | 196 | 495 |
| 2609.26457v1 | 134 | 68,549 | 61.4 | 59.7 | 33.7 | 1.6 | 2.8 | 0 | 1.7 | 7 | 496 |

Pack: 498,387 letters, built classes (body, generated, tables, names) 81.8 %, orphans 1,086 letters (0.22 %) in 3 papers, 46 rows
of invariant (o): a thesis's title pages and its "ABSTRACT" and "RESUMO" (2307.16209), affiliations (2608.16117), an "and"
between authors and one heading (2609.26457).

Two wider sets, the same engine (not the pack; local bases):
- 116 papers (`bt-wide`, 2026-10-24, current units): built 85.5 %, orphans 2.31 % of letters, in 81 papers, 3,070 rows.
- 50 papers (staging's bases of the 53-paper corpus, no units: every unit's class the body's): built 80.8 %, orphans 3.91 %, in 40
  papers, 2,178 rows.

In both, most orphan letters are REVTeX's: its bibliography, which no babel name opens (stage 4's `\bibitem` points), and its
affiliations and dates, which the front end cuts but the marks do not own (a coverage defect the invariant now names); then
prose no unit holds (2610.21377 pp 34–43, 2610.19159's trajectories). The ledger's own cost, beside `ownOf`'s, on 2307.16209 (147
pages, 243,732 glyphs): 39–79 ms against 180 ms, the pages' reading 1,140 ms.
