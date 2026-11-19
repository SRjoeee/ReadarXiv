// I8, the text layer of a laid page reads the translation in reading order, read without a browser by the reader's own code: the
// composer's text module (src/compose/text.ts laidText, which the composer hands PDF.js's TextLayerBuilder) over PDF.js's text
// content of the composed page, as the composer reads it. The builder makes one span a text item, in order, so the layer's
// leaf spans read the items' text in their order; the harness holds the two readings equal on its fixtures' and the lab's papers'
// laid pages (run.mjs, the compose check).
//
// The judge (`orderOf`, the harness's I8 since stage 2): each laid member's runs of text (its laid items but its crops, in
// order) found in the reading, white space aside, each after the one before it, the members taken in the order their first line
// stands in the page's own text content; `missingAll` every member a run of which the reading never holds, `outOfOrderAll` the
// fewest members that, taken out, leave the rest read in that order (a longest chain of their places in the reading), each in
// the stream's order; `missing`, `outOfOrder` the first of each (a record names each member: lab/release-check/text-order.json).
//
// Over every pair a run lays, in Node: lab/release-check/text-order.mjs.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const SPACE = /\s+/g

/** a font string's families (the reader's served faces' FaceId is the font string: `<style> <weight> <px>px <families>`) */
const familiesOf = (id) => id.replace(/^.*?[\d.]+px\s+/, '')

/** the reader's reading of a laid page without a browser: laidText over the page's text content (with its marked content), the
 *  Page and its members, then the text items in order (the layer's leaf spans' text). `measure` a run's width as the reader's
 *  canvas measures it (white space between two sources rests on it); none: half an em a character */
export async function readingOf(content, page, members, measure = null) {
  const { laidText } = await import('../src/compose/text.ts')
  const faces = { familyOf: (id) => familiesOf(String(id)) }
  const m = measure ?? ((s, _family, size) => 0.5 * size * [...s].length)
  const laid = laidText(content, page, members, faces, m)
  const items = laid.content.items.filter((e) => typeof e.str === 'string' && e.str !== '')
  return {
    leaves: items.map((e) => e.str),
    translated: laid.translated,
    dropped: laid.dropped,
    inserted: laid.inserted,
  }
}

/** the judge: `leaves` the reading's items in order; `page` the laid Page; `members` the parts' Placed by ord; `entries` the
 *  page's own text content with its marked content (PDF.js's, as laidText reads it), where each member's own text stands */
