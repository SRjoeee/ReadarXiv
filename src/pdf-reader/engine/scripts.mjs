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
/**
 * Whether the author block's names and places are translated: where the target's script writes foreign names its own
 * way, the byline reads that way too, the original beside it for the names an engine renders wrong (the owner,
 * 2026-09-28); a language in the Latin script keeps them as the paper writes them. And only where a Unicode engine
 * sets the translation: a class runs its own macros over the author block — uppercasing, key-value parsing, the PDF's
 * metadata — which 8-bit text does not survive (2608.12096's CEUR class under CJKutf8: "Extra \\else"). So the CJK
 * scripts, set by XeLaTeX; Russian, set by pdfLaTeX in T2A, keeps them for now, and a CJK translation that falls back
 * to CJKutf8 sets them as the paper has them (`authors: false`, translationFiles)
 */
export const authorsTranslated = lang => Boolean(CJK[scriptOf(lang)])
/** the translation a strategy sets: without the author block's names and places under one that cannot take them */
export const typesetBy = (translated, strategy) => (strategy.authors === false ? new Map([...translated].filter(([u]) => u.kind !== 'author')) : translated)
// the languages the reader typesets, in a module of their own: the background reads them too (its warm-up), and a
// service worker's bundle cannot carry this module's LaTeX parser
export { VERIFIED, verified } from './verified.mjs'
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
 * `leading` multiplies the paper's own line spacing inside translated units alone (live.mjs translationFiles,
 * latex-front.mjs unitLeadTex): what stays English — references, tables, code, algorithms — keeps the paper's. A
 * \linespread for the whole preamble spread them too, a third past the paper's (RT-1's references at 1.43 × the font
 * size against 1.10), and a class that sets its spacing in the body, as ICASSP's \ninept does, escaped it; the unit's
 * own spacing is multiplied now, whatever set it. CJK characters fill their em square, so lines of them stand closer
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
 *  the paper's languages, since the two do not work together: its captions then stay the paper's (Codex on #294). The
 *  locale imported is the first babel has an ini file for, which TeX checks at compile time: the language's own tag,
 *  then its language and script, then its language alone. The extension names Traditional Chinese zh-TW, which babel has
 *  no file for, while it has zh-Hant; without the check its captions stayed English, with three errors.
 *  `hyphenrules` for a script with no hyphenation of its own (CJK): the Latin words left in the translation — names,
 *  terms, the references — break as the paper's English did. With the target's locale as the document's they had no
 *  patterns and broke only at hyphens of their own: the references' lines ended in one less than half as often
 *  (2608.06701: 5 % against 12 %), their word spaces a fifth wider, and underfull lines went from 10 to 70
 *  (2608.12333). The source is English in v1 (TranslateRequest.source) */
const babelTags = lang => { const l = new Intl.Locale(lang); return [...new Set([lang, `${l.language}-${l.maximize().script}`, l.language])] }
const provide = ([tag, ...rest], opts) => (rest.length ? `\\IfFileExists{babel-${tag}.ini}{\\babelprovide[import=${tag},main${opts}]{axttarget}}{${provide(rest, opts)}}` : `\\babelprovide[import=${tag},main${opts}]{axttarget}`)
const babel = (lang, hyphenrules) => `\\IfPackageLoadedTF{polyglossia}{}{\\IfPackageLoadedTF{babel}{}{\\usepackage[safe=none]{babel}}${provide(babelTags(lang), hyphenrules ? `,hyphenrules=${hyphenrules}` : '')}}\n`
/** After fontspec: the fonts declared from here on carry exactly the features given them. A paper's class may set
 *  fontspec's defaults for its own faces — newtxtext, which AAAI's style loads, sets Extension=.otf under XeTeX — and
 *  every font declared later inherits them: a .ttf face (bsmi00lp, ipaexm, UnBatang) is then looked for as .otf and
 *  not found. The paper's own faces were declared before, with their features, and keep them */
const OWN_FEATURES = '\\defaultfontfeatures{}\n'
/** Before fontspec, or xeCJK that loads it: the paper's math left as the paper set it. fontspec by default gives math
 *  a family of its own for the symbols its text fonts lack, declared as the document begins, and an AMS class sets the
 *  abstract in a box before that: every parenthesis and equals sign of an abstract's math was "\textfont 6 is
 *  undefined", and left out (2608.24503, amsart: 24 errors under xeCJK). The paper's math fonts are the original's,
 *  their metrics the original's */
const NO_MATH = '\\PassOptionsToPackage{no-math}{fontspec}\n'
/** At \\begin{document}, under XeTeX: each face in an encoding it has. A class that loads fontspec itself (acmart:
 *  Libertine) and a paper that loads T1 after it left T1 the default encoding, which the OpenType faces do not have: the
 *  body fell back to Computer Modern, bold with it (2608.06007; four of the corpus's eight acmart papers load T1). And
 *  with TU the default, a face that has T1 alone (Bera Sans Mono, chosen for code by \\fontfamily{fvm}) fell back to
 *  Latin Modern's roman. So TU is the default again when the main face has it, and \\fontfamily — which \\rmfamily,
 *  \\ttfamily and the rest go through — switches between TU and T1 to the one the face has, learned once per face from
 *  its font definition file (tu….fd, t1….fd), else from the TU shapes fontspec declared. Never from a shape alone: a
 *  lookup that failed is cached as the substitute's shape */
const TU_AGAIN = String.raw`\makeatletter
\def\axt@tone{T1}\def\axt@tu{TU}
\def\axt@learn#1{\edef\axt@fd{tu#1.fd}\edef\axt@tfd{t1#1.fd}\IfFileExists{\axt@fd}{\def\axt@e{TU}}{\IfFileExists{\axt@tfd}{\def\axt@e{T1}}{\ifcsname TU/#1/\mddefault/\shapedefault\endcsname\def\axt@e{TU}\else\let\axt@e\@empty\fi}}\expandafter\global\expandafter\let\csname axt@fe@#1\endcsname\axt@e}
\def\axt@famenc{\ifx\f@encoding\axt@tu\axt@switch\else\ifx\f@encoding\axt@tone\axt@switch\fi\fi}
\def\axt@switch{\ifcsname axt@fe@\f@family\endcsname\else\axt@learn\f@family\fi\expandafter\let\expandafter\axt@e\csname axt@fe@\f@family\endcsname\ifx\axt@e\@empty\else\ifx\axt@e\f@encoding\else\fontencoding\axt@e\fi\fi}
\AtBeginDocument{\edef\axt@enc{\encodingdefault}\ifx\axt@enc\axt@tone\ifcsname TU/\rmdefault/\mddefault/\shapedefault\endcsname\renewcommand\encodingdefault{TU}\fi\fi
  \expandafter\let\expandafter\axt@fontfamily\csname fontfamily \endcsname\expandafter\def\csname fontfamily \endcsname#1{\axt@fontfamily{#1}\axt@famenc}\normalfont}
\makeatother
`

/**
 * A paper that loads CJK or CJKutf8 itself — a name or an abstract in a CJK script — cannot be set under xeCJK as it
 * stands: xeCJK refuses to follow them ("Package ctexhook Error: Package `CJKutf8' can not be loaded with `xeCJK'":
 * 2608.06007, 10322, 13505, 29778 into every CJK language; the investigation of XeLaTeX under BusyTeX, 2026-10-01, cause
 * A). Before \documentclass (a strategy's `front`, live.mjs translationFiles) the packages are kept from loading, as the
 * kernel lets a package be; after xeCJK their environments are plain groups, whose text xeCJK sets as it sets the
 * rest, and their commands the papers use do nothing
 */
const CJK_FRONT = String.raw`\makeatletter
\ifdefined\disable@package@load\disable@package@load{CJK}{}\disable@package@load{CJKutf8}{}\disable@package@load{CJKpunct}{}\disable@package@load{CJKulem}{}\disable@package@load{CJKvert}{}\fi
\makeatother
`
const CJK_GROUPS = String.raw`\makeatletter\@ifundefined{CJK}{\newenvironment{CJK}[2]{}{}\newenvironment{CJK*}[2]{}{}}{}\providecommand\CJKtilde{}\providecommand\CJKindent{}\makeatother
`
/**
 * xeCJK's microtype patch (\__xeCJK_get_ambiguous_slot:, since xeCJK 3.8.5) sets microtype's \MT@char but leaves
 * \MT@char@ at -1, so microtype's XeTeX code measures \XeTeXglyph 1: an error on an 8-bit font — "! Cannot use
 * \XeTeXglyph with tcrm1000; not a native platform font", textcomp's or gensymb's symbols under acmart's Libertine
 * (2608.06007, 25210; cause E) — and silently wrong protrusion on an OpenType one. After xeCJK, the function is wrapped
 * to set \MT@char@ wherever it set \MT@char, as the fix reported upstream does (CTeX-org/ctex-kit#1104, 2026-10-01):
 * verified natively, microtype's own values (the period centred of TS1 cmr, lp 83 and rp 111). Wrapped, not written
 * anew, so that it holds for every xeCJK that has the function: the one the TeX page's tree holds keeps its slots in
 * \c__xeCJK_ambiguous_slot_prop, the newer one in \g__…, and the fix written with the newer's name stopped every xeCJK
 * compile of a paper with microtype in the browser ("Undefined control sequence", 2608.06007 and 18090, 2026-10-02).
 * Only microtype's patched code calls it
 */
const MT_SLOT = String.raw`\makeatletter\ExplSyntaxOn
\cs_if_exist:NT \__xeCJK_get_ambiguous_slot:
  {
    \cs_new_eq:NN \__axt_xeCJK_get_ambiguous_slot: \__xeCJK_get_ambiguous_slot:
    \cs_set_protected:Npn \__xeCJK_get_ambiguous_slot:
      {
        \cs_set_eq:NN \l__axt_mt_char_tl \MT@char
        \__axt_xeCJK_get_ambiguous_slot:
        \cs_if_eq:NNF \l__axt_mt_char_tl \MT@char { \cs_set_eq:NN \MT@char@ \MT@char }
      }
  }
\ExplSyntaxOff\makeatother
`

/** the strategies to try for a paper, in order: { name, engine, xe, pre(fonts) → the preamble's addition, front → what
 *  goes before \documentclass (absent for nothing), leading — the factor on the paper's spacing inside translated units,
 *  absent for 1 } */
export function strategiesFor(meta, lang) {
  const script = scriptOf(lang)
  const cjk = CJK[script]
  if (cjk) {
    const xeCJK = `${NO_MATH}\\usepackage{xeCJK}\n${CJK_GROUPS}${MT_SLOT}${OWN_FEATURES}${cjk.spaced ? '\\xeCJKsetup{CJKspace=true}\n' : ''}\\setCJKmainfont${cjk.font}\n`
    const lead = cjk.leading === 1 ? {} : { leading: cjk.leading }
    const out = [{ name: 'XeLaTeX + xeCJK', engine: 'xelatex', xe: true, ...lead, front: CJK_FRONT, pre: fonts => xeCJK + latinFontsFor(fonts) + TU_AGAIN + babel(lang, 'english') }]
    if (EIGHT_BIT.has(meta.compiler)) {
      // the floats still held at \\end{document} are set inside the CJK environment, before it closes: set after it, a
      // translated table held to the end had every character "not set up for use with LaTeX" (2608.25210)
      const cjkutf8 = `\\usepackage{CJKutf8}\n\\AtBeginDocument{\\begin{CJK}{UTF8}{${cjk.cjkutf8}}}\n\\AtEndDocument{\\clearpage\\end{CJK}}\n`
      out.push({ name: 'pdfLaTeX + CJKutf8', engine: meta.compiler, xe: false, authors: false, ...lead, pre: () => cjkutf8 })
    }
    return out
  }
  if (script === 'Latn' || FACES[script]) {
    // a Unicode engine's faces: the alphabet's own, or the paper's Latin faces in their OpenType form
    const faces = fonts => `${NO_MATH}\\usepackage{fontspec}\n${OWN_FEATURES}${FACES[script] ?? latinFontsFor(fonts)}`
    if (!EIGHT_BIT.has(meta.compiler)) return [{ name: 'own engine', engine: meta.compiler, xe: true, pre: fonts => (FACES[script] ? faces(fonts) : '') + babel(lang) }]
    const encoding = ENCODING[script]
    return [
      { name: 'own engine', engine: meta.compiler, xe: false, pre: fonts => (encoding ? `\\usepackage[${encoding}]{fontenc}\n${facesFor(encoding, fonts)}` : '') + babel(lang) },
      { name: 'XeLaTeX', engine: 'xelatex', xe: true, pre: fonts => faces(fonts) + babel(lang) },
    ]
  }
  throw new Error(`no typesetting for ${lang} (script ${script}) yet`)
}
