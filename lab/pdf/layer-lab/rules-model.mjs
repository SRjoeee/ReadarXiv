// lab/pdf/layer-lab/rules-model.mjs
// The rules panel's model (the rules-as-data plan §7): what a field of the layout rule set is worth for a target, where that
// value comes from, how an edit lands, how it is taken back, and how two sets differ. Pure functions over rule sets
// (src/pdf-reader/engine/rules/layout.mjs) and the field descriptions RULES_FIELDS gives; no DOM, no Node module, so that the
// page draws its panel with them and the server (rules-api.mjs) names the fields a save changed with the same words.
//
// A set's rules for a target are its script's with the language's over them, field by field (resolveRules). A field of a
// script may therefore be edited in two places, which the panel's switch chooses between: the language's own (an override,
// reaching that language alone) and the script's (reaching every language of the script that does not override it). An edit
// to the script takes the language's override of that field away, so that the edit is what the target then draws.

const own = (o, k) => o != null && Object.hasOwn(o, k)
const clone = v => (v !== null && typeof v === 'object' ? structuredClone(v) : v)

/** deep equality of two JSON values: objects regardless of their keys' order, `undefined` equal only to itself */
export function same(a, b) {
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  return ka.every(k => own(b, k) && same(a[k], b[k]))
}

const getPath = (set, path) => path.split('.').reduce((o, k) => o?.[k], set)
function setPath(set, path, value) {
  const keys = path.split('.')
  const last = keys.pop()
  keys.reduce((o, k) => o[k], set)[last] = value
}

/** the places a field lives in, for one target: [the script's value, the language's own (undefined: it has none)] for a
 *  script's field; the one value for the others */
function cells(set, field, script, tag) {
  if (field.scope === 'script') return [set.scripts[script][field.path], own(set.languages[tag], field.path) ? set.languages[tag][field.path] : undefined]
  if (field.scope === 'language') return [set.languages[tag][field.path]]
  return [getPath(set, field.path)]
}

/** a field's value for a target: the language's own over the script's */
export function fieldValue(set, field, script, tag) {
  const [base, override] = cells(set, field, script, tag)
  return override === undefined ? base : override
}

/** whether the field differs from `base` anywhere it could be edited for this target: the script's value, the language's own */
export function isEdited(set, base, field, script, tag) {
  return !same(cells(set, field, script, tag), cells(base, field, script, tag))
}

/** where a field's value for a target comes from: an unsaved edit (against `base`, the set last loaded or saved), else the
 *  language, the script, or the set as a whole (a field of no script or language) */
export function sourceOf(set, base, field, script, tag) {
  if (isEdited(set, base, field, script, tag)) return 'edit'
  if (field.scope === 'set') return 'set'
  if (field.scope === 'language') return 'language'
  return own(set.languages[tag], field.path) ? 'language' : 'script'
}

/**
 * The set with one field edited for a target, as a new set. `scope` says where a script's field is written: 'language'
 * (the language's own value) or 'script' (the script's, and the language's own value of it taken away, so that the edit is
 * what the target draws). A language's own field and a set's field have one place each. The value is copied
 */
export function edit(set, field, script, tag, value, scope = 'language') {
  const next = structuredClone(set)
  const v = clone(value)
  if (field.scope === 'script') {
    if (scope === 'script') {
      next.scripts[script][field.path] = v
      delete next.languages[tag][field.path]
    } else next.languages[tag][field.path] = v
  } else if (field.scope === 'language') next.languages[tag][field.path] = v
  else setPath(next, field.path, v)
  return next
}

/** the set with a field taken back to `base`'s, in every place it could be edited for this target */
export function reset(set, base, field, script, tag) {
  const next = structuredClone(set)
  if (field.scope === 'script') {
    next.scripts[script][field.path] = clone(base.scripts[script][field.path])
    if (own(base.languages[tag], field.path)) next.languages[tag][field.path] = clone(base.languages[tag][field.path])
    else delete next.languages[tag][field.path]
  } else if (field.scope === 'language') next.languages[tag][field.path] = clone(base.languages[tag][field.path])
  else setPath(next, field.path, clone(getPath(base, field.path)))
  return next
}

const union = (a, b) => [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])]

/**
 * The fields at which two sets differ, as [{ path, from, to }] (`from` or `to` left out where the set does not have the
 * field: a language's override that is not there). A field is what the panel shows: a set's hyphenation number, a script's
 * field, a language's field (an object field such as adaptiveFill whole), a language that only one set holds whole. The
 * version and the note describe a set and are not fields. Scripts in their order in `a` then `b`, languages by tag
 */
export function diffRules(a, b) {
  const out = []
  const leaf = (path, x, y) => {
    if (same(x, y)) return
    out.push({ path, ...(x !== undefined ? { from: x } : {}), ...(y !== undefined ? { to: y } : {}) })
  }
  leaf('schema', a.schema, b.schema)
  leaf('hyphenation.minWord', a.hyphenation?.minWord, b.hyphenation?.minWord)
  for (const lang of ['en', 'de']) for (const side of ['left', 'right']) leaf(`hyphenation.${lang}.${side}`, a.hyphenation?.[lang]?.[side], b.hyphenation?.[lang]?.[side])
  for (const script of union(a.scripts, b.scripts)) {
    if (!own(a.scripts, script) || !own(b.scripts, script)) { leaf(`scripts.${script}`, a.scripts?.[script], b.scripts?.[script]); continue }
    for (const key of union(a.scripts[script], b.scripts[script])) leaf(`scripts.${script}.${key}`, a.scripts[script][key], b.scripts[script][key])
  }
  for (const tag of union(a.languages, b.languages).sort()) {
    if (!own(a.languages, tag) || !own(b.languages, tag)) { leaf(`languages.${tag}`, a.languages?.[tag], b.languages?.[tag]); continue }
    for (const key of union(a.languages[tag], b.languages[tag])) leaf(`languages.${tag}.${key}`, a.languages[tag][key], b.languages[tag][key])
  }
  return out
}
