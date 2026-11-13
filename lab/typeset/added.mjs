// lab/typeset/added.mjs: the lab's added pairs, walked by the gates that walk pairs and reported apart from their own set.
//
// The pairs the gates were built on (the tap's 123, the 90 of the stored rows, the parity's 22) are today's side as the release
// sweep and the tap recorded it on 2026-11-06. A pair added later is the 91st, the 92nd: a paper the owner found a fault on that no
// pair held, made a pair in the lab (its today's side by the release's own prepare and translation: lab-data's
// `refactor-2026-11/baseline/added/`, lane pairs-91's note). It replaces none, and its numbers are never summed into a set's, so
// that a round's totals stay comparable with the rounds before: a gate walks its set as before, then the added pairs in a run of
// their own (`--apart`), whose summary is printed after the set's under ADDED_HEADING, and whose exit joins the gate's.
//
// The added pairs' today's side is not written where the set's is (the tap's folders, the baseline's dumps, the release sweep's
// cache, which other tools walk whole): their run reads it through a lab-data root of links (`addedEnv`: AXT_LAB_DATA a root in
// which every entry is a link to the real lab-data's, but the baseline's `prepare`, `reader` and the tap's `ledgers`, `metrics`,
// `tokens`, which hold links to the real files and to the added pairs'; AXT_SWEEP_CACHE the added pairs' own cache, today's layer
// and door rows), so that what the set's walk reads is unchanged byte for byte.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** the added pairs, in the order they were added: 2111.09276v1-zh the 91st, 2611.03953v2-zh the 92nd (the owner's staging
 *  papers of 2026-11-13: a paragraph begun on the last line of the one before, a footnote mark alone at a line's start; a
 *  reading option that did not return, an ellipsis and a stop lost, a caption's spacing) */
export const ADDED = Object.freeze(['2111.09276v1-zh', '2611.03953v2-zh'])
/** the line an apart run's output begins with: what reads a gate's log reads the set's numbers before it, the added pairs' after */
export const ADDED_HEADING = 'THE ADDED PAIRS, REPORTED APART FROM THE SET:'
export const isAdded = (pair) => ADDED.includes(pair)

const LAB = process.env.AXT_LAB_DATA ?? '/Users/cheongzhiyan/Developer/readarxiv-lab-data'
/** lab-data's folder of the added pairs' today's side (`prepare/`, `reader/`, `tap/{ledgers,metrics,tokens}/`, `cache`, `pairs.txt`,
 *  `papers.tsv`) */
export const ADDED_DIR = join(LAB, 'refactor-2026-11', 'baseline', 'added')
/** the folders whose files the added pairs' run reads beside the set's, and where in ADDED_DIR the added pairs' are */
const OVER = new Map([
  ['refactor-2026-11/baseline/prepare', 'prepare'],
  ['refactor-2026-11/baseline/reader', 'reader'],
  ['refactor-2026-11/baseline/tap/ledgers', 'tap/ledgers'],
  ['refactor-2026-11/baseline/tap/metrics', 'tap/metrics'],
  ['refactor-2026-11/baseline/tap/tokens', 'tap/tokens'],
])
const WAY = new Set(['', 'refactor-2026-11', 'refactor-2026-11/baseline', 'refactor-2026-11/baseline/tap', 'refactor-2026-11/lanes'])
/** the corpus list the parity reads arXiv's PDFs by (parity/inputs.mjs pdfOf): in the root, the real list's lines and the added
 *  pairs' papers' (`papers.tsv`) */
const PAPERS = 'refactor-2026-11/lanes/L1-papers87.tsv'

/**
 * The environment of an added pairs' run (`{ AXT_LAB_DATA, AXT_SWEEP_CACHE }`): the root of links over `lab` (made once in the
 * system's temporary folder, named by the digest of what it links, made again when that moves), the added pairs' cache. Throws,
 * naming it, where lab-data holds no added pairs' folder, or one of their files stands in a real folder already (the root would
 * hide which is read)
 */
