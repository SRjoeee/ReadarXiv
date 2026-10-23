// wrap.mjs's types: our final pass's pages wrapped by optional content, in one incremental section
import type { Unhidden, WrapStats } from './delta-wire.mjs'
import type { OwnStats, OwnUnit } from './own.mjs'
import type { PdfLib } from './remove.mjs'
export { alignOf } from './remove.mjs'
export { UNHIDDEN_MAX } from './delta-wire.mjs'
export declare const GROUPS_PAGE: number
export declare const SEQUENCES_PAGE: number
export declare const GROUPS_DOC: number
export declare const WRAP_WHYS: readonly ['wrap-parse', 'wrap-proof', 'wrap-bound']
export type WrapWhy = (typeof WRAP_WHYS)[number]
/** an optional-content group's name (`axt:<group>`) and its resource name (`axt<group>`), of a group's name */
export declare function ocgName(group: string): string
export declare function propName(group: string): string
export interface WrapPlan { facts: { codes: (number | null)[][]; paths: number }; shows: Map<number, (string | null | undefined)[]>; paths: Map<number, string> }
export declare function planOf(glyphs: { n: number; k: number }[], groupOfGlyph: (string | null)[], paths: ArrayLike<number>, groupOfBox: (string | null)[]): Omit<WrapPlan, 'facts'>
export type WrapRefusal = { refused: WrapWhy; why: string }
export declare function wrapOf(finalBytes: Uint8Array, plans: Map<number, WrapPlan>, o: { units?: Map<number, OwnUnit>; PL: PdfLib; deflate: (b: Uint8Array) => Uint8Array; inflate?: ((b: Uint8Array, limit: number) => Uint8Array) | null; groupsPage?: number; sequencesPage?: number; groupsDoc?: number }): Promise<{ bytes: Uint8Array; xref: number; sha256: string; pages: Map<number, { ok: boolean; why?: string; groups?: number; sequences?: number; split?: number; merged?: boolean }>; groups: Map<string, number>; stats: Omit<WrapStats, 'unhidden' | 'labelKept'>; unwrapped?: true } | WrapRefusal>
export interface Wrapped { bytes: Uint8Array; xref: number; sha256: string; stats: WrapStats; unhidden: [unit: number, why: Unhidden][]; labelKept: number[]; own: OwnStats }
export declare function wrapFinal(finalBytes: Uint8Array, o: { PL: PdfLib; getDocument: (o: object) => { promise: Promise<unknown>; destroy(): Promise<void> }; documentOptions?: object; OPS: Record<string, number>; units?: SourceUnit[] | null; follows?: ((name: string) => unknown) | null; deflate: (b: Uint8Array) => Uint8Array; inflate?: ((b: Uint8Array, limit: number) => Uint8Array) | null; keepOwned?: boolean; bounds?: { groupsPage?: number; sequencesPage?: number; groupsDoc?: number } }): Promise<Wrapped | WrapRefusal>
/** a unit as wrapFinal takes it: the paper's source unit (pipeline/live.mjs openPaper's), its text pieces untranslated */
export interface SourceUnit { kind?: string; src?: string; pieces: ({ t: 'text'; s: string | Uint8Array; tr?: undefined } | { t: string; src?: string; tr?: undefined })[] }
