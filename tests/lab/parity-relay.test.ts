// @vitest-environment node
// The fresh rule's second look (lab/typeset/parity/relay.mjs, the coordinator's ruling of 2026-11-12): today's own text laid in
// v2's unit where it can be placed exactly, else not comparable with its reason. Units of this test's own: a paragraph whose
// "R&D" today's unit held with a placeholder for "\&" and v2's holds as text; an identifier v2 holds as an element that today's
// unit held as text; a unit v2 cuts otherwise than today.
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node module of the lab
import { relayOf, todaySaid } from '../../lab/typeset/parity/relay.mjs'
import { piecesOf } from '../../src/pdf-reader/engine/pipeline/instrument.mjs'

type P = { kind: string; s?: string; src?: string }
const today = (pieces: P[]) => ({ ord: 7, id: null, kind: 'para', text: '', pieces, lines: [] })
const text = (s: string) => ({ t: 'text' as const, s })
const el = (id: string, src: string) => ({ t: 'el' as const, id, kind: 'other', src })

describe("today's door row said in v2's unit", () => {
  it("a placeholder of today's that prints a character v2's unit holds as text is that character; an element of one source is it", () => {
    // (today: "R" \& "D work, see " \cite{x}; v2: "R&D work, see " \cite{x}. Today's row: "R" \& "D Arbeit, siehe " \cite{x})
    const t = today([{ kind: 'text', s: 'R' }, { kind: 'ph', src: '\\&' }, { kind: 'text', s: 'D work, see ' }, { kind: 'ph', src: '\\cite{x}' }])
    const unit = { content: [text('R&D work, see '), el('1', '\\cite{x}')] }
    const r = todaySaid([7, ['R', 1, 'D Arbeit, siehe ', 3], 'whole', 'ms'], t, unit)
    expect(r).toEqual({ content: [{ t: 'text', s: 'R&D Arbeit, siehe ' }, { t: 'el', id: '1' }] })
  })
  it("an identifier v2 holds as an element, today's unit as its text, is placed where today's translation holds that text", () => {
    // (today: "on NL" \_ "DEV and Qasper"; v2: "on " NL\_DEV " and Qasper", its identifier an element)
    const t = today([{ kind: 'text', s: 'on NL' }, { kind: 'ph', src: '\\_' }, { kind: 'text', s: 'DEV and Qasper' }])
    const unit = { content: [text('on '), el('1', 'NL\\_DEV'), text(' and Qasper')] }
    const r = todaySaid([7, ['auf NL', 1, 'DEV und Qasper'], 'whole', 'ms'], t, unit)
    expect(r).toEqual({ content: [{ t: 'text', s: 'auf ' }, { t: 'el', id: '1' }, { t: 'text', s: ' und Qasper' }] })
  })
  it("each element named by its own id, the source's piece number, not its flat place (1512.03385v1 t324's year: element 19, 16th flat)", () => {
    // (v2's unit: "see " {\em Book}, " 2000." an element; its ids the source's numbers, a group's edges taking two of them)
    const t = today([{ kind: 'text', s: 'see ' }, { kind: 'open', src: '{' }, { kind: 'ph', src: '\\em' }, { kind: 'text', s: 'Book' }, { kind: 'close', src: '}' }, { kind: 'text', s: ', ' }, { kind: 'ph', src: '2000.' }])
    const unit = { content: [text('see '), { t: 'span' as const, id: '2', open: '{', close: '}', content: [el('3', '\\em'), text('Book')] }, text(', '), el('7', '2000.')] }
    expect(todaySaid([7, ['siehe ', 2, 'Buch, ', 6], 'whole', 'ms'], t, unit)).toEqual({ content: [{ t: 'text', s: 'siehe ' }, { t: 'el', id: '3' }, { t: 'text', s: 'Buch, ' }, { t: 'el', id: '7' }] })
  })
  it("today's sentences counted in v2's projection", () => {
    // (two sentences, the second after "R&D." : today's offsets count its placeholder one character, as v2 counts "&")
    const t = today([{ kind: 'text', s: 'We do R' }, { kind: 'ph', src: '\\&' }, { kind: 'text', s: 'D. It works.' }])
    const unit = { content: [text('We do R&D. It works.')], sentences: true as const }
    const row = [7, ['Wir machen R', 1, 'D. Es geht.'], 'whole', 'ms', { src: [0, 11], tr: [0, 16] }]
    expect(todaySaid(row, t, unit)).toEqual({ content: [{ t: 'text', s: 'Wir machen R&D. Es geht.' }], sentences: { src: [0, 11], tr: [0, 16] } })
  })
  it("a bare group a face switch opens reads alike: today's switch a placeholder, v2's the group's face (the same letters, the same face)", () => {
    // (today: "see " {\em " Book"}, the switch a placeholder that sets nothing where it stands; v2 since §18.56: "see " {" Book"},
    // the group's style italic, no element. Today's row cites the switch: "siehe " \em " Buch")
    const t = today([{ kind: 'text', s: 'see ' }, { kind: 'open', src: '{' }, { kind: 'ph', src: '\\em' }, { kind: 'text', s: ' Book' }, { kind: 'close', src: '}' }])
    const unit = { content: [text('see '), { t: 'span' as const, id: '1', style: 'italic', open: '{', close: '}', content: [text(' Book')] }] }
    expect(todaySaid([7, ['siehe ', 2, ' Buch'], 'whole', 'ms'], t, unit)).toEqual({ content: [{ t: 'text', s: 'siehe  Buch' }] })
  })
  it("a bare group whose switch stands after white space (`{ \\em Book}`) reads alike as the engine states it: the switch is the group's face", () => {
    // (today: "see " { " " \em " Book" }; v2's unit the engine's own statement of those pieces (instrument.mjs piecesOf: the group
    // italic, its white space and text one, no element). Red before: the switch was read only first at the group's open, so the
    // walk met it after the white space: "cut otherwise". Today's row cites the white space and the switch: "siehe " " " \em " Buch")
    const ps = [{ kind: 'text', s: 'see ' }, { kind: 'open', src: '{' }, { kind: 'text', s: ' ' }, { kind: 'ph', src: '\\em' }, { kind: 'text', s: ' Book' }, { kind: 'close', src: '}' }]
    const stated = (q: P[]) => ({ content: piecesOf(q.map((p) => ({ t: p.kind, s: p.s, src: p.src }))) })
    expect(stated(ps).content).toEqual([text('see '), { t: 'span', id: '1', style: 'italic', open: '{', close: '}', content: [text('  Book')] }])
    expect(todaySaid([7, ['siehe ', 2, 3, ' Buch'], 'whole', 'ms'], today(ps), stated(ps))).toEqual({ content: [{ t: 'text', s: 'siehe   Buch' }] })
    // (still cut otherwise: the same group whose letters differ; a switch after white space of another face than v2's group's)
    const books = ps.map((p) => (p.s === ' Book' ? { ...p, s: ' Books' } : p))
    expect(todaySaid([7, ['siehe ', 2, 3, ' Buch'], 'whole', 'ms'], today(ps), stated(books)).why).toMatch(/cut otherwise/)
    const bold = ps.map((p) => (p.src === '\\em' ? { ...p, src: '\\bf' } : p))
    expect(todaySaid([7, ['siehe ', 2, 3, ' Buch'], 'whole', 'ms'], today(bold), stated(ps)).why).toMatch(/cut otherwise/)
  })
  it("a switch of another face than v2's group's, or a group v2 states with no face, is still cut otherwise", () => {
    // (today's switch sets bold where v2's group is italic; and v2's bare group with no face of its own)
    const t = (sw: string) => today([{ kind: 'open', src: '{' }, { kind: 'ph', src: sw }, { kind: 'text', s: ' Book' }, { kind: 'close', src: '}' }])
    const group = (style?: string) => ({ content: [{ t: 'span' as const, id: '0', ...(style ? { style } : {}), open: '{', close: '}', content: [text(' Book')] }] })
    expect(todaySaid([7, [1, ' Buch'], 'whole', 'ms'], t('\\bf'), group('italic')).why).toMatch(/cut otherwise/)
    expect(todaySaid([7, [1, ' Buch'], 'whole', 'ms'], t('\\em'), group()).why).toMatch(/cut otherwise/)
    expect(todaySaid([7, [1, ' Buch'], 'whole', 'ms'], t('\\em'), group('italic'))).toEqual({ content: [{ t: 'text', s: ' Buch' }] })
  })
  it('not comparable where v2 cuts the unit otherwise, or the row cites a placeholder no piece of v2\'s is', () => {
    // (v2's unit joins a name today kept apart: "SIG-Im2col Unit" against today's "Unit")
    expect(todaySaid([7, ['Einheit'], 'whole', 'ms'], today([{ kind: 'text', s: 'Unit' }]), { content: [text('SIG-Im2col Unit')] }).why).toMatch(/cut otherwise/)
    // (today held a citation v2's unit has not)
    const t = today([{ kind: 'text', s: 'see ' }, { kind: 'ph', src: '\\cite{x}' }])
    expect(todaySaid([7, ['siehe ', 1], 'whole', 'ms'], t, { content: [text('see ')] }).why).toMatch(/cut otherwise/)
  })
})

