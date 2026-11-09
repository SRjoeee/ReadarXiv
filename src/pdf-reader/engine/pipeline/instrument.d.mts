// instrument.mjs's types, for the tests
import type { Instrument, Owners, PieceClass, SpanClass } from '@readarxiv/engine'

/** a string as today's engine holds it (UTF-8 bytes read latin1) as Unicode */
export declare function unicodeOf(s: unknown): string
/** today's flat pieces as nested ones, its run-in labels `must` */
export declare function contentOf(pieces: unknown[], o?: { kindOf?: (p: unknown) => string; idOfNested?: (u: unknown) => string | null }): unknown[]
/** today's flat pieces as nested ones, its elements' wire facts; no run-in label read yet (marksOf) */
export declare function piecesOf(pieces: unknown[], o?: { kindOf?: (p: unknown) => string; idOfNested?: (u: unknown) => string | null }): unknown[]
/** each source unit's text glyphs on B (the owners' ROLE.text of it), in B's stream order, by unit index */
export declare function textGlyphsOf<G>(doc: { pages: readonly { glyphs: readonly G[] }[] }, owners: readonly (Owners | undefined)[]): Map<number, G[]>
/** what TeX set for a source unit's groups that their source does not say (marks/faces.ts over its text glyphs on B): a face
 *  where the group's command names none, the stop TeX set at its end; then its run-in labels `must`. In place; `spans` with the
 *  faces stated */
export declare function marksOf(
  content: unknown[],
  glyphs: readonly { u: string; base: string; size: number; fill: number }[],
  spans?: readonly [string, SpanClass][],
  textOf?: (el: { t: 'el'; id: string; src: string }) => string | undefined,
): [string, SpanClass][]
/** each element's class as today's reader reads its source, by piece id; and what the rest of the rules read of its source
 *  (`colours`: the unit's colour pieces' fills by index; `texts`: the marking probe's text macros' texts) */
export declare function classesOf(
  pieces: readonly { t: string; src?: string; [more: string]: unknown }[],
  colours?: ReadonlyMap<number, number> | null,
  texts?: ReadonlyMap<string, string> | null,
): [string, PieceClass][]
/** each group's facts by its open piece's id: its command, its run's fill, a link group's target */
export declare function spansOf(
  pieces: readonly { t: string; src?: string; [more: string]: unknown }[],
  colours?: ReadonlyMap<number, number> | null,
): [string, SpanClass][]
/** explicit glue as TeX sets it (layer2.mjs glueOf) */
export declare function glueOf(src: string): { em?: number; bp?: number; brk: boolean } | null
/** a forced break's source (tex.mjs FORCED_BREAK) */
export declare const FORCED_BREAK: RegExp
/** a citation's note, where it holds a letter */
export declare function noteOf(src: string): string | null
/** the command a source begins with, and whether the source is that command alone */
export declare function commandOf(src: string): { cmd: string; bare?: true } | null
/** each element's places in B's stream from the marked compile's points (Instrument `places`): a placeholder's two, a head
 *  macro's opening and its unit's start, a trailing macro's unit end and its point after its group */
export declare function placesOf(
  pages: readonly { points: readonly { name: string; glyph: number; box?: number }[] }[],
  count: number,
): NonNullable<Instrument['places']>
/** the pieces TeX sets no ink for where they stand, as Instrument `empty` pieces: a paper's macro the probe said sets none
 *  (`inkless`), and a text macro the marking never marks (marks.mjs classOf null: its rendering is never ink) */
export declare function inklessPieces(
  units: readonly ({ pieces?: readonly { t: string; src?: string; [more: string]: unknown }[] } | null | undefined)[],
  o: { classes: readonly (ReadonlyMap<string, PieceClass> | null | undefined)[]; inkless?: readonly string[] | null },
): NonNullable<Instrument['empty']>
/** the pieces TeX's points prove set nothing of their own, as Instrument `empty` pieces: a piece with no point of its own whose
 *  nearest two around it in its unit's source order (a piece's, the unit's start and end, else the stream's) hold no glyph or
 *  painted box between them in B's stream (but the ink of the piece whose opening point is the lower), and no text of the unit's between them in its source
 *  (`owners` the instrument's glyphs' and boxes' by page) */
