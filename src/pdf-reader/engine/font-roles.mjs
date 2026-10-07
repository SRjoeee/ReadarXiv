// The font role table: for each target and English family, the face file each role is drawn in, the same files in both
// renderers — the TeX path sets them, the instant layer draws in web fonts made from them (spec §4.4, under the
// maintainer's rulings of 2026-10-06, §1.3). One rendering on every device: every face is a file we serve, TeX Live's or
// an upstream release's, under a family name of ours; none is a face the reader's device holds, and nothing here names
// a generic family. A character no face of a run's role holds keeps its unit the original's (canDraw).
//
// Which face a target takes is one rule in two tiers (the maintainer, 2026-10-06), and it governs every target to come:
// - Tier 1, the scripts the paper's Western families are drawn for (Latin, Greek, Cyrillic, Vietnamese): the original's
//   own family, its same glyphs where a source has them, from the cleanest source of them. Today, measured against what
//   arXiv's PDFs embed: Times → Nimbus Roman and Helvetica → Nimbus Sans (URW's base 35 release: 62 and 53-62 of 62
//   glyphs the same; GNU FreeSerif and FreeSans are 3-24 and 13-26, their advances reworked), Courier → GNU FreeMono
//   (57-60 of 62 at the original's weight; its bold oblique 32), Computer Modern → CMU (its text 62 of 62; Latin Modern
//   for its bold italic, small capitals, sans and typewriter, nearer CM's), Palatino → Domitian (URW's P052 glyphs under
//   the OFL), and each other family its own files. Where the family lacks a script a target needs, its unit stays the
//   original's until a source of that family has it: Nimbus Roman, Nimbus Sans and Domitian hold 12 of Vietnamese's 104
//   letters and no polytonic Greek, which CMU, FreeSerif, FreeSans and FreeMono hold whole.
// - Tier 2, the scripts no Western family covers well (CJK, Arabic, Hebrew, the Indic scripts, Thai and the rest): the
//   Noto superfamily, one design per script. Source Han Serif is Noto Serif CJK: zh, zh-Hant and ko in Source Han Serif
//   SC, TC and K, ja in Harano Aji Mincho (Source Han Serif JP), at static weights that follow the paper's English family
//   (Light beside Computer Modern and Garamond, Regular beside the rest), its real bold (SemiBold, Bold) for bold and
//   headings, as the original's serif bold; Korean's Hangul at the size of the family's ideographs (Face.size). The Kai
//   stays as today (FandolKai, AR PL KaitiM Big5); Japanese and Korean emphasis is upright. GNU FreeFont's own Arabic,
//   Indic and Thai glyphs are not taken for Tier 2: their styles are not one design.
//
// Also the names behind both renderers' reading of a paper's fonts: each design's NFSS family names (the TeX path's
// font probe, familyOfProbe) and its PostScript names (a PDF's fonts, classifyFont and familyOfFonts), in one table.
import { COVERAGE } from './font-coverage.mjs'
import { scriptOf } from './layer-rules.mjs'

