// @vitest-environment node
// The parity's bundles guard (lab/typeset/parity/inputs.mjs): a v2 file names the bundles it was laid over (the digest of the
// paper's head, which names every part and unit chunk by its own digest); the drawing and the verdict refuse a file laid over
// other bundles than the ones they serve, and draw one of before the guard (no such field) with a warning. Twice a sheet was
// wrong for want of it: a toggles-on drawing against the default bundles' document, which unwrapped half of each page, and a
// re-measure without the bundles read 63 pages worse. Synthetic heads in a temporary folder.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node module of the lab
import { bundleCheck, bundleOf, putsInPlace } from '../../lab/typeset/parity/inputs.mjs'

describe('a v2 file against the bundles a drawing or a verdict serves', () => {
  const dirs: string[] = []
  afterAll(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })
  /** a bundles folder holding one paper's head */
  const bundles = (head: object) => {
    const d = mkdtempSync(join(tmpdir(), 'parity-guard-'))
    dirs.push(d)
    mkdirSync(join(d, '2601.00001v1'))
    writeFileSync(join(d, '2601.00001v1', 'head.json'), JSON.stringify(head))
    return d
  }
  const a = bundles({ paper: { pages: 2 }, parts: ['p1', 'p2'], units: ['u1'] })
  const b = bundles({ paper: { pages: 2 }, parts: ['p1', 'p3'], units: ['u1'] })
  it("names a paper's bundles by its head's digest and the folder; none where the folder holds no head", () => {
    const x = bundleOf('2601.00001v1', a)
    expect(x.head).toMatch(/^[0-9a-f]{64}$/)
    expect(x.dir).toBe(a)
    expect(bundleOf('2601.00001v1', a).head).toBe(x.head)
    expect(bundleOf('2601.00001v1', b).head).not.toBe(x.head)
    expect(bundleOf('2601.00002v1', a)).toBeNull()
  })
  it('a file laid over the bundles served: drawn', () => {
    expect(bundleCheck({ bundle: bundleOf('2601.00001v1', a) }, bundleOf('2601.00001v1', a))).toEqual({ ok: true })
  })
  it('a file laid over other bundles: refused, naming both', () => {
    const got = bundleCheck({ pair: '2601.00001v1-zh', bundle: bundleOf('2601.00001v1', a) }, bundleOf('2601.00001v1', b))
    expect(got.ok).toBe(false)
    expect(got.why).toContain(a)
    expect(got.why).toContain(b)
    expect(got.why).toContain(bundleOf('2601.00001v1', a).head.slice(0, 12))
  })
  it('a file of before the guard (no bundles named): drawn, with a warning', () => {
    const got = bundleCheck({ pair: '2601.00001v1-zh' }, bundleOf('2601.00001v1', a))
    expect(got.ok).toBe(true)
    expect(got.warning).toMatch(/names no bundles/)
  })
})

describe("a page the reader puts nothing in place on is drawn as arXiv's (the reader's rule, compose/composer.ts)", () => {
  // (2608.06701v1 p12 under the default toggles: a page of references, the switch off; 40 members left the original's, 8 none,
  // one laid with no line on the page, hiding nothing: the reader shows arXiv's page, and the drawing waited 30 s for an overlay)
  it('a member laid that hides nothing, or none laid: no overlay; one laid that hides its ink: an overlay', () => {
    expect(putsInPlace([{ state: 'left' }, { state: 'none' }, { state: 'laid', off: 0 }])).toBe(false)
    expect(putsInPlace([{ state: 'left' }])).toBe(false)
    expect(putsInPlace(undefined)).toBe(false)
    expect(putsInPlace([{ state: 'left' }, { state: 'laid', off: 3 }])).toBe(true)
  })
})

