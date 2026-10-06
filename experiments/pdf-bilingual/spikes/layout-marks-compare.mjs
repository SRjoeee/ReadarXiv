// experiments/pdf-bilingual/spikes/layout-marks-compare.mjs
// The corpus check's judgements (spikes/layout-marks-gate.mjs, Plan 8b Task 2): a paper's v0, the marked original as the
// run makes it today, against its v1, the same with the layout marks. Pure: what the compiles gave goes in, a judgement
// comes out; the tests are tests/pdf-reader/layout-marks-gate.test.ts.
//   - strictMoves: the brief's measure, every text item of v0 at the same page and place to 0.01 pt in v1;
//   - joinRuns, linesOf, lineAt: the joined figure (abutting items as one run), the lines the layout maker reads, the line
//     a mark stands on;
//   - fileStates: the files TeX writes, byte for byte;
//   - compareReadings: the readings the typesetting rule takes from the original (live.mjs readingsOf), byte for byte but
//     for the caption gate's marks;
//   - pageBoxes, boxDiff: TeX's own page boxes (\tracingoutput) with the marks' own nodes taken out, where the items
//     moved: the same boxes are a PDF-only offset (pdfTeX's virtual-font drift after a whatsit), a difference is TeX's,
//     and the mark nearest it says whose (attribute);
//   - verdictOf: the row's verdict.
import { classOf } from '../../../src/pdf-reader/engine/layout/marks.mjs'

/** the brief's position tolerance */
export const ITEM_TOL = 0.01
/** how far along its line a unit mark may stand from v0's and count as an offset, not a move elsewhere (compareReadings):
 *  1 pt, a kern a mark broke on the line before it (0.03 to 1.2 pt in the corpus); a space a mark took or gave is 2 pt
 *  and more */
export const LINE_TOL = 1
const r2 = v => Math.round(v * 100) / 100
const close = (a, b, tol) => Math.abs(a - b) <= tol + 1e-9

/** v0's items with no item of the same string at its page and place, and of its width, to 0.01 pt in v1 (`moved`) —
 *  the width too, as a kern lost inside an item moves the glyphs after it and not its start —, and v1's with none in
 *  v0 (`extra`), each matched once; `k`, the item's index on its page */
export function strictMoves(a, b) {
  const moved = [], extra = []
  for (let p = 0; p < Math.max(a.length, b.length); p++) {
    const pa = a[p] ?? [], pb = b[p] ?? [], left = new Map()
    pb.forEach((it, k) => (left.get(it.str) ?? left.set(it.str, []).get(it.str)).push({ it, k }))
    pa.forEach((it, k) => {
      const list = left.get(it.str) ?? [], j = list.findIndex(({ it: u }) => close(u.x, it.x, ITEM_TOL) && close(u.y, it.y, ITEM_TOL) && close(u.w ?? 0, it.w ?? 0, ITEM_TOL))
      if (j < 0) moved.push({ page: p + 1, k, str: it.str, x: it.x, y: it.y })
      else list.splice(j, 1)
    })
    for (const list of left.values()) for (const { it, k } of list) extra.push({ page: p + 1, k, str: it.str, x: it.x, y: it.y })
  }
  return { moved, extra }
}

/** a page's items that abut on one baseline joined into runs (to 0.01 pt high, 0.05 pt apart), the spaces PDF.js gives
 *  as items of their own among them: how pdfTeX and PDF.js cut a line into items is no place of a glyph. `k`, the index
 *  of a run's first item with ink among the page's items with ink */
export function joinRuns(items) {
  const runs = []
  let ink = 0
  for (const it of items) {
    const k = /\S/.test(it.str) ? ink++ : -1, r = runs.at(-1)
    if (r && close(r.y, it.y, 0.005) && Math.abs(r.x + r.w - it.x) < 0.05) { r.str += it.str; r.w = it.x + it.w - r.x; if (r.k < 0) r.k = k } else runs.push({ str: it.str, x: it.x, y: it.y, w: it.w, k })
  }
  return runs.map(r => ({ ...r, str: r.str.trim() })).filter(r => r.str)
}

/**
 * A page's lines as the layout maker reads them (Task 5's linesOf): items in the order the page sets them, each on the
 * line before it while its baseline is within half the smaller height of that line's and it is not left of the line's
 * start by more than 30 pt. `of[k]`, the line of item k; each line its baseline, height and extent
 */
