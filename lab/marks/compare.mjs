// lab/marks/compare.mjs: the equivalence gate's comparison (stage 1c-2 item 4), shared by gate.mjs (one paper, from its
// compiles) and replay.mjs (the kept inputs, no PDF read). Not shipped.
// Where a page of the two B's holds the same glyphs (Unicode, place to 0.01 pt), the owner of each glyph and box — its unit's
// id, role and piece — of today's instrument (lane L1's adapter) against the new one's; today's ink, kept and figure units
// count as no source unit's. Each difference is put in a class by its cause where the cause is a fact of the inputs:
//   - `stage 1c: …`: one side's owner is a unit the other side's reader does not make (its id is not among the other's units:
//     a unit stage 1c reads otherwise, lanes/L2-source.md classes 1-10);
//   - `guard: …`: today's owner is none and the new one's is a unit today's guard left unmarked (made.guard.unmarked);
//   - otherwise its two owners' roles, and whether they are units apart.
/** the differences left, by their two owners' roles, each with the cause its papers' examples show (lanes/L2-source.md, stage
 *  1c-2 item 4, run 5): what today read with a rule this port leaves out, by name */
const CAUSES = new Map([
  // (today's labelKept: a label whose form is not of LABEL_FORM's word list is left the page's ink)
  ['none | role 4', 'choice: a label TeX set before its unit, whose form today\'s word list does not take (labelKept)'],
  ['other:inkorphan | role 4', 'choice: a label TeX set before its unit, whose form today\'s word list does not take (labelKept)'],
  ['other:inkreferences | role 4', 'choice: a label TeX set before its unit, whose form today\'s word list does not take (labelKept)'],
  ['other:inknotes | role 4', 'choice: a label TeX set before its unit, whose form today\'s word list does not take (labelKept)'],
  ['other:inkfigures | role 4', 'choice: a label TeX set before its unit, whose form today\'s word list does not take (labelKept)'],
  ['other:inknames | role 4', 'choice: a label TeX set before its unit, whose form today\'s word list does not take (labelKept)'],
  // (an author's head: today reads the marks after the name before it as its label, by their form)
  ['role 4 | none', 'correction: no label before an author (LaTeX\'s \\author sets none; today: the marks of the name before)'],
  // (a unit's head piece the marking passed over: its ink before the start point is that piece's, the plan's)
  ['role 4 | role 2', 'choice: the ink of a head piece the marking passed over is the piece\'s (today: a label by its form)'],
  ['role 4 | role 1', 'choice: a unit\'s lead text symbol the paper wrote is its text (today: a label where its form is one: \\textbullet)'],
  ['role 2 | role 4', 'choice: a head piece\'s run with a word space in it is a label up to the space (today: by its form)'],
  // (own.mjs's readings with thresholds of their own, not ported)
  ['role 2 | none', 'choice: footEnd not ported (a display ending a footnote, to the folio: thresholds of today\'s)'],
  ['role 1 | none', 'choice: MR 5b not ported (a cell\'s lead macro with no mark, by the text the probe showed: CELL_ABUT)'],
  ['role 8 | none', 'choice: MR 6b not ported (the counter after a babel name on its line: COUNTER_GAP, a threshold)'],
  ['role 2 | role 2', 'correction: a footnote call TeX gave no mark is its own piece (today: the last piece opened on its page)'],
])
export const SOURCE_KINDS = new Set('para heading caption footnote cell abstract theorem figure author affiliation reference name'.split(' '))
export const keyOf = g => `${g.u}|${Math.round(g.x0 * 100)}|${Math.round(g.y * 100)}`

/** whether page p's glyphs are the same on both B (their keys in order) */
export const samePage = (a, b) => a.length === b.length && a.every((g, j) => keyOf(g) === keyOf(b[j]))

/**
 * `today`/`mine`: { units: [{ id, kind }], glyphs: Owners[], boxes: Owners[] }; `same`: per page, whether the two B hold the
 * same glyphs; `chars`: per page the glyphs' Unicode (today's B); `guarded`: today's unit indices its guard left unmarked
 */
