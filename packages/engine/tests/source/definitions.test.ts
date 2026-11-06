import { describe, expect, it } from 'vitest'
import {
  askFile,
  DEFINITIONS_FORMAT,
  findFile,
  meaningOf,
  namesUsed,
  readDefinitions,
} from '../../src/source/definitions.ts'
import { LEX_RULES } from '../../src/source/kinds.ts'

const tree = (files: Record<string, string>, main = 'main.tex') => ({
  main,
  files: new Map(Object.entries(files).map(([k, v]) => [k, new TextEncoder().encode(v)])),
})

describe('the definitions: TeX’s meanings read back', () => {
  it('reads a macro’s prefixes, parameter text and body', () => {
    expect(meaningOf('\\long macro:#1->Notebook~#1')).toEqual({
      k: 'macro',
      long: true,
      protected: false,
      outer: false,
      params: '#1',
      body: 'Notebook~#1',
    })
    expect(meaningOf('\\protected\\long macro:#1.#2\\end ->x')).toMatchObject({
      protected: true,
      long: true,
      params: '#1.#2\\end ',
    })
    expect(meaningOf('\\iffalse')).toEqual({ k: 'other', text: '\\iffalse' })
    expect(meaningOf('undefined')).toEqual({ k: 'undefined' })
  })
  it('reads the records of a file TeX wrote, and knows a file cut short', () => {
    const file = [
      `H ${DEFINITIONS_FORMAT}`,
      'M opt macro:->\\@protected@testopt \\opt \\\\opt {x}',
      'O opt \\long macro:[#1]#2->(#1:#2)',
      'M rob macro:->\\protect \\rob  ',
      'R rob \\long macro:#1->R#1',
      'M xp \\protected macro:->\\__cmd_start:nNNnnn {O{d} m}\\xp  \\xp code {}{}{}',
      'S xp O{d} m',
      'M nothing undefined',
      'END 4',
    ].join('\n')
    const d = readDefinitions(file)
    expect(d.complete).toBe(true)
    expect(d.names.get('opt')?.opt).toMatchObject({ k: 'macro', params: '[#1]#2' })
    expect(d.names.get('rob')?.robust).toMatchObject({ params: '#1', body: 'R#1' })
    expect(d.names.get('xp')?.spec).toBe('O{d} m')
    expect(d.names.get('nothing')?.meaning.k).toBe('undefined')
    expect(readDefinitions(file.replace(/\nEND 4$/, '')).complete).toBe(false)
  })
  it('asks each name once, only names a group can carry', () => {
    const f = askFile(['b', 'a', 'a', 'figure*', '%', 'tl_new:N'])
    expect(f.match(/\\axt@ask\{[^}]*\}%/g)).toEqual(['\\axt@ask{a}%', '\\axt@ask{b}%', '\\axt@ask{figure*}%'])
  })
})

describe('the definitions: the names a source uses', () => {
  it('follows \\input in its braced and unbraced forms, and import.sty’s directories', () => {
    const t = tree({
      'main.tex': '\\input{a}\\input b\n\\import{dir/}{c}\\begin{thm}x\\end{thm}',
      'a.tex': '\\inA',
      'b.tex': '\\inB',
      'dir/c.tex': '\\inC',
    })
    const names = namesUsed(t, LEX_RULES)
    for (const n of ['inA', 'inB', 'inC', 'thm', 'endthm']) expect(names.has(n), n).toBe(true)
  })
  it('reads no names in \\verb’s text or an environment read by lines', () => {
    const names = namesUsed(
      tree({ 'main.tex': '\\verb|\\hidden|\\begin{verbatim}\\alsohidden\\end{verbatim}\\shown' }),
      LEX_RULES,
    )
    expect(names.has('hidden')).toBe(false)
    expect(names.has('alsohidden')).toBe(false)
    expect(names.has('shown')).toBe(true)
  })
  it('finds a file as kpathsea does: name.tex before name', () => {
    const t = tree({ 'main.tex': '', 'x.tex': '', x: '', 'y.cls.tex': '', 'z.tex': '' })
    expect(findFile(t, 'x')).toBe('x.tex')
    expect(findFile(t, './z.tex')).toBe('z.tex')
    expect(findFile(t, 'missing')).toBeNull()
  })
})
