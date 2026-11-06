// instrument.mjs's types (transition code until stage 1c), for the tests
import type { Instrument, PieceClass } from '@readarxiv/engine'

/** a string as today's engine holds it (UTF-8 bytes read latin1) as Unicode */
export declare function unicodeOf(s: unknown): string
/** today's flat pieces as nested ones */
export declare function contentOf(pieces: unknown[], o?: { kindOf?: (p: unknown) => string; idOfNested?: (u: unknown) => string | null }): unknown[]
/** each element's class as today's reader reads its source, by piece id (`colours` the unit's colour pieces' fills by index) */
export declare function classesOf(
  pieces: readonly unknown[],
  colours?: Map<number, number> | null,
): [string, PieceClass & Record<string, unknown>][]
/** each group's facts by its open piece's id: its command, the fill TeX set its run in */
export declare function spansOf(pieces: readonly unknown[], colours?: Map<number, number> | null): [string, { cmd?: string; colour?: number }][]
/** explicit glue as TeX sets it: { em } or { bp }, and whether a line may break at it */
export declare function glueOf(src: string): { em?: number; bp?: number; brk: boolean } | null
/** a forced break's source */
export declare const FORCED_BREAK: RegExp
/** a citation's note, where it holds a letter */
export declare function noteOf(src: string): string | null
/** the command a source begins with, and whether the source is that command alone */
export declare function commandOf(src: string): { cmd: string; bare?: true } | null
/** the Instrument of today's marked compile */
export declare function instrumentOf(o: Record<string, unknown>): Promise<{ instrument: Instrument; today: unknown }>
