// The highlight's runs as they were cut (spikes/highlight-gate.mjs, highlight-papers.mjs, highlight-sentences.mjs): a run
// names its units by their index in the cutting it was made with — its PDFs' marks (axt-<i>s), its texts, pieces and
// sentences, investigator B's units — and a change to the cutting since moves every index after it. The typesetting
// rule's (exp/flow-integration, merged 2026-10-02) cut the author block's names and places into units of their own, 1 to
// 11 more per paper on the highlight's twelve, and three of 2608.03063's otherwise: every index after them moved, and
// every number the gate read with them (anchored 0 for an abstract, floats on the wrong captions). So the units are
// taken in the runs' order, each by its source span (file, start, end, kind) as highlight-runs.units.json records the
// runs' cutting — written once from the tree that made them (a55998d9) — and a unit the tree now cuts otherwise stands
// in as one with no text: nothing anchors it, nothing lights it, and the gate counts it apart (`cut`). Units the tree
// cuts now and the runs did not (the author block's) are not the runs': left out
import { readFileSync } from 'node:fs'
import { openPaper } from '../../../src/pdf-reader/engine/live.mjs'

const CUTTING = JSON.parse(readFileSync(new URL('highlight-runs.units.json', import.meta.url), 'utf8'))

/** a paper's source files → openPaper's paper with its units as the runs cut them (`cut`: the indices the tree now cuts
 *  otherwise); a paper the record does not hold, as the tree cuts it */
export function runPaper(id, files) {
  const paper = openPaper(files), runs = CUTTING[id]
  if (!runs) return { ...paper, cut: [] }
  const now = new Map(paper.units.map(u => [`${u.file}\u0000${u.start}\u0000${u.end}\u0000${u.kind}`, u]))
  const cut = []
  const units = runs.units.map(([f, start, end, kind], i) => {
    const file = runs.files[f], u = now.get(`${file}\u0000${start}\u0000${end}\u0000${kind}`)
    if (u) return u
    cut.push(i)
    return { file, start, end, kind, pieces: [] }
  })
  return { ...paper, units, cut }
}

/** a unit's pieces as its run typeset them, pairs aside: a pair's id counts the pairs its file had before it, and a unit
 *  cut in before it (an author block's \textbf) renumbered every pair after it without changing one. Pairs are
 *  numbered again from 1 in the order they open, and the rest is compared field for field */
export const samePieces = (a, b) => {
  const own = pieces => { const ids = new Map(); return JSON.stringify(pieces.map(p => (p.id === undefined ? p : { ...p, id: ids.get(p.id) ?? ids.set(p.id, ids.size + 1).get(p.id) }))) }
  return own(a) === own(b)
}
