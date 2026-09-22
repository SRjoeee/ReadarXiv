// Typesetting by writing system (#32). What a translation needs from TeX besides its text — the font its letters come
// from, the engine that can set them, how far apart its lines stand — follows from the script the target language is
// written in; the language names only the locale babel loads (\babelprovide[import=<BCP 47 tag>]), which brings the
// captions (Figure as Abbildung, Figura, Рис.), the hyphenation patterns and the direction for every language babel has an
// ini file for. So all languages of one script are set alike, and a change made for one script reaches no other.
//
// An alphabet stays with the paper's own engine: pdfLaTeX sets it once its letters' font encoding is the document's
// default, and the paper's families fall back to that encoding's own where they have none — as a Russian author's
// pdfLaTeX paper does. That keeps the paper's fonts, microtype and every package that works only under pdfTeX
// (switched to XeLaTeX, one paper of 24 lost its math fonts in every language). CJK goes to XeLaTeX with xeCJK. When an
// engine cannot set a letter it says so (`unsettable` in live.mjs), and the chain moves on. A paper the author set with
// XeLaTeX keeps its engine; so does a LuaLaTeX one for an alphabet, while for CJK it goes to XeLaTeX with xeCJK, where
// Lua-only code fails (none of the corpus's 123 papers is set with LuaLaTeX, so no LuaLaTeX CJK path could be measured).
// When no strategy sets the translation, the reader keeps what it shows. A script not listed here has no strategy yet:
// strategiesFor throws, and the reader says it cannot typeset that language (Devin on #294). Every font named is in
// TeX Live 2026. Measured with spikes/lang-gate.mjs.
import { latinFontsFor } from './latex-front.mjs'

export const scriptOf = lang => new Intl.Locale(lang).maximize().script
/** the engines whose fonts are 8-bit: an alphabet needs its encoding under them, CJK its CJKutf8 (classic LaTeX, which the
 *  browser compiles with pdfLaTeX, is one: Devin and Codex on #294) */
const EIGHT_BIT = new Set(['pdflatex', 'latex'])

/**
 * CJK. xeCJK sets the script in a family of its own, leaves the paper's Latin faces (latinFontsFor) to everything
 * else, breaks lines between characters and keeps punctuation off a line's start; a script that spaces its words
 * (Hangul) keeps the spaces. CJKutf8 under the paper's own pdfLaTeX takes the papers XeLaTeX cannot (the chain took
 * Chinese from 98 to 106 of 113, REPORT fourth addendum); babel has no CJK captions under pdfTeX, so there they stay
 * the paper's.
 *
 * `leading` multiplies the paper's own line spacing at the end of the preamble (a class that sets its spacing in the
 * body, as ICASSP's \ninept does, keeps its own). CJK characters fill their em square, so lines of them stand closer
 * than Latin lines at the same spacing, and a translation is as long as its language makes it: the factor is the
 * script's, measured on the gate's pages (`--tune`, REPORT eleventh addendum). Chinese at ctex's 1.3 comes out as long
 * as the original (median pages 1.00, 19 of 24 papers within 10 %). Japanese and Korean translations are longer: at 1.3
 * they came out a fifth longer (median 1.20 and 1.17, 1 of 24 within 10 %), at the paper's own spacing as long (median
 * 1.00, 22 of 24). Which face, size and spacing suit each language beside the paper's Latin text is open (#295).
 */
export const CJK = {
  Hans: { font: '[BoldFont=FandolSong-Bold.otf,ItalicFont=FandolKai-Regular.otf]{FandolSong-Regular.otf}', cjkutf8: 'gbsn', leading: 1.3 },
  Hant: { font: '[AutoFakeBold=2.5,ItalicFont=bkai00mp.ttf]{bsmi00lp.ttf}', cjkutf8: 'bsmi', leading: 1.3 },
  Jpan: { font: '[AutoFakeBold=2.5]{ipaexm.ttf}', cjkutf8: 'ipxm', leading: 1 },
  Kore: { font: '[BoldFont=UnBatangBold.ttf]{UnBatang.ttf}', cjkutf8: 'mj', spaced: true, leading: 1 },
}

