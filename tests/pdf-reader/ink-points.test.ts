import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { pageInk } from '@readarxiv/engine'

// The marked compile's points as pageInk reads them (packages/engine/src/ink.mjs): each a rendering intent `/axt-<name> ri`,
// kept apart by its name where it is no mark of any unit's, so that no reader of the marks meets it among their points.

const objs = { get: () => null, has: () => false }
const intents = (...names: string[]) => ({
  fnArray: names.map(() => OPS.setRenderingIntent),
  argsArray: names.map((n) => [`axt-${n}`]),
})

describe('pageInk: the marked compile’s points', () => {
  it('keeps a front matter environment’s point apart from the marks’ points (`fronts`)', () => {
    // (`fm<n>`, where TeX begins the abstract: read among the points, it ended an opening alone that own.mjs MR 3 reads to
    // the next point, 2608.06701v1's e-mail placeholder)
    const got = pageInk(OPS, intents('1s', 'fm1', 'qe1c', '1e'), objs, { rotate: 0 })
    expect(got.points.map((p) => p.name)).toEqual(['1s', '1e'])
    expect(got.fronts?.map((p) => p.name)).toEqual(['fm1'])
    expect(got.paraEnds?.map((p) => p.name)).toEqual(['qe1c'])
  })
})
