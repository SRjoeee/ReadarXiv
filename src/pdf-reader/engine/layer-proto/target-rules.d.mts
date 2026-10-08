// target-rules.mjs's types: the instant layer's choices for a target, in one call
import type { CjkFaces } from '../font-roles.mjs'
import type { Params } from './layer2.mjs'

/** the built-in rules' identity: a rule set's schema and version */
export declare const BUILTIN_RULES: { readonly schema: 1; readonly version: 1 }
/** every choice v0 makes for a target */
export interface TargetRules {
  schema: 1
  version: number
  target: string
  /** the fit's parameters, the leading relative to the original's pitch (leadRel) and adaptive fill (D) among them */
  params: Params
  /** the target's names of a figure and a table; null: every label kept as the original's */
  labels: { figure: string; table: string } | null
  /** the hyphenation patterns to load */
  patterns: readonly ('en' | 'de' | 'ru')[]
  /** the script's CJK family, its Kai and the designs it is light beside; null: none */
  cjkFaces: CjkFaces | null
}
/** every choice v0 makes for `target`, built in (a fresh object each call) */
export declare function rulesFor(target: string): TargetRules
