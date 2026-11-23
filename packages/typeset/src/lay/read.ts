// The reading (L5) and the tokens (L7) of a part's member, from what the part states: the composition of the rules run
// before a unit is set (its reading, its breaks, its label, its tokens and their widths), each fed the facts the prepare
// states rather than a reading of the page's characters:
// - each element's reading (U.elements' ElementReading) from its El: its class (`kind`, 'symbol' where it states a
//   `sym`), its ink as its rendering's segments, its text (`text`, the glyphs' reading; none where a glyph has no Unicode,
//   `nu`), its copy text (`copy`, texToText2), a symbol's drawing (`sym`), a footnote's mark (`mark`), kept where it stands
//   (`keep`: a display, ink outside the unit's lines);
// - drawnAs over a rendering whose source knows its ink (a segment's box, `box.top` set): a crop of the box, or the
//   page's text for a citation, a reference, a macro and a formula over lines;
// - U.breaks over what TeX states (El.ends, El.opens, SpanAt.opens: statedBreaks, in the translation's order) and its maps
//   (breakMaps) over them and the lines the elements keep; U.marks' facts (origAfter, heldAfter) from El.after;
// - U.label over the label's parts (Label.name, num, punct) as its glyphs;
// - the unit's base style, its size and its colour from Style, the faces' design from the font's name (classifyFont,
//   breaker/font-names.ts), the paper's designs and English family from Part.paper.faces (paperOf: its fonts tallied by the
//   glyphs each sets, familyOfFonts);
// - U.rename over the resolutions drawn as the page's text: a generated reference's or a citation's note's names in the
//   target's (the rules' reference names, babel's, the paper's own name units'), where the reader draws labels anew;
// - the tail from Placed.tail; B.tokens and B.measure over Metrics.
// A name leading the unit (U.lead) is handed in, set from the name the part binds to it (lay/lead.ts). Where the part states
// no fact for a reading, the reading goes without it, as named where it is read: a rendering's runs of one fill and its
// faked small capitals, a colour piece's run.
import type { El, KnownElClass, OutPiece, Placed, Piece, SpanAt } from '@readarxiv/format'
import { type CjkFaces, faceOf, ownSmallCapsOf, type Roles, rolesFor } from '../breaker/faces.ts'
import { classifyFont, familyOfFonts } from '../breaker/font-names.ts'
import { measure } from '../breaker/measure.ts'
import { noStart } from '../breaker/script.ts'
import { baseOf, type TokenRules, type TStyle, tokens as tokensOf } from '../breaker/tokens.ts'
import type { Tokens } from '../fit/types.ts'
import type { Metrics } from '../types.ts'
import { breakMaps, type Breaks, clsOf, factsOf, statedBreaks, type V0Piece } from '../unit/breaks.ts'
import { cropFields, cropOfBox, cropPartsOfSegments } from '../unit/crops.ts'
import { type ElementReading, elements, type Gap, type Res } from '../unit/elements.ts'
import { type Glyph, type HeadParts, type LabelInput, label as labelRule, type UnitLabel } from '../unit/label.ts'
import { type RefNames, rename } from '../unit/rename.ts'
import { cjkAdvance } from '../unit/params.ts'
import { type Rect, rectKey } from '../util.ts'

type Line = Placed['lines'][number]
const KEPT = 1
/** the classes that draw ink of their own, and the text macros */
const VISIBLE = new Set<string>([
  'cite',
  'num',
  'other',
  'macro',
  'umacro',
  'display',
  'symbol',
] satisfies readonly KnownElClass[])
const MACRO_CLASSES = new Set(['macro', 'umacro'])

/** a row's unit as the rules read it: its kind, the paper's title flag, its state and its pieces in the translation's order,
 *  a source piece carrying its index `k` */
export type RowUnit = { kind: string; title?: boolean; state: string; pieces: V0Piece[] }

/** a unit's pieces as the rules' flat ones (V0Piece: text, `ph` an element, `open` / `close` a group, `nested` a unit),
 *  each with its index `k`, in the source's order: format's tree of pieces (the instrument's) read back */
export function sourcePieces(content: readonly Piece[]): V0Piece[] {
  const out: V0Piece[] = []
  const walk = (ps: readonly Piece[]) => {
    for (const p of ps) {
      if (p.t === 'text') out.push({ t: 'text', s: p.s, k: out.length })
      else if (p.t === 'el') out.push({ t: 'ph', src: p.src, k: out.length })
      else if (p.t === 'unit') out.push({ t: 'nested', k: out.length })
      else {
        const id = out.length
        if (p.open !== undefined) out.push({ t: 'open', src: p.open, id, k: out.length })
        walk(p.content)
        if (p.close !== undefined) out.push({ t: 'close', src: p.close, id, k: out.length })
      }
    }
  }
  walk(content)
  return out
}

