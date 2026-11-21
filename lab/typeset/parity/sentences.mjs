// lab/typeset/parity/sentences.mjs: the highlight's granularity, judged apart from its coverage (verdict.mjs's highlight
// measure judges whether a side's boxes cover a unit's lines, not whether they are the unit's or a sentence's: the maintainer
// found on staging, 2026-11-08, v2 lighting every unit whole where today pairs sentence by sentence, which coverage passed).
// A feature of today's: a unit today lights by sentence (today/entry.mjs litBoxes `by`, its starts found on both panes) must be
// lit by sentence by v2, judged on the boxes per sentence:
// - v2 lights it by sentence on both panes (Laid.lit: an entry a sentence), with today's sentences or finer: v2 ends a sentence
//   at a forced break too (TeX's \\, a block of its own on the page), where a translator's sentence runs across it;
// - on arXiv's page, the same page under both, each of v2's sentences that meets today's meets most one of them, in today's
//   order (a v2 sentence within one of today's), and every sentence today lights there v2 lights there (each pane cuts the
//   original's lines at the sentence's first word). A box of v2's that meets none of today's (a display's own stop at a line's
//   head, which today lights with nothing) is no fault;
// - as drawn, each side its own drawing (the lines and the page breaks fall apart: which page a sentence's translation lands
//   on is the layout's, judged by its own measures), v2 lights the unit there where today does.
// A unit of one sentence today lights as that sentence's shape, the unit whole, as v2's one entry does: not judged. v2 by
// sentence where today lights a unit whole is no fault. A drawing made before today's boxes were kept per sentence (no
// `leftBy`) tells no count: its units are counted unread, not judged.

/** the area two lists of boxes [x0, y0, x1, y1] share */
function shared(as, bs) {
  let a = 0
  for (const p of as)
    for (const q of bs) a += Math.max(0, Math.min(p[2], q[2]) - Math.max(p[0], q[0])) * Math.max(0, Math.min(p[3], q[3]) - Math.max(p[1], q[1]))
  return a
}

/**
 * The units of a page today lights by sentence, each judged: `keys` the units both sides draw that today highlights, `today(key)`
 * its litBoxes record, `v2(key)` v2's Laid.lit of its member on the page (undefined where none is laid). Returns the judged
 * units (`{ key, sentences, v2: { left, right }, worse, says }`) and the counts
 */
export function sentencesPaired(keys, today, v2) {
  const out = { units: [], today: 0, paired: 0, whole: 0, apart: 0, unread: 0 }
  for (const key of keys) {
    const t = today(key)
    // (today's by-sentence units of more than one sentence: one of one sentence is lit as its one sentence's shape, the unit
    // whole, which v2's one entry is; a drawing of before the per-sentence boxes tells neither, and is not judged here)
    const n = t?.by ? (t.leftBy?.length ?? null) : null
    if (n === null) {
      if (t?.by) out.unread++
      continue
    }
    if (n < 2) continue
    out.today++
    const lit = v2(key)
    const vl = lit?.left ?? [],
      vr = lit?.right ?? []
    const counted = `${vl.length} on arXiv's page, ${vr.length} as drawn`
    let says = null
    if (vl.length < 2 || vr.length < 2) says = `lit whole by v2 (${counted}) where today pairs ${n} sentences`
    else if (vl.length < n || vr.length < n) says = `${counted} sentences by v2, ${n} by today`
    else {
      const off = []
      // (on arXiv's page: each of v2's sentences within one of today's, in order; each of today's there met by one of v2's)
      let last = -1
      const met = new Set()
      for (let s = 0; s < vl.length; s++) {
        if (!vl[s].length) continue
        const areas = t.leftBy.map((q) => shared(vl[s], q))
        const best = areas.reduce((b, a, j) => (a > areas[b] ? j : b), 0)
        if (!(areas[best] > 0)) continue
        if (best < last) off.push(`sentence ${s + 1} on arXiv's page meets today's sentence ${best + 1} most, after its ${last + 1}`)
        last = Math.max(last, best)
        met.add(best)
      }
      t.leftBy.forEach((q, j) => {
        if (q.length && !met.has(j)) off.push(`today's sentence ${j + 1} on arXiv's page met by none of v2's`)
      })
      if (t.rightBy.some((q) => q.length) && !vr.some((q) => q.length)) off.push('not lit as drawn on this page, lit by today')
      if (off.length) says = off.join('; ')
    }
    if (!says) out.paired++
    else if (vl.length < 2 || vr.length < 2) out.whole++
    else out.apart++
    out.units.push({ key, sentences: n, v2: { left: vl.length, right: vr.length }, worse: !!says, says })
  }
  return out
}
