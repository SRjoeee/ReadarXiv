// Moved into the engine package from src/pdf-reader/engine/layer-proto/units.mjs: the part of that module the moved front half calls, as it is; the rest
// stays there and imports this part back through its transition path.

/** a unit's flags: the paper's title, the front matter, written back in the source's brackets, kept as it is (a name,
 *  live.mjs openPaper's `kept`) */
export const UNIT_FLAG_BITS = Object.freeze({ TITLE: 1, FRONT: 2, BRACKETED: 4, KEPT: 8 })
/** a piece's tag: a text, a placeholder, a group's open and close, a nested unit */
const TEXT = 0,
  PH = 1,
  OPEN = 2,
  CLOSE = 3,
  NESTED = 4
/** an open's fourth value, what its pair sets over what it holds where the front end read it from the command's definition
 *  (latex-front.mjs identityPair, the piece's `sets`): 0, nothing — the command sets its argument alone (revtex's `\bibinfo`).
 *  An open of three values says nothing of it */
export const SETS_NOTHING = 0
/** a string as the engine's text holds it: its UTF-8 bytes read latin1 (mt.mjs plainSource decodes it), as a source unit's
 *  text piece is */
const engineText = (s: string) => (/^[\t\n\r -~]*$/.test(s) ? s : String.fromCharCode(...new TextEncoder().encode(s)))
/** the display edges a unit may have (mt.mjs displayEdges), in their order */
export const EDGES = Object.freeze(['lead', 'trail', 'inner'] as const)
/** a structural name's unit (bundleUnitsOf): no page's ink, a word of the target's for the layer */
export const NAME_KIND = 'name'
/** a table cell as a unit states it and the bundle copies it: its table, row and column, its span, whether it is a head */
export interface BundleCell {
  table: number
  row: number
  col: number
  span: number
  head: boolean
}
/** a unit as bundleUnitsOf reads it (openPaper's, latex-front.mjs's): its kind, its flags, depth, cell and display edges where
 *  the front end set them, its pieces */
export interface UnitIn {
  kind: string
  title?: boolean
  front?: boolean
  bracketed?: boolean
  depth?: number
  lead?: string
  trail?: string
  inner?: string
  cell?: BundleCell
  pieces: readonly unknown[]
}
/** a piece as the bundle holds it, its positions dropped: a text (with the source as written where it differs, an accent's
 *  letter), a placeholder, a group's open and close paired by `id` (an open whose pair sets nothing with SETS_NOTHING after
 *  its source), a nested unit by its id */
export type BundlePiece =
  | [0, s: string]
  | [0, s: string, src: string]
  | [1, src: string]
  | [2, id: number, src: string]
  | [2, id: number, src: string, sets: 0]
  | [3, id: number, src: string]
  | [4, pre: string, unit: number, post: string]
/** a unit as the bundle holds it: its kind, flags, depth, table cell, display edges and pieces; its id is its index */
export type BundleUnit = [
  kind: string,
  flags: number,
  depth: number | null,
  cell: BundleCell | null,
  edges: { lead?: string; trail?: string; inner?: string } | null,
  pieces: BundlePiece[],
]
/** a piece as the front end makes it (latex-front.mjs), the fields pieceOf reads: a text, a placeholder, a group's open and
 *  close, a nested unit */
export type FrontPiece =
  | { t: 'text'; s: string; src?: string }
  | { t: 'ph'; src: string }
  | { t: 'open'; id: number; src: string; sets?: number }
  | { t: 'close'; id: number; src: string }
  | { t: 'nested'; pre: string; unit: UnitIn; post: string }

// ---------------------------------------------------------------- the writer's
/** a piece as openPaper reads it, its positions dropped: a nested piece names its inner unit by id */
function pieceOf(p: FrontPiece, idOf: ReadonlyMap<UnitIn, number>): BundlePiece {
  switch (p.t) {
    case 'text':
      return p.src === undefined ? [TEXT, p.s] : [TEXT, p.s, p.src]
    case 'ph':
      return [PH, p.src]
    case 'open':
      return p.sets === SETS_NOTHING ? [OPEN, p.id, p.src, SETS_NOTHING] : [OPEN, p.id, p.src]
    case 'close':
      return [CLOSE, p.id, p.src]
    case 'nested': {
      const id = idOf.get(p.unit)
      if (id === undefined) throw new Error("a nested piece whose unit is not one of the paper's")
      return [NESTED, p.pre, id, p.post]
    }
    default:
      throw new Error(`a piece the front end does not make (${String((p as { t: unknown }).t).slice(0, 20)})`)
  }
}

/**
 * The bundle's units from openPaper's paper: each unit [kind, flags, depth or null, its table cell or null, its display
 * edges or null, its pieces], by its index. Its flags TITLE, FRONT and BRACKETED as the front end set them, KEPT where
 * `kept` (a caller's set of the paper's units) holds it: none in the rebuilt engine, which keeps no unit by its words (the
 * old reader's openPaper passes its name rule's, src/pdf-reader/engine/layer-proto/units.mjs); its edges displayEdges'
 * (mt.mjs), restated here so that the reader's parse
 * loads no front end (a test holds the two equal). Language-independent and deterministic: every object written in one
 * order. Throws on a piece the front end does not make.
 * After the source's units, the paper's structural names (openPaper's `names`: source/paper-names.mjs), each a unit of kind
 * `name` of one text piece, its name: translated with the paper's units and cached by its text as any unit, never laid (it is
 * no page's ink), read by the layer as the target's word for that name (PDF-READER §19.14). The source's units keep their ids
 */
export function bundleUnitsOf(
  paper: { units: readonly UnitIn[]; names?: readonly string[] },
  kept: ReadonlySet<UnitIn> | null = null,
): BundleUnit[] {
  const idOf = new Map<UnitIn, number>()
  // biome-ignore lint/suspicious/useIterableCallbackReturn: a concise arrow, Map.set's value, which no one reads
  paper.units.forEach((u, i) => idOf.set(u, i))
  // (each name as the engine's text, as a source unit's text piece holds it: a UTF-8 file's accented name as its bytes)
  const names = (paper.names ?? []).map((s): BundleUnit => [NAME_KIND, 0, null, null, null, [[TEXT, engineText(s)]]])
  return [
    ...paper.units.map((u): BundleUnit => {
      const flags =
        (u.title ? UNIT_FLAG_BITS.TITLE : 0) |
        (u.front ? UNIT_FLAG_BITS.FRONT : 0) |
        (u.bracketed ? UNIT_FLAG_BITS.BRACKETED : 0) |
        (kept?.has(u) ? UNIT_FLAG_BITS.KEPT : 0)
      const c = u.cell
      const edges: { lead?: string; trail?: string; inner?: string } = {}
      for (const k of EDGES) if (typeof u[k] === 'string') edges[k] = u[k]
      return [
        u.kind,
        flags,
        u.depth ?? null,
        c ? { table: c.table, row: c.row, col: c.col, span: c.span, head: c.head } : null,
        Object.keys(edges).length ? edges : null,
        u.pieces.map((p) => pieceOf(p as FrontPiece, idOf)),
      ]
    }),
    ...names,
  ]
}
export { TEXT, PH, OPEN, CLOSE, NESTED, pieceOf }
