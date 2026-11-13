// The rule set's shapes (today's rules/layout.mjs SCRIPT_FIELDS and RULE_SET, schema 10). The data files beside this one are
// the source, edited here (taken at engine 065c1d973 from today's rules/layout-rules.json). What they mirror: a language's
// labels are babel's [captions] (babel 26.12 in TeX Live's locale files: the \figurename, \tablename, \abstractname,
// \refname and the rest \babelprovide prints; zh-TW's babel's zh-Hant's; empty where babel's is, zh's preface and zh-TW's
// proof), its `latinPatterns` and `cyrillicPatterns` name hyph-utf8's patterns (Russian's rules, Khmelev's, where `ru`), and
// each language's left and right hyphenation minimums are babel's; the heads and references are TeX Live's (heads.ts,
// refs.ts). The other fields are the rule set's own values.

/** a script's fields: the fit's, the breaking's, the cells', the faces' (rules/layout.mjs SCRIPT_FIELDS) */
export type ScriptRules = {
  order: readonly ('track' | 'borrow' | 'lead' | 'shrink')[]
  leadBase: number
  leadFloor: number
  trackMin: number
  compressMax: 0 | 1 | 2
  /** the set's (schema 10) and today's engine's; read by no part of the typesetter: a mark's blank half is the measure of the
   *  face that draws it (breaker/script.ts markOf, lane cjk-punct), whatever the target */
  centredPunct: boolean
  borrow: 0 | 1
  floor: number
  step: number
  further: readonly ('widen' | 'shrink')[]
  floorMin: number
  cjkJust: number
  spaceMin: number
  spaceMax: number
  autospace: number
  adaptiveFill: { band: number; track: number; size: number } | null
  fillLead: number | null
  fillLeadRel: number | null
  keepAll: boolean
  cjkQuotes: boolean
  noStart: string
  noEnd: string
  hyphen: 0 | 1
  latinPatterns: string
  cyrillicPatterns: string
  cellClear: number
  cellCapMin: number
  cjkFaces: { group: string } | null
}
/** a language's own fields: its labels (a float's and babel's names) and any script field it sets */
export type LanguageRules = Partial<ScriptRules> & {
  labels?: Readonly<Record<string, string>>
  hyphenation?: unknown
}
