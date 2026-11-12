// lab/rules/areas.mjs: the reduction's areas (design-reduction-2026-11-13.md §4, R5a-d), by a module's path, before and
// after R1a moves the front half into packages/engine (§3a's table). A path in none of them is `other`. Not shipped.

export const AREAS = [
  { id: 'a', says: 'locate (engine/src/locate/**)', test: p => p.startsWith('packages/engine/src/locate/') },
  {
    id: 'b',
    says: 'the front half (today: src/pdf-reader/engine/**; after R1a: engine/src/{source,own,compile,instrument}/**, its four modules in marks/)',
    test: p => p.startsWith('src/pdf-reader/engine/') || /^packages\/engine\/src\/(?:source|own|compile|instrument)\//.test(p) || /^packages\/engine\/src\/marks\/(?:marks|names|colour|label-form)\.(?:m|c)?[jt]s$/.test(p),
  },
  { id: 'c', says: 'the typesetter (typeset/src/**)', test: p => p.startsWith('packages/typeset/src/') },
  { id: 'd', says: 'engine/src/{ink,wrap,remove,xref}, translate/src/**', test: p => /^packages\/engine\/src\/(?:ink|wrap|remove|xref)(?:[./]|$)/.test(p) || p.startsWith('packages/translate/src/') },
]

/** a module's area: a, b, c, d, or other */
export const areaOf = path => AREAS.find(a => a.test(path))?.id ?? 'other'
