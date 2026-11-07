// Today's readings of a PDF font's name, moved as they are (engine 065c1d973; held to today's by
// lab/typeset/tests/font-names.test.ts): a glyph's style as today's reader reads it, its `design` the Latin family whose face
// the reader draws in (layer-proto/fonts.mjs classifyFont), and the paper's English family from its fonts weighted by their
// glyphs (rules/font-roles.mjs classifyFont, here classifyRole, and familyOfFonts: B.faces' roles are set for it). What the
// typesetter reads of the part's fonts (Style.design, Part.paper.faces) by them: no rule reads a page's characters.

/** the PostScript name without its subset tag */
const bare = name => String(name ?? '').replace(/^[A-Z]{6}\+/, '')


/** { fam: 'serif'|'sans'|'mono'|'math', bold, italic, caps, design } from a PDF font's name; `design` names the Latin
 *  family whose face the browser should use (times, cm, palatino, charter, libertine, helvetica, cmss, courier, cmtt). A math
 *  face by its family's names: Euler's EUEX, EURM and EURB with their size, MathTime's MTMI, MTSY, MTEX and their bold, and
 *  XITS's math face, XITSMath, not its text face XITS-Regular (the ledger's math lines, the ink units' kept runs and the
 *  figure runs' words read it: LAYOUT 25 and PIPELINE 31, unreleased) */
export function classifyFont(name, fallbackFamily) {
  const n = bare(name)
  const low = n.toLowerCase()
  let fam = 'serif'
  if (/^(cmmi|cmsy|cmex|msam|msbm|eufm|eufb|eusm|eu(ex|rm|rb)\d|mt(mi|sy|ex|mib|syb)|rsfs|cmbsy|cmmib|stmary|wasy|txsy|txex|txmi|pxsy|pxex|pxmi|lmmath|latinmodern-math|stixmath|stixtwomath|xitsmath|cambria-?math|esint|bbold|bbm|dsrom|ntxmi|ntxsy|ntxexx|ntxbmi|newtxmi|newtxbmi|newpxmi|newpxbmi|newtxsy|newpxsy|zxmi|zplmi|mathdesign|mdbch|symbol|euler|lasy|line10|lcircle|futs|futm|mnsymbol|esstix|txmia|pxmia)/i.test(n) || /math|symbol/i.test(n)) fam = 'math'
  else if (/mono|courier|typewriter|inconsolata|consol|menlo|^(cm|lm|ec|tc)tt|^sftt|^txtt|^pcr|beramono|sourcecode|firamono|cmvtt|^zi4|nimbusmon|letter ?gothic/i.test(n)) fam = 'mono'
  else if (/sans|helvetica|arial|^(cm|lm)ss|^sfs[sxi]|^cmssbx|nimbussan|biolinum|grotesk|verdana|roboto|^lato|opensans|sourcesans|firasans|calibri|avant|futura|frutiger|myriad|segoe|tahoma|gillsans|optima|cabin|raleway|montserrat|^inter|heros|^phv|^uhvr|^qhv|arimo|dejavusans/i.test(n)) fam = 'sans'
  // PDF.js's own guess only for a face no name above tells (it says monospace for CMBX10 and CMR7 in 1512.03385)
  else if (fallbackFamily === 'monospace' && !/^(cm|lm|ec|tc|sf)|roman|serif|times|nimbus|termes|palatino|pagella|charter|libertin/i.test(n)) fam = 'mono'
  const bold = /bold|black|heavy|semibold|demibold|demi\b|-medi(?:ital)?$|-medi\b|^(cm|lm|ec)bx|^cmb\d|^sfbx|^sfsx|^cmssbx|^cmbxti|^cmmib|^cmbsy|-bd\b|^ptmb|^phvb|^linlibertinet?b|linlibertinetbi?$|libertinetb|-bol$|extrabold|ultrabold|-sb$/i.test(n)
  const italic = /italic|ital\b|ital$|oblique|slant|kursiv|inclined|^(cm|lm)ti|^cmsl|^sfti|^sfsl|^sfsi|^sfbi|^cmbxti|^cmbxsl|^cmssi|^cmitt|^cmsltt|^cmmi|-it$|-bi$|linlibertineti|linlibertinetbi|linbiolinumti|-ita?$|italicmt|obliquemt/i.test(n)
  const caps = /caps|^cmcsc|^sfcc|^sfxc|smallcap|-sc$|sc\d*$|^cmtcsc|^lmromancaps/i.test(n) && !/^cmsc/i.test(n)
  let design = 'times'
  if (fam === 'mono') design = /^(cm|lm|ec|tc)tt|^sftt|lmmono|cmvtt|cmitt|cmsltt/i.test(n) ? 'cmtt' : 'courier'
  else if (fam === 'sans') design = /^(cm|lm)ss|^sfs[sxi]|^cmssbx|lmsans/i.test(n) ? 'cmss' : 'helvetica'
  else if (/^(cm|lm|ec|tc)(r|bx|b|ti|sl|csc|u|dunh|fib|ff)\d|^cmbxti|^cmbxsl|^sf(rm|bx|ti|sl|cc|xc|bi)|lmroman|latinmodern|^cmmi|^cmsy|^cmex/i.test(n)) design = 'cm'
  else if (/palladio|palatino|pagella|^ppl|^pplx|^zpl/i.test(n)) design = 'palatino'
  else if (/charter|^bch/i.test(n)) design = 'charter'
  else if (/libertin/i.test(n)) design = 'libertine'
  else if (/times|nimbusrom|nimbusroman|termes|^ptm|^txr|^ntx|^tx(?!tt)|stixtwotext|stix-?regular|stixgeneral/i.test(n)) design = 'times'
  // a font with no recognisable name (a Type 3 bitmap font, a renamed subset): its class as PDF.js guesses it
  const known = /[a-z]{3}/i.test(n) && !/^(t3|type3)/i.test(low)
  return { fam, bold, italic, caps, design, known, name: n }
}

