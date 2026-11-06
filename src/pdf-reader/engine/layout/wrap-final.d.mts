// wrap-final.mjs's types: our final pass read, owned and wrapped (wrapFinal, today's; wrapOf and planOf are the engine
// package's, @readarxiv/engine)
import type { PdfLib, Unhidden, WrapRefusal, WrapStats } from '@readarxiv/engine'
import type { FigureUnit, FigureWhy } from './figure-text.mjs'
import type { InkOfWrap } from './ink-units.mjs'
import type { Ledger, LedgerSummary } from './ledger.mjs'
import type { OwnStats } from './own.mjs'
/** the figure units the wrap drew (layout/figure-text.mjs): those whose group the document holds, and the counts */
export interface WrappedFigures { units: Omit<FigureUnit, 'k' | 'why'>[]; stats: { units: number; drawn: number; letters: number; forms: number; sets: number; grouped: number; aligned: number } & Record<FigureWhy, number> }
export interface Wrapped { bytes: Uint8Array; xref: number; sha256: string; stats: WrapStats; unhidden: [unit: number, why: Unhidden][]; labelKept: number[]; pages: [from: number, to: number][]; own: OwnStats; ledger: LedgerSummary; ink: InkOfWrap; figures: WrappedFigures; owned?: unknown; ledgerWhole?: Ledger; figureUnits?: FigureUnit[] }
export declare function wrapFinal(finalBytes: Uint8Array, o: { PL: PdfLib; getDocument: (o: object) => { promise: Promise<unknown>; destroy(): Promise<void> }; documentOptions?: object; OPS: Record<string, number>; units: SourceUnit[] | null; follows?: ((name: string) => unknown) | null; texts: readonly string[] | ReadonlyMap<string, string> | null; inkless: readonly string[] | ReadonlySet<string> | null; /** the paper's theorem-like environments' printed names (openPaper's theoremNames), or null where the source is not read */ names: readonly string[] | null; deflate: (b: Uint8Array) => Uint8Array; inflate: (b: Uint8Array, limit: number) => Uint8Array; keepOwned?: boolean; bounds?: { groupsPage?: number; sequencesPage?: number; groupsDoc?: number }; figures?: boolean; inkFrom?: number | null }): Promise<Wrapped | WrapRefusal>
/** a unit as wrapFinal takes it: the paper's source unit (pipeline/live.mjs openPaper's), its text pieces untranslated */
export interface SourceUnit { kind?: string; src?: string; pieces: ({ t: 'text'; s: string | Uint8Array; tr?: undefined } | { t: string; src?: string; tr?: undefined })[] }