export function linesOf(items) {
  const lines = [], of = []
  for (const it of items) {
    const l = lines.at(-1), h = it.h > 0 ? it.h : 1
    if (l && Math.abs(it.y - l.y) <= Math.min(h, l.h) / 2 && it.x >= l.x0 - 30) { l.x0 = Math.min(l.x0, it.x); l.x1 = Math.max(l.x1, it.x + it.w); of.push(lines.length - 1) }
    else { lines.push({ y: it.y, h, x0: it.x, x1: it.x + it.w }); of.push(lines.length - 1) }
  }
  return { lines, of }
}
/** the line a mark at (x, y) stands on, of a page's lines: within half its height of its baseline and 3 pt of its
 *  extent; -1 for none */
export function lineAt(lines, x, y) {
  let best = -1, d = Infinity
  lines.forEach((l, i) => { const dy = Math.abs(l.y - y); if (dy <= Math.max(1, l.h / 2) && x >= l.x0 - 3 && x <= l.x1 + 3 && dy < d) { best = i; d = dy } })
  return best
}

/** each file TeX writes, by its contents in v0 and v1 (null: not written): 'same', 'differs', or 'none' in both */
export function fileStates(a, b) {
  const out = {}
  for (const ext of ['aux', 'toc', 'lof', 'lot', 'out']) out[ext] = a[ext] == null && b[ext] == null ? 'none' : a[ext] === b[ext] ? 'same' : 'differs'
  return out
}

/** the readings as bytes: every part, the marks in name order */
export const readingsText = r => JSON.stringify({ log: r.log, cites: r.cites, labels: r.labels, bbl: r.bbl ?? null, marks: { pages: r.marks.pages, width: r.marks.width, height: r.marks.height, columns: r.marks.columns, marks: [...r.marks.marks].sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)) } })
/**
 * v1's readings against v0's: 'same' byte for byte; 'captions' where only marks of caption units differ, each set on
 * another page than v0 set it (MARK_DEF's own marks, which v0 sets first where the list of figures is and v1, gated off
 * the list, where the float is), each unit with its page in v0 and in v1 (1-based); 'offsets' where marks differ besides
 * along their lines alone — the same page, the baseline to 0.01 pt, within LINE_TOL along it, each with its shift — as
 * the items on a line pdfTeX draws off TeX's places (a destination is set where pdfTeX has got to), which TeX's boxes
 * judge as they judge the items; else 'differs', with the parts
 */
export function compareReadings(r0, r1, units) {
  if (readingsText(r0) === readingsText(r1)) return { readings: 'same', captions: [] }
  const parts = ['log', 'cites', 'labels', 'bbl'].filter(k => (r0[k] ?? null) !== (r1[k] ?? null))
  for (const k of ['pages', 'width', 'height', 'columns']) if (JSON.stringify(r0.marks[k]) !== JSON.stringify(r1.marks[k])) parts.push(`marks.${k}`)
  const names = [...new Set([...r0.marks.marks.keys(), ...r1.marks.marks.keys()])].sort()
  const differ = names.filter(n => JSON.stringify(r0.marks.marks.get(n) ?? null) !== JSON.stringify(r1.marks.marks.get(n) ?? null))
  const gate = new Map(), offsets = []
  for (const n of differ) {
    const m = /^(\d+)[se]$/.exec(n), a = r0.marks.marks.get(n), b = r1.marks.marks.get(n)
    if (m && units[Number(m[1])]?.kind === 'caption' && a && b && a.page !== b.page) { if (!gate.has(Number(m[1])) || n.endsWith('s')) gate.set(Number(m[1]), [Number(m[1]), a.page + 1, b.page + 1]) }
    else if (a && b && a.page === b.page && close(a.y, b.y, ITEM_TOL) && close(a.x, b.x, LINE_TOL)) offsets.push([n, r2(b.x - a.x)])
    else parts.push(`marks ${n}`)
  }
  const captions = [...gate.values()].sort((x, y) => x[0] - y[0])
  if (parts.length) return { readings: 'differs', captions: [], parts }
  return offsets.length ? { readings: 'offsets', captions, offsets } : { readings: 'captions', captions }
}

// ---------------------------------------------------------------- TeX's page boxes
/** each page TeX shipped out, as its box display in a log written with \tracingoutput (lines unwrapped): a tree of
 *  nodes { text, children, parent } under a root of its own */
