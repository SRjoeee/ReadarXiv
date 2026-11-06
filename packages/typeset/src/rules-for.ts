// rulesFor (design-a §1.2): one target's Rules, from the rule set's data files (src/data/rules/: one a language, its script's
// fields beneath its own) and the reader's choices. Ported from engine 065c1d973 rules/layout.mjs resolveRules
// (layout.mjs:346-372) and rules/script.mjs scriptOf: the script's fields with the language's over them, field by field (an
// object field replaced whole, never merged), `cjk` from the script, babel's hyphenation minimums; the patterns to read:
// English's for every Latin word, the language's own where `latinPatterns` names one, a Cyrillic target's `cyrillicPatterns`.
// Each call answers fresh objects: a caller may change its own.
import { HYPHENATION, LANGUAGES, SCRIPTS, VERSION } from './data/rules/index.ts'
import type { ScriptRules } from './data/rules/types.ts'
import type { Choices, Lang, RuleParams, Rules, Script } from './types.ts'

const CJK_SCRIPTS = new Set(['Hans', 'Hant', 'Jpan', 'Kore'])
/** the script fields in the set's order (rules/layout.mjs SCRIPT_FIELDS) */
const SCRIPT_KEYS: readonly (keyof ScriptRules)[] = [
  'order',
  'leadBase',
  'leadFloor',
  'trackMin',
  'compressMax',
  'centredPunct',
  'borrow',
  'borrowGap',
  'floor',
  'step',
  'further',
  'floorMin',
  'cjkJust',
  'spaceMin',
  'spaceMax',
  'autospace',
  'adaptiveFill',
  'fillLead',
  'fillLeadRel',
  'keepAll',
  'cjkQuotes',
  'noStart',
  'noEnd',
  'hyphen',
  'latinPatterns',
  'cyrillicPatterns',
  'cellClear',
  'cellCapMin',
  'cjkFaces',
]

/** the script a BCP 47 tag is written in: its likely script (zh-TW Hant, sr Cyrl), rules/script.mjs scriptOf */
export const scriptOf = (lang: Lang): string => new Intl.Locale(lang).maximize().script ?? ''

/** a target the rule set has no rules for */
export class NoRules extends Error {
  constructor(what: string) {
    super(`rulesFor: no rules for ${what}`)
    this.name = 'NoRules'
  }
}

const copy = <T>(v: T): T => (v !== null && typeof v === 'object' ? structuredClone(v) : v)

/** today's resolveRules(BUILTIN_RULES, target): the params, the labels, the patterns' languages, the CJK faces */
export function resolveRules(target: Lang) {
  if (!Object.hasOwn(LANGUAGES, target)) throw new NoRules(`the target ${JSON.stringify(target)}`)
  const script = scriptOf(target)
  if (!Object.hasOwn(SCRIPTS, script)) throw new NoRules(`the script ${JSON.stringify(script)}`)
  const base = SCRIPTS[script]!,
    lang = LANGUAGES[target]!
  const field = <K extends keyof ScriptRules>(key: K): ScriptRules[K] =>
    copy(Object.hasOwn(lang, key) ? (lang[key] as ScriptRules[K]) : base[key])
  const params: Record<string, unknown> = { cjk: CJK_SCRIPTS.has(script) }
  for (const key of SCRIPT_KEYS) if (key !== 'cjkFaces') params[key] = field(key)
  params.hyphenation = copy(HYPHENATION)
  const patterns = ['en']
  if (params.latinPatterns !== 'en') patterns.push(params.latinPatterns as string)
  if (script === 'Cyrl' || params.cyrillicPatterns !== 'ru') patterns.push(params.cyrillicPatterns as string)
  return {
    target,
    script,
    params: params as RuleParams,
    labels: copy(lang.labels ?? {}),
    patterns,
    cjkFaces: field('cjkFaces'),
    version: VERSION,
  }
}

/**
 * One target's Rules: the rule set resolved for it, the hyphenation patterns the host loaded (`hyph`, by language; data handed
 * in, never fetched here), the reader's choices (today's default: captions in the target, nothing left)
 */
export function rulesFor(target: Lang, choices: Choices = {}, hyph: Readonly<Record<string, unknown>> = {}): Rules {
  const r = resolveRules(target)
  return {
    target,
    script: r.script as Script,
    set: r.params,
    labels: r.labels,
    patterns: r.patterns,
    hyph,
    cjkFaces: r.cjkFaces,
    version: r.version,
    captions: choices.captions ?? { figure: 'target', table: 'target' },
    leave: choices.leave ?? [],
  }
}
