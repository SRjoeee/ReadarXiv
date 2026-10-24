# The content-class ledger (lab/pdf/spikes/ledger.mjs)

Stage 1 of `docs/route/orphan-text.md`: our final pass as `wrapFinal` wraps it, and its ledger (`layout/ledger.mjs`), each paper's
letters by content class (`rules/content-classes.mjs`). Counts and ids only.

## Run of 2026-10-25 (engine `feat/generated-text` on `next` 37d84180)

The wrapped bytes, stats and ownership `wrapFinal` makes on the 7 papers equal `next`'s (sha256 compared): the ledger is read, nothing
it adds is written. The wider sets below were run before ligatures counted their letters each (a few tenths of a percent more
letters).

The gate pack's bases (fx-next, made 2026-10-24), the pack's sources, the marking's texts:

| Paper | Units | Letters | Built classes % | Body % | References % | Tables % | Figures % | Contents % | Heads % | Orphan letters | ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1512.03385v1 | 320 | 41,791 | 87.2 | 83.9 | 10.3 | 3.0 | 2.4 | 0 | 0 | 0 | 674 |
| 1706.03762v7 | 176 | 29,000 | 81.3 | 77.7 | 17.3 | 2.4 | 0.5 | 0 | 0 | 0 | 728 |
| 1810.04805v2 | 282 | 48,316 | 79.8 | 77.9 | 17.7 | 1.8 | 1.8 | 0 | 0 | 0 | 480 |
| 2307.16209v1 | 466 | 193,895 | 88.6 | 88.5 | 4.7 | 0.1 | 0 | 4.3 | 1.6 | 883 | 2,731 |
| 2608.04322v1 | 312 | 51,767 | 78.5 | 73.3 | 18.0 | 5.1 | 2.2 | 0 | 0.7 | 0 | 793 |
| 2608.16117v1 | 123 | 66,774 | 83.9 | 83.8 | 15.8 | 0 | 0 | 0 | 0 | 196 | 635 |
| 2609.26457v1 | 134 | 68,758 | 61.4 | 59.8 | 33.7 | 1.6 | 2.8 | 0 | 1.6 | 7 | 724 |

Pack: 500,301 letters (a ligature's counted as its letters), built classes (body, generated, tables, names) 81.8 % — classified ink, not drawn ink: a unit the wrap leaves the original's is counted in its class —, orphans 1,086 letters (0.22 %) in 3 papers, 46 rows
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
