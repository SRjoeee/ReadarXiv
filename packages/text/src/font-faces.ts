// The face catalogue and the font roles' tables, held once for the engine and the typesetter: every face the reader draws
// in (FACE_TABLE: its file, source, family, weight, style, size correction, licence and web status; FACES), each face's
// letters (font-letters.ts HOLDS and SMCP, made from the coverage table), the groups each English family's runs take by
// style and script (LATIN_GROUPS, OTHER_GROUPS, CM_TEXT), the letters a target is set in (LETTER_SETS), and the readings
// over them that keep nothing between calls (styled, capsLetters, ownSmallCaps). The engine's role table re-exports them at
// its old path (packages/engine/src/fonts/font-roles.ts: the roles a target draws in, the face a run takes, canDrawIn); the
// typesetter's B.faces reads them (typeset breaker/faces.ts, data/faces.ts). Moved whole from the engine's font-roles.ts,
// the typesetter's copies (data/faces.ts FACES, HOLDS and SMCP, breaker/faces.ts's tables) gone with it.
import { HOLDS, SMCP } from './font-letters.ts'

export type FaceId = string
/** a face of the catalog */
export interface Face {
  id: FaceId
  /** the file's name, as TeX finds it and the subsetter reads it */
  file: string
  source: 'texlive' | 'hosted'
  /** our CSS family name: 'axt-' and the face group */
  family: string
  /** 300 Light, 400 Regular, 500 Medium, 600 SemiBold, 700 Bold */
  weight: number
  style: 'normal' | 'italic'
  /** × the run's size: a CJK face's script at its family's ideographs' visual size (1: none) */
  size: number
  /** an SPDX expression (an identifier, WITH an exception), or 'LicenseRef-<name>' */
  licence: string
  web: 'ofl' | 'gfl' | 'notice' | 'gpl' | 'review'
}

/**
 * Every face, one row each: its id, its file (as TeX finds it and the subsetter reads it), where the file comes from,
 * its group (our CSS family is `axt-` and the group, but for the four FAMILY_NAME renames), its CSS weight and style, its size correction, its licence (an
 * SPDX expression, or a LicenseRef-) and its web status — `ofl` and `gfl` (GUST) served as their licences let, `notice`
 * served with its licence's notice, `gpl` served with the notice and the full file as the subsets' source, `review`
 * decided by the maintainer for the web (spec §8: served on the maintainer's word of 2026-10-06, as the gpl faces are).
 * scripts/font-roles.py reads this table too: it measures each file (font-coverage.ts), so keep one row a line, the
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
shs-sc-regular           SourceHanSerifSC-Regular.otf    hosted   shs-sc         400  normal  1      OFL-1.1                                               ofl
shs-sc-medium            SourceHanSerifSC-Medium.otf     hosted   shs-sc         500  normal  1      OFL-1.1                                               ofl
shs-sc-bold              SourceHanSerifSC-Bold.otf       hosted   shs-sc         700  normal  1      OFL-1.1                                               ofl
shs-tc-regular           SourceHanSerifTC-Regular.otf    hosted   shs-tc         400  normal  1      OFL-1.1                                               ofl
shs-tc-medium            SourceHanSerifTC-Medium.otf     hosted   shs-tc         500  normal  1      OFL-1.1                                               ofl
shs-tc-bold              SourceHanSerifTC-Bold.otf       hosted   shs-tc         700  normal  1      OFL-1.1                                               ofl
shs-k-regular            SourceHanSerifK-Regular.otf     hosted   shs-k          400  normal  0.959  OFL-1.1                                               ofl
shs-k-medium             SourceHanSerifK-Medium.otf      hosted   shs-k          500  normal  0.965  OFL-1.1                                               ofl
shs-k-bold               SourceHanSerifK-Bold.otf        hosted   shs-k          700  normal  0.974  OFL-1.1                                               ofl
haranoaji-regular        HaranoAjiMincho-Regular.otf     texlive  haranoaji      400  normal  1      OFL-1.1                                               ofl
haranoaji-medium         HaranoAjiMincho-Medium.otf      texlive  haranoaji      500  normal  1      OFL-1.1                                               ofl
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

// A face's family is more than the CSS family it is declared and drawn in: it is the name inside every subset served of
// it. The web's subsetter (readarxiv-web, container/src/fonts/subset.py) writes it as the name table's family, unique
// identifier, full and PostScript names (IDs 1, 3, 4, 6; the typographic names, 16 and 17, are dropped) and as the CFF
// table's font, full and family names and each CID font dictionary's, keeps the face's copyright and licence (IDs 0, 13
// and 14, the CFF notice) and states the change (ID 10). A subset is a Modified Version, which may carry no name its
// face's licence reserves (OFL §3; ParaType's and Bitstream Vera's licences ask the same), so no family may hold one:
// Source (Source Han Serif SC, TC and K, and Harano Aji, made from Source Han Serif JP), Harano Aji, Linux Libertine and
// Biolinum, Heuristica and Erewhon, Computer Modern Unicode fonts, PT Sans, PT Serif and PT Mono, Bitstream and Vera
// (DejaVu Sans Mono). The four groups whose own name holds one are served under a neutral family; the others' names
// (shs-sc, shs-tc, shs-k, libertine, cmun-*, dejavu-mono) hold none. The group stays the handle of the table (a face's
// id, the roles below); only the family is renamed
const FAMILY_NAME: Readonly<Record<string, string>> = {
  haranoaji: 'mincho',
  biolinum: 'humanist-sans',
  erewhon: 'transitional',
  'pt-mono': 'slab-mono',
}
const familyOf = (group: string): string => `axt-${FAMILY_NAME[group] ?? group}`
// a row's licence is every column between its size and its web status: an SPDX expression may hold spaces (`WITH`)
export const FACES: Readonly<Record<FaceId, Face>> = Object.freeze(
  Object.fromEntries(
    FACE_TABLE.trim()
      .split('\n')
      .map((line): [FaceId, Face] => {
        const cols = line.trim().split(/\s+/)
        const [id, file, source, group, weight, style, size] = cols as [
            string,
            string,
            string,
            string,
            string,
            string,
            string,
          ],
          web = cols.at(-1),
          licence = cols.slice(7, -1).join(' ')
        return [
          id,
          Object.freeze({
            id,
            file,
            source: source as Face['source'],
            family: familyOf(group),
            weight: Number(weight),
            style: style as Face['style'],
            size: Number(size),
            licence,
            web: web as Face['web'],
          }),
        ]
      }),
  ),
)
// a face by its family, weight and style
const BY_STYLE = new Map(
  Object.values(FACES).map((f): [string, FaceId] => [`${f.family}|${f.weight}|${f.style}`, f.id]),
)
const CJK_GROUPS = /^axt-(shs-|mincho|fandolkai|bkai00mp)/
/** whether a face of the catalog is a CJK one (Source Han Serif's, Harano Aji's, a Kai): a rule's CJK group is checked by it */
export const isCjkFace = (id: string): boolean => Object.hasOwn(FACES, id) && CJK_GROUPS.test(FACES[id]!.family)

