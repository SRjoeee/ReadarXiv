// rulesFor: one target's Rules, from the rule set's data files (src/data/rules/: one a language, its script's fields beneath
// its own) and the reader's choices (resolveRules): the script's fields with the language's over them, field by field (an
// object field replaced whole, never merged), `cjk` from the script, babel's hyphenation minimums; the patterns to read:
// English's for every Latin word, the language's own where `latinPatterns` names one, a Cyrillic target's `cyrillicPatterns`;
// the target's head names (data/rules/heads.ts: a theorem-like head's printed name) and its reference names
// (data/rules/refs.ts: the names cleveref and hyperref generate).
// Each call answers fresh objects: a caller may change its own.
import { HEADS } from './data/rules/heads.ts'
import { HYPHENATION, LANGUAGES, SCRIPTS } from './data/rules/index.ts'
import { REFS } from './data/rules/refs.ts'
import type { ScriptRules } from './data/rules/types.ts'
import type { Choices, Lang, RuleParams, Rules, Script } from './types.ts'
import { type RefNames, refNamesOf } from './unit/rename.ts'

/** the packages' reference names for a target: every target's heads and references, its own
 *  words (U.rename's RefNames) */
const refsFor = (target: Lang): RefNames =>
  refNamesOf(
    {
      types: REFS.types,
      conjunctions: REFS.conjunctions,
      singular: REFS.singular,
      targets: Object.fromEntries(
        Object.entries(REFS.targets).map(([tag, t]) => [tag, { heads: HEADS[tag] ?? {}, refs: t.refs, conj: t.conj }]),
      ),
    },
    target,
  )

/** CLDR's (ISO 15924's) codes of the scripts written with Han: Hans and Hant (Simplified and Traditional Han), Jpan (Japanese:
 *  Han, Hiragana, Katakana) and Kore (Korean: Hangul, Han) */
const CJK_SCRIPTS = new Set(['Hans', 'Hant', 'Jpan', 'Kore'])
/** the script fields in the set's order (rules/layout.mjs SCRIPT_FIELDS): our own vocabulary, ScriptRules' keys */
const SCRIPT_KEYS = [
  'order',
  'leadBase',
  'leadFloor',
  'leadEm',
  'trackMin',
  'compressMax',
  'centredPunct',
  'borrow',
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
  'spaced',
  'cjkQuotes',
  'noStart',
  'noEnd',
  'hyphen',
  'latinPatterns',
  'cyrillicPatterns',
  'cellClear',
  'cellCapMin',
  'cjkFaces',
] as const satisfies readonly (keyof ScriptRules)[]

/** the script a BCP 47 tag is written in: its likely script (zh-TW Hant, sr Cyrl) */
export const scriptOf = (lang: Lang): string => new Intl.Locale(lang).maximize().script ?? ''

/** a target the rule set has no rules for */
export class NoRules extends Error {
  constructor(what: string) {
    super(`rulesFor: no rules for ${what}`)
    this.name = 'NoRules'
  }
}

const copy = <T>(v: T): T => (v !== null && typeof v === 'object' ? structuredClone(v) : v)

/** the rule set resolved for one target: the params, the labels, the patterns' languages, the CJK faces */
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
  }
}

/**
 * One target's Rules: the rule set resolved for it, the hyphenation patterns the host loaded (`hyph`, by language; data handed
 * in, never fetched here), the reader's choices (by default captions in the target, nothing left)
 */
export function rulesFor(target: Lang, choices: Choices = {}, hyph: Readonly<Record<string, unknown>> = {}): Rules {
  const r = resolveRules(target)
  // (the borrow past TeX's text block bottom where the reader sets it (§18.37, "The switch"): in the params the fit reads;
  // absent, the fit's own rule)
  const past = choices.pastFoot
  return {
    target,
    script: r.script as Script,
    set: past === undefined ? r.params : { ...r.params, pastFoot: past },
    labels: r.labels,
    heads: Object.hasOwn(HEADS, target) ? { ...HEADS[target] } : null,
    refs: refsFor(target),
    patterns: r.patterns,
    hyph,
    cjkFaces: r.cjkFaces,
    captions: choices.captions ?? { figure: 'target', table: 'target' },
    leave: choices.leave ?? [],
  }
}