export function addedEnv(lab = LAB) {
  const added = join(lab, 'refactor-2026-11', 'baseline', 'added')
  if (!existsSync(join(added, 'pairs.txt'))) throw new Error(`added.mjs: no added pairs' today's side in lab-data (${added})`)
  const h = createHash('sha256').update(lab)
  const papers = `${readFileSync(join(lab, PAPERS), 'utf8')}${readFileSync(join(added, 'papers.tsv'), 'utf8')}`
  h.update(papers)
  for (const [real, mine] of OVER) {
    for (const d of [join(lab, real), join(added, mine)]) {
      const names = existsSync(d) ? readdirSync(d).sort() : []
      h.update(`${d}\n`)
      for (const n of names) h.update(`${n}:${statSync(join(d, n)).mtimeMs}\n`)
    }
  }
  const root = join(tmpdir(), `axt-added-${h.digest('hex').slice(0, 16)}`)
  if (!existsSync(join(root, '.made'))) {
    const tmp = `${root}.${process.pid}`
    rmSync(tmp, { recursive: true, force: true })
    const build = (rel) => {
      const dst = join(tmp, rel)
      mkdirSync(dst, { recursive: true })
      for (const name of readdirSync(join(lab, rel)).sort()) {
        const r = rel ? `${rel}/${name}` : name
        if (WAY.has(r)) build(r)
        else if (r === PAPERS) writeFileSync(join(tmp, r), papers)
        else if (OVER.has(r)) {
          mkdirSync(join(tmp, r))
          for (const n of readdirSync(join(lab, r))) symlinkSync(join(lab, r, n), join(tmp, r, n))
          const a = join(added, OVER.get(r))
          for (const n of existsSync(a) ? readdirSync(a) : []) {
            if (existsSync(join(lab, r, n))) throw new Error(`added.mjs: ${r}/${n} is the set's file already: the added pairs' would hide it`)
            symlinkSync(join(a, n), join(tmp, r, n))
          }
        } else symlinkSync(join(lab, r), join(dst, name))
      }
    }
    try {
      build('')
    } catch (e) {
      rmSync(tmp, { recursive: true, force: true })
      throw e
    }
    mkdirSync(join(tmp, '.made'))
    try {
      renameSync(tmp, root)
    } catch (e) {
      // (another run made it meanwhile: its root is the same links)
      rmSync(tmp, { recursive: true, force: true })
      if (!existsSync(join(root, '.made'))) throw e
    }
  }
  const cache = join(added, 'cache')
  if (!existsSync(join(cache, 'papers'))) throw new Error(`added.mjs: the added pairs' cache is not there (${cache})`)
  return { AXT_LAB_DATA: root, AXT_SWEEP_CACHE: cache }
}

/**
 * A walk's pairs split. `listed`: the pairs the walk would take (named, or the set's folder read whole); `named`: whether the
 * caller named them. Returns `pairs`, walked here as before, and `later`, the added pairs walked after them by `runApart`: in a
 * walk of the set (none named) every added pair; in a named walk the named added pairs. A run given `--apart` (runApart's) walks
 * what it is given (`apart`). Where `pairs` is empty and `later` is not (added pairs named alone), the caller walks nothing itself
 * and exits with runApart's status
 */
export function apartOf(listed, { named, argv = process.argv.slice(2) }) {
  if (argv.includes('--apart')) return { pairs: listed, later: [], apart: true }
  return { pairs: listed.filter((p) => !isAdded(p)), later: named ? listed.filter(isAdded) : [...ADDED], apart: false }
}

/**
 * The added pairs `later` walked by `script` in a run of their own: the caller's flags but its folders (`dirs`: each flag the
 * caller writes under, given as `<its value>/added`, e.g. `{ out: OUT, work: WORK }`), `--apart`, the pairs; its environment the
 * caller's with addedEnv's. Its output follows the caller's, under ADDED_HEADING (printed by the run itself). Returns its exit
 * status
 */
export function runApart(script, later, { argv = process.argv.slice(2), dirs = {} } = {}) {
  if (!later.length) return 0
  const own = Object.keys(dirs).map((k) => `--${k}=`)
  const flags = argv.filter((a) => a.startsWith('--') && a !== '--apart' && !own.some((o) => a.startsWith(o)))
  let env
  try {
    env = addedEnv()
  } catch (e) {
    console.log(`${ADDED_HEADING} ${later.join(', ')}: not walked: ${e?.message ?? e}`)
    return 1
  }
  const r = spawnSync(process.execPath, [...process.execArgv, script, ...flags, ...Object.entries(dirs).map(([k, v]) => `--${k}=${join(v, 'added')}`), '--apart', ...later], {
    stdio: 'inherit',
    env: { ...process.env, ...env },
  })
  return r.status ?? 1
}

// `node lab/typeset/added.mjs -- <command…>`: the command run with addedEnv's environment (the release check's steps of the added
// pairs: their today's side read through the root of links, made when the step runs, never when its command is planned)
if (process.argv[1] === import.meta.filename) {
  const at = process.argv.indexOf('--')
  const cmd = at >= 0 ? process.argv.slice(at + 1) : []
  if (!cmd.length) {
    console.error('added.mjs -- <command…>')
    process.exit(2)
  }
  let env
  try {
    env = addedEnv()
  } catch (e) {
    console.log(`${ADDED_HEADING} ${ADDED.join(', ')}: not walked: ${e?.message ?? e}`)
    process.exit(1)
  }
  const r = spawnSync(cmd[0], cmd.slice(1), { stdio: 'inherit', env: { ...process.env, ...env } })
  process.exit(r.status ?? 1)
}