const DESIGNS = [
  // math: drawn as the layer's math face, set as the paper's math in TeX
  { design: 'cm', cls: 'math', ps: /^(?:MSAM|MSBM|EU(?:FM|FB|SM|SB|EX|RM|RB)|WASY|LASY|RSFS|STMARY|BBOLD|BBM|DSROM|DSSS|ESINT)\d/i },
  { design: 'other', cls: 'math', ps: /^(?:MnSymbol|LatinModernMath|TeXGyre\w*Math|STIX(?:Two)?Math|STIXSize|STIXIntegrals|STIXVariants|STIXNonUnicode|XITSMath|CambriaMath|AsanaMath|NewTX(?:B?MI|SY|EX)|NewPX(?:B?MI|SY|EX)|ntx(?:mi|sy|ex)|txsy|txex|txmia?|pxsy|pxex|pxmia?|PazoMath|zplmi|FourierMath|Md\w*(?:Sy|Ex|Mi)|SymbolMT|Symbol$|Symbol-|StandardSymL|StandardSymbolsPS|ZapfDingbats|Dingbats)/i },
  // mono
  { design: 'courier', cls: 'mono', nfss: /^(?:pcr|qcr|txtt|ucr|zco|NimbusMono|TeXGyreCursor)/, ps: /^(?:NimbusMonL|NimbusMono|Courier|TeXGyreCursor|zco-|LiberationMono|FreeMono)/ },
  { design: 'beramono', cls: 'mono', nfss: /^(?:fvm|BeraSansMono|DejaVuSansMono)/, ps: /^(?:BeraSansMono|DejaVuSansMono|BitstreamVeraSansMono|VeraSansMono)/ },
  { design: 'inconsolata', cls: 'mono', nfss: /^(?:zi4|Inconsolata)/, ps: /^Inconsolata/, bold: /zi4b|Bold/ },
  { design: 'cmtt', cls: 'mono', nfss: /^(?:cmtt|lmtt|cmvtt)$/, ps: /^CMUTypewriter/ },
  // sans
  { design: 'helvetica', cls: 'sans', nfss: /^(?:phv|qhv|txss|uhv|zhv|NimbusSans|TeXGyreHeros)/, ps: /^(?:NimbusSanL|NimbusSans|Helvetica|Arial|TeXGyreHeros|zhv-|LiberationSans|FreeSans)/ },
  { design: 'cmss', cls: 'sans', nfss: /^(?:cmss|lmss)$/, ps: /^CMUSansSerif/ },
  // Biolinum, Libertine's sans (Libertinus Sans, its fork, drawn in it)
  { design: 'biolinum', cls: 'sans', nfss: /^(?:LinuxBiolinum|fxb|LibertinusSans)/, ps: /^(?:LibertinusSans|LinBiolinum|LinuxBiolinum)/ },
  // text: the English families
  { design: 'cm', cls: 'serif', nfss: /^(?:cmr|lmr|cmdh|lmdh|cmfib|cmfr)$/, ps: /^CMU(?:Serif|ClassicalSerif)/ },
  { design: 'times', cls: 'serif', nfss: /^(?:ptm|qtm|ntx|txr|utm|ztm|Tempora|TeXGyreTermes|NimbusSerif)/, ps: /^(?:NimbusRomNo9L|NimbusRom|NimbusRoman|Times|TeXGyreTermes|Tempora|ztm-)/ },
  { design: 'libertine', cls: 'serif', nfss: /^(?:LinuxLibertine|fxl|LibertinusSerif|Libertinus(?!Sans|Mono|Math))/, ps: /^(?:LibertinusSerif|LinLibertine|LinuxLibertine)/ },
  { design: 'palatino', cls: 'serif', nfss: /^(?:ppl|qpl|npx|zpl|Domitian|TeXGyrePagella)/, ps: /^(?:URWPalladioL|Palatino|TeXGyrePagella|P052|Domitian|Palladio|BookAntiqua|Pazo(?!Math))/ },
  { design: 'charter', cls: 'serif', nfss: /^(?:bch|mdbch|XCharter|Charter)/, ps: /^(?:XCharter|CharterBT|BitstreamCharter|Charter|CharisSIL)/ },
  { design: 'garamond', cls: 'serif', nfss: /^(?:ebg|EBGaramond|ugm|mdugm|zgm|GaramondLibre|garamondx)/, ps: /^(?:EBGaramond|AGaramond|AdobeGaramond|Garamond|URWGaramond)/ },
  { design: 'utopia', cls: 'serif', nfss: /^(?:put|mdput|fut|Erewhon|Utopia)/, ps: /^(?:Utopia|Erewhon)/ },
]
/** the English families a paper's body is set in */
const ENGLISH_FAMILIES = Object.freeze(['cm', 'times', 'libertine', 'palatino', 'charter', 'garamond', 'utopia', 'other'])
const SERIF_DESIGN = new Set(ENGLISH_FAMILIES)

