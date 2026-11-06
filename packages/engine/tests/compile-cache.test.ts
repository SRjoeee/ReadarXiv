import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  canonical,
  decodeStored,
  encodeStored,
  instrumentKey,
  type InstrumentInputs,
  type StoredInstrument,
} from '../src/compile/cache.ts'
import { MARKS_CODE } from '../src/compile/marks-code.ts'
import { PLAN_FORMAT } from '../src/marks/mark.ts'

const enc = (s: string) => new TextEncoder().encode(s)
const inputs = (o: Partial<InstrumentInputs> = {}): InstrumentInputs => ({
  files: new Map([
    ['main.tex', enc('\\documentclass{article}\\begin{document}Hi.\\end{document}\n')],
    ['fig.pdf', new Uint8Array([37, 80, 68, 70])],
  ]),
  main: 'main.tex',
  tree: 'texlive/texlive@sha256:aa',
  compiler: 'pdflatex',
  sourceDate: 1700000000,
  steps: 'drafts',
  ...o,
})

describe('the instrument cache', () => {
  it('holds MARKS_CODE to the code that decides the marked tree (lab/marks/marks-code.mjs)', () => {
    const root = new URL('../src/', import.meta.url).pathname
    const files = [
      ...readdirSync(`${root}source`)
        .filter((f) => f.endsWith('.ts'))
        .map((f) => `source/${f}`),
      'marks/mark.ts',
      'marks/probe.ts',
      'marks/classes.ts',
      'marks/tex.ts',
      'marks/statements.ts',
      'compile/recover.ts',
    ]
      .map((f) => `packages/engine/src/${f}`)
      .sort()
    const h = createHash('sha256')
    for (const f of files)
      h.update(f)
        .update('\0')
        .update(readFileSync(`${root}${f.slice('packages/engine/src/'.length)}`))
        .update('\0')
    expect(MARKS_CODE).toBe(h.digest('hex'))
  })
  it('keys on every input: a file’s bytes or name, the tree, the compiler, the date, the steps, the code', () => {
    const k = instrumentKey(inputs())
    expect(instrumentKey(inputs())).toBe(k)
    // (the files' order is not an input)
    expect(instrumentKey(inputs({ files: new Map([...inputs().files].reverse()) }))).toBe(k)
    const others = [
      inputs({ files: new Map([...inputs().files, ['fig.pdf', new Uint8Array([37, 80, 68, 71])]]) }),
      inputs({ files: new Map([...inputs().files, ['b.tex', new Uint8Array()]]) }),
      inputs({ tree: 'texlive/texlive@sha256:bb' }),
      inputs({ compiler: 'xelatex' }),
      inputs({ sourceDate: null }),
      inputs({ steps: 'drafts, unit marks only' }),
      inputs({ marks: 'another code' }),
      inputs({ main: 'fig.pdf' }),
    ].map(instrumentKey)
    expect(new Set([k, ...others]).size).toBe(others.length + 1)
  })
  it('writes one canonical text for one value (keys sorted, a Map by its entries)', () => {
    expect(canonical({ b: 1, a: [1, { d: 2, c: 3 }], u: undefined })).toBe('{"a":[1,{"c":3,"d":2}],"b":1}')
    expect(
      canonical(
        new Map([
          ['y', 1],
          ['x', 2],
        ]),
      ),
    ).toBe('{"x":2,"y":1}')
  })
  it('reads back what it stored, byte for byte, and refuses another key or a cut', () => {
    const s: StoredInstrument = {
      key: instrumentKey(inputs()),
      definitions: 'readarxiv-definitions 1\nM \\foo macro:->é\nEND\n',
      made: [['main.bbl', enc('\\begin{thebibliography}{1}\\end{thebibliography}')]],
      answers: { inkless: ['\\x'] },
      plan: {
        format: PLAN_FORMAT,
        main: 'main.tex',
        head: 12,
        marks: [
          { name: '0s', kind: 'start', unit: 0, piece: -1, pieceId: null, file: 'main.tex', at: 3, byte: 3, tex: 'x' },
        ],
        units: [{ id: 'abc', kind: 'para', marked: true }],
        files: ['main.tex'],
        parts: { dvi: false, names: true, lines: true, regions: [] },
      },
      pdf: new Uint8Array([1, 2, 3, 0, 255]),
      log: 'This is pdfTeX éÿ\nAXT-END\n',
      compiles: [{ step: 'marked', ms: 12, passes: 2, ok: true }],
    }
    const b = encodeStored(s)
    expect(decodeStored(b, s.key)).toEqual(s)
    expect(encodeStored(decodeStored(b))).toEqual(b)
    expect(() => decodeStored(b, 'other')).toThrow()
    expect(() => decodeStored(b.subarray(0, b.length - 1))).toThrow()
  })
})
