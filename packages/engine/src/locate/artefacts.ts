// Phase 3 of locate (locate.ts): the artefacts (Rule 1, PDF-READER §18.22): a unit, or a group of one, whose text is set
// wholly in a face of one pitch is kept as the original.
// Reads: the index (A's faces of one pitch among it); the record's `members` and `units`.
// Writes: `units` (a kept unit's flags; a unit whose groups of one pitch become elements, its content), `members` (a kept
// member's flags; its rows), the ownership (a group's glyphs and boxes moved from its member's text and elements to the
// element it becomes, `asElement`: no owner changes), `stats` (its artefacts' counts), `pitch` (assigned: the reading the
// units made on A take, phase 4).
import { type Piece, unitId } from '@readarxiv/format'
import type { InstrumentUnit } from '../instrument.ts'
import { textOf } from './facts.ts'
import { groupLettersOf } from './group-style.ts'
import { cutLines, isInk } from './lines.ts'
import { assign, type Member, type Work } from './work.ts'

/** a group's TeX as its unit writes it: each piece's source in order (a text's characters, an element's source, a group's open,
 *  content and close, a nested unit's source around it) */
function texOf(list: readonly Piece[]): string {
  let out = ''
  for (const p of list)
    if (p.t === 'text') out += p.s
    else if (p.t === 'el') out += p.src
    else if (p.t === 'span') out += (p.open ?? '') + texOf(p.content) + (p.close ?? '')
    else out += p.pre + p.post
  return out
}

