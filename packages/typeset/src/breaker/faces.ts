// B.faces (design-b §1.5, G2, A4): the face a run of the translation is set in, by the role table (the maintainer's
// ruling of 2026-10-06: faces are the role table's only): a CJK run in its target's CJK family by weight (its slant a shear,
// CJK_SLANT_DEG, the owner's ruling of 2026-10-19); a Latin run in its design's group, math in the math face, small capitals
// in Latin Modern's caps face where the design is Computer Modern's or none; the nearest style of the group that holds the
// target's letters; with its fallbacks and its size correction. Ported from engine 065c1d973: rules/font-roles.mjs
// rolesFor :340-356, faceFor :432-444, styled :403-414, alphabetOf :386-396, LATIN_GROUPS / OTHER_GROUPS / CM_TEXT :358-367,
// LETTERS :370-382, capsLetters :418, ownSmallCaps :423, LATIN_FALLBACKS :331, CJK_GROUPS :190; layer-proto/fonts.mjs
// roleFaceOf :89-100 (faceOf :388 with the role table set), CJK_SLANT_DEG :83; rules/script.mjs scriptOf :11. The catalogue
// (each face's family, weight, style, size, letters, smcp) and the role table's groups, the letters a target is set in and the
// readings over them that keep nothing (styled, capsLetters, ownSmallCaps) are @readarxiv/text's, held once for the engine's
// role table and this (data/faces.ts gives the catalogue's four fields the typesetter reads).
//
// alphabetOf and scriptOf are cached by their argument, as today's are (pure functions of a language tag; computed each call
// they were a third of the typesetter's main-thread time while a paper was scrolled: lane perf-check, 2026-11-12), each by a
// cache of its own (TAGS_CACHED), so rolesFor and faceFor, which read them, stay here beside the engine's. Its inputs: the
// target, the paper's English family (A3, read off page 1) and the target's CJK family (the rule set's `cjkFaces`) ←
// Rules.faces, built by rulesFor.
import {
  ALPHABETS,
  CM_TEXT,
  capsLetters,
  LATIN_FALLBACKS,
  LATIN_GROUPS,
  LETTERS,
  OTHER_GROUPS,
  styled,
  styleOf,
} from '@readarxiv/text'
import { FACES } from '../data/faces.ts'
import type { Face, TStyle } from './tokens.ts'

export { capsLetters, ownSmallCaps } from '@readarxiv/text'

/** the slant of a CJK italic run, degrees (fonts.mjs:83, the owner's ruling of 2026-10-19) */
export const CJK_SLANT_DEG = 13
/** the roles a target draws in (font-roles.mjs rolesFor) */
export type Roles = Readonly<{
  target: string
  family: string
  cjk: Readonly<{ body: string; bold: string }> | null
  fallbacks: Readonly<Record<string, readonly string[]>>
}>
/** a target's CJK family as the rule set gives it (rules/layout.mjs cjkFaces), null for an alphabet */
export type CjkFaces = { group: string } | null | undefined
/** a run as faceFor reads it */
export type Run = {
  script: 'cjk' | 'latin'
  cls: string
  design: string
  bold: boolean
  italic: boolean
  caps: boolean
}

/** the most tags a cache below holds: the tags it is asked are the targets a reader lays (the product's language table, a few
 *  dozen), so it holds one entry a target; past this many (a caller with tags of its own) it computes and keeps nothing more */
export const TAGS_CACHED = 256
/** `f`, a pure function of a language tag, cached by the tag (at most TAGS_CACHED tags) */
function byTag<T>(f: (tag: string) => T): (tag: string) => T {
  const kept = new Map<string, T>()
  return (tag) => {
    if (kept.has(tag)) return kept.get(tag) as T
    const v = f(tag)
    if (kept.size < TAGS_CACHED) kept.set(tag, v)
    return v
  }
}

/** the script a BCP 47 tag is written in: its likely script (rules/script.mjs:11 scriptOf), cached by the tag as today's is */
export const scriptOf = byTag((lang: string): string | undefined => new Intl.Locale(lang).maximize().script)

