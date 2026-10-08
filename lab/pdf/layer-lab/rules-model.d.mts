// rules-model.mjs's types: the rules panel's model over layout rule sets
import type { FrozenRuleSet, RuleField, RuleSet, Script } from '../../../src/pdf-reader/engine/rules/layout.mjs'

/** where a field's value for a target comes from */
export type RuleSource = 'edit' | 'language' | 'script' | 'set'
/** where a script's field is written: the language's own value, or the script's */
export type RuleScope = 'language' | 'script'
/** a field at which two sets differ; `from` or `to` is left out where that set does not have the field */
export interface RuleChange { path: string; from?: unknown; to?: unknown }

/** deep equality of two JSON values: objects regardless of key order */
export declare function same(a: unknown, b: unknown): boolean
/** a field's value for a target: the language's own over the script's */
export declare function fieldValue(set: FrozenRuleSet, field: RuleField, script: Script, tag: string): unknown
/** whether the field differs from `base` anywhere it could be edited for this target */
export declare function isEdited(set: FrozenRuleSet, base: FrozenRuleSet, field: RuleField, script: Script, tag: string): boolean
/** an unsaved edit, else the language, the script, or the set as a whole */
export declare function sourceOf(set: FrozenRuleSet, base: FrozenRuleSet, field: RuleField, script: Script, tag: string): RuleSource
/** the set with one field edited for a target, as a new set (an edit to the script takes the language's own value away) */
export declare function edit(set: FrozenRuleSet, field: RuleField, script: Script, tag: string, value: unknown, scope?: RuleScope): RuleSet
/** the set with a field taken back to `base`'s, wherever it could be edited for this target */
export declare function reset(set: FrozenRuleSet, base: FrozenRuleSet, field: RuleField, script: Script, tag: string): RuleSet
/** the fields at which two sets differ (not the version or the note) */
export declare function diffRules(a: FrozenRuleSet, b: FrozenRuleSet): RuleChange[]
