// U.admit (design-b §1.5): whether a unit's row is laid at all (T1: the row drawable; T2: the file locates the unit whole as
// the row has it; T18: an element the row does not carry is not checked; A9: the wrap cannot hide its ink; B19: the maker's
// reason it is not located). T4 (`unproven`, a placeholder the file cannot draw) is decided by U.elements' crops and
// recorded as U.admit's second verdict of the round (`at: 'layOnce'`). Ported from engine 065c1d973: translated RUN:844,
// shapely and refusalOf RUN:1173-1188, decide RUN:1196-1214, judge RUN:827-831, locatedWhole TEX:66-80, kOfPieces TEX:35-46,
// placeByFile's pages and cut RUN:834-843 (texRects TEX:269), unhiddenOf RUN:737, unanchoredOf RUN:854, account RUN:3104.
// The verdict is the tap's U.admit slot (baseline/tap/TAP.md §3 L1).
//
// Its inputs, and the field each comes from once lane L1 states it (until then the tap's recorded values):
// - `row`: the translated row as today's unit holds it (rows.mjs unitOf) ← format's Row with the unit's pieces
// - `lu`: the layout file's unit (kind, its source pieces' count, lines, frames, elements' rows) ← Placed (kind, lines, els);
//   null where the file does not hold it ← Placed.why 'unlocated'; `unlaid` the maker's reason then (B19)
// - `pieces`: the units file's pieces of the unit (the wire's tuples) ← Units; `clsProven`: each row piece's class ← El.kind
// - `kind`, `group`: the unit's kind and table group as the bundle gives them ← Placed.kind, Tie 'cells'
// - `unhidden`, `textGroup`: why the wrap cannot hide its ink, and whether its text group exists ← Placed.why 'unwrapped'
// - `shown`: whether the reader's toggles show its class (Rules.leave); `rects`: the left's rectangles, read only for a unit
//   wholly past the pages shown (the part never holds one: void then); `N`: the last page shown
import type { LayoutUnit, V0Piece } from './breaks.ts'
import { PH_FLAG } from './breaks.ts'

/** a translated row as today's unit holds it */
export type V0Row = { kind: string; src: string; state?: string; group?: string | null; pieces: readonly V0Piece[] }
/** U.admit's verdict: laid on these pages (`cut`: its lines go on past the last page shown), or left the original's with a
 *  code of SKIP_CODES (RUN:99), why, the maker's reason, what the file missed, where it was decided */
export type Admission =
  | { ok: true; pages: number[]; cut: boolean }
  | { ok: false; code: string | null; why: string | null; unlaid?: string | null; missed?: string; at?: string }

export type AdmitInput = {
  row: V0Row | undefined
  lu: (LayoutUnit & { kind: string; pieces: number }) | null
  pieces: readonly (readonly unknown[])[] | null | undefined
  clsProven: readonly (string | null)[]
  kind: string | undefined
  group: string | null | undefined
  unhidden: string | null
  textGroup: boolean
  shown: boolean
  rects: readonly (readonly number[])[] | null | undefined
  N: number
  symbols: 'text' | 'strict'
  unlaid: string | null
}

/** v0's placeholder classes that draw ink of their own (TEX:18) */
const VISIBLE = new Set(['cite', 'num', 'other', 'macro', 'umacro', 'display', 'symbol'])
/** v0's classes of a text macro, one the file holds no row for sets no ink (TEX:21) */
const MACROS = new Set(['macro', 'umacro'])
/** locatedWhole's why as the skip's code (RUN:107 JUDGED) */
const JUDGED: Record<string, string> = { unlocated: 'unlocated', pieces: 'pieces', 'no row': 'noRow', lost: 'lost' }

/** whether a row is translated, whole or in part (RUN:844) */
export const translated = (u: V0Row | undefined): u is V0Row =>
  !!u?.pieces && (u.state === 'whole' || u.state === 'partial')

/** whether a row holds what v0 reads of a unit, of the types it reads them as (RUN:1173 shapely) */
function shapely(u: V0Row): boolean {
  return (
    typeof u.kind === 'string' &&
    typeof u.src === 'string' &&
    Array.isArray(u.pieces) &&
    u.pieces.every(
      (q) =>
        q !== null &&
        typeof q === 'object' &&
        (q.t === 'text'
          ? typeof q.s === 'string'
          : q.t === 'ph' || q.t === 'open'
            ? typeof q.src === 'string'
            : (q.t === 'close' || q.t === 'nested') && (q.src === undefined || typeof q.src === 'string')),
    )
  )
}

/** why a translated row is no unit of this paper's, or null (RUN:1181 refusalOf) */
export function refusalOf(i: Pick<AdmitInput, 'lu' | 'kind' | 'group'>, u: V0Row): string | null {
  if (!shapely(u)) return "row: not a unit's shape"
  const { lu, kind } = i
  if ((lu && u.kind !== lu.kind) || (kind !== undefined && u.kind !== kind)) return 'row: another kind'
  if (i.group !== undefined && (u.group ?? null) !== (i.group ?? null)) return 'row: another group'
  if (
    lu &&
    u.pieces.some((q) => q.t !== 'text' && q.k !== undefined && !(Number.isInteger(q.k) && q.k >= 0 && q.k < lu.pieces))
  )
    return "row: a k not its source's"
  return null
}