export function pageBoxes(log) {
  const pages = [], lines = log.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (!/^Completed box being shipped out \[[^\]]*\]$/.test(lines[i])) continue
    const root = { text: '', children: [], parent: null }, stack = [root]
    for (i++; i < lines.length && lines[i] !== ''; i++) {
      const m = /^([.|]*)(.*)$/.exec(lines[i]), depth = m[1].length
      if (depth >= stack.length) continue
      stack.length = depth + 1
      const parent = stack[depth], node = { text: m[2], children: [], parent }
      parent.children.push(node)
      stack.push(node)
    }
    pages.push(root)
  }
  return pages
}
const DEST = /^\\pdfdest name\{axt-([^}]+)\}/
const BOX = /^\\[hv]box\(/
/** the box without the marks' own nodes, each node keeping its own (`src`): a mark's destination, the empty \vadjust
 *  that says a mark took an italic correction, an empty box a mark was set in, a kern of no width (an upright letter's
 *  italic correction, which a mark takes and gives back only where it has a width; a formula's math node, with no
 *  \mathsurround, which a mark at a line's start keeps from being discarded there), and a discretionary — one left in
 *  a shipped box is a break not taken, which sets nothing, and a word a mark stands beside may be hyphenated
 *  otherwise; a glue or a kern a mark took off and put back loses only its name (\spaceskip's) or its kind (a font
 *  kern's) */
function withoutMarks(node) {
  const children = []
  for (const c of node.children) {
    if (DEST.test(c.text) || /^\\kern ?-?0\.0$/.test(c.text) || /^\\math(?:on|off)$/.test(c.text) || /^\\discretionary\b/.test(c.text)) continue
    const f = withoutMarks(c)
    if (c.text === '\\vadjust' && !f.children.length) continue
    if (/^\\hbox\(0\.0\+0\.0\)x0\.0$/.test(c.text) && c.children.length && !f.children.length) continue
    children.push(f)
  }
  return { text: node.text.replace(/^\\glue\(\\x?spaceskip\) /, '\\glue ').replace(/^\\kern /, '\\kern'), children, src: node }
}
/** a subtree's hash (cyrb53 of its text and its children's hashes), kept on the node */
const hashOf = node => {
  if (node.hash !== undefined) return node.hash
  const str = `${node.text}\u0000${node.children.map(hashOf).join(',')}`
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677) }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  node.hash = 4294967296 * (2097151 & h2) + (h1 >>> 0)
  return node.hash
}
/** the pairs of indices two lists of nodes have in common, whole subtrees alike (a longest common subsequence) */
function common(a, b) {
  const n = a.length, m = b.length, ha = a.map(hashOf), hb = b.map(hashOf)
  let lo = 0
  while (lo < n && lo < m && ha[lo] === hb[lo]) lo++
  let hi = 0
  while (hi < n - lo && hi < m - lo && ha[n - 1 - hi] === hb[m - 1 - hi]) hi++
  const pairs = Array.from({ length: lo }, (_, i) => [i, i])
  const A = ha.slice(lo, n - hi), B = hb.slice(lo, m - hi)
  // past a few million cells, two lists differ in all but their ends: no common nodes looked for between them
  if (A.length && B.length && A.length * B.length <= 4e6) {
    const t = Array.from({ length: A.length + 1 }, () => new Int32Array(B.length + 1))
    for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) t[i][j] = A[i] === B[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1])
    for (let i = 0, j = 0; i < A.length && j < B.length;) { if (A[i] === B[j]) { pairs.push([lo + i, lo + j]); i++; j++ } else if (t[i + 1][j] >= t[i][j + 1]) i++; else j++ }
  }
  for (let k = hi; k > 0; k--) pairs.push([n - k, m - k])
  return pairs
}
const PER_PAGE = 50
/** every difference of two lists of nodes, as deep as it goes: the nodes in common aligned, and between them each pair
 *  of boxes of a kind, or of nodes of one text, compared inside; each difference [v0's node, v1's node, a v1 node beside
 *  it (to look for the nearest mark from)] */
