// lab/release-check/papers.mjs <out.tsv> <papers.tsv>…: the corpus the release check prepares, written as one list for
// lab/pdf/prepare-back/corpus.sh: the lists' papers (`id <tab> dir`, one a line) in their order, each paper once. The release
// check gives the set's list (lanes/L1-papers88.tsv) and the added papers' (baseline/added/papers.tsv, lab/typeset/added.mjs),
// so that its prepare holds every paper whose pairs its gates walk, as the integration round's chain does. A paper named twice
// with two directories stops it (exit 1): the run would prepare one of them and say nothing. Not shipped.
import { readFileSync, writeFileSync } from 'node:fs'

/** the lists' lines as one list: each paper once, in the order first named; throws where a paper is named with two directories */
export function papersOf(texts) {
  const dirOf = new Map()
  for (const text of texts) {
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      const [id, dir] = line.split('\t')
      if (dirOf.has(id) && dirOf.get(id) !== dir) throw new Error(`papers.mjs: ${id} is named with two directories: ${dirOf.get(id)}, ${dir}`)
      dirOf.set(id, dir)
    }
  }
  return [...dirOf].map(([id, dir]) => `${id}\t${dir}\n`).join('')
}

if (process.argv[1] === import.meta.filename) {
  const [out, ...lists] = process.argv.slice(2)
  if (!out || !lists.length) {
    console.error('papers.mjs <out.tsv> <papers.tsv>…')
    process.exit(2)
  }
  try {
    const text = papersOf(lists.map((f) => readFileSync(f, 'utf8')))
    writeFileSync(out, text)
    console.log(`papers.mjs: ${text.split('\n').filter(Boolean).length} papers from ${lists.length} lists into ${out}`)
  } catch (e) {
    console.error(String(e?.message ?? e))
    process.exit(1)
  }
}