/** each of the row's pieces' source index, from the units file's pieces of the unit, which hold the row's one to one; null
 *  where they do not (TEX:35 kOfPieces) */
export function kOfPieces(
  pieces: readonly V0Piece[],
  trPieces: readonly (readonly unknown[])[] | null | undefined,
): number[] | null {
  if (!Array.isArray(trPieces) || trPieces.length !== pieces.length) return null
  const out: number[] = []
  for (const [i, p] of pieces.entries()) {
    const t = trPieces[i]
    if (!Array.isArray(t)) return null
    if (p.t === 'text') {
      if (t[0] !== 0) return null
      out.push(-1)
      continue
    }
    if ((p.t === 'open' && t[0] !== 2) || (p.t === 'close' && t[0] !== 3)) return null
    out.push(t[0] === 0 ? -1 : (t[1] as number))
  }
  return out
}

/** whether the file locates the unit whole as the row has it (TEX:66 locatedWhole) */
export function locatedWhole(
  lu: AdmitInput['lu'],
  pieces: readonly V0Piece[],
  trPieces: AdmitInput['pieces'],
  clsProven: readonly (string | null)[],
  symbols: 'text' | 'strict' = 'text',
): { ok: true; kOf: number[] } | { ok: false; why: 'unlocated' | 'pieces' | 'no row' | 'lost' } {
  if (!lu) return { ok: false, why: 'unlocated' }
  const kOf = kOfPieces(pieces, trPieces)
  if (!kOf) return { ok: false, why: 'pieces' }
  for (const [i, p] of pieces.entries()) {
    const cls = p.t === 'nested' ? 'num' : p.t === 'ph' ? clsProven[i] : null
    if (!cls || !VISIBLE.has(cls) || (cls === 'symbol' && symbols === 'text')) continue
    const row = lu.ph.get(kOf[i]!)
    if (!row) {
      if (MACROS.has(cls)) continue
      return { ok: false, why: 'no row' }
    }
    if (row.flags & (PH_FLAG.EMPTY | PH_FLAG.TEXT | PH_FLAG.JOINED | PH_FLAG.OUTSIDE)) continue
    if (row.flags & PH_FLAG.LOST || !row.segs.length) return { ok: false, why: 'lost' }
  }
  return { ok: true, kOf }
}

/** the pages the file's lines put the unit on, of those shown, and whether its lines go on past them (RUN:834 placeByFile,
 *  TEX:269 texRects); null where none is on the pages shown */
function placed(lu: NonNullable<AdmitInput['lu']>, N: number): { pages: number[]; cut: boolean } | null {
  const L = lu.lines,
    F = lu.frames,
    pages: number[] = []
  let all = 0,
    on = 0
  for (let f = 0; f < F.length; f += 6)
    for (let j = F[f + 2]!; j < F[f + 2]! + F[f + 3]!; j++) {
      all++
      const page = L[8 * j]!
      if (page > N) continue
      on++
      if (!pages.includes(page)) pages.push(page)
    }
  return on ? { pages, cut: on < all } : null
}

/** U.admit: the verdict on a unit once its row is in (RUN:1196 decide), or on a translated row neither the left nor the file
 *  holds (`at: 'account'`, RUN:3104) */
export function admit(i: AdmitInput, o: { account?: boolean } = {}): Admission {
  const u = i.row
  const no = (
    code: string | null,
    why: string | null,
    more: { unlaid?: string | null; missed?: string } = {},
  ): Admission => ({
    ok: false,
    code,
    why,
    ...more,
    ...(o.account ? { at: 'account' } : {}),
  })
  const unanchored = (code: string, missed?: string) =>
    no(code, 'unanchored', { ...(code === 'unlocated' ? { unlaid: i.unlaid } : {}), ...(missed ? { missed } : {}) })
  if (o.account) {
    const refusal = u ? refusalOf(i, u) : null
    return refusal ? no('refused', refusal) : unanchored('unlocated')
  }
  if (!translated(u)) return no(null, null)
  const refusal = refusalOf(i, u)
  if (refusal) return no('refused', refusal)
  if (!i.shown) return i.rects ? no('hidden', 'hidden') : unanchored('hidden')
  if (i.rects?.every((r) => r[0]! > i.N)) return no(null, null)
  const w = locatedWhole(i.lu, u.pieces, i.pieces, i.clsProven, i.symbols)
  if (!w.ok) return unanchored(JUDGED[w.why]!, `unanchored, ${w.why}`)
  const unhidden = i.unhidden ?? (i.textGroup ? null : 'no group')
  if (unhidden) return no('unhidden', `unhidden: ${unhidden}`)
  const p = placed(i.lu!, i.N)
  return p ? { ok: true, ...p } : unanchored('offPages')
}
