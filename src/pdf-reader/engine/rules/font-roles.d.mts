// font-roles.mjs's types (JavaScript until the engine's port)
export type EnglishFamily = 'cm' | 'times' | 'libertine' | 'palatino' | 'charter' | 'garamond' | 'utopia' | 'other'
export type Design = EnglishFamily | 'helvetica' | 'cmss' | 'courier' | 'cmtt' | 'beramono' | 'inconsolata' | 'biolinum'
/** a PDF font's class, weight, slant, small capitals and design, from its PostScript name (subset tag stripped) */
export interface FontClass { cls: 'serif' | 'sans' | 'mono' | 'math'; bold: boolean; italic: boolean; caps: boolean; design: Design; known: boolean }
export declare function classifyFont(postScript: string): FontClass
/** the paper's body family: from the font probe's NFSS names (the TeX path), or from the layout file's fonts weighted by
 *  the lines each sets (the layer) — one table of names behind both */
export declare function familyOfProbe(probe: { rm: string; sf: string; tt: string; body: string } | null): EnglishFamily
export declare function familyOfFonts(names: readonly string[], weights: readonly number[]): EnglishFamily
export type FaceId = string
export interface Face {
  id: FaceId
  file: string                  // the file's name, as TeX finds it and the subsetter reads it
  source: 'texlive' | 'hosted'
  family: string                // our CSS family name: 'axt-' and the face group
  weight: number                // 300 Light, 400 Regular, 500 Medium, 600 SemiBold, 700 Bold
  style: 'normal' | 'italic'
  size: number                  // × the run's size: a CJK face's script at its family's ideographs' visual size (1: none)
  licence: string               // an SPDX expression (an identifier, WITH an exception), or 'LicenseRef-<name>'
  web: 'ofl' | 'gfl' | 'notice' | 'gpl' | 'review'
}
export declare const FACES: Readonly<Record<FaceId, Face>>
/** what a target draws in, for a paper's English family */
export interface RoleSet {
  target: string; family: EnglishFamily
  cjk: { body: FaceId; bold: FaceId } | null   // an italic run is its weight's face sheared (layer-proto/fonts.mjs CJK_SLANT_DEG)
  fallbacks: Readonly<Record<FaceId, readonly FaceId[]>>
}
/** a script's CJK faces: its group, drawn at Regular and Bold beside every English family (RULES_SCHEMA 6: the Light designs
 *  and the Kai, which no engine since 2026-10-19 read, gone from the set) */
export interface CjkFaces { group: string }
/** whether a face of the catalog is a CJK one (Source Han Serif's, Harano Aji's, a Kai) */
export declare function isCjkFace(id: string): boolean
/** the English families a paper's body is set in */
export declare const ENGLISH_FAMILIES: readonly EnglishFamily[]
/** what a target draws in, for a paper's English family; `cjkFaces` is the target's CJK family as the layout rule set gives
 *  it (null for an alphabet), and a script of no alphabet's given none throws */
export declare function rolesFor(target: string, family: EnglishFamily, cjkFaces: CjkFaces | null): RoleSet
/** whether a face's lowercase letters are its small capitals (Latin Modern's caps face): measured and drawn as they are */
export declare const capsLetters: (id: string) => boolean
/** whether a face draws small capitals of its own: by its smcp feature, or by its letters (Latin Modern's caps face) */
export declare const ownSmallCaps: (id: string) => boolean
/** the face a run is drawn in */
export declare function faceFor(roles: RoleSet, run: { script: 'cjk' | 'latin'; cls: FontClass['cls']; design: Design; bold: boolean; italic: boolean; caps: boolean }): FaceId
/** whether every character of `text` (but white space and the default ignorable) is in one of `faces`' coverage or
 *  their fallbacks' */
export declare function canDraw(text: string, faces: readonly FaceId[], roles: RoleSet): boolean
/** whether every character of `text` (but white space and the default ignorable) is in one of `ranges`: a list of range
 *  lists, each [start, end, …] (inclusive), sorted and disjoint as COVERAGE's are. canDraw over what a host serves of the
 *  faces, a slice's code points a list each */
export declare function canDrawIn(text: string, ranges: readonly (readonly number[])[]): boolean
