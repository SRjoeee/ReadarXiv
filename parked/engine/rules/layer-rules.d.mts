// layer-rules.mjs's types (JavaScript until the engine's port); scripts.mjs re-exports them
/** the script a BCP 47 tag is written in (its likely script) */
export declare const scriptOf: (lang: string) => string
/** one script's rules for the layer (spec §4.5), beside its TeX design */
export interface LayerRules {
  leadBase: number; leadFloor: number   // × the original's line pitch
  trackMin: number                      // em, CJK tracking (≤ 0)
  letterMin: number                     // em, alphabets' letter spacing (≤ 0)
  compress: number                      // full-width punctuation compressed first: 0 none, 1 at a line's start and between marks, 2 every mark
  borrowMax: number                     // share of the free space below the last frame
  sizeStep: number; sizeFloor: number   // × the original's size
  even: 'size' | 'unit'                 // page-even: the page's body units at one size, or each at its own; never the leading
  autospace: number                     // em between CJK and Latin (zh, ja)
  spaceMax: number                      // the extra a word space may take when justifying, × its own width (Korean, alphabets)
  hyphenate: string | null              // the patterns' language
}
export declare const LAYER_RULES: Readonly<Record<'Hans' | 'Hant' | 'Jpan' | 'Kore' | 'Latn' | 'Cyrl', LayerRules>>
/** where a rule means the same in both renderers and their values differ: the field, the TeX path's value, and why */
export declare const LAYER_DIVERGES: Readonly<Record<string, readonly { field: keyof LayerRules; tex: number; why: string }[]>>
/** a target's rules: its script's, with `hyphenate` its language's where patterns exist (English for a CJK target's
 *  Latin words), else null; throws for a script with none, as strategiesFor does */
export declare function layerRulesFor(lang: string): LayerRules
