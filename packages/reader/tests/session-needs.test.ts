// The open's needs over our server's document (needsOf): what a visit asks the open for, read off the document as our server
// writes it (format's PaperDoc), no state of the session's own beyond it. A prepare's layer of more than one Units object (the
// source's, told before any compile, then the bundle's, the head's), its target done on the same list: nothing asked; that
// target over a layer that names fewer: the translation asked again. A refusal of the paper's own standing under our server's
// build (no retry time): nothing asked; one due again (its retry time past, the instant it ended, as our server states a
// refusal another build made): the prepare asked at once. The documents are written here.
import { describe, expect, it } from 'vitest'
import { DEFAULTS } from '../src/prefs.ts'
import { type Doc, init, needsOf, type Ref, type State, step } from '../src/session/machine.ts'
import { layerOf, paperDoc, prepareOf, runOf } from './helpers/doc.ts'

const T0 = 1_800_000_000_000
const ref = (c: string, dir = 'p/2600_00001v1/x'): Ref => ({
  path: `${dir}/${c.repeat(64).slice(0, 64)}`,
  sha256: c.repeat(64).slice(0, 64),
  bytes: 10,
})
/** the session of a visit in zh-Hans with `doc` heard for its target, at `now` */
function heard(doc: Partial<Doc>, now = T0): State {
  let s = init({
    paper: { id: '2600.00001', version: 1 },
    here: false,
    defaults: { ...DEFAULTS, display: 'bilingual', target: 'zh-Hans' },
    now,
    visible: true,
    online: true,
  })
  const link = s.link.s === 'on' ? s.link.t : ''
  s = step(s, { i: 'paper', t: link, doc: paperDoc({ epoch: 'e', rev: 1, ...doc }) }).state
  return s
}

describe("the open's needs over a layer of several Units objects", () => {
  // (the source's units, told before any compile; the bundle's, the head's own: two objects of other bytes)
  const SOURCE = ref('a'),
    BUNDLE = ref('b')
  const done = (units: Ref[]) =>
    runOf({ state: 'done', units, rows: [ref('r', 'r/2600_00001v1/zh-Hans/t')], done: 3, total: 3 })
  const prepared = prepareOf({ state: 'done', units: [SOURCE, BUNDLE] })
  it('the target done on every object the layer names, in its order: nothing asked', () => {
    const s = heard({
      prepare: prepared,
      layer: layerOf({ catalog: ref('c'), units: [SOURCE, BUNDLE] }),
      targets: { 'zh-Hans': done([SOURCE, BUNDLE]) },
    })
    expect(needsOf(s)).toEqual([])
  })
  it("the target done on the whole list under a layer that names the head's object alone: the translation asked again", () => {
    const s = heard({
      prepare: prepared,
      layer: layerOf({ catalog: ref('c'), units: [BUNDLE] }),
      targets: { 'zh-Hans': done([SOURCE, BUNDLE]) },
    })
    expect(needsOf(s)).toEqual([{ id: 'zh-Hans#1', at: null }])
  })
})

describe("the open's needs over a refusal of the paper's own", () => {
  // (the target's run named and not started: with no layer, nothing can start it, so it asks nothing of its own)
  const refused = (retryAt: number | null) =>
    heard({
      prepare: prepareOf({ state: 'failed', why: 'cannot-typeset', retryAt, at: T0 - 3_600_000, build: 'b1' }),
      targets: { 'zh-Hans': runOf() },
    })
  it("standing under our server's build (no retry time): nothing asked", () => {
    expect(needsOf(refused(null))).toEqual([])
  })
  it('due again since it ended (its retry time past): the prepare asked at once', () => {
    expect(needsOf(refused(T0 - 3_600_000))).toEqual([{ id: 'prepare#1', at: null }])
  })
  it('due later: the prepare asked at its time', () => {
    expect(needsOf(refused(T0 + 60_000))).toEqual([{ id: 'prepare#1', at: T0 + 60_000 }])
  })
})
