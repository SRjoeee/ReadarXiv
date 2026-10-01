// Each translated unit's leading along the paper, and where a stretch at the leading's floor still runs long, its face
// (records/typesetting.md in experiments/pdf-bilingual: the rule chosen on 2026-10-01).
const clamp = (x, [lo, hi]) => Math.min(hi, Math.max(lo, x))

/**
 * The leading along the paper, unit by unit: the one that makes the translation as tall as the original over the
 * stretch of `window` of the original's lines around the unit (the unit's middle in the middle), within the design's
 * range. One type for the whole paper keeps its height, not its places: a translation's density changes along a paper
 * (a section of related work runs longer than one of proofs), each stretch keeps what the one before it lost, and at
 * the end of the main text 2608.09038 stood a third of a column late. Neighbours share most of their window, so their
 * leading differs little. Where the range stops it — Japanese and Korean set no tighter than the paper's own leading — a
 * stretch that runs long stays long; so the drift the leading has left so far is taken back over the next `horizon`
 * lines (the window's own length unless given), and a stretch after one that could not keep up is set no looser than
 * that allows.
 * `measured`, from the preview compile: `drift`, Map(unit index → how far behind the original the unit started there,
 * in points, pages and floats and all; places.mjs drifts), and `preview`, Map(unit index → its height there). What the
 * preview's heights do not account for — a float that jumped, a page break that moved, a title a line shorter — is read
 * at each unit as its measured drift less its heights' account there, and added to the final's own account: the median
 * of the next `measured.span` readings (five), so that one unit read far off and the next back is left out (Korean
 * 2608.06701: a paragraph moved from the foot of the left column to below a figure heading the right read 0.42 column
 * late, the next paragraph level), and a jump that lasts is taken a little before it. The first reading is taken as it
 * is and stands for the rest: before the first unit stands only the front matter, whose change moves everything after
 * it (Korean 2608.21180: a title a line shorter left page 1 51 pt ahead). A later median within `measured.snap` (points)
 * of it is noise and reads as it (2212.06817: a final that followed every reading ran 0.12 page ahead); one past it
 * holds while it lasts.
 * `measured.breaks`: the units that follow a forced break (a \clearpage, a \newpage; tex.mjs readForced), where the
 * preview and the final both start at the top of a page or column whatever came before: the final's own drift is taken
 * up again from the preview's account there, and the offset from the first reading after it, as at the paper's start.
 * Read across it, what the final's heights had parted from the preview's before the break (113 pt over Korean
 * 2608.05876's main text) was read as the appendix running that far early, and the whole appendix was set looser.
 * `rate`: what is taken back — the drift, the measured offset — moves a unit's leading at most that fraction from the
 * window's, however far behind the text is, so that no paragraph stands out from its neighbours: taken back within the
 * horizon, a jump the preview measured set Korean 2608.05876's paragraphs after it a quarter looser than those around
 * them, and the owner preferred the version without it to one nearer the original's places.
 * `shrink` ({ steps, lines, heightAt(i, f) }): where a segment — up to a forced break, or the paper's end — runs late
 * itself by more than `lines` of its lines (from level for the paper's first segment, from where the preview started it
 * for one after a break: a segment that began a page late because the one before ran over the break leaves that to the
 * one before), its leading stopped by the floor of the range, the stretch that ran late before that end is set at one
 * face `f` times the type's (heightAt: a unit's height at leading one at that face): the first of `steps` that takes
 * the lateness back over as few of the stretch's last units as it needs, the strongest over all of them where none does;
 * then the flow again over those heights. The owner, 2026-10-01: Korean 2608.18090's last sections ran 0.16 page long at
 * the floor, its references started a page later and its checklist took a page more. Set unit by unit where each wanted
 * it, a third of the CJK units came out a little smaller, most by under 3 %, and a face that much smaller saves a whole
 * line more often than the line model allows, twice as often under 1 %: five papers ran early.
 * `heights`: Map(unit index → the translation's height at leading one), from type.mjs unitHeights or a compile's lines.
 * The leading is × the paper's for CJK, × the size's for an alphabet, as the type's is; its range the `design`'s
 * (type.mjs DESIGN, designFor).
 * Returns each unit's leading (`leads`), the face of each unit set smaller (`sizes`), and the `trace`: unit by unit, where
 * the final pass put the text at the unit's start (`at`) and its end (`end`), in points behind the original, and the
 * leading it set (`x`).
 */
