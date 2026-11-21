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
// figure runs' words read it: LAYOUT 25 and PIPELINE 31). Its names are TeX's font names of TeX Live's maps and font files:
// amsfonts' cm.map (cmmi, cmsy, cmex, cmbsy), symbols.map (msam, msbm), euler.map (eufm, eufb, eusm, and eu with ex, rm or
// rb: EUEX10, EURM10, EURB10) and latxfont.map (lasy, lcircle); MathTime's mt with mi or sy (the Fontname scheme's special.map
// mtmi, belleek.map's mtsy); rsfs.map (rsfs), stmaryrd.map (stmary), wasy.map (wasy), esint.map (esint), bbold.map (bbold),
// bbm's tfm (bbm), dstroke.map (dsrom); newtx.map's txsy, txex, txmi, ntxsy, newtxmi and newtxbmi (NewTXMI, NewTXBMI) and its
// ntxmi, ntxexx and ntxbmi tfm; pxfonts.map's pxsy and pxex, newpx.map's pxmi, newpxmi (NewPXMI) and newpxbmi (NewPXBMI_gnu)
// and its zplmi tfm; lm-math.map's lmmath (LMMathSymbols5-Bold) and latinmodern-math.otf (latinmodern-math); stix.map's
// stixmath (STIXMath-Regular), stix2.map's stixtwomath (STIXTwoMath), xits's xitsmath (XITSMath-Bold.otf); mathdesign's
// MathDesign-CH-Regular-MathItalic-10 (mathdesign) and its mdbch tfm; fourier's futs (futs8r) and futm (futmiib); MnSymbol.map
// (mnsymbol), ESSTIX.map (esstix), Euler-Math.otf (euler); and the PostScript Symbol face (symbol: PDF.js's standard_fonts.js
// getStdFontMap)
const MATH_NAME =
  /^(cmmi|cmsy|cmex|msam|msbm|eufm|eufb|eusm|eu(ex|rm|rb)\d|mt(mi|sy|ex)|rsfs|cmbsy|stmary|wasy|txsy|txex|txmi|pxsy|pxex|pxmi|lmmath|latinmodern-math|stixmath|stixtwomath|xitsmath|cambria-?math|esint|bbold|bbm|dsrom|ntxmi|ntxsy|ntxexx|ntxbmi|newtxmi|newtxbmi|newpxmi|newpxbmi|zplmi|mathdesign|mdbch|symbol|euler|lasy|line10|lcircle|futs|futm|mnsymbol|esstix)/i
const MATH_WORD = /math|symbol/i
// (a monospaced face by its names: the Fontname scheme's typeface.map (courier, typewriter: Typewriter, inconsolata, consol:
// Consolas), TeX's font names of TeX Live's maps (cm, lm, ec and tc before tt: cm.map's cmtt8, cfr-lm's lmtt8ttl8, cm-super's
// ectt0800 and tctt0800; sftt, cm-super's SFTT0800; txtt, txfonts.map's; pcr, the Fontname scheme's Adobe Courier; cmvtt,
// cm.map's cmvtt10), PostScript names (mono: lm's LMMono10-Regular; sourcecode: SourceCodePro.map's; firamono: fira.map's;
// nimbusmon: ucr.map's NimbusMonL-Bold), and menlo, Apple's Menlo (Apple Support's page "Fonts included with macOS
// Monterey" names it among the faces macOS installs))
const MONO_NAME =
  /mono|courier|typewriter|inconsolata|consol|menlo|^(cm|lm|ec|tc)tt|^sftt|^txtt|^pcr|sourcecode|firamono|cmvtt|^zi4|nimbusmon|letter ?gothic/i
// (a sans face by its names: the Fontname scheme's typeface.map (arial, verdana, calibri, avant, futura, frutiger, myriad,
// tahoma, gillsans, optima), TeX's font names of TeX Live's maps (cm and lm before ss: cm.map's cmss8, cfr-lm's lmss8ttl8;
// phv, the Fontname scheme's Adobe Helvetica: phvb8z; uhvr, uhv.map's uhvr8r; qhv, qx-base.map's qhvb), PostScript names of its
// maps (sans: lm's LMSans8-Regular; helvetica: Helvetica; nimbussan: NimbusSanL-Bold; biolinum: LinBiolinumTBO; grotesk:
// URWGroteskT-Bold; roboto, lato, opensans, sourcesans, firasans, cabin, raleway, montserrat, inter and arimo: their packages'
// maps; heros: TeXGyreHeros-Regular; dejavusans: DejaVuSansCondensed), and segoe in PDF.js's standard_fonts.js
// getNonStdFontMap (SegoeUISymbol, read as Helvetica))
const SANS_NAME =
  /sans|helvetica|arial|^(cm|lm)ss|^sfs[sxi]|nimbussan|biolinum|grotesk|verdana|roboto|^lato|opensans|sourcesans|firasans|calibri|avant|futura|frutiger|myriad|segoe|tahoma|gillsans|optima|cabin|raleway|montserrat|^inter|heros|^phv|^uhvr|^qhv|arimo|dejavusans/i
// (bold by its names: weights of the Fontname scheme's weight.map (bold, black, heavy, semibold, extrabold) and of PDF.js's
// font_substitutions.js getFamilyName's style words (demibold, ultrabold), PostScript names (demi: uag.map's URWGothicL-Demi;
// libertinetb: libertine.map's LinLibertineTB), TeX's font names of TeX Live's maps (cm, lm and ec before bx: cm.map's cmbx5,
// cfr-lm's lmbx8ttl5, cm-super's ecbx0500; sfbx and sfsx, cm-super's; cmssbx, cmmib and cmbsy, cm.map's; ptmb and phvb, the
// Fontname scheme's Adobe Times and Helvetica bold: ptmb8z, phvb8z))
const BOLD_NAME =
  /bold|black|heavy|semibold|demibold|demi\b|-medi(?:ital)?$|-medi\b|^(cm|lm|ec)bx|^cmb\d|^sfbx|^sfsx|^cmssbx|^cmmib|^cmbsy|-bd\b|^ptmb|^phvb|^linlibertinet?b|linlibertinetbi?$|libertinetb|-bol$|extrabold|ultrabold|-sb$/i
