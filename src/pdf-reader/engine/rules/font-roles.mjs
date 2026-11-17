// Moved whole into the engine package (packages/engine/src/fonts/font-roles.ts); this path re-exports it from the package's
// entry of the served faces and patterns (`@readarxiv/engine/fonts`) for what still imports it here. The cut-over deletes
// the path.
export { FACES, isCjkFace, ENGLISH_FAMILIES, classifyFont, familyOfProbe, familyOfFonts, rolesFor, LETTER_SETS, capsLetters, ownSmallCaps, faceFor, canDrawIn } from '@readarxiv/engine/fonts'
