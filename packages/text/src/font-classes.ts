// The reading of a PDF font's names by the table they are defined by, held once for the engine and the typesetter: a
// PostScript name's design and class (a PDF's fonts: classifyFont, and the paper's body family they weigh for, familyOfFonts)
// and an NFSS family name's text family (the TeX path's font probe: familyOfProbe). The engine's role table reads it
// (packages/engine/src/fonts/font-roles.ts, which re-exports it at its old path) and so does the typesetter (typeset
// breaker/font-names.ts, the paper's English family). Moved whole from the engine's font-roles.ts (C1's move of today's
// rules/font-roles.mjs), its typed copy in the typesetter gone with it. Imports nothing.

/** the English families a paper's body is set in */
export type EnglishFamily = 'cm' | 'times' | 'libertine' | 'palatino' | 'charter' | 'garamond' | 'utopia' | 'other'
/** a design the names are read as: an English family, or a sans or mono design */
export type Design = EnglishFamily | 'helvetica' | 'cmss' | 'courier' | 'cmtt' | 'beramono' | 'inconsolata' | 'biolinum'
/** a PDF font's class, weight, slant, small capitals and design, from its PostScript name (subset tag stripped) */
export interface FontClass {
  cls: 'serif' | 'sans' | 'mono' | 'math'
  bold: boolean
  italic: boolean
  caps: boolean
  design: Design
  known: boolean
}

// ---------------------------------------------------------------------------------------------------------------------
// The names. A design, its class, its PostScript names (a PDF font's, its subset tag stripped), and a text family's NFSS
// family names (anchored, as \rmdefault and the rest hold them: the probe reads a paper's body family by them, and a name of
// no text family, a sans's or a mono's among them, falls to the roman's, familyOfProbe). Computer Modern, cm-super, Latin
// Modern and Libertine's names carry their series and shape in codes of their own and are read apart (computerModern,
// latinModern, libertine); every other name's weight and slant come from its style words. Mono and sans before the text
// families, so that DejaVu Sans Mono is mono.
//
// What a pattern decides is whether a name is one of its design's, and each name it holds is defined outside this table: an
// NFSS family name is the one LaTeX's font selection holds for a family that a package's font definition files declare
// (\DeclareFontFamily: psnfss's t1ptm.fd declares `ptm`) or that fontspec makes of an OpenType family; a PostScript name is
// the name a font file gives itself (a Type 1 font's FontName, an OpenType font's name table ID 6), by which a PDF names the
// font. A name no paper of the corpus is set in takes each pattern's either side (tests/pdf-reader/font-roles.test.ts)
const DESIGNS: readonly { design: Design; cls: FontClass['cls']; nfss?: RegExp; ps: RegExp; bold?: RegExp }[] = [
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
  { design: 'inconsolata', cls: 'mono', ps: /^Inconsolata/, bold: /zi4b|Bold/ },
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
  { design: 'cm', cls: 'serif', nfss: /^(?:cmr|lmr|cmdh|lmdh|cmfib|cmfr)$/, ps: /^CMU(?:Serif|ClassicalSerif)/ },
  {
    design: 'times',
    cls: 'serif',
    nfss: /^(?:ptm|qtm|ntx|txr|utm|ztm|Tempora|TeXGyreTermes|NimbusSerif)/,
    ps: /^(?:NimbusRomNo9L|NimbusRom|NimbusRoman|Times|TeXGyreTermes|Tempora|ztm-)/,
  },
  {
    design: 'libertine',
    cls: 'serif',
    nfss: /^(?:LinuxLibertine|fxl|LibertinusSerif|Libertinus(?!Sans|Mono|Math))/,
    ps: /^(?:LibertinusSerif|LinLibertine|LinuxLibertine)/,
  },
  {
    design: 'palatino',
    cls: 'serif',
    nfss: /^(?:ppl|qpl|npx|zpl|Domitian|TeXGyrePagella)/,
    ps: /^(?:URWPalladioL|Palatino|TeXGyrePagella|P052|Domitian|Palladio|BookAntiqua|Pazo(?!Math))/,
  },
  {
    design: 'charter',
    cls: 'serif',
    nfss: /^(?:bch|mdbch|XCharter|Charter)/,
    ps: /^(?:XCharter|CharterBT|BitstreamCharter|Charter|CharisSIL)/,
  },
  {
    design: 'garamond',
    cls: 'serif',
    nfss: /^(?:ebg|EBGaramond|ugm|mdugm|zgm|GaramondLibre|garamondx)/,
    ps: /^(?:EBGaramond|AGaramond|AdobeGaramond|Garamond|URWGaramond)/,
  },
  { design: 'utopia', cls: 'serif', nfss: /^(?:put|mdput|fut|Erewhon|Utopia)/, ps: /^(?:Utopia|Erewhon)/ },
]
/** the English families a paper's body is set in */
export const ENGLISH_FAMILIES: readonly EnglishFamily[] = Object.freeze([
  'cm',
  'times',
  'libertine',
  'palatino',
  'charter',
  'garamond',
  'utopia',
  'other',
])
const SERIF_DESIGN = new Set<string>(ENGLISH_FAMILIES)

