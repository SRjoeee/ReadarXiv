// lab/pdf/prepare-back/stated.mjs: stage 1a's --baseline statement (run.mjs, and restate.mjs over a run's dumps): each unit of
// the baseline's the candidate does not make, stated as the candidate's, with the cause the differential reads
// (baseline/tools/diff.mjs: a loss whose cause an entry of baseline/acceptance.json matches is accepted). For one of today's ink
// units and figure texts, a unit made on arXiv's page that stands for it, read otherwise there: of its kind, no baseline unit's
// id, at its place (its first line's page and box) or, with no line, at its ord (today's bundle's order, which the dump keeps),
// with how it reads otherwise: its cause where it stays the original's, or its characters in another order, piece by piece, or
// its scripts kept as elements; none of its kind, a kept block of its kind at its place, or the author block's names line there
import { scriptsKeptAsElements } from '../../../packages/typeset/tests/replay/l1.ts'
import { unitClass } from '../../../packages/engine/src/locate/today/content-classes.mjs'

/** how a unit made on arXiv's page reads where it stands for one of the baseline's */
export const CAUSE = Object.freeze({
  order: 'its characters in another order',
  head: "its head's number in its phrase",
  // (the coordinator's ruling of 2026-11-09, (a): an ink unit whose raised or lowered marks today held as text, or as text and a
  // placeholder, are now its elements (rebuild/script-face), its text and theirs read as today's unit's, keptJoin's reading)
  scripts: 'its scripts kept as elements',
  // (the same ruling, (b): an orphan line of today's that the author block's names read as theirs (ink-units.mjs rule 8, of the
  // names toggle: its letters mostly the words of the author units the front end reads from the class's definitions))
  names: 'a line of the author block, kept by the names toggle',
  another: 'another reading',
})

/**
 * `base` the baseline dump's units, `units` the candidate's own (none stated yet): each baseline unit the candidate does not
 * make, in the baseline's order, with its stated cause; one it has no statement for (absent from the candidate) is left out
 */
export function statedOf(base, units) {
  const out = []
  const have = new Map()
  for (const u of units) have.set(u.id, (have.get(u.id) ?? 0) + 1)
  const baseIds = new Set(base.map((u) => u.id))
  const free = units.filter((u) => !baseIds.has(u.id) && !u.replaced)
  const meets = (a, b) =>
    a.page === b.page &&
    a.x0 < b.x1 &&
    b.x0 < a.x1 &&
    Math.min(a.top, a.bottom) < Math.max(b.top, b.bottom) &&
    Math.min(b.top, b.bottom) < Math.max(a.top, a.bottom)
  const standsFor = (u) => {
    const L = u.lines?.[0]
    const k = free.findIndex((c) => c.kind === u.kind && (L && c.lines?.[0] ? meets(L, c.lines[0]) : c.ord === u.ord))
    return k < 0 ? null : free.splice(k, 1)[0]
  }
  const chars = (p) => [...(p.kind === 'text' ? p.s : p.kind === 'ph' ? p.src : '')].sort().join('')
  // (the dump's flat pieces as sourcePieces' form, which keptJoin's reading takes)
  const flatOf = (ps) => ps.map((p) => ({ ...p, t: p.kind }))
  const howOf = (u, c) => {
    if (c.why?.startsWith('content difference')) return c.why
    // (a running head's number of its phrase, which today's took for its folio: "5 of 21" for "of 21", ink-units.mjs phrased)
    if (/^ink/.test(u.kind) && typeof c.text === 'string' && c.text !== u.text && c.text.replace(/^\d{1,4} | \d{1,4}$/, '') === u.text)
      return CAUSE.head
    const same = u.pieces.length === c.pieces.length && u.pieces.every((p, k) => p.kind === c.pieces[k].kind && chars(p) === chars(c.pieces[k]))
    if (same) return CAUSE.order
    return /^ink/.test(u.kind) && scriptsKeptAsElements(flatOf(c.pieces), u) ? CAUSE.scripts : CAUSE.another
  }
  for (const u of base) {
    if ((have.get(u.id) ?? 0) > 0) {
      have.set(u.id, have.get(u.id) - 1)
      continue
    }
    // (a unit made on A stands only for one of today's ink units, kept blocks and figure texts)
    const c = /^ink/.test(u.kind) ? standsFor(u) : null
    // (none: a kept block of its kind at its place, no text of it sent: its lines the ledger reads as no unit's text, a formula's
    // interior (ledger.mjs CHANGED))
    const L0 = u.lines?.[0]
    const kept =
      !c && /^ink/.test(u.kind) && L0
        ? units.find((k) => k.kind === u.kind && !k.pieces?.length && !k.replaced && k.lines?.some((l) => meets(L0, l)))
        : null
    // (none of either: an orphan line of today's (text no unit owned, `inkorphan`), at its place a names line, of the names
    // toggle, that ink-units.mjs rule 8 reads as the author block's (2610.20848v1 t161, 2610.21084v1 t585); its first line
    // meeting today's first. A line today read as another class's, a note's, is no such statement)
    let names = null
    if (!c && !kept && L0 && unitClass(u.kind) === 'orphan') {
      const k = free.findIndex((n) => /^ink/.test(n.kind) && unitClass(n.kind) === 'names' && n.lines?.[0] && meets(L0, n.lines[0]))
      if (k >= 0) names = free.splice(k, 1)[0]
    }
    const why = c
      ? `made on arXiv's page as ${c.id.slice(0, 12)}: ${howOf(u, c)}`
      : kept
        ? "kept on arXiv's page as the original's, no text of it sent"
        : names
          ? `made on arXiv's page as ${names.id.slice(0, 12)}: ${CAUSE.names}`
          : null
    if (why !== null) out.push({ u, why })
  }
  return out
}
