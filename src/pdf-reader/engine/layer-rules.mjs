// The instant layer's typesetting by writing system (spec §4.5), beside the TeX path's design (typeset/type.mjs DESIGN):
// the layer sets a unit's translation into the original's own frames on arXiv's page, so where TeX can let a page run on,
// the layer must tighten. Each script's values here are the priors, iteration 2's chosen values (instant-layer iteration 2,
// 2026-10-06); the sweep (§6.2 step 5) changes them as data, not code. A rule both renderers hold means the same in both:
// it equals the TeX path's, or LAYER_DIVERGES says why it does not.
//
// A module of its own, importing nothing, as verified.mjs is: the reader loads the layer's rules without scripts.mjs'
// LaTeX parser, and scripts.mjs re-exports them (and scriptOf, which moved here) so that every existing import holds.

/** the script a BCP 47 tag is written in: its likely script (zh-TW → Hant, sr → Cyrl) */
export const scriptOf = lang => new Intl.Locale(lang).maximize().script

const freeze = rules => Object.freeze(rules)
// CJK: the leading from the TeX path's base down to the original's own; tracking tightened to −0.05 em; full-width
// punctuation compressed before anything else; the size stepped by 2.5 % down to three quarters; a fifth of an em between
// CJK and Latin. The words of a CJK target's Latin text break as English does (its patterns, Task 8)
const CJK = { trackMin: -0.05, letterMin: 0, borrowMax: 1, sizeStep: 0.025, sizeFloor: 0.75, spaceMax: 1.0, hyphenate: 'en' }
// alphabets: the leading down to 0.95 of the original's, letter spacing tightened by at most a hundredth of an em, word
// spaces stretched by at most 1.2 of their own width each (spaceMax is the extra a space may take, so a stretched space is
// at most 2.2 times its natural width), the size as CJK's. Hyphenation is the language's, filled by layerRulesFor
const ALPHABET = { leadBase: 1.0, leadFloor: 0.95, trackMin: 0, letterMin: -0.01, compress: 0, borrowMax: 1, sizeStep: 0.025, sizeFloor: 0.75, even: 'size', autospace: 0, spaceMax: 1.2, hyphenate: null }

/**
 * Each script's rules for the layer. Leadings are × the original's line pitch, sizes × the original's size, tracking
 * and letter spacing in em (≤ 0: the layer only tightens), `borrowMax` the share of the free space below a unit's last
 * frame it may take. `compress`: full-width punctuation compressed first — 0 none, 1 at a line's start and between two
 * marks, 2 every mark (Traditional Chinese centres its punctuation, which has no half to take). `even`: whether page-even
 * sets a page's body units at one size ('size') or leaves each unit at its own ('unit'). Page-even never moves the
 * leading: one unit that needs a tight leading set the whole page at it, its other paragraphs left with blank lines at
 * their feet (the parity report, §3.2; dropping it, blank lines a body frame 0.82 to 0.73 on the 10 shared outputs,
 * fidelity-layer-report.md, fix 4)
 */
export const LAYER_RULES = freeze({
  Hans: freeze({ leadBase: 1.3, leadFloor: 1.0, ...CJK, compress: 2, even: 'size', autospace: 0.2 }),
  Hant: freeze({ leadBase: 1.3, leadFloor: 1.0, ...CJK, compress: 0, even: 'size', autospace: 0.2 }),
  Jpan: freeze({ leadBase: 1.0, leadFloor: 1.0, ...CJK, compress: 2, even: 'size', autospace: 0.2 }),
  // Korean spaces its words: no space of the layer's own between Hangul and Latin
  Kore: freeze({ leadBase: 1.0, leadFloor: 1.0, ...CJK, compress: 2, even: 'size', autospace: 0 }),
  Latn: freeze({ ...ALPHABET }),
  Cyrl: freeze({ ...ALPHABET }),
})

// the reasons, iteration 2's measurements on the layer's fixed boxes
const CJK_LEAD = 'a fixed box must tighten where TeX\'s flow can run on; a floor of 1.1 or 1.2 clipped 15 units, iteration 2'
const TIGHTEN = 'a fixed box must tighten'
const row = (field, tex, why) => freeze({ field, tex, why })
/** where a rule means the same in both renderers and their values differ: the field, the TeX path's value, and why */
export const LAYER_DIVERGES = freeze({
  Hans: freeze([row('leadFloor', 1.2, CJK_LEAD), row('sizeFloor', 0.92, 'at 0.92, 59 zh units clipped, iteration 2'), row('trackMin', 0, TIGHTEN)]),
  Hant: freeze([row('leadFloor', 1.2, CJK_LEAD), row('sizeFloor', 0.92, 'at 0.92, 59 zh units clipped, iteration 2'), row('trackMin', 0, TIGHTEN)]),
  Jpan: freeze([row('sizeFloor', 0.92, 'at 0.92, 33 ja/ko units clipped'), row('trackMin', 0, TIGHTEN)]),
  Kore: freeze([row('sizeFloor', 0.92, 'at 0.92, 33 ja/ko units clipped'), row('trackMin', 0, TIGHTEN)]),
  Latn: freeze([row('sizeFloor', 0.9, 'at 0.9, 56 de and 68 ru units clipped')]),
  Cyrl: freeze([row('sizeFloor', 0.9, 'at 0.9, 56 de and 68 ru units clipped')]),
})

// the languages the layer hyphenates: layer/hyphen.mjs HYPHEN_LANGS (TeX's patterns as data; Russian by Khmelev's rules),
// restated here because this module imports nothing
const PATTERNS = new Set(['en', 'de', 'fr', 'es', 'pt', 'ru'])

/** a target's rules: its script's, with `hyphenate` its language's where patterns exist (English for a CJK target's Latin
 *  words), else null; throws for a script with none, as strategiesFor does */
export function layerRulesFor(lang) {
  const script = scriptOf(lang)
  const rules = Object.hasOwn(LAYER_RULES, script) ? LAYER_RULES[script] : null
  if (!rules) throw new Error(`no layer rules for ${lang} (script ${script}) yet`)
  if (rules.hyphenate) return rules
  const language = new Intl.Locale(lang).language
  return freeze({ ...rules, hyphenate: PATTERNS.has(language) ? language : null })
}
