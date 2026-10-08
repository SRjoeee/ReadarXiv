// The corpus's compiles, as the live reader asks the TeX page for them (live.mjs runLive): the font probe, the marked
// original, a translation's first preview (the first 2,500 characters translated, as runLive's first batch) and its
// final, built with the reader's own pipeline functions and pseudo-translations. Shared by measure.mjs and speed.mjs.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pseudoTranslate } from '../../../src/pdf-reader/engine/latex-front.mjs'
import { openPaper, originalFiles, probeFiles, translationFiles } from '../../../src/pdf-reader/engine/live.mjs'
import { plainSource } from '../../../src/pdf-reader/engine/mt.mjs'
import { strategiesFor } from '../../../src/pdf-reader/engine/scripts.mjs'
import { unpackSource } from '../../../src/pdf-reader/engine/tar.mjs'

const EXP = new URL('..', import.meta.url).pathname
/** today's page: the commit this stage started from */
export const TODAY = 'a7a2a056'
/** a translation's way of being set: the language and which of its strategies (scripts.mjs strategiesFor) */
export const LANGS = { de: ['de', 0], zh: ['zh', 0], zhc: ['zh', 1], zht: ['zh-Hant', 0], ja: ['ja', 0], ko: ['ko', 0], ru: ['ru', 0] }
/** the scripts whose faces a job's translation needs (init's `fonts` hint) */
export const SCRIPT = { zh: 'Hans', zhc: 'Hans', zht: 'Hant', ja: 'Jpan', ko: 'Kore' }

export function corpus() {
  const dir = join(EXP, 'data/corpus')
  return readdirSync(dir).filter(id => existsSync(join(dir, id, 'source.gz'))).sort()
}

/** the first batch's units, as live.mjs runLive's first nextBatch with the source's order for the rank */
function firstBatch(units, kept) {
  const out = []
  let chars = 0
  for (const [i, u] of units.entries()) {
    if (kept.has(u)) continue
    const n = plainSource(u).length
    if (out.length && chars + n > 2500) break
    out.push(i)
    chars += n
  }
  return out
}

/**
 * A paper's compiles: { meta, files, jobs: Map tag → { job, engine, main, rerun, bibtex, overrides } } for the job
 * names asked (`fonts`: the probe's reading, needed by the translations). null for a paper with no LaTeX source
 */
export async function paperJobs(id, names, fonts) {
  const { files, pdf } = await unpackSource(new Uint8Array(readFileSync(join(EXP, 'data/corpus', id, 'source.gz'))))
  if (pdf) return null
  const paper = openPaper(files)
  const { meta, project, units, kept } = paper
  const first = firstBatch(units, kept)
  const jobs = new Map()
  for (const job of names) {
    const tag = `${id}~${job}`
    if (job === 'probe') jobs.set(tag, { job, engine: meta.compiler, main: project.main, rerun: false, bibtex: false, overrides: probeFiles(paper) })
    else if (job === 'orig') jobs.set(tag, { job, engine: meta.compiler, main: project.main, rerun: true, bibtex: meta.bbl ? false : null, overrides: originalFiles(paper) })
    else {
      const [L, kind] = job.split('-')
      const [lang, k] = LANGS[L]
      const s = strategiesFor(meta, lang)[k]
      if (!s) continue
      const translated = new Map(units.filter(u => !kept.has(u)).map(u => [u, pseudoTranslate(u, lang)]))
      const map = kind === 'prev' ? new Map(first.map(i => [units[i], translated.get(units[i])])) : translated
      jobs.set(tag, { job, engine: s.engine, script: L, main: project.main, rerun: kind !== 'prev', bibtex: kind === 'prev' ? !meta.bbl : meta.bbl ? false : null, overrides: translationFiles(paper, map, { strategy: s, fonts, draft: kind === 'prev', aux: null, bbl: null }) })
    }
  }
  return { meta, files, units: units.length, jobs }
}

/** the version 2 init for a visit of these jobs: the paper's engine and the translations' first strategies' engines,
 *  and the scripts whose faces they set */
export function hintsFor(meta, names) {
  const langs = names.filter(n => n !== 'probe' && n !== 'orig').map(n => n.split('-')[0])
  const engines = [...new Set([meta.compiler, ...langs.map(L => strategiesFor(meta, LANGS[L][0])[LANGS[L][1]]?.engine).filter(Boolean)])]
  return { type: 'init', protocol: 2, engines, fonts: [...new Set(langs.map(L => SCRIPT[L]).filter(Boolean))] }
}