// style words: URW's Medi(um) is its bold, and its Regu, Ital and Obli abbreviations; Medium spelled out is not bold. The bold
// words are weights of TeX Live's Fontname scheme (fonts/map/fontname/weight.map: Bold, Black, Demi, Heavy, Semibold,
// ExtraBold), and SemiBold as PostScript names spell it (archivo's ArchivZero.map: Archiv0-SemiBold)
const BOLD = /(?:Bold|Bol(?![a-z])|Black|Heavy|Demi|Semibold|SemiBold|ExtraBold|Medi(?![a-z]))/
// the slant words: Italic, Kursiv and Oblique variants of TeX Live's Fontname scheme (fonts/map/fontname/variant.map), Slant
// and It in PostScript names (algolrevived's AlgolRevived-Slanted, sourcesanspro's SourceSansPro-It)
const ITALIC = /(?:Italic|Ital(?![a-z])|Ita(?![a-z])|Oblique|Obli(?![a-z])|Slant|Kursiv|It$)/
// small capitals, by a name's words: a face named for them (SmallCaps, Caps, Capitals) or with an SC suffix: SmallCaps a variant
// of TeX Live's Fontname scheme (fonts/map/fontname/variant.map), Caps and Capitals in PostScript names (lm's
// LMRomanCaps10-Regular, bookhands' Bookhands-Square-Capitals)
const CAPS = /(?:SmallCaps|Caps|Capitals|[a-z]SC$|-SC$|-Sc$)/
// a name no table holds: its class guessed from its words, mono's first (a typewriter's or a code face's), then sans's, then
// math's; a name with none of them is a serif's. Mono's words, monospaced faces' names: Courier, Typewriter, Consol (Consolas)
// and Monaco faces of TeX Live's Fontname scheme (fonts/map/fontname/typeface.map), Mono and Code in PostScript names (lm's
// LMMono10-Regular, cascadia-code's CascadiaCode-Bold), Fixed in a font file's (almfixed.otf, ALM Fixed), and Menlo, Apple's
// (Apple Support's page "Fonts included with macOS Monterey" names it among the faces macOS installs)
const MONO_WORD = /(?:Mono|Courier|Typewriter|Consol|Code|Menlo|Monaco|Fixed)/i
// (sans's words: Sans, Gothic, a grotesque's, and sans families' own names: Arial, Verdana, Calibri, Tahoma, Futura, Avenir,
// Univers and Frutiger faces of TeX Live's Fontname scheme (fonts/map/fontname/typeface.map), Grotesk (its AkzidenzGrotesk),
// Helvet (its HelveticaNeue) and Gothic (its URWGothicL) there too; Sans in PostScript names (lm's LMSans8-Regular); Segoe in
// PDF.js's standard_fonts.js getNonStdFontMap, which reads SegoeUISymbol as Helvetica)
const SANS_WORD = /(?:Sans|Gothic|Grotesk|Arial|Helvet|Verdana|Calibri|Segoe|Tahoma|Futura|Avenir|Univers|Frutiger)/i
// (math's words: a math face's, a symbol face's, a dingbat face's)
const MATH_WORD = /(?:Math|Symbol|Dingbat)/i

