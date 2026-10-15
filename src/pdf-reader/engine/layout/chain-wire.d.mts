// chain-wire.mjs's types: the remover exchange's payloads, for the prepare child, the remover child, the service and their tests
import type { AlignFacts } from './remove.mjs'

/** an ask's bytes and values at most */
export declare const ASK_CAP: number
export declare const ASK_VALUES: number
/** an answer's entries' bytes and values at most */
export declare const ENTRIES_CAP: number
export declare const ENTRIES_VALUES: number
/** an answer frame at most (a tail of TAIL_CAP, its entries, 4 KiB for the rest): the service's bound on the remover's answer */
export declare const ANSWER_CAP: number
/** the remover's failures as the service tells them; any other word is taken as 'crashed' */
export declare const REMOVER_WHYS: readonly ['refused', 'memory', 'clock', 'crashed', 'deadline']
export type RemoverWhy = (typeof REMOVER_WHYS)[number]
/** the remover's counts in an answer's entries */
export declare const REMOVER_STATS: readonly ['removed', 'rules', 'cut', 'hidden', 'refused', 'forms', 'streams']
/** the state the tails so far leave, as an ask carries it */
export interface AskChain { end: number; xref: number; next: number | null; kids: readonly number[]; empty: number | null }
/** a page's plan as an ask carries it (layout/addon.mjs PageRemoval with its page) */
export interface AskPlan { p: number; shows: number | null | undefined; units: [number, number[], number[]][]; names: [number, number[]][]; crops: [number[], number[]][]; align: AlignFacts }
/** the ask read */
export interface Ask { v: 1; pdfjs: string; from: number; to: number; pages: number; chain: AskChain; plans: (AskPlan & { shows: number | null })[] }
/** the ask's bytes; null past ASK_CAP or ASK_VALUES */
export declare function encodeAsk(o: { from: number; to: number; pages: number; pdfjs: string; chain: AskChain; plans: readonly AskPlan[] }): Uint8Array | null
/** an ask read within bounds, refused before JSON.parse past its caps; throws LayoutRefusal */
export declare function readAsk(bytes: Uint8Array): Ask
/** a manifest entry as the remover answers it */
export type AnsweredEntry = { ok: true; units: Record<number, number[]>; at: { R: number } } | { ok: false; refused: string }
/** the answer's entries' bytes, or `over`'s; null past ENTRIES_CAP or ENTRIES_VALUES */
export declare function encodeEntries(o: { over: true } | { page: Record<number, unknown>; stats: Record<string, number>; kids: readonly number[]; empty: number | null }): Uint8Array | null
/** an answer's entries read within bounds; throws LayoutRefusal */
export declare function readEntries(bytes: Uint8Array): { over: true } | { over: false; page: Record<number, AnsweredEntry>; stats: Record<(typeof REMOVER_STATS)[number], number>; kids: number[]; empty: number | null }