// style words: URW's Medi(um) is its bold, and its Regu, Ital and Obli abbreviations; Medium spelled out is not bold
const BOLD = /(?:Bold|Bol(?![a-z])|Black|Heavy|Demi|Semibold|SemiBold|ExtraBold|Medi(?![a-z]))/
const ITALIC = /(?:Italic|Ital(?![a-z])|Ita(?![a-z])|Oblique|Obli(?![a-z])|Slant|Inclined|Kursiv|It$)/
const CAPS = /(?:SmallCaps|Caps|Capitals|[a-z]SC$|-SC$|-Sc$)/
// a name no table holds: its class guessed from its words
const MONO_WORD = /(?:Mono|Courier|Typewriter|Consol|Code|Menlo|Monaco|Fixed)/i
const SANS_WORD = /(?:Sans|Gothic|Grotesk|Arial|Helvet|Verdana|Calibri|Segoe|Tahoma|Futura|Avenir|Univers|Frutiger)/i
const MATH_WORD = /(?:Math|Symbol|Dingbat)/i

const SUBSET = /^[A-Z]{6}\+/
// longer than any font's name: refused as unknown, so that no pattern runs over a hostile string
const NAME_MAX = 128
const fontClass = (cls, design, bold, italic, caps, known) => ({ cls, bold, italic, caps, design, known })

