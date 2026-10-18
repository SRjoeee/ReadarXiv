// remove.mjs's types: the text-removed PDF, for the container's prepare, the gate and their tests
import type { RemovalManifest } from './addon-manifest.mjs'
import type { Glyph } from './ink.mjs'

/** the remover's version: it enters the add-on's key (addon-manifest.mjs's, re-exported), and the manifest's type */
export { REMOVAL } from './addon-manifest.mjs'
export type { RemovalManifest } from './addon-manifest.mjs'
/** the page sets an add-on holds after arXiv's own N pages: R at N + p */
export declare const SETS: readonly ['R']
/** the check's sets after them: P (the placeholders alone), F (the removed glyphs alone), C (P, each crop a colour) */
export declare const CHECK_SETS: readonly ['P', 'F', 'C']
/** a content stream's operators (those of `keep`, null: every one), holding at most `limit` bytes by COST (past it LexLimit), with what they hold */
export declare function lex(bytes: Uint8Array, limit?: number, keep?: ReadonlySet<string> | null): { op: string; args: unknown[]; s: number; e: number }[] & { bytes: number }
/** lex's refusal of a stream holding more than it was allowed */
export declare class LexLimit extends Error { limit: number }
/** decode's refusal of a stream decoding to more than it was allowed */
export declare class DecodeLimit extends Error { limit: number }
/** the heap a lexed token, and a recorded event, is held in, by its kind */
export declare const COST: Readonly<Record<'op' | 'num' | 'name' | 'str' | 'mark' | 'kw' | 'atom' | 'event' | 'code', number>>
/** what a page's walk may hold: its streams' operators and its events by COST, each stream lexed once, and their decoded bytes */
export declare const HELD_MAX: number
export declare const BYTES_MAX: number
/** the PDF object layer's exports the remover reads (@cantoo/pdf-lib) */
export type PdfLib = Record<string, any>
/** the operators a page's walk may visit, its forms' as often as they are painted; past it the page is refused */
export declare const WALK_MAX: number
/** PDF.js's operator list of a page, as the remover reads it */
export interface OpList { fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> }
/** what alignPage reads of a page's operator list (alignOf): each text-showing operation's glyph codes outside an annotation
 *  (null: a glyph with no code, not compared; -1: one that is not a code, equal to none), and the paths it constructs */
export interface AlignFacts { codes: (number | null)[][]; paths: number }
/** a page's alignment facts from PDF.js's operator list (pure): the page aligns by them exactly as by the list */
export declare function alignOf(OPS: Record<string, number>, opList: OpList): AlignFacts
export interface Remover {
  numPages: number; encrypted: boolean
  /** a page against PDF.js's reading of it: its alignment facts, or (OPS, opList) the list itself; any difference refuses the page */
  alignPage(pageIndex: number, facts: AlignFacts): { ok: boolean; why: string[] }
  alignPage(pageIndex: number, OPS: Record<string, number>, opList: OpList): { ok: boolean; why: string[] }
  /** a page walked: what could not be walked (`problems`, any one refuses the page) and the operators visited */
  walkPage(pageIndex: number): { problems: string[]; walked: number; held: number; bytes: number; events: { kind: string; codes?: unknown[] }[] }
  /** the decoded streams and the fonts read let go (a remover kept across asks holds the object layer's parse alone) */
  release(): void
}
export declare function openRemover(bytes: Uint8Array, o: { PL: PdfLib; inflate?: ((bytes: Uint8Array, limit: number) => Uint8Array) | null; walkMax?: number; heldMax?: number; bytesMax?: number }): Promise<Remover>
/** a unit's removal on a page: its glyphs as n, k pairs (pageInk's `indices`) and its rules as painted paths' places */
export interface PlannedUnit { id: number; glyphs: number[]; paths: number[] }
/** a crop's glyphs and rules, the placeholders' page's */
export interface PlannedCrop { id?: number; k?: number; glyphs: number[]; paths: number[] }
/** a babel name's removal on a page (D1a): its glyphs as n, k pairs */
export interface PlannedName { occurrence: number; glyphs: number[] }
/** the plan: per page (1-based), its units' removals, its names', its crops, and what the planner read of the page */
export interface RemovalPlan { pages: Record<number, { units: PlannedUnit[]; names?: PlannedName[]; crops: PlannedCrop[]; shows?: number; glyphs?: number }> }
/** the updates a chained add-on follows (makeAddon's `chain`): the document's bytes so far, its last cross-reference section's
 *  offset, the next free object number (null: none written yet), the removed pages' object numbers appended so far, the
 *  empty content stream's (null: none written yet) */
