// src/pdf-reader/engine/layer-proto/hide.mjs
// A drawn unit's page as the reader shows it over our wrapped page (docs/route/ocg-erasure.md §4.1): the groups it hides there,
// what of its own ink its reading keeps and is shown again from a render that holds it, and the rectangles its crops are cut
// through. The ink goes by its groups alone (H1): nothing here erases; the rectangles only say where a paste or a crop lands.
//
// - Its text (`u<id>`) is hidden on every page it is drawn on.
// - Its placeholders (`u<id>.p`) are hidden on a page where one of them is not kept where it stands (drawn as a crop, or as text in
//   the translation): its placeholders the reading keeps there, and its displays, are then shown again from render B (every unit's
//   text and label hidden, every placeholder shown), through their segments. Where all are kept, the group stays shown.
// - Its label (`u<id>.l`) is hidden where the reading draws it in the target's form; else it stays shown.
// - A babel name that leads it (RUN_IN) is hidden with it (`n<occ>`).
// - The lines its reading keeps as the original's and the characters it keeps or accounts for nowhere (`keep`, `orphan`) are its
//   own text, hidden with it: they are shown again from render C (every group shown), through their boxes (`pastedKeep`).
//
// Pure: no DOM, no clock. An original module (no port statement), importing only relative modules.
import { PH_FLAG } from '../layout/file.mjs'
import { displayIdsOf } from './units.mjs'
import { labelGroup, nameGroup, placeholderGroup, textGroup } from './visibility.mjs'

/** how far a crop's clip and a paste reach past the boxes they are cut through, PDF units: a glyph's antialiased edge */
export const CLIP_PAD = 0.6

const partsOf = r => r.parts ?? [r]
const real = c => !c.sep && !c.space && /\S/.test(c.ch)
const charBox = c => [c.x0, c.yb - 0.22 * c.size, c.x1, c.yb + 0.78 * c.size]
const grow = (b, d) => [b[0] - d, b[1] - d, b[2] + d, b[3] + d]
const boxesOf = e => { const out = []; for (let q = 0; q + 3 < (e?.length ?? 0); q += 4) out.push([e[q], e[q + 1], e[q + 2], e[q + 3]]); return out }
const segsOn = (row, page) => { const S = row.segs, out = []; for (let o = 0; o + 5 < S.length; o += 6) if (S[o] === page) out.push([S[o + 1], S[o + 5], S[o + 3], S[o + 4]]); return out }
/** a placeholder's segments on a page with their baselines: [{ box, base }] */
const segsWithBase = (row, page) => { const S = row.segs, out = []; for (let o = 0; o + 5 < S.length; o += 6) if (S[o] === page) out.push({ box: [S[o + 1], S[o + 5], S[o + 3], S[o + 4]], base: S[o + 2] }); return out }

/**
 * Unit `id`'s page `page` (the layout file's unit `lu`, its pieces' rows `kOf`, its lines as the run took them `lines`, its reading
 * `prep`, the babel name it leads there `nm` or null, `has(group)` whether the document holds a group). Every box [x0, y0, x1, y1], PDF units, y up. Returns:
 * - `off`: the groups it hides on the page;
 * - `fromB`: the boxes shown again from render B (its kept placeholders and displays, where its placeholders' group is hidden);
 * - `fromC`: the boxes shown again from render C (its kept lines and characters);
 * - `clips`: each crop cut from this page, by the piece's index: `rects` grown by CLIP_PAD, `own` as they are;
 * - `hidden`: the rectangles its hidden ink lies in, less what is shown again (the links' question of what was taken away);
 * - `shown`: its own ink left on the page, which the right pane lights with it (the owner, 2026-10-30: a block lights whole, its kept
 *   pieces and its label with it; a display a block of its own): [{ kind, box, base, k?, id? }] — each display's segments
 *   (`display`, its hover id `id`: units.mjs displayIdsOf, the view's own numbering), each placeholder kept where it stands
 *   (`piece`), its label where it is not drawn anew (`label`), each character its reading keeps or accounts for nowhere (`char`);
 *   its kept lines are its text's, in the word table already (layer2.mjs keptLines). Boxes as they are, not grown.
 */