export function flowType(units, design, heights, { window = 50, horizon = window, measured = null, rate = Infinity, shrink = null } = {}) {
  const list = units.filter(u => heights.get(u.i) > 0).sort((a, b) => a.i - b.i)
  const bs = [...list.map(u => u.bs)].sort((a, b) => a - b)[list.length >> 1] ?? 12, half = (window * bs) / 2, back = horizon * bs
  let at = 0
  const mid = list.map(u => { const m = at + (u.lo * u.bs) / 2; at += u.lo * u.bs; return m })
  // what the preview measured beyond its heights' account, smoothed, by unit index (see above)
  const offsetAt = new Map(), accountAt = new Map(), breaks = measured?.breaks ?? new Set()
  if (measured) {
    const readings = []
    let account = 0, broke = false
    for (const u of list) {
      const m = measured.drift.get(u.i)
      broke ||= breaks.has(u.i)
      if (m != null) { readings.push({ i: u.i, beyond: m - account, anew: broke }); broke = false }
      accountAt.set(u.i, account)
      account += (measured.preview.get(u.i) ?? u.lo * u.bs) - u.lo * u.bs
    }
    // the first reading as it is, and the first after each forced break; after it, the offset moves only where the
    // median — of readings up to the next break, not past it — parts from it by more than the threshold
    const span = measured.span ?? 5
    let current = 0, first = 0
    readings.forEach((r, j) => {
      let end = Math.min(readings.length, j + span)
      for (let k = j + 1; k < end; k++) if (readings[k].anew) end = k
      const next = readings.slice(j, end).map(x => x.beyond).sort((a, b) => a - b), med = next[next.length >> 1]
      if (j === 0 || r.anew) first = current = r.beyond
      else current = !(Math.abs(med - first) <= measured.snap) ? med : first
      offsetAt.set(r.i, current)
    })
  }
  const take = d => clamp(back > 0 && back < Infinity ? 1 - d / back : 1, [1 - rate, 1 + rate])
  // the flow over the units' heights `hs`: each unit's leading, and where the text stands at its start and its end
  const pass = hs => {
    const leads = new Map(), trace = []
    let lo = 0, hi = 0, o = 0, t = 0, drift = 0, offset = 0
    for (let k = 0; k < list.length; k++) {
      for (; hi < list.length && mid[hi] <= mid[k] + half; hi++) { o += list[hi].lo * list[hi].bs; t += hs.get(list[hi].i) }
      for (; mid[lo] < mid[k] - half; lo++) { o -= list[lo].lo * list[lo].bs; t -= hs.get(list[lo].i) }
      const i = list[k].i
      // past a forced break the final starts where the preview did: what its heights parted from the preview's before
      // it the break took
      if (breaks.has(i) && accountAt.has(i)) drift = accountAt.get(i)
      if (offsetAt.has(i)) offset = offsetAt.get(i)
      const at = drift + offset, x = clamp((o / t) * take(at), design.lead)
      leads.set(i, x)
      drift += hs.get(i) * x - list[k].lo * list[k].bs
      trace.push({ i, at, end: drift + offset, x })
    }
    return { leads, trace }
  }
  const first = pass(heights), sizes = new Map()
  if (!shrink) return { leads: first.leads, sizes, trace: first.trace }
  // each segment's last unit — before a forced break, at the paper's end — and, where the text is left late there by
  // more than shrink.lines, its late stretch at one face: the first step that takes the lateness back over as few of
  // its last units as it needs, the strongest over all of them where none does
  let from = 0
  for (let e = 0; e < list.length; e++) {
    if (e < list.length - 1 && !breaks.has(list[e + 1].i)) continue
    // what the segment ran late itself: from level for the paper's first, from where the preview started it for one
    // after a forced break — a page late where the segment before ran over the break, which that one answers for
    const base = from === 0 ? 0 : first.trace[from].at, late = first.trace[e].end - base
    if (late > shrink.lines * bs) {
      let chosen = null
      for (const f of shrink.steps) {
        const run = []
        let saved = 0
        for (let k = e; k >= from; k--) {
          const { i, at, x } = first.trace[k]
          run.push(i)
          saved += (heights.get(i) - shrink.heightAt(i, f)) * x
          if (saved >= late || at <= base) break
        }
        chosen = { f, run }
        if (saved >= late) break
      }
      for (const i of chosen.run) sizes.set(i, chosen.f)
    }
    from = e + 1
  }
  if (!sizes.size) return { leads: first.leads, sizes, trace: first.trace }
  const second = pass(new Map([...heights].map(([i, h]) => [i, sizes.has(i) ? shrink.heightAt(i, sizes.get(i)) : h])))
  return { leads: second.leads, sizes, trace: second.trace }
}
