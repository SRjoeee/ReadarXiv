// lab/typeset/parity/pairs.mjs: the pairs the parity check draws, each a paper of lanes/L1-papers87.tsv with a target whose
// rows today's reader laid (the release's stored rows: baseline/reader/<pair>.reader.json), the paper's L1 bundle and the
// tap's ledger. The two the maintainer reads first, then twenty chosen so that every class of page the maintainer's faults
// were found on is drawn: two columns, tables (cells), theorem and proof (theorem units), figures (figure texts and
// captions), footnotes, and CJK targets (zh, ja) beside a Latin one (de); one target a paper. Counts from
// baseline/prepare/<paper>.prepare.json (2026-11-08): pages, two columns (a third of the body's lines or more right of the
// page's middle), cells, theorems, captions, figure texts, footnotes.
// 2303.11366v4 (the maintainer's title on staging) is asked first but has no inputs in lab-data (no compile, no bundle, no
// rows): render.mjs names it missing on the sheet rather than draw it from anything else.
export const FIRST = ['2303.11366v4-zh', '1706.03762v7-zh', '1810.04805v2-zh']
export const PAIRS = [
  '1706.03762v7-zh', // 15 p, one column, 63 cells, footnotes 5: Table 4 and the acknowledgement's run-in head (p10)
  '1810.04805v2-zh', // 16 p, two columns, 97 cells, footnotes 11
  '1512.03385v1-zh', // 12 p, two columns, 194 cells, 181 figure texts
  '2608.25210v2-zh', // 18 p, two columns, 205 cells, 24 theorems, footnotes 5
  '2610.17024v1-zh', // 23 p, two columns, 164 cells, 34 theorems, footnotes 6
  '2609.36054v2-zh', // 14 p, two columns, 16 footnotes
  '2610.30034v1-zh', // 15 p, two columns, 80 theorems, footnotes 7
  '2610.40645v1-ja', // 39 p, 140 theorems, ja
  '2602.23285v2-ja', // 19 p, 78 cells, 74 figure texts, ja
  '2609.20976v1-ja', // 14 p, 14 cells, ja
  '2610.20484v1-zh', // 11 p, two columns, 16 theorems
  '2610.21312v1-zh', // 13 p, two columns, 79 cells, 23 theorems, 142 figure texts
  '2608.06701v1-zh', // 12 p, two columns, 176 cells, 468 figure texts, footnotes 7
  '2610.20967v1-zh', // 5 p, two columns, 36 cells, 58 figure texts
  '2610.21313v1-zh', // 5 p, two columns, 41 cells, 150 figure texts
  '2610.21880v1-zh', // 5 p, two columns, 15 captions, footnotes 4
  '2610.21106v1-zh', // 14 p, one column, 20 theorems, footnotes 2
  '2610.10069v1-zh', // 27 p, one column, 61 theorems, footnotes 7
  '2608.16117v1-de', // 40 p, one column, 47 captions, footnotes 6, de (a Latin target: word spaces)
  '2610.22065v1-zh', // 7 p, two columns, 26 cells, 120 figure texts
  '2610.21504v1-zh', // 7 p, two columns, 20 cells, 17 figure texts
  '2608.04322v1-zh', // 13 p, two columns, 180 cells, 237 figure texts
]
