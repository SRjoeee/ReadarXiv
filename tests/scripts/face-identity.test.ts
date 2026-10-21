// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { compareTrees, readFound, treeFaces, yearsOf } from '../../lab/pdf/spikes/face-identity.mjs'
import { METRICS } from '../../src/pdf-reader/engine/rules/font-coverage.mjs'
import { FACES } from '../../src/pdf-reader/engine/rules/font-roles.mjs'

// The face-identity check (lab/pdf/spikes/face-identity.mjs): the role table's TeX Live faces against the hosted bytes, in each
// pinned tree. The reading of a container's lines and the comparison, on synthetic answers; the containers are the maintainer's

const A = 'a'.repeat(64), B = 'b'.repeat(64)

describe('the faces a tree holds, and a container\'s answer read back', () => {
  it('takes the role table\'s TeX Live faces, none of the hosted sources\'', () => {
    const faces = treeFaces()
    expect(faces.length).toBeGreaterThan(0)
    for (const [id, file] of faces) expect(FACES[id]).toMatchObject({ source: 'texlive', file })
    expect(faces.some(([id]) => id.startsWith('shs-'))).toBe(false)
    // (each has a hosted digest to be held to)
    for (const [id] of faces) expect(METRICS[id]?.sha256, id).toMatch(/^[0-9a-f]{64}$/)
  })

  it('reads each file\'s digest and size, a file not found as none', () => {
    const got = readFound(`lmroman10-regular.otf\t${A}\t1234\nmissing.otf\t-\t-\n\n`)
    expect(got).toEqual(new Map([['lmroman10-regular.otf', { sha256: A, bytes: 1234 }], ['missing.otf', null]]))
  })
})

describe('the trees asked', () => {
  const pins = { default: '2025', images: { 2025: {}, 2023: {} } }

  it('are every pinned year by default, the default first, and those --years names; never none, nor one not pinned', () => {
    expect(yearsOf([], pins)).toEqual(['2025', '2023'])
    expect(yearsOf(['--years=2023'], pins)).toEqual(['2023'])
    expect(() => yearsOf(['--years='], pins)).toThrow(/no TeX Live year/)
    expect(() => yearsOf(['--years=,'], pins)).toThrow(/no TeX Live year/)
    expect(() => yearsOf(['--years=2019'], pins)).toThrow(/2019 is not pinned/)
  })
})

describe('each face told against the hosted bytes in every tree', () => {
  const faces: [string, string][] = [['x-regular', 'x.otf'], ['y-regular', 'y.otf'], ['z-regular', 'z.otf']]
  const metrics = { 'x-regular': { sha256: A }, 'y-regular': { sha256: A }, 'z-regular': { sha256: A } }

  it('is the same where every tree has the hosted bytes, differs where one has others, is missing where one has none', () => {
    const byYear = {
      2025: new Map([['x.otf', { sha256: A, bytes: 1 }], ['y.otf', { sha256: A, bytes: 1 }], ['z.otf', { sha256: A, bytes: 1 }]]),
      2023: new Map([['x.otf', { sha256: A, bytes: 1 }], ['y.otf', { sha256: B, bytes: 2 }], ['z.otf', null]]),
    }
    expect(compareTrees(byYear, faces, metrics as never)).toEqual({ same: ['x-regular'], differ: [{ id: 'y-regular', file: 'y.otf', years: ['2023'] }], missing: [{ id: 'z-regular', file: 'z.otf', years: ['2023'] }] })
  })

  it('tells nothing for no tree: a comparison of none is refused', () => {
    expect(() => compareTrees({}, faces, metrics as never)).toThrow(/no tree/)
  })

  it('holds a face whose hosted digest is not recorded as differing in every tree', () => {
    const byYear = { 2025: new Map([['x.otf', { sha256: A, bytes: 1 }]]) }
    expect(compareTrees(byYear, [['x-regular', 'x.otf']], {} as never)).toEqual({ same: [], differ: [{ id: 'x-regular', file: 'x.otf', years: ['2025'] }], missing: [] })
  })
})
