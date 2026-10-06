// src/pdf-reader/engine/layer-proto/fonts.mjs
// Ported from the private prototype (readarxiv-web, exp/instant-layer at 9e56fca,
// web/prototypes/instant-layer/fonts.js), 2026-10-06, as the instant layer's v0: the original's fonts and the faces the
// translation is drawn in. Our own code, so no licence applies; the provenance is kept so that every number the
// prototype was approved on traces back to it. Unchanged in behaviour: the changes are the module paths, CJK characters
// written as \u escapes (the English gate), imports nothing uses left out, and what is named below. The prototype's own
// description follows.
//
// The original's fonts, read from PDF.js, and the faces the translation is drawn in.
//
// - classifyFont: a PDF font's class (serif, sans, mono, math), weight, slant and small capitals, from its PostScript
//   name (PDF.js's commonObjs after the page is drawn). The text content's own `fontFamily` is no help: it is PDF.js's
//   fallback guess, and gives "sans-serif" for Nimbus Roman (Times) on every paper measured. The name is what TeX and
//   the class chose: NimbusRomNo9L-Medi (Times bold), CMTI10 (Computer Modern text italic), SFBX1200, LMRoman10-Bold…
// - facesFor: per target, the faces a translated run takes by its class, weight and slant. CJK faces follow the
//   public repo's TeX path (src/pdf-reader/engine/scripts.mjs CJK): a Song/Ming serif, its bold, Kai for italic in
//   Chinese (FandolKai, bkai00mp: ctex's own \itshape); Japanese and Korean have no italic face there, and take an
//   oblique of their serif here (see the report). Latin and Cyrillic runs keep the original's family where the browser
//   has one (Times, Latin Modern from TinyTeX's OpenType files served by serve.mjs, Palatino, Charter, Helvetica).
//
// v0's change: loadWebFaces takes the faces' URLs from its host.

/** the PostScript name without its subset tag */
const bare = name => String(name ?? '').replace(/^[A-Z]{6}\+/, '')

/** { fam: 'serif'|'sans'|'mono'|'math', bold, italic, caps, design } from a PDF font's name; `design` names the Latin
 *  family whose face the browser should use (times, cm, palatino, charter, libertine, helvetica, cmss, courier, cmtt) */
