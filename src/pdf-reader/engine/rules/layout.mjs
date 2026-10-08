// src/pdf-reader/engine/rules/layout.mjs
// The instant layer's layout rules as data (the rules-as-data plan of 2026-10-08, §2). Every typographic value v0 sets a
// translation by that differs by target (the fit's parameters, how a line breaks, what a float's label is called, which
// patterns a Latin word hyphenates by, the CJK family a script is drawn in) is one versioned, schema-validated file,
// layout-rules.json, which both readers take as input and the engine reads by name: its fields are v0's own Params keys,
// with no mapping layer between the file and the engine. A change of a value raises the file's `version`; a change of
// the schema (a field added, removed, renamed, a range or an enumeration changed, or the engine reading a field
// differently) raises RULES_SCHEMA. What only changes the pixels a reader draws from the same bundle and the same rows
// is a layout rule and lives here; the units, the translation and the files our server makes do not (plan §1).
//
// The set is configuration in a closed vocabulary: numbers, booleans, enumerations and short lists of characters. No
// regular expression, selector or code is data; kinsoku, for one, is a list of characters from which the engine builds
// its own class, escaped. A set read from bytes is untrusted and refused as a whole, naming the field, never partly used:
// its size, UTF-8, the values it holds counted before JSON.parse, then its shape (strict at every level), every number
// within the field's safety range (wider than any tuning), every string free of controls, and the cross-checks against
// the face catalog. A set is fixed for a run: one published mid-visit applies at the next open.
//
// What stays code (plan §2.4): the face catalog (font-roles.mjs FACES) and its Latin design table, the recognition of the
// original's fonts, the prototype's system faces, the measurement thresholds, the CJK em box, character classes, the
// policies by unit kind. A face must exist as served slices before any rule can name it.
//
// The built-in set is the file beside this module. Its first version is the engine's own values as they were before the
// migration, unchanged; the float labels are babel's [captions] (babel 26.12, TeX Live's locale files in
// texlive/texlive:latest, sha256:7334b00bf8e7a0996f7ddd65482363aaf7711d372e569f3ea78509619e3083ff): the \figurename and
// \tablename the final's \babelprovide prints, zh-TW's from babel's zh-Hant.
//
// Only this directory imports a package (zod, the mini build): the readers' bundles take the validator once, here. The
// engine's drawing modules import resolveRules' answers, never the schema.
import * as z from 'zod/mini'
import { ENGLISH_FAMILIES, FACES } from './font-roles.mjs'
import { scriptOf } from './script.mjs'
import { countValues, LayoutRefusal, told } from '../layout/json.mjs'
import BUILTIN_JSON from './layout-rules.json' with { type: 'json' }

/** the schema's number: the shape and how the engine reads it. 2 (D6, 2026-10-08): `grid` gone (every script's lines on the
 *  original's pitch while the size shrinks); `adaptiveFill` read for every original, its page's target held near the last
 *  page's and one size a page; `fillLead` and `leftover` added */
export const RULES_SCHEMA = 2
/** a set's bytes at most, as received (the migrated set is about 8 KB) */
export const RULES_CAP = 65_536
/** a set's JSON values at most, counted before JSON.parse (layout/json.mjs countValues) */
export const RULES_VALUES = 20_000
/** a set nests at most this deep (its deepest field: scripts.<script>.cjkFaces.light) */
const DEPTH_MAX = 8
/** the targets either reader offers, each of which must resolve or the set is refused: the web's eight and Portuguese, which the
 *  extension's reader also typesets (session/verified.mjs VERIFIED, compared by language and script: the extension's tag for Traditional
 *  Chinese is zh-TW). A test holds that every VERIFIED language is here */
