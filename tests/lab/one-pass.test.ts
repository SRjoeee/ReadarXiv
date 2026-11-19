// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { onePassLog, onePassTex } from '../../lab/pdf/spikes/one-pass.mjs'
import { DRIVER_OUTPUT_MARK } from '../../packages/engine/src/compile/base.ts'
import { readSkipProbe } from '../../packages/engine/src/marks/marks.ts'

// A one-pass compile as the lab's Docker hosts make it (lab/pdf/spikes/one-pass.mjs), held to the host's contract the engine
// reads (packages/engine/src/compile/base.ts DRIVER_OUTPUT_MARK): TeX's log, then for `latex` the driver's own output behind the
// mark, where the pass wrote a DVI. TeX writes its rows to the terminal as well as to its log, so a log that carried the
// container's terminal held every probe row twice, and the probe's reader takes two rows for none (readSkipProbe). `latex`
// and `dvipdfmx` here are stand-ins of our own (shell scripts on PATH): no TeX, no Docker

const ROOT = mkdtempSync(join(tmpdir(), 'one-pass-test-'))
afterAll(() => rmSync(ROOT, { recursive: true, force: true }))
const BIN = join(ROOT, 'bin')
mkdirSync(BIN)
const tool = (name: string, body: string) => {
  writeFileSync(join(BIN, name), `#!/bin/sh\n${body}\n`)
  chmodSync(join(BIN, name), 0o755)
}
// (TeX's stand-in: its banner and the probe's row on the terminal and in the job's log, as TeX writes both; a DVI unless the
// document says it sets no page)
tool('latex', [
  'f=$(basename "$2"); j=$(basename "$2" .tex)',
  'echo "This is pdfTeX (stand-in)"; echo "LAYOUT-PROBE 1 lineskip 1.0pt 0.0pt"; echo "terminal only"',
  'printf "This is pdfTeX (stand-in)\\nLAYOUT-PROBE 1 lineskip 1.0pt 0.0pt\\nOutput written.\\n" > "$j.log"',
  'grep -q nopage "$f" || printf "dvi" > "$j.dvi"',
].join('\n'))
tool('pdflatex', ['j=$(basename "$2" .tex)', 'echo "terminal only"', 'printf "This is pdfTeX (stand-in)\\n" > "$j.log"', 'printf "%%PDF" > "$j.pdf"'].join('\n'))
// (dvipdfmx's stand-in: a PDF from the DVI it is given, one warning on its terminal, a mark that it ran)
tool('dvipdfmx', ['for a; do last=$a; done', 'echo ran >> driver-ran', 'echo "dvipdfmx:warning: a special (stand-in)" >&2', 'printf "%%PDF" > "$(basename "$last" .dvi).pdf"'].join('\n'))

/** one pass in a folder of its own holding `main.tex` (and any `ship` files the source ships), as the host runs it in the
 *  container: its command line through sh, the terminal read by the host and given to nothing */
function pass(name: string, engine: string, tex: string, ship: Record<string, string> = {}) {
  const build = join(ROOT, name)
  mkdirSync(build)
  writeFileSync(join(build, 'main.tex'), tex)
  for (const [p, b] of Object.entries(ship)) writeFileSync(join(build, p), b)
  execFileSync('sh', ['-c', `${onePassTex(engine, 'main.tex')}; true`], { cwd: build, env: { ...process.env, PATH: `${BIN}:${process.env.PATH}` }, stdio: 'pipe' })
  return { build, log: onePassLog(build, 'main.tex', engine, DRIVER_OUTPUT_MARK) }
}
const lines = (log: string | null) => (log ?? '').split('\n')

describe('a one-pass latex compile as the box gives it', () => {
  it('keeps TeX\'s log once, then the mark and the driver\'s own output: the probe\'s row read once', () => {
    const { build, log } = pass('dvi', 'latex', 'a page')
    expect(lines(log).filter(l => l.startsWith('LAYOUT-PROBE 1 lineskip'))).toHaveLength(1)
    expect(lines(log).filter(l => l.startsWith('This is pdfTeX'))).toHaveLength(1)
    expect(lines(log)).not.toContain('terminal only')
    expect(readSkipProbe(log)).toEqual([72 / 72.27, 0])
    expect(log).toBe(`This is pdfTeX (stand-in)\nLAYOUT-PROBE 1 lineskip 1.0pt 0.0pt\nOutput written.\n${DRIVER_OUTPUT_MARK}\ndvipdfmx:warning: a special (stand-in)\n`)
    expect(existsSync(join(build, 'main.pdf'))).toBe(true)
  })

  it('runs no driver where the pass wrote no DVI, a DVI the source ships taken for none: TeX\'s log alone', () => {
    for (const [name, ship] of [['none', {}], ['shipped', { 'main.dvi': 'old' }]] as const) {
      const { build, log } = pass(name, 'latex', 'nopage', ship)
      expect(existsSync(join(build, 'driver-ran')), name).toBe(false)
      expect(log, name).toBe('This is pdfTeX (stand-in)\nLAYOUT-PROBE 1 lineskip 1.0pt 0.0pt\nOutput written.\n')
      expect(readSkipProbe(log), name).toEqual([72 / 72.27, 0])
    }
  })

  it('gives an engine that writes its PDF itself its log alone, and an engine of before that names no mark TeX\'s log alone', () => {
    const { build, log } = pass('pdf', 'pdflatex', 'a page')
    expect(log).toBe('This is pdfTeX (stand-in)\n')
    expect(existsSync(join(build, 'driver-ran'))).toBe(false)
    const dvi = pass('dvi-no-mark', 'latex', 'a page').build
    expect(onePassLog(dvi, 'main.tex', 'latex', undefined)).toBe('This is pdfTeX (stand-in)\nLAYOUT-PROBE 1 lineskip 1.0pt 0.0pt\nOutput written.\n')
  })

  it('gives null where TeX wrote no log', () => {
    const build = join(ROOT, 'no-log')
    mkdirSync(build)
    expect(onePassLog(build, 'main.tex', 'latex', DRIVER_OUTPUT_MARK)).toBeNull()
  })
})
