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
// v0's changes: loadWebFaces takes the faces' URLs from its host; and the role table's faces (font-roles.mjs, the
// maintainer's ruling of 2026-10-06: Source Han Serif for CJK, Nimbus Roman and Sans, FreeMono, CMU and Domitian for the
// paper's families, every face a file we serve) in place of the prototype's system faces once setRoleFaces is called:
// faceOf then names the face faceFor gives, with its fallbacks (and, for a Latin run of a CJK target, the target's
// body, as the prototype's tail), at its own weight and its size correction (a Hangul face's), Japanese and Korean
// emphasis upright, and roleFaceSet serves the files: each face as its host gives it (slices, each a FontFace over a file
// restricted to its code points, or the whole file), a unit drawn only in what is served of its runs' faces, never in a
// face the reader's device holds: no source of a face but its URL, no font rule written here, no generic family. A
// character no served slice holds keeps its unit the original's.
import { COVERAGE } from '../font-coverage.mjs'
import { canDrawIn, FACES, faceFor, rolesFor } from '../font-roles.mjs'

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

/** the role table's roles v0 draws in (setRoleFaces), or null: the prototype's own faces */
let ROLES = null
/** v0 drawn in the role table's faces for a target and the paper's English family (font-roles.mjs familyOfFonts); a
 *  falsy target goes back to the prototype's faces */
export function setRoleFaces(target, family) { ROLES = target ? rolesFor(target, family) : null }
export const roleFaces = () => ROLES
/** the role table's face of a run: faceFor's, as faceOf's object, with the ids of its faces and fallbacks (`ids`) */
function roleFaceOf(st, cls) {
  const roles = ROLES
  const id = faceFor(roles, { script: cls, cls: st.fam === 'math' ? 'serif' : st.fam, design: st.design ?? 'times', bold: !!st.bold, italic: !!st.italic, caps: !!st.caps })
  const F = FACES[id]
  const ids = [...new Set([id, ...(roles.fallbacks[id] ?? []), ...(cls !== 'cjk' && roles.cjk ? [roles.cjk.body] : [])])].filter(f => FACES[f])
  const kai = cls === 'cjk' && st.italic && !!roles.cjk?.italic
  return { family: [...new Set(ids.map(f => `"${FACES[f].family}"`))].join(', '), weight: F.weight, style: F.style, oblique: 0, stand: st.italic ? (cls === 'cjk' ? (kai ? 'kai' : '') : 'italic') : '', caps: !!st.caps && cls !== 'cjk', size: F.size ?? 1, id, ids }
}
// ---- the role table's faces as the host serves them