/** the source a rule reads of an element, made of what the part states of it (El: its glue, its command and whether its
 *  source is that command alone, a forced break, a citation's note, its identity): every test the rules make of a source
 *  (glueOf, FORCED_BREAK, the style commands' and GENERATED_REF's names, CITE_NOTE, a declaration's /^\\[A-Za-z]+$/, the
 *  macros learnt by their source) answers on it as on the source itself. A forced break is `\\` (LaTeX's `\\` and its forms,
 *  `\newline`, which is `\\`, and a cell's row end), but TeX's `\break` where the part states it so (El.cmd, El.bare): a
 *  penalty, which takes no glue before it as `\\` does (B.tokens) */
export function srcOfEl(id: string, el: El | undefined): string {
  if (!el) return `{=${id}}`
  if (el.brk) return el.cmd === 'break' && el.bare ? '\\break' : '\\\\'
  if (el.glue) return `\\${el.glue[2] ? 'hskip' : 'kern'} ${el.glue[0]}${el.glue[1]}`
  if (el.cmd !== undefined && el.bare) return `\\${el.cmd}`
  const key = `{=${el.same ?? id}}`
  return el.cmd !== undefined ? `\\${el.cmd}${el.note !== undefined ? `[${el.note}]` : ''}${key}` : key
}
/** a group's open as the rules read it: the command it begins with (SpanAt.cmd) */
const srcOfSpan = (sp: SpanAt | undefined): string => (sp?.cmd !== undefined ? `\\${sp.cmd}{` : '{')

/** a row's content (the translation package's Result: its text, the source's elements and groups by id) as the flat pieces
 *  the rules read (a translated text, `ph` an element, `open` / `close` a group, `nested` a unit), each
 *  source piece with its id as its index `k` and its source as the part states it (srcOfEl, srcOfSpan): the reading needs
 *  nothing of the unit's own pieces but what its member states */
export function rowPieces(m: Placed, content: readonly OutPiece[]): V0Piece[] {
  const els = new Map(m.els ?? [])
  const spans = new Map(m.spans ?? [])
  const out: V0Piece[] = []
  const walk = (ps: readonly OutPiece[]) => {
    for (const p of ps) {
      if (p.t === 'text') out.push({ t: 'text', tr: true, s: p.s } as V0Piece)
      else if (p.t === 'el') {
        const e = els.get(p.id)
        out.push(e?.nested ? { t: 'nested', k: Number(p.id) } : { t: 'ph', src: srcOfEl(p.id, e), k: Number(p.id) })
      } else {
        const id = Number(p.id)
        // (the face TeX set it in, where its command names no style the rules know, and the size TeX set it at, where it is not
        // the size it is drawn at by default: SpanAt.style)
        const st = spans.get(p.id)?.style
        const face = st ? { face: { role: st.role, bold: st.bold, slant: st.slant, size: st.size } } : {}
        // (a title its source sets in the line with no mark after it: SpanAt.runin, tokens.ts sets the separation after it)
        const runin = spans.get(p.id)?.runin ? { runin: true as const } : {}
        out.push({ t: 'open', src: srcOfSpan(spans.get(p.id)), id, k: id, ...face, ...runin })
        walk(p.content)
        out.push({ t: 'close', src: '}', id })
      }
    }
  }
  walk(content)
  return out
}

/** the paper's designs and the roles its faces are set in, from its fonts (Part.paper.faces: each with the glyphs it sets):
 *  the families and designs of its fonts tallied by the glyphs each sets, the most set of each family, and familyOfFonts */
/** a paper's designs, roles and family as its part's faces read; `bases` whether its part states each member's base
 *  (Part.paper.bases; a part made before states none) */
export type PaperReading = {
  designs: { serif: string; sans: string; mono: string }
  roles: Roles
  family: string
  bases?: boolean
}
export function paperOf(fonts: readonly (readonly [string, number])[], to: string, cjkFaces: CjkFaces): PaperReading {
  const tally = new Map<string, number>()
  for (const [name, n] of fonts) {
    const c = classifyFont(name)
    if (c.fam !== 'math') tally.set(`${c.fam}:${c.design}`, (tally.get(`${c.fam}:${c.design}`) ?? 0) + n)
  }
  const pick = (fam: string) =>
    [...tally]
      .filter(([k]) => k.startsWith(`${fam}:`))
      .sort((a, b) => b[1] - a[1])[0]?.[0]
      .split(':')[1]
  const serif = pick('serif') ?? 'times'
  const designs = {
    serif,
    sans: pick('sans') ?? (serif === 'cm' ? 'cmss' : 'helvetica'),
    mono: pick('mono') ?? (serif === 'cm' ? 'cmtt' : 'courier'),
  }
  const family = familyOfFonts(
    fonts.map((f) => f[0]),
    fonts.map((f) => f[1]),
  )
  return { designs, roles: rolesFor(to, family, cjkFaces), family }
}

/** a Style as a character style (classifyFont over its font's name; the part's role, weight, slant; its small capitals its
 *  face's, or faked ones where most of its letters that can tell are, Style.caps) */
