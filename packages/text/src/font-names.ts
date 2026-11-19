// The reading of a PDF font's name, held once: its family
// (serif, sans, mono, math), weight, slant and small capitals by the name's words, and the Latin design whose face the reader
// draws it in. The prepare reads the first four of each glyph's font (engine locate/facts.ts classifyFont), the typesetter all
// of them of a part's fonts (typeset breaker/font-names.ts classifyFont) and the first three of a figure's (typeset
// shared/figures.ts fontClassOf). PDF.js's own guess for a font it could not load is left out: no reader of these takes it.

/** a font's family as its name tells it */
type FontFam = 'serif' | 'sans' | 'mono' | 'math'
/** a font's family, weight, slant and small capitals as its name tells them */
export interface FontNameClass {
  fam: FontFam
  bold: boolean
  italic: boolean
  caps: boolean
}
/** and the Latin family whose face the reader draws it in (times, cm, palatino, charter, libertine, helvetica, cmss, courier,
 *  cmtt), whether the name is one at all (a Type 3 bitmap font's or a renamed subset's is not), and the name read */
interface FontNameStyle extends FontNameClass {
  design: string
  known: boolean
  name: string
}

/** the PostScript name without its subset tag */
export const bareFontName = (name: string): string => String(name ?? '').replace(/^[A-Z]{6}\+/, '')

// A math face by its family's names: Euler's EUEX, EURM and EURB with their size, MathTime's MTMI, MTSY, MTEX and their bold,
// and XITS's math face, XITSMath, not its text face XITS-Regular (the ledger's math lines, the ink units' kept runs and the
// figure runs' words read it: LAYOUT 25 and PIPELINE 31)
const MATH_NAME =
  /^(cmmi|cmsy|cmex|msam|msbm|eufm|eufb|eusm|eu(ex|rm|rb)\d|mt(mi|sy|ex|mib|syb)|rsfs|cmbsy|cmmib|stmary|wasy|txsy|txex|txmi|pxsy|pxex|pxmi|lmmath|latinmodern-math|stixmath|stixtwomath|xitsmath|cambria-?math|esint|bbold|bbm|dsrom|ntxmi|ntxsy|ntxexx|ntxbmi|newtxmi|newtxbmi|newpxmi|newpxbmi|newtxsy|newpxsy|zxmi|zplmi|mathdesign|mdbch|symbol|euler|lasy|line10|lcircle|futs|futm|mnsymbol|esstix|txmia|pxmia)/i
const MATH_WORD = /math|symbol/i
const MONO_NAME =
  /mono|courier|typewriter|inconsolata|consol|menlo|^(cm|lm|ec|tc)tt|^sftt|^txtt|^pcr|beramono|sourcecode|firamono|cmvtt|^zi4|nimbusmon|letter ?gothic/i
const SANS_NAME =
  /sans|helvetica|arial|^(cm|lm)ss|^sfs[sxi]|^cmssbx|nimbussan|biolinum|grotesk|verdana|roboto|^lato|opensans|sourcesans|firasans|calibri|avant|futura|frutiger|myriad|segoe|tahoma|gillsans|optima|cabin|raleway|montserrat|^inter|heros|^phv|^uhvr|^qhv|arimo|dejavusans/i
const BOLD_NAME =
  /bold|black|heavy|semibold|demibold|demi\b|-medi(?:ital)?$|-medi\b|^(cm|lm|ec)bx|^cmb\d|^sfbx|^sfsx|^cmssbx|^cmbxti|^cmmib|^cmbsy|-bd\b|^ptmb|^phvb|^linlibertinet?b|linlibertinetbi?$|libertinetb|-bol$|extrabold|ultrabold|-sb$/i
const ITALIC_NAME =
  /italic|ital\b|ital$|oblique|slant|kursiv|inclined|^(cm|lm)ti|^cmsl|^sfti|^sfsl|^sfsi|^sfbi|^cmbxti|^cmbxsl|^cmssi|^cmitt|^cmsltt|^cmmi|-it$|-bi$|linlibertineti|linlibertinetbi|linbiolinumti|-ita?$|italicmt|obliquemt/i
const CAPS_NAME = /caps|^cmcsc|^sfcc|^sfxc|smallcap|-sc$|sc\d*$|^cmtcsc|^lmromancaps/i
// (Computer Modern's sans serif, cmsc, is no small capitals)
const NOT_CAPS = /^cmsc/i

/** the class of a name already bare */
function classOfBare(n: string): FontNameClass {
  const fam: FontFam =
    MATH_NAME.test(n) || MATH_WORD.test(n) ? 'math' : MONO_NAME.test(n) ? 'mono' : SANS_NAME.test(n) ? 'sans' : 'serif'
  return { fam, bold: BOLD_NAME.test(n), italic: ITALIC_NAME.test(n), caps: CAPS_NAME.test(n) && !NOT_CAPS.test(n) }
}

/** a PDF font's family, weight, slant and small capitals by its name (its subset tag aside) */
export const readFontName = (name: string): FontNameClass => classOfBare(bareFontName(name))

/** and its design, whether it is known and its name read (its subset tag aside) */
export function readFontStyle(name: string): FontNameStyle {
  const n = bareFontName(name)
  const low = n.toLowerCase()
  const { fam, bold, italic, caps } = classOfBare(n)
  let design = 'times'
  if (fam === 'mono') design = /^(cm|lm|ec|tc)tt|^sftt|lmmono|cmvtt|cmitt|cmsltt/i.test(n) ? 'cmtt' : 'courier'
  else if (fam === 'sans') design = /^(cm|lm)ss|^sfs[sxi]|^cmssbx|lmsans/i.test(n) ? 'cmss' : 'helvetica'
  else if (
    /^(cm|lm|ec|tc)(r|bx|b|ti|sl|csc|u|dunh|fib|ff)\d|^cmbxti|^cmbxsl|^sf(rm|bx|ti|sl|cc|xc|bi)|lmroman|latinmodern|^cmmi|^cmsy|^cmex/i.test(
      n,
    )
  )
    design = 'cm'
  else if (/palladio|palatino|pagella|^ppl|^pplx|^zpl/i.test(n)) design = 'palatino'
  else if (/charter|^bch/i.test(n)) design = 'charter'
  else if (/libertin/i.test(n)) design = 'libertine'
  else if (/times|nimbusrom|nimbusroman|termes|^ptm|^txr|^ntx|^tx(?!tt)|stixtwotext|stix-?regular|stixgeneral/i.test(n))
    design = 'times'
  // a font with no recognisable name (a Type 3 bitmap font, a renamed subset): its class as PDF.js guesses it
  const known = /[a-z]{3}/i.test(n) && !/^(t3|type3)/i.test(low)
  return { fam, bold, italic, caps, design, known, name: n }
}