export function compare({ today, mine, same, chars, guarded = [] }) {
  const ids = { today: new Set(today.units.map(u => u.id)), mine: new Set(mine.units.map(u => u.id)) }
  const guardIds = new Set(guarded.map(i => today.units[i]?.id).filter(Boolean))
  const ownerOf = (ins, P, j) => {
    const u = P.unit[j]
    if (u < 0) return { s: 'none' }
    const x = ins.units[u]
    if (!SOURCE_KINDS.has(x?.kind)) return { s: `other:${x?.kind ?? '?'}`, none: true }
    return { s: `${x.id.slice(0, 12)}:${P.role[j]}:${P.role[j] === 2 ? P.piece[j] : ''}`, id: x.id, role: P.role[j] }
  }
  const classes = new Map()
  const add = (cls, ex) => { const c = classes.get(cls) ?? classes.set(cls, { n: 0, ex: [] }).get(cls); c.n++; if (c.ex.length < 3) c.ex.push(ex) }
  const roleOf = o => (o.s === 'none' ? 'none' : o.none ? o.s : `role ${o.role}`)
  const classOf = (a, b) => {
    const aT = a.none ? { s: 'none' } : a
    if (aT.s === b.s) return null
    if (aT.s.endsWith(':2:-1') && b.s.startsWith(aT.s.slice(0, -2))) return 'agree: element, its piece stated by the plan (today none)'
    if ((a.id && !ids.mine.has(a.id)) || (b.id && !ids.today.has(b.id))) return `stage 1c: ${roleOf(a)} | ${roleOf(b)} (a unit read otherwise)`
    if ((a.s === 'none' || a.none) && b.id && guardIds.has(b.id)) return `guard: ${roleOf(a)} | ${roleOf(b)} (a unit today's guard left unmarked)`
    const raw = `${roleOf(a)} | ${roleOf(b)}${a.id && b.id && a.id !== b.id ? ' (another unit)' : ''}`
    return CAUSES.get(raw) ?? raw
  }
  let samePages = 0, glyphsCompared = 0, glyphsSame = 0, boxesCompared = 0, boxesSame = 0
  const n = Math.max(today.glyphs.length, mine.glyphs.length)
  for (let p = 0; p < n; p++) {
    const T = today.glyphs[p], M = mine.glyphs[p]
    if (!T || !M || !same[p]) { add(guarded.length ? 'guard: page: the two B differ (today compiled with units its guard left unmarked)' : 'page: the two B differ', { page: p + 1 }); continue }
    samePages++
    for (let j = 0; j < T.unit.length; j++) {
      glyphsCompared++
      const a = ownerOf(today, T, j), b = ownerOf(mine, M, j)
      const c = classOf(a, b)
      if (c === null || c.startsWith('agree:')) glyphsSame++
      if (c !== null) add(`glyph: ${c}`, { page: p + 1, glyph: j, u: chars?.[p]?.[j], today: a.s, mine: b.s })
    }
    const TB = today.boxes[p], MB = mine.boxes[p]
    if (TB && MB && TB.unit.length === MB.unit.length)
      for (let j = 0; j < TB.unit.length; j++) {
        boxesCompared++
        const a = ownerOf(today, TB, j), b = ownerOf(mine, MB, j)
        const c = classOf(a, b)
        if (c === null || c.startsWith('agree:')) boxesSame++
        if (c !== null) add(`box: ${c}`, { page: p + 1, box: j, today: a.s, mine: b.s })
      }
  }
  return {
    pages: { today: today.glyphs.length, mine: mine.glyphs.length, same: samePages },
    glyphs: { compared: glyphsCompared, same: glyphsSame },
    boxes: { compared: boxesCompared, same: boxesSame },
    classes: Object.fromEntries([...classes].sort((a, b) => b[1].n - a[1].n)),
  }
}
