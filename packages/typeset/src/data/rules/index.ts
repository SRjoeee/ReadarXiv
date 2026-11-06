// The rule set: its languages by tag.
// Today's rules/layout-rules.json (schema 10, version 10, engine 065c1d973), written by lab/typeset/rules-data.mjs; not
// edited by hand.

import { BG } from './bg.ts'
import { CS } from './cs.ts'
import { DE } from './de.ts'
import { ES } from './es.ts'
import { FR } from './fr.ts'
import { ID } from './id.ts'
import { IT } from './it.ts'
import { JA } from './ja.ts'
import { KO } from './ko.ts'
import { MS } from './ms.ts'
import { NL } from './nl.ts'
import { PL } from './pl.ts'
import { PT } from './pt.ts'
import { RU } from './ru.ts'
import { SV } from './sv.ts'
import { TR } from './tr.ts'
import { UK } from './uk.ts'
import { ZH } from './zh.ts'
import { ZH_TW } from './zh-tw.ts'
import type { LanguageRules } from './types.ts'

export { HYPHENATION, SCRIPTS, VERSION } from './scripts.ts'
export type { LanguageRules, ScriptRules } from './types.ts'

/** each language's own fields, by its tag */
export const LANGUAGES: Readonly<Record<string, LanguageRules>> = {
  bg: BG,
  cs: CS,
  de: DE,
  es: ES,
  fr: FR,
  id: ID,
  it: IT,
  ja: JA,
  ko: KO,
  ms: MS,
  nl: NL,
  pl: PL,
  pt: PT,
  ru: RU,
  sv: SV,
  tr: TR,
  uk: UK,
  zh: ZH,
  'zh-TW': ZH_TW,
}
