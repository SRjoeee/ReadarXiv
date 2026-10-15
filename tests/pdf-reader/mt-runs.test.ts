import { describe, expect, it } from 'vitest'
import { PIPELINE_CARRIES } from '@/pdf-reader/engine/pipeline/live.mjs'
import { inMemory, loadProject, patch } from '@/pdf-reader/engine/source/latex-front.mjs'
import { cutsOf, formulaRuns, holdsUnbalanced, plainSource, plainTranslated, rehydrate, rehydrateTags, sentencesOf, serialize, serializeTags } from '@/pdf-reader/engine/translate/mt.mjs'

// A formula the author split across inline formulas goes to the translator as one placeholder (mt.mjs formulaRuns): the
// unit keeps its parts, the wire one marker for them, and a reply read back gives the parts again in their order.
// 2307.16209 p31: `$\{\Phi_0$, $\Phi_1$, $\Phi_2\}$` went out as three markers, and Microsoft's Chinese set the first
// before the words the other two follow; the set was drawn broken apart

type Piece = { t: string; s?: string; src?: string; tr?: boolean }
const project = (body: string) => loadProject(inMemory(new Map([['main.tex', new TextEncoder().encode(`\\documentclass{article}\\begin{document}\n${body}\n\\end{document}`)]])), 'main.tex')
const unitOf = (body: string) => (project(body).units as { pieces: Piece[] }[])[0] as { pieces: Piece[] }
const phs = (pieces: Piece[]) => pieces.filter(p => p.t !== 'text').map(p => p.src)
const markers = (wire: string) => wire.match(/@[a-z]+#/g) ?? []
/** pieces as one string: text as it stands, a placeholder as its source */
const joined = (pieces: Piece[]) => pieces.map(p => (p.t === 'text' ? p.s : p.src)).join('')
const SET = 'give rise to a first-order system of partial differential equations for the three components $\\{\\Phi_0$, $\\Phi_1$, $\\Phi_2\\}$ \\cite{Teukolsky:1973ha}:'

describe('the unit keeps its parts; the wire sends one marker for them', () => {
  it('the thesis\'s sentence as it stands: three placeholders in the unit, one marker on the wire', () => {
    const u = unitOf(SET)
    expect(phs(u.pieces)).toEqual(['$\\{\\Phi_0$', '$\\Phi_1$', '$\\Phi_2\\}$', '\\cite{Teukolsky:1973ha}'])
    expect(serialize(u).wire).toBe('give rise to a first-order system of partial differential equations for the three components @a# @b#:')
    expect(serializeTags(u).wire).toBe('give rise to a first-order system of partial differential equations for the three components <x id="1"/> <x id="2"/>:')
  })

  it('read back where the reply moved it, the run\'s own pieces in their order, the commas between them the source\'s', () => {
    const u = unitOf(SET), ser = serialize(u)
    const r = rehydrate('These are the equations of @a#, the three components @b#:', ser)
    expect('pieces' in r).toBe(true)
    const pieces = (r as { pieces: Piece[] }).pieces
    expect(joined(pieces).trim()).toBe('These are the equations of $\\{\\Phi_0$, $\\Phi_1$, $\\Phi_2\\}$, the three components \\cite{Teukolsky:1973ha}:')
    // the unit's own objects, so that each is found by its k (layer/pieces.mjs kOfSource), and the separators untranslated
    const at = pieces.indexOf(u.pieces[1] as Piece), run = pieces.slice(at, at + 5)
    expect(run).toEqual(u.pieces.slice(1, 6))
    expect(run.every(p => u.pieces.includes(p as never))).toBe(true)
    expect(run.filter(p => p.t === 'text').every(p => !p.tr)).toBe(true)
    // the tags wire alike, and tolerantly
    const t = rehydrateTags('These are the equations of <x id="1"/>, the three components <x id="2"/>:', serializeTags(u))
    expect('pieces' in t && joined(t.pieces)).toBe(joined(pieces))
    const loose = rehydrate('These are the equations of @a, the three components @b#:', ser, true)
    expect('pieces' in loose && joined(loose.pieces)).toBe(joined(pieces))
  })

  it('written back, the run byte for byte between the translation\'s words', () => {
    const p = project(SET)
    const u = (p.units as { pieces: Piece[] }[])[0] as { pieces: Piece[] }
    const r = rehydrate('These are the equations of @a# @b#:', serialize(u)) as { pieces: Piece[] }
    const out = new TextDecoder('latin1').decode(patch(p, new Map([[u, r.pieces]]) as never).get('main.tex'))
    expect(out).toContain('These are the equations of $\\{\\Phi_0$, $\\Phi_1$, $\\Phi_2\\}$ \\cite{Teukolsky:1973ha}:')
  })
})

describe('a reply that does not hold the run\'s marker once is refused whole, never read in part', () => {
  const u = unitOf(SET), ser = serialize(u)
  it('a marker lost, doubled or unknown', () => {
    expect(rehydrate('These are the equations @b#:', ser)).toEqual({ error: 'lost marker' })
    expect(rehydrate('These are @a# the equations of @a# @b#:', ser)).toEqual({ error: 'duplicated marker' })
    expect(rehydrate('These are the equations of @a# @b# @c#:', ser)).toEqual({ error: 'unknown marker' })
  })
  it('a reply to the old wire, which sent each part apart: refused, strictly and tolerantly, on both wires', () => {
    // the old wire: `… components @a#, @b#, @c# @d#:`, the citation its fourth
    const old = 'These are the equations of @a#, @b#, @c# @d#:'
    expect(rehydrate(old, ser)).toEqual({ error: 'unknown marker' })
    expect(rehydrate(old, ser, true)).toEqual({ error: 'unknown marker' })
    expect(rehydrateTags('These are the equations of <x id="1"/>, <x id="2"/>, <x id="3"/> <x id="4"/>:', serializeTags(u))).toEqual({ error: 'unknown placeholder' })
  })
})

describe('what may stand between the parts', () => {
  const runOf = (body: string) => { const u = unitOf(body); return { parts: phs(u.pieces).length, markers: markers(serialize(u).wire).length } }
  it('a comma, a thin space, a quad, a control space, an ellipsis, a tie, a comment', () => {
    for (const between of [', ', '\\,', '\\quad ', '\\ ', ', \\ldots, ', '~', ',%\n']) expect(runOf(`The set $\\{a$${between}$b\\}$ is given here.`), between).toEqual({ parts: 2 + (/\\(?:,|quad|ldots| )|~/.test(between) ? 1 : 0), markers: 1 })
  })
  it('not a display, a citation or a word: each part its own marker', () => {
    expect(runOf('The set $\\{a$ $$x$$ $b\\}$ is given here.').markers).toBe(3)
    expect(runOf('The set $\\{a$ \\cite{k} $b\\}$ is given here.').markers).toBe(3)
    expect(runOf('For $a \\in \\{$L, L-O, N$\\}$ alike.').markers).toBe(2)
  })
  it('formulaRuns over a unit\'s pieces: the run\'s first piece to its last', () => {
    expect([...formulaRuns(unitOf(SET).pieces)]).toEqual([[1, 5]])
  })
})

describe('the sentences of a unit with a run (sentencesOf): the run\'s commas counted where the plain source has them', () => {
  it('the second sentence begins at its first word on both sides', () => {
    const u = unitOf('First we take the set $\\{a$, $b$, $c\\}$ of all. Then we stop here.')
    const ser = serialize(u)
    expect(ser.wire).toBe('First we take the set @a# of all. Then we stop here.')
    const reply = 'Erst nehmen wir die Menge @a# von allem. Dann halten wir.'
    const s1 = ser.wire.indexOf('Then'), t1 = reply.indexOf('Dann')
    const pieces = (rehydrate(reply, ser) as { pieces: Piece[] }).pieces
    const got = sentencesOf(u, ser, reply, { source: [s1, ser.wire.length - s1], target: [t1, reply.length - t1] }, pieces)
    expect(got).toEqual({ src: [plainSource(u).indexOf('Then')], tr: [plainTranslated(pieces).indexOf('Dann')] })
  })
  it('the tags wire\'s cuts read a run as a formula', () => {
    const u = unitOf('First we take the set $\\{a$, $b$, $c\\}$ of all. Then we stop here.')
    const ser = serializeTags(u)
    expect(cutsOf(u, ser)).toEqual([ser.wire.indexOf('Then')])
  })
})

describe('holdsUnbalanced: a translation that may have set a run\'s parts apart (live.mjs PIPELINE_CARRIES)', () => {
  it('an inline formula whose delimiters do not balance on its own; not a balanced one, a display or text', () => {
    expect(holdsUnbalanced([{ t: 'text', s: 'x' }, { t: 'ph', src: '$\\{\\Phi_0$' }])).toBe(true)
    expect(holdsUnbalanced([{ t: 'ph', src: '$\\Phi_2\\}$' }])).toBe(true)
    expect(holdsUnbalanced([{ t: 'ph', src: '$\\{a\\}$' }, { t: 'ph', src: '\\[ ( \\]' }, { t: 'text', s: '(' }])).toBe(false)
  })
})

describe('a copy of 10 or 11 (live.mjs PIPELINE_CARRIES): the units whose wire 12 changes are sent again, and no other', () => {
  const run = unitOf(SET), apart = unitOf('For $($intrinsic$)$ maps and $\\{a\\}$ alike.')
  it('given the unit: one that holds a run is sent again; one with an unbalanced formula and no run is carried', () => {
    for (const v of ['10', '11']) {
      const carry = PIPELINE_CARRIES[v] as (pieces: unknown[], unit?: { pieces: unknown[] } | null) => boolean
      expect(carry(run.pieces, run)).toBe(false)
      expect(carry(apart.pieces, apart)).toBe(true)
      // with no unit, a translation holding an unbalanced formula is sent again: a few more, which the per-text cache answers
      expect(carry(apart.pieces, null)).toBe(false)
      expect(carry(unitOf('Plain words and $\\{a\\}$ here.').pieces, null)).toBe(true)
    }
  })
})