export const TARGETS = Object.freeze(['zh', 'zh-TW', 'ja', 'ko', 'de', 'fr', 'es', 'ru', 'pt'])
export const SCRIPTS = Object.freeze(['Hans', 'Hant', 'Jpan', 'Kore', 'Latn', 'Cyrl'])
/** the scripts whose text is set by CJK rules (cjk in the fit's parameters); each must name its CJK faces */
const CJK_SCRIPTS = new Set(['Hans', 'Hant', 'Jpan', 'Kore'])
const ORDER = Object.freeze(['track', 'borrow', 'lead', 'shrink'])
const FURTHER = Object.freeze(['widen', 'flow', 'shrink'])
const LEFTOVER = Object.freeze(['foot', 'pack'])
/** the weights of a CJK group the role table builds its roles from (font-roles.mjs rolesFor) */
const GROUP_WEIGHTS = Object.freeze(['light', 'regular', 'semibold', 'bold'])
const NOTE_MAX = 1000
const LABEL_MAX = 32
const CHARS_MAX = 256

/** a set refused: the field (a dotted path in the set, or the bytes' own: bytes, utf8, values, etag, json) and why. The
 *  field is safe to show: a key of the file's own is escaped and cut as layout/json.mjs told does */
export class RulesRefusal extends Error {
  constructor(field, why) {
    super(`${field}: ${why}`)
    this.name = 'RulesRefusal'
    this.field = field
    this.why = why
  }
}

// ---- the schema

/** a C0 or C1 control (general category Cc), or a bidirectional control (U+061C, U+200E, U+200F, U+202A to U+202E, U+2066
 *  to U+2069: Unicode's property, not a list): a string a reader draws or a rule names is text */
const CONTROL = /\p{Cc}|\p{Bidi_Control}/u
/** a letter or a digit, but the kana, their iteration marks and the prolonged sound mark (letters by Unicode and kinsoku's
 *  own characters): a line may start and end with every other letter, so none is listed */
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u
const KINSOKU_LETTER = /[\p{Lm}\p{sc=Hiragana}\p{sc=Katakana}]/u
/** a BCP 47 tag's shape (language, then up to three subtags): what a key of `languages` may be, and never `__proto__` */
const TAG = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/

const noControls = z.refine(s => !CONTROL.test(s), 'a control or bidirectional control character')
/** a string of at most `max` code units, free of controls */
const text = max => z.string().check(z.maxLength(max), noControls)
/** a list of characters of at most CHARS_MAX code points: none a letter or a digit */
const characters = () => z.string().check(
  noControls,
  z.refine(s => [...s].length <= CHARS_MAX, `more than ${CHARS_MAX} characters`),
  z.refine(s => [...s].every(ch => !LETTER_OR_DIGIT.test(ch) || KINSOKU_LETTER.test(ch)), 'a letter or a digit'),
)
const range = (lo, hi) => z.number().check(z.gte(lo), z.lte(hi))
const integer = (lo, hi) => z.int().check(z.gte(lo), z.lte(hi))
const isPermutation = a => a.length === ORDER.length && ORDER.every(k => a.includes(k))
/** the elements of FURTHER, in its order, each once or not at all */
const isSubsetInOrder = a => { let at = -1; return a.every(k => { const i = FURTHER.indexOf(k); return i > at && (at = i, true) }) }

/**
 * Every field of a script's rules, in the file's order, once: its key, the group the lab shows it in, its kind, a line of
 * words, its range or values and step where it has them, and the schema. The schema, the canonical file and RULES_FIELDS
 * are all built from this table: one declaration of a field.
 */