// Computer Modern (CMR10, CMBXTI10, CMSSBX10) and cm-super (SFRM1000, SFBX1200): a code of the series and shape
const CM_CODES = {
  R: 'serif', B: 'serif b', BX: 'serif b', TI: 'serif i', SL: 'serif i', BXTI: 'serif b i', BXSL: 'serif b i', CSC: 'serif c',
  U: 'serif i', DUNH: 'serif', FIB: 'serif', FF: 'serif', FI: 'serif i',
  SS: 'sans', SSBX: 'sans b', SSI: 'sans i', SSDC: 'sans b', SSQ: 'sans', SSQI: 'sans i',
  TT: 'mono', ITT: 'mono i', SLTT: 'mono i', TCSC: 'mono c', TEX: 'mono', VTT: 'mono',
  MI: 'math', MIB: 'math b', SY: 'math', BSY: 'math b', EX: 'math',
}
const SF_CODES = {
  RM: 'serif', RB: 'serif b', BX: 'serif b', TI: 'serif i', BI: 'serif b i', SL: 'serif i', BL: 'serif b i', CC: 'serif c',
  XC: 'serif b c', SC: 'serif i c', UI: 'serif i', DH: 'serif',
  SS: 'sans', SX: 'sans b', SI: 'sans i', SO: 'sans b i', QI: 'sans i',
  TT: 'mono', IT: 'mono i', ST: 'mono i', TC: 'mono c', VT: 'mono', VI: 'mono i',
}
const CM_DESIGN = { serif: 'cm', sans: 'cmss', mono: 'cmtt', math: 'cm' }
const coded = code => {
  if (!code) return null
  const [cls, ...marks] = code.split(' ')
  return fontClass(cls, CM_DESIGN[cls], marks.includes('b'), marks.includes('i'), marks.includes('c'), true)
}
const computerModern = name => {
  const cm = /^CM([A-Z]+)\d{1,2}$/.exec(name)
  if (cm) return coded(CM_CODES[cm[1]])
  const sf = /^SF([A-Z]{2})\d{4}$/.exec(name)
  return sf ? coded(SF_CODES[sf[1]]) : null
}
// Latin Modern: LMRoman10-Bold, LMRomanCaps10-Regular, LMSansDemiCond10-Regular, LMMonoLt10-Bold, LMMathItalic10-Regular
const LM_CLASS = { Roman: 'serif', Sans: 'sans', Mono: 'mono', Math: 'math' }
const latinModern = name => {
  const m = /^LM(Roman|Sans|Mono|Math)([A-Za-z]*)\d+-([A-Za-z]+)$/.exec(name)
  if (!m) return null
  const cls = LM_CLASS[m[1]], variant = m[2], style = m[3]
  return fontClass(cls, CM_DESIGN[cls], /Demi/.test(variant) || /Bold/.test(style), /Slant|Unsl/.test(variant) || /Oblique|Italic/.test(style), /Caps/.test(variant), true)
}
// Linux Libertine and Biolinum, Type 1 and OpenType: LinLibertineT, LinLibertineTB, LinLibertineOBI, LinBiolinumOBO; B
// and Z (semibold) are bold, I italic and O (Biolinum's) oblique
const libertine = name => {
  const m = /^Lin(Libertine|Biolinum)[TO]?([A-Z]{0,4})(?:-|$)/.exec(name)
  if (!m) return null
  const serif = m[1] === 'Libertine'
  return fontClass(serif ? 'serif' : 'sans', serif ? 'libertine' : 'biolinum', /[BZ]/.test(m[2]), /[IO]/.test(m[2]), false, true)
}

/** a PDF font's class, weight, slant, small capitals and design, from its PostScript name (subset tag stripped) */
export function classifyRole(postScript) {
  const name = String(postScript ?? '').replace(SUBSET, '')
  if (!name || name.length > NAME_MAX) return fontClass('serif', 'other', false, false, false, false)
  const special = computerModern(name) ?? latinModern(name) ?? libertine(name)
  if (special) return special
  const bold = BOLD.test(name), italic = ITALIC.test(name), caps = CAPS.test(name)
  const row = DESIGNS.find(d => d.ps.test(name))
  if (row) return fontClass(row.cls, row.design, row.bold ? row.bold.test(name) : bold, italic, caps, true)
  const cls = MONO_WORD.test(name) ? 'mono' : SANS_WORD.test(name) ? 'sans' : MATH_WORD.test(name) ? 'math' : 'serif'
  return fontClass(cls, 'other', bold, italic, caps, false)
}

/** the paper's body family, from the layout file's fonts weighted by the lines each sets: the text family that sets the
 *  most (math, sans and mono faces are not the body); a name of no family weighs for `other` */
export function familyOfFonts(names, weights) {
  const total = new Map(ENGLISH_FAMILIES.map(f => [f, 0]))
  const n = Math.min(names?.length ?? 0, weights?.length ?? 0)
  for (let i = 0; i < n; i++) {
    const w = weights[i]
    if (typeof w !== 'number' || !Number.isFinite(w) || w <= 0) continue
    const c = classifyRole(names[i])
    if (c.cls !== 'serif' || !SERIF_DESIGN.has(c.design)) continue
    total.set(c.design, total.get(c.design) + w)
  }
  let best = 'other', most = 0
  for (const f of ENGLISH_FAMILIES) if (total.get(f) > most) { best = f; most = total.get(f) }
  return best
}
