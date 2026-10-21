import { describe, expect, it } from 'vitest'
import { PIPELINE_CARRIES } from '@/pdf-reader/engine/pipeline/live.mjs'
import { inMemory, loadProject } from '@/pdf-reader/engine/source/latex-front.mjs'
import { cutsOf, displayStopChanges, plainSource, plainTranslated, rehydrate, rehydrateTags, sentencesOf, serialize, serializeTags, translateUnits } from '@/pdf-reader/engine/translate/mt.mjs'

// A display's own punctuation, the stop or comma its sentence ends or pauses with, is set inside the display, where the
// layer draws it with the formula's crop. On the wire the display is one marker, and the sentence lost its end: 2610.10069's
// "Substituting (1) yields @q# Prices and shares are ..." read to Microsoft as one run of nouns, "yields" a financial yield. The wire
// now writes the display's own stop right after its marker (`yields @a#. Prices`), and the reading back takes off what the
// reply set there for it, the display drawing its own

type Piece = { t: string; s?: string; src?: string; tr?: boolean; id?: number }
const project = (body: string) => loadProject(inMemory(new Map([['main.tex', new TextEncoder().encode(`\\documentclass{article}\\begin{document}\n${body}\n\\end{document}\n`)]])), 'main.tex')
const unitsOf = (body: string) => project(body).units as { kind: string; pieces: Piece[] }[]
const unitOf = (body: string) => unitsOf(body)[0] as { kind: string; pieces: Piece[] }
/** pieces as one string: text as it stands, a placeholder as its source; the unit's white space at its ends off */
const joined = (pieces: Piece[]) => pieces.map(p => (p.t === 'text' ? p.s : p.src)).join('').trim()
const display = (body: string) => ({ t: 'ph', src: body })
const text = (s: string) => ({ t: 'text', s })
const unit = (...pieces: Piece[]) => ({ kind: 'para', pieces })

const EQ = '\\begin{equation}\n  p_j = \\frac{e^{\\delta_j}}{1 + \\sum_k e^{\\delta_k}}.\n  \\label{eq:share}\n\\end{equation}'
const YIELDS = `Substituting (1) yields\n${EQ}\nPrices and shares are allowed to be endogenous.`
const WHERE = 'We write the share as\n\\[ s = \\sigma(\\delta), \\]\nwhere $\\sigma$ is the demand system of the market.'