describe("the re-lay's rows by the fresh row's cause", () => {
  const units = new Map([['u1', { content: [text('R&D')] }], ['u2', { content: [text('SIG Unit')] }]])
  const prepared = new Map([
    [10, today([{ kind: 'text', s: 'R' }, { kind: 'ph', src: '\\&' }, { kind: 'text', s: 'D' }])],
    [11, today([{ kind: 'text', s: 'Unit' }])],
  ])
  const doors = new Map([
    [10, [10, ['R', 1, 'D'], 'whole', 'ms']],
    [11, [11, ['Einheit'], 'whole', 'ms']],
    [12, [12, [], 'kept', 'ms']],
  ])
  it("today's text where it is placed; nothing sent where today sent nothing; today's stored row; else not comparable", () => {
    const needs = new Map([
      [1, { id: 'u1', cause: 'no-row' }],
      [2, { id: 'u2', cause: 'no-row' }],
      [3, { id: 'u3', cause: 'today-kept' }],
      [4, { id: 'u4', cause: 'unit' }],
      [5, { id: 'u5', cause: 'no-row' }],
      [6, { id: 'u6', cause: 'no-row' }],
    ])
    const todayOf = (o: number) => ({ 1: 10, 2: 11, 5: 12 })[o as 1 | 2 | 5]
    const r = relayOf(needs, { todayOf, doors, prepared, units })
    expect(Object.fromEntries(r.how)).toEqual({ 1: 'said', 3: 'unsent', 4: 'stored', 5: 'unsent' })
    expect(r.said.get('u1')).toMatchObject({ ok: true, content: [{ t: 'text', s: 'R&D' }] })
    expect(Object.fromEntries(r.incomparable)).toEqual({ 2: expect.stringMatching(/cut otherwise/), 6: 'no unit of today is joined to it' })
    expect([...r.drop].sort()).toEqual(['u3', 'u4', 'u5'])
  })
})
