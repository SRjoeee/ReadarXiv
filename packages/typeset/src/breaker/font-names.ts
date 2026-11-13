// Today's readings of a PDF font's name, moved from engine 065c1d973 less what no reader of the package takes (what stays is
// held to today's by lab/typeset/tests/unit/font-names.test.ts): a glyph's style as today's reader reads it, its `design` the
// Latin family whose face the reader draws in (layer-proto/fonts.mjs classifyFont), and the paper's English family from its
// fonts weighted by their glyphs (rules/font-roles.mjs classifyFont, here classifyRole, and familyOfFonts: B.faces' roles are
// set for it). What the typesetter reads of the part's fonts (Style.design, Part.paper.faces) by them: no rule reads a page's
// characters.

/** a glyph's style by its font's name, as today's reader reads it (fonts.mjs classifyFont) */
export type FontStyle = {
  fam: 'serif' | 'sans' | 'mono' | 'math'
  bold: boolean
  italic: boolean
  caps: boolean
  design: string
  known: boolean
  name: string
}
/** a font's class and design by its PostScript name (classifyRole) */
export type FontClass = { cls: string; design: string }

/** the PostScript name without its subset tag */
const bare = (name: string): string => String(name ?? '').replace(/^[A-Z]{6}\+/, '')

/** { fam: 'serif'|'sans'|'mono'|'math', bold, italic, caps, design } from a PDF font's name; `design` names the Latin
 *  family whose face the browser should use (times, cm, palatino, charter, libertine, helvetica, cmss, courier, cmtt). A math
 *  face by its family's names: Euler's EUEX, EURM and EURB with their size, MathTime's MTMI, MTSY, MTEX and their bold, and
 *  XITS's math face, XITSMath, not its text face XITS-Regular (the ledger's math lines, the ink units' kept runs and the
 *  figure runs' words read it: LAYOUT 25 and PIPELINE 31, unreleased) */