const SCRIPT_FIELDS = [
  // the fit (layer2.mjs layoutUnit2, statesOf; run.mjs fitFurther, fillPage). Each value is a prior from the public
  // repo's typesetting research, swept on the layer. Step 3's further steps took the gate's 29 outputs' clipped
  // characters from 943 to 140 (widen 100, flow 138, the size 465), most of them below the floor, at 0.775
  { key: 'order', group: 'fit', kind: 'order', values: ORDER, words: 'The order in which the fit turns its knobs when a translation does not fit: tracking, borrowing free space below, the leading, the size.', schema: () => z.array(z.enum(ORDER)).check(z.refine(isPermutation, 'not an ordering of the four knobs')) },
  { key: 'leadBase', group: 'fit', kind: 'number', min: 0.8, max: 2, step: 0.05, words: "The translation's line pitch, × the original's line pitch.", schema: () => range(0.8, 2) },
  { key: 'leadFloor', group: 'fit', kind: 'number', min: 0.8, max: 2, step: 0.05, words: 'The tightest line pitch the fit falls back to, × the original\'s.', schema: () => range(0.8, 2) },
  // (leadRel false: the maintainer's ruling of 2026-10-07 on S3-11, the script's leading on the original's own pitch, which
  // reads more naturally on a loose original than the relative leading that stays a switch)
  { key: 'leadRel', group: 'fit', kind: 'boolean', words: "Whether the leading is taken relative to the original's own pitch (never stacked on a loose original's) or applied as it is.", schema: () => z.boolean() },
  { key: 'trackMin', group: 'fit', kind: 'number', min: -0.3, max: 0, step: 0.005, words: 'The tightest letter spacing the fit uses, in em (zero or less).', schema: () => range(-0.3, 0) },
  { key: 'trackStart', group: 'fit', kind: 'number', nullable: true, min: -0.3, max: 0.3, step: 0.005, words: "The letter spacing the fit starts from, in em; empty gives back the face's size correction.", schema: () => z.nullable(range(-0.3, 0.3)) },
  { key: 'compressMax', group: 'fit', kind: 'enum', values: [0, 1, 2], words: "How far full-width punctuation is compressed: 0 not at all, 1 at a line's start and between two marks, 2 every mark.", schema: () => z.literal([0, 1, 2]) },
  { key: 'centredPunct', group: 'fit', kind: 'boolean', words: 'Whether punctuation is centred in its em box (Traditional Chinese): no mark is then compressed or hung.', schema: () => z.boolean() },
  { key: 'borrow', group: 'fit', kind: 'enum', values: [0, 1], words: 'Whether a unit may borrow the free space below its last line (1) or not (0).', schema: () => z.literal([0, 1]) },
  { key: 'borrowGap', group: 'fit', kind: 'number', min: 0, max: 2, step: 0.05, words: "The gap kept clear under borrowed space, × the original's line pitch.", schema: () => range(0, 2) },
  { key: 'floor', group: 'fit', kind: 'number', min: 0.4, max: 1, step: 0.05, words: "The smallest size the fit sets a unit at, × the original's size.", schema: () => range(0.4, 1) },
  { key: 'step', group: 'fit', kind: 'number', min: 0.01, max: 0.1, step: 0.005, words: "The size step between the fit's tries, × the original's size.", schema: () => range(0.01, 0.1) },
  { key: 'further', group: 'fit', kind: 'subset', values: FURTHER, words: 'The steps tried, in order, for a unit the fit leaves clipped: widen its lines, flow past a kept region, shrink below the floor.', schema: () => z.array(z.enum(FURTHER)).check(z.refine(isSubsetInOrder, 'not a subset of widen, flow, shrink in that order')) },
  { key: 'floorMin', group: 'fit', kind: 'number', min: 0.3, max: 1, step: 0.05, words: "The smallest size the last of those steps reaches, × the original's size.", schema: () => range(0.3, 1) },
  { key: 'cjkJust', group: 'fit', kind: 'number', min: 0, max: 1, step: 0.01, words: 'The most a line may open between CJK characters to justify, in em a gap.', schema: () => range(0, 1) },
  { key: 'spaceMin', group: 'fit', kind: 'number', min: 0.3, max: 1, step: 0.05, words: 'The least a word space shrinks to, × its natural width.', schema: () => range(0.3, 1) },
  { key: 'spaceMax', group: 'fit', kind: 'number', min: 0, max: 3, step: 0.05, words: 'The most a word space opens to justify a line, × its natural width.', schema: () => range(0, 3) },
  { key: 'autospace', group: 'fit', kind: 'number', min: 0, max: 1, step: 0.05, words: 'The space set between CJK text and Latin letters or digits, in em.', schema: () => range(0, 1) },
  { key: 'even', group: 'fit', kind: 'enum', values: [0, 1, 2], words: "How a page's body units are set alike: 0 each at its own, 1 at one size, 2 at one size and one leading.", schema: () => z.literal([0, 1, 2]) },
  { key: 'fillSize', group: 'fit', kind: 'number', min: 0, max: 1.5, step: 0.05, words: "How far a unit's size may grow to fill a loose original's paragraph, × the original's size; 0 is off.", schema: () => range(0, 1.5) },
  // (adaptiveFill on: the maintainer's choice of 2026-10-07 on S3-12, D, as measured there; null is B, the script's leading
  // on the original's pitch alone)
  {
    key: 'adaptiveFill', group: 'fit', kind: 'object', nullable: true,
    members: [
      { key: 'band', min: 0, max: 0.5, step: 0.01, words: "how far above the page's target a unit's fill leading may stand, and the page's target from the last page's" },
      { key: 'track', min: 0, max: 0.2, step: 0.01, words: 'the letter spacing a unit short of its fill may take, in em' },
      { key: 'size', min: 1, max: 1.5, step: 0.05, words: "the one size a page's body units may then grow to, × the original's" },
    ],
    words: "Spreading each unit's lines over its original's space, the page's body units to one leading near the last page's and one size (D6); empty keeps the script's leading on the original's pitch alone (B).",
    schema: () => z.nullable(z.strictObject({ band: range(0, 0.5), track: range(0, 0.2), size: range(1, 1.5) })),
  },
  // (D6's F6b, 2026-10-08: the top of a unit's fill leading, which replaced the script's leading on the original's pitch;
  // in em of the size drawn, so that a shrunk unit is spread no looser for its size than one set at the full size)
  { key: 'fillLead', group: 'fit', kind: 'number', nullable: true, min: 1, max: 3, step: 0.05, words: "The loosest line pitch the fill spreads a unit's lines to, in em of the size it is drawn at; empty: the original's own pitch.", schema: () => z.nullable(range(1, 3)) },
  // (D6's F6c, 2026-10-08: built switchable, for the maintainer to decide by looking; 'foot' is what the fill left before)
  { key: 'leftover', group: 'fit', kind: 'enum', values: LEFTOVER, words: "Where what the fill leaves over goes: at each paragraph's foot, or packed to the end of its run of paragraphs, each keeping the original's gap to the one above it.", schema: () => z.literal([...LEFTOVER]) },
  // breaking (layer2.mjs tokensOf2, placeItems; layer1.mjs kinsokuOf)
  { key: 'keepAll', group: 'breaking', kind: 'boolean', words: 'Whether lines break only at spaces (Korean and the alphabets) rather than between any two CJK characters.', schema: () => z.boolean() },
  { key: 'cjkQuotes', group: 'breaking', kind: 'boolean', words: 'Whether curly quotes, dashes, the ellipsis and the middle dot are set as CJK characters.', schema: () => z.boolean() },
  { key: 'noStart', group: 'breaking', kind: 'chars', words: 'The characters no line starts with.', schema: characters },
  { key: 'noEnd', group: 'breaking', kind: 'chars', words: 'The characters no line ends with.', schema: characters },
  { key: 'hyphen', group: 'breaking', kind: 'enum', values: [0, 1], words: "Whether a Latin word is hyphenated at a line's end (1) or not (0).", schema: () => z.literal([0, 1]) },
  { key: 'latinPatterns', group: 'breaking', kind: 'enum', values: ['en', 'de'], words: 'The hyphenation patterns a Latin word uses.', schema: () => z.literal(['en', 'de']) },
  // table cells (layer2.mjs cellBands)
  { key: 'cellClear', group: 'cells', kind: 'number', min: 0, max: 5, step: 0.1, words: "The room kept between a table cell's text and a rule over or under it, in PDF units.", schema: () => range(0, 5) },
  { key: 'cellCapMin', group: 'cells', kind: 'number', min: 0.3, max: 1, step: 0.05, words: "The smallest share of the size a cell's text may be capped to between its rules.", schema: () => range(0.3, 1) },
  // faces (font-roles.mjs rolesFor)
  {
    key: 'cjkFaces', group: 'faces', kind: 'object', nullable: true,
    members: [
      { key: 'group', kind: 'text', words: 'the CJK font group' },
      { key: 'kai', kind: 'text', nullable: true, words: 'its Kai for emphasis; empty sets emphasis upright' },
      { key: 'light', kind: 'list', words: 'the English designs beside which it takes the light weights' },
    ],
    words: 'The CJK family the script is drawn in; empty for an alphabet.',
    schema: () => z.nullable(z.strictObject({ group: text(64), kai: z.nullable(text(64)), light: z.array(text(32)).check(z.maxLength(16)) })),
  },
]
const SCRIPT_KEYS = Object.freeze(SCRIPT_FIELDS.map(f => f.key))

