# Hyphenation: TeX's own breaks for French, Spanish and Portuguese

`hyph-utf8-words.json` holds what the layer's hyphenation is held to (`tests/pdf-reader/layer-proto.test.ts`, #121-4):

- `tex`: 18 words a language as TeX broke them, `\showhyphens` under babel's `french`, `spanish` and `portuguese` (T1, pdfLaTeX)
  in the pinned TeX Live image of `lab/pdf/compile-images.json` (TeX Live 2025, `texlive/texlive@sha256:7056390e…`), babel's
  own minimums applied (`\providehyphenmins`: French 2 and 3, Spanish 2 and 2, Portuguese 2 and 3);
- `patterns`, `exceptions`: of hyph-utf8's `hyph-fr.tex`, `hyph-es.tex` and `hyph-pt.tex` in that image, read by
  `patternsOfTex(text, 'utf8')`, the patterns Liang's algorithm can apply to those words (each one whose letters occur in
  `.word.` of a word of the list; no other pattern of the file changes their breaks) and the exceptions among them;
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
patterns of the image's three files filtered as above).
