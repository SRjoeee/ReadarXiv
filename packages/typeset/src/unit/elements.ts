// U.elements (design-b §1.5) and the rules it composes: U.render (each element's mode by its class and its stated
// rendering, D2, D9), U.leadMark (T11: a mark the unit starts with that the page shows before its first line is kept),
// U.brackets (T12: a rendering in its own brackets drawn without them where the translation brackets it itself). Ported from
// engine 065c1d973: resolvePlaceholders L2:1382-1465 (its control flow, in the row's order), bracketed L2:1943-1956,
// placeholdersOf L2:1062-1069, cropsOf TEX:404-435 (which resolution, in the row's order), prepareUnit L2:1031, 1041-1042, 1476.
//
// What it reads of each element is its reading, whatever the row (`ElementReading`): what today's reading of the page sets it
// to in each case the row decides. Today that is worked out from the page's characters (texParts' renderings, drawnAs,
// unbracketed, displayLines, leadMark: the tap's recorded inputs, read again by lab/typeset/derive.mjs with today's code);
// lane L1 states it as the element's El: `fixed` ← El.keep / El.text / an empty El.ink (EMPTY, OUTSIDE, a macro of no ink, a
// TEXT row); `symbol` ← El.text and El.leads; `gap`, `drawn` ← El.text (drawn as text), El.ink (as crops), El.style; `inner`
// ← El.brackets; `display` ← the KEPT lines a display stands on; `cite` ← a citation's learnt text; `segs` ← El.ink.
// `cls2` (each piece's class) ← El.kind. Nothing here reads a page's characters.
import { cropFields, cropPartsOfSegments } from './crops.ts'
import type { V0Piece } from './breaks.ts'

/** a rendering as the resolution carries it: its text, the unit's lines its glyphs stand on, whether a glyph of it no
 *  Unicode stands for (`nu`), how it was found (`proof`), its box where its source knows its ink, a joined display's held
 *  lines, how many characters it took (`n`) */
export type Gap = {
  text: string
  lines: readonly string[]
  nu: boolean
  unbracketed?: true
  proof?: true
  box?: unknown
  held?: readonly string[]
  n: number
}
/** a placeholder's resolution (layer2.d.mts Resolved): how it is drawn */
export type Res = {
  mode: 'none' | 'symbol' | 'kept' | 'crop' | 'orig-text' | 'cite-map' | 'source'
  text: string
  sup?: boolean
  math?: boolean
  st?: unknown
  page?: number
  crop?: readonly number[]
  baseline?: number
  parts?: readonly unknown[]
  proof?: true
  empty?: true
  inPlace?: true
  k?: number
  src?: string
  cls?: string
  gap?: Gap | null
}
/** an element's reading, whatever the row: what it is drawn as in each case the row decides */
export type ElementReading = {
  src: string
  cls: string
  unknown?: true
  nested?: true
  /** drawn so whatever else: a macro of no ink, TeX's nothing, ink outside the unit, a text row */
  fixed: Res | null
  /** a space TeX set ink for */
  inked: boolean
  /** a symbol's drawing, and whether the page shows its mark just before the unit's first line */
  symbol: { leads: boolean; res: Res } | null
  /** a footnote's mark, drawn raised whatever its rendering */
  supSrc: boolean
  /** drawn from its source, where no rendering is found */
  source: Res
  /** its source's plain text: a crop's copy text */
  srcText: string
  gap: Gap | null
  /** drawn from its rendering */
  drawn: Res | null
  /** its rendering without its own brackets (where it is in them, a letter or digit inside), drawn: as the first reading
   *  draws it, and as the second, from the drawing with them */
  inner: { gap: Gap; drawn1: Res; drawn2: Res | null } | null
  /** a display's rendering: the unit's lines it keeps */
  display: readonly string[] | null
  /** a citation not found, as the unit wrote it before */
  cite: Res | null
  /** its row's segments, where its row is found and holds ink (stride 6) */
  segs: readonly number[]
  rowText: string | null
}

