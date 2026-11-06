// lab/pdf/prepare-back/nu-cost.mjs <papers.tsv> <out.json> [id…]: what reading A17 (a glyph no ToUnicode of its font maps,
// today's `nu`) costs readPdf on arXiv's PDFs: readPdf's time without and with `mapped` (each twice, the faster kept),
// the fonts' maps (their entries and their characters' UTF-16 bytes, each font once), and how many glyphs are `nu`. Not shipped.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readPdf } from '@readarxiv/engine'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { LITE } from '../spikes/lite-pdfjs.mjs'

const [LIST, DEST, ...only] = process.argv.slice(2)
const ROOT = new URL('../../../', import.meta.url).pathname
const NM = join(ROOT, 'node_modules/pdfjs-dist/')
const docOpts = { cMapUrl: `${NM}cmaps/`, cMapPacked: true, standardFontDataUrl: `${NM}standard_fonts/`, verbosity: 0, useSystemFonts: false, ...LITE }
const NO_UNICODE = /[\p{Co}\p{Cc}�]/u
const out = { papers: [], total: { ms0: 0, ms1: 0, fonts: 0, entries: 0, bytes: 0, glyphs: 0, nu: 0, nuRead: 0 } }
for (const line of readFileSync(LIST, 'utf8').split('\n').filter(Boolean)) {
  const [id, dir] = line.split('\t')
  if (only.length && !only.includes(id)) continue
  const bytes = new Uint8Array(readFileSync(join(dir, 'arxiv.pdf')))
  const pdfjs = { getDocument, OPS }
  let read = null
  const time = async mapped => {
    let best = Infinity
    for (let k = 0; k < 2; k++) {
      const t0 = performance.now()
      read = await readPdf(pdfjs, bytes, { options: docOpts, turned: true, mapped })
      best = Math.min(best, performance.now() - t0)
    }
    return best
  }
  const ms0 = await time(false)
  const ms1 = await time(true)
  // (the glyphs readPdf marked nu, and by which fonts)
  let nuRead = 0
  const nuFonts = {}
  for (const pg of read.doc.pages) for (const g of pg.glyphs) if (g.nu) { nuRead++; nuFonts[g.base] = (nuFonts[g.base] ?? 0) + 1 }
  // (the maps, each font once, and each glyph's state: its Unicode against its font's map, today's unmapped rule)
  const task = getDocument({ ...docOpts, fontExtraProperties: true, data: bytes.slice() })
  const doc = await task.promise
  const maps = new Map()
  let glyphs = 0, nu = 0, entries = 0, mapBytes = 0
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const ops = await page.getOperatorList()
    const stack = []
    let font = null
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i]
      if (fn === OPS.save) stack.push(font)
      else if (fn === OPS.restore) font = stack.pop() ?? font
      else if (fn === OPS.setFont) {
        const name = ops.argsArray[i][0]
        if (!maps.has(name)) {
          let f = null
          try { f = page.commonObjs.get(name) } catch {}
          const m = f?.toUnicode?._map
          const set = Array.isArray(m) ? new Set() : null
          if (set) for (const v of m) if (typeof v === 'string') { entries++; mapBytes += 2 * v.length; for (const s of [v, v.normalize('NFKC')]) for (const ch of s) set.add(ch) }
          maps.set(name, set)
        }
        font = maps.get(name)
      } else if (fn === OPS.showText || fn === OPS.showSpacedText) {
        for (const g of ops.argsArray[i][0] ?? []) {
          if (!g || typeof g !== 'object' || typeof g.unicode !== 'string' || !/\S/.test(g.unicode)) continue
          glyphs++
          if ([...g.unicode].some(ch => /\S/.test(ch) && (NO_UNICODE.test(ch) || (font != null && !font.has(ch))))) nu++
        }
      }
    }
    page.cleanup()
  }
  await task.destroy()
  const r = { id, pages: doc.numPages, ms0: Math.round(ms0), ms1: Math.round(ms1), fonts: maps.size, entries, bytes: mapBytes, glyphs, nu, nuRead, nuFonts }
  out.papers.push(r)
  for (const k of Object.keys(out.total)) out.total[k] += r[k]
  console.log(JSON.stringify(r))
}
writeFileSync(DEST, `${JSON.stringify(out, null, 1)}\n`)
console.log(JSON.stringify(out.total))
