// own.mjs's types: each unit's own ink in our final pass, by its marks
export { UNHIDDEN } from './delta-wire.mjs'
import type { Unhidden } from './delta-wire.mjs'
export declare const SPELL_LIST_MAX: number
/** a head macro's closing punctuation after the unit before a start (MR 5), and how near it abuts the glyph before it, in ems */
export declare const HEAD_PUNCT: RegExp
export declare const HEAD_ABUT: number
/** the closing punctuation glued past a unit's end mark on its line that is the unit's text (MR 4c), as the maker's line takes it */
export declare const TAIL_PUNCT: RegExp
/** a text's evidence for the spell check: its letters and digits, without accents, lower case */
export declare function spellOf(s: string): string
/** whether a label's characters are a label's form (or none); `note`, a theorem's note's label, may end in the bracket its
 *  head macro opens the note with ("Definition 5.1 (") */
export declare function isLabelForm(s: string, note?: boolean, form?: RegExp): boolean
/** the label's form with the paper's own theorem names beside the standard ones (source/paper-names.mjs theoremNames) */
export declare function labelFormOf(names: readonly string[] | null | undefined): RegExp
export interface OwnGlyph { n: number; k: number; u: string; x0: number; x1: number; ix0?: number; ix1?: number; y: number; size: number; top: number; bottom: number }
export interface OwnPage { glyphs: OwnGlyph[]; boxes: ArrayLike<number>; paths: ArrayLike<number>; points: { name: string; glyph: number; box: number }[]; boxAt: ArrayLike<number>; view?: number[] }
export interface OwnUnit { groups: Set<string>; pages: Set<number>; unhidden: Unhidden | null; labelKept: boolean }
export interface OwnStats { units: number; unhidden: Record<Unhidden, number>; spell: number[]; labelKept: number; leaks: { count: number; units: number[] } }
export declare function ownOf(pages: OwnPage[], o?: { units?: unknown[] | null; follows?: ((name: string) => unknown) | null; texts?: ReadonlyMap<string, string> | null; inkless?: ReadonlySet<string> | null; names?: readonly string[] | null }): { glyphs: (string | null)[][]; boxes: (string | null)[][]; units: Map<number, OwnUnit>; /** per page, the glyphs of a display its unit opens with, in no group: its unit's placeholders' (`u<id>.p`) for the ledger */ leads: Map<number, string>[]; stats: OwnStats }
/** a rule on a line of a unit's text (MR 2b) is no thicker than this share of the line's size */
export declare const RULE_EM: number
/** the painted rules of `boxes` that stand on a line of `glyphs` (MR 2b, an ink unit's too): [page, index] each */
export declare function lineRulesOf(pages: readonly Pick<OwnPage, 'glyphs' | 'boxes' | 'paths'>[], glyphs: readonly (readonly [number, number])[], boxes: readonly (readonly [number, number])[], max?: number): { rules: [number, number][]; work: number; over: boolean }
/** the glyphs and boxes the ownership of a paper may visit */
export declare const OWN_WORK: number
