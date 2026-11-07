// What a reader translates on a laid page (the reading options' "What to translate", docs/PDF-READER.md §15): five toggles over
// the content classes, a unit's class a pure function of its kind, so that the server and every reader tell it alike. A toggle
// shows or hides what was made, in place: nothing is fetched or translated again. Carried from today's table
// (src/pdf-reader/engine/rules/content-classes.mjs UNIT_CLASS, TOGGLE_DEFAULTS at baf2083e0): `always` and `never` are no toggle.
import type { ClassName } from '../prefs.ts'

/** a unit kind's toggle, or 'always' (the source's body, the generated names, the contents, notes and orphans) */
const TOGGLE_OF: Readonly<Record<string, ClassName>> = {
  cell: 'tables',
  author: 'names',
  // (an author block's places: the names' toggle with its names, the whole block one toggle, the owner's ruling of 2026-10-30)
  affiliation: 'names',
  inknames: 'names',
  figure: 'figures',
  inkfigures: 'figures',
  inkheads: 'heads',
  reference: 'references',
  refnames: 'references',
  inkreferences: 'references',
}

/** each toggle's default, where a reader has set none (the owner's, 2026-10-25): heads, tables and figures on; names and
 *  references off */
export const CLASS_DEFAULTS: Readonly<Record<ClassName, boolean>> = {
  figures: true,
  tables: true,
  heads: true,
  references: false,
  names: false,
}

/** whether a unit of `kind` is shown translated under the toggles `classes` (over the defaults; none: the defaults) */
export function kindShown(kind: string, classes?: Readonly<Partial<Record<ClassName, boolean>>> | null): boolean {
  const toggle = Object.hasOwn(TOGGLE_OF, kind) ? TOGGLE_OF[kind] : undefined
  if (!toggle) return true
  return classes?.[toggle] ?? CLASS_DEFAULTS[toggle]
}

/** two settings of the toggles alike (over the defaults) */
export const sameClasses = (
  a?: Readonly<Partial<Record<ClassName, boolean>>> | null,
  b?: Readonly<Partial<Record<ClassName, boolean>>> | null,
): boolean =>
  (Object.keys(CLASS_DEFAULTS) as ClassName[]).every(
    (k) => (a?.[k] ?? CLASS_DEFAULTS[k]) === (b?.[k] ?? CLASS_DEFAULTS[k]),
  )

/** the unit kinds the toggles `classes` leave the original's (over the defaults): what the typesetter's rules are given to leave
 *  (typeset Rules `leave`, the reader's choices of design-a §1.2), in a stable order */
export function leftKinds(classes?: Readonly<Partial<Record<ClassName, boolean>>> | null): string[] {
  return Object.keys(TOGGLE_OF)
    .filter((kind) => !kindShown(kind, classes))
    .sort()
}