const LABELS = z.nullable(z.strictObject({ figure: text(LABEL_MAX), table: text(LABEL_MAX) }))
const SCRIPT_RULES = z.strictObject(Object.fromEntries(SCRIPT_FIELDS.map(f => [f.key, f.schema()])))
const LANGUAGE_RULES = z.strictObject({ labels: LABELS, ...Object.fromEntries(SCRIPT_FIELDS.map(f => [f.key, z.optional(f.schema())])) })
const SIDES = z.strictObject({ left: integer(1, 6), right: integer(1, 6) })
const HYPHENATION = z.strictObject({ minWord: integer(2, 20), en: SIDES, de: SIDES })

/** the rule set's schema, strict at every level: an unknown key anywhere is another schema's */
export const RULE_SET = z.strictObject({
  schema: z.literal(RULES_SCHEMA),
  version: z.int().check(z.gte(1)),
  note: text(NOTE_MAX),
  hyphenation: HYPHENATION,
  scripts: z.strictObject(Object.fromEntries(SCRIPTS.map(s => [s, SCRIPT_RULES]))),
  languages: z.record(z.string().check(z.regex(TAG)), LANGUAGE_RULES),
})

/**
 * Each field the lab shows: its `path` (a key of ScriptRules for a script's field, which a language may override; `labels`
 * for a language's own; a dotted path in the set for the set-wide hyphenation), its `scope`, its `group`, its `kind` and
 * range, values or members, and a line of `words`.
 */
