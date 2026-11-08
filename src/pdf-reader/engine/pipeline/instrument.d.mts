// instrument.mjs's types (transition code until stage 1c), for the tests
import type { Instrument, PieceClass, SpanClass } from '@readarxiv/engine'

/** a string as today's engine holds it (UTF-8 bytes read latin1) as Unicode */
export declare function unicodeOf(s: unknown): string
/** today's flat pieces as nested ones */
export declare function contentOf(pieces: unknown[], o?: { kindOf?: (p: unknown) => string; idOfNested?: (u: unknown) => string | null }): unknown[]
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
/** the paper's macros at a unit's head and after its last text that set nothing on the unit's lines (today's maker's
 *  besideMarks): no glyph of no unit's beside the unit's mark on its line, in its column; as Instrument `empty` pieces */
export declare function besideEmpty(
  pages: readonly {
    glyphs: readonly { u?: string; x0: number; x1: number; y: number; size: number; blank?: boolean }[]
    points?: readonly { name: string; glyph: number; box?: number }[]
    view?: readonly number[]
  }[],
  rows: readonly (readonly (string | null | undefined)[])[],
  units: readonly ({ pieces?: readonly { t: string; s?: string; src?: string; [more: string]: unknown }[] } | null | undefined)[],
  o: { classes: readonly (ReadonlyMap<string, PieceClass> | null | undefined)[]; known?: ReadonlySet<string> },
): NonNullable<Instrument['empty']>
/** the piece of each of a page's glyphs whose group (`row`, the ownership's by glyph) is a unit's `.p` (-1 none known) */
export declare function glyphPiecesOf(
  pg: { points: readonly { name: string; glyph: number; box?: number }[]; glyphs: readonly { u?: string }[] },
  row: readonly (string | null | undefined)[],
  o?: { units?: readonly unknown[]; texts?: ReadonlyMap<string, string> | null; names?: ReadonlySet<string> },
): Int32Array
/** the texts the marking's probe showed the paper's macros set, by source (null where none is given) */
export declare function textsOf(texts: unknown): ReadonlyMap<string, string> | null
/** the Instrument of today's marked compile */
export declare function instrumentOf(o: Record<string, unknown>): Promise<{ instrument: Instrument; today: unknown }>
