// The units a translation into a language leaves as they are (the rules-as-data plan, §1: a translation rule, since it
// decides what a target is sent). Apart from scripts.mjs, which parks with the TeX path, and importing nothing but the
// script of a language, so that a reader loads it without the TeX path's LaTeX parser.
import { scriptOf } from '../rules/script.mjs'

/** the scripts whose targets are set by XeLaTeX with xeCJK on the TeX path (scripts.mjs CJK: a test holds the two) */
const AUTHORS_TRANSLATED = new Set(['Hans', 'Hant', 'Jpan', 'Kore'])

/**
 * Whether the author block's names and places are translated: where the target's script writes foreign names its own
 * way, the byline reads that way too, the original beside it for the names an engine renders wrong (the owner,
 * 2026-09-28); a language in the Latin script keeps them as the paper writes them. And only where a Unicode engine
 * sets the translation: a class runs its own macros over the author block — uppercasing, key-value parsing, the PDF's
 * metadata — which 8-bit text does not survive (2608.12096's CEUR class under CJKutf8: "Extra \\else"). So the CJK
 * scripts, set by XeLaTeX; Russian, set by pdfLaTeX in T2A, keeps them for now, and a CJK translation that falls back
 * to CJKutf8 sets them as the paper has them (`authors: false`, live.mjs translationFiles). A change of this answer is a
 * change of TRANSLATE_VERSION
 */
export const authorsTranslated = lang => AUTHORS_TRANSLATED.has(scriptOf(lang))