export function classifyFont(name: string, fallbackFamily?: string): FontStyle {
  const n = bare(name)
  const low = n.toLowerCase()
  let fam: FontStyle['fam'] = 'serif'
  if (
    /^(cmmi|cmsy|cmex|msam|msbm|eufm|eufb|eusm|eu(ex|rm|rb)\d|mt(mi|sy|ex|mib|syb)|rsfs|cmbsy|cmmib|stmary|wasy|txsy|txex|txmi|pxsy|pxex|pxmi|lmmath|latinmodern-math|stixmath|stixtwomath|xitsmath|cambria-?math|esint|bbold|bbm|dsrom|ntxmi|ntxsy|ntxexx|ntxbmi|newtxmi|newtxbmi|newpxmi|newpxbmi|newtxsy|newpxsy|zxmi|zplmi|mathdesign|mdbch|symbol|euler|lasy|line10|lcircle|futs|futm|mnsymbol|esstix|txmia|pxmia)/i.test(
      n,
    ) ||
    /math|symbol/i.test(n)
  )
    fam = 'math'
  else if (
    /mono|courier|typewriter|inconsolata|consol|menlo|^(cm|lm|ec|tc)tt|^sftt|^txtt|^pcr|beramono|sourcecode|firamono|cmvtt|^zi4|nimbusmon|letter ?gothic/i.test(
      n,
    )
  )
    fam = 'mono'
  else if (
    /sans|helvetica|arial|^(cm|lm)ss|^sfs[sxi]|^cmssbx|nimbussan|biolinum|grotesk|verdana|roboto|^lato|opensans|sourcesans|firasans|calibri|avant|futura|frutiger|myriad|segoe|tahoma|gillsans|optima|cabin|raleway|montserrat|^inter|heros|^phv|^uhvr|^qhv|arimo|dejavusans/i.test(
      n,
    )
  )
    fam = 'sans'
  // PDF.js's own guess only for a face no name above tells (it says monospace for CMBX10 and CMR7 in 1512.03385)
  else if (
    fallbackFamily === 'monospace' &&
    !/^(cm|lm|ec|tc|sf)|roman|serif|times|nimbus|termes|palatino|pagella|charter|libertin/i.test(n)
  )
    fam = 'mono'
  const bold =
    /bold|black|heavy|semibold|demibold|demi\b|-medi(?:ital)?$|-medi\b|^(cm|lm|ec)bx|^cmb\d|^sfbx|^sfsx|^cmssbx|^cmbxti|^cmmib|^cmbsy|-bd\b|^ptmb|^phvb|^linlibertinet?b|linlibertinetbi?$|libertinetb|-bol$|extrabold|ultrabold|-sb$/i.test(
      n,
    )
  const italic =
    /italic|ital\b|ital$|oblique|slant|kursiv|inclined|^(cm|lm)ti|^cmsl|^sfti|^sfsl|^sfsi|^sfbi|^cmbxti|^cmbxsl|^cmssi|^cmitt|^cmsltt|^cmmi|-it$|-bi$|linlibertineti|linlibertinetbi|linbiolinumti|-ita?$|italicmt|obliquemt/i.test(
      n,
    )
  const caps = /caps|^cmcsc|^sfcc|^sfxc|smallcap|-sc$|sc\d*$|^cmtcsc|^lmromancaps/i.test(n) && !/^cmsc/i.test(n)
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

// Each design's fonts by the PostScript name a PDF's font states (`ps`, its subset tag dropped). The names mirror several
// sources, group by group:
// - TeX Live 2025's fonts, a Type 1 file's FontName (as its map files, pdftex.map, name the file) or an OpenType file's name
//   table (ID 6): the math of AMSFonts (MSAM, MSBM), Euler (EU…), wasy, lasy, rsfs, stmaryrd, bbold, bbm, doublestroke
//   (DSROM, DSSS), MnSymbol, Latin Modern, TeX Gyre, STIX and STIX Two, XITS, Asana, newtx, newpx, txfonts, pxfonts,
//   mathpazo (PazoMath, zplmi), fourier and mathdesign (Md…); URW's base 35 as TeX Live carries them, 1999's (NimbusRomNo9L,
//   NimbusSanL, NimbusMonL, URWPalladioL, StandardSymL), 2017's (NimbusRoman, NimbusSans, NimbusMono, P052,
//   StandardSymbolsPS) and nimbus15's (ztm-, zhv-, zco-); TeX Gyre Termes, Heros, Cursor and Pagella; Tempora; GNU FreeMono
//   and FreeSans; Bera Sans Mono and DejaVu Sans Mono; Inconsolata; CMU; Linux Libertine, Biolinum and Libertinus; Domitian;
//   XCharter and Bitstream's Charter (CharterBT); EB Garamond and URW Garamond; Utopia and Erewhon; Charis SIL.
// - PDF's standard 14 fonts (ISO 32000-1 9.6.2.2): Times, Helvetica, Courier, Symbol, ZapfDingbats.
// - Faces outside TeX Live, each by name: Arial, Liberation Sans, Liberation Mono, Cambria Math, Symbol MT, Dingbats,
//   Bitstream Vera Sans Mono, Bitstream Charter, Palatino, Palladio, Book Antiqua, Adobe Garamond (AGaramond), Garamond.
// Which of these names TeX Live 2025's map files hold is not checked against the compile image's tree here.
const DESIGNS: readonly { design: string; cls: string; ps: RegExp }[] = [
  // math: drawn as the layer's math face, set as the paper's math in TeX
  {
    design: 'cm',
    cls: 'math',
    ps: /^(?:MSAM|MSBM|EU(?:FM|FB|SM|SB|EX|RM|RB)|WASY|LASY|RSFS|STMARY|BBOLD|BBM|DSROM|DSSS|ESINT)\d/i,
  },
  {
    design: 'other',
    cls: 'math',
    ps: /^(?:MnSymbol|LatinModernMath|TeXGyre\w*Math|STIX(?:Two)?Math|STIXSize|STIXIntegrals|STIXVariants|STIXNonUnicode|XITSMath|CambriaMath|AsanaMath|NewTX(?:B?MI|SY|EX)|NewPX(?:B?MI|SY|EX)|ntx(?:mi|sy|ex)|txsy|txex|txmia?|pxsy|pxex|pxmia?|PazoMath|zplmi|FourierMath|Md\w*(?:Sy|Ex|Mi)|SymbolMT|Symbol$|Symbol-|StandardSymL|StandardSymbolsPS|ZapfDingbats|Dingbats)/i,
  },
  // mono
  {
    design: 'courier',
    cls: 'mono',
    ps: /^(?:NimbusMonL|NimbusMono|Courier|TeXGyreCursor|zco-|LiberationMono|FreeMono)/,
  },
  {
    design: 'beramono',
    cls: 'mono',
    ps: /^(?:BeraSansMono|DejaVuSansMono|BitstreamVeraSansMono|VeraSansMono)/,
  },
  { design: 'inconsolata', cls: 'mono', ps: /^Inconsolata/ },
  { design: 'cmtt', cls: 'mono', ps: /^CMUTypewriter/ },
  // sans
  {
    design: 'helvetica',
    cls: 'sans',
    ps: /^(?:NimbusSanL|NimbusSans|Helvetica|Arial|TeXGyreHeros|zhv-|LiberationSans|FreeSans)/,
  },
  { design: 'cmss', cls: 'sans', ps: /^CMUSansSerif/ },
  // Biolinum, Libertine's sans (Libertinus Sans, its fork, drawn in it)
  {
    design: 'biolinum',
    cls: 'sans',
    ps: /^(?:LibertinusSans|LinBiolinum|LinuxBiolinum)/,
  },
  // text: the English families
  { design: 'cm', cls: 'serif', ps: /^CMU(?:Serif|ClassicalSerif)/ },
  {
    design: 'times',
    cls: 'serif',
    ps: /^(?:NimbusRomNo9L|NimbusRom|NimbusRoman|Times|TeXGyreTermes|Tempora|ztm-)/,
  },
  {
    design: 'libertine',
    cls: 'serif',
    ps: /^(?:LibertinusSerif|LinLibertine|LinuxLibertine)/,
  },
  {
    design: 'palatino',
    cls: 'serif',
    ps: /^(?:URWPalladioL|Palatino|TeXGyrePagella|P052|Domitian|Palladio|BookAntiqua|Pazo(?!Math))/,
  },
  {
    design: 'charter',
    cls: 'serif',
    ps: /^(?:XCharter|CharterBT|BitstreamCharter|Charter|CharisSIL)/,
  },
  {
    design: 'garamond',
    cls: 'serif',
    ps: /^(?:EBGaramond|AGaramond|AdobeGaramond|Garamond|URWGaramond)/,
  },
  { design: 'utopia', cls: 'serif', ps: /^(?:Utopia|Erewhon)/ },
]
/** the English families a paper's body is set in */
const ENGLISH_FAMILIES = Object.freeze([
  'cm',
  'times',
  'libertine',
  'palatino',
  'charter',
  'garamond',
  'utopia',
  'other',
])
const SERIF_DESIGN = new Set(ENGLISH_FAMILIES)

// a name no table holds: its class guessed from its words
const MONO_WORD = /(?:Mono|Courier|Typewriter|Consol|Code|Menlo|Monaco|Fixed)/i
const SANS_WORD = /(?:Sans|Gothic|Grotesk|Arial|Helvet|Verdana|Calibri|Segoe|Tahoma|Futura|Avenir|Univers|Frutiger)/i
const MATH_WORD = /(?:Math|Symbol|Dingbat)/i

const SUBSET = /^[A-Z]{6}\+/
// longer than any font's name: refused as unknown, so that no pattern runs over a hostile string
const NAME_MAX = 128
const fontClass = (cls: string, design: string): FontClass => ({ cls, design })

// Computer Modern (CMR10, CMBXTI10, CMSSBX10) and cm-super (SFRM1000, SFBX1200): the class a code of the series and shape
// names
const CM_CODES: Readonly<Record<string, string>> = {
  R: 'serif',
  B: 'serif',
  BX: 'serif',
  TI: 'serif',
  SL: 'serif',
  BXTI: 'serif',
  BXSL: 'serif',
  CSC: 'serif',
  U: 'serif',
  DUNH: 'serif',
  FIB: 'serif',
  FF: 'serif',
  FI: 'serif',
  SS: 'sans',
  SSBX: 'sans',
  SSI: 'sans',
  SSDC: 'sans',
  SSQ: 'sans',
  SSQI: 'sans',
  TT: 'mono',
  ITT: 'mono',
  SLTT: 'mono',
  TCSC: 'mono',
  TEX: 'mono',
  VTT: 'mono',
  MI: 'math',
  MIB: 'math',
  SY: 'math',
  BSY: 'math',
  EX: 'math',
}
const SF_CODES: Readonly<Record<string, string>> = {
  RM: 'serif',
  RB: 'serif',
  BX: 'serif',
  TI: 'serif',
  BI: 'serif',
  SL: 'serif',
  BL: 'serif',
  CC: 'serif',
  XC: 'serif',
  SC: 'serif',
  UI: 'serif',
  DH: 'serif',
  SS: 'sans',
  SX: 'sans',
  SI: 'sans',
  SO: 'sans',
  QI: 'sans',
  TT: 'mono',
  IT: 'mono',
  ST: 'mono',
  TC: 'mono',
  VT: 'mono',
  VI: 'mono',
}
const CM_DESIGN: Readonly<Record<string, string>> = { serif: 'cm', sans: 'cmss', mono: 'cmtt', math: 'cm' }
const coded = (cls: string | undefined): FontClass | null => (cls ? fontClass(cls, CM_DESIGN[cls] as string) : null)
const computerModern = (name: string): FontClass | null => {
  const cm = /^CM([A-Z]+)\d{1,2}$/.exec(name)
  if (cm) return coded(CM_CODES[cm[1]!])
  const sf = /^SF([A-Z]{2})\d{4}$/.exec(name)
  return sf ? coded(SF_CODES[sf[1]!]) : null
}
// Latin Modern: LMRoman10-Bold, LMRomanCaps10-Regular, LMSansDemiCond10-Regular, LMMonoLt10-Bold, LMMathItalic10-Regular
const LM_CLASS: Readonly<Record<string, string>> = { Roman: 'serif', Sans: 'sans', Mono: 'mono', Math: 'math' }
const latinModern = (name: string): FontClass | null => {
  const m = /^LM(Roman|Sans|Mono|Math)([A-Za-z]*)\d+-([A-Za-z]+)$/.exec(name)
  if (!m) return null
  const cls = LM_CLASS[m[1]!] as string
  return fontClass(cls, CM_DESIGN[cls] as string)
}
// Linux Libertine and Biolinum, Type 1 and OpenType: LinLibertineT, LinLibertineTB, LinLibertineOBI, LinBiolinumOBO
const libertine = (name: string): FontClass | null => {
  const m = /^Lin(Libertine|Biolinum)[TO]?([A-Z]{0,4})(?:-|$)/.exec(name)
  if (!m) return null
  const serif = m[1] === 'Libertine'
  return fontClass(serif ? 'serif' : 'sans', serif ? 'libertine' : 'biolinum')
}

/** a PDF font's class and design, from its PostScript name (subset tag stripped) */
function classifyRole(postScript: string | null | undefined): FontClass {
  const name = String(postScript ?? '').replace(SUBSET, '')
  if (!name || name.length > NAME_MAX) return fontClass('serif', 'other')
  const special = computerModern(name) ?? latinModern(name) ?? libertine(name)
  if (special) return special
  const row = DESIGNS.find((d) => d.ps.test(name))
  if (row) return fontClass(row.cls, row.design)
  const cls = MONO_WORD.test(name) ? 'mono' : SANS_WORD.test(name) ? 'sans' : MATH_WORD.test(name) ? 'math' : 'serif'
  return fontClass(cls, 'other')
}

/** the paper's body family, from the layout file's fonts weighted by the lines each sets: the text family that sets the
 *  most (math, sans and mono faces are not the body); a name of no family weighs for `other` */
export function familyOfFonts(names: readonly string[], weights: readonly number[]): string {
  const total = new Map(ENGLISH_FAMILIES.map((f): [string, number] => [f, 0]))
  const n = Math.min(names?.length ?? 0, weights?.length ?? 0)
  for (let i = 0; i < n; i++) {
    const w = weights[i]
    if (typeof w !== 'number' || !Number.isFinite(w) || w <= 0) continue
    const c = classifyRole(names[i])
    if (c.cls !== 'serif' || !SERIF_DESIGN.has(c.design)) continue
    total.set(c.design, (total.get(c.design) as number) + w)
  }
  let best = 'other',
    most = 0
  for (const f of ENGLISH_FAMILIES)
    if ((total.get(f) as number) > most) {
      best = f
      most = total.get(f) as number
    }
  return best
}