export function unitHiding({ page, id, lu, kOf, lines, prep, nm = null, has = () => true }) {
  const off = [textGroup(id)]
  const fromB = [], fromC = [], hidden = []
  const keepKeys = new Set(prep.keep ?? [])
  const resolutions = [...prep.values()].filter(r => r && r.k !== undefined)
  const keptK = new Set(resolutions.filter(r => r.mode === 'kept').map(r => kOf[r.k]).filter(k => k >= 0))
  // its lines on the page: their erase rectangles hidden, those its reading keeps shown again from C
  lines.rects.forEach((r, i) => {
    if (r[0] !== page) return
    const j = lines.jOf?.[i] ?? lines.lineOf.get(r)
    if (j === undefined) return
    if (keepKeys.has(`${r[0]}|${r.slice(1).join()}`)) fromC.push(...boxesOf(lu.erase[j]))
    else hidden.push(...boxesOf(lu.erase[j]))
  })
  // each crop cut from this page, through its placeholder's segments; any makes its placeholders' group hidden here
  const clips = new Map()
  for (const r of resolutions) {
    if (r.mode !== 'crop' || !partsOf(r).some(q => q.page === page)) continue
    const row = lu.ph.get(kOf[r.k])
    if (!row) continue
    const own = segsOn(row, page)
    if (own.length) clips.set(r.k, { rects: own.map(b => grow(b, CLIP_PAD)), own })
  }
  // its placeholders' group hidden where one of them is not kept where it stands (drawn as a crop or as text elsewhere): then those
  // kept, and its displays, shown again from B through their segments
  const rowsOn = [...lu.ph].filter(([, row]) => !(row.flags & (PH_FLAG.LOST | PH_FLAG.EMPTY))).map(([k, row]) => [k, row, segsOn(row, page)]).filter(([, , segs]) => segs.length)
  const moved = rowsOn.some(([k, row]) => row.kind !== 'display' && !keptK.has(k))
  if (moved) {
    off.push(placeholderGroup(id))
    for (const [k, row, segs] of rowsOn) {
      if (row.kind === 'display' || keptK.has(k)) fromB.push(...segs)
      else hidden.push(...segs)
    }
  }
  // (what of them the page keeps: every display, each in its own block, and the placeholders kept where they stand — all of them
  // where none moves, its group then shown)
  const shown = []
  const displayIds = displayIdsOf(id, [...lu.ph].filter(([, row]) => row.kind === 'display' && row.segs.length >= 6).map(([k]) => k))
  for (const [k, row] of rowsOn) {
    if (row.kind === 'display') for (const s of segsWithBase(row, page)) shown.push({ kind: 'display', k, id: displayIds.get(k) ?? null, ...s })
    // (a piece whose group the document does not hold stays shown however it is drawn: the wrap could not part its ink)
    else if (!moved || keptK.has(k) || !has(placeholderGroup(id))) for (const s of segsWithBase(row, page)) shown.push({ kind: 'piece', k, ...s })
  }
  // its label: hidden where it is drawn in the target's form, a lead's name with it
  // (a label whose group the page does not hold, merged into the text's past the page's bounds, goes with the text: shown again
  // from C where the reading keeps it)
  const lb = lu.labels
  for (let o = 0; o + 6 < lb.length; o += 7) {
    if (lb[o + 1] !== page) continue
    const box = [lb[o + 2], lb[o + 6], lb[o + 4], lb[o + 5]]
    if (prep.label?.drawn) { if (!off.includes(labelGroup(id))) off.push(labelGroup(id)); hidden.push(box) }
    else { if (!has(labelGroup(id))) fromC.push(box); shown.push({ kind: 'label', box, base: lb[o + 3] }) }
  }
  if (nm) { off.push(nameGroup(nm.occurrence)); hidden.push([nm.x0, nm.bottom, nm.x1, nm.top]) }
  // the characters its reading leaves where they are: those it keeps (not on a kept line, not a label it draws anew) and those it
  // accounts for nowhere
  const relabelled = new Set(prep.label?.drawn ? prep.label.chars.map(c => `${c.page}|${c.item}|${c.k}`) : [])
  for (const c of prep.uc ?? []) {
    if (c.page !== page || !real(c)) continue
    const key = `${page}|${c.item}|${c.k}`, cat = prep.cat?.get(key)
    if (cat === 'orphan' || (cat === 'keep' && !relabelled.has(key) && !keepKeys.has(`${c.page}|${c.rect.join()}`))) { fromC.push(charBox(c)); shown.push({ kind: 'char', box: charBox(c), base: c.yb }) }
  }
  return { off, fromB: fromB.map(b => grow(b, CLIP_PAD)), fromC: fromC.map(b => grow(b, CLIP_PAD)), clips, hidden, shown }
}
