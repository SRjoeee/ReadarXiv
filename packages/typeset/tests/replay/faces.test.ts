// B.faces replayed on the tap: every face today's faceOf gave a run of the sampled rounds of tokensOf2 (watched by
// lab/typeset/derive.mjs: lanes/L3/replay/B.tokens.json.gz `faces`, by the run's style and script class), over the roles of
// the pair's target, English family and CJK family (the ledger's info.paper, setRoleFaces' arguments); and whether each
// face draws small capitals of its own. The catalogue against today's own tables where today's engine is at hand.
import { describe, expect, it } from 'vitest'
import { faceOf, ownSmallCaps, rolesFor } from '../../src/breaker/faces.ts'
import type { TStyle } from '../../src/breaker/tokens.ts'
import { FACES, HOLDS, SMCP } from '../../src/data/faces.ts'
import { firstDifference, hasDerived, hasTap, hasToday, ledger, TODAY } from './tap.ts'
import { tokenFacts } from './tokens-input.ts'

type Paper = { to: string; family: string; cjkFaces: { group: string } | null }
/** a run's style and class from derive.mjs's key (fam|design|bold|italic|caps|cls) */
const ofKey = (key: string): [TStyle, 'cjk' | 'latin'] => {
  const [fam, design, bold, italic, caps, cls] = key.split('|')
  return [
    {
      ...(fam === 'undefined' ? {} : { fam }),
      ...(design === 'undefined' ? {} : { design }),
      bold: bold === 'true',
      italic: italic === 'true',
      caps: caps === 'true',
    },
    cls as 'cjk' | 'latin',
  ]
}

describe.skipIf(!hasTap || !hasDerived('B.tokens'))('B.faces: replayed on the tap', () => {
  it('gives today’s face for every run of every sampled round of the tokens', () => {
    const { facts } = tokenFacts()
    const differ: string[] = []
    const count = { rounds: 0, faces: 0, cjk: 0, oblique: 0, caps: 0, ownCaps: 0, pairs: new Set<string>() }
    for (const [key, f] of Object.entries(facts)) {
      const pair = key.split('|')[0]!
      const paper = ledger(pair).info.paper as Paper
      const roles = rolesFor(paper.to, paper.family, paper.cjkFaces)
      count.rounds++
      count.pairs.add(pair)
      for (const [k, want] of f.faces) {
        const [st, cls] = ofKey(k)
        const got = faceOf(roles, st, cls)
        count.faces++
        if (cls === 'cjk') count.cjk++
        if (got.oblique) count.oblique++
        if (got.caps) count.caps++
        const d = firstDifference(got, want, k)
        if (d) differ.push(`${key}: ${d}`)
      }
      for (const [id, own] of Object.entries(f.ownCaps)) {
        if (own) count.ownCaps++
        if (ownSmallCaps(id) !== own) differ.push(`${key}: ownSmallCaps(${id}) ${!own}`)
      }
    }
    expect(differ).toEqual([])
    expect({ ...count, pairs: count.pairs.size }).toEqual({
      rounds: 50,
      faces: 99,
      cjk: 29,
      oblique: 3,
      caps: 4,
      ownCaps: 8,
      pairs: 13,
    })
  })

  it.skipIf(!hasToday)('holds today’s catalogue: every face, its letters, its small capitals', async () => {
    const R = `${TODAY}/src/pdf-reader/engine/rules/`
    const roles = (await import(`${R}font-roles.mjs`)) as { FACES: Record<string, Record<string, unknown>> }
    const letters = (await import(`${R}font-letters.mjs`)) as { HOLDS: Record<string, string[]>; SMCP: string[] }
    const today = Object.fromEntries(
      Object.entries(roles.FACES).map(([id, f]) => [
        id,
        { family: f.family, weight: f.weight, style: f.style, size: f.size },
      ]),
    )
    expect(Object.keys(FACES)).toEqual(Object.keys(roles.FACES))
    expect(firstDifference(FACES, today)).toBeNull()
    expect(firstDifference(HOLDS, letters.HOLDS)).toBeNull()
    expect([...SMCP]).toEqual([...letters.SMCP])
  })
})
