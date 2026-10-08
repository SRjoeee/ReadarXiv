// fonts.mjs's types: the original's fonts and the faces v0 draws in (ported from the prototype at 9e56fca)
import type { FaceId } from '../font-roles.mjs'

/** a PDF font's class as its PostScript name tells it */
export interface FontClass {
  fam: 'serif' | 'sans' | 'mono' | 'math'
  bold: boolean
  italic: boolean
  caps: boolean
  /** the Latin family the browser should use: times, cm, palatino, charter, libertine, helvetica, cmss, courier, cmtt */
  design: string
  /** whether the name says anything (a Type 3 or renamed subset does not) */
  known: boolean
  name: string
}
/** a run's style: a font class without the name */
export interface Style { fam: string; bold?: boolean; italic?: boolean; caps?: boolean; design?: string; color?: string; known?: boolean }
/** the face a run is drawn in: a CSS family list, its weight and style, an oblique's skew, what its slant became */
export interface Face { family: string; weight: number; style: 'normal' | 'italic'; oblique: number; stand: string; caps?: boolean; size?: number; id?: string; ids?: string[] }
export declare function classifyFont(name: string, fallbackFamily?: string): FontClass
/** class, weight and slant: what the style match compares */
export declare const styleKey: (s: Style) => string
export declare const OBLIQUE_DEG: number
/** a run's face by its style, its class ('cjk' or 'latin') and the target */
export declare function faceOf(st: Style, cls: 'cjk' | 'latin', to: string): Face
/** a face's canvas font string at `px` */
export declare const fontString: (face: Face, px: number) => string
/** the web faces (Latin Modern) a set of designs needs, loaded once; `urlOf` gives a face file's URL by its name */
export declare function loadWebFaces(designs: readonly string[], urlOf?: (file: string) => string): Promise<unknown>
/** the English family v0's role table faces are set for at its open, until the paper's own is read */
export declare const OPEN_FAMILY: 'times'
/** v0 in the role table's faces (font-roles.mjs) for a target and the paper's English family, its CJK faces `cjkFaces`
 *  the layout rules' (null for an alphabet); a falsy target: the prototype's own faces again */
export declare function setRoleFaces(target: string | null, family: string, cjkFaces: import('../font-roles.mjs').CjkFaces | null): void
/** the role set v0 draws in, or null for the prototype's faces */
export declare const roleFaces: () => import('../font-roles.mjs').RoleSet | null
/** one slice of a face a host serves: its file on the host's origin (a plain URL) and its code points as [start, end]
 *  pairs (inclusive, ascending, apart) */
export interface FaceSlice { url: string; ranges: readonly number[] }
/** a face's slices as a host gives them: a promise, resolved with null where the host does not serve the face, rejected
 *  where it could not say (a table not yet loaded is awaited, never read as not served) */
export type FaceSources = (id: FaceId) => Promise<readonly FaceSlice[] | null>
/** a unit's run: a face and the distinct characters the unit draws in it */
export interface FaceRun { face: Face; text: string }
/** why a unit cannot be drawn in what is served: `served`, a character in no slice of its runs' faces and their fallbacks (the
 *  code points, eight at most), or a run's own face not served; `face`, a table or a slice that failed */
export type FaceRefusal = { why: 'served'; missing: number[] } | { why: 'face' }
export interface RoleFaceSet {
  /** why the unit whose runs these are cannot be drawn, else null with the slices its characters are in loaded */
  check(runs: readonly FaceRun[]): Promise<FaceRefusal | null>
  /** the slices of `face` that hold `text` loaded, as far as they can be; never rejects */
  ready(face: Face, text: string): Promise<void>
  /** the face's table asked and its first slice fetched, at once, not awaited */
  warm(id: FaceId): void
}
/** the role table's faces as one run is given them: `faceSources`, or each face's whole file at `faceUrl(file)` */
export declare function roleFaceSet(o?: { faceSources?: FaceSources | null; faceUrl?: (file: string) => string }): RoleFaceSet
/** the faces a unit's tokens are drawn in, each with its characters */
export declare function runsOfTokens(tokens: readonly { face?: Face; s?: string; hyph?: string }[]): FaceRun[]
/** the id of the face a target's body text is drawn in (after setRoleFaces) */
export declare function bodyFaceId(): FaceId