/**
 * The font encoding that holds an alphabet's letters under pdfLaTeX, made the document's default (loaded last); Latin
 * needs none. Loaded among others with babel choosing, it is not enough: babel switches the running text but not the
 * moving arguments (headings, captions). T2A also sets the Latin letters of the paper's own names (Mądry, Kępa). Not
 * Vietnamese: its encoding, T5, lacks T1's ogonek, and a reference's Mądry lost it with T5 as the default — its letters
 * go on to XeLaTeX, like any letter no encoding holds
 */
const ENCODING = { Cyrl: 'T2A' }
/**
 * With the alphabet's encoding the default, every role (text, sans, mono) needs a face that has it, or LaTeX falls back
 * to its one default, Computer Modern's roman: a Times paper came out in CM roman throughout, its tables wider (CM is
 * wider than Times) and its code no longer monospaced. So each role keeps its face where the face has the encoding —
 * TeX checks for its font definition at compile time — and otherwise takes one of the same design (Times → Tempora,
 * Helvetica → PT Sans, Courier → PT Mono, Latin Modern → Computer Modern) or at least of the same role.
 *
 * Only the shapes that face declares are mapped. A shape it lacks (Tempora has no small capitals) then falls back as it
 * would within any family: to the upright, with a warning. The kernel's \DeclareFontFamilySubstitution maps every shape
 * and stops the compile at the first one the face lacks: Russian lost letters on nine papers of 24, eight of them to
 * small capitals and one to a bold series Computer Modern's sans has only as bx. The size function is written without
 * spaces (`ssub*`) because an .fd file is read with spaces ignored, and so is the kernel's own definition; a preamble
 * is not.
 */
const DESIGN = {
  T2A: {
    ptm: 'Tempora-TLF', txr: 'Tempora-TLF', ntxtlf: 'Tempora-TLF', ntxtosf: 'Tempora-TLF',
    phv: 'PTSans-TLF', qhv: 'PTSans-TLF', txss: 'PTSans-TLF',
    pcr: 'PTMono-TLF', txtt: 'PTMono-TLF', zi4: 'PTMono-TLF', fvm: 'PTMono-TLF',
    lmr: 'cmr', lmss: 'cmss', lmtt: 'cmtt',
  },
}
const ROLE_DEFAULT = { rm: 'cmr', sf: 'cmss', tt: 'cmtt' }
/** \__axt_substitute:nnnn {encoding} {family} {face} {the family's .fd}: the face's shapes for the family, where it has no .fd */
const SUBSTITUTE = String.raw`\ExplSyntaxOn
\cs_gset_protected:Npn \__axt_substitute:nnnn #1#2#3#4
  {
    \file_if_exist:nF {#4}
      {
        \LoadFontDefinitionFile {#1} {#3}
        \DeclareFontFamily {#1} {#2} { }
        \clist_map_inline:nn { m, b, bx }
          {
            \clist_map_inline:nn { n, it, sl, sc, sw, scit, scsl }
              { \cs_if_exist:cT { #1/#3/##1/####1 } { \DeclareFontShape {#1} {#2} {##1} {####1} { <->ssub*#3/##1/####1 } { } } }
          }
      }
  }
`
const facesFor = (encoding, fonts) => {
  const calls = Object.entries(ROLE_DEFAULT).map(([role, fallback]) => {
    const family = fonts?.[role]
    if (!family) return ''
    const face = DESIGN[encoding]?.[family] ?? fallback
    return `\\__axt_substitute:nnnn {${encoding}} {${family}} {${face}} {${encoding.toLowerCase()}${family.toLowerCase()}.fd}\n`
  }).join('')
  return calls ? `${SUBSTITUTE}${calls}\\ExplSyntaxOff\n` : ''
}
/** Under XeLaTeX, the faces for an alphabet whose letters the paper's Latin faces lack: every role, Computer Modern's
 *  design (CMU), the face most arXiv papers are set in */