export const RULES_FIELDS = Object.freeze([
  ...SCRIPT_FIELDS.map(({ key, schema: _, ...f }) => Object.freeze({ path: key, scope: 'script', ...f })),
  Object.freeze({ path: 'labels', scope: 'language', group: 'labels', kind: 'object', nullable: true, members: Object.freeze([{ key: 'figure', kind: 'text', words: "a figure's name" }, { key: 'table', kind: 'text', words: "a table's name" }]), words: "A float's label in this language's words; empty keeps each label as the original's." }),
  Object.freeze({ path: 'hyphenation.minWord', scope: 'set', group: 'hyphenation', kind: 'integer', min: 2, max: 20, step: 1, words: 'The shortest word, in letters, that is hyphenated.' }),
  Object.freeze({ path: 'hyphenation.en.left', scope: 'set', group: 'hyphenation', kind: 'integer', min: 1, max: 6, step: 1, words: 'The fewest letters English leaves before a hyphen.' }),
  Object.freeze({ path: 'hyphenation.en.right', scope: 'set', group: 'hyphenation', kind: 'integer', min: 1, max: 6, step: 1, words: 'The fewest letters English leaves after a hyphen.' }),
  Object.freeze({ path: 'hyphenation.de.left', scope: 'set', group: 'hyphenation', kind: 'integer', min: 1, max: 6, step: 1, words: 'The fewest letters German leaves before a hyphen.' }),
  Object.freeze({ path: 'hyphenation.de.right', scope: 'set', group: 'hyphenation', kind: 'integer', min: 1, max: 6, step: 1, words: 'The fewest letters German leaves after a hyphen.' }),
])

