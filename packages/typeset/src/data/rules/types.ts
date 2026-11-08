// The rule set's shapes (today's rules/layout.mjs SCRIPT_FIELDS and RULE_SET, schema 10): the data files beside this one are
// written by lab/typeset/rules-data.mjs from today's set.

/** a script's fields: the fit's, the breaking's, the cells', the faces' (rules/layout.mjs SCRIPT_FIELDS) */
export type ScriptRules = {
  order: readonly ('track' | 'lead' | 'shrink')[]
  leadBase: number
  leadFloor: number
  trackMin: number
  compressMax: 0 | 1 | 2
  centredPunct: boolean
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