export function classifyFont(name, fallbackFamily) {
  const n = bare(name)
  const low = n.toLowerCase()
  let fam = 'serif'
  if (/^(cmmi|cmsy|cmex|msam|msbm|eufm|eufb|eusm|rsfs|cmbsy|cmmib|stmary|wasy|txsy|txex|txmi|pxsy|pxex|pxmi|lmmath|latinmodern-math|stixmath|stixtwomath|xits|cambria-?math|esint|bbold|bbm|dsrom|ntxmi|ntxsy|ntxexx|ntxbmi|newtxmi|newtxbmi|newpxmi|newpxbmi|newtxsy|newpxsy|zxmi|zplmi|mathdesign|mdbch|symbol|euler|lasy|line10|lcircle|futs|futm|mnsymbol|esstix|txmia|pxmia)/i.test(n) || /math|symbol/i.test(n)) fam = 'math'
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

/** a style's key: what the style match rate compares (class, weight, slant) */
export const styleKey = s => `${s.fam === 'math' ? 'serif' : s.fam}|${s.bold ? 'b' : 'r'}|${s.italic ? 'i' : 'u'}`

// ---- the faces: CSS family lists, the same strings for canvas measuring and SVG drawing

const LATIN = {
  times: '"Times New Roman", Times',
  cm: '"LM Roman 10", "Times New Roman"',
  palatino: 'Palatino, "Palatino Linotype", "Times New Roman"',
  charter: 'Charter, "Bitstream Charter", "Times New Roman"',
  libertine: '"Linux Libertine O", "Libertinus Serif", "Times New Roman"',
  helvetica: 'Helvetica, Arial',
  cmss: '"LM Sans 10", Helvetica',
  courier: '"Courier New", Courier',
  cmtt: '"LM Mono 10", Menlo',
}
/** a Cyrillic face for a Latin design that has none (Latin Modern has no Cyrillic; CM-Super's Cyrillic is not served) */
const CYRILLIC = { cm: '"Times New Roman"', cmss: 'Helvetica', cmtt: 'Menlo', libertine: '"Times New Roman"', charter: '"Times New Roman"' }

/** per target: the CJK families for serif, sans and Kai, and how an italic CJK run is drawn */
const CJK_FACES = {
  zh: { serif: '"Songti SC", STSong', sans: '"PingFang SC", "Heiti SC"', kai: '"Kaiti SC", STKaiti', italic: 'kai' },
  'zh-TW': { serif: '"Songti TC", "LiSong Pro"', sans: '"PingFang TC"', kai: '"Kaiti TC", "Kaiti SC"', italic: 'kai' },
  ja: { serif: '"Hiragino Mincho ProN"', sans: '"Hiragino Sans", "Hiragino Kaku Gothic ProN"', kai: null, italic: 'oblique' },
  ko: { serif: '"Nanum Myeongjo", NanumMyeongjo, AppleMyungjo', sans: '"Apple SD Gothic Neo", NanumGothic', kai: null, italic: 'oblique' },
}
export const CJK_TARGETS = new Set(Object.keys(CJK_FACES))
export const scriptOfTarget = to => (to === 'zh' ? 'Hans' : to === 'zh-TW' ? 'Hant' : to === 'ja' ? 'Jpan' : to === 'ko' ? 'Kore' : to === 'ru' ? 'Cyrl' : 'Latn')
/** the slant of an oblique CJK run, in degrees (Times Italic's is 15.5; a CJK face slanted as far reads as broken) */
export const OBLIQUE_DEG = 10

/**
 * The face a run is drawn in: { family (CSS list), weight, style ('normal'|'italic'), oblique (degrees, a skew the SVG
 * applies), stand (what the run's slant became: 'italic', 'kai', 'oblique', '') }. `cls`: 'cjk' for a run of CJK
 * characters, 'latin' for the rest. `st`: { fam, bold, italic, design, caps }.
 */
export function faceOf(st, cls, to) {
  const design = st.fam === 'mono' ? (st.design === 'cmtt' ? 'cmtt' : 'courier') : st.fam === 'sans' ? (st.design === 'cmss' ? 'cmss' : 'helvetica') : (LATIN[st.design] ? st.design : 'times')
  const latin = LATIN[design]
  const cyr = to === 'ru' && CYRILLIC[design] ? `, ${CYRILLIC[design]}` : ''
  const weight = st.bold ? 700 : 400
  const cjk = CJK_FACES[to]
  if (cls === 'cjk' && cjk) {
    const base = st.fam === 'sans' || st.fam === 'mono' ? cjk.sans : cjk.serif
    if (st.italic && cjk.italic === 'kai' && st.fam !== 'sans' && st.fam !== 'mono') return { family: `${cjk.kai}, ${cjk.serif}`, weight, style: 'normal', oblique: 0, stand: 'kai' }
    return { family: `${base}, ${latin}`, weight, style: 'normal', oblique: st.italic ? OBLIQUE_DEG : 0, stand: st.italic ? 'oblique' : '' }
  }
  const tail = cjk ? `, ${st.fam === 'sans' || st.fam === 'mono' ? cjk.sans : cjk.serif}` : ''
  return { family: `${latin}${cyr}${tail}, serif`, weight, style: st.italic ? 'italic' : 'normal', oblique: 0, stand: st.italic ? 'italic' : '', caps: !!st.caps }
}

/** the canvas font string of a face at `px` */
export const fontString = (face, px) => `${face.style === 'italic' ? 'italic ' : ''}${face.caps ? 'small-caps ' : ''}${face.weight === 700 ? 'bold ' : ''}${px}px ${face.family}`

// ---- web fonts the browser lacks: Latin Modern from TinyTeX's OpenType files (serve.mjs /fonts/…)

const WEB = {
  'LM Roman 10': [['lmroman10-regular', 400, 'normal'], ['lmroman10-bold', 700, 'normal'], ['lmroman10-italic', 400, 'italic'], ['lmroman10-bolditalic', 700, 'italic']],
  'LM Sans 10': [['lmsans10-regular', 400, 'normal'], ['lmsans10-bold', 700, 'normal'], ['lmsans10-oblique', 400, 'italic']],
  'LM Mono 10': [['lmmono10-regular', 400, 'normal'], ['lmmono10-italic', 400, 'italic']],
}
const loaded = new Map()
/** the web faces a set of designs needs, loaded (cached across calls); resolves when they can be measured. `urlOf`: a
 *  face file's URL by its name (the prototype's host served TinyTeX's OpenType files at /fonts/<name>.otf) */
export function loadWebFaces(designs, urlOf = file => `/fonts/${file}.otf`) {
  const want = new Set()
  for (const d of designs) {
    if (d === 'cm') want.add('LM Roman 10')
    if (d === 'cmss') want.add('LM Sans 10')
    if (d === 'cmtt') want.add('LM Mono 10')
  }
  return Promise.all([...want].map(family => {
    if (!loaded.has(family)) {
      loaded.set(family, Promise.all(WEB[family].map(([file, weight, style]) => {
        const f = new FontFace(family, `url(${urlOf(file)})`, { weight: String(weight), style })
        document.fonts.add(f)
        return f.load().catch(() => null)
      })))
    }
    return loaded.get(family)
  }))
}