// ---- reading

/** the origins of a zod issue that are bounds of a number */
const NUMERIC = new Set(['number', 'int'])
/** what a value is, as a refusal names it: its type, never the value */
const kindOf = v => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'number' && Number.isNaN(v) ? 'NaN' : typeof v)
/** the value at an issue's path in the JSON it was found in (undefined where the path leads nowhere) */
function valueAt(json, path) {
  let v = json
  for (const k of path) {
    if (v === null || typeof v !== 'object' || !Object.hasOwn(v, k)) return undefined
    v = v[k]
  }
  return v
}
/** why a zod issue refuses its value, in the words of the rule broken. The default message of zod/mini names nothing; a
 *  wrong type is named by its type and what was expected, never converted */
function whyOf(issue, json) {
  switch (issue.code) {
    case 'invalid_type': { const v = valueAt(json, issue.path); return v === undefined ? `${issue.expected} missing` : `${issue.expected}, not ${kindOf(v)}` }
    // (an integer's bound is reported with the origin `int`: it is a bound of a number all the same, never of a length)
    case 'too_small': return NUMERIC.has(issue.origin) ? `below ${issue.minimum}` : issue.origin === 'array' ? `fewer than ${issue.minimum} items` : `shorter than ${issue.minimum}`
    case 'too_big': return NUMERIC.has(issue.origin) ? `above ${issue.maximum}` : issue.origin === 'array' ? `more than ${issue.maximum} items` : `more than ${issue.maximum} characters`
    case 'invalid_value': return `not one of ${issue.values.map(v => JSON.stringify(v)).join(', ')}`
    case 'invalid_key': return 'not a key the schema allows (a language is a BCP 47 tag)'
    case 'unrecognized_keys': return 'not a key of the schema'
    default: return issue.message
  }
}
/** a zod issue as a refusal: its path as the field (a key of the file's own escaped), the first unknown key named */
function refusalOf(issue, json) {
  const path = issue.path.map(k => (typeof k === 'string' ? told(k) : String(k)))
  if (issue.code === 'unrecognized_keys') path.push(told(issue.keys[0]))
  return new RulesRefusal(path.join('.') || 'set', whyOf(issue, json))
}

/** the cross-checks a shape cannot make: the faces a rule names are the catalog's; a CJK script (and a language of one) names
 *  its CJK faces and an alphabetic one takes none, so that no alphabetic target is ever drawn in a CJK face; every target
 *  resolves; and every language is a tag whose script is one the set has rules for, so that a set is refused when it is read
 *  and never when a target is resolved */
function crossChecks(set) {
  const checkFaces = (faces, at, cjk) => {
    if (faces === null) {
      if (cjk) throw new RulesRefusal(`${at}.cjkFaces`, 'a CJK script names its CJK faces')
      return
    }
    if (!cjk) throw new RulesRefusal(`${at}.cjkFaces`, 'an alphabetic script takes no CJK faces')
    if (!GROUP_WEIGHTS.every(w => Object.hasOwn(FACES, `${faces.group}-${w}`))) throw new RulesRefusal(`${at}.cjkFaces.group`, 'not a group of the face catalog')
    if (faces.kai !== null && !Object.hasOwn(FACES, faces.kai)) throw new RulesRefusal(`${at}.cjkFaces.kai`, 'not a face of the catalog')
    faces.light.forEach((design, i) => { if (!ENGLISH_FAMILIES.includes(design)) throw new RulesRefusal(`${at}.cjkFaces.light.${i}`, 'not an English design') })
  }
  for (const script of SCRIPTS) checkFaces(set.scripts[script].cjkFaces, `scripts.${script}`, CJK_SCRIPTS.has(script))
  for (const target of TARGETS) if (!Object.hasOwn(set.languages, target)) throw new RulesRefusal(`languages.${target}`, 'missing: a target every reader offers')
  for (const [tag, lang] of Object.entries(set.languages)) {
    const at = `languages.${told(tag)}`
    let script
    try { script = scriptOf(tag) } catch { throw new RulesRefusal(at, 'not a language tag') }
    if (!SCRIPTS.includes(script)) throw new RulesRefusal(at, 'a language of a script the set has no rules for')
    if (Object.hasOwn(lang, 'cjkFaces')) checkFaces(lang.cjkFaces, at, CJK_SCRIPTS.has(script))
  }
}

