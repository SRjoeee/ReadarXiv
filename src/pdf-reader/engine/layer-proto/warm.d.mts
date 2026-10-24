// warm.mjs's types: the faces a page's units will be drawn in, asked at once before the page is laid
import type { FrozenRuleSet } from '../rules/layout.mjs'
import type { EnglishFamily } from '../rules/font-roles.mjs'
import type { FaceSources } from './fonts.mjs'

/** the paper's English family as its parts' layouts set it (each font weighted by the lines set in it); 'other' with none */
export declare function familyOfParts(parts: readonly { readonly layout?: { readonly fonts?: readonly string[]; readonly lines?: readonly (readonly [number, ArrayLike<number> | null])[] } | null }[] | null | undefined): EnglishFamily
/** a unit as the warmer reads it: whether it is a heading (its text asked in the bold face) and its translated text */
export interface WarmUnit { heading: boolean; text: string }
export interface FaceWarmer {
  /** the slices that hold `units`' characters in the target's faces for the paper's English `family`, asked at once; resolves
   *  once each has loaded or failed, never rejects */
  warm(units: readonly WarmUnit[], family: EnglishFamily): Promise<void>
}
/** a warmer of one target's faces over the host's served slices */
export declare function faceWarmer(o: { faceSources: FaceSources; target: string; rules?: FrozenRuleSet }): FaceWarmer