export const ALPHABETS = new Set<string>(['Latn', 'Cyrl'])
// every Latin and Cyrillic face's missing symbols from Latin Modern Math
export const LATIN_FALLBACKS: Readonly<Record<FaceId, readonly FaceId[]>> = Object.fromEntries(
  Object.values(FACES)
    .filter((f) => !CJK_GROUPS.test(f.family) && f.id !== 'lm-math')
    .map((f) => [f.id, Object.freeze(['lm-math'])]),
)

// the groups of a design: [the Latin target's (and a CJK target's Latin runs'), the Cyrillic target's], each one group
// or a group by style; `other` by class. Computer Modern's text is CMU Serif, CM's own glyphs (62 of 62 against TeX
// Live's cmr10, cmbx10 and cmti10, where Latin Modern has 59 and 60), but its bold italic Latin Modern's (59 against
// cmbxti10, CMU 32), as its small capitals are (LM's caps face 26 of 26 against cmcsc10, CMU's smcp 3) and its sans and
// typewriter (LM 57-59 against cmss10, cmssbx10, cmssi10 and cmitt10, CMU 21-43; cmtt10 60 and 61)
/** a design's column: one group, or a group by style */
type GroupColumn = string | Readonly<Record<string, string>>
export const CM_TEXT: Readonly<Record<string, string>> = {
  regular: 'cmun-serif',
  bold: 'cmun-serif',
  italic: 'cmun-serif',
  bolditalic: 'lm-roman',
}
export const LATIN_GROUPS: Readonly<Record<string, readonly [GroupColumn, GroupColumn]>> = {
  cm: [CM_TEXT, 'cmun-serif'],
  times: ['nimbus-roman', 'nimbus-roman'],
  libertine: ['libertine', 'libertine'],
  palatino: ['domitian', 'domitian'],
  charter: ['xcharter', 'xcharter'],
  garamond: ['ebgaramond', 'ebgaramond'],
  utopia: ['erewhon', 'erewhon'],
  helvetica: ['nimbus-sans', 'nimbus-sans'],
  cmss: ['lm-sans', 'cmun-sans'],
  courier: ['freemono', 'freemono'],
  cmtt: ['lm-mono', 'cmun-mono'],
  beramono: ['dejavu-mono', 'dejavu-mono'],
  inconsolata: ['inconsolata', 'pt-mono'],
  biolinum: ['biolinum', 'biolinum'],
}
// a family of no table: Latin Modern, fontspec's default, as the TeX path sets it
export const OTHER_GROUPS: Readonly<Record<string, readonly [GroupColumn, GroupColumn]>> = {
  serif: ['lm-roman', 'cmun-serif'],
  sans: LATIN_GROUPS.cmss!,
  mono: LATIN_GROUPS.cmtt!,
}
export const styleOf = (bold: boolean, italic: boolean): string =>
  bold ? (italic ? 'bolditalic' : 'bold') : italic ? 'italic' : 'regular'