/**
 * Every face, one row each: its id, its file (as TeX finds it and the subsetter reads it), where the file comes from,
 * its group (our CSS family is `axt-` and the group), its CSS weight and style, its size correction, its licence (an
 * SPDX expression, or a LicenseRef-) and its web status — `ofl` and `gfl` (GUST) served as their licences let, `notice`
 * served with its licence's notice, `gpl` served with the notice and the full file as the subsets' source, `review`
 * decided by the maintainer for the web (spec §8: served on the maintainer's word of 2026-10-06, as the gpl faces are).
 * scripts/font-roles.py reads this table too: it measures each file (font-coverage.mjs), so keep one row a line, the
 * columns separated by spaces; the licence is every column between the size and the web status.
 *
 * The size correction (× the run's size): a CJK face's script set at the visual size of the family's ideographs beside
 * the paper's Latin, that is, its median ink height over the Latin body face's cap height equal to Source Han Serif SC's
 * at the same weight. Source Han Serif K's Hangul (302 syllables, every 37th from U+AC00) against SC's ideographs (510,
 * every 41st from U+4E00): Light 0.9120 / 0.9535 em, Regular 0.9160 / 0.9550, Medium 0.9230 / 0.9566, SemiBold
 * 0.9290 / 0.9609, Bold 0.9390 / 0.9642. The cap height is Times' 0.662 em (measured on TeX Gyre Termes) and Latin Modern's 0.683 em: it
 * divides both, so the correction is the same beside Times and Computer Modern (Hangul over Termes' cap 1.443 at
 * Regular, SC's ideographs 1.384). SC is the reference; TC's ideographs are SC's to 0.1 % (TC 1.000), Harano Aji's
 * Source Han Serif JP's. Matched instead to the face it replaces, Un Batang's Hangul (0.9100 em), K Regular would be
 * 0.953: the two ways agree within 0.6 %.
 *
 * Licences as each font's own name table or official licence file states them, in SPDX (licence list 3.29.0) where it
 * has an identifier:
 * - Source Han Serif, Harano Aji, EB Garamond, Erewhon: OFL-1.1, their name tables; CMU (cm-unicode 0.7.0): OFL-1.1,
 *   each file's name table ("licensed under the SIL Open Font License, Version 1.1") and TeX Live's catalogue (ofl);
 * - Latin Modern: the GUST Font License, its name tables and CFF notices and TeX Live's catalogue (gfl; SPDX has no
 *   identifier for it);
 * - Linux Libertine O and Linux Biolinum O: the GPL and the OFL-1.1, their name tables; Domitian: the OFL-1.1 and the
 *   LPPL-1.3c, TeX Live's catalogue; each served under the OFL;
 * - FandolKai: "GPL + GPL font exception", CTAN's fonts/fandol README, which names no version; its COPYING is the GPL's
 *   version 3. A GPL that names no version lets any be chosen (GPLv3 §14), so version 3 or later, the one shipped; the
 *   exception is taken to be the FSF's, which the README names but does not quote;
 * - AR PL KaitiM Big5: the Arphic Public License, its name table; XCharter: Bitstream Charter's licence, its copyright
 *   ("based on Bitstream Charter"); DejaVu Sans Mono: Bitstream Vera's, its name table;
 * - PT Mono: the ParaType Free Font License its name table cites, version 1.3 at that address (SPDX's source for it);
 * - Inconsolata zi4: its regular OFL-1.1, its bold Apache-2.0, their name tables;
 * - GNU FreeMono: GPL-3.0-or-later with the FSF's font exception, verbatim in its name tables (Courier's design: URW's
 *   Nimbus Mono L, the original's glyphs, 60, 57, 60 and 32 of 62 in its four styles, at the original's ink);
 * - Nimbus Roman and Nimbus Sans: URW's base 35 release, ArtifexSoftware/urw-base35-fonts at tag
 *   20200910, whose LICENSE reads "GNU AFFERO GENERAL PUBLIC LICENSE Version 3 (see the file COPYING), with the
 *   following exemption: As a special exception, permission is granted to include these font programs in a Postscript
 *   or PDF file …": AGPL-3.0-only WITH PS-or-PDF-font-exception-20170817, the exception SPDX lists from that very
 *   LICENSE. Served as the gpl faces are, with the full files as the subsets' source. TeX Live's nimbus15 files (zhv-*,
 *   zco-*) state "AGPL" alone, with no exception, and are not taken; nor Tempora (GPL-2.0-or-later with a PS/PDF
 *   exception in three of its four name tables, none in Tempora-Italic's), whose Latin is not the original's.
 *
 * The same glyphs as the original, checked against what arXiv's PDFs embed (URW's 1999 Type 1 fonts, TeX Live's
 * utm*8a, uhv*8a, ucr*8a, upl*8a), over A–Z, a–z and 0–9, a glyph the same when its advance is equal, its bounding box
 * within 5 units and its ink within 1 %: Nimbus Roman 62 of 62 in each style (TeX Gyre Termes 60, Tempora 21–55);
 * Nimbus Sans 53–62, its letters all and its digits 14 units off (TeX Gyre Heros 0–38); Domitian 62 (Pagella 58–59; its
 * Cyrillic is P052's, 66 of 66); GNU FreeMono 60, 57, 60 and 32 at the original's ink (TeX Gyre Cursor 55–59, Nimbus
 * Mono PS 0, its regular a quarter darker); GNU FreeSerif 3–24 and FreeSans 13–26, their advances reworked
 */