/** what a target draws in, for a paper's English family and the target's CJK family (font-roles.mjs:340 rolesFor) */
export function rolesFor(target: string, family: string, cjkFaces: CjkFaces): Roles {
  const script = scriptOf(target)
  let cjk: Roles['cjk'] = null
  const fallbacks: Record<string, readonly string[]> = { ...LATIN_FALLBACKS }
  if (cjkFaces) {
    const { group } = cjkFaces
    cjk = { body: `${group}-regular`, bold: `${group}-bold` }
    if (script === 'Hant')
      for (const w of ['regular', 'medium', 'bold'] as const) fallbacks[`shs-tc-${w}`] = Object.freeze([`shs-sc-${w}`])
  } else if (!ALPHABETS.has(script ?? '')) throw new Error(`no font roles for ${target} (script ${script}) yet`)
  return Object.freeze({ target, family, cjk: cjk && Object.freeze(cjk), fallbacks: Object.freeze(fallbacks) })
}

/** the alphabet a target's letters are: its language's own, else its script's (font-roles.mjs:386 alphabetOf), cached by the
 *  target as today's is */
export const alphabetOf = byTag((target: string): string => {
  const language = new Intl.Locale(target).language
  return Object.hasOwn(LETTERS, language) ? language : scriptOf(target) === 'Cyrl' ? 'Cyrl' : 'Latn'
})

/** the face a run is drawn in (font-roles.mjs:432 faceFor) */
function faceFor(roles: Roles, run: Run): string | null {
  const c = roles.cjk
  if (run.script === 'cjk' && c) return run.bold ? c.bold : c.body
  if (run.cls === 'math') return 'lm-math'
  const cyrillic = scriptOf(roles.target) === 'Cyrl' ? 1 : 0
  const groups = Object.hasOwn(LATIN_GROUPS, run.design)
    ? LATIN_GROUPS[run.design]!
    : Object.hasOwn(OTHER_GROUPS, run.cls)
      ? OTHER_GROUPS[run.cls]!
      : OTHER_GROUPS.serif!
  const column = groups[cyrillic]!
  const group = typeof column === 'string' ? column : column[styleOf(run.bold, run.italic)]!
  if (run.caps && !run.bold && !cyrillic && (group === 'lm-roman' || column === CM_TEXT))
    return run.italic ? 'lm-roman-caps-italic' : 'lm-roman-caps'
  return styled(group, run.bold, run.italic, alphabetOf(roles.target))
}

/** B.faces: the face a run of style `st` and script class `cls` is set in, with its fallbacks, its slant and its size
 *  correction (fonts.mjs:89 roleFaceOf) */
export function faceOf(roles: Roles, st: TStyle, cls: 'cjk' | 'latin'): Face {
  const run: Run = {
    script: cls,
    cls: st.fam === 'math' ? 'serif' : st.fam!,
    design: st.design ?? 'times',
    bold: !!st.bold,
    italic: !!st.italic,
    caps: !!st.caps,
  }
  const id = faceFor(roles, run)!
  const F = FACES[id]!
  const latin =
    cls === 'cjk' && roles.cjk ? [faceFor(roles, { ...run, script: 'latin', italic: false, caps: false })!] : []
  const ids = [
    ...new Set([id, ...(roles.fallbacks[id] ?? []), ...(cls !== 'cjk' && roles.cjk ? [roles.cjk.body] : []), ...latin]),
  ].filter((f) => Object.hasOwn(FACES, f))
  const slant = cls === 'cjk' && !!st.italic && !!roles.cjk
  return {
    family: [...new Set(ids.map((f) => `"${FACES[f]!.family}"`))].join(', '),
    weight: F.weight,
    style: F.style,
    oblique: slant ? CJK_SLANT_DEG : 0,
    stand: st.italic ? (cls === 'cjk' ? (slant ? 'oblique' : '') : 'italic') : '',
    caps: !!st.caps && cls !== 'cjk' && !capsLetters(id),
    size: F.size ?? 1,
    id,
    ids,
  }
}
