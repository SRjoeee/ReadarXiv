// kpathsea's search paths within the TeX Live tree (experiments/pdf-bilingual/tex-page/kpathsea.mjs), from texmf.cnf as
// BusyTeX ships it (TeX Live 2026's): the index chooses among files of one name with them, as TeX Live does. The
// excerpt below is texmf.cnf's own lines for the variables used
import { describe, expect, it } from 'vitest'
import { braces, lsrCompare, parseCnf, searchPath } from '../tex-page/kpathsea.mjs'

const CNF = `% texmf.cnf excerpt
TEXMFROOT = $SELFAUTOPARENT
TEXMFDIST = $TEXMFROOT/texmf-dist
TEXMFLOCAL = $SELFAUTOGRANDPARENT/texmf-local
TEXMF = {$TEXMFAUXTREES$TEXMFCONFIG,$TEXMFVAR,$TEXMFHOME,!!$TEXMFLOCAL,!!$TEXMFSYSCONFIG,!!$TEXMFSYSVAR,!!$TEXMFDIST}
TEXMFDOTDIR = .
TEXINPUTS.pdflatex      = $TEXMFDOTDIR;$TEXMF/tex/{latex,generic,}//
TEXINPUTS.xelatex       = $TEXMFDOTDIR;$TEXMF/tex/{xelatex,latex,xetex,generic,}//
TEXINPUTS               = $TEXMFDOTDIR;$TEXMF/tex/{$progname,generic,latex,}//
TEXINPUTS.pdflatex      = $TEXMFDOTDIR;$TEXMF/tex/second-definition//
TFMFONTS = $TEXMFDOTDIR;{$TEXMF/fonts,$VARTEXFONTS}/tfm//
TEXFONTMAPS = $TEXMFDOTDIR;$TEXMF/fonts/map/{$progname,pdftex,dvips,}//
T1FONTS = $TEXMFDOTDIR;$TEXMF/fonts/type1//;$OSFONTDIR//
DVIPDFMXINPUTS = $TEXMF/dvipdfmx
BSTINPUTS = $TEXMFDOTDIR;$TEXMF/bibtex/{bst,csf}//
LUAINPUTS = $TEXMFDOTDIR;$TEXMF/scripts/{$progname,$engine,}/{lua,}//;\\
  $TEXMF/tex/{luatex,plain,generic,latex,}//
`
const vars = parseCnf(CNF)

describe('searchPath', () => {
  it('the program\'s own value of a variable first, the first definition of it; only the elements in the distribution tree', () => {
    expect(searchPath(vars, 26, 'pdflatex')).toEqual(['tex/latex//', 'tex/generic//', 'tex//'])
    expect(searchPath(vars, 26, 'xelatex')).toEqual(['tex/xelatex//', 'tex/latex//', 'tex/xetex//', 'tex/generic//', 'tex//'])
  })

  it('a program without a value of its own takes the plain one, $progname standing for its name', () => {
    expect(searchPath(vars, 26, 'bibtex8')).toEqual(['tex/bibtex8//', 'tex/generic//', 'tex/latex//', 'tex//'])
  })

  it('braces around variables, and places outside the tree (VARTEXFONTS, OSFONTDIR) left out', () => {
    expect(searchPath(vars, 3, 'pdflatex')).toEqual(['fonts/tfm//'])
    expect(searchPath(vars, 32, 'pdflatex')).toEqual(['fonts/type1//'])
  })

  it('xdvipdfmx searches as dvipdfmx (dvipdfmx.c), its own files by <PROGNAME>INPUTS', () => {
    expect(searchPath(vars, 11, 'xdvipdfmx')).toEqual(['fonts/map/dvipdfmx//', 'fonts/map/pdftex//', 'fonts/map/dvips//', 'fonts/map//'])
    expect(searchPath(vars, 39, 'xdvipdfmx')).toEqual(['dvipdfmx'])
  })

  it('a program with no <PROGNAME>INPUTS: kpathsea\'s default, its own directory', () => {
    expect(searchPath(vars, 39, 'pdflatex')).toEqual(['pdflatex//'])
  })

  it('continued lines and $engine', () => {
    // the empty alternative leaves `scripts//lua//`: any directory between, as kpathsea expands it
    expect(searchPath(vars, 51, 'luahblatex')).toEqual(['scripts/luahblatex/lua//', 'scripts/luahblatex//', 'scripts/luahbtex/lua//', 'scripts/luahbtex//', 'scripts//lua//', 'scripts//', 'tex/luatex//', 'tex/plain//', 'tex/generic//', 'tex/latex//', 'tex//'])
  })

  it('a format without a variable: nothing in the tree', () => {
    expect(searchPath(vars, 27, 'pdflatex')).toEqual([])
  })
})

describe('braces', () => {
  it('expands nested alternatives, an empty one included', () => {
    expect(braces('a{b,c{d,}}e')).toEqual(['abe', 'acde', 'ace'])
    expect(braces('tex/{latex,generic,}//')).toEqual(['tex/latex//', 'tex/generic//', 'tex///'])
  })
})

describe('lsrCompare', () => {
  it('orders directories as ls-R lists them: a directory before its subdirectories, siblings bytewise', () => {
    expect(['tex/latex-dev/base', 'tex/latex/base', 'tex/latex', 'tex/generic/babel', 'tex', 'tex/Latin'].sort(lsrCompare)).toEqual(['tex', 'tex/Latin', 'tex/generic/babel', 'tex/latex', 'tex/latex/base', 'tex/latex-dev/base'])
  })
})
