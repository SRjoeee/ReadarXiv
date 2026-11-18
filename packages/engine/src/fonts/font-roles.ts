// The font role table: for each target and English family, the face file each role is drawn in, the same files in both
// renderers — the TeX path sets them, the instant layer draws in web fonts made from them (spec §4.4, under the
// maintainer's rulings of 2026-10-06, §1.3). One rendering on every device: every face is a file we serve, TeX Live's or
// an upstream release's, under a family name of ours; none is a face the reader's device holds, and nothing here names
// a generic family. A character no face of a run's role holds keeps its unit the original's (canDraw).
//
// Which face a target takes is one rule in two tiers (the maintainer, 2026-10-06), and it governs every target to come:
// - Tier 1, the scripts the paper's Western families are drawn for (Latin, Greek, Cyrillic, Vietnamese): the original's
//   own family, its same glyphs where a source has them, from the cleanest source of them. Today, measured against what
//   arXiv's PDFs embed: Times → Nimbus Roman and Helvetica → Nimbus Sans (URW's base 35 release: 62 and 53-62 of 62
//   glyphs the same; GNU FreeSerif and FreeSans are 3-24 and 13-26, their advances reworked), Courier → GNU FreeMono
//   (57-60 of 62 at the original's weight; its bold oblique 32), Computer Modern → CMU (its text 62 of 62; Latin Modern
//   for its bold italic, small capitals, sans and typewriter, nearer CM's), Palatino → Domitian (URW's P052 glyphs under
//   the OFL), and each other family its own files. Where the family lacks a script a target needs, its unit stays the
//   original's until a source of that family has it: Nimbus Roman, Nimbus Sans and Domitian hold 12 of Vietnamese's 104
//   letters and no polytonic Greek, which CMU, FreeSerif, FreeSans and FreeMono hold whole.
// - Tier 2, the scripts no Western family covers well (CJK, Arabic, Hebrew, the Indic scripts, Thai and the rest): the
//   Noto superfamily, one design per script. Source Han Serif is Noto Serif CJK: zh, zh-Hant and ko in Source Han Serif
//   SC, TC and K, ja in Harano Aji Mincho (Source Han Serif JP), at Regular beside every English family and its real bold,
//   Bold, for bold and headings, as the original's serif bold (the maintainer's ruling of 2026-10-29: Light, and SemiBold
//   for its bold, beside Computer Modern and Garamond read lighter than the page, docs/PDF-READER.md §18.1); Korean's
//   Hangul at the size of the family's ideographs (Face.size). Emphasis
//   is that same face slanted (the owner's ruling of 2026-10-19: a shear the layer draws, layer-proto/fonts.mjs
//   CJK_SLANT_DEG), in every CJK target alike; no Kai. GNU FreeFont's own Arabic, Indic and Thai glyphs are not taken for
//   Tier 2: their styles are not one design.
//
// Also the names behind both renderers' reading of a paper's fonts: each design's NFSS family names (the TeX path's
// font probe, familyOfProbe) and its PostScript names (a PDF's fonts, classifyFont and familyOfFonts), in one table.
//
// Moved whole from today's engine (src/pdf-reader/engine/rules/font-roles.mjs), typed; the website builds the faces it serves
// from it (FACES, with font-coverage.ts), and its old path re-exports it until the cut-over deletes that path.
//
// The face catalogue, the names' reading and the roles' tables are @readarxiv/text's (font-faces.ts, font-classes.ts),
// which the typesetter reads too: this module keeps the engine's readings over them that keep a cache of their own (the
// roles a target draws in, its alphabet, the face a run takes) and canDrawIn, and re-exports the rest at this path.
import {
  ALPHABETS,
  CM_TEXT,
  type Design,
  type EnglishFamily,
  type FaceId,
  type FontClass,
  LATIN_FALLBACKS,
  LATIN_GROUPS,
  LETTERS,
  OTHER_GROUPS,
  styled,
  styleOf,
} from '@readarxiv/text'
import { scriptOf } from './script.ts'

export {
  capsLetters,
  classifyFont,
  type Design,
  ENGLISH_FAMILIES,
  type EnglishFamily,
  FACES,
  type Face,
  type FaceId,
  type FontClass,
  familyOfFonts,
  familyOfProbe,
  isCjkFace,
  LETTER_SETS,
  ownSmallCaps,
} from '@readarxiv/text'
/** what a target draws in, for a paper's English family; an italic CJK run is its weight's face sheared */
export interface RoleSet {
  target: string
  family: EnglishFamily
  cjk: { body: FaceId; bold: FaceId } | null
  fallbacks: Readonly<Record<FaceId, readonly FaceId[]>>
}
/** a script's CJK faces as the layout rule set gives them: its group, drawn at Regular and Bold beside every English family */
export interface CjkFaces {
  group: string
}
/** a run as faceFor reads it */
export interface FaceRun {
  script: 'cjk' | 'latin'
  cls: FontClass['cls']
  design: Design
  bold: boolean
  italic: boolean
  caps: boolean
}

// ---------------------------------------------------------------------------------------------------------------------
// The roles