export declare function boundedEmpty(
  pages: readonly {
    glyphs: readonly { u?: string; blank?: boolean }[]
    boxes?: readonly number[]
    points?: readonly { name: string; glyph: number; box?: number }[]
  }[],
  units: readonly ({ pieces?: readonly { t: string; s?: string; src?: string; [more: string]: unknown }[] } | null | undefined)[],
  owners: { glyphs: readonly Owners[]; boxes: readonly Owners[] },
): NonNullable<Instrument['empty']>
/** the pieces TeX set before their unit's start point, where the ownership gives the unit's text nothing before it, as
 *  Instrument `outside` pieces */
export declare function outsidePieces(
  pages: readonly { points?: readonly { name: string; glyph: number; box?: number }[] }[],
  units: readonly ({ pieces?: readonly { t: string; s?: string; src?: string; [more: string]: unknown }[] } | null | undefined)[],
  owners: { glyphs: readonly Owners[] },
): NonNullable<Instrument['outside']>
/** the ink TeX set for a unit's tail pieces past its end point that no point of theirs bounds (`ink`: each claim's unit, piece id, page
 *  index from 0, glyphs and role), and the text macros there of a probe's text whose ink is not found (`unfound`) */
export declare function tailInkOf(
  pages: readonly {
    glyphs: readonly { u?: string; blank?: boolean }[]
    boxes?: readonly number[]
    points?: readonly { name: string; glyph: number; box?: number }[]
  }[],
  units: readonly ({ pieces?: readonly { t: string; s?: string; src?: string; [more: string]: unknown }[] } | null | undefined)[],
  o?: {
    glyphs?: readonly Owners[]
    classes?: readonly (ReadonlyMap<string, PieceClass> | null | undefined)[]
    inkless?: readonly string[] | null
  },
): {
  ink: { unit: number; piece: string; page: number; glyphs: number[]; role: number }[]
  unfound: { unit: number; piece: string }[]
}
/** the ink of a macro of its opening point alone and of the one unmarked piece after it, where the ownership's reading stops: each
 *  claim's unit, piece id, page index from 0, glyphs and role */
export declare function splitInkOf(
  pages: readonly {
    glyphs: readonly { u?: string; blank?: boolean }[]
    boxes?: readonly number[]
    points?: readonly { name: string; glyph: number; box?: number }[]
  }[],
  units: readonly ({ pieces?: readonly { t: string; s?: string; src?: string; [more: string]: unknown }[] } | null | undefined)[],
  o?: { glyphs?: readonly Owners[]; classes?: readonly (ReadonlyMap<string, PieceClass> | null | undefined)[] },
): { unit: number; piece: string; page: number; glyphs: number[]; role: number }[]
/** the piece of each of a page's glyphs whose group (`row`, the ownership's by glyph) is a unit's `.p` (-1 none known); `open`
 *  the placeholder points open at the page's start by unit, carried by the caller from page to page in order (it is updated) */
export declare function glyphPiecesOf(
  pg: { points: readonly { name: string; glyph: number; box?: number }[]; glyphs: readonly { u?: string }[] },
  row: readonly (string | null | undefined)[],
  o?: {
    units?: readonly unknown[]
    texts?: ReadonlyMap<string, string> | null
    names?: ReadonlySet<string>
    open?: Map<number, number[]>
  },
): Int32Array
/** the texts the marking's probe showed the paper's macros set, by source (null where none is given) */
export declare function textsOf(texts: unknown): ReadonlyMap<string, string> | null
/** each unit's facts from the front end's beside it, by index: a caption's float type, a unit kept as it is (its names, an
 *  algorithm float's body) */
export declare function unitFactsOf(paper: import('./live.mjs').Paper): { float: Map<number, string>; kept: Set<number> }
/** the Instrument of today's marked compile */
export declare function instrumentOf(o: Record<string, unknown>): Promise<{ instrument: Instrument; today: unknown }>