export function keepArtefacts(w: Work): void {
  const { inkA, gA, atA, fixedFaces } = w.ix
  const { members, units, stats, claims } = w
  // ---- artefacts (Rule 1, the owner's ruling of 2026-11-10, PDF-READER §18.22): a unit whose text is set wholly in a face of one
  // pitch, a typewriter's, is an artefact the paper presents exactly (code, a command, a prompt, JSON, an identifier, an OCR or
  // a model's sample): kept as the original, never translated, as a code environment's lines are (its unit kept, its member
  // fixed); a figure text so set too (ink.ts). Unless the paper's own body face, the face most of its source units' text glyphs
  // are set in, is one of one pitch: a paper typeset in a typewriter face is translated as any. The pitch is read off the
  // document's glyphs (facts.ts fixedFacesOf), never a face's name, a macro's or the font's FixedPitch flag. A unit holding a
  // word of another face (a line of prose naming a function) is none
  const bodyFace = (() => {
    const n = new Map<string, number>()
    for (const mem of members) {
      if (!mem.located || mem.unit < 0 || mem.figure || mem.name !== undefined) continue
      for (const a of mem.text) {
        const g = gA(a)
        if (!isInk(g) || !/\S/.test(g.u)) continue
        const f = g.font.replace(/^[A-Z]{6}\+/, '')
        n.set(f, (n.get(f) ?? 0) + 1)
      }
    }
    let best = '',
      most = 0
    for (const [f, c] of n)
      if (c > most) {
        most = c
        best = f
      }
    return best
  })()
  const bodyFixed = fixedFaces.has(bodyFace)
  const artefacts = !bodyFixed
  const fixedFace = (font: string) => fixedFaces.has(font.replace(/^[A-Z]{6}\+/, ''))
  const artefact = (text: readonly number[], turned: readonly [number, number][] = []): boolean => {
    if (!artefacts) return false
    let any = false
    for (const a of text) {
      const g = gA(a)
      if (!isInk(g) || !/\S/.test(g.u)) continue
      if (!fixedFace(g.font)) return false
      any = true
    }
    for (const [p, j] of turned) {
      const t = inkA.pages[p - 1]?.turned?.[j]
      if (!t || !/\S/.test(t.u)) continue
      if (!fixedFaces.has(t.base)) return false
      any = true
    }
    return any
  }
  // (a figure's word set in another face inside a line of code is that line's: figure-lines.ts reads a line every word of which
  // stands between glyphs of one pitch as code, kept whole (Rule 1's inside-a-line read on the line, PDF-READER §18.26:
  // 2411.13093v4 p19's "attractions" in Georgia inside its Consolas line); a figure text is kept here where it is set wholly in
  // such a face)
  const figureArtefact = (text: readonly number[], turned: readonly [number, number][]): boolean =>
    artefact(text, turned)
  stats.artefacts = { units: 0, bodyFixed }
  for (const mem of members) {
    if (!mem.located || mem.fixed || mem.unit < 0 || mem.figure || mem.name !== undefined) continue
    if (!artefact(mem.text)) continue
    units[mem.unit] = { ...units[mem.unit]!, kept: true, fixed: true, pitch: true }
    mem.fixed = true
    mem.kept = true
    stats.artefacts.units++
  }
  // (and read by group, as F0 reads a figure's line (figure-lines.ts): a group of a unit's that holds text of its own and whose
  // every glyph is set in a face of one pitch is one element `code`, the original's ink, never sent, the rest of its unit
  // translated. 2608.25210v2's `\mypython{…}` prompt box was kept on p2, a unit of its own after a blank line, and translated on
  // p3, where its source sets it right after its lead line in one paragraph: one rule for the box, wherever its source's blank
  // lines fall. The outermost such group, one element, never one inside another. Its glyphs: its letters as the unit's groups'
  // are matched to A's glyphs (group-style.ts), the text between them, the marks at its ends its own text writes, and its
  // elements' ink. TeX set it on lines of its own (a vertical box: no other ink of the unit's shares a line with it), its rows
  // stay where TeX set them, in their own measure and frame, as a display's do (`ownRows`, class `display`); else it stands on
  // its line, drawn as its ink, F0's class (`other`, literal, its copy its glyphs' text). A unit placed more than once (a babel
  // name's occurrences) is read so nowhere: one content serves every placement)
  /** the groups of a unit (placed once, by `mem`) Rule 1 makes elements of: the outermost that hold text of their own whose every
   *  glyph is set in a face of one pitch, each with its text glyphs on A (global) and the ids of the elements inside it */
  const pitchGroupsOf = (
    unit: InstrumentUnit,
    mem: Member,
  ): { span: Extract<Piece, { t: 'span' }>; text: number[]; nested: string[] }[] => {
    const classOf = new Map(unit.classes ?? [])
    const textGs = [...mem.text].sort((x, y) => x - y)
    const { groups: letters, all: matched } = groupLettersOf(
      unit.content,
      textGs.map(gA),
      (el) => classOf.get(el.id)?.text,
    )
    const lettered = new Set(matched.map((q) => textGs[q] as number))
    // (the member's stream: its text glyphs and its elements' (by piece id), in order)
    const elOf = new Map<number, string>()
    for (const [id, l] of mem.els) for (const a of l) elOf.set(a, id)
    const stream = [...textGs, ...elOf.keys()].sort((x, y) => x - y)
    const at = new Map(stream.map((a, q) => [a, q]))
    const elsIn = (list: readonly Piece[]): string[] =>
      list.flatMap((p) => (p.t === 'el' ? [p.id] : p.t === 'span' ? elsIn(p.content) : []))
    const holdsUnit = (list: readonly Piece[]): boolean =>
      list.some((p) => p.t === 'unit' || (p.t === 'span' && holdsUnit(p.content)))
    // (the marks its own text writes before its first letter or inked element and after its last: white space aside)
    const edgesOf = (list: readonly Piece[]): { head: string; tail: string } => {
      const seq: (string | null)[] = []
      const walk = (ps: readonly Piece[]) => {
        for (const p of ps)
          if (p.t === 'span') walk(p.content)
          else if (p.t === 'text') for (const ch of p.s) seq.push(/[\p{L}\p{N}]/u.test(ch) ? null : ch)
          else if (p.t === 'el' && ((mem.els.get(p.id)?.length ?? 0) > 0 || classOf.get(p.id)?.text)) seq.push(null)
      }
      walk(list)
      const first = seq.indexOf(null),
        last = seq.lastIndexOf(null)
      const marks = (xs: (string | null)[]) => xs.filter((c): c is string => c !== null && /\S/u.test(c)).join('')
      return first < 0 ? { head: '', tail: '' } : { head: marks(seq.slice(0, first)), tail: marks(seq.slice(last + 1)) }
    }
    const spells = (a: number, ch: string) => gA(a).u.normalize('NFKC') === ch.normalize('NFKC')
    const judge = (span: Extract<Piece, { t: 'span' }>) => {
      const L = letters.get(span.id)
      if (!L?.length || holdsUnit(span.content)) return null
      const nested = elsIn(span.content)
      const mine = new Set(nested)
      const nestedGs = nested.flatMap((id) => mem.els.get(id) ?? [])
      let lo = Math.min(textGs[L[0] as number] as number, ...nestedGs)
      let hi = Math.max(textGs[L.at(-1) as number] as number, ...nestedGs)
      // (its end marks: the text glyphs beside its extent that spell them, none another element's or a matched letter)
      const { head, tail } = edgesOf(span.content)
      const grow = (from: number, step: 1 | -1, marks: string) => {
        let k = step > 0 ? 0 : marks.length - 1
        let q = (at.get(from) as number) + step
        let end = from
        while (k >= 0 && k < marks.length && q >= 0 && q < stream.length) {
          const a = stream[q] as number
          const g = gA(a)
          if (elOf.has(a) || lettered.has(a)) break
          if (isInk(g) && /\S/u.test(g.u)) {
            if (!spells(a, marks[k] as string)) break
            k += step
            end = a
          }
          q += step
        }
        return end
      }
      lo = grow(lo, -1, head)
      hi = grow(hi, 1, tail)
      // (no other element's ink inside it)
      for (let q = at.get(lo) as number; q <= (at.get(hi) as number); q++) {
        const id = elOf.get(stream[q] as number)
        if (id !== undefined && !mine.has(id)) return null
      }
      const text = textGs.filter((a) => a >= lo && a <= hi)
      for (const a of [...text, ...nestedGs]) {
        const g = gA(a)
        if (isInk(g) && /\S/u.test(g.u) && !fixedFace(g.font)) return null
      }
      return { span, text, nested }
    }
    const out: { span: Extract<Piece, { t: 'span' }>; text: number[]; nested: string[] }[] = []
    const visit = (list: readonly Piece[]) => {
      for (const p of list) {
        if (p.t !== 'span') continue
        const x = judge(p)
        if (x) out.push(x)
        else visit(p.content)
      }
    }
    visit(unit.content)
    return out
  }
  if (artefacts) {
    const placements = new Map<number, number>()
    for (const mem of members) if (mem.unit >= 0) placements.set(mem.unit, (placements.get(mem.unit) ?? 0) + 1)
    for (const mem of members) {
      if (!mem.located || mem.fixed || mem.unit < 0 || mem.figure || mem.name !== undefined) continue
      if (placements.get(mem.unit) !== 1) continue
      const unit = units[mem.unit]!
      if (unit.kept || unit.fixed || !unit.content.some((p) => p.t === 'span')) continue
      // (a unit no glyph of whose text is set in a face of one pitch holds no such group: its letters are not aligned)
      if (
        !mem.text.some((a) => {
          const g = gA(a)
          return isInk(g) && /\S/u.test(g.u) && fixedFace(g.font)
        })
      )
        continue
      stats.artefacts.read = (stats.artefacts.read ?? 0) + 1
      const made = pitchGroupsOf(unit, mem)
      if (!made.length) continue
      const at = new Map(made.map((x) => [x.span.id, x]))
      const swap = (list: readonly Piece[]): Piece[] =>
        list.map((p): Piece => {
          if (p.t !== 'span') return p
          return at.has(p.id)
            ? { t: 'el', id: p.id, kind: 'code', src: texOf([p]) }
            : { ...p, content: swap(p.content) }
        })
      const content = swap(unit.content)
      const gone = new Set(made.flatMap((x) => x.nested))
      const taken = new Set(made.flatMap((x) => x.text))
      // (TeX's vertical box: no other ink of the unit's, its text or its other elements' (a display's aside, a block of its own),
      // shares a line with it)
      const others = [
        ...mem.text.filter((a) => !taken.has(a)),
        ...[...mem.els].flatMap(([id, l]) => (gone.has(id) ? [] : l)),
      ]
      const classes = (unit.classes ?? []).filter(([id]) => !gone.has(id))
      for (const x of made) {
        const own = claims.asElement(mem, x.span.id, x.text, x.nested)
        const mine = new Set(own)
        const shares = cutLines(
          [...others.filter((a) => !mine.has(a)), ...own].sort((a, b) => a - b),
          atA,
        ).some((l) => l.gs.some((a) => mine.has(a)) && l.gs.some((a) => !mine.has(a)))
        const copy = textOf(own.map(gA))
        if (!shares) {
          mem.ownRows ??= new Set()
          mem.ownRows.add(x.span.id)
          classes.push([x.span.id, { cls: 'display', copy }])
        } else classes.push([x.span.id, { cls: 'other', literal: true, copy }])
      }
      const { classes: _was, ...rest } = unit
      void _was
      units[mem.unit] = {
        ...rest,
        id: unitId(unit.kind, content),
        content,
        ...(classes.length ? { classes } : {}),
        keptEls: [...(unit.keptEls ?? []), ...made.map((x): [string, 'pitch'] => [x.span.id, 'pitch'])],
      }
      mem.id = units[mem.unit]!.id
      stats.artefacts.groups = (stats.artefacts.groups ?? 0) + made.length
    }
  }
  assign(w, 'pitch', { artefacts, figureArtefact })
}
