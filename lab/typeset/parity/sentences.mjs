// lab/typeset/parity/sentences.mjs: the highlight's granularity, judged apart from its coverage (verdict.mjs's highlight
// measure judges whether a side's boxes cover a unit's lines, not whether they are the unit's or a sentence's: the maintainer
// found on staging, 2026-11-08, v2 lighting every unit whole where today pairs sentence by sentence, which coverage passed).
// A feature of today's: a unit today lights by sentence (today/entry.mjs litBoxes `by`, its starts found on both panes) must be
// lit by sentence by v2, judged on the boxes per sentence:
// - v2 lights it by sentence on both panes (Laid.lit: an entry a sentence), as many sentences as today;
// - on arXiv's page, the same page under both, each sentence v2 lights is today's same sentence: of today's sentences on the
//   page, the one its boxes meet most (each pane cuts the original's lines at the sentence's first word);
// - on the right, each side its own drawing (the lines fall apart), every sentence today lights on the page v2 lights there
//   too, and none it does not.
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
    else if (vl.length !== n || vr.length !== n) says = `${counted} sentences by v2, ${n} by today`
    else {
      const off = []
      for (let s = 0; s < n; s++) {
        const own = shared(vl[s], t.leftBy[s])
        const best = t.leftBy.reduce((b, q, j) => (shared(vl[s], q) > shared(vl[s], t.leftBy[b]) ? j : b), s)
        if (vl[s].length && (own === 0 || best !== s)) off.push(`sentence ${s + 1} on arXiv's page meets today's ${own === 0 ? 'none of its' : `sentence ${best + 1} most`}`)
        if (!vl[s].length && t.leftBy[s].length) off.push(`sentence ${s + 1} not lit on arXiv's page`)
        if (!!vr[s].length !== !!t.rightBy[s].length) off.push(`sentence ${s + 1} ${vr[s].length ? 'lit' : 'not lit'} as drawn on this page, ${t.rightBy[s].length ? 'lit' : 'not'} by today`)
      }
      if (off.length) says = off.join('; ')
    }
    if (!says) out.paired++
    else if (vl.length < 2 || vr.length < 2) out.whole++
    else out.apart++
    out.units.push({ key, sentences: n, v2: { left: vl.length, right: vr.length }, worse: !!says, says })
  }
  return out
}
