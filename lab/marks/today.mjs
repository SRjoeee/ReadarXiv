// lab/marks/today.mjs: the lab's compiles and today's front half for the marks lane. Not shipped.
// `compiler(id, image, source, mine)`: a compile as the box answers it, cached by what it compiles (the image, the request's
// shape and every file: the key every lane computes, baseline/tools/prepare.mjs, spike-s1 dump.mjs), read from the lanes'
// caches, else run in the docker slot (heavy-slot.sh, one runner, no network, the pinned image) and kept in `mine`.
// `todayOf(dir, id, compile)`: today's prepare up to the instrument (live.mjs openPaper, the job's BibTeX make, markedOfPaper:
// the probe, the marked original, our final pass), as the baseline ran it.
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { promisify } from 'node:util'

const ROOT = new URL('../../', import.meta.url).pathname
const E = `${ROOT}src/pdf-reader/engine/`
const LAB = '/Users/cheongzhiyan/Developer/readarxiv-lab-data/'
const ARCH = '/Volumes/SanDisk_Dev/readarxiv-lab-archive/'
/** every compile cache a lane made (read-only): baseline/tools/prepare.mjs's list */
export const CACHES = [LAB + 'refactor-2026-11/spike-s1/compiles', ...['lost-class/compiles', 'slow-42112/compiles', 'defects-40645/compiles', 'moved-lines/compiles', 'coverage-lane/compiles', 'unified-light/kept/compiles', 'orphan-refs/compiles', 'ink-lane/compiles', 'marks-at-source/cache', 'author-block/cache', 'guard-sources/cache', 'sweep-6e0a-fix/compiles', 'layout-08481/compiles', 'speed-bc/cache', 'box-title-14787/compiles', 'hl-display-14787/compiles', 'author-recheck/compiles', 'author-block/compiles'].map(d => LAB + d), ...['diag-fig-21085', 'diag-21085', 'runin-gap-3', 'lost-c3', 'diag-align', 'lost-x', 'lost-y', 'ink-accents', 'ink-lane', 'coverage-lane', 'lost-class'].map(d => `${ARCH}${d}/compiles`), ARCH + 'xspace/gate/compiles', ARCH + 'attn-labels/coderegions/compiles', LAB + 'prep-prof/compiles', LAB + 'prep-cpu/compiles', ARCH + 'tl-dated/compiles']
export const PINS = JSON.parse(readFileSync(`${ROOT}lab/pdf/compile-images.json`, 'utf8'))
const SLOT = `${LAB}bin/heavy-slot.sh`
const run = promisify(execFile)
const im = f => import(E + f)
export const live = await im('pipeline/live.mjs')
export const tar = await im('source/tar.mjs')
export const paperM = await im('layout/paper.mjs')
export const guard = await im('layout/guard.mjs')
export const baseM = await im('layout/base.mjs')
const filesUnder = (d, rel = '') => readdirSync(join(d, rel), { withFileTypes: true }).flatMap(x => (x.isDirectory() ? filesUnder(d, join(rel, x.name)) : [join(rel, x.name)]))