export type ElementsInput = {
  /** the row's pieces, in the translation's order */
  pieces: readonly V0Piece[]
  /** each piece's class (phClass2), null where it is text */
  cls2: readonly (string | null)[]
  /** each placeholder's reading, by its piece's index in the row */
  readings: ReadonlyMap<number, ElementReading>
  /** the lines the unit holds that its source does not write (held) */
  held: readonly string[]
  /** the macros the unit learnt by their renderings before this reading (prepareUnit reads a unit twice where a display's
   *  lines are denied: the second reading starts with the first's) */
  macros: ReadonlyMap<string, string>
  /** the lines a found display holds, with their line's other rectangles (displayTouched, the finish's) */
  touched: readonly string[]
  /** the last page shown */
  shown: number
}

export type Elements = {
  /** the resolutions, by the row's piece index, in the row's order */
  resolutions: Map<number, Res>
  /** the lines the unit keeps as the original's */
  keep: string[]
  /** the first placeholder the file cannot draw (its piece index), or -1 (T4: U.admit refuses the unit `unproven`) */
  unproven: number
}

/** a placeholder's class as the renderings are kept (L2:1328 renderingClass) */
const renderingClass = (c: string) => (c === 'macro' || c === 'umacro' || c === 'display' ? 'other' : c)

/** U.brackets: whether the translation sets brackets round piece k itself (L2:1943 bracketed) */
export function bracketed(pieces: readonly V0Piece[], cls2: readonly (string | null)[], k: number): boolean {
  const textAt = (from: number, step: number): string | null => {
    for (let q = from; q >= 0 && q < pieces.length; q += step) {
      const p = pieces[q]!
      if (p.t === 'text') {
        if (/\S/.test(p.s)) return p.s
        continue
      }
      if (p.t === 'open' || p.t === 'close') continue
      if (p.t === 'ph' && ['zero', 'space'].includes(cls2[q] ?? '')) continue
      return null
    }
    return null
  }
  return /[\uFF08(\uFF3B[]\s*$/.test(textAt(k - 1, -1) ?? '') && /^\s*[\uFF09)\uFF3D\]]/.test(textAt(k + 1, 1) ?? '')
}

const bracketShaped = (t: string) => /^[([]/.test(t) && /[)\]]$/.test(t)