export function tstyleOf(st: Placed['style'], designs: PaperReading['designs']): TStyle {
  const c = st.design ? classifyFont(st.design) : null
  const fam = st.role
  return {
    fam,
    bold: !!st.bold,
    italic: !!st.slant,
    caps: !!c?.caps || !!st.caps,
    design: c && c.fam === fam ? c.design : designs[fam],
    ...(c ? { known: c.known, name: c.name } : {}),
    ...(st.upper ? { upper: true } : {}),
  }
}

/** the unit's lines as the reading keys them: each line's rectangle key, its baseline and page */
type LineKeys = { key: string; page: number; base: number; top: number; bottom: number; kept: boolean }[]
const linesOf = (m: Placed, rects: readonly Rect[]): LineKeys =>
  m.lines.map((l: Line, j) => ({
    key: rectKey(rects[j]!),
    page: l[0],
    base: l[4],
    top: Math.max(l[5], rects[j]![4]),
    bottom: Math.min(l[6], rects[j]![2]),
    kept: !!(l[9] & KEPT),
  }))
/** the line an ink box stands on: on its page, its baseline the nearest within the line's band */
function lineOfInk(L: LineKeys, k: readonly number[], kept: boolean | null = null): string | null {
  let best: string | null = null,
    d = Number.POSITIVE_INFINITY
  for (const l of L) {
    if (l.page !== k[0] || (kept !== null && l.kept !== kept)) continue
    if (k[4]! < l.bottom - 0.5 || k[2]! > l.top + 0.5) continue
    const e = Math.abs(l.base - k[5]!)
    if (e < d) {
      d = e
      best = l.key
    }
  }
  return best
}

/** an El's ink as a layout file's segments (stride 6: page, x0, baseline, x1, top, bottom) */
const segsOf = (el: El): number[] => el.ink.flatMap((k) => [k[0], k[1], k[5], k[3], k[4], k[2]])
/** the box a rendering's segments make */
const boxOf = (S: readonly number[]) => {
  const n = S.length / 6
  const at = (q: number, f: number) => S[6 * q + f]!
  const xs = Array.from({ length: n }, (_, q) => q)
  return {
    x0: Math.min(...xs.map((q) => at(q, 1))),
    x1: Math.max(...xs.map((q) => at(q, 3))),
    top: Math.max(...xs.map((q) => at(q, 4))),
    bottom: Math.min(...xs.map((q) => at(q, 5))),
    baseline: at(0, 2),
    lines: n,
    segs: [...S],
  }
}

/** drawnAs over a rendering whose source knows its ink (its box): a formula over lines as its crops, the page's text
 *  for a citation, a reference, a macro and a formula over lines, else a crop of its box; its copy text the source's. A mark
 *  (`mark`: readingsOf's) on one line is a crop of its box whatever its class */
function drawnAs(
  cls: string,
  g: Gap & { box: ReturnType<typeof boxOf> },
  sup: boolean,
  copy: string,
  page: number,
  st: TStyle | null,
  literal: boolean,
  mark = false,
) {
  const box = g.box
  const broken = box.lines > 1
  const textMacro = cls === 'macro' || cls === 'umacro'
  if (broken && cls === 'other' && !literal) {
    const parts = cropPartsOfSegments(box.segs)
    if (parts) return { ...cropFields(parts), text: copy } as Res
  }
  if ((cls !== 'other' && !mark) || broken || textMacro) return { mode: 'orig-text', text: g.text, sup, st } as Res
  return { mode: 'crop', page, ...cropOfBox(box), text: copy, ...(mark ? { mark: true } : {}) } as Res
}

