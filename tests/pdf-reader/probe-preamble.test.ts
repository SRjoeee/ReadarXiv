// @vitest-environment node
// The mark probe over the marked preamble (live.ts markedPreamble, probeFiles `preamble`) defines every mark that preamble
// carries as the marked compile does, so that TeX meets in the probe only what it will meet in the marked compile. A class of
// our own whose \author expands its argument where the preamble reads it (\protected@edef, as a class that stores the names
// expanded does), and raises an error of its own there: the probe over a preamble that holds an author's call (\axtcall,
// CALL_TEX) reports that error alone, in the pinned TeX Live image, offline.
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { markedPreamble, openPaper, probeFiles } from '../../packages/engine/src/compile/live.ts'
import { compileImageRef } from '../../lab/pdf/spikes/compile-image.mjs'

const IMAGE = compileImageRef()
const docker = spawnSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore' }).status === 0
const enc = (s: string) => new TextEncoder().encode(s)
// (its \author stores the names expanded, then calls a command the class never defined: the class's own error, every time)
const CLASS = [
  '\\NeedsTeXFormat{LaTeX2e}',
  '\\ProvidesClass{namesexpanded}[2026/01/01 a class that stores its authors expanded]',
  '\\LoadClass{article}',
  '\\renewcommand\\author[1]{\\protected@edef\\@author{#1}\\classownundefined}',
  '',
].join('\n')
const SOURCE = [
  '\\documentclass{namesexpanded}',
  '\\title{A Title}',
  '\\author{Ann Lee \\and Bob Ray}',
  '\\begin{document}',
  '\\maketitle',
  'Some words of the paper.',
  '\\end{document}',
  '',
].join('\n')
/** the probe's one pass in the image: the paper's files and the probe's main file, pdflatex once; its log */
const probeLog = (files: Map<string, Uint8Array>, probe: Map<string, Uint8Array>) => {
  const dir = mkdtempSync(join(tmpdir(), 'axt-probe-'))
  try {
    for (const [p, b] of [...files, ...probe]) {
      mkdirSync(dirname(join(dir, p)), { recursive: true })
      writeFileSync(join(dir, p), b)
    }
    try {
      execFileSync('docker', ['run', '--rm', '--network', 'none', '-v', `${dir}:/work`, '-w', '/work', IMAGE, 'pdflatex', '-interaction=nonstopmode', 'main.tex'], { stdio: 'pipe', timeout: 300_000 })
    } catch {
      /* a TeX error exits non-zero: the log tells */
    }
    return readFileSync(join(dir, 'main.log')).toString('latin1')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
/** each TeX error of a log: its message and the context line below it */
const errorsOf = (log: string) =>
  [...log.matchAll(/^! (.*)\n(.*)/gm)].map((m) => `${m[1]} | ${m[2]!.trim()}`)

describe.skipIf(!docker)('the mark probe over the marked preamble defines every mark that preamble carries', () => {
  it("an author's call in a class that expands its author's argument: the class's own error alone", () => {
    const files = new Map([
      ['main.tex', enc(SOURCE)],
      ['namesexpanded.cls', enc(CLASS)],
    ])
    const paper = openPaper(files),
      mp = markedPreamble(paper)
    if (!mp) throw new Error('no marked preamble')
    expect(mp.text).toContain('\\axtcall{')
    const errors = errorsOf(probeLog(files, probeFiles(paper, { marks: true, preamble: mp })))
    expect(errors).toEqual([expect.stringMatching(/^Undefined control sequence\. \| .*\\classownundefined$/)])
  })
})
