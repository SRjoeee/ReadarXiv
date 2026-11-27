// @vitest-environment node
// The link targets' record (lab/pdf/prepare-back/link-targets.mjs, written by run.mjs into the located dump) and its gate
// (lab/pdf/prepare-back/floats-gate.mjs): a boxed float is wrong where a member of its own has ink outside its box or another
// member's text meets it, read from the bundle's own parts as well as the engine's counts. Floats, parts and heads of my own.
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
/** a placed member: its ord, one line on page 1 at baseline `y` across x0..x1 (its band 2 down, 7 up) */
const placed = (ord: number, y: number, x0 = 80, x1 = 200) => ({ ord, lines: [[1, 0, x0, x1, y, y + 7, y - 2, 72, 300, 0]] })
const partOf = (...members: object[]) => ({ page: 1, flows: [members] })
const recordOf = (floats: object[], parts: object[]) =>
  linkTargetsOf({ floats, landings: [], dests: new Map(), parts, head: { format: 1 } })

describe('the link targets’ record: a boxed float read against the bundle’s parts', () => {
  it('a float whose members’ lines stand inside its box and no other’s meet it is right', () => {
    const r = recordOf([float({})], [partOf(placed(0, 720), placed(1, 610), placed(2, 650), placed(3, 580))])
    expect(r.wrong).toEqual([])
  })
  it('another member’s line meeting the box is foreign text; a member of its own outside it is own ink outside', () => {
    const r = recordOf([float({})], [partOf(placed(0, 696), placed(1, 610), placed(2, 650, 80, 320))])
    expect(r.wrong).toEqual([
      { serial: 1, page: 1, ord: 0, why: 'foreign text' },
      { serial: 1, page: 1, ord: 2, why: 'own ink outside' },
    ])
  })
  it('a refused float is read for nothing', () => {
    const r = recordOf([float({ box: null, cause: 'foreign', foreign: 3 })], [partOf(placed(0, 650))])
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
  it('fails a boxed float the engine counts wrong, or one the parts show wrong', () => {
    expect(gateOf([['p1', rec([float({ foreign: 1 })])]]).pass).toBe(false)
    expect(gateOf([['p1', rec([float({})], [{ serial: 1, page: 1, ord: 0, why: 'foreign text' }])]]).pass).toBe(false)
  })
})
