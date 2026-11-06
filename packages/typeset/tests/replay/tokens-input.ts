// tokensOf2's inputs made from a sampled round (B.tokens' replay and U.marks'): tokensOf2's arguments as today's run made them
// (B.tokens:in), the elements' fills and colours by the layout unit (U.elements:in's lu and kOf, as texParts makes them), the
// faces by B.faces' port over the pair's roles (the ledger's info.paper; B.faces' own replay holds them to today's faceOf), each
// rendering's runs of one fill and faked small capitals (lanes/L3/replay/B.tokens.json.gz), the pieces' classes
// (lanes/L3/replay/U.breaks.json.gz).
import { faceOf, ownSmallCaps, type Roles, rolesFor } from '../../src/breaker/faces.ts'
import type { Face, TokensInput, TStyle } from '../../src/breaker/tokens.ts'
import type { LayoutUnit } from '../../src/unit/breaks.ts'
import { derived, ledger } from './tap.ts'

export type Facts = {
  faces: [string, Face][]
  ownCaps: Record<string, boolean>
  fills: Record<string, { text: string; fill: number }[] | null>
  smallCaps: Record<string, boolean[] | null>
  spaced: boolean
}
export type In = {
  unit: TokensInput['unit']
  prep: TokensInput['resolved']
  to: string
  base: TStyle
  designs: TokensInput['designs']
  P: TokensInput['P']
  lead: TokensInput['lead']
}
export type Reading = { lu: LayoutUnit & { colours?: Map<number, number> }; kOf: number[] }

/** the roles a pair's run drew in (setRoleFaces' arguments, the ledger's info.paper) */
export const rolesOf = (pair: string): Roles => {
  const p = ledger(pair).info.paper as { to: string; family: string; cjkFaces: { group: string } | null }
  return rolesFor(p.to, p.family, p.cjkFaces)
}

/** the derived facts of every sampled round of tokensOf2, by pair|ord|round */
export const tokenFacts = () => ({
  facts: derived<{ cases: Record<string, Facts> }>('B.tokens').cases,
  classes: derived<{ cases: Record<string, { cls2: (string | null)[] }> }>('U.breaks').cases,
})

/** B.tokens' input from a round's captures and its derived facts, its faces B.faces' */
export function tokensInput(a: In, e0: Reading, f: Facts, cls2: (string | null)[], roles: Roles): TokensInput {
  const { lu, kOf } = e0
  return {
    unit: a.unit,
    resolved: a.prep,
    colourOf: (k) => (kOf[k]! >= 0 ? (lu.colours?.get(kOf[k]!) ?? null) : null),
    fillOf: (k) => (kOf[k]! >= 0 ? ((lu.ph.get(kOf[k]!) as { fill?: number | null } | undefined)?.fill ?? null) : null),
    fills: new Map(Object.entries(f.fills).map(([k, v]) => [Number(k), v])),
    smallCaps: new Map(Object.entries(f.smallCaps).map(([k, v]) => [Number(k), v])),
    cls2,
    spacedSource: f.spaced,
    to: a.to,
    base: a.base,
    designs: a.designs,
    P: a.P,
    lead: a.lead,
    faces: { of: (st, c) => faceOf(roles, st, c), ownSmallCaps },
    tagWords: true,
  }
}
