// font-roles.mjs's types (JavaScript until the engine's port)
export type EnglishFamily = 'cm' | 'times' | 'libertine' | 'palatino' | 'charter' | 'garamond' | 'utopia' | 'other'
export type Design = EnglishFamily | 'helvetica' | 'cmss' | 'courier' | 'cmtt' | 'beramono' | 'inconsolata'
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
  licence: string               // SPDX identifier, or 'LicenseRef-<name>'
  web: 'ofl' | 'gfl' | 'notice' | 'gpl' | 'review'
}
export declare const FACES: Readonly<Record<FaceId, Face>>
/** what a target draws in, for a paper's English family */
export interface RoleSet {
  target: string; family: EnglishFamily
  cjk: { body: FaceId; bold: FaceId; italic: FaceId | null; boldItalic: FaceId | null } | null   // italic null: upright
  fallbacks: Readonly<Record<FaceId, readonly FaceId[]>>
}
export declare function rolesFor(target: string, family: EnglishFamily): RoleSet
/** the face a run is drawn in */
export declare function faceFor(roles: RoleSet, run: { script: 'cjk' | 'latin'; cls: FontClass['cls']; design: Design; bold: boolean; italic: boolean; caps: boolean }): FaceId
/** whether every character of `text` (but white space) is in one of `faces`' coverage or their fallbacks' */
export declare function canDraw(text: string, faces: readonly FaceId[], roles: RoleSet): boolean
