/** What `@readarxiv/text` is for: sentence cuts: the small facts several packages share */
export const TEXT_PURPOSE = 'sentence cuts: the small facts several packages share' as const

export { edgeMark } from './edges.ts'
export {
  classifyFont,
  type Design,
  ENGLISH_FAMILIES,
  type EnglishFamily,
  type FontClass,
  familyOfFonts,
  familyOfProbe,
} from './font-classes.ts'
export {
  ALPHABETS,
  CM_TEXT,
  capsLetters,
  FACES,
  type Face,
  type FaceId,
  isCjkFace,
  LATIN_FALLBACKS,
  LATIN_GROUPS,
  LETTER_SETS,
  LETTERS,
  OTHER_GROUPS,
  ownSmallCaps,
  ownSmallCapsOf,
  styled,
  styleOf,
} from './font-faces.ts'
export { HOLDS, SMCP } from './font-letters.ts'
export { isLetterOrDigit } from './letters.ts'
export { bareFontName, type FontNameClass, readFontName, readFontStyle } from './font-names.ts'
export { ABBR, opensAfter, STAND_IN, type StandIn, sentenceCuts, TERMINAL_ABBR } from './sentences.ts'