/**
 * What a target draws in, for a paper's English family. `cjkFaces`: the target's CJK family as the layout rule set gives
 * it (rules/layout.mjs: its group), null for an alphabet. Which family a script takes is a layout rule, not a fact about
 * the files: this table only builds the roles from it, Regular for the body and Bold for bold beside every English family
 * (the maintainer's ruling of 2026-10-29, docs/PDF-READER.md §18.1, the font roles). A script that is no alphabet's and is
 * given none has no roles to draw in
 */
export function rolesFor(target: string, family: EnglishFamily, cjkFaces: CjkFaces | null): RoleSet {
  const script = scriptOf(target)
  let cjk: { body: FaceId; bold: FaceId } | null = null
  const fallbacks: Record<FaceId, readonly FaceId[]> = { ...LATIN_FALLBACKS }
  if (cjkFaces) {
    const { group } = cjkFaces
    cjk = { body: `${group}-regular`, bold: `${group}-bold` }
    // Traditional Chinese's characters Source Han Serif TC lacks, from SC at the same weight
    if (script === 'Hant')
      for (const w of ['regular', 'medium', 'bold']) fallbacks[`shs-tc-${w}`] = Object.freeze([`shs-sc-${w}`])
  } else if (!ALPHABETS.has(script)) throw new Error(`no font roles for ${target} (script ${script}) yet`)
  return Object.freeze({ target, family, cjk: cjk && Object.freeze(cjk), fallbacks: Object.freeze(fallbacks) })
}

// (worked out once a target: faceFor asks it for every run of every unit laid)
const ALPHABET_OF = new Map<string, string>()
/** the alphabet a target's letters are (LETTER_SETS' key): its language's own, else its script's */
const alphabetOf = (target: string): string => {
  let a = ALPHABET_OF.get(target)
  if (a === undefined) {
    const language = new Intl.Locale(target).language
    a = Object.hasOwn(LETTERS, language) ? language : scriptOf(target) === 'Cyrl' ? 'Cyrl' : 'Latn'
    // (what it remembers is bounded, a count of targets: past it the table starts again and answers the same; no rule set
    // names so many targets, only a host asking others meets it. Unmeasured)
    if (ALPHABET_OF.size >= 256) ALPHABET_OF.clear()
    ALPHABET_OF.set(target, a)
  }
  return a
}

/** the face a run is drawn in. A CJK run takes its target's CJK family by weight, whatever its class (no sans, no
 *  fangsong: §4.4): its slant is that face sheared where it is drawn (layer-proto/fonts.mjs CJK_SLANT_DEG), an italic run
 *  the body's and a bold italic one the bold's (docs/PDF-READER.md §18.1, the font roles). A Latin run takes its design's
 *  group (math the math face); small capitals take Latin Modern's caps face, and elsewhere stay the face's: the drawing
 *  sets them by its smcp feature where METRICS says it has one, else draws each lowercase letter as the face's capital at the
 *  original's small capitals' share of the size (ownSmallCaps). A CJK run of a target with no CJK roles is set as a Latin
 *  run, and canDraw then finds what its face cannot draw */
export function faceFor(roles: RoleSet, run: FaceRun): FaceId {
  const c = roles.cjk
  if (run.script === 'cjk' && c) return run.bold ? c.bold : c.body
  if (run.cls === 'math') return 'lm-math'
  const cyrillic = scriptOf(roles.target) === 'Cyrl' ? 1 : 0
  const groups = Object.hasOwn(LATIN_GROUPS, run.design)
    ? LATIN_GROUPS[run.design]!
    : Object.hasOwn(OTHER_GROUPS, run.cls)
      ? OTHER_GROUPS[run.cls]!
      : OTHER_GROUPS.serif!
  const column = groups[cyrillic]
  const group = typeof column === 'string' ? column : column[styleOf(run.bold, run.italic)]!
  // Latin Modern's caps face, upright and oblique, for CM's small capitals and an unknown family's; it has no bold
  if (run.caps && !run.bold && !cyrillic && (group === 'lm-roman' || column === CM_TEXT))
    return run.italic ? 'lm-roman-caps-italic' : 'lm-roman-caps'
  return styled(group, run.bold, run.italic, alphabetOf(roles.target))!
}

// whether a face's coverage holds a code point: ranges start, end (inclusive), sorted and disjoint
const holds = (ranges: readonly number[], cp: number): boolean => {
  let lo = 0,
    hi = (ranges.length >> 1) - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (cp < ranges[2 * mid]!) hi = mid - 1
    else if (cp > ranges[2 * mid + 1]!) lo = mid + 1
    else return true
  }
  return false
}
// white space, and the characters Unicode marks default ignorable (zero width space and joiners, soft hyphen, variation
// selectors, byte order mark): invisible, never drawn, as the TeX path drops them (mt.mjs texEscape)
const SKIPPED = /^(?:\s|\p{Default_Ignorable_Code_Point})$/u

/** whether every character of `text` (but white space and the default ignorable) is in one of `ranges`: a list of range
 *  lists, each sorted and disjoint as COVERAGE's are (a face's coverage, or the code points of one slice of it that is
 *  served). The served form of canDraw: a face is drawn only in what its host serves of it */
export function canDrawIn(text: string, ranges: readonly (readonly number[])[]): boolean {
  for (const ch of String(text)) {
    if (SKIPPED.test(ch)) continue
    const cp = ch.codePointAt(0)!
    if (!ranges.some((r) => holds(r, cp))) return false
  }
  return true
}