// The letters a target's text is set in: its language's where listed, else its script's (a CJK target's Latin runs are
// English). A face that lacks one cannot set the target
const LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const CYRILLIC = String.fromCodePoint(...Array.from({ length: 64 }, (_, i) => 0x410 + i))
export const LETTERS: Readonly<Record<string, string>> = {
  de: `${LATIN}ÄÖÜäöüß`,
  fr: `${LATIN}ÀÂÆÇÉÈÊËÎÏÔŒÙÛÜŸàâæçéèêëîïôœùûüÿ`,
  es: `${LATIN}ÁÉÍÑÓÚÜáéíñóúü¡¿`,
  pt: `${LATIN}ÃÕÁÂÀÇÉÊÍÓÔÚÜãõáâàçéêíóôúü`,
  ru: `${CYRILLIC}Ёё`,
  // (the languages of the owner's ruling of 2026-10-29; Indonesian, Malay and Bulgarian need none beyond their script's)
  it: `${LATIN}ÀÈÉÌÍÎÒÓÙÚàèéìíîòóùú`,
  nl: `${LATIN}ÁÉÍÓÚÄËÏÖÜÈáéíóúäëïöüè`,
  pl: `${LATIN}ĄĆĘŁŃÓŚŹŻąćęłńóśźż`,
  tr: `${LATIN}ÇĞİÖŞÜçğıöşüÂâÎîÛû`,
  cs: `${LATIN}ÁČĎÉĚÍŇÓŘŠŤÚŮÝŽáčďéěíňóřšťúůýž`,
  sv: `${LATIN}ÅÄÖåäöÉé`,
  uk: `${CYRILLIC}ҐґЄєІіЇї`,
}
/** each alphabet a face's letters are read by (font-letters.ts HOLDS, made from the coverage table): a language's own
 *  (LETTERS), and a script's bare letters, `Latn` and `Cyrl` */
export const LETTER_SETS: Readonly<Record<string, string>> = Object.freeze({ Latn: LATIN, Cyrl: CYRILLIC, ...LETTERS })
// whether a face holds every letter of an alphabet (font-letters.ts, the coverage table's answer for each face and alphabet)
const setsAll = (id: FaceId, alphabet: string): boolean => !!HOLDS[id]?.includes(alphabet)
// The face of a group at a weight and slant. Where the group has no such file, or its file lacks the target's letters,
// the nearest style of the same group that has both — bold italic, then bold, italic, regular — as TeX's substitution
// sets a shape the family lacks: so Linux Libertine O's bold italic, which has no Cyrillic, sets Russian in its bold,
// and a unit never stays the original's for a style alone. Where no style of the group has the letters, the nearest
// that exists, and canDraw then keeps the unit the original's
export const styled = (group: string, bold: boolean, italic: boolean, alphabet: string): FaceId | null => {
  let first: FaceId | null = null
  for (const [b, i] of [
    [bold, italic],
    [bold, false],
    [false, italic],
    [false, false],
  ] as [boolean, boolean][]) {
    const id = BY_STYLE.get(`${familyOf(group)}|${b ? 700 : 400}|${i ? 'italic' : 'normal'}`)
    if (!id) continue
    if (setsAll(id, alphabet)) return id
    first ??= id
  }
  return first
}

/** the faces whose letters are small capitals: Latin Modern's caps face, upright and oblique (faceFor) */
const CAPS_FACES = new Set<string>(['lm-roman-caps', 'lm-roman-caps-italic'])
/** whether a face's lowercase letters are its small capitals (Latin Modern's caps face): a run in it is measured and drawn in its
 *  own letters, no small capitals asked of it (layer-proto/fonts.mjs, the face's `caps`) */
export const capsLetters = (id: string): boolean => CAPS_FACES.has(id)
/** whether a face draws small capitals of its own: by its smcp feature (font-letters.ts SMCP, the coverage table's METRICS),
 *  or by its letters (Latin Modern's caps face).
 *  A run set in small capitals in a face with neither has them drawn by the layer from the face's capitals, at the share of the
 *  size the original's small capitals are set at (layer-proto/layer2.mjs selfCaps), never synthesized by the browser */
export const ownSmallCaps = (id: string): boolean => CAPS_FACES.has(id) || SMCP.includes(id)
