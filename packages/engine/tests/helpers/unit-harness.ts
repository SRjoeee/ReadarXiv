// The kept tests' harness from today's engine, moved as it is (src/pdf-reader/engine/translate/mt.mjs plainSource and
// unitText; pipeline/cache.mjs sourceHash and seedFrom), typed: a unit's plain text in the source and as the PDF shows it,
// the hash a stored translation is matched by, and the seed a record of today's reader gives a paper's units. The front
// half's tests read a unit's text and identity through these; the cut-over deletes their old places with today's engine.
import { plain, plainTranslated, type ShownPiece, shown, utf8 } from '../../src/instrument/mt.ts'

/** a unit's piece as the harness reads it: a text piece, a placeholder, a pair's open or close (`id`, its number in its file),
 *  or a nested unit (its braces `pre` and `post`, the unit set in its place) */
export type HarnessPiece = ShownPiece & { id?: number; pre?: string; post?: string; unit?: { pieces?: HarnessPiece[] } }
/** a unit as the harness reads it: its pieces */
export interface HarnessUnit {
  pieces: readonly HarnessPiece[]
}

/** a unit's plain text in the source (placeholders dropped: anchors are found from text alone) */
export const plainSource = (u: HarnessUnit): string => plain(u.pieces, (p) => utf8(p.s))

const SLOT = '￼'
/**
 * A unit's plain text as the PDF shows it (plainTranslated's, which is plainSource's for pieces not translated) and
 * `gaps`, the offsets in it where a placeholder stood: there the page has words the text does not — a formula's, a
 * citation's number. Without placeholders, no `gaps`
 */
export function unitText(pieces: readonly HarnessPiece[]): { text: string; gaps?: number[] } {
  const text = plainTranslated(pieces)
  if (!pieces.some((p) => p.t === 'ph' || p.t === 'nested')) return { text }
  const slotted = pieces
    .map((p) => (p.t === 'text' ? shown(p) : p.t === 'ph' || p.t === 'nested' ? ` ${SLOT} ` : ' '))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  let bare = ''
  const gaps: number[] = []
  for (const c of slotted) {
    if (c === SLOT) {
      if (gaps.at(-1) !== bare.length) gaps.push(bare.length)
    } else if (c !== ' ' || (bare && !bare.endsWith(' '))) bare += c
  }
  // the text is plainTranslated's, character for character, or the offsets would name other places: a text holding
  // the slot character itself gives none
  if (bare.trimEnd() !== text) return { text }
  return { text, gaps: gaps.map((g) => Math.min(g, text.length)).filter((g, i, a) => a.indexOf(g) === i) }
}

const hex = (buf: ArrayBuffer): string =>
  Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
const sha256 = async (s: string): Promise<string> =>
  hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))
/** SHA-256 hex of a unit's source pieces: what a seed is matched by, whatever the unit's index */
export const sourceHash = async (u: { pieces: unknown }): Promise<string> => sha256(JSON.stringify(u.pieces))

/** a unit of a record of today's reader: its source's hash and plain text, the translation's pieces and how it stood */
export interface RecordUnit {
  hash: string
  src?: string
  pieces?: HarnessPiece[]
  state?: string
  translation?: string
  by?: unknown
  tried?: unknown
  sentences?: unknown
  inSource?: boolean
}
/** what a record gives a unit: its translation's pieces, numbered as the unit is, and how it stood */
export interface Seeded {
  pieces: readonly HarnessPiece[]
  by: unknown
  tried: unknown
  state: string | undefined
  translation?: string
  sentences?: unknown
  inSource?: true
}

/** the state of a unit's translation, whatever is shown of it (a kept cell keeps what the translator gave it) */
const translationOf = (u: RecordUnit | undefined) => (u?.state === 'kept' ? u.translation : u?.state)
const keptAs = (u: RecordUnit) => (u?.state === 'kept' && u.translation ? { translation: u.translation } : {})
const rankOf = (u: RecordUnit) => {
  const t = translationOf(u)
  return t === 'whole' && u.pieces ? 2 : t === 'partial' ? 1 : 0
}
const inSourceOf = (u: RecordUnit | undefined) => (u?.inSource ? { inSource: true as const } : {})
/** the ids of the pairs in pieces, a nested unit's too, in the order of their numbers; a close counts as its open does */
const pairIds = (pieces: readonly HarnessPiece[], out = new Set<number>()): number[] => {
  for (const p of pieces) {
    if (p.t === 'open' || p.t === 'close') out.add(p.id!)
    else if (p.t === 'nested' && p.unit?.pieces) pairIds(p.unit.pieces, out)
  }
  return [...out].sort((a, b) => a - b)
}
/** the pieces with each pair's id mapped (`to`), a nested unit's too */
const renumber = (pieces: readonly HarnessPiece[], to: Map<number, number>): HarnessPiece[] =>
  pieces.map((p) =>
    (p.t === 'open' || p.t === 'close') && to.has(p.id!)
      ? { ...p, id: to.get(p.id!) }
      : p.t === 'nested' && p.unit?.pieces
        ? { ...p, unit: { ...p.unit, pieces: renumber(p.unit.pieces, to) } }
        : p,
  )