export function orderOf(leaves, page, members, entries) {
  const all = leaves.join('').replace(SPACE, '')
  // (the text items inside an optional content run of ours, with their place in the stream: a member's own text is in its
  // groups' runs; an item no run of ours holds (a figure's own label, which may stand in a member's box) is no member's)
  const ours = []
  {
    const depth = []
    let k = 0
    for (const e of entries) {
      if (typeof e.str === 'string') {
        if (depth.some(Boolean)) ours.push([k, e])
        k++
      } else if (e.type === 'beginMarkedContentProps' || e.type === 'beginMarkedContent')
        depth.push(e.type === 'beginMarkedContentProps' && e.tag === 'OC')
      else if (e.type === 'endMarkedContent') depth.pop()
    }
  }
  // (a member's place: its first item in a run of ours standing in one of its lines' boxes on the page (a line it keeps, a
  // display's row, holds none), by the item's middle along its own direction, on its baseline (text.ts placeOf), within a
  // point: a figure's text set turned stands across its line's box, never on its baseline)
  const firstOf = (ord) => {
    const ls = members.get(ord)?.lines.filter((x) => x[0] === page.page) ?? []
    const hit = ours.find(([, it]) => {
      if (!it.str?.trim()) return false
      const [a, b, , , e, f] = it.transform
      const s = Math.hypot(a, b) || 1
      const x = e + (a / s) * (it.width / 2),
        y = f + (b / s) * (it.width / 2)
      return ls.some((l) => x >= l[2] - 1 && x <= l[3] + 1 && y >= l[6] - 1 && y <= l[5] + 1)
    })
    return hit ? hit[0] : Number.POSITIVE_INFINITY
  }
  const runs = page.members
    .filter((m) => m.state === 'laid')
    .map((m) => ({
      ord: m.ord,
      at: firstOf(m.ord),
      t: m.lines.flatMap(([, , , its]) => its.filter((i) => !('src' in i)).map((i) => i.s)).filter((s) => s.trim()),
    }))
    .sort((a, b) => a.at - b.at)
  // (each member's places in the reading: every index of its first run from which its runs read in their order (white space
  // aside); a member a run of which the reading never holds is missing. Members whose places in the stream are one item (two
  // members' boxes over the same text: a figure's labels set over each other) stand in no order the stream decides: taken in
  // the order of their first place)
  const missingAll = [],
    judged = []
  for (const r of runs) {
    const ss = r.t.map((t) => t.replace(SPACE, '')).filter(Boolean)
    if (!ss.length) continue
    if (ss.some((x) => !all.includes(x))) {
      missingAll.push(r.ord)
      continue
    }
    const places = []
    for (let i = all.indexOf(ss[0]); i >= 0; i = all.indexOf(ss[0], i + 1)) {
      let from = i
      for (const x of ss.slice(1)) {
        from = all.indexOf(x, from)
        if (from < 0) break
      }
      if (from >= 0) places.push(i)
    }
    judged.push({ ord: r.ord, at: r.at, places })
  }
  judged.sort(
    (a, b) => a.at - b.at || (a.places[0] ?? Number.POSITIVE_INFINITY) - (b.places[0] ?? Number.POSITIVE_INFINITY),
  )
  // (out of order: the fewest members that, taken out, leave the rest read in the stream's order: a longest chain of the
  // members, one place each, whose places never go back (patience sorting, a member's places tried from its last so that no
  // member extends its own chain). A member read late is out of order alone, never every member after it)
  const tails = []
  judged.forEach((m, k) => {
    for (let q = m.places.length - 1; q >= 0; q--) {
      const c = m.places[q]
      let lo = 0,
        hi = tails.length
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (tails[mid].pos <= c) lo = mid + 1
        else hi = mid
      }
      const node = { pos: c, k, prev: lo > 0 ? tails[lo - 1] : null }
      if (lo === tails.length) tails.push(node)
      else if (c < tails[lo].pos) tails[lo] = node
    }
  })
  const chained = new Set()
  for (let n = tails.at(-1) ?? null; n; n = n.prev) chained.add(n.k)
  const outOfOrderAll = judged.filter((_, k) => !chained.has(k)).map((m) => m.ord)
  return {
    members: runs.length,
    runs: runs.reduce((n, r) => n + r.t.length, 0),
    missing: missingAll[0] ?? null,
    outOfOrder: outOfOrderAll[0] ?? null,
    missingAll,
    outOfOrderAll,
    order: runs.map((r) => [r.ord, r.at]),
  }
}

/** PDF.js's legacy build for Node, and its data files' options */
export async function pdfjsNode() {
  const base = join(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'), '..')
  const lib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const options = {
    cMapUrl: join(base, 'cmaps/'),
    cMapPacked: true,
    standardFontDataUrl: join(base, 'standard_fonts/'),
    verbosity: 0,
    useSystemFonts: false,
  }
  return { lib, options }
}

/** a bundle's head, its parts by page, its units' kept ids and its add-on's bytes */
export function bundleOf(dir) {
  const head = JSON.parse(readFileSync(join(dir, 'head.json'), 'utf8'))
  const parts = new Map()
  head.parts.forEach((d, i) => {
    if (d) parts.set(i + 1, JSON.parse(readFileSync(join(dir, `${d}.part`), 'utf8')))
  })
  const kept = new Set()
  for (const u of head.units)
    for (const x of JSON.parse(readFileSync(join(dir, `${u}.units`), 'utf8')).units) if (x.kept) kept.add(x.id)
  const addOn = head.addOn ? readFileSync(join(dir, `${head.addOn.digest}.addon`)) : null
  return { head, parts, kept, addOn }
}

/** every member of the parts, once, by ord (a part repeats the flows of the page a member begins on) */
export function membersOfParts(parts) {
  const out = new Map()
  for (const part of parts.values())
    for (const flow of part.flows) for (const m of flow) if (!out.has(m.ord)) out.set(m.ord, m)
  return out
}