const FACES = {
  Cyrl: '\\setmainfont[BoldFont=cmunbx.otf,ItalicFont=cmunti.otf,BoldItalicFont=cmunbi.otf]{cmunrm.otf}\n\\setsansfont[BoldFont=cmunsx.otf,ItalicFont=cmunsi.otf,BoldItalicFont=cmunso.otf]{cmunss.otf}\n\\setmonofont[ItalicFont=cmunit.otf]{cmuntt.otf}\n',
}

/** The target language as the document's language: captions, hyphenation, direction. Loaded here only when the paper
 *  does not load babel itself, and then without its \cite and \ref rewriting (safe=none): coming after the cite
 *  package, that rewriting takes cite's \@citex for the kernel's and breaks every citation; a language imported from its
 *  ini file makes no character active, which is all the rewriting guards against. Not at all where polyglossia manages
 *  the paper's languages, since the two do not work together: its captions then stay the paper's (Codex on #294) */
const babel = lang => `\\IfPackageLoadedTF{polyglossia}{}{\\IfPackageLoadedTF{babel}{}{\\usepackage[safe=none]{babel}}\\babelprovide[import=${lang},main]{axttarget}}\n`
/** After fontspec: the fonts declared from here on carry exactly the features given them. A paper's class may set
 *  fontspec's defaults for its own faces — newtxtext, which AAAI's style loads, sets Extension=.otf under XeTeX — and
 *  every font declared later inherits them: a .ttf face (bsmi00lp, ipaexm, UnBatang) is then looked for as .otf and
 *  not found. The paper's own faces were declared before, with their features, and keep them */
const OWN_FEATURES = '\\defaultfontfeatures{}\n'
/** the paper's own line spacing, times `f`; an empty \baselinestretch, the standard classes' own, means 1 to LaTeX */
const leading = f => (f === 1 ? '' : `\\expanded{\\noexpand\\linespread{\\fpeval{${f}*\\ifx\\baselinestretch\\empty 1\\else\\baselinestretch\\fi}}}\n`)

/** the strategies to try for a paper, in order: { name, engine, xe, pre(fonts) → the preamble's addition } */
export function strategiesFor(meta, lang) {
  const script = scriptOf(lang)
  const cjk = CJK[script]
  if (cjk) {
    const xeCJK = `\\usepackage{xeCJK}\n${OWN_FEATURES}${cjk.spaced ? '\\xeCJKsetup{CJKspace=true}\n' : ''}\\setCJKmainfont${cjk.font}\n`
    const out = [{ name: 'XeLaTeX + xeCJK', engine: 'xelatex', xe: true, pre: fonts => xeCJK + latinFontsFor(fonts) + leading(cjk.leading) + babel(lang) }]
    if (EIGHT_BIT.has(meta.compiler)) {
      const cjkutf8 = `\\usepackage{CJKutf8}\n\\AtBeginDocument{\\begin{CJK}{UTF8}{${cjk.cjkutf8}}}\n\\AtEndDocument{\\end{CJK}}\n`
      out.push({ name: 'pdfLaTeX + CJKutf8', engine: meta.compiler, xe: false, pre: () => cjkutf8 + leading(cjk.leading) })
    }
    return out
  }
  if (script === 'Latn' || FACES[script]) {
    // a Unicode engine's faces: the alphabet's own, or the paper's Latin faces in their OpenType form
    const faces = fonts => `\\usepackage{fontspec}\n${OWN_FEATURES}${FACES[script] ?? latinFontsFor(fonts)}`
    if (!EIGHT_BIT.has(meta.compiler)) return [{ name: 'own engine', engine: meta.compiler, xe: true, pre: fonts => (FACES[script] ? faces(fonts) : '') + babel(lang) }]
    const encoding = ENCODING[script]
    return [
      { name: 'own engine', engine: meta.compiler, xe: false, pre: fonts => (encoding ? `\\usepackage[${encoding}]{fontenc}\n${facesFor(encoding, fonts)}` : '') + babel(lang) },
      { name: 'XeLaTeX', engine: 'xelatex', xe: true, pre: fonts => faces(fonts) + babel(lang) },
    ]
  }
  throw new Error(`no typesetting for ${lang} (script ${script}) yet`)
}
