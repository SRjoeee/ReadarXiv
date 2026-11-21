// LaTeX's text symbols: one table for every reader of a placeholder that is one. The ownership takes a symbol's glyphs
// that set its character as its unit's text (own/own.ts; marks/marks.ts followsOf reads it as that character); the layer
// draws one from its source as text, whose glyph its line's erasing covers (PDF-READER §18.17; texToText2, textSymbol:
// the layer's reading, copied in instrument/instrument.ts). Two copies of it drift apart: a layer that knew none of
// \textbackslash, \textasciicircum and \textbar would read them as a paper's own macros and leave their
// units the original's (2610.19159: 256 units, with \textquotesingle and \textquotedbl). Imports nothing.

/**
 * The kernel's and textcomp's text symbols, as LaTeX defines them in every encoding, each the one character it sets
 * (\textquotesingle the straight quote ', \textquotedbl the straight double quote "); and the kernel's letters of Latin
 * scripts (\o, \ss, \ae, \l: latex.ltx and the encodings' own) and \slash (`/` and the permission to break after it), which
 * a paper writes inside a word (`F\o lner`, `and\slash or`), where no mark goes. Not the dotless \i and \j: a paper that
 * writes them in its text has made them its own as often as not (2608.23818's indices, a coloured italic i and j with \xspace),
 * and the table would draw ı and ȷ for them. Each is one character;
 * most are one glyph in every encoding, but OT1 sets \l, \L, \aa and \AA of two (a bar or a ring over a letter), which a page's
 * text then gives as two characters, not the one: there none is found, and its ink stays the placeholder's (own/own.ts).
 * Their definition is the kernel's own declarations, as the compile image's TeX Live holds them (tex/latex/base/): the
 * encodings' UTF-8 declarations (\DeclareUnicodeCharacter in t1enc.dfu, ts1enc.dfu, ot1enc.dfu, omsenc.dfu, utf8enc.dfu), the
 * T1 and TS1 slots of the printable ASCII symbols (\DeclareTextSymbol in t1enc.def, ts1enc.def), and latex.ltx's own \chardef,
 * \let and definitions of the rest (\S is \textsection outside math, \ldots is \dots, \aa is \r a). Where the kernel
 * declares a command for more than one character, the table holds the one the command is named for: \textasciitilde ~ and
 * \textasciicircum ^ (not U+02DC and U+02C6), \textendash U+2013 (not the figure dash U+2012), \textemdash U+2014 (not the bar
 * U+2015). tests/pdf-reader/text-symbols-kernel.test.ts holds every entry to those files in each pinned image
 * (lab/pdf/compile-images.json), where the image is on the machine
 */
export const TEXT_SYMBOLS: Readonly<Record<string, string>> = Object.freeze({
  '\\%': '%',
  '\\&': '&',
  '\\#': '#',
  '\\$': '$',
  '\\_': '_',
  '\\{': '{',
  '\\}': '}',
  '\\textbackslash': '\\',
  '\\textless': '<',
  '\\textgreater': '>',
  '\\textbar': '|',
  '\\textasciitilde': '~',
  '\\textasciicircum': '^',
  '\\textunderscore': '_',
  '\\textdollar': '$',
  '\\textbraceleft': '{',
  '\\textbraceright': '}',
  '\\textquotesingle': "'",
  '\\textquotedbl': '"',
  '\\S': '§',
  '\\P': '¶',
  '\\textsection': '§',
  '\\textparagraph': '¶',
  '\\dag': '†',
  '\\ddag': '‡',
  '\\textdagger': '†',
  '\\textdaggerdbl': '‡',
  '\\copyright': '©',
  '\\textcopyright': '©',
  '\\textregistered': '®',
  '\\texttrademark': '™',
  '\\pounds': '£',
  '\\textsterling': '£',
  '\\textdegree': '°',
  '\\textbullet': '•',
  '\\textperiodcentered': '·',
  '\\ldots': '…',
  '\\dots': '…',
  '\\textellipsis': '…',
  '\\textendash': '–',
  '\\textemdash': '—',
  '\\o': 'ø',
  '\\O': 'Ø',
  '\\ss': 'ß',
  '\\ae': 'æ',
  '\\AE': 'Æ',
  '\\oe': 'œ',
  '\\OE': 'Œ',
  '\\aa': 'å',
  '\\AA': 'Å',
  '\\l': 'ł',
  '\\L': 'Ł',
  '\\slash': '/',
})

/** a symbol's text: its source one of TEXT_SYMBOLS, alone or followed by an empty group (`\%{}`, `\dots{}`), else null */
export function symbolText(src: string | null | undefined): string | null {
  const m = /^(\\(?:[A-Za-z]+|[%&#$_{}]))(?:\{\})?$/.exec(src ?? '')
  return m && Object.hasOwn(TEXT_SYMBOLS, m[1]!) ? TEXT_SYMBOLS[m[1]!]! : null
}