// (italic by its names: variants of the Fontname scheme's variant.map (italic, kursiv, oblique, and URW's ital: Ital),
// PostScript names (slant: AlgolRevived-Slanted; linlibertineti, linlibertinetbi and linbiolinumti: libertine.map's
// LinLibertineTI, LinLibertineTBI, LinBiolinumTI), TeX's font names of TeX Live's maps (cmti, cmsl, cmbxti, cmbxsl, cmssi,
// cmitt and cmmi, cm.map's: cmti7, cmsl8, cmbxti10, cmbxsl10, cmssi8, cmitt10, cmmi5; sfti, sfsl, sfsi and sfbi, cm-super's))
const ITALIC_NAME =
  /italic|ital\b|ital$|oblique|slant|kursiv|^cmti|^cmsl|^sfti|^sfsl|^sfsi|^sfbi|^cmbxti|^cmbxsl|^cmssi|^cmitt|^cmmi|-it$|-bi$|linlibertineti|linlibertinetbi|linbiolinumti|-ita?$/i
// (small capitals by their names: smallcap (the Fontname scheme's variant.map SmallCaps; kerkis.map's Kerkis-SmallCaps), caps
// and lmromancaps (lm's LMRomanCaps10-Regular), TeX's font names of TeX Live's maps (cmcsc and cmtcsc: cm.map's cmcsc10,
// cmtcsc10; sfcc and sfxc: cm-super's))
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
  if (fam === 'mono')
    // the cmtt design's names, TeX's font names of TeX Live's maps: cm, lm, ec and tc before tt (cm.map's cmtt8, cfr-lm's lmtt8ttl8,
    // cm-super's ectt0800 and tctt0800), sftt (cm-super's SFTT0800), lmmono (lm's LMMono8-Regular), cmvtt, cmitt and cmsltt
    // (cm.map's cmvtt10, cmitt10, cmsltt10)
    design = /^(cm|lm|ec|tc)tt|^sftt|lmmono|cmvtt|cmitt|cmsltt/i.test(n) ? 'cmtt' : 'courier'
  else if (fam === 'sans')
    // the cmss design's names, TeX's font names of TeX Live's maps: cm and lm before ss (cm.map's cmss8, cfr-lm's
    // lmss8ttl8), lmsans (lm's LMSans8-Regular)
    design = /^(cm|lm)ss|^sfs[sxi]|lmsans/i.test(n) ? 'cmss' : 'helvetica'
  else if (
    /* the cm design's names, TeX's font names of TeX Live's maps: cm, lm, ec and tc before a shape and a size (cm.map's cmb10, cmbx10,
       cmti10, cmsl10, cmcsc10, cmdunh10, cmfib8, cmff10: bx, ti, sl, csc, dunh, fib, ff; cfr-lm's lmr8ttl5; cm-super's ecsl0500,
       tcsl0500), cmbxti and cmbxsl (cm.map's cmbxti10, cmbxsl10), sf with rm, cc, xc or bi (cm-super's SFRM0500, SFCC0500,
       SFXC0500, SFBI0500), lmroman (lm's LMRoman5-Regular), latinmodern (the Fontname scheme's typeface.map LatinModern), cmmi,
       cmsy and cmex (cm.map's) */ /^(cm|lm|ec|tc)(r|bx|b|ti|sl|csc|u|dunh|fib|ff)\d|^cmbxti|^cmbxsl|^sf(rm|bx|ti|sl|cc|xc|bi)|lmroman|latinmodern|^cmmi|^cmsy|^cmex/i.test(
      n,
    )
  )
    design = 'cm'
  else if (
    /* the palatino design's names: palatino and palladio (the Fontname scheme's typeface.map Palatino and URWPalladioL; PDF.js's
       standard_fonts.js getSerifFonts Palatino), pagella (newpx's TeXGyrePagellaX), ppl (the Fontname scheme's Adobe
       Palatino: pplbi8z) and zpl (newpx.map's zplx-regular) */ /palladio|palatino|pagella|^ppl|^zpl/i.test(n)
  )
    design = 'palatino'
  else if (/charter|^bch/i.test(n)) design = 'charter'
  else if (/libertin/i.test(n)) design = 'libertine'
  else if (
    /* the times design's names: times and nimbusrom (the Fontname scheme's typeface.map Times and NimbusRomNo9L; PDF.js's
       standard_fonts.js getStdFontMap Times-Roman), termes (newtx.map's TeXGyreTermesX-Regular), ptm (the Fontname scheme's
       Adobe Times: ptmr8z), txr (pxtxalfa's txr-of), ntx (newtx.map's ntxexmods), stixtwotext (stix2.map's STIXTwoText),
       stixgeneral (stix.map's STIXGeneral-Regular) */ /times|nimbusrom|termes|^ptm|^txr|^ntx|^tx(?!tt)|stixtwotext|stix-?regular|stixgeneral/i.test(
      n,
    )
  )
    design = 'times'
  // a font with no recognisable name (a Type 3 bitmap font, a renamed subset): its class as PDF.js guesses it
  const known = /[a-z]{3}/i.test(n) && !/^(t3|type3)/i.test(low)
  return { fam, bold, italic, caps, design, known, name: n }
}
