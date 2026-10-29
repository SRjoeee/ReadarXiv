# Hyphenation: TeX's own breaks for the hyph-utf8 targets

`hyph-utf8-words.json` holds what the layer's hyphenation is held to (`tests/pdf-reader/layer-proto.test.ts`; #121-4 for French,
Spanish and Portuguese, the owner's ruling of 2026-10-29 for Italian, Dutch, Polish, Turkish, Indonesian, Malay, Czech,
Swedish, Ukrainian and Bulgarian):

- `tex`: 18 to 22 words a target as TeX broke them, `\showhyphens` under babel's language in the pinned TeX Live image of
  `lab/pdf/compile-images.json` (TeX Live 2025, `texlive/texlive@sha256:7056390e…`), the minimums TeX applies there: babel's
  `\providehyphenmins` for French 2 and 3, Spanish 2 and 2, Portuguese 2 and 3 (T1, pdfLaTeX); for the ten, `\lefthyphenmin`
  and `\righthyphenmin` as pdfLaTeX (T2A, T1) and LuaLaTeX report them under babel, the two alike: Italian 2 and 2, Dutch 2
  and 3, Polish 2 and 3, Turkish 2 and 3, Indonesian and Malay 2 and 2, Czech 2 and 3, Swedish 2 and 2, Ukrainian 2 and 2,
  Bulgarian 2 and 3 (where an .ldf provides none, Polish's and Turkish's, LaTeX's 2 and 3 stand; the files' own
  `hyphenmins: typesetting` hints are not what TeX applies). Malay's words are TeX's under babel's `malay`, which takes
  Indonesian's patterns (`malay.ldf`: `\let\l@malay\l@indonesian`; TeX Live has no Malay patterns); the ten's breaks are
  LuaLaTeX's `\showhyphens`, one word a call, in CMU Serif (the Cyrillic printed as itself);
- `patterns`, `exceptions`: of hyph-utf8's file of each language in that image, read by `patternsOfTex(text, 'utf8')`, the
  patterns Liang's algorithm can apply to those words (each one whose letters occur in `.word.` of a word of the list, lowered
  as the language lowers it: Turkish's `I` is `ı`; no other pattern of the file changes their breaks) and the exceptions among
  them;
- `notices`: each file's place, its copyright line and its licence's name.

The patterns are a part of those files, kept here as test data under their licences:

- `hyph-fr.tex`: Copyright (C) 1994-2002 Daniel Flipo, Bernard Gaulle, 2016 Arthur Reutenauer. MIT licence.
- `hyph-es.tex`: Copyright (C) 1993, 1997 Javier Bezos, 2001-2019 Javier Bezos, CervanTeX. MIT/X11 licence.

  Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation
  files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy,
  modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
  Software is furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
  Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
  WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
  COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
  ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

- `hyph-it.tex`: Copyright (C) 2008-2011 Claudio Beccari. LPPL 1.3 or later, or the MIT licence above (taken under MIT).
- `hyph-nl.tex`: Copyright (C) 1996 Piet Tutelaers. The MIT licence above.
- `hyph-pl.tex`: Copyright (C) 1987-1995 Hanna Kołodziejska, Bogusław Jackowski, Marek Ryćko. The MIT licence above, or the
  public domain under Knuth's conditions for plain.tex (taken under MIT).
- `hyph-uk.tex`: Copyright (C) 1998-2001 Maksym Polyakov. The MIT licence above, or the LPPL (taken under MIT).
- `hyph-tr.tex`: Copyright (C) 1987 Pierre A. MacKay, 2008, 2011 TUG. LaTeX Project Public License 1.0 or later
  (https://latex-project.org/lppl/).
- `hyph-sv.tex`: Copyright (C) 1994 Jan Michael Rynning. LaTeX Project Public License 1.2 or later
  (https://latex-project.org/lppl/).
- `hyph-id.tex`: Copyright (C) 1996, 1997 Jörg Knappen, Terry Mart. GNU General Public License version 2
  (https://www.gnu.org/licenses/old-licenses/gpl-2.0.html); the whole file is TeX Live's, `tex/generic/hyph-utf8/patterns/tex/`.
- `hyph-cs.tex`: Copyright (C) 1995 Pavel Ševeček. GNU General Public License version 2 or later
  (https://www.gnu.org/licenses/gpl.html); the whole file is TeX Live's, as above.
- `hyph-bg.tex`: Copyright (C) 2000, 2004, 2017 Anton Zinoviev.

  This software may be used, modified, copied, distributed, and sold, both in source and binary form provided that the above
  copyright notice and these terms are retained. The name of the author may not be used to endorse or promote products
  derived from this software without prior permission. THIS SOFTWARE IS PROVIDES "AS IS" AND ANY EXPRESS OR IMPLIED
  WARRANTIES ARE DISCLAIMED. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY DAMAGES ARISING IN ANY WAY OUT OF THE USE OF THIS
  SOFTWARE.

- `hyph-pt.tex`: Copyright (C) 1987, 1994, 1996, 2015 Pedro J. de Rezende, 1996, 2015 J. Joao Dias Almeida, 2024 Leonardo
  Araujo and Aline Benevides. BSD 3-clause licence.

  Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following
  conditions are met:
  * Redistributions of source code must retain the above copyright notice, this list of conditions and the following
    disclaimer.
  * Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following
    disclaimer in the documentation and/or other materials provided with the distribution.
  * Neither the name of the University of Campinas, of the University of Minho nor the names of its contributors may be used
    to endorse or promote products derived from this software without specific prior written permission.

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES,
  INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
  DISCLAIMED. IN NO EVENT SHALL PEDRO J. DE REZENDE OR J.JOAO DIAS ALMEIDA BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
  SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
  CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
  SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

Made again: the TeX file `words.tex` and the two steps are in the engine lane's notes of 2026-10-29 (a `docker run` of the
image's `pdflatex` over the word list, its log read in Latin-1, T1's accented letters at their Latin-1 places; then the
patterns of the image's three files filtered as above). The ten's are the languages lane's of the same day: one `docker run`
of the image (`--network none`, `max_print_line=10000`) running `lualatex` over a `words.tex` of `\usepackage{fontspec}`,
`\setmainfont[Extension=.otf]{cmunrm}`, `\usepackage[italian,dutch,polish,turkish,indonesian,malay,czech,swedish,ukrainian,bulgarian,english]{babel}`
and, inside each `otherlanguage`, a `\typeout` of the two minimums and one `\showhyphens{<word>}` a word, its log's `[] \TU/…`
lines read; and `pdflatex` over the same languages under `\usepackage[T2A,T1]{fontenc}` for the minimums alone.
