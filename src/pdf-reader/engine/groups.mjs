// A table's consistency groups (the table-groups brief, 2026-10-07): the cells a reader compares with one another are
// translated whole or kept whole. Three things used to decide each cell alone — the engine giving some cells back as
// they went (it judged them names), the pipeline keeping some (nameCells), and the layer drawing some — so that one
// column read "ByteNet", "Deep-Att + PosUnk Ensemble" in English beside "GNMT + RL Ensemble" in Japanese. Here a group
// is decided once, after translation and before anything is set from it: the final's compile and the layer read the
// same decision (live.mjs runLive applies it; the record keeps it, cache.mjs unitsOf).
//
// The groups follow the table's own structure, which the TeX front end reads from the source (latex-front.mjs
// tableGrid): the header's cells are one group, and below it each column's cells another, a cell spanning several
// columns (\multicolumn) one with the cells spanning the same columns, a cell spanning rows (\multirow) its column's.
// A cell outside any table read so is no group's and is decided alone, as before.
//
// The decision: a column of which at least NAMES_SHARE of the cells came back from the translator as they went (the
// brief's half, measured lower) is a column of names (models, datasets, methods), kept whole in the source; any other
// is translated whole. A cell the
// pipeline keeps as a name before asking (nameCells) counts as one that came back as it went: that is what it is kept
// for, and asked alone a name may come back as a word. The header's cells are descriptive ("Model", "Training Cost")
// and translated as a group. A group one of whose cells the translator could not take whole (none, partial) cannot be
// translated whole, and is kept whole; one with a cell not yet in, or lost to the service, is not decided yet and waits
// in the source — the original rather than half a translation.
import { plainSource, plainTranslated } from './mt.mjs'

/**
 * The share of a column's cells that must come back from the translator as they went for the column to be read as
 * names and kept. Measured on the 29 layer-lab fixtures and six corpus papers whose tables Microsoft had answered
 * (lab/pdf/spikes/table-groups.mjs, 2026-10-07): of 331 and 84 decided columns, 115 and 51 came back
 * all changed and 121 and 20 all as they went; between 0.3 and 0.7 stand 21 distinct columns, read one by one. Columns
 * of names of models and methods stand at 0.40–0.46 — 1706.03762's Model column in Chinese, Japanese and Korean
 * (ByteNet, … "Transformer (big)" in katakana), 2608.04322's selection methods (Paraphrase, Longest), 2608.12502's
 * training schemes —, the one column of words below 0.5 at 0.40 (2608.02163's Pearson, Spearman, Accuracy, Agreement).
 * At a half the first were translated, one name in two coming back as a word; at 0.4 they are kept, as the other
 * targets keep them, and the column of words with them — the original where the decision is close. 0.35 decides those
 * columns alike; below 0.33 columns of descriptions with a name or two in them go to the source
 */
export const NAMES_SHARE = 0.4

/** a cell's group: `<table>:h` for the header's cells, `<table>:c<col>` for a column's, `<table>:c<col>+<span>` for the
 *  cells spanning the same columns; null for a unit outside a table read by its structure */
export function groupOf(u) {
  const c = u?.cell
  if (!c) return null
  return c.head ? `${c.table}:h` : `${c.table}:c${c.col}${c.span > 1 ? `+${c.span}` : ''}`
}

/** a text with its white space gone and each letter that stands alone lower case: what "came back as it went" compares */
const bare = s => s.normalize('NFC').replace(/(?<![\p{L}\p{N}])\p{L}(?![\p{L}\p{N}])/gu, l => l.toLowerCase()).replace(/\s+/gu, '')
/** whether a translation is its source but for white space and the case of single letters */
export const unchanged = (src, tr) => bare(src) === bare(tr)

/**
 * The groups of `units` decided over what has come in. `answer(u)` → { state, pieces } of a unit's translation so far
 * (live.mjs: its result's state, the pieces a compile would set), undefined for none yet; `kept` the units kept as
 * names before asking. Returns `keep`, the units of the groups kept whole (names, or a cell the translator could not
 * take), `wait`, those of the groups not decided yet, and `groups`, each group's decision by key — `translate`, `names`,
 * `untranslatable` or `waiting` — with its cells and how many came back as they went (the measures read them). A unit
 * of no group is in neither set.
 */
export function decideGroups(units, answer, kept = new Set()) {
  const members = new Map()
  for (const u of units) {
    const g = groupOf(u)
    if (!g) continue
    // a cell is its grid place: the units of one cell (a nested table's lines, \makecell's) are one member
    const at = `${u.cell.row}:${u.cell.col}`
    if (!members.has(g)) members.set(g, new Map())
    const cells = members.get(g)
    if (!cells.has(at)) cells.set(at, [])
    cells.get(at).push(u)
  }
  const keep = new Set(), wait = new Set(), groups = new Map()
  for (const [g, cells] of members) {
    let same = 0, waiting = false, untranslatable = false
    for (const us of cells.values()) {
      let cellSame = true
      for (const u of us) {
        if (kept.has(u)) continue
        const a = answer(u)
        if (!a || a.state === 'lost') { waiting = true; cellSame = false; continue }
        if (a.state !== 'whole') { untranslatable = true; cellSame = false; continue }
        // (whole, but not in what is set now: a compile's snapshot taken before it came)
        if (!a.pieces) { waiting = true; cellSame = false; continue }
        if (!unchanged(plainSource(u), plainTranslated(a.pieces))) cellSame = false
      }
      if (cellSame) same++
    }
    const head = g.endsWith(':h')
    const decision = waiting ? 'waiting' : untranslatable ? 'untranslatable' : !head && same >= NAMES_SHARE * cells.size ? 'names' : 'translate'
    groups.set(g, { decision, cells: cells.size, same, units: [...cells.values()].flat() })
    if (decision === 'translate') continue
    for (const us of cells.values()) for (const u of us) if (!kept.has(u)) (decision === 'waiting' ? wait : keep).add(u)
  }
  return { keep, wait, groups }
}