export interface AddonChain { end: number; xref: number; next: number | null; kids: readonly number[]; empty: number | null }
/** what a page is aligned by: its facts (alignOf), or PDF.js's operator list with OPS */
type AlignedBy = { alignOf(page: number): AlignFacts | Promise<AlignFacts>; OPS?: Record<string, number>; opListOf?: (page: number) => Promise<OpList> } | { alignOf?: null; OPS: Record<string, number>; opListOf(page: number): Promise<OpList> }
type MakeAddonOptions = AlignedBy & {
  R: Remover; bytes: Uint8Array
  deflate(bytes: Uint8Array): Uint8Array; plan: RemovalPlan; sets?: readonly string[]
  boxesOf?: ((page: number, n: number, k: number) => number[] | null) | null; pathBoxOf?: ((page: number, m: number) => number[] | null) | null
  /** only the pages it removes, each named in its manifest entry (`at`), not every page at its set's fixed place */
  compact?: boolean
  /** the pages it reads, rising (default every page); the manifest's entries are theirs alone */
  pages?: readonly number[] | null
}
/** the state after an update: the next free object number, the removed pages' object numbers it appended, the empty stream's */
export interface AddonChainStep { next: number | null; kids: number[]; empty: number | null }
/** arXiv's bytes with the sets appended as one incremental update (`tail`), and arXiv's followed by it (`bytes`) */
export declare function makeAddon(o: MakeAddonOptions & { chain?: null }): Promise<{ bytes: Uint8Array; tail: Uint8Array; appended: number; manifest: RemovalManifest; chain: AddonChainStep }>
/** the update chained after `chain`'s (compact, the R set alone): null where no page is removed, the state then as it was */
export declare function makeAddon(o: MakeAddonOptions & { chain: AddonChain }): Promise<{ tail: Uint8Array | null; appended: number; manifest: RemovalManifest; chain: AddonChainStep }>
type Ink = { glyphs: Glyph[]; boxes: number[]; paths: number[] }
/** an add-on's page p checked by PDF.js's own reading of it: R lacks exactly the planned glyphs and rules, P holds exactly
 *  the crops' */
export declare function checkPage(o: { orig: Ink; removed: Ink; kept: Ink; entry: RemovalPlan['pages'][number] | undefined }): {
  removed: number; missed: number; other: number; moved: number; extra: number; maxMove: number
  rulesRemoved: number; rulesMissed: number; rulesOther: number; pOwn: number; pMissing: number; pOther: number
}
/** the remover's entry for one paper, under the module's isolation contract: the add-on, or the paper refused for any error; never throws */
export declare function removePaper(o: { bytes: Uint8Array; PL: PdfLib; inflate?: ((bytes: Uint8Array, limit: number) => Uint8Array) | null; walkMax?: number; heldMax?: number; bytesMax?: number; OPS: Record<string, number>; opListOf: (page: number) => Promise<{ fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> }>; deflate: (bytes: Uint8Array) => Uint8Array; plan: RemovalPlan; sets?: readonly string[]; boxesOf?: ((p: number, n: number, k: number) => number[] | null) | null; pathBoxOf?: ((p: number, m: number) => number[] | null) | null; compact?: boolean }): Promise<({ ok: true } & { bytes: Uint8Array; appended: number; manifest: RemovalManifest }) | { ok: false; refused: string }>
/** a plan's removal on a page (tuples: layout/addon.mjs pagePlanOf's `remove`, an ask's plan) as makeAddon's plan entry */
export declare function removalEntry(r: { shows?: number | null; units: [number, number[], number[]][]; names: [number, number[]][]; crops: [number[], number[]][] }): RemovalPlan['pages'][number]
/** the reason of a page whose removed page alone is more than a part's tail or entries hold */
export declare const PAST_PART: string
/** the remover child's one call: one part's removed pages for an ask (chain-wire.mjs), the remover opened at the first and
 *  kept, no chain kept; refused (never thrown) but for a memory-class error */
export declare function removerOf(o: {
  bytes: Uint8Array; PL: PdfLib; inflate?: ((bytes: Uint8Array, limit: number) => Uint8Array) | null; deflate(bytes: Uint8Array): Uint8Array
  walkMax?: number; heldMax?: number; bytesMax?: number
}): { remove(plans: Uint8Array): Promise<{ ok: true; tail: Uint8Array | null; entries: Uint8Array } | { ok: false; why: 'refused' }> }
