// @vitest-environment node
// The link targets' record (lab/pdf/prepare-back/link-targets.mjs, written by run.mjs into the located dump) and its gate
// (lab/pdf/prepare-back/floats-gate.mjs): every box a head's target states holds the whole of what it names and nothing of
// another member's, read from the bundle's own parts as well as the engine's counts; a boxed float no target states is counted
// apart, never judged. Floats, parts and heads of my own.
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node module of the lab
import { gateOf } from '../../lab/pdf/prepare-back/floats-gate.mjs'
// @ts-expect-error — a plain node module of the lab
import { linkTargetsOf } from '../../lab/pdf/prepare-back/link-targets.mjs'

const float = (o: object) => ({
  serial: 1,
  page: 1,
  caption: 1,
  captions: [1],
  type: 'figure',
  box: [72, 600, 300, 700],
  cause: null,
  members: [1, 2],
  foreign: 0,
  cut: 0,
  outside: 0,
  unpaired: 0,
  ...o,
})
/** a placed member: its ord, one line on page 1 at baseline `y` across x0..x1 (its band 2 down, 7 up), its measure m0..m1 */
const placed = (ord: number, y: number, x0 = 80, x1 = 200, o: object = {}, m0 = 72, m1 = 300) => ({
  ord,
  lines: [[1, 0, x0, x1, y, y + 7, y - 2, m0, m1, 0]],
  ...o,
})
const partOf = (...members: object[]) => ({ page: 1, flows: [members] })
/** the head stating each target ([dest, kind, page, ord, box, next page?, next box?]) */
const headOf = (...targets: unknown[][]) => ({ format: 1, targets })
const recordOf = (floats: object[], parts: object[], head: object = headOf(['"figure.1"', 'float', 1, 1, [72, 600, 300, 700]])) =>
  linkTargetsOf({ floats, landings: [], dests: new Map(), parts, head })

describe('the link targets’ record: a boxed float read against the bundle’s parts', () => {
  it('a float whose members’ lines stand inside its box and no other’s meet it is right', () => {
    const r = recordOf([float({})], [partOf(placed(0, 720), placed(1, 610), placed(2, 650), placed(3, 580))])
    expect(r.wrong).toEqual([])
  })
  it('another member’s line meeting the box is foreign text; a member of its own outside it is own ink outside', () => {
    const r = recordOf([float({})], [partOf(placed(0, 696), placed(1, 610), placed(2, 650, 80, 320))])
    expect(r.wrong).toEqual([
      { dest: '"figure.1"', kind: 'float', page: 1, ord: 1, by: 2, why: 'own ink outside' },
      { dest: '"figure.1"', kind: 'float', page: 1, ord: 1, by: 0, why: 'foreign text' },
    ])
  })
  it('a refused float is read for nothing', () => {
    const r = recordOf([float({ box: null, cause: 'foreign', foreign: 3 })], [partOf(placed(0, 650))], headOf())
    expect(r.wrong).toEqual([])
  })
  it('a destination landing on a kind its hyperref name does not say is listed, never judged', () => {
    const r = linkTargetsOf({
      floats: [],
      landings: [
        { dest: '"cite.x"', kind: 'reference', page: 3, ord: 1, box: [0, 0, 1, 1] },
        { dest: '"figure.2"', kind: 'heading', page: 3, ord: 4, box: [0, 0, 1, 1] },
      ],
      dests: new Map([
        ['"cite.x"', { page: 3, x: 1, y: 2 }],
        ['"figure.2"', { page: 3, x: 1, y: 2 }],
        ['"table.1"', null],
      ]),
      parts: [],
      head: { format: 1, targets: [['"cite.x"', 'reference', 3, 1, [0, 0, 1, 1]]] },
    })
    expect(r.dests).toMatchObject({ keys: 3, resolved: 2, landed: { reference: 1, heading: 1 }, nowhere: 1 })
    expect(r.disagree).toEqual([['"figure.2"', 'heading', 'float']])
    expect(r.proof).toMatchObject({ heading: { wrong: 1 } })
    expect(r.bytes.targets).toBeGreaterThan(0)
  })
})