/** U.elements: each placeholder of the row resolved, in the row's order (L2:1382 resolvePlaceholders, TEX:404 cropsOf) */
export function elements(i: ElementsInput): Elements {
  const { pieces, cls2, readings, shown } = i
  const out = new Map<number, Res>()
  const phs = [...pieces.keys()].filter((k) => pieces[k]!.t === 'ph' || pieces[k]!.t === 'nested')
  const el = (k: number) => {
    const r = readings.get(k)
    if (!r) throw new TypeError(`no reading of the row's piece ${k}`)
    return r
  }
  let keep: string[] | undefined = i.held.length ? [...new Set(i.held)] : undefined
  const macros = new Map(i.macros)
  const gapOf = new Map<number, Gap>()
  for (const k of phs) {
    const e = el(k)
    if (e.fixed) out.set(k, { ...e.fixed })
    else if (e.cls === 'zero') out.set(k, { mode: 'none', text: '' })
    else if (e.cls === 'space' && !e.inked) out.set(k, { mode: 'none', text: ' ' })
    else if (e.cls === 'symbol') {
      // U.leadMark: the row's first placeholder, nothing visible before it, whose mark the page shows before line 1
      const first =
        k === phs[0] && pieces.slice(0, k).every((q) => q.t === 'ph' || !/\S/.test((q as { s?: string }).s ?? ''))
      out.set(k, first && e.symbol!.leads ? { mode: 'kept', text: '' } : { ...e.symbol!.res })
    } else {
      const cls = renderingClass(e.cls)
      let g = e.gap,
        drawn = e.drawn
      // U.brackets: the translation sets the brackets round it itself: its rendering without its own
      if (
        g &&
        (cls === 'num' || cls === 'other' || (cls === 'cite' && /^\(/.test(g.text))) &&
        bracketShaped(g.text) &&
        bracketed(pieces, cls2, k) &&
        e.inner
      ) {
        g = e.inner.gap
        drawn = e.inner.drawn1
      }
      if (g) gapOf.set(k, g)
      if (!g && e.cite) {
        out.set(k, { ...e.cite })
        continue
      }
      if (e.cls === 'display') {
        if (g) keep = [...(keep ?? []), ...e.display!]
        out.set(k, { mode: g ? 'kept' : 'none', text: '' })
        continue
      }
      const kept = keep
      if (g && kept?.length && g.lines.every((l) => kept.includes(l))) {
        out.set(k, { mode: 'kept', text: '' })
        continue
      }
      out.set(k, g ? { ...drawn! } : { ...e.source })
    }
  }
  for (const k of phs) {
    const r = out.get(k)
    if (r) Object.assign(r, { k, src: el(k).src, cls: el(k).cls, gap: gapOf.get(k) ?? null })
  }
  // U.brackets again: a rendering in its own brackets inside the translation's, wherever it was found
  for (const k of phs) {
    const r = out.get(k),
      e = el(k)
    const g = r?.gap
    if (!g || g.unbracketed || (r.mode !== 'crop' && r.mode !== 'orig-text') || !bracketShaped(g.text)) continue
    if (!bracketed(pieces, cls2, k) || !e.inner?.drawn2) continue
    out.set(k, { ...e.inner.drawn2, k, src: e.src, cls: e.cls, gap: e.inner.gap })
  }
  // (a paper's own macro known by its rendering, within the unit, in the row's order)
  for (const k of phs) {
    const r = out.get(k),
      e = el(k)
    if (!e.unknown || !r) continue
    if ((r.mode === 'orig-text' || r.mode === 'crop') && r.gap?.text && !macros.has(e.src))
      macros.set(e.src, r.gap.text)
    if (r.mode === 'source' && !r.text && macros.has(e.src)) r.text = macros.get(e.src)!
  }
  const unproven = crops(out, readings, shown)
  return { resolutions: out, keep: [...new Set([...(keep ?? []), ...i.touched])], unproven }
}

/** the file's crops over the resolutions, in their order: the first placeholder the file cannot draw, or -1 (TEX:404 cropsOf;
 *  its answer is U.admit's `unproven`, T4) */
function crops(res: Map<number, Res>, readings: ReadonlyMap<number, ElementReading>, shown: number): number {
  const cropped = (r: Res, S: readonly number[]) => {
    if (r.cls === 'display' || !S.length) return false
    for (let s = 0; s + 5 < S.length; s += 6) if (S[s]! > shown) return false
    const parts = cropPartsOfSegments(S)
    if (!parts) return false
    res.set(r.k!, {
      ...cropFields(parts),
      text: readings.get(r.k!)!.srcText,
      sup: false,
      k: r.k!,
      src: r.src!,
      cls: r.cls!,
      gap: {
        text: r.gap?.text ?? '',
        lines: r.gap?.lines ?? [],
        nu: r.gap?.nu ?? false,
        box: parts[0]!.seg,
        proof: true,
        n: r.gap?.n ?? 0,
      },
      proof: true,
    })
    return true
  }
  for (const r of res.values()) {
    const e = readings.get(r.k!)!
    const S = e.segs
    if (r.mode === 'orig-text' && r.gap?.nu) {
      if (cropped(r, S)) continue
      return r.k!
    }
    if (r.cls === 'zero' && r.mode === 'none' && !r.proof && S.length) {
      cropped(r, S)
      continue
    }
    if (r.cls === 'zero' || r.cls === 'space' || r.cls === 'symbol' || r.proof || r.gap?.proof) continue
    let past = S.length > 0,
      anyPast = false
    for (let s = 0; s + 5 < S.length; s += 6)
      if (S[s]! <= shown) past = false
      else anyPast = true
    if (past) {
      Object.assign(r, { mode: e.rowText ? 'source' : 'none', text: e.rowText ?? '', proof: true })
      continue
    }
    if (!anyPast && cropped(r, S)) continue
    return r.k!
  }
  return -1
}
