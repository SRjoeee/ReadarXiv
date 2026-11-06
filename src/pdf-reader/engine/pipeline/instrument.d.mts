// instrument.mjs's types (transition code until stage 1c), for the tests
import type { Instrument, PieceClass } from '@readarxiv/engine'

/** a string as today's engine holds it (UTF-8 bytes read latin1) as Unicode */
export declare function unicodeOf(s: unknown): string
/** today's flat pieces as nested ones */
export declare function contentOf(pieces: unknown[], o?: { kindOf?: (p: unknown) => string; idOfNested?: (u: unknown) => string | null }): unknown[]
/** each element's class as today's reader reads its source, by piece id */
export declare function classesOf(pieces: readonly { t: string; src?: string; [more: string]: unknown }[]): [string, PieceClass][]
/** the Instrument of today's marked compile */
export declare function instrumentOf(o: Record<string, unknown>): Promise<{ instrument: Instrument; today: unknown }>