describe('the landings read by the left edge at the destination’s x', () => {
  it('lists a landing on a member other than the one whose left edge stands at the point’s x first under it', () => {
    const r = linkTargetsOf({
      floats: [],
      landings: [
        { dest: '"cite.a"', kind: 'reference', page: 1, ord: 0, box: [0, 0, 1, 1] },
        { dest: '"cite.b"', kind: 'reference', page: 1, ord: 1, box: [0, 0, 1, 1] },
      ],
      dests: new Map([
        ['"cite.a"', { page: 1, x: 80, y: 700 }],
        ['"cite.b"', { page: 1, x: 80, y: 676 }],
      ]),
      parts: [partOf(placed(0, 700, 90), placed(1, 688, 80), placed(2, 664, 80))],
      head: { format: 1 },
    })
    // (cite.a: member 1's edge at 80 is the first under its point, not member 0's; cite.b: member 2's, under it, not 1's)
    expect(r.edge).toEqual([
      ['"cite.a"', 'reference', 0, 1],
      ['"cite.b"', 'reference', 1, 2],
    ])
  })
})

describe('a stated landing the evidence does not prove fails the gate', () => {
  const parts = [partOf(placed(0, 700, 80), placed(1, 676, 80))]
  const at = (dest: string, kind: string, ord: number, x: number, y: number) =>
    linkTargetsOf({ floats: [], landings: [{ dest, kind, page: 1, ord, box: [0, 0, 1, 1] }], dests: new Map([[dest, { page: 1, x, y }]]), parts, head: { format: 1 } })
  it('a page anchor, a name claiming nothing with no edge, each fails; a name claiming nothing with its edge, and a citation, pass', () => {
    expect(at('"page.1"', 'reference', 0, 80, 712).pages).toHaveLength(1)
    expect(at('"Item.3"', 'reference', 1, 70, 688).unproven).toHaveLength(1)
    expect(at('"Item.3"', 'reference', 1, 80, 688)).toMatchObject({ unproven: [], proof: { reference: { proved: 1 } } })
    expect(at('"cite.a"', 'reference', 0, 70, 712)).toMatchObject({ unproven: [], proof: { reference: { kindOnly: 1 } } })
    const rec = (r: object) => ({ floats: [], wrong: [], ...r })
    expect(gateOf([['p1', rec(at('"page.1"', 'reference', 0, 80, 712))]]).pass).toBe(false)
    expect(gateOf([['p1', rec(at('"Item.3"', 'reference', 1, 70, 688))]]).pass).toBe(false)
    expect(gateOf([['p1', rec(at('"cite.a"', 'reference', 0, 70, 712))]]).pass).toBe(true)
  })
})

describe('the floats’ gate over the corpus’s records', () => {
  const rec = (floats: object[], wrong: object[] = []) => ({ floats, wrong, landings: [], dests: {}, disagree: [], bytes: {} })
  it('passes refused floats and right boxes, and counts the share of figures and tables boxed by cause', () => {
    const g = gateOf([
      ['p1', rec([float({}), float({ serial: 2, box: null, cause: 'unpaired', unpaired: 1 }), float({ serial: -1, type: 'table', box: null, cause: 'unbracketed' })])],
    ])
    expect(g.pass).toBe(true)
    expect(g.wrong).toBe(0)
    expect(g.byType.figure).toMatchObject({ bracketed: 2, boxed: 1, causes: { unpaired: 1 } })
    expect(g.byType.table).toMatchObject({ bracketed: 0, boxed: 0, causes: { unbracketed: 1 } })
  })
  it('fails where no paper states a record: a run of before checks nothing', () => {
    expect(gateOf([]).pass).toBe(false)
  })
  it('fails a boxed float a target states that the engine counts wrong, or a stated box the parts show wrong', () => {
    expect(gateOf([['p1', rec([float({ foreign: 1, stated: 1 })])]]).pass).toBe(false)
    expect(gateOf([['p1', rec([float({})], [{ dest: '"figure.1"', kind: 'float', page: 1, ord: 1, by: 0, why: 'foreign text' }])]]).pass).toBe(false)
  })
  it('judges no boxed float that no target states, and counts those apart', () => {
    const g = gateOf([['p1', rec([float({ foreign: 1 }), float({ serial: 2, stated: 1 })])]])
    expect(g).toMatchObject({ pass: true, wrong: 0, boxedUnstated: 1 })
  })
})