/** the record's translation of a unit whose source is that record unit's but for its pairs' numbers, numbered as the unit
 *  is: the best of the record's units with its text, or null */
async function renumbered(
  unit: HarnessUnit,
  candidates: readonly RecordUnit[],
): Promise<{ unit: RecordUnit; pieces: HarnessPiece[] } | null> {
  const mine = pairIds(unit.pieces)
  if (!mine.length) return null
  for (const c of [...candidates].sort((a, b) => rankOf(b) - rankOf(a))) {
    const theirs = pairIds(c.pieces!)
    if (theirs.length !== mine.length) continue
    const old = renumber(unit.pieces, new Map(mine.map((id, k) => [id, theirs[k]!])))
    if ((await sha256(JSON.stringify(old))) !== c.hash) continue
    return { unit: c, pieces: renumber(c.pieces!, new Map(theirs.map((id, k) => [id, mine[k]!]))) }
  }
  return null
}
/** a record's pieces with each nested piece the unit's own again, matched by its braces and its unit's source */
const ownNested = (unit: HarnessUnit, pieces: readonly HarnessPiece[]): readonly HarnessPiece[] => {
  if (!pieces.some((p) => p.t === 'nested')) return pieces
  const own = unit.pieces.filter((p) => p.t === 'nested'),
    used = new Set<number>()
  const same = (a: HarnessPiece, b: HarnessPiece) =>
    a.pre === b.pre && a.post === b.post && JSON.stringify(a.unit?.pieces) === JSON.stringify(b.unit?.pieces)
  return pieces.map((p) => {
    if (p.t !== 'nested') return p
    const k = own.findIndex((q, j) => !used.has(j) && same(q, p))
    if (k < 0) return p
    used.add(k)
    return own[k]!
  })
}

/**
 * The seed for a paper's units from a record of today's reader: index → the record's translation of each unit whose source
 * it has, matched by hash, whole before partial; a unit whose source is the record's but for the numbers of its pairs has
 * the record's translation too, numbered as the unit is. The hashes are kept for the record
 */
export async function seedFrom(
  record: { units: readonly unknown[] },
  paperUnits: readonly { pieces: readonly unknown[] }[],
): Promise<{ seed: Map<number, Seeded>; hashes: string[] }> {
  // (a record is whatever today's reader stored, and a paper's units are any reader's: read as the shapes above, as today's
  // declared them, `unknown[]`)
  const recorded = record.units as readonly RecordUnit[],
    units = paperUnits as readonly HarnessUnit[]
  const byHash = new Map<string, RecordUnit>(),
    bySrc = new Map<string, RecordUnit[]>()
  for (const u of recorded)
    if (u.pieces && rankOf(u) >= rankOf(byHash.get(u.hash) ?? { hash: '', state: '' })) byHash.set(u.hash, u)
  for (const u of recorded)
    if (u.pieces && typeof u.src === 'string') (bySrc.get(u.src) ?? bySrc.set(u.src, []).get(u.src)!).push(u)
  const hashes = await Promise.all(units.map(sourceHash))
  const seed = new Map<number, Seeded>()
  const seedOf = (i: number, u: RecordUnit, pieces: readonly HarnessPiece[]) =>
    seed.set(i, {
      pieces: ownNested(units[i]!, pieces),
      by: u.by,
      tried: u.tried,
      state: u.state,
      ...keptAs(u),
      ...(u.sentences ? { sentences: u.sentences } : {}),
      ...inSourceOf(u),
    })
  for (const [i, h] of hashes.entries()) {
    const u = byHash.get(h)
    if (u) {
      seedOf(i, u, u.pieces!)
      continue
    }
    const found = await renumbered(units[i]!, bySrc.get(plainSource(units[i]!)) ?? [])
    if (found) seedOf(i, found.unit, found.pieces)
  }
  return { seed, hashes }
}
