// lab/pdf/spikes/one-pass.mjs
// A one-pass compile as the box's host makes it, for the lab's Docker compiles (layer-fixtures.mjs; the lab's fills of the
// prepare's compiles): TeX's pass and, for `latex` (arXiv's DVI compiler), the DVI made a PDF by dvipdfmx, quiet, where the
// pass wrote a DVI, its terminal output written to a file of its own; then the compile's log, by the host's contract the
// engine reads (packages/engine/src/compile/base.ts DRIVER_OUTPUT_MARK): TeX's log, then a line that is the mark alone and the
// driver's output, each a whole line. Never the container's terminal: TeX writes its log's rows to the terminal as well, so a
// log that carried the terminal held every probe row twice, which the probe's reader takes for none (marks.ts readSkipProbe:
// a `latex` paper read with no \lineskip).
//   `onePassTex(engine, main)`   the shell line of the pass, run in the compile's folder (the host's `sh -c`)
//   `onePassLog(build, main, engine, mark)`   the log as the host gives it, read from that folder after the pass; null where
//                                TeX wrote none. `mark` the engine's DRIVER_OUTPUT_MARK; an engine that names none reads no
//                                driver output, and is given TeX's log alone
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** the job's name of a main file: its name without its folder and its extension */
const stemOf = main => main.split('/').pop().replace(/\.[^.]+$/, '')
/** where the driver's terminal output is written, after the job's name: a `.log`, which the files a compile wrote leave out */
const driverFile = stem => `${stem}.driver.log`

/** the pass of `engine` over `main` (behind `./`), and for `latex` its driver: a DVI the source ships and a driver file are
 *  removed first, so that only a DVI this pass wrote is made a PDF, and a pass that wrote none runs no driver */
export function onePassTex(engine, main) {
  if (engine !== 'latex') return `${engine} -interaction=nonstopmode ./${main}`
  const s = stemOf(main)
  return `rm -f ./${s}.dvi ./${driverFile(s)}; latex -interaction=nonstopmode ./${main}; if [ -f ./${s}.dvi ]; then dvipdfmx -q -o ./${s}.pdf ./${s}.dvi >./${driverFile(s)} 2>&1; fi`
}

/** the log the host gives of a one-pass compile made by onePassTex in `build` */
export function onePassLog(build, main, engine, mark) {
  const s = stemOf(main), log = join(build, `${s}.log`), driver = join(build, driverFile(s))
  if (!existsSync(log)) return null
  const tex = readFileSync(log, 'latin1')
  if (engine !== 'latex' || !mark || !existsSync(driver)) return tex
  const line = t => (t === '' || t.endsWith('\n') ? t : `${t}\n`)
  return `${line(tex)}${mark}\n${line(readFileSync(driver, 'latin1'))}`
}