const SUBSET = /^[A-Z]{6}\+/
// longer than any font's name: refused as unknown, so that no pattern runs over a hostile string
const NAME_MAX = 128
const fontClass = (
  cls: FontClass['cls'],
  design: Design,
  bold: boolean,
  italic: boolean,
  caps: boolean,
  known: boolean,
): FontClass => ({ cls, bold, italic, caps, design, known })

// Computer Modern (CMR10, CMBXTI10, CMSSBX10) and cm-super (SFRM1000, SFBX1200): a code of the series and shape
const CM_CODES: Readonly<Record<string, string>> = {
  R: 'serif',
  B: 'serif b',
  BX: 'serif b',
  TI: 'serif i',
  SL: 'serif i',
  BXTI: 'serif b i',
  BXSL: 'serif b i',
  CSC: 'serif c',
  U: 'serif i',
  DUNH: 'serif',
  FIB: 'serif',
  FF: 'serif',
  FI: 'serif i',
  SS: 'sans',
  SSBX: 'sans b',
  SSI: 'sans i',
  SSDC: 'sans b',
  SSQ: 'sans',
  SSQI: 'sans i',
  TT: 'mono',
  ITT: 'mono i',
  SLTT: 'mono i',
  TCSC: 'mono c',
  TEX: 'mono',
  VTT: 'mono',
  MI: 'math',
  MIB: 'math b',
  SY: 'math',
  BSY: 'math b',
  EX: 'math',
}
const SF_CODES: Readonly<Record<string, string>> = {
  RM: 'serif',
  RB: 'serif b',
  BX: 'serif b',
  TI: 'serif i',
  BI: 'serif b i',
  SL: 'serif i',
  BL: 'serif b i',
  CC: 'serif c',
  XC: 'serif b c',
  SC: 'serif i c',
  UI: 'serif i',
  DH: 'serif',
  SS: 'sans',
  SX: 'sans b',
  SI: 'sans i',
  SO: 'sans b i',
  QI: 'sans i',
  TT: 'mono',
  IT: 'mono i',
  ST: 'mono i',
  TC: 'mono c',
  VT: 'mono',
  VI: 'mono i',
}
const CM_DESIGN: Readonly<Record<FontClass['cls'], Design>> = { serif: 'cm', sans: 'cmss', mono: 'cmtt', math: 'cm' }
const coded = (code: string | undefined): FontClass | null => {
  if (!code) return null
  const [cls, ...marks] = code.split(' ') as [FontClass['cls'], ...string[]]
  return fontClass(cls, CM_DESIGN[cls], marks.includes('b'), marks.includes('i'), marks.includes('c'), true)
}
const computerModern = (name: string): FontClass | null => {
  const cm = /^CM([A-Z]+)\d{1,2}$/.exec(name)
  if (cm) return coded(CM_CODES[cm[1]!])
  const sf = /^SF([A-Z]{2})\d{4}$/.exec(name)
  return sf ? coded(SF_CODES[sf[1]!]) : null
}
// Latin Modern: LMRoman10-Bold, LMRomanCaps10-Regular, LMSansDemiCond10-Regular, LMMonoLt10-Bold, LMMathItalic10-Regular
const LM_CLASS: Readonly<Record<string, FontClass['cls']>> = {
  Roman: 'serif',
  Sans: 'sans',
  Mono: 'mono',
  Math: 'math',
}
const latinModern = (name: string): FontClass | null => {
  const m = /^LM(Roman|Sans|Mono|Math)([A-Za-z]*)\d+-([A-Za-z]+)$/.exec(name)
  if (!m) return null
  const cls = LM_CLASS[m[1]!]!,
    variant = m[2]!,
    style = m[3]!
  return fontClass(
    cls,
    CM_DESIGN[cls],
    /Demi/.test(variant) || /Bold/.test(style),
    /Slant|Unsl/.test(variant) || /Oblique|Italic/.test(style),
    /Caps/.test(variant),
    true,
  )
}
// Linux Libertine and Biolinum, Type 1 and OpenType: LinLibertineT, LinLibertineTB, LinLibertineOBI, LinBiolinumOBO; B
// and Z (semibold) are bold, I italic and O (Biolinum's) oblique
const libertine = (name: string): FontClass | null => {
  const m = /^Lin(Libertine|Biolinum)[TO]?([A-Z]{0,4})(?:-|$)/.exec(name)
  if (!m) return null
  const serif = m[1] === 'Libertine'
  return fontClass(
    serif ? 'serif' : 'sans',
    serif ? 'libertine' : 'biolinum',
    /[BZ]/.test(m[2]!),
    /[IO]/.test(m[2]!),
    false,
    true,
  )
}

