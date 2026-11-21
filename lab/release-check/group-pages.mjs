// lab/release-check/group-pages.mjs <bundles> <papers.tsv> <prepare dumps> <rows> [--survey=<out.jsonl>]: the corpus pages harness-lab
// turns each group off on (invariant I2, gates.mjs GROUP_PAGES), made by the rule gates.mjs states. Every page of the run's
// bundles is read by PDF.js over the composed document (A and its add-on: its operator list walked as prove.mjs walks it, each
// show's, path's and image's enclosing groups of ours) and by its part (each group's stated ink: its member's lines on the page
// for its text group, but the KEPT ones; its elements' ink, but a kept element's, for its element group; its label's ink for
// its label group), and given four marks: a group paints a path (R), a group paints an image (I), two members' groups whose
// stated inks meet within half a point (T), a member of a float stands on it (F: a figure's text, a table's cell, a caption).
// The papers: gates.mjs's five harness papers, then the first paper by id whose group paints an image, where none of the five
// has one, of those the run's rows (`<rows>`, reader-parts' Google rows) hold in Chinese: the harness lays a paper by them. For each paper, for each mark in that order, its page holding the mark that holds the most marks (the first at a
// tie), each page once; then, to twelve, each paper's page holding the most groups, in the papers' order. Prints the list as
// GROUP_PAGES holds it and each page's marks, its TeX tree (the prepare dump's) and its groups. Not shipped.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'

const HARNESS = ['1512.03385v1', '1706.03762v7', '2609.26457v1', '2307.16209v1', '2610.20030v1']
const [B, LIST, PREP, ROWS] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const SURVEY = process.argv.find((a) => a.startsWith('--survey='))?.slice(9) ?? null
if (!B || !LIST || !PREP || !ROWS) {
  console.error('group-pages.mjs <bundles> <papers.tsv> <prepare dumps> <rows> [--survey=<out.jsonl>]')
  process.exit(2)
}
const PDFJS = join(import.meta.dirname, '../../node_modules/pdfjs-dist')
const opts = { cMapUrl: join(PDFJS, 'cmaps/'), cMapPacked: true, standardFontDataUrl: join(PDFJS, 'standard_fonts/'), verbosity: 0, useSystemFonts: false }
const dirs = new Map(readFileSync(LIST, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t')))
const IMAGE_OPS = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject, OPS.paintSolidColorImageMask])
const meet = (a, b, pad = 0.5) => a[0] <= b[2] + pad && b[0] <= a[2] + pad && a[1] <= b[3] + pad && b[1] <= a[3] + pad