const FACE_TABLE = `
shs-sc-light             SourceHanSerifSC-Light.otf      hosted   shs-sc         300  normal  1      OFL-1.1                                               ofl
shs-sc-regular           SourceHanSerifSC-Regular.otf    hosted   shs-sc         400  normal  1      OFL-1.1                                               ofl
shs-sc-medium            SourceHanSerifSC-Medium.otf     hosted   shs-sc         500  normal  1      OFL-1.1                                               ofl
shs-sc-semibold          SourceHanSerifSC-SemiBold.otf   hosted   shs-sc         600  normal  1      OFL-1.1                                               ofl
shs-sc-bold              SourceHanSerifSC-Bold.otf       hosted   shs-sc         700  normal  1      OFL-1.1                                               ofl
shs-tc-light             SourceHanSerifTC-Light.otf      hosted   shs-tc         300  normal  1      OFL-1.1                                               ofl
shs-tc-regular           SourceHanSerifTC-Regular.otf    hosted   shs-tc         400  normal  1      OFL-1.1                                               ofl
shs-tc-medium            SourceHanSerifTC-Medium.otf     hosted   shs-tc         500  normal  1      OFL-1.1                                               ofl
shs-tc-semibold          SourceHanSerifTC-SemiBold.otf   hosted   shs-tc         600  normal  1      OFL-1.1                                               ofl
shs-tc-bold              SourceHanSerifTC-Bold.otf       hosted   shs-tc         700  normal  1      OFL-1.1                                               ofl
shs-k-light              SourceHanSerifK-Light.otf       hosted   shs-k          300  normal  0.956  OFL-1.1                                               ofl
shs-k-regular            SourceHanSerifK-Regular.otf     hosted   shs-k          400  normal  0.959  OFL-1.1                                               ofl
shs-k-medium             SourceHanSerifK-Medium.otf      hosted   shs-k          500  normal  0.965  OFL-1.1                                               ofl
shs-k-semibold           SourceHanSerifK-SemiBold.otf    hosted   shs-k          600  normal  0.967  OFL-1.1                                               ofl
shs-k-bold               SourceHanSerifK-Bold.otf        hosted   shs-k          700  normal  0.974  OFL-1.1                                               ofl
haranoaji-light          HaranoAjiMincho-Light.otf       texlive  haranoaji      300  normal  1      OFL-1.1                                               ofl
haranoaji-regular        HaranoAjiMincho-Regular.otf     texlive  haranoaji      400  normal  1      OFL-1.1                                               ofl
haranoaji-medium         HaranoAjiMincho-Medium.otf      texlive  haranoaji      500  normal  1      OFL-1.1                                               ofl
haranoaji-semibold       HaranoAjiMincho-SemiBold.otf    texlive  haranoaji      600  normal  1      OFL-1.1                                               ofl
haranoaji-bold           HaranoAjiMincho-Bold.otf        texlive  haranoaji      700  normal  1      OFL-1.1                                               ofl
fandolkai                FandolKai-Regular.otf           texlive  fandolkai      400  normal  1      GPL-3.0-or-later WITH Font-exception-2.0              gpl
bkai00mp                 bkai00mp.ttf                    texlive  bkai00mp       400  normal  1      Arphic-1999                                           notice
lm-roman-regular         lmroman10-regular.otf           texlive  lm-roman       400  normal  1      LicenseRef-GUST-Font-License                          gfl
lm-roman-bold            lmroman10-bold.otf              texlive  lm-roman       700  normal  1      LicenseRef-GUST-Font-License                          gfl
lm-roman-italic          lmroman10-italic.otf            texlive  lm-roman       400  italic  1      LicenseRef-GUST-Font-License                          gfl
lm-roman-bolditalic      lmroman10-bolditalic.otf        texlive  lm-roman       700  italic  1      LicenseRef-GUST-Font-License                          gfl
lm-roman-caps            lmromancaps10-regular.otf       texlive  lm-roman-caps  400  normal  1      LicenseRef-GUST-Font-License                          gfl
lm-roman-caps-italic     lmromancaps10-oblique.otf       texlive  lm-roman-caps  400  italic  1      LicenseRef-GUST-Font-License                          gfl
lm-sans-regular          lmsans10-regular.otf            texlive  lm-sans        400  normal  1      LicenseRef-GUST-Font-License                          gfl
lm-sans-bold             lmsans10-bold.otf               texlive  lm-sans        700  normal  1      LicenseRef-GUST-Font-License                          gfl
lm-sans-italic           lmsans10-oblique.otf            texlive  lm-sans        400  italic  1      LicenseRef-GUST-Font-License                          gfl
lm-sans-bolditalic       lmsans10-boldoblique.otf        texlive  lm-sans        700  italic  1      LicenseRef-GUST-Font-License                          gfl
lm-mono-regular          lmmono10-regular.otf            texlive  lm-mono        400  normal  1      LicenseRef-GUST-Font-License                          gfl
lm-mono-italic           lmmono10-italic.otf             texlive  lm-mono        400  italic  1      LicenseRef-GUST-Font-License                          gfl
lm-math                  latinmodern-math.otf            texlive  lm-math        400  normal  1      LicenseRef-GUST-Font-License                          gfl
nimbus-roman-regular     NimbusRoman-Regular.otf         hosted   nimbus-roman   400  normal  1      AGPL-3.0-only WITH PS-or-PDF-font-exception-20170817  gpl
nimbus-roman-bold        NimbusRoman-Bold.otf            hosted   nimbus-roman   700  normal  1      AGPL-3.0-only WITH PS-or-PDF-font-exception-20170817  gpl
nimbus-roman-italic      NimbusRoman-Italic.otf          hosted   nimbus-roman   400  italic  1      AGPL-3.0-only WITH PS-or-PDF-font-exception-20170817  gpl
nimbus-roman-bolditalic  NimbusRoman-BoldItalic.otf      hosted   nimbus-roman   700  italic  1      AGPL-3.0-only WITH PS-or-PDF-font-exception-20170817  gpl
nimbus-sans-regular      NimbusSans-Regular.otf          hosted   nimbus-sans    400  normal  1      AGPL-3.0-only WITH PS-or-PDF-font-exception-20170817  gpl
nimbus-sans-bold         NimbusSans-Bold.otf             hosted   nimbus-sans    700  normal  1      AGPL-3.0-only WITH PS-or-PDF-font-exception-20170817  gpl
nimbus-sans-italic       NimbusSans-Italic.otf           hosted   nimbus-sans    400  italic  1      AGPL-3.0-only WITH PS-or-PDF-font-exception-20170817  gpl
nimbus-sans-bolditalic   NimbusSans-BoldItalic.otf       hosted   nimbus-sans    700  italic  1      AGPL-3.0-only WITH PS-or-PDF-font-exception-20170817  gpl
freemono-regular         FreeMono.otf                    texlive  freemono       400  normal  1      GPL-3.0-or-later WITH Font-exception-2.0              gpl
freemono-bold            FreeMonoBold.otf                texlive  freemono       700  normal  1      GPL-3.0-or-later WITH Font-exception-2.0              gpl
freemono-italic          FreeMonoOblique.otf             texlive  freemono       400  italic  1      GPL-3.0-or-later WITH Font-exception-2.0              gpl
freemono-bolditalic      FreeMonoBoldOblique.otf         texlive  freemono       700  italic  1      GPL-3.0-or-later WITH Font-exception-2.0              gpl
libertine-regular        LinLibertine_R.otf              texlive  libertine      400  normal  1      OFL-1.1                                               ofl
libertine-bold           LinLibertine_RB.otf             texlive  libertine      700  normal  1      OFL-1.1                                               ofl
libertine-italic         LinLibertine_RI.otf             texlive  libertine      400  italic  1      OFL-1.1                                               ofl
libertine-bolditalic     LinLibertine_RBI.otf            texlive  libertine      700  italic  1      OFL-1.1                                               ofl
biolinum-regular         LinBiolinum_R.otf               texlive  biolinum       400  normal  1      OFL-1.1                                               ofl
biolinum-bold            LinBiolinum_RB.otf              texlive  biolinum       700  normal  1      OFL-1.1                                               ofl
biolinum-italic          LinBiolinum_RI.otf              texlive  biolinum       400  italic  1      OFL-1.1                                               ofl
biolinum-bolditalic      LinBiolinum_RBO.otf             texlive  biolinum       700  italic  1      OFL-1.1                                               ofl
xcharter-regular         XCharter-Roman.otf              texlive  xcharter       400  normal  1      Bitstream-Charter                                     notice
xcharter-bold            XCharter-Bold.otf               texlive  xcharter       700  normal  1      Bitstream-Charter                                     notice
xcharter-italic          XCharter-Italic.otf             texlive  xcharter       400  italic  1      Bitstream-Charter                                     notice
xcharter-bolditalic      XCharter-BoldItalic.otf         texlive  xcharter       700  italic  1      Bitstream-Charter                                     notice
ebgaramond-regular       EBGaramond-Regular.otf          texlive  ebgaramond     400  normal  1      OFL-1.1                                               ofl
ebgaramond-bold          EBGaramond-Bold.otf             texlive  ebgaramond     700  normal  1      OFL-1.1                                               ofl
ebgaramond-italic        EBGaramond-Italic.otf           texlive  ebgaramond     400  italic  1      OFL-1.1                                               ofl
ebgaramond-bolditalic    EBGaramond-BoldItalic.otf       texlive  ebgaramond     700  italic  1      OFL-1.1                                               ofl
erewhon-regular          Erewhon-Regular.otf             texlive  erewhon        400  normal  1      OFL-1.1                                               ofl
erewhon-bold             Erewhon-Bold.otf                texlive  erewhon        700  normal  1      OFL-1.1                                               ofl
erewhon-italic           Erewhon-Italic.otf              texlive  erewhon        400  italic  1      OFL-1.1                                               ofl
erewhon-bolditalic       Erewhon-BoldItalic.otf          texlive  erewhon        700  italic  1      OFL-1.1                                               ofl
cmun-serif-regular       cmunrm.otf                      texlive  cmun-serif     400  normal  1      OFL-1.1                                               ofl
cmun-serif-bold          cmunbx.otf                      texlive  cmun-serif     700  normal  1      OFL-1.1                                               ofl
cmun-serif-italic        cmunti.otf                      texlive  cmun-serif     400  italic  1      OFL-1.1                                               ofl
cmun-serif-bolditalic    cmunbi.otf                      texlive  cmun-serif     700  italic  1      OFL-1.1                                               ofl
cmun-sans-regular        cmunss.otf                      texlive  cmun-sans      400  normal  1      OFL-1.1                                               ofl
cmun-sans-bold           cmunsx.otf                      texlive  cmun-sans      700  normal  1      OFL-1.1                                               ofl
cmun-sans-italic         cmunsi.otf                      texlive  cmun-sans      400  italic  1      OFL-1.1                                               ofl
cmun-sans-bolditalic     cmunso.otf                      texlive  cmun-sans      700  italic  1      OFL-1.1                                               ofl
cmun-mono-regular        cmuntt.otf                      texlive  cmun-mono      400  normal  1      OFL-1.1                                               ofl
cmun-mono-bold           cmuntb.otf                      texlive  cmun-mono      700  normal  1      OFL-1.1                                               ofl
cmun-mono-italic         cmunit.otf                      texlive  cmun-mono      400  italic  1      OFL-1.1                                               ofl
cmun-mono-bolditalic     cmuntx.otf                      texlive  cmun-mono      700  italic  1      OFL-1.1                                               ofl
domitian-regular         Domitian-Roman.otf              texlive  domitian       400  normal  1      OFL-1.1                                               ofl
domitian-bold            Domitian-Bold.otf               texlive  domitian       700  normal  1      OFL-1.1                                               ofl
domitian-italic          Domitian-Italic.otf             texlive  domitian       400  italic  1      OFL-1.1                                               ofl
domitian-bolditalic      Domitian-BoldItalic.otf         texlive  domitian       700  italic  1      OFL-1.1                                               ofl
dejavu-mono-regular      DejaVuSansMono.ttf              texlive  dejavu-mono    400  normal  1      Bitstream-Vera                                        notice
dejavu-mono-bold         DejaVuSansMono-Bold.ttf         texlive  dejavu-mono    700  normal  1      Bitstream-Vera                                        notice
dejavu-mono-italic       DejaVuSansMono-Oblique.ttf      texlive  dejavu-mono    400  italic  1      Bitstream-Vera                                        notice
dejavu-mono-bolditalic   DejaVuSansMono-BoldOblique.ttf  texlive  dejavu-mono    700  italic  1      Bitstream-Vera                                        notice
inconsolata-regular      Inconsolatazi4-Regular.otf      texlive  inconsolata    400  normal  1      OFL-1.1                                               ofl
inconsolata-bold         Inconsolatazi4-Bold.otf         texlive  inconsolata    700  normal  1      Apache-2.0                                            notice
pt-mono-regular          PTM55F.ttf                      texlive  pt-mono        400  normal  1      ParaType-Free-Font-1.3                                notice
pt-mono-bold             PTM75F.ttf                      texlive  pt-mono        700  normal  1      ParaType-Free-Font-1.3                                notice
`