/** a value's kind, for a refusal: its type, never its text */
const kindOf = v => (v === null ? 'null' : Array.isArray(v) ? 'an array' : typeof v)
/** a slice's file: the characters of a plain URL, none of which can end the quoted url() it is written in */
const SLICE_URL = /^[A-Za-z0-9\-._~:/?#@!$&*+,;=%]+$/
/** the FontFaces added to document.fonts, once each, by face, file and code points: every run over the same page, or the
 *  next paper's, finds them there (the browser keeps what they loaded) */
const added = new Map()
const hex = n => n.toString(16).toUpperCase()
/** a slice's unicode-range descriptor from its [start, end] pairs */
const unicodeRangeOf = ranges => {
  const out = []
  for (let i = 0; i + 1 < ranges.length; i += 2) out.push(ranges[i] === ranges[i + 1] ? `U+${hex(ranges[i])}` : `U+${hex(ranges[i])}-${hex(ranges[i + 1])}`)
  return out.join(', ')
}
/** several sorted, disjoint range lists as one */
function mergeRanges(lists) {
  const all = []
  for (const r of lists) for (let i = 0; i + 1 < r.length; i += 2) all.push([r[i], r[i + 1]])
  all.sort((a, b) => a[0] - b[0])
  const out = []
  for (const [a, z] of all) {
    if (out.length && a <= out.at(-1) + 1) out[out.length - 1] = Math.max(out.at(-1), z)
    else out.push(a, z)
  }
  return out
}
/** what a host gave for a face (faceSources), checked: null (not served), or its slices, each { url, ranges } with a plain
 *  URL and its code points as [start, end] pairs, ascending and apart; a slice with none is left out. A wrong shape is
 *  named by its type, never converted */
function slicesOf(id, v) {
  if (v === null) return null
  if (!Array.isArray(v)) throw new TypeError(`faceSources(${id}): the slices or null, not ${kindOf(v)}`)
  const out = []
  v.forEach((s, n) => {
    if (s === null || typeof s !== 'object') throw new TypeError(`faceSources(${id})[${n}]: a slice { url, ranges }, not ${kindOf(s)}`)
    const { url, ranges } = s
    if (typeof url !== 'string' || !SLICE_URL.test(url)) throw new TypeError(`faceSources(${id})[${n}].url: a plain URL string, not ${typeof url === 'string' ? 'a string with other characters' : kindOf(url)}`)
    if (!Array.isArray(ranges) || ranges.length % 2) throw new TypeError(`faceSources(${id})[${n}].ranges: [start, end] pairs, not ${Array.isArray(ranges) ? 'an odd count' : kindOf(ranges)}`)
    let after = -1
    for (let i = 0; i < ranges.length; i += 2) {
      const a = ranges[i], z = ranges[i + 1]
      if (!Number.isInteger(a) || !Number.isInteger(z) || a <= after || z < a || z > 0x10ffff) throw new TypeError(`faceSources(${id})[${n}].ranges: code points ascending and apart`)
      after = z
    }
    if (ranges.length) out.push({ url, ranges })
  })
  return out
}
/** one slice as one FontFace, added to document.fonts once. A whole file (the default, `ranges` null) is declared with no
 *  unicode-range; a slice with its own */
function sliceFace(F, url, ranges) {
  const unicodeRange = ranges ? unicodeRangeOf(ranges) : ''
  const key = `${F.id}|${url}|${unicodeRange}`
  let f = added.get(key)
  if (!f) {
    f = new FontFace(F.family, `url("${url}")`, { weight: String(F.weight), style: F.style, ...(ranges ? { unicodeRange } : {}) })
    document.fonts.add(f)
    added.set(key, f)
  }
  return f
}
/** the FontFaces whose load failed let go, so that an open declares them afresh (a failed FontFace stays failed: it is
 *  kept for the run it failed in, whose units it leaves the original's, and let go before the next) */
function forgetFailed() {
  for (const [key, f] of added) if (f.status === 'error') { document.fonts.delete(f); added.delete(key) }
}

/**
 * The role table's faces as one run is given them. `faceSources(id)`: a promise of the face's slices (each
 * { url, ranges }: its file on the host's origin and its code points as [start, end] pairs), null where the host does not
 * serve the face, rejected where it could not say; absent, each face is its whole file at `faceUrl(file)`, covering
 * COVERAGE[id]. A face's table is asked the first time a run needs it and awaited: a face asked before its table has
 * loaded is never read as not served.
 *
 *   check(runs)        why a unit whose runs are `runs` (runsOfTokens) cannot be drawn: 'served' (a character in no slice
 *                      of its runs' faces and their fallbacks, or a run's own face not served), 'face' (a table or a slice
 *                      failed), else null, the slices its characters are in loaded. No other face is tried
 *   ready(face, text)  the slices of `face` that hold `text` loaded, as far as they can be (a measure is taken at once)
 *   warm(id)           the face's table asked and its first slice fetched, at once, not awaited
 */
export function roleFaceSet({ faceSources = null, faceUrl = file => `/fonts/${encodeURIComponent(file)}` } = {}) {
  forgetFailed()
  const tables = new Map()
  /** a face's table: null (not served) or { lists (its served ranges, as one sorted list), faces (its FontFaces) } */
  const table = id => {
    let t = tables.get(id)
    if (!t) {
      t = (async () => {
        const F = FACES[id]
        if (!faceSources) return { lists: [COVERAGE[id]], faces: [sliceFace(F, faceUrl(F.file), null)] }
        const slices = slicesOf(id, await faceSources(id))
        return slices && { lists: [mergeRanges(slices.map(sl => sl.ranges))], faces: slices.map(sl => sliceFace(F, sl.url, sl.ranges)) }
      })()
      tables.set(id, t)
    }
    return t
  }
  /** the tables of a face's ids, in order; null where one could not be had */
  const tablesOf = async ids => {
    const got = await Promise.allSettled(ids.map(table))
    return got.some(g => g.status === 'rejected') ? null : got.map(g => g.value)
  }
  const drawn = new Map(), seen = new Map()
  const setOf = (m, font) => m.get(font) ?? m.set(font, new Set()).get(font)
  /** the characters of `text` a font has not drawn yet */
  const freshOf = (m, font, text) => {
    const done = setOf(m, font)
    let out = ''
    for (const ch of new Set(text)) if (!done.has(ch)) out += ch
    return out
  }
  const glyphs = text => [...text].filter(ch => !canDrawIn(ch, []))
  /** a run's verdict before anything is fetched: a refusal, or the characters of its text not yet loaded (none: nothing
   *  to ask). White space is loaded with the rest, its width is measured in the face, but asks no glyph of it */
  const prepare = async ({ face, text }) => {
    const font = fontString(face, 100), fresh = freshOf(drawn, font, text)
    if (!fresh) return { fresh }
    const got = await tablesOf(face.ids)
    if (!got) return { why: 'face' }
    const need = glyphs(fresh)
    if (need.length) {
      // (the run's own face must be served: its fallbacks alone would draw it in glyphs it was not set in)
      if (!got[0]?.faces.length) return { why: 'served', missing: need.slice(0, 8).map(ch => ch.codePointAt(0)) }
      const lists = got.flatMap(t => (t ? t.lists : []))
      const missing = need.filter(ch => !canDrawIn(ch, lists))
      if (missing.length) return { why: 'served', missing: missing.slice(0, 8).map(ch => ch.codePointAt(0)) }
    }
    return { font, fresh }
  }
  return {
    async check(runs) {
      const plan = []
      for (const r of runs) {
        const v = await prepare(r)
        if (v.why) return v.why === 'served' ? { why: 'served', missing: v.missing } : { why: 'face' }
        if (v.fresh) plan.push(v)
      }
      const results = await Promise.allSettled(plan.map(async v => document.fonts.load(v.font, v.fresh)))
      let failed = false
      results.forEach((r, n) => {
        if (r.status === 'fulfilled') for (const ch of plan[n].fresh) setOf(drawn, plan[n].font).add(ch)
        else failed = true
      })
      return failed ? { why: 'face' } : null
    },
    async ready(face, text) {
      const font = fontString(face, 100), fresh = freshOf(seen, font, text)
      if (!fresh) return
      await tablesOf(face.ids)
      try { await document.fonts.load(font, fresh) } catch { return }
      for (const ch of fresh) setOf(seen, font).add(ch)
    },
    warm(id) {
      if (FACES[id]) table(id).then(t => t?.faces[0]?.load()).catch(() => {})
    },
  }
}

/** the faces a unit's tokens are measured and drawn in, each with the characters it is set with: [{ face, text }]. A space
 *  is measured in its face (layer2.mjs tokensOf2), a hyphenated word is cut with a hyphen of its own, in the word's face */
export function runsOfTokens(tokens) {
  const by = new Map()
  for (const t of tokens) {
    if (!t.face?.ids || !(t.s || t.space)) continue
    const font = fontString(t.face, 100)
    let r = by.get(font)
    if (!r) by.set(font, (r = { face: t.face, chars: new Set() }))
    for (const ch of t.s ?? ' ') r.chars.add(ch)
    if (t.hyph) r.chars.add('-')
  }
  return [...by.values()].map(r => ({ face: r.face, text: [...r.chars].join('') }))
}
/** the id of the face a target's body text is drawn in: its CJK body where it has one, else its serif at Times (the
 *  paper's own family is read from its first page). Call after setRoleFaces */
export function bodyFaceId() {
  const roles = ROLES
  return roles.cjk ? roles.cjk.body : faceFor(roles, { script: 'latin', cls: 'serif', design: 'times', bold: false, italic: false, caps: false })
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
  if (ROLES) return roleFaceOf(st, cls)
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
export const fontString = (face, px) => (face.id ? `${face.style === 'italic' ? 'italic ' : ''}${face.caps ? 'small-caps ' : ''}${face.weight} ${px * face.size}px ${face.family}` : `${face.style === 'italic' ? 'italic ' : ''}${face.caps ? 'small-caps ' : ''}${face.weight === 700 ? 'bold ' : ''}${px}px ${face.family}`)

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