/** a PDF font's class, weight, slant, small capitals and design, from its PostScript name (subset tag stripped) */
export function classifyFont(postScript: string): FontClass {
  const name = String(postScript ?? '').replace(SUBSET, '')
  if (!name || name.length > NAME_MAX) return fontClass('serif', 'other', false, false, false, false)
  const special = computerModern(name) ?? latinModern(name) ?? libertine(name)
  if (special) return special
  const bold = BOLD.test(name),
    italic = ITALIC.test(name),
    caps = CAPS.test(name)
  const row = DESIGNS.find((d) => d.ps.test(name))
  if (row) return fontClass(row.cls, row.design, row.bold ? row.bold.test(name) : bold, italic, caps, true)
  const cls = MONO_WORD.test(name) ? 'mono' : SANS_WORD.test(name) ? 'sans' : MATH_WORD.test(name) ? 'math' : 'serif'
  return fontClass(cls, 'other', bold, italic, caps, false)
}

/** the paper's body family, from the font probe's NFSS names (latex-front.mjs FONT_PROBE): the body's where it is a text
 *  family, else the roman's (a paper whose body is set sans keeps its serif's weights); `other` for a name of no family */
export function familyOfProbe(probe: { rm: string; sf: string; tt: string; body: string } | null): EnglishFamily {
  if (!probe) return 'other'
  for (const family of [probe.body, probe.rm]) {
    const name = String(family ?? '')
    const row = name.length <= NAME_MAX ? DESIGNS.find((d) => d.nfss?.test(name)) : null
    if (row?.cls === 'serif') return row.design as EnglishFamily
  }
  return 'other'
}

/** the paper's body family, from the layout file's fonts weighted by the lines each sets: the text family that sets the
 *  most (math, sans and mono faces are not the body); a name of no family weighs for `other` */
export function familyOfFonts(names: readonly string[], weights: readonly number[]): EnglishFamily {
  const total = new Map<string, number>(ENGLISH_FAMILIES.map((f) => [f, 0]))
  const n = Math.min(names?.length ?? 0, weights?.length ?? 0)
  for (let i = 0; i < n; i++) {
    const w = weights[i]
    if (typeof w !== 'number' || !Number.isFinite(w) || w <= 0) continue
    const c = classifyFont(names[i]!)
    if (c.cls !== 'serif' || !SERIF_DESIGN.has(c.design)) continue
    total.set(c.design, total.get(c.design)! + w)
  }
  let best: EnglishFamily = 'other',
    most = 0
  for (const f of ENGLISH_FAMILIES)
    if (total.get(f)! > most) {
      best = f
      most = total.get(f)!
    }
  return best
}