describe('serialize: a display\'s own stop goes on the wire right after its marker', () => {
  it('a full stop: the sentence ends at the display, and the next begins after it (2610.10069\'s "yields")', () => {
    expect(serialize(unitOf(YIELDS)).wire).toBe('Substituting (1) yields @a#. Prices and shares are allowed to be endogenous.')
  })
  it('a comma: the sentence goes on after the display', () => {
    expect(serialize(unitOf(WHERE)).wire).toBe('We write the share as @a#, where @b# is the demand system of the market.')
  })
  it('at the unit\'s end', () => {
    expect(serialize(unitOf('The model is then\n\\begin{align}\n  y &= x;\n\\end{align}')).wire).toBe('The model is then @a#;')
  })
  it('behind what sets none of it: a label, a number\'s switch, a tag, a line break, a space of TeX\'s, a comment, an inner environment, \\text', () => {
    const stopOf = (src: string) => serialize(unit(text('It reads '), display(src), text(' Then it ends.'))).wire.match(/@a#(\S?)/)?.[1]
    expect(stopOf('\\begin{equation} x = y. \\label{a} \\end{equation}')).toBe('.')
    expect(stopOf('\\begin{align} x &= y, \\nonumber \\\\ z &= w. \\nonumber \\end{align}')).toBe('.')
    expect(stopOf('\\begin{equation} x = y, \\quad \\tag{2} \\end{equation}')).toBe(',')
    expect(stopOf('\\begin{equation}\n x = y. % the end of the proof\n\\end{equation}')).toBe('.')
    expect(stopOf('\\begin{equation}\\begin{split} x &= y \\\\ &= z. \\end{split}\\end{equation}')).toBe('.')
    expect(stopOf('\\[ f(x) = \\begin{cases} 1, & x > 0, \\\\ 0, & \\text{otherwise}. \\end{cases} \\]')).toBe('.')
    expect(stopOf('\\[ x = y \\text{.} \\]')).toBe('.')
    expect(stopOf('$$ x = y; \\qedhere $$')).toBe(';')
    expect(stopOf('\\begin{equation*} x = y : \\end{equation*}')).toBe(':')
    expect(stopOf('\\begin{align} x &= y, \\\\ z &= w.\\\\\\end{align}')).toBe('.')
    expect(stopOf('\\[ x = y \\mbox{,} \\]')).toBe(',')
  })
  it('a display with no stop of its own adds nothing', () => {
    const wire = (src: string) => serialize(unit(text('It reads '), display(src), text(' then it ends.'))).wire
    expect(wire('\\[ x = y \\]')).toBe('It reads @a# then it ends.')
    // (an empty delimiter, a space of TeX's, an escaped character: none is punctuation)
    expect(wire('\\[ \\left\\{ x \\right. \\]')).toBe('It reads @a# then it ends.')
    expect(wire('\\[ x = y \\; \\]')).toBe('It reads @a# then it ends.')
    expect(wire('\\[ 50 \\% \\]')).toBe('It reads @a# then it ends.')
    expect(wire('\\[ \\text{as follows:} \\]')).toBe('It reads @a# then it ends.')
    expect(wire('\\[ x = y \\. \\]')).toBe('It reads @a# then it ends.')
    // (an environment that is no math: a picture's own terminator is none of the sentence's)
    expect(wire('\\[ \\begin{tikzpicture} \\draw (0,0) -- (1,1); \\end{tikzpicture} \\]')).toBe('It reads @a# then it ends.')
    // (a group that sets no ink: a phantom's mark is no stop)
    expect(wire('\\[ x = y \\hphantom{.} \\]')).toBe('It reads @a# then it ends.')
    expect(wire('\\[ x = y \\phantom{,} \\]')).toBe('It reads @a# then it ends.')
  })
  it('nor where the text after it begins with punctuation of its own, nor after an inline formula', () => {
    expect(serialize(unit(text('It reads '), display('\\[ x = y. \\]'), text(', then it ends.'))).wire).toBe('It reads @a#, then it ends.')
    expect(serialize(unit(text('It reads '), { t: 'ph', src: '$x = y.$' }, text(' then it ends.'))).wire).toBe('It reads @a# then it ends.')
  })
  it('a display that goes out with what sets no ink after it, one marker for them (`x.\\end{equation}\\n\\noindent`)', () => {
    const s = serialize(unit(text('It reads '), display('\\[ x = y. \\]'), text('\n'), { t: 'ph', src: '\\noindent' }, text(' Then it ends.')))
    expect(s.wire).toBe('It reads @a#. Then it ends.')
    expect((s.slots[0] as { t: string }).t).toBe('run')
  })
  it('the stop\'s offset in a wire trimmed at its start (a styled unit)', () => {
    const v = unit({ t: 'ph', src: '\\noindent' }, text(' We then have '), display('\\[ x = y. \\]'), text(' Then it ends.'))
    for (const s of [serialize(v), serializeTags(v)]) {
      expect(s.wire.startsWith('We then have')).toBe(true)
      const o = [...(s.own?.values() ?? [])][0]
      expect(s.wire[o?.at ?? -1]).toBe('.')
    }
  })
  it('on the tags wire too', () => {
    expect(serializeTags(unitOf(YIELDS)).wire).toBe('Substituting (1) yields <x id="1"/>. Prices and shares are allowed to be endogenous.')
    expect(serializeTags(unitOf(WHERE)).wire).toBe('We write the share as <x id="1"/>, where <x id="2"/> is the demand system of the market.')
  })
})

describe('rehydrate: what the reply set for the display\'s own stop is taken off, the display drawing its own', () => {
  const u = unitOf(YIELDS), ser = serialize(u)
  const back = (reply: string, s = ser, tolerant = false) => {
    const r = rehydrate(reply, s, tolerant)
    return 'pieces' in r ? joined(r.pieces as Piece[]).replace(EQ, '[EQ]').replace(/\\\[[\s\S]*?\\\]/, '[D]') : r.error
  }
  it('the stop right after the marker, ASCII or full-width', () => {
    expect(back('代入 (1) 得到 @a#。价格和份额允许是内生的。')).toBe('代入 (1) 得到 [EQ]价格和份额允许是内生的。')
    expect(back('Einsetzen von (1) ergibt @a#. Preise und Anteile dürfen endogen sein.')).toBe('Einsetzen von (1) ergibt [EQ] Preise und Anteile dürfen endogen sein.')
  })
  it('one the reply set twice', () => {
    expect(back('代入 (1) 得到 @a#。。价格和份额允许是内生的。')).toBe('代入 (1) 得到 [EQ]价格和份额允许是内生的。')
  })
  it('a mark right before the marker is the reply\'s own, kept, with a mark after the marker or none', () => {
    // (Microsoft's recorded Chinese answers: none moved a marker's mark before it, 0 of 4,825; every mark before one was its
    // own — a clause's comma where it set the marker inside its sentence, the previous sentence's stop where it set the
    // marker at the next one's start —, and an abbreviation's stop is no sentence's)
    expect(back('代入 (1) 得到。@a#价格和份额允许是内生的。')).toBe('代入 (1) 得到。[EQ]价格和份额允许是内生的。')
    expect(back('代入 (1) 得到。 @a#。价格和份额允许是内生的。')).toBe('代入 (1) 得到。 [EQ]价格和份额允许是内生的。')
    const w = serialize(unitOf(WHERE))
    expect(back('我们把份额写成，@a#，其中 @b# 是市场的需求系统。', w)).toBe('我们把份额写成，[D]其中 $\\sigma$ 是市场的需求系统。')
    expect(back('Einsetzen ergibt, d. h. @a#. Preise und Anteile sind endogen.')).toBe('Einsetzen ergibt, d. h. [EQ] Preise und Anteile sind endogen.')
    expect(back('Einsetzen ergibt, d. h. @a# Preise und Anteile sind endogen.')).toBe('Einsetzen ergibt, d. h. [EQ] Preise und Anteile sind endogen.')
  })
  it('a mark after a later marker, no display\'s, is the reply\'s own', () => {
    const w = serialize(unitOf(WHERE))
    expect(back('我们把份额写成 @a#，其中 @b#，是市场的需求系统。', w)).toBe('我们把份额写成 [D]其中 $\\sigma$，是市场的需求系统。')
  })
  it('on the tags wire, a mark after a later tag, no display\'s, is the reply\'s own', () => {
    const v = unit(text('It reads '), display('\\[ x = y. \\]'), text(' '), { t: 'open', id: 1, src: '\\textbf{' }, text('Prices'), { t: 'close', id: 1, src: '}' }, text(', and shares go up.'))
    const t = serializeTags(v)
    expect(t.wire).toBe('It reads <x id="1"/>. <t id="2">Prices</t>, and shares go up.')
    const r = rehydrateTags('它读取 <x id="1"/>。<t id="2">价格</t>，以及份额上涨。', t)
    expect('pieces' in r ? joined(r.pieces as Piece[]).replace(/\\\[[\s\S]*?\\\]/, '[D]') : r.error).toBe('它读取 [D]\\textbf{价格}，以及份额上涨。')
  })
  it('a reply that dropped it is read as it is', () => {
    expect(back('代入 (1) 得到 @a# 价格和份额允许是内生的。')).toBe('代入 (1) 得到 [EQ] 价格和份额允许是内生的。')
  })
  it('a comma in the middle of the sentence, and the tolerant reading', () => {
    const w = unitOf(WHERE), s = serialize(w)
    expect(back('我们把份额写成 @a#，其中 @b# 是市场的需求系统。', s)).toBe('我们把份额写成 [D]其中 $\\sigma$ 是市场的需求系统。')
    expect(back('我们把份额写成 @a、其中 @b# 是市场的需求系统。', s, true)).toBe('我们把份额写成 [D]其中 $\\sigma$ 是市场的需求系统。')
  })
  it('a stop before the marker where the source\'s text before it ends with one is the reply\'s own', () => {
    const v = unit(text('We have the following. '), display('\\[ x = y. \\]'), text(' Then it ends.')), s = serialize(v)
    expect(s.wire).toBe('We have the following. @a#. Then it ends.')
    expect(back('我们有如下结果。@a#。然后结束。', s)).toBe('我们有如下结果。[D]然后结束。')
  })
  it('a marker right after the display\'s own stop: the space the wire set after the stop off too (2307.16209\'s subequations)', () => {
    const v = unit(text('It reads '), display('\\[ x = y. \\]'), display('\\begin{equation} z = w. \\end{equation}'), text(' Then it ends.')), s = serialize(v)
    expect(s.wire).toBe('It reads @a#. @b#. Then it ends.')
    const pieces = (reply: string) => { const r = rehydrate(reply, s); return 'pieces' in r ? (r.pieces as Piece[]).map(p => (p.t === 'text' ? p.s : p.t)) : r.error }
    expect(pieces('它读取 @a#。@b#。然后结束。')).toEqual(['它读取 ', 'ph', 'ph', '然后结束。'])
    expect(pieces('Es liest @a#. @b#. Dann endet es.')).toEqual(['Es liest ', 'ph', 'ph', ' Dann endet es.'])
  })
  it('the tags wire the same', () => {
    const t = serializeTags(u)
    const tags = (reply: string) => { const r = rehydrateTags(reply, t); return 'pieces' in r ? joined(r.pieces as Piece[]).replace(EQ, '[EQ]') : r.error }
    expect(tags('代入 (1) 得到 <x id="1"/>。价格和份额允许是内生的。')).toBe('代入 (1) 得到 [EQ]价格和份额允许是内生的。')
    expect(tags('代入 (1) 得到。<x id="1"/>价格和份额允许是内生的。')).toBe('代入 (1) 得到。[EQ]价格和份额允许是内生的。')
    expect(tags('代入 (1) 得到。<x id="1"/>。。价格和份额允许是内生的。')).toBe('代入 (1) 得到。[EQ]价格和份额允许是内生的。')
    expect(tags('代入 (1) 得到 <x id="1"/> 价格和份额允许是内生的。')).toBe('代入 (1) 得到 [EQ] 价格和份额允许是内生的。')
  })
})

describe('the readers of both wires (translateUnits): Microsoft\'s markers and an LLM\'s tags', () => {
  it('each unit read back with the display\'s stop its own', async () => {
    const u = unitOf(YIELDS)
    const zh = (s: string) => s.replace('Substituting (1) yields', '代入 (1) 得到').replace(/\.? ?Prices and shares are allowed to be endogenous\./, '。价格和份额允许是内生的。')
    for (const format of ['markers', 'tags'] as const) {
      const { results, how } = await translateUnits([u], async texts => texts.map(t => ({ text: zh(t), by: 'B' })), format)
      expect(how.whole, format).toBe(1)
      expect(joined(results.get(u)?.pieces as Piece[]).replace(EQ, '[EQ]'), format).toBe('代入 (1) 得到 [EQ]价格和份额允许是内生的。')
    }
  })
})

describe('the sentences: the display\'s stop ends one, and is counted nowhere', () => {
  const cut = (source: string[], target: string[]) => ({ source: source.map(s => s.length), target: target.map(s => s.length) })
  const word = (s: string, o: number) => s.slice(o).split(/[\s，。,.]/)[0]
  it('on the markers wire, Microsoft\'s lengths: the second sentence begins at its first word on both sides', () => {
    const u = unitOf(YIELDS), ser = serialize(u)
    const reply = '代入 (1) 得到 @a#。价格和份额允许是内生的。'
    const pieces = (rehydrate(reply, ser) as { pieces: Piece[] }).pieces
    const s = sentencesOf(u, ser, reply, cut(['Substituting (1) yields @a#. ', 'Prices and shares are allowed to be endogenous.'], ['代入 (1) 得到 @a#。', '价格和份额允许是内生的。']), pieces as never)
    expect(s?.src.map(o => word(plainSource(u), o))).toEqual(['Prices'])
    expect(s?.tr.map(o => word(plainTranslated(pieces as never), o))).toEqual(['价格和份额允许是内生的'])
  })
  it('on the tags wire: a cut after the stop, and the lengths read where it landed', () => {
    const u = unitOf(YIELDS), ser = serializeTags(u)
    expect(cutsOf(u, ser)).toEqual([ser.wire.indexOf('Prices')])
    const reply = '代入 (1) 得到 <x id="1"/>。价格和份额允许是内生的。'
    const pieces = (rehydrateTags(reply, ser) as { pieces: Piece[] }).pieces
    const at = ser.wire.indexOf('Prices'), to = reply.indexOf('价格')
    const s = sentencesOf(u, ser, reply, cut([ser.wire.slice(0, at), ser.wire.slice(at)], [reply.slice(0, to), reply.slice(to)]), pieces as never, false, 'tags')
    expect(s?.src.map(o => word(plainSource(u), o))).toEqual(['Prices'])
    expect(s?.tr.map(o => word(plainTranslated(pieces as never), o))).toEqual(['价格和份额允许是内生的'])
  })
})

describe('the units whose wire the rule changes (displayStopChanges), which a copy made before it sends again', () => {
  it('a unit that holds a display with a stop of its own; not one whose display has none, nor one with no display', () => {
    expect(displayStopChanges(unitOf(YIELDS))).toBe(true)
    expect(displayStopChanges(unitOf(WHERE))).toBe(true)
    expect(displayStopChanges(unitOf('It reads\n\\[ x = y \\]\nthen it ends with words.'))).toBe(false)
    expect(displayStopChanges(unitOf('It reads $x = y.$ then it ends with words.'))).toBe(false)
    expect(displayStopChanges(unit(text('It reads '), display('\\[ x = y. \\]'), text(', then it ends.')))).toBe(false)
  })
  it('every older pipeline\'s test takes it: given the unit, and without it a translation that holds such a display', () => {
    const stop = unitOf(YIELDS), none = unitOf('It reads\n\\[ x = y \\]\nthen it ends with words.')
    const tr = (u: { pieces: Piece[] }) => u.pieces.map(p => (p.t === 'text' ? { ...p, tr: true, s: '\u8bba\u6587' } : p))
    for (const [v, carry] of Object.entries(PIPELINE_CARRIES) as [string, (pieces: unknown[], unit?: unknown) => boolean][]) {
      // (23 sent it with its stop already: its copies are carried whole, as 24 changes no unit's wire)
      if (Number(v) < 15 || Number(v) >= 23) continue
      expect(carry(tr(stop), stop), v).toBe(false)
      expect(carry(tr(none), none), v).toBe(true)
      expect(carry(tr(stop), null), v).toBe(false)
      expect(carry(tr(none), null), v).toBe(true)
    }
    for (const [v, carry] of Object.entries(PIPELINE_CARRIES) as [string, (pieces: unknown[], unit?: unknown) => boolean][]) if (Number(v) < 15) expect(carry(tr(stop), stop), v).toBe(false)
  })
})
