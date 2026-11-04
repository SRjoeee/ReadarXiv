// src/pdf-reader/engine/rules/font-draw.mjs
// Whether a run can be drawn in the faces of the role table, by their whole coverage (font-coverage.mjs): a host's question that
// serves the faces whole. A reader asks it of what its host serves (font-roles.mjs canDrawIn, over the slices' ranges), so the
// coverage table is no part of a reader's bundle; this module and the gates read it.
import { COVERAGE } from './font-coverage.mjs'
import { canDrawIn } from './font-roles.mjs'

/** whether every character of `text` (but white space and the default ignorable) is in one of `faces`' coverage or
 *  their fallbacks' */
export function canDraw(text, faces, roles) {
  const seen = new Set(), queue = [...faces]
  while (queue.length) {
    const id = queue.shift()
    if (seen.has(id)) continue
    seen.add(id)
    const next = roles?.fallbacks && Object.hasOwn(roles.fallbacks, id) ? roles.fallbacks[id] : []
    queue.push(...next)
  }
  return canDrawIn(text, [...seen].filter(id => Object.hasOwn(COVERAGE, id)).map(id => COVERAGE[id]))
}