/** every page of paper `id` with a group of ours: its marks, its groups and its paper's TeX tree */
async function pagesOf(id) {
  const bdir = join(B, id)
  const addOn = readdirSync(bdir).find((f) => f.endsWith('.addon'))
  if (!addOn || !dirs.has(id)) return []
  const head = JSON.parse(readFileSync(join(bdir, 'head.json'), 'utf8'))
  const tree = JSON.parse(readFileSync(join(PREP, `${id}.prepare.json`), 'utf8')).paper.tex?.tree ?? null
  const W = new Uint8Array(Buffer.concat([readFileSync(join(dirs.get(id), 'arxiv.pdf')), readFileSync(join(bdir, addOn))]))
  const task = getDocument({ ...opts, data: W })
  const doc = await task.promise
  const names = new Map()
  for (const [gid, g] of await doc.getOptionalContentConfig({ intent: 'display' })) names.set(gid, g?.name)
  const out = []
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const d = head.parts[p - 1]
      if (!d) continue
      const part = JSON.parse(readFileSync(join(bdir, `${d}.part`), 'utf8'))
      const page = await doc.getPage(p)
      const ops = await page.getOperatorList()
      page.cleanup()
      const stack = []
      let paths = 0,
        images = 0
      for (let j = 0; j < ops.fnArray.length; j++) {
        const fn = ops.fnArray[j]
        if (fn === OPS.beginMarkedContent) stack.push(null)
        else if (fn === OPS.beginMarkedContentProps) {
          const nm = ops.argsArray[j]?.[0] === 'OC' ? names.get(ops.argsArray[j][1]?.id) : null
          stack.push(nm?.startsWith('axt:') ? nm : null)
        } else if (fn === OPS.endMarkedContent) stack.pop()
        else if (stack.some(Boolean)) {
          if (fn === OPS.constructPath) paths++
          else if (IMAGE_OPS.has(fn)) images++
        }
      }
      const stated = new Map()
      const kinds = new Set()
      const seen = new Set()
      for (const m of part.flows.flat()) {
        if (seen.has(m.ord)) continue
        seen.add(m.ord)
        kinds.add(m.kind)
        const put = (g, b) => stated.set(`axt:${m.ord}.${p}.${g}`, [...(stated.get(`axt:${m.ord}.${p}.${g}`) ?? []), b])
        for (const l of m.lines) if (l[0] === p && !(l[9] & 1)) put('t', [l[2], l[6], l[3], l[5]])
        for (const [, el] of m.els ?? []) if (!el.keep) for (const i of el.ink) if (i[0] === p) put('e', [i[1], i[2], i[3], i[4]])
        const li = m.label?.ink
        if (li && li[0] === p) put('l', [li[1], li[2], li[3], li[4]])
      }
      const held = [...stated.keys()].filter((n) => [...names.values()].includes(n))
      const ordOf = (n) => n.split(/[:.]/)[1]
      let touching = 0
      for (let i = 0; i < held.length; i++)
        for (let j = i + 1; j < held.length; j++)
          if (ordOf(held[i]) !== ordOf(held[j]) && stated.get(held[i]).some((a) => stated.get(held[j]).some((b) => meet(a, b)))) touching++
      if (!held.length) continue
      const marks = { R: paths > 0, I: images > 0, T: touching > 0, F: kinds.has('figure') || kinds.has('table') || kinds.has('caption') }
      out.push({ id, page: p, tree, groups: held.length, marks })
    }
  } finally {
    await task.destroy()
  }
  return out
}

const marksOf = (r) => Object.values(r.marks).filter(Boolean).length
const read = new Map()
for (const id of HARNESS) read.set(id, await pagesOf(id))
const papers = [...HARNESS]
if (![...read.values()].flat().some((r) => r.marks.I))
  for (const id of readdirSync(B).filter((d) => dirs.has(d) && !HARNESS.includes(d) && existsSync(join(ROWS, `${d}-zh.json`))).sort()) {
    const pages = await pagesOf(id)
    if (!pages.some((r) => r.marks.I)) continue
    read.set(id, pages)
    papers.push(id)
    break
  }
const chosen = []
for (const id of papers)
  for (const k of ['R', 'I', 'T', 'F']) {
    const xs = read.get(id).filter((r) => r.marks[k])
    if (!xs.length) continue
    const best = xs.reduce((a, b) => (marksOf(b) > marksOf(a) ? b : a))
    if (!chosen.includes(best)) chosen.push(best)
  }
for (const id of papers) {
  if (chosen.length >= 12) break
  const xs = read.get(id).filter((r) => !chosen.includes(r))
  if (xs.length) chosen.push(xs.reduce((a, b) => (b.groups > a.groups ? b : a)))
}
if (SURVEY) writeFileSync(SURVEY, `${[...read.values()].flat().map((r) => JSON.stringify(r)).join('\n')}\n`)
for (const r of chosen)
  console.log(`${r.id} p${r.page}: tree ${r.tree}, ${Object.entries(r.marks).filter(([, v]) => v).map(([k]) => k).join('') || '-'}, ${r.groups} groups`)
console.log(`GROUP_PAGES ${chosen.map((r) => `${r.id}:${r.page}`).join(',')}`)
