// layout.mjs's types: the layout rule set, its schema, the built-in copy, reading and resolving
import type { ZodMiniType } from 'zod/mini'
import type { CjkFaces } from '../font-roles.mjs'
import type { Params } from '../layer-proto/layer2.mjs'

/** the schema's number: the shape and how the engine reads it */
export declare const RULES_SCHEMA: 1
/** a set's bytes at most, as received */
export declare const RULES_CAP: 65536
/** a set's JSON values at most, counted before JSON.parse */
export declare const RULES_VALUES: 20000
/** the targets either reader offers (the web's eight and the extension's Portuguese): every one must resolve, or the set is refused */
export declare const TARGETS: readonly ['zh', 'zh-TW', 'ja', 'ko', 'de', 'fr', 'es', 'ru', 'pt']
export declare const SCRIPTS: readonly ['Hans', 'Hant', 'Jpan', 'Kore', 'Latn', 'Cyrl']
export type Script = (typeof SCRIPTS)[number]

/** a script's rules, every field present. Leadings are × the original's line pitch, sizes × the original's size, tracking
 *  and spaces in em; each field's range is RULES_FIELDS' */
export interface ScriptRules {
  // the fit (layer2.mjs layoutUnit2; run.mjs fitFurther, fillPage)
  order: ('track' | 'borrow' | 'lead' | 'shrink')[]
  leadBase: number; leadFloor: number; leadRel: boolean; grid: 0 | 1
  trackMin: number
  /** em; null: the face's size correction given back (run.mjs cjkAdvance) */
  trackStart: number | null
  compressMax: 0 | 1 | 2
  /** centred: no mark is compressed or hung (Traditional Chinese) */
  centredPunct: boolean
  borrow: 0 | 1; borrowGap: number
  floor: number; step: number
  further: ('widen' | 'flow' | 'shrink')[]; floorMin: number
  cjkJust: number; spaceMin: number; spaceMax: number; autospace: number
  even: 0 | 1 | 2
  /** 0: off */
  fillSize: number
  /** D; null: B */
  adaptiveFill: { band: number; track: number; size: number } | null
  // breaking (layer2.mjs tokensOf2, layer1.mjs kinsokuOf)
  /** break only at spaces (Korean, the alphabets) */
  keepAll: boolean
  /** curly quotes, dashes, the ellipsis and the middle dot take the CJK class */
  cjkQuotes: boolean
  /** characters no line starts / ends with; at most 256 each */
  noStart: string; noEnd: string
  hyphen: 0 | 1
  /** a Latin word's hyphenation patterns */
  latinPatterns: 'en' | 'de'
  // table cells (layer2.mjs cellBands)
  cellClear: number; cellCapMin: number
  // faces (font-roles.mjs rolesFor): the CJK group, its Kai, the English designs beside which it takes light weights
  cjkFaces: CjkFaces | null
}
/** a language: any field of its script's overridden, and what only a language has */
export type LanguageRules = Partial<ScriptRules> & {
  /** a float's label in the target's names; null: the original's kept */
  labels: { figure: string; table: string } | null
}
export interface RuleSet {
  schema: 1
  /** an integer ≥ 1, one more than the set it replaces */
  version: number
  /** at most 1,000 characters: what changed and why */
  note: string
  hyphenation: { minWord: number; en: { left: number; right: number }; de: { left: number; right: number } }
  scripts: Record<Script, ScriptRules>
  /** BCP 47 tags; every TARGETS member present, others allowed (the language wave) */
  languages: Record<string, LanguageRules>
}
/** a type read-only at every depth; a plain RuleSet is assignable to its frozen form */
type Frozen<T> = T extends object ? { readonly [K in keyof T]: Frozen<T[K]> } : T
/** a set that is not to be written: what BUILTIN_RULES is, and what every reader of a set takes */
export type FrozenRuleSet = Frozen<RuleSet>
/** one target's rules as v0 reads them */
export interface TargetRules {
  target: string
  script: Script
  /** v0's own: every ScriptRules fit, breaking and cell field, `cjk` from the script, and the set's hyphenation */
  params: Params
  labels: { figure: string; table: string } | null
  /** the patterns to load: en, latinPatterns, and ru for Cyrl */
  patterns: readonly ('en' | 'de' | 'ru')[]
  hyphenation: RuleSet['hyphenation']
  cjkFaces: CjkFaces | null
  version: number
}

/** a field the lab shows: its path ('leadBase'; 'labels'; 'hyphenation.en.left'), its scope (a script's field, which a
 *  language may override; a language's own; the set's), group, kind and range or values, and a line of words */
export interface RuleField {
  readonly path: string
  readonly scope: 'script' | 'language' | 'set'
  readonly group: 'fit' | 'breaking' | 'cells' | 'faces' | 'labels' | 'hyphenation'
  readonly kind: 'number' | 'integer' | 'boolean' | 'enum' | 'order' | 'subset' | 'chars' | 'object'
  readonly nullable?: boolean
  readonly min?: number
  readonly max?: number
  readonly step?: number
  readonly values?: readonly (string | number)[]
  readonly members?: readonly { readonly key: string; readonly kind?: string; readonly nullable?: boolean; readonly min?: number; readonly max?: number; readonly step?: number; readonly words: string }[]
  readonly words: string
}

/** the schema, strict at every level */
export declare const RULE_SET: ZodMiniType<RuleSet>
/** layout-rules.json, parsed (and refused if it is not a set) at import, frozen to every depth: a write throws, so it is
 *  typed read-only; `structuredClone` makes a set to edit */
export declare const BUILTIN_RULES: FrozenRuleSet
export declare const RULES_FIELDS: readonly RuleField[]
/** a set refused: the field (a dotted path in the set, or bytes, utf8, values, etag, json) and why */
export declare class RulesRefusal extends Error {
  constructor(field: string, why: string)
  readonly field: string
  readonly why: string
}
/** bytes → a set, with their SHA-256 (lowercase hex): the cap, the etag, UTF-8, the values counted before JSON.parse,
 *  JSON.parse, RULE_SET, then the cross-checks. `etag`: the server's `"<sha256>"` or its weak form `W/"<sha256>"`, compared with the bytes' digest where given */
export declare function readRules(bytes: Uint8Array, o?: { etag?: string | null }): Promise<{ set: RuleSet; sha256: string }>
/** parsed JSON as a set: RULE_SET and the cross-checks; throws RulesRefusal */
export declare function parseRules(json: unknown): RuleSet
/** a language's fields over its script's (scriptOf: Intl.Locale maximize); throws for a target `languages` lacks */
export declare function resolveRules(set: FrozenRuleSet, target: string): TargetRules
/** the canonical text: keys in RULE_SET's order, one field a line, LF, a final newline. The file is always in this form */
export declare function writeRules(set: FrozenRuleSet): string