/** parsed JSON as a set: the language keys, RULE_SET, then the cross-checks; a RulesRefusal naming the field of the first
 *  that fails. The keys of `languages` are read here first: a validator's record skips a key of the prototype's name
 *  silently (JSON.parse makes it an own key), and a set is refused, never partly used */
export function parseRules(json) {
  const languages = json !== null && typeof json === 'object' ? json.languages : null
  if (languages !== null && typeof languages === 'object' && !Array.isArray(languages)) {
    for (const key of Object.keys(languages)) if (!TAG.test(key)) throw new RulesRefusal(`languages.${told(key)}`, 'not a language tag')
  }
  const r = z.safeParse(RULE_SET, json)
  if (!r.success) throw refusalOf(r.error.issues[0], json)
  crossChecks(r.data)
  return r.data
}

const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
/**
 * A set's bytes as the set and their SHA-256 (lowercase hex), in the order of refusal: more than RULES_CAP bytes, an `etag`
 * (the server's "<sha256>", or W/"<sha256>": a CDN may weaken a strong tag when it recodes the body, and the digest is
 * of the decoded body either way) that is not the bytes' digest, malformed UTF-8, more than RULES_VALUES values (or nested
 * deeper than a set goes) counted before JSON.parse is called, text that is not JSON, then parseRules'. A refused set is
 * never partly used
 */
export async function readRules(bytes, { etag = null } = {}) {
  if (!(bytes instanceof Uint8Array)) throw new RulesRefusal('bytes', `bytes, not ${bytes === null ? 'null' : typeof bytes}`)
  if (bytes.length > RULES_CAP) throw new RulesRefusal('bytes', `${bytes.length} bytes, more than ${RULES_CAP}`)
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new RulesRefusal('etag', 'no Web Crypto to take the digest with')
  const sha256 = hex(new Uint8Array(await subtle.digest('SHA-256', bytes)))
  if (etag !== null && etag !== undefined && !(typeof etag === 'string' && (etag === `W/"${sha256}"` || etag.toLowerCase() === `"${sha256}"`))) throw new RulesRefusal('etag', "not the bytes' digest")
  let source
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { throw new RulesRefusal('utf8', 'malformed UTF-8') }
  let values
  try { values = countValues(source, RULES_VALUES, DEPTH_MAX) } catch (e) {
    if (e instanceof LayoutRefusal) throw new RulesRefusal('values', `nested more than ${DEPTH_MAX} deep`)
    throw e
  }
  if (values > RULES_VALUES) throw new RulesRefusal('values', `more than ${RULES_VALUES} values`)
  let json
  try { json = JSON.parse(source) } catch { throw new RulesRefusal('json', 'not JSON') }
  return { set: parseRules(json), sha256 }
}

// ---- resolving

const copy = v => (v !== null && typeof v === 'object' ? structuredClone(v) : v)

/**
 * One target's rules as v0 reads them: the script's fields (`scriptOf`, Intl.Locale maximized: zh-TW is Hant) with the
 * language's over them, field by field; an object field (adaptiveFill, cjkFaces, labels) is replaced whole, never merged.
 * `params` are v0's own Params: every fit, breaking and cell field, `cjk` from the script, and the set's hyphenation
 * minimums; fresh objects each call, a run may change its own. `patterns` are the hyphenation patterns to load: English's
 * for every target's Latin words, the language's own where `latinPatterns` names one, and Russian's for Cyrillic. Throws
 * for a target `languages` lacks, or a script the set has no rules for
 */