describe('every box a head states, of every kind, read against the parts', () => {
  const judged = (target: unknown[], ...members: object[]) =>
    recordOf([], [partOf(...members)], headOf(target)).wrong.map((w: { by: number; why: string }) => [w.by, w.why])
  it('a note whose element’s ink stands outside its box, or which holds an element TeX set whose ink is not stated, is wrong', () => {
    const box = [80, 598, 200, 607]
    const url = { kind: 'other', ink: [[1, 150, 598, 201, 607, 600]] }
    expect(judged(['"Hfootnote.1"', 'footnote', 1, 0, box], placed(0, 600, 80, 200, { els: [['u', url]] }))).toEqual([[0, 'own ink outside']])
    const kept = { kind: 'other', ink: [], keep: 1 }
    expect(judged(['"Hfootnote.1"', 'footnote', 1, 0, box], placed(0, 600, 80, 200, { els: [['u', kept]] }))).toEqual([[0, 'own ink untold']])
    // (one stated to set nothing, one whose text is its unit's, a kept space: each told)
    const told = [{ kind: 'umacro', ink: [], text: '' }, { kind: 'umacro', ink: [], text: '. ' }, { kind: 'space', ink: [], keep: 1 }]
    expect(judged(['"Hfootnote.1"', 'footnote', 1, 0, box], placed(0, 600, 80, 200, { els: told.map((e, i) => [`${i}`, e]) }))).toEqual([])
  })
  it('a reference whose box another entry’s line meets holds foreign text; one going on on another page has own ink outside', () => {
    expect(judged(['"cite.a"', 'reference', 1, 0, [80, 598, 200, 607]], placed(0, 600), placed(1, 592))).toEqual([[1, 'foreign text']])
    const two = { ord: 0, lines: [[1, 0, 80, 200, 600, 607, 598, 72, 300, 0], [2, 0, 80, 200, 700, 707, 698, 72, 300, 0]] }
    expect(judged(['"cite.a"', 'reference', 1, 0, [80, 598, 200, 607]], two)).toEqual([[0, 'own ink outside']])
  })
  it('a display’s box is its element’s ink: its paragraph’s lines are its own, another member’s line is foreign', () => {
    const eq = { kind: 'display', ink: [[1, 120, 560, 250, 580, 565]] }
    const para = { ord: 0, lines: [[1, 0, 80, 300, 590, 597, 581, 72, 300, 0], [1, 0, 80, 300, 550, 557, 548, 72, 300, 0]], els: [['e', eq]] }
    expect(judged(['"equation.1"', 'display', 1, 0, [120, 560, 250, 580]], para)).toEqual([])
    expect(judged(['"equation.1"', 'display', 1, 0, [120, 560, 250, 580]], para, placed(1, 575, 260, 280))).toEqual([])
    expect(judged(['"equation.1"', 'display', 1, 0, [120, 560, 250, 580]], para, placed(1, 575, 240, 280))).toEqual([[1, 'foreign text']])
  })
  it('a heading’s window holds its section by design: what stands under its top across its measure; else foreign, its own whole', () => {
    const win = [72, 450, 300, 607]
    const head = placed(0, 600, 80, 200)
    // (its paragraph under it, a line's ink a little past the measure, a citation in it)
    const cite = { kind: 'cite', ink: [[1, 100, 578, 120, 585, 580]] }
    expect(judged(['"section.1"', 'heading', 1, 0, win], head, placed(1, 580, 72, 300.5, { els: [['c', cite]] }))).toEqual([])
    // (a caption across both columns, its measure wider than the window's)
    expect(judged(['"section.1"', 'heading', 1, 0, win], head, placed(1, 560, 72, 540, {}, 72, 540))).toEqual([[1, 'foreign text']])
    // (a paragraph run in on its line, reaching above its top)
    const runIn = { ord: 1, lines: [[1, 0, 210, 300, 600, 607.5, 598, 72, 300, 0]] }
    expect(judged(['"section.1"', 'heading', 1, 0, win], head, runIn)).toEqual([[1, 'foreign text']])
    // (its label hung left of the window)
    expect(judged(['"section.1"', 'heading', 1, 0, win], placed(0, 600, 80, 200, { label: { ink: [1, 66, 598, 78, 607, 600] } }))).toEqual([[0, 'own ink outside']])
  })
  it('a heading’s next window on the next page is judged too', () => {
    const head = placed(0, 100, 80, 200)
    const next = { page: 2, flows: [[{ ord: 1, lines: [[2, 0, 72, 540, 700, 707, 698, 72, 540, 0]] }]] }
    const r = recordOf([], [partOf(head), next], headOf(['"section.1"', 'heading', 1, 0, [72, 72, 300, 107], 2, [72, 650, 300, 707]]))
    expect(r.wrong.map((w: { by: number; why: string }) => [w.by, w.why])).toEqual([[1, 'foreign text']])
  })
})
