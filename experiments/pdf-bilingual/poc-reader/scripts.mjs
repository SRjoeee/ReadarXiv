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
// XeLaTeX or LuaLaTeX keeps its engine. A script not listed here has no typesetting yet: the reader shows the translation
// from the HTML instead. Every font named is in TeX Live 2026. Measured with spikes/lang-gate.mjs.
import { latinFontsFor } from './latex-front.mjs'

export const scriptOf = lang => new Intl.Locale(lang).maximize().script

/**
 * CJK. xeCJK sets the script in a family of its own, leaves the paper's Latin faces (latinFontsFor) to everything
 * else, breaks lines between characters and keeps punctuation off a line's start; a script that spaces its words
 * (Hangul) keeps the spaces. CJKutf8 under the paper's own pdfLaTeX takes the papers XeLaTeX cannot (the chain took
 * Chinese from 98 to 106 of 113, REPORT fourth addendum); babel has no CJK captions under pdfTeX, so there they stay
 * the paper's.
 *
 * `leading`: CJK characters fill their em square, so lines of them stand closer than lines of Latin text at the same
 * spacing; ctex's Chinese scheme widens the spacing by 1.3. Here the factor multiplies the paper's own at the end of the
 * preamble (a class that sets its spacing in the body, as ICASSP's \ninept does, keeps its own).
 */
const CJK = {
  Hans: { font: '[BoldFont=FandolSong-Bold.otf,ItalicFont=FandolKai-Regular.otf]{FandolSong-Regular.otf}', cjkutf8: 'gbsn' },
  Hant: { font: '[AutoFakeBold=2.5,ItalicFont=bkai00mp.ttf]{bsmi00lp.ttf}', cjkutf8: 'bsmi' },
  Jpan: { font: '[AutoFakeBold=2.5]{ipaexm.ttf}', cjkutf8: 'ipxm' },
  Kore: { font: '[BoldFont=UnBatangBold.ttf]{UnBatang.ttf}', cjkutf8: 'mj', spaced: true },
}
const CJK_LEADING = 1.3

/**
 * The font encoding that holds an alphabet's letters under pdfLaTeX, made the document's default (loaded last); Latin
 * needs none. Loaded among others with babel choosing, it is not enough: babel switches the running text but not the
 * moving arguments (headings, captions). T2A also sets the Latin letters of the paper's own names (Mądry, Kępa). Not
 * Vietnamese: its encoding, T5, lacks T1's ogonek, and a reference's Mądry lost it with T5 as the default — its letters
 * go on to XeLaTeX, like any letter no encoding holds
 */
const ENCODING = { Cyrl: 'T2A' }
/** Under XeLaTeX, the faces for an alphabet whose letters the paper's Latin faces lack: every role, Computer Modern's
 *  design (CMU), the face most arXiv papers are set in */
const FACES = {
  Cyrl: '\\setmainfont[BoldFont=cmunbx.otf,ItalicFont=cmunti.otf,BoldItalicFont=cmunbi.otf]{cmunrm.otf}\n\\setsansfont[BoldFont=cmunsx.otf,ItalicFont=cmunsi.otf,BoldItalicFont=cmunso.otf]{cmunss.otf}\n\\setmonofont[ItalicFont=cmunit.otf]{cmuntt.otf}\n',
}

/** The target language as the document's language: captions, hyphenation, direction. Loaded here only when the paper
 *  does not load babel itself, and then without its \cite and \ref rewriting (safe=none): coming after the cite
 *  package, that rewriting takes cite's \@citex for the kernel's and breaks every citation; a language imported from its
 *  ini file makes no character active, which is all the rewriting guards against */
const babel = lang => `\\IfPackageLoadedTF{babel}{}{\\usepackage[safe=none]{babel}}\n\\babelprovide[import=${lang},main]{axttarget}\n`
/** After fontspec: the fonts declared from here on carry exactly the features given them. A paper's class may set
 *  fontspec's defaults for its own faces — newtxtext, which AAAI's style loads, sets Extension=.otf under XeTeX — and
 *  every font declared later inherits them: a .ttf face (bsmi00lp, ipaexm, UnBatang) is then looked for as .otf and
 *  not found. The paper's own faces were declared before, with their features, and keep them */
const OWN_FEATURES = '\\defaultfontfeatures{}\n'
/** the paper's own line spacing, times `f`; an empty \baselinestretch, the standard classes' own, means 1 to LaTeX */
const leading = f => `\\expanded{\\noexpand\\linespread{\\fpeval{${f}*\\ifx\\baselinestretch\\empty 1\\else\\baselinestretch\\fi}}}\n`

/** the strategies to try for a paper, in order: { name, engine, xe, pre(fonts) → the preamble's addition } */
export function strategiesFor(meta, lang) {
  const script = scriptOf(lang)
  const cjk = CJK[script]
  if (cjk) {
    const xeCJK = `\\usepackage{xeCJK}\n${OWN_FEATURES}${cjk.spaced ? '\\xeCJKsetup{CJKspace=true}\n' : ''}\\setCJKmainfont${cjk.font}\n`
    const out = [{ name: 'XeLaTeX + xeCJK', engine: 'xelatex', xe: true, pre: fonts => xeCJK + latinFontsFor(fonts) + leading(CJK_LEADING) + babel(lang) }]
    if (meta.compiler === 'pdflatex') {
      const cjkutf8 = `\\usepackage{CJKutf8}\n\\AtBeginDocument{\\begin{CJK}{UTF8}{${cjk.cjkutf8}}}\n\\AtEndDocument{\\end{CJK}}\n`
      out.push({ name: 'pdfLaTeX + CJKutf8', engine: 'pdflatex', xe: false, pre: () => cjkutf8 + leading(CJK_LEADING) })
    }
    return out
  }
  if (script === 'Latn' || FACES[script]) {
    // a Unicode engine's faces: the alphabet's own, or the paper's Latin faces in their OpenType form
    const faces = fonts => `\\usepackage{fontspec}\n${OWN_FEATURES}${FACES[script] ?? latinFontsFor(fonts)}`
    if (meta.compiler !== 'pdflatex') return [{ name: 'own engine', engine: meta.compiler, xe: true, pre: fonts => (FACES[script] ? faces(fonts) : '') + babel(lang) }]
    const encoding = ENCODING[script]
    return [
      { name: 'own engine', engine: 'pdflatex', xe: false, pre: () => (encoding ? `\\usepackage[${encoding}]{fontenc}\n` : '') + babel(lang) },
      { name: 'XeLaTeX', engine: 'xelatex', xe: true, pre: fonts => faces(fonts) + babel(lang) },
    ]
  }
  throw new Error(`no typesetting for ${lang} (script ${script}) yet`)
}