export function resolveRules(set, target) {
  if (typeof target !== 'string' || !Object.hasOwn(set.languages, target)) throw new RulesRefusal(`languages.${told(target)}`, 'no rules for this target')
  const script = scriptOf(target)
  if (!Object.hasOwn(set.scripts, script)) throw new RulesRefusal(`scripts.${told(script)}`, 'no rules for this script')
  const base = set.scripts[script], lang = set.languages[target]
  const field = key => copy(Object.hasOwn(lang, key) ? lang[key] : base[key])
  const params = { cjk: CJK_SCRIPTS.has(script) }
  for (const key of SCRIPT_KEYS) if (key !== 'cjkFaces') params[key] = field(key)
  const hyphenation = copy(set.hyphenation)
  params.hyphenation = hyphenation
  const patterns = ['en']
  if (params.latinPatterns !== 'en') patterns.push(params.latinPatterns)
  if (script === 'Cyrl') patterns.push('ru')
  return { target, script, params, labels: copy(lang.labels), patterns, hyphenation, cjkFaces: field('cjkFaces'), version: set.version }
}

// ---- writing

/** a value on one line: an array or a short object (a field's own members) as the canonical file writes it */
const flat = v => (Array.isArray(v) ? `[${v.map(flat).join(', ')}]` : v !== null && typeof v === 'object' ? `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${flat(x)}`).join(', ')} }` : JSON.stringify(v))
const inOrder = (obj, keys) => Object.fromEntries(keys.filter(k => Object.hasOwn(obj, k)).map(k => [k, obj[k]]))
/** the members of an object field, in the order the file writes them */
const MEMBERS = Object.fromEntries([...SCRIPT_FIELDS, { key: 'labels', members: [{ key: 'figure' }, { key: 'table' }] }].filter(f => f.members).map(f => [f.key, f.members.map(m => m.key)]))
/**
 * The canonical bytes of a set, as text: keys in RULE_SET's order (the languages by tag), one field a line, LF, a final
 * newline. The file is always in this form, so that a changed value is one line of a diff. A field holding an object
 * (adaptiveFill, cjkFaces, labels) and an array are written on its line
 */
export function writeRules(set) {
  const pad = n => '  '.repeat(n)
  const entry = (n, key, value) => `${pad(n)}${JSON.stringify(key)}: ${value}`
  const block = (entries, n) => `{\n${entries.join(',\n')}\n${pad(n)}}`
  const fields = (rules, keys, n) => keys.filter(k => Object.hasOwn(rules, k)).map(k => entry(n, k, flat(MEMBERS[k] && rules[k] !== null ? inOrder(rules[k], MEMBERS[k]) : rules[k])))
  const sides = side => flat(inOrder(side, ['left', 'right']))
  const h = set.hyphenation
  const root = [
    entry(1, 'schema', flat(set.schema)),
    entry(1, 'version', flat(set.version)),
    entry(1, 'note', flat(set.note)),
    entry(1, 'hyphenation', block([entry(2, 'minWord', flat(h.minWord)), entry(2, 'en', sides(h.en)), entry(2, 'de', sides(h.de))], 1)),
    entry(1, 'scripts', block(SCRIPTS.map(script => entry(2, script, block(fields(set.scripts[script], SCRIPT_KEYS, 3), 2))), 1)),
    entry(1, 'languages', block(Object.keys(set.languages).sort().map(tag => entry(2, tag, block(fields(set.languages[tag], ['labels', ...SCRIPT_KEYS], 3), 2))), 1)),
  ]
  return `${block(root, 0)}\n`
}

/** the built-in set: layout-rules.json, parsed (and refused if it is not a set) at import, then frozen */
export const BUILTIN_RULES = (function freeze(v) {
  if (v !== null && typeof v === 'object') for (const x of Object.values(v)) freeze(x)
  return Object.freeze(v)
})(parseRules(BUILTIN_JSON))