/** each element's reading (U.elements' ElementReading) from its El, by the row's piece index; `size` the member's */
function readingsOf(
  pieces: readonly V0Piece[],
  els: ReadonlyMap<string, El>,
  L: LineKeys,
  size: number,
): { readings: Map<number, ElementReading>; cls2: (string | null)[] } {
  const readings = new Map<number, ElementReading>()
  const cls2 = clsOf(pieces, els)
  pieces.forEach((p, k) => {
    // (a nested unit's mark of no ink: TeX set nothing for it where the part states so (El.text '', as of any element of a class
    // drawn from its ink: a heading's `\thanks` whose class sets no mark there), drawn as nothing, proven; else not found,
    // drawn from its source as '*', which leaves its unit the original's)
    const nestedEl = p.t === 'nested' ? els.get(String(p.k)) : undefined
    if (p.t === 'nested' && !nestedEl?.ink.length) {
      const source: Res = { mode: 'source', text: '*', math: false, sup: true }
      readings.set(k, {
        src: '\\footnotemark',
        cls: 'num',
        nested: true,
        fixed: nestedEl?.text === '' ? { mode: 'none', text: '', proof: true, empty: true } : null,
        inked: false,
        symbol: null,
        supSrc: true,
        source,
        srcText: '',
        gap: null,
        drawn: null,
        inner: null,
        display: null,
        cite: null,
        segs: [],
        rowText: null,
      })
      return
    }
    if (p.t !== 'ph' && p.t !== 'nested') return
    // (a nested unit's mark: a footnote mark's, drawn from its source as '*' where no ink is found)
    const nested = p.t === 'nested'
    const el = els.get(String(p.k))
    const cls = el?.kind ?? 'zero'
    const copy = el?.copy ?? ''
    const supSrc = !!el?.mark
    // (a mark: a glyph TeX set raised in its own font at its script size, a footnote's or a \thanks mark (El.mark), or a
    // symbol set as a superscript (El.sym's second): drawn as its ink, its size and raise TeX's, whatever unit holds it. As
    // the page's text it was its text in the target's face at a superscript's share of the line's size (1706.03762v7 p1's
    // seven CMSY7 stars 1.6 pt tall where TeX's are 2.7, its first author's, his trail's crop, at full size))
    const mark = !!el?.mark || (cls === 'symbol' && !!el?.sym?.[1])
    const ink = el?.ink ?? []
    const S = el ? segsOf(el) : []
    const onKept = ink.length > 0 && ink.every((q) => lineOfInk(L, q, true) !== null)
    // (fixed: a text macro of no ink drawn as nothing, one of the classes that draw ink TeX set none for (EMPTY), ink outside
    // the unit's lines left where it stands (OUTSIDE))
    let fixed: Res | null = null
    // (a text macro whose glyphs are the unit's text, its text stated (El.text, the probe's): drawn as that text, the
    // rendering its glyphs make among the unit's characters; with none, nothing)
    const textOnly = MACRO_CLASSES.has(cls) && !!el && !el.ink.length && el.text !== undefined && el.text !== ''
    // (an element of no ink, of a class drawn from its ink, read by the one of three the part states (format's El): TeX set
    // nothing for it, El.text '' (its two points hold no glyph, its probe said it sets none: 2610.19159v1's
    // `\trajectoryMark{}`), drawn as nothing, proven; TeX set it before the unit's start, outside the unit's text, El.keep,
    // drawn as nothing and its ink, never erased, left where it stands (OUTSIDE); neither, its ink was not found:
    // drawn as nothing, its glyphs may have been erased with the text group and never drawn again (2608.06007v1 p10's \sys,
    // "TensorCast"; 2608.25210v2 p7's algorithm under one line; 2402.10294v1's reference [1] without its year), so the unit is
    // unproven, left the original's whole)
    // (a symbol or a space of no ink TeX set before the unit's start, El.keep: the unit's edge, its ink the original's, kept
    // with the label (a hand-made list's typed bullet, PDF-READER §18.83): drawn as nothing, in place. Drawn from its symbol, it
    // stood beside the bullet that stays, "• •")
    if (el?.keep && !ink.length && (cls === 'symbol' || cls === 'space'))
      fixed = { mode: 'none', text: '', proof: true, inPlace: true }
    else if (VISIBLE.has(cls) && cls !== 'symbol' && !ink.length && !textOnly)
      fixed =
        el?.text === ''
          ? { mode: 'none', text: '', proof: true, ...(MACRO_CLASSES.has(cls) ? {} : { empty: true as const }) }
          : el?.keep
            ? { mode: 'none', text: '', proof: true, inPlace: true }
            : { mode: 'none', text: '' }
    else if (el?.keep && cls !== 'display' && cls !== 'symbol' && cls !== 'zero' && ink.length && !onKept)
      fixed = { mode: 'none', text: '', proof: true, inPlace: true }
    let gap: (Gap & { box: ReturnType<typeof boxOf> }) | null = null
    if (
      cls !== 'zero' &&
      (cls !== 'symbol' || (mark && ink.length)) &&
      (ink.length || textOnly) &&
      !(cls === 'space' && !ink.length)
    ) {
      let lines = ink.map((q) => lineOfInk(L, q, cls === 'display' ? true : null)).filter((x): x is string => !!x)
      // (a display the unit begins or ends with, its rows before its first text line or after its last, stays in place: no
      // line of the unit's text holds it (the maker's inPlace, a unit's first or last piece), so no region of it is referenced)
      if (cls === 'display' && lines.length) {
        const at = (k: string) => L.findIndex((l) => l.key === k)
        const text = L.map((l, j) => (l.kept ? -1 : j)).filter((j) => j >= 0)
        const idx = lines.map(at)
        if (text.length && (idx.every((j) => j > text.at(-1)!) || idx.every((j) => j < text[0]!))) lines = []
      }
      const text = el?.text ?? ''
      gap = { text, lines, nu: el?.text === undefined, proof: true, box: boxOf(S), n: [...text].length }
    }
    const page = ink[0]?.[0] ?? 1
    // (the style most of its glyphs are set in (El.style), its own font state where it is drawn as the page's text: its
    // typewriter face, weight, slant and small capitals, faked (El.style.sc, its text in TeX's case) or its face's own, over
    // the run's (tokens.ts); none where the part states none, the run's then. And its size where its glyphs' is not the
    // member's (TStyle.rel, absolute, as a group's): `{\small\texttt{…}}`, a citation TeX set larger than its cell; none for an
    // element of no ink, whose style no glyph states, nor for faked small capitals, whose size is their small letters', the
    // share they are set at (El.style.sc))
    const own =
      el?.style && el.ink.length && el.style.sc === undefined && el.style.size > 0 && size > 0
        ? Math.round(el.style.size * 100) !== Math.round(size * 100)
          ? el.style.size / size
          : undefined
        : undefined
    const gst: TStyle | null = el?.style
      ? {
          fam: el.style.role,
          bold: !!el.style.bold,
          italic: !!el.style.slant,
          caps: el.style.sc !== undefined || (!!el.style.design && !!classifyFont(el.style.design).caps),
          ...(el.style.sc !== undefined ? { sc: el.style.sc } : {}),
          ...(own !== undefined ? { rel: own } : {}),
        }
      : null
    const literal = !!el?.literal
    const drawn0 = gap ? drawnAs(cls, gap, supSrc, copy, page, gst, literal, mark) : null
    // (a URL drawn as its one line's crop: where TeX's url package may break it, El.breaks, which the breaker reads)
    const drawn =
      drawn0?.mode === 'crop' && !drawn0.parts && el?.breaks?.length ? { ...drawn0, breaks: el.breaks } : drawn0
    // (its rendering without its own brackets, where it stands in them with a letter or a digit inside: unbracketed)
    let inner: ElementReading['inner'] = null
    if (
      gap &&
      el?.brackets &&
      /^[([]/.test(gap.text) &&
      /[)\]]$/.test(gap.text) &&
      /[\p{L}\p{N}]/u.test(gap.text.slice(1, -1))
    ) {
      const [a, b] = el.brackets
      const S2 = ink.flatMap((q) => [q[0], Math.max(q[1], a[3]), q[5], Math.min(q[3], b[1]), q[4], q[2]])
      const ng = {
        ...gap,
        text: gap.text.slice(1, -1),
        unbracketed: true as const,
        box: boxOf(S2),
        n: Math.max(0, gap.n - 2),
      }
      const c2 = cls === 'cite' ? 'cite' : cls === 'num' ? 'num' : 'other'
      inner = {
        gap: ng,
        drawn1: drawnAs(cls, ng, supSrc, copy, page, gst, literal),
        drawn2:
          drawn && (drawn.mode === 'crop' || drawn.mode === 'orig-text')
            ? drawnAs(c2, ng, !!drawn.sup, copy, page, gst, literal)
            : null,
      }
    }
    readings.set(k, {
      src: nested ? '\\footnotemark' : (p as { src: string }).src,
      cls,
      ...(nested ? { nested: true as const } : {}),
      ...(el?.unknown ? { unknown: true as const } : {}),
      fixed,
      inked: cls === 'space' && ink.length > 0,
      ...(el?.tie ? { tie: true as const } : {}),
      symbol:
        cls === 'symbol'
          ? {
              leads: !!el?.leads,
              res: {
                mode: 'symbol',
                text: el?.sym?.[0] ?? '',
                math: true,
                sup: !!el?.sym?.[1],
                // (drawn as text at its glyphs' size where it is not the member's: TStyle.rel)
                ...(own !== undefined && !el?.sym?.[1] ? { st: { rel: own } } : {}),
              },
            }
          : null,
      supSrc,
      source: { mode: 'source', text: nested ? '*' : copy, math: cls === 'other', sup: supSrc },
      srcText: copy,
      gap,
      drawn,
      inner,
      display: cls === 'display' && gap ? gap.lines : null,
      cite: null,
      segs: S,
      rowText: null,
    })
  })
  return { readings, cls2 }
}

