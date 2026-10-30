// warm.mjs's types: the faces a page's units will be drawn in, asked at once before the page is laid
import type { FrozenRuleSet } from '../rules/layout.mjs'
import type { EnglishFamily } from '../rules/font-roles.mjs'
import type { FaceSources, FontClass } from './fonts.mjs'

/** a read part as the warmer reads it: its layout's fonts, lines and names, or its left rectangles where it has no layout */
export interface WarmPart {
  readonly layout?: { readonly fonts?: readonly string[]; readonly lines?: readonly (readonly [number, ArrayLike<number> | null])[]; readonly names?: readonly ArrayLike<number>[] } | null
  readonly left?: readonly (readonly [number, unknown, readonly ArrayLike<number>[]])[] | null
}
/** the paper's English family as its parts' layouts set it (each font weighted by the lines set in it); 'other' with none */
export declare function familyOfParts(parts: readonly WarmPart[] | null | undefined): EnglishFamily
/** a babel name set on a page: its key (NAME_KEYS'), whether it is set in capitals, its font's class (null: none told) */
export interface WarmName { key: string; capitals: boolean; st: FontClass | null }
/** what a page of the parts read so far sets: its units with their original's style there (null: none told), its names, the
 *  classes of the fonts its lines are set in, the serif design most of its lines are set in (null: none), and whether a part
 *  read covers it (else only a unit running on to it from an earlier part reaches it so far) */
export interface WarmPageOfParts { units: Map<number, FontClass | null>; names: WarmName[]; fonts: FontClass[]; serif: string | null; covered: boolean }
export declare function pagesOfParts(parts: readonly WarmPart[] | null | undefined): Map<number, WarmPageOfParts>
/** a unit as the warmer reads it: its kind (an author's is never drawn), its translated text, its original's style */
export interface WarmUnit { kind: string | null; text: string; st: FontClass | null }
/** what the warmer asks of a page: its units, its names, its fonts' classes, and page 1's serif design for the faces v0
 *  warms there (null: not page 1's) */
export interface WarmPage { units?: readonly WarmUnit[]; names?: readonly WarmName[]; fonts?: readonly FontClass[]; likely?: string | null }
export interface FaceWarmer {
  /** the slices that hold what v0 will draw of `page` in the target's faces for the paper's English `family`, loaded
   *  WAVE_SLOTS at a time, no more begun once `signal` is aborted; resolves once each has loaded or failed or the signal has
   *  stopped it, never rejects */
  warm(page: WarmPage, family: EnglishFamily, o?: { signal?: AbortSignal | null; cjkOnly?: boolean }): Promise<void>
}
/** the CJK characters of a first page as firstPageUnits counts them */
export declare const FIRST_PAGE_CHARS: number
/** page 1's units as they can be told before any part is read: the units in id order whose texts are held, an author's aside,
 *  until their CJK characters reach `chars`, and every place of the author block; each with no style */
export declare function firstPageUnits(kinds: readonly (string | null)[] | null | undefined, texts: ReadonlyMap<number, string> | null | undefined, o?: { chars?: number; shown?: ((kind: string) => boolean) | null }): WarmUnit[]
/** the slices the wave loads at a time */
export declare const WAVE_SLOTS: number
/** a warmer of one target's faces over the host's served slices */
export declare function faceWarmer(o: { faceSources: FaceSources; target: string; rules?: FrozenRuleSet }): FaceWarmer