// a row's licence is every column between its size and its web status: an SPDX expression may hold spaces (`WITH`)
export const FACES = Object.freeze(Object.fromEntries(FACE_TABLE.trim().split('\n').map(line => {
  const cols = line.trim().split(/\s+/)
  const [id, file, source, group, weight, style, size] = cols, web = cols.at(-1), licence = cols.slice(7, -1).join(' ')
  return [id, Object.freeze({ id, file, source, family: `axt-${group}`, weight: Number(weight), style, size: Number(size), licence, web })]
})))
// a face by its family, weight and style
const BY_STYLE = new Map(Object.values(FACES).map(f => [`${f.family}|${f.weight}|${f.style}`, f.id]))
const CJK_GROUPS = /^axt-(shs-|haranoaji|fandolkai|bkai00mp)/

// ---------------------------------------------------------------------------------------------------------------------
// The names. A design, its class, its NFSS family names (anchored, as \rmdefault and the rest hold them), its PostScript
// names (a PDF font's, its subset tag stripped). Computer Modern, cm-super, Latin Modern and Libertine's names carry their
// series and shape in codes of their own and are read apart (computerModern, latinModern, libertine); every other name's
// weight and slant come from its style words. Mono and sans before the text families, so that DejaVu Sans Mono is mono.

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
  // erewhon's NFSS families are erewhon-TLF, erewhon-LF and the rest (its .fd files), its PostScript names Erewhon-…
  { design: 'utopia', cls: 'serif', nfss: /^(?:put|mdput|fut|[Ee]rewhon|Utopia)/, ps: /^(?:Utopia|Erewhon)/ },
]
const ENGLISH = ['cm', 'times', 'libertine', 'palatino', 'charter', 'garamond', 'utopia', 'other']
const SERIF_DESIGN = new Set(ENGLISH)

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
export function classifyFont(postScript) {
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

/** the paper's body family, from the font probe's NFSS names (latex-front.mjs FONT_PROBE): the body's where it is a text
 *  family, else the roman's (a paper whose body is set sans keeps its serif's weights); `other` for a name of no family */
export function familyOfProbe(probe) {
  if (!probe) return 'other'
  for (const family of [probe.body, probe.rm]) {
    const name = String(family ?? '')
    const row = name.length <= NAME_MAX ? DESIGNS.find(d => d.nfss?.test(name)) : null
    if (row?.cls === 'serif') return row.design
  }
  return 'other'
}

/** an NFSS family name's design and class (a role's family in the font probe: \rmdefault, \sfdefault, \ttdefault), or
 *  null for a name of no design: the TeX path sets each role in the faces the table gives that design (faceFor) */
export function designOfNfss(name) {
  const s = String(name ?? '')
  const row = s.length <= NAME_MAX ? DESIGNS.find(d => d.nfss?.test(s)) : null
  return row ? { design: row.design, cls: row.cls } : null
}

/** the paper's body family, from the layout file's fonts weighted by the lines each sets: the text family that sets the
 *  most (math, sans and mono faces are not the body); a name of no family weighs for `other` */
export function familyOfFonts(names, weights) {
  const total = new Map(ENGLISH.map(f => [f, 0]))
  const n = Math.min(names?.length ?? 0, weights?.length ?? 0)
  for (let i = 0; i < n; i++) {
    const w = weights[i]
    if (typeof w !== 'number' || !Number.isFinite(w) || w <= 0) continue
    const c = classifyFont(names[i])
    if (c.cls !== 'serif' || !SERIF_DESIGN.has(c.design)) continue
    total.set(c.design, total.get(c.design) + w)
  }
  let best = 'other', most = 0
  for (const f of ENGLISH) if (total.get(f) > most) { best = f; most = total.get(f) }
  return best
}

// ---------------------------------------------------------------------------------------------------------------------
// The roles

// CJK: the family and its Kai. Light beside the lightest English families, its bold SemiBold (the same step of 300);
// Regular and Bold beside the rest (spec §4.4; the sweep chooses between Medium and SemiBold, §4.5)
const CJK_FAMILY = {
  Hans: { group: 'shs-sc', kai: 'fandolkai' }, Hant: { group: 'shs-tc', kai: 'bkai00mp' }, Jpan: { group: 'haranoaji', kai: null },
  Kore: { group: 'shs-k', kai: null },
}
const LIGHT = new Set(['cm', 'garamond'])
const ALPHABETS = new Set(['Latn', 'Cyrl'])
// every Latin and Cyrillic face's missing symbols from Latin Modern Math
const LATIN_FALLBACKS = Object.fromEntries(Object.values(FACES).filter(f => !CJK_GROUPS.test(f.family) && f.id !== 'lm-math').map(f => [f.id, Object.freeze(['lm-math'])]))

/** what a target draws in, for a paper's English family */
export function rolesFor(target, family) {
  const script = scriptOf(target)
  let cjk = null
  const fallbacks = { ...LATIN_FALLBACKS }
  if (Object.hasOwn(CJK_FAMILY, script)) {
    const { group, kai } = CJK_FAMILY[script]
    const light = LIGHT.has(family)
    cjk = { body: `${group}-${light ? 'light' : 'regular'}`, bold: `${group}-${light ? 'semibold' : 'bold'}`, italic: kai, boldItalic: kai }
    // Traditional Chinese's characters Source Han Serif TC lacks, from SC at the same weight; the Kai's, from the body
    if (script === 'Hant') for (const w of ['light', 'regular', 'medium', 'semibold', 'bold']) fallbacks[`shs-tc-${w}`] = Object.freeze([`shs-sc-${w}`])
    if (kai) fallbacks[kai] = Object.freeze([cjk.body])
  } else if (!ALPHABETS.has(script)) throw new Error(`no font roles for ${target} (script ${script}) yet`)
  return Object.freeze({ target, family, cjk: cjk && Object.freeze(cjk), fallbacks: Object.freeze(fallbacks) })
}

// the groups of a design: [the Latin target's (and a CJK target's Latin runs'), the Cyrillic target's], each one group
// or a group by style; `other` by class. Computer Modern's text is CMU Serif, CM's own glyphs (62 of 62 against TeX
// Live's cmr10, cmbx10 and cmti10, where Latin Modern has 59 and 60), but its bold italic Latin Modern's (59 against
// cmbxti10, CMU 32), as its small capitals are (LM's caps face 26 of 26 against cmcsc10, CMU's smcp 3) and its sans and
// typewriter (LM 57-59 against cmss10, cmssbx10, cmssi10 and cmitt10, CMU 21-43; cmtt10 60 and 61)
const CM_TEXT = { regular: 'cmun-serif', bold: 'cmun-serif', italic: 'cmun-serif', bolditalic: 'lm-roman' }
const LATIN_GROUPS = {
  cm: [CM_TEXT, 'cmun-serif'], times: ['nimbus-roman', 'nimbus-roman'], libertine: ['libertine', 'libertine'], palatino: ['domitian', 'domitian'],
  charter: ['xcharter', 'xcharter'], garamond: ['ebgaramond', 'ebgaramond'], utopia: ['erewhon', 'erewhon'],
  helvetica: ['nimbus-sans', 'nimbus-sans'], cmss: ['lm-sans', 'cmun-sans'], courier: ['freemono', 'freemono'], cmtt: ['lm-mono', 'cmun-mono'],
  beramono: ['dejavu-mono', 'dejavu-mono'], inconsolata: ['inconsolata', 'pt-mono'], biolinum: ['biolinum', 'biolinum'],
}
// a family of no table: Latin Modern, fontspec's default, as the TeX path sets it
const OTHER_GROUPS = { serif: ['lm-roman', 'cmun-serif'], sans: LATIN_GROUPS.cmss, mono: LATIN_GROUPS.cmtt }
const styleOf = (bold, italic) => (bold ? (italic ? 'bolditalic' : 'bold') : italic ? 'italic' : 'regular')
// The letters a target's text is set in: its language's where listed, else its script's (a CJK target's Latin runs are
// English). A face that lacks one cannot set the target
const LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const CYRILLIC = String.fromCodePoint(...Array.from({ length: 64 }, (_, i) => 0x410 + i))
const LETTERS = {
  de: `${LATIN}ÄÖÜäöüß`, fr: `${LATIN}ÀÂÆÇÉÈÊËÎÏÔŒÙÛÜŸàâæçéèêëîïôœùûüÿ`, es: `${LATIN}ÁÉÍÑÓÚÜáéíñóúü¡¿`,
  pt: `${LATIN}ÃÕÁÂÀÇÉÊÍÓÔÚÜãõáâàçéêíóôúü`, ru: `${CYRILLIC}Ёё`,
}
const lettersOf = target => {
  const language = new Intl.Locale(target).language
  return Object.hasOwn(LETTERS, language) ? LETTERS[language] : scriptOf(target) === 'Cyrl' ? CYRILLIC : LATIN
}
const holdsAll = new Map()
// whether a face holds every letter (cached: a table's faces by a handful of targets)
const setsAll = (id, letters) => {
  const key = `${id}|${letters}`
  if (!holdsAll.has(key)) holdsAll.set(key, Object.hasOwn(COVERAGE, id) && [...letters].every(ch => holds(COVERAGE[id], ch.codePointAt(0))))
  return holdsAll.get(key)
}
// The face of a group at a weight and slant. Where the group has no such file, or its file lacks the target's letters,
// the nearest style of the same group that has both — bold italic, then bold, italic, regular — as TeX's substitution
// sets a shape the family lacks: so Linux Libertine O's bold italic, which has no Cyrillic, sets Russian in its bold,
// and a unit never stays the original's for a style alone. Where no style of the group has the letters, the nearest
// that exists, and canDraw then keeps the unit the original's
const styled = (group, bold, italic, letters) => {
  let first = null
  for (const [b, i] of [[bold, italic], [bold, false], [false, italic], [false, false]]) {
    const id = BY_STYLE.get(`axt-${group}|${b ? 700 : 400}|${i ? 'italic' : 'normal'}`)
    if (!id) continue
    if (setsAll(id, letters)) return id
    first ??= id
  }
  return first
}

/** the face a run is drawn in. A CJK run takes its target's CJK family by weight and slant, whatever its class (no
 *  sans, no fangsong: §4.4); emphasis is the Kai, or upright where the target has none. A Latin run takes its design's
 *  group (math the math face); small capitals take Latin Modern's caps face, and elsewhere stay the face's: the drawing
 *  sets them by its smcp feature where METRICS says it has one, else as capitals at 0.8 of the size. A CJK run of a
 *  target with no CJK roles is set as a Latin run, and canDraw then finds what its face cannot draw */
export function faceFor(roles, run) {
  const c = roles.cjk
  if (run.script === 'cjk' && c) {
    if (run.italic) return (run.bold ? c.boldItalic : c.italic) ?? (run.bold ? c.bold : c.body)
    return run.bold ? c.bold : c.body
  }
  if (run.cls === 'math') return 'lm-math'
  const cyrillic = scriptOf(roles.target) === 'Cyrl' ? 1 : 0
  const groups = Object.hasOwn(LATIN_GROUPS, run.design) ? LATIN_GROUPS[run.design] : Object.hasOwn(OTHER_GROUPS, run.cls) ? OTHER_GROUPS[run.cls] : OTHER_GROUPS.serif
  const column = groups[cyrillic]
  const group = typeof column === 'string' ? column : column[styleOf(run.bold, run.italic)]
  // Latin Modern's caps face, upright and oblique, for CM's small capitals and an unknown family's; it has no bold
  if (run.caps && !run.bold && !cyrillic && (group === 'lm-roman' || column === CM_TEXT)) return run.italic ? 'lm-roman-caps-italic' : 'lm-roman-caps'
  return styled(group, run.bold, run.italic, lettersOf(roles.target))
}

// whether a face's coverage holds a code point: ranges start, end (inclusive), sorted and disjoint
const holds = (ranges, cp) => {
  let lo = 0, hi = (ranges.length >> 1) - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (cp < ranges[2 * mid]) hi = mid - 1
    else if (cp > ranges[2 * mid + 1]) lo = mid + 1
    else return true
  }
  return false
}
// white space, and the characters Unicode marks default ignorable (zero width space and joiners, soft hyphen, variation
// selectors, byte order mark): invisible, never drawn, as the TeX path drops them (mt.mjs texEscape)
const SKIPPED = /^(?:\s|\p{Default_Ignorable_Code_Point})$/u

/** whether every character of `text` (but white space and the default ignorable) is in one of `faces`' coverage or
 *  their fallbacks' */
export function canDraw(text, faces, roles) {
  const seen = new Set(), queue = [...faces]
  while (queue.length) {
    const id = queue.shift()
    if (seen.has(id)) continue
    seen.add(id)
    const next = roles?.fallbacks && Object.hasOwn(roles.fallbacks, id) ? roles.fallbacks[id] : []
    queue.push(...next)
  }
  const ranges = [...seen].filter(id => Object.hasOwn(COVERAGE, id)).map(id => COVERAGE[id])
  for (const ch of String(text)) {
    if (SKIPPED.test(ch)) continue
    const cp = ch.codePointAt(0)
    if (!ranges.some(r => holds(r, cp))) return false
  }
  return true
}