/** whether a named label's parts hold its every glyph, the name first: from its ink's start to its end (its own 1/100 grid),
 *  and none of its glyphs between them in no part (Label.unheld, the engine's count: a bracket before its name, a note it holds
 *  whole). Only such a label is drawn anew from its parts */
function partsHold(lb: NonNullable<Placed['label']>): boolean {
  if (!lb.name || lb.unheld) return false
  return lb.name[1][1] <= lb.ink[1] + 0.01 && (lb.punct ?? lb.num ?? lb.name)[1][3] >= lb.ink[3] - 0.01
}
/** the label as U.label reads it: its parts (Label.name, num, punct) each one glyph of its ink, in its style */
function labelOf(m: Placed, designs: PaperReading['designs']): UnitLabel | undefined {
  const lb = m.label
  if (!lb) return undefined
  const st = { ...tstyleOf(lb.style, designs), ...(lb.style.fill ? { fill: lb.style.fill } : {}) }
  const parts = [lb.name, lb.num, lb.punct].filter((x) => x !== undefined) as [string, number[]][]
  const chars: Glyph[] = (parts.length ? parts : [['', lb.ink] as [string, number[]]]).map(([ch, ink]) => ({
    ch,
    x0: ink[1]!,
    x1: ink[3]!,
    size: lb.style.size,
    st,
  }))
  // (a caption's float type, where its part states one: its parts after its name, and whether they hold its every glyph, from
  // its ink's start to its end, its own 1/100 grid)
  const float =
    lb.kind === 'float' && lb.float && lb.name
      ? {
          type: lb.float,
          name: lb.name[0],
          rest: chars.slice(1),
          num: !!lb.num,
          whole: partsHold(lb),
        }
      : undefined
  return {
    x1: Math.max(...chars.map((c) => c.x1)),
    text: chars.map((c) => c.ch).join(' '),
    chars,
    ...(float ? { float } : {}),
  }
}

