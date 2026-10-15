// The remover's alignment as it read PDF.js's operator list before the remover child lost PDF.js (layout/remove.mjs alignPage
// at origin/next 5d63ce47, kept here word for word as the oracle): the facts' reading (alignOf, alignPage over facts) must
// give the same verdict on every page, the fixtures' and lists perturbed. Over the remover's own walk of the page (walkPage),
// which both readings take.

type Walk = { problems: string[]; events: { kind: string; codes?: unknown[] }[] }
type Show = { codes: { v: number }[]; state: { font: { refused: string | null } } }
export interface OpList { fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> }

/** the old alignPage's verdict on a walk against the list: its reasons, and whether its paints aligned */
export function oldAlign(walk: Walk, encrypted: boolean, OPS: Record<string, number>, opList: OpList): { ok: boolean; why: string[]; paints: boolean } {
  const why = [...walk.problems]
  if (encrypted) why.push('an encrypted file')
  const shows = walk.events.filter(e => e.kind === 'show'), paints = walk.events.filter(e => e.kind === 'paint')
  const { fnArray, argsArray } = opList as { fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown[] | undefined> }
  const listShows: number[] = [], listPaths: number[] = []
  let inAnnot = 0
  for (let j = 0; j < fnArray.length; j++) {
    const fn = fnArray[j]
    if (fn === OPS.beginAnnotation) inAnnot++
    else if (fn === OPS.endAnnotation) inAnnot = Math.max(0, inAnnot - 1)
    else if (inAnnot) continue
    else if (fn === OPS.showText || fn === OPS.showSpacedText) listShows.push(j)
    else if (fn === OPS.constructPath) listPaths.push(j)
  }
  if (listShows.length !== shows.length) why.push(`${shows.length} showing operators walked, ${listShows.length} listed`)
  for (let n = 0; n < Math.min(listShows.length, shows.length) && why.length < 4; n++) {
    const e = shows[n] as unknown as Show
    if (e.state.font.refused) { why.push(`show ${n}: ${e.state.font.refused}`); continue }
    const gl = ((argsArray[listShows[n]!]?.[0] ?? []) as { originalCharCode?: unknown }[]).filter(g => g && typeof g === 'object')
    if (gl.length !== e.codes.length) { why.push(`show ${n}: ${e.codes.length} codes, ${gl.length} glyphs`); continue }
    for (let k = 0; k < gl.length; k++) if (gl[k]!.originalCharCode !== undefined && gl[k]!.originalCharCode !== e.codes[k]!.v) { why.push(`show ${n}: codes differ`); break }
  }
  return { ok: why.length === 0, why, paints: listPaths.length === paints.length }
}

/** a list with one change, as a reading that disagrees with the walk would have it: a show dropped, a path added, two shows
 *  swapped, a glyph's code changed (or taken away, or made no number) */
export function perturbed(OPS: Record<string, number>, list: OpList, how: 'drop-show' | 'extra-path' | 'swap-shows' | 'other-code' | 'no-code' | 'null-code', seed = 0): OpList | null {
  const fn = Array.from(list.fnArray), args: unknown[] = Array.from(list.argsArray as ArrayLike<unknown>).map(a => (Array.isArray(a) ? [...a] : a))
  const shows = fn.flatMap((f, j) => (f === OPS.showText || f === OPS.showSpacedText ? [j] : []))
  const pick = (n: number) => (n ? shows[seed % n] : undefined)
  if (how === 'extra-path') { fn.splice(Math.min(seed, fn.length), 0, OPS.constructPath!); args.splice(Math.min(seed, args.length), 0, []); return { fnArray: fn, argsArray: args } }
  if (how === 'drop-show') { const j = pick(shows.length); if (j === undefined) return null; fn.splice(j, 1); args.splice(j, 1); return { fnArray: fn, argsArray: args } }
  if (how === 'swap-shows') {
    if (shows.length < 2) return null
    const a = shows[seed % (shows.length - 1)]!, b = shows[seed % (shows.length - 1) + 1]!
    ;[args[a], args[b]] = [args[b], args[a]]
    return { fnArray: fn, argsArray: args }
  }
  // a glyph's code: another, none, or one that is not a number
  for (let t = 0; t < shows.length; t++) {
    const j = shows[(seed + t) % shows.length]!
    const glyphs = ((args[j] as unknown[])?.[0] ?? []) as ({ originalCharCode?: unknown } | null)[]
    const k = glyphs.findIndex(g => g && typeof g === 'object' && typeof g.originalCharCode === 'number')
    if (k < 0) continue
    const copy = glyphs.slice()
    const g = { ...(copy[k] as object) } as { originalCharCode?: unknown }
    if (how === 'other-code') g.originalCharCode = (g.originalCharCode as number) + 1
    else if (how === 'no-code') delete g.originalCharCode
    else g.originalCharCode = null
    copy[k] = g
    args[j] = [copy, ...(args[j] as unknown[]).slice(1)]
    return { fnArray: fn, argsArray: args }
  }
  return null
}
