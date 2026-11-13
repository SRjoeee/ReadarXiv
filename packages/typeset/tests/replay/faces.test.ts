// B.faces replayed on the tap: every face today's faceOf gave a run of the sampled rounds of tokensOf2 (watched by
// lab/typeset/derive.mjs: lanes/L3/replay/B.tokens.json.gz `faces`, by the run's style and script class), over the roles of
// the pair's target, English family and CJK family (the ledger's info.paper, setRoleFaces' arguments); and whether each
// face draws small capitals of its own. The catalogue (data/faces.ts) is the package's source; tests/unit/data.test.ts holds
// its shape.
import { describe, expect, it } from 'vitest'
import { faceOf, ownSmallCaps, rolesFor } from '../../src/breaker/faces.ts'
import type { TStyle } from '../../src/breaker/tokens.ts'
import { firstDifference, hasDerived, hasTap, ledger } from './tap.ts'
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
  it('gives today’s face for every run of every sampled round of the tokens', { timeout: 120_000 }, () => {
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
})