/** a theorem-like head's parts as U.label names it from them: Label.name, num and punct, each one glyph of its ink in the
 *  label's style, and whether they hold its every glyph; null where the part states no name (a part made before its parts
 *  were stated, a label of no word) */
function headOf(m: Placed, designs: PaperReading['designs']): HeadParts | null {
  const lb = m.label
  if (!lb?.name) return null
  const st = { ...tstyleOf(lb.style, designs), ...(lb.style.fill ? { fill: lb.style.fill } : {}) }
  const glyph = ([ch, ink]: [string, number[]]): Glyph => ({ ch, x0: ink[1]!, x1: ink[3]!, size: lb.style.size, st })
  // (whether its parts hold its every glyph, the name first: from its ink's start to its end, its own 1/100 grid)
  const whole = partsHold(lb)
  return {
    name: glyph(lb.name),
    ...(lb.num ? { num: glyph(lb.num) } : {}),
    ...(lb.punct ? { punct: glyph(lb.punct) } : {}),
    whole,
  }
}

/** what the tokens set before the translation: a name's lead (ReadInput.lead, lay/lead.ts), else the label drawn anew,
 *  its parts in their styles, or its words in its first glyph's (an opening bracket at its end glued: gap 0) */
function leadOf(lb: UnitLabel | undefined): { parts: { text: string; st: TStyle }[]; gap?: number } | null {
  if (lb?.parts)
    return { parts: lb.parts.map((x) => ({ text: x.text, st: x.st as TStyle })), ...(lb.open ? { gap: 0 } : {}) }
  if (!lb?.drawn) return null
  const st = lb.chars[0]?.st
  const fill = st?.fill
  const colour =
    Number.isInteger(fill) && fill! >= 0
      ? { color: fill! > 0 ? `#${fill!.toString(16).padStart(6, '0')}` : undefined }
      : {}
  return {
    parts: [{ text: lb.drawn, st: st && st.fam !== 'math' ? { bold: !!st.bold, italic: !!st.italic, ...colour } : {} }],
  }
}

type ReadInput = {
  m: Placed
  unit: RowUnit
  /** the member's lines' rectangles, as the setting keys them (the adapter's) */
  rects: readonly Rect[]
  to: string
  P: TokenRules & { cjk?: boolean }
  paper: PaperReading
  /** U.label's names: the target's float names, the reader's caption choice, translator's head names, the paper's own names;
   *  null where the reader draws no label anew */
  labels: Pick<LabelInput, 'words' | 'captions' | 'heads' | 'names'> | null
  /** U.rename's names: the packages' reference names for the target (Rules.refs), read with `labels`' babel words and the
   *  paper's own names; none renamed where `labels` is null: names are renamed only where the reader draws labels anew */
  refs?: RefNames | null
  /** the reader draws the member's label anew (its label group can be turned off) */
  relabels: boolean
  /** a babel name's lead (lay/lead.ts ledBy: U.lead, the name the part binds to the member): set before the translation, its
   *  label the name's word and the joint drawn anew, in place of the label U.label draws */
  lead?: { parts: { text: string; st: TStyle }[]; gap?: number; drawn: string } | null
  /** the last page shown */
  shown: number
  /** the row's pieces (by index) whose text, as a reading before drew it, holds a character no served face holds (B.cover,
   *  lay/entry.ts): drawn as their elements' ink where they have one (U.elements) */
  inked?: ReadonlySet<number>
}
type ReadOut = {
  tokens: Tokens
  labelDrawn: string | null
  /** a label that stands on none of its member's lines (Label with no `line` and its own line's `align`: IEEEtran's "TABLE I"
   *  above its caption): its relabel, which no line of the member leads with, laid as a row of its own (entry.ts labelRowOf),
   *  its face the relabel's as a lead's (leadOf: the label's weight, slant and fill on the unit's base style); null where none */
  labelRow: { text: string; st: TStyle } | null
  lead: boolean
  cjkSize: number | undefined
  referenced: ReadonlySet<number>
  /** U.breaks' maps the blocks read (the kept lines in runs, a break's region or its frame's pitch on its next line, a
   *  paragraph's first line), by the lines' rectangles' keys */
  breaks: Pick<Breaks, 'regionOf' | 'breakAt' | 'joinAt' | 'paraAt'>
  /** T4: the first placeholder the file cannot draw (U.admit refuses the unit `unproven`), or -1 */
  unproven: number
  resolutions: Map<number, Res>
}