function diffs(a, b, owner, out) {
  const pairs = [...common(a, b), [a.length, b.length]]
  let i = 0, j = 0
  for (const [pi, pj] of pairs) {
    const xs = a.slice(i, pi), ys = b.slice(j, pj), beside = b[j - 1] ?? b[pj] ?? owner
    for (let k = 0; k < Math.max(xs.length, ys.length) && out.length < PER_PAGE; k++) {
      const x = xs[k], y = ys[k]
      if (x && y && (x.text === y.text || (BOX.test(x.text) && x.text.slice(0, 5) === y.text.slice(0, 5)))) {
        if (x.children.length === y.children.length && x.children.every((c, q) => hashOf(c) === hashOf(y.children[q]))) out.push([x, y, y])
        else diffs(x.children, y.children, y, out)
      } else out.push([x ?? null, y ?? null, y ?? beside])
    }
    i = pi + 1
    j = pj + 1
  }
  return out
}
/** a mark's name in a node or under it, the first or the last in reading order */
function destIn(node, last) {
  const m = DEST.exec(node.text)
  if (m) return m[1]
  const kids = last ? [...node.children].reverse() : node.children
  for (const c of kids) { const n = destIn(c, last); if (n) return n }
  return null
}
/** the mark nearest a node of v1's box: beside it in its list (before it first), then beside its box, and so out */
function nearest(node) {
  for (let n = node; n?.parent; n = n.parent) {
    const sibs = n.parent.children, i = sibs.indexOf(n)
    const own = destIn(n, false)
    if (own) return own
    for (let d = 1; d < sibs.length; d++) {
      if (i - d >= 0) { const x = destIn(sibs[i - d], true); if (x) return x }
      if (i + d < sibs.length) { const x = destIn(sibs[i + d], false); if (x) return x }
    }
  }
  return null
}
/** the line a node of a page's box is set in: the hbox around it that stands in a vertical list (a column, the page),
 *  by its path of child indices from the page's root; null for a node in no line */
function lineOf(node) {
  let n = node
  while (n?.parent && !(/^\\hbox\(/.test(n.text) && (n.parent.text === '' || /^\\vbox\(/.test(n.parent.text)))) n = n.parent
  if (!n?.parent) return null
  const path = []
  for (let m = n; m.parent; m = m.parent) path.unshift(m.parent.children.indexOf(m))
  return path.join('.')
}
/** every difference of each page's boxes once the marks' own nodes are out (at most PER_PAGE a page): v0's node and
 *  v1's (their text, null where that side has none), the name of the mark nearest it in v1, and the line it is set in
 *  (lineOf in v1's box: the lines TeX set otherwise are the distinct ones) */
export function boxDiff(pages0, pages1) {
  const out = []
  for (let p = 0; p < Math.max(pages0.length, pages1.length); p++) {
    const a = pages0[p] ? withoutMarks(pages0[p]) : { text: '', children: [], src: null }
    const b = pages1[p] ? withoutMarks(pages1[p]) : { text: '', children: [], src: null }
    for (const [x, y, at] of diffs(a.children, b.children, b, [])) out.push({ page: p + 1, v0: x?.text ?? null, v1: y?.text ?? null, near: at?.src ? nearest(at.src) : null, line: at?.src ? lineOf(at.src) : null })
  }
  return out
}

/** what a mark's name names: a heading's start or end, a cell's, a unit's (MARK_DEF), a page's columns, an image frame's,
 *  a footnote's call, or a placeholder's class (layout/marks.mjs classOf of the paper's own piece) */
export function attribute(name, units) {
  if (!name) return 'none'
  if (/^h\d+e$/.test(name)) return 'heading end'
  if (/^h\d+s$/.test(name)) return 'heading start'
  if (/^t\d+[se]$/.test(name)) return 'cell'
  if (/^\d+[se]$/.test(name)) return 'unit'
  if (/^c[12]-\d+$/.test(name)) return 'columns'
  if (/^g\d+[abt]$/.test(name)) return 'image'
  if (/^n\d+\.\d+[ab]$/.test(name)) return 'footnote'
  const m = /^p(\d+)\.(\d+)[ab]$/.exec(name)
  return (m && classOf(units[Number(m[1])]?.pieces?.[Number(m[2])])) ?? 'unknown'
}

/**
 * A paper's verdict, the layout marks' quality on it: 'passed over' (v0 does not compile); 'failed' (v1 does not: the
 * paper has no layout); 'switched' (the paper's own switch is on: a package of its moves the punctuation after a class's
 * placeholders), else 'clean' (no layout line lost: no item moved, no line TeX set otherwise) or 'accepted' (moved: N
 * layout lines lost)
 */
export function verdictOf(row) {
  if (row.v0 === 'failed') return 'passed over'
  if (row.v1 !== 'ok') return 'failed'
  if (row.switched?.length) return 'switched'
  return row.lost?.strict || row.lost?.tex ? 'accepted' : 'clean'
}