/** the compile function of one paper: `source` its files, `mine` the cache this lane writes; `stats` counts hits and runs */
export function compiler(id, image, source, mine, stats = { read: 0, made: 0, ms: 0 }) {
  return async function compile(req) {
    const all = new Map(source)
    for (const [p, b] of req.overrides ?? []) all.set(p, b)
    const h = createHash('sha256').update(image).update(JSON.stringify({ main: req.main, engine: req.engine, rerun: !!req.rerun, bibtex: req.bibtex ?? null, draft: !!req.draft, files: !!req.files, date: req.sourceDate ?? null, paper: req.paper ?? null }))
    for (const [p, b] of [...all].sort((a, b) => (a[0] < b[0] ? -1 : 1))) h.update(p).update(b)
    const key = h.digest('hex').slice(0, 20)
    const own = join(mine, id, key)
    let dir = [own, ...CACHES.map(c => join(c, id, key))].find(d => existsSync(join(d, 'done')))
    if (dir) stats.read++
    else {
      if (process.env.NOCOMPILE === '1') throw Object.assign(new Error(`NEEDS_COMPILE ${key}`), { needs: key })
      dir = own
      const build = join(mine, id, `build-${key}`)
      rmSync(build, { recursive: true, force: true })
      for (const [p, b] of all) { const f = join(build, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, b) }
      const main = req.main, stem = main.split('/').pop().replace(/\.[^.]+$/, '')
      const compilerName = req.engine ?? 'pdflatex'
      const date = Number.isSafeInteger(req.sourceDate) ? ['-e', `SOURCE_DATE_EPOCH=${req.sourceDate}`, '-e', 'FORCE_SOURCE_DATE=1'] : []
      const draftFlag = { pdflatex: '-draftmode', latex: '-draftmode', lualatex: '--draftmode', xelatex: '-no-pdf' }[compilerName] ?? '-draftmode'
      const cmd = req.draft
        ? ['sh', '-c', `${compilerName} -interaction=nonstopmode ${draftFlag} ./${main}${req.bibtex ? `; bibtex ./${stem}` : ''}; true`]
        : req.rerun
          ? ['latexmk', '-norc', ...(compilerName === 'latex' ? ['-pdfdvi', '-e', '$dvipdf=q{dvipdfmx %O -o %D %S}'] : [{ xelatex: '-xelatex', lualatex: '-lualatex' }[compilerName] ?? '-pdf']), ...(req.bibtex === false ? ['-bibtex-'] : []), '-interaction=nonstopmode', '-f', main]
          : ['sh', '-c', `${compilerName === 'latex' ? 'latex' : compilerName} -interaction=nonstopmode ./${main}${compilerName === 'latex' ? `; dvipdfmx -o ${stem}.pdf ${stem}.dvi` : ''}; true`]
      const t0 = performance.now()
      const said = await run(SLOT, ['docker', '--', 'nice', '-n', '10', 'docker', 'run', '--rm', '--init', '--network', 'none', '--cpus', '2', '--memory', '3g', ...date, '-v', `${build}:/work`, '-w', '/work', image, 'sh', '-c', 's=$(date +%s%N); timeout 600 "$@"; e=$?; echo "axt-l2: ms $(( ($(date +%s%N) - s) / 1000000 ))" >&2; exit $e', 'sh', ...cmd], { maxBuffer: 1 << 26 }).then(r => `${r.stdout}${r.stderr}`, e => `${e?.stdout ?? ''}${e?.stderr ?? ''}`)
      const inMs = Number(/axt-l2: ms (\d+)/.exec(said)?.[1] ?? NaN)
      const saidOwn = said.split('\n').filter(l => !/^(heavy-slot|axt-l2): /.test(l)).join('\n')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'ms'), JSON.stringify({ ms: inMs, wall: Math.round(performance.now() - t0), image, draft: !!req.draft, rerun: !!req.rerun, files: !!req.files, engine: compilerName }))
      const pdf = join(build, `${stem}.pdf`), log = join(build, `${stem}.log`)
      if (existsSync(pdf) && !req.draft) writeFileSync(join(dir, 'out.pdf'), readFileSync(pdf))
      if (existsSync(log)) writeFileSync(join(dir, 'out.log'), readFileSync(log, 'latin1') + (!req.rerun && !req.draft && compilerName === 'latex' && baseM.DRIVER_OUTPUT_MARK ? `\n${baseM.DRIVER_OUTPUT_MARK}\n${saidOwn}` : ''), 'latin1')
      if (req.files) {
        for (const p of filesUnder(build)) { const k = p.split(sep).join('/'), b = new Uint8Array(readFileSync(join(build, p))), had = all.get(k); if (!had || Buffer.compare(Buffer.from(had), Buffer.from(b)) !== 0) { const f = join(dir, 'files', p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, b) } }
        mkdirSync(join(dir, 'files'), { recursive: true })
      }
      writeFileSync(join(dir, 'done'), '')
      rmSync(build, { recursive: true, force: true })
      stats.made++
      stats.ms += Number.isFinite(inMs) ? inMs : 0
    }
    if (!existsSync(join(dir, 'out.log'))) return { ok: false, error: 'no log', key }
    const pdf = existsSync(join(dir, 'out.pdf')) ? new Uint8Array(readFileSync(join(dir, 'out.pdf'))) : null
    const files = req.files && existsSync(join(dir, 'files')) ? new Map(filesUnder(join(dir, 'files')).map(p => [p.split(sep).join('/'), new Uint8Array(readFileSync(join(dir, 'files', p)))])) : undefined
    return { ok: req.draft ? true : !!pdf?.length, pdf, log: readFileSync(join(dir, 'out.log'), 'latin1'), key, ...(files ? { files } : {}) }
  }
}

/** the tree a paper is compiled with, as the box decides it (the baseline's) */
export async function treeOf(paper, arxivDoc) {
  const SERVED = Object.keys(PINS.images)
  const declared = paper.meta.tlVersion == null ? null : String(paper.meta.tlVersion)
  let year = declared && SERVED.includes(declared) ? declared : null
  const banner = await guard.texLiveOfPdf(arxivDoc).catch(() => null)
  if (!year && declared === null && banner && SERVED.includes(String(banner))) year = String(banner)
  year ??= PINS.default
  return { year, image: PINS.images[year].texlive }
}
export const HOST_ENGINES = ['pdflatex', 'xelatex', 'lualatex', 'latex']