/** L5 and L7 of a member: its reading and its tokens, from the part and the row; no width is taken (B.cover asks its faces'
 *  readiness first, then `measured` takes the widths: a face not loaded is never measured) */
export function readMember(i: ReadInput): ReadOut {
  const { m, unit, paper } = i
  const pieces = unit.pieces
  const facts = factsOf(m)
  const { els, spans } = facts
  const L = linesOf(m, i.rects)
  const { readings, cls2 } = readingsOf(pieces, els, L, m.style.size)
  // (the lines its source does not write, held: KEPT lines no display's rows are; a display's rows, touched)
  const displayLines = new Set<string>()
  for (const r of readings.values()) for (const l of r.display ?? []) displayLines.add(l)
  const held = L.filter((l) => l.kept && !displayLines.has(l.key)).map((l) => l.key)
  const el = elements({
    pieces,
    cls2,
    readings,
    held,
    macros: new Map(),
    touched: [...displayLines],
    shown: i.shown,
    ...(i.inked?.size ? { inked: i.inked } : {}),
  })
  const res = el.resolutions
  // U.breaks: TeX's forced breaks and the paragraphs it opened, paired with the row in its order; the kept lines in runs, each
  // kept resolution's region
  const kept = new Map<number, string[]>()
  for (const [k, r] of res) if (r.mode === 'kept' && r.gap) kept.set(k, [...r.gap.lines, ...(r.gap.held ?? [])])
  // (its breaks' lines read off the page where Placed.read says 'breaks'; a frame's pitch TeX's \baselineskip where the part
  // states it, Placed.lead: no 'lead' read)
  const br = breakMaps(statedBreaks(facts, pieces, cls2), {
    pieces,
    rects: [...i.rects],
    lineInfo: new Map(i.rects.map((r, j) => [rectKey(r), { j }])),
    keep: el.keep,
    kept,
    resolved: new Set(res.keys()),
  })
  for (const [k, x] of br.marks) Object.assign(res.get(k)!, x)
  // U.rename: the names cleveref and \autoref generate in its references, and a citation's note's, in the target's
  if (i.labels && i.refs)
    for (const [k, x] of rename(res, i.refs, i.labels.words ?? null, i.labels.names ?? null))
      (res.get(k) as Res & { rename?: typeof x }).rename = x
  // U.marks' facts: the original's first mark after a display the drawing breaks at, after a kept piece on a held line (El.after)
  for (const [k, r0] of res) {
    const r = r0 as Res & { region?: number; origAfter?: string | null }
    const p = pieces[k]
    const e = p?.t === 'ph' ? els.get(String(p.k)) : undefined
    if (r.cls === 'display') {
      if (r.mode === 'kept' && r.region === undefined && r.gap && !r.gap.lines.length) r.inPlace = true
      if (r.inPlace || (r.mode === 'kept' && r.region !== undefined)) r.origAfter = e?.after ?? null
    } else if (r.mode === 'kept' && r.region !== undefined && r.gap) {
      const a = e?.after ?? null
      Object.assign(r, { heldAfter: a, heldMarks: a && noStart(a) ? [a] : [] })
    }
  }
  // the label in the target where the reader draws it anew
  const lab = labelRule({
    label: labelOf(m, paper.designs),
    head: m.kind === 'theorem' || m.kind === 'heading' ? headOf(m, paper.designs) : null,
    kind: m.kind,
    labels: !!i.labels,
    relabels: i.relabels,
    to: i.to,
    words: i.labels?.words ?? null,
    captions: i.labels?.captions ?? null,
    heads: i.labels?.heads ?? null,
    names: i.labels?.names ?? null,
  })
  // (a label on a line of its own: its relabel no lead of the member's first line, a row of its own)
  const ownRow = !!m.label && m.label.line === undefined && m.label.align !== undefined && !!lab.label?.drawn
  // the unit's style: TeX's font state at its start as A's glyphs show it (Style), its size, its colour
  const st = tstyleOf(m.style, paper.designs)
  const given: TStyle = { ...st, ...(m.style.fill !== undefined ? { fill: m.style.fill } : {}) }
  const resolved = Object.assign(
    { get: (k: number) => res.get(k) as never },
    {
      // (no measured base: the base is the original's style as the part states it, TeX's glyphs' weight and slant of the unit's
      // own text (Style; its small capitals by baseOf over its groups))
      measured: { st: null, fill: m.style.fill ?? 0, pieces: null },
      ...(m.style.sc !== undefined ? { capsRatio: m.style.sc } : {}),
      orig: { size: m.style.size },
      openBreaks: br.openBreaks,
      referenced: br.referenced,
      tail: (m.tail ?? []).flatMap(([t, s]) => [...t].map((ch) => ({ ch, st: tstyleOf(s, paper.designs) }))),
      tailOwn: null,
    },
  )
  const faces = { of: (s: TStyle, c: 'cjk' | 'latin') => faceOf(paper.roles, s, c), ownSmallCaps: ownSmallCapsOf }
  const made = tokensOf({
    unit: { kind: unit.kind, ...(unit.title ? { title: true } : {}), pieces },
    resolved,
    // (a group's run in the fill TeX set it in, El.colour or SpanAt.colour: a colour piece's the log's; any other group's,
    // a link's that hyperref colours, its glyphs' on A; a figure text's group, its run in another style than the text's
    // own, in its style's fill, as S.figures draws it (F0's line, which this path lays: 2610.19159v1's dark title before its
    // red tag, PDF-READER §18.26))
    colourOf: (k) => {
      const p = pieces[k]
      const span = p?.t === 'open' ? spans.get(String(p.k)) : undefined
      const c =
        p?.t === 'ph' || p?.t === 'nested'
          ? els.get(String(p.k))?.colour
          : p?.t === 'open'
            ? (span?.colour ?? (m.kind === 'figure' ? span?.style?.fill : undefined))
            : undefined
      return c ?? null
    },
    fillOf: (k) => {
      const p = pieces[k]
      const f = p?.t === 'ph' ? els.get(String(p.k))?.style?.fill : undefined
      return f === undefined ? null : f
    },
    // (each rendering drawn as the page's text in runs of one fill: El.fills, else its text in its one fill)
    // (the runs of the rendering the resolution draws: without its own brackets where U.brackets took them off; none where
    // its runs do not spell the text it draws, as fillRunsOf)
    fills: new Map(
      pieces.flatMap((p, k) => {
        const e = p.t === 'ph' || p.t === 'nested' ? els.get(String(p.k)) : undefined
        const r = res.get(k)
        if (e?.text === undefined || !r?.text) return []
        let runs = (e.fills ?? [[e.text, e.style?.fill ?? 0]]).map(([text, fill]) => ({ text, fill }))
        if (r.gap?.unbracketed) {
          runs = runs.map((x) => ({ ...x }))
          runs[0]!.text = runs[0]!.text.slice(1).replace(/^\s+/, '')
          runs.at(-1)!.text = runs.at(-1)!.text.slice(0, -1).replace(/\s+$/, '')
          runs = runs.filter((x) => x.text)
        }
        return runs.map((x) => x.text).join('') === r.text ? [[k, runs] as const] : []
      }),
    ),
    smallCaps: new Map(),
    cls2,
    spacedSource: false,
    to: i.to,
    base: given,
    // (a part made before states no base of its letters: its groups read out of its glyphs' style by baseOf's count, as before)
    ...(paper.bases ? {} : { statedBase: false }),
    // (the face TeX set the unit's marks in outside every group, where it is not its letters': a translated mark there is drawn
    // in it, Placed.markFace)
    ...(m.markFace ? { markBase: { bold: !!m.markFace.bold, italic: !!m.markFace.slant } } : {}),
    designs: paper.designs,
    P: i.P,
    lead: i.lead
      ? { parts: i.lead.parts, ...(i.lead.gap !== undefined ? { gap: i.lead.gap } : {}) }
      : ownRow
        ? null
        : leadOf(lab.label),
    faces,
    tagWords: true,
  })
  const toks = made.tokens as unknown as Tokens
  ;(toks as { base?: unknown }).base = made.base
  const cjkSize = i.P.cjk
    ? faces.of({ fam: 'serif', bold: false, italic: false, caps: false, design: paper.designs.serif }, 'cjk').size
    : undefined
  void cjkAdvance
  return {
    tokens: toks,
    labelDrawn: i.lead ? i.lead.drawn : (lab.label?.drawn ?? null),
    labelRow:
      ownRow && !i.lead
        ? // (its face the relabel's as a lead's is (leadOf over the unit's base, tokens.ts): the label's weight, slant and fill on
          // the unit's base style)
          {
            text: lab.label!.drawn!,
            st: { ...baseOf(unit, given, !!paper.bases), ...(leadOf(lab.label)?.parts[0]?.st ?? {}) },
          }
        : null,
    lead: !!i.lead,
    cjkSize,
    referenced: br.referenced,
    breaks: { regionOf: br.regionOf, breakAt: br.breakAt, joinAt: br.joinAt, paraAt: br.paraAt },
    unproven: el.unproven,
    resolutions: res,
  }
}

/** B.measure over a reading's tokens, once B.cover has found their faces ready: each token's width at 100 px, its base kept */
export function measured(tokens: Tokens, metrics: Metrics): Tokens {
  const toks = measure(tokens as never, metrics) as unknown as Tokens
  ;(toks as { base?: unknown }).base = (tokens as { base?: unknown }).base
  return toks
}
