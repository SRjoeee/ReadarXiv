// Hyphenation for the layer (Plan 8b, Task 8). Slice 1 cuts it to the interface: no language has patterns yet, so every
// language resolves null and the layer breaks lines at spaces and the scripts' own break points only. The patterns
// (TeX Live's hyph-utf8, a module per language with its licence) and Russian's rules come with Slice 2

/** the languages the layer will hyphenate, as the rule set's `hyphenate` names them */
export const HYPHEN_LANGS = Object.freeze(['en', 'de', 'fr', 'es', 'pt', 'ru'])

/** a language's hyphenator: none in Slice 1, for any language */
export async function loadHyphenator(_lang) {
  return null
}
