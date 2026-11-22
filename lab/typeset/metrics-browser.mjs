// lab/typeset/metrics-browser.mjs [--pairs=<a,b>] [--chrome=<binary>] [--dry]: the reader's own Metrics held in a browser
// (lane L7's spec for lane L4, "The reader's own Metrics"). The served faces (served-metrics.mjs's tables and slices) are
// declared in a page as today's reader declares them (layer-proto/fonts.mjs sliceFace: each slice a FontFace of its face's
// family, weight and style, its code points as its unicode-range; no system face, no generic family), and every distinct
// (font string, text) of the tap's metrics tables (baseline/tap/metrics/<pair>.metrics.json.gz) is measured at 100 px:
//   rules   the spec's (2) and (3), what the reader's Metrics must do: the text cut where its characters' slice changes
//           (served-metrics' runs: the first family of the string whose face, by CSS matching, has a slice declaring the
//           character), each run measured alone in the font string itself, in small capitals where the run's face sets its own
//           (its smcp feature, @readarxiv/text SMCP: the reader's class draws them) and never where it has none (the
//           typesetter fakes those itself, B.tokens' `sc`; a canvas element's `font-synthesis: none` does not reach its text,
//           the styled mode shows), a run of CJK characters unkerned and cut between two adjacent CJK punctuation marks (no
//           text-spacing-trim), the runs' widths summed; the ink their highest ascent, deepest descent and furthest right.
//           In the whole string, not its run's family alone: no family before the run's declares its characters, so Chrome
//           sets them in the run's slice, and a character a slice declares but its file lacks (xcharter-regular's slice 5
//           and U+2217, the one of the tables) falls to the next family, as today's reader has it, where the family alone
//           would set it in a system face
//   plain   today's measure (layer2.mjs w100): one measureText of the whole text in the font string, Chrome's own fallback
//   styled  plain's on a canvas element styled `font-synthesis: none; text-spacing-trim: space-all` (the spec's other way to
//           the same trim and synthesis; read only, never gated: on Chromium 153 the element's trim reaches its text, its
//           synthesis does not, and the kana stay kerned)
// Each against the table's w100 and the Node measurer's (served-metrics.mjs), equal within 1/1000 px. Exit 0 when rules
// equals the measurer on every measure and every other difference of rules and plain is of a named class (10: 8
// text-spacing-trim of adjacent CJK punctuation, 2 kana runs Chrome kerns), none over its count; else 1. The 10 stand between
// rules and the table and between plain and the measurer: the table is today's Chrome, which trims and kerns kana; the
// measurer, the spec's target, does neither. A small-caps measure is of no named class: Chrome's canvas, the measurer and the
// table give a face's own small capitals one width (the 4 of the tables, domitian's "ArXiv" 289.0 at 100 px, its file's smcp
// glyphs, and xcharter's "Gap" and "Props", equal in all three). Offline: a static server on 127.0.0.1 serves the page and the
// slices, the browser aborts any other request. Lab-data stays where it is: nothing is written. Run from the worktree's root,
// in the machine's browser slot:
//   <the lab's heavy-slot.sh> e2e -- node lab/typeset/metrics-browser.mjs
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { ownSmallCapsOf, SMCP } from '../../packages/text/src/index.ts'
import { caseRuns, upperOf } from '../../packages/typeset/src/breaker/tokens.ts'
import { FACES } from '../../packages/typeset/src/data/faces.ts'
import { readGz, TAP } from '../../packages/typeset/tests/replay/tap.ts'
import { CJK, faceOf, hasServed, inRanges, parse, SLICES, servedMetrics, TABLES } from './served-metrics.mjs'

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const DRY = process.argv.includes('--dry')
const CHROME = arg('chrome')
const EPS = 1e-3
const INK_EPS = 1e-2
const LIST = 20

// ---- the faces, the font strings and the runs: served-metrics.mjs's, copied where it does not export them

/** the families' faces and their slices (served-metrics.mjs catalogue, copied: not exported), each slice with its file and
 *  the name the page asks it by */
function catalogue() {
  const index = JSON.parse(readFileSync(join(TABLES, 'index.json'), 'utf8'))
  const groups = new Map()
  const group = (name) => {
    if (!groups.has(name)) groups.set(name, JSON.parse(readFileSync(join(TABLES, `${name}.json`), 'utf8')))
    return groups.get(name)
  }
  const families = new Map()
  for (const [id, f] of Object.entries(FACES)) {
    const entry = index.faces[id]
    if (!entry) continue
    const g = group(entry.group)
    const slices = (g.faces[id] ?? []).flatMap((s, k) => {
      if (!s) return []
      const name = s.path.split('/').pop()
      const file = SLICES.map((d) => join(d, name)).find((p) => existsSync(p))
      return file ? [{ file, name, ranges: g.slices[k], key: `${id}:${k}` }] : []
    })
    const list = families.get(f.family) ?? []
    list.push({ id, family: f.family, weight: f.weight, style: f.style, slices })
    families.set(f.family, list)
  }
  return families
}

/** a text's runs in a font (servedMetrics' runsOf, copied: not exported): each a slice's characters, CJK apart; a blank no
 *  slice holds in the run before it; null where a character no served face holds is left (Chrome would draw it in a system
 *  face: served-metrics' Unserved) */
function runsOf(families, font, text) {
  const f = parse(font)
  const faces = f.families.map((fam) => families.get(fam)).filter(Boolean).map((list) => faceOf(list, f.weight, f.style))
  const runs = []
  for (const ch of text) {
    const cp = ch.codePointAt(0)
    let at = null
    for (const face of faces) {
      const s = face?.slices.find((x) => inRanges(x.ranges, cp))
      if (s) {
        at = { s, face }
        break
      }
    }
    if (!at) {
      if (runs.length && /\s/.test(ch)) {
        runs.at(-1).text += ch
        continue
      }
      return null
    }
    const last = runs.at(-1)
    const cjk = CJK.test(ch)
    if (last && last.s === at.s && last.cjk === cjk) last.text += ch
    else runs.push({ s: at.s, face: at.face, text: ch, cjk })
  }
  return runs
}

/** the CJK punctuation Chrome's text-spacing-trim narrows when two stand together (fullwidth and ideographic marks); a CJK
 *  run is cut between two of them, so that each is measured at its full advance, as the measurer's unkerned run sums it */
const PUNCT = /[\u3001-\u3003\u3008-\u3011\u3014-\u301f\u30fb\uff01-\uff0f\uff1a-\uff20\uff3b-\uff40\uff5b-\uff65]/u
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}\u30fc]/u

/** the parts the rules mode measures: [the font string, its small capitals kept where the run's face sets its own (its smcp
 *  feature, @readarxiv/text SMCP) and dropped where it has none, as the reader's served.ts partsOf; text, unkerned, the slice's key] */
function partsOf(string, runs) {
  const out = []
  const plain = string.replace(/^(italic )?small-caps /, '$1')
  for (const r of runs) {
    const font = SMCP.includes(r.face.id) ? string : plain
    if (!r.cjk) {
      out.push([font, r.text, 0, r.s.key])
      continue
    }
    let cur = ''
    let prev = ''
    for (const ch of r.text) {
      if (cur && PUNCT.test(prev) && PUNCT.test(ch)) {
        out.push([font, cur, 1, r.s.key])
        cur = ''
      }
      cur += ch
      prev = ch
    }
    out.push([font, cur, 1, r.s.key])
  }
  return out
}

/** a slice's unicode-range descriptor from its [start, end] pairs (today's layer-proto/fonts.mjs unicodeRangeOf) */
const hex = (n) => n.toString(16).toUpperCase()
const unicodeRangeOf = (ranges) => {
  const out = []
  for (let i = 0; i + 1 < ranges.length; i += 2) out.push(ranges[i] === ranges[i + 1] ? `U+${hex(ranges[i])}` : `U+${hex(ranges[i])}-${hex(ranges[i + 1])}`)
  return out.join(', ')
}

/** a difference's named class (the 10 of the header), or 'other' (a small-caps measure among them: none is named) */
const NAMED = { trim: 8, kana: 2 }
function classOf(_font, text) {
  const cs = [...text]
  for (let i = 1; i < cs.length; i++) if (PUNCT.test(cs[i - 1]) && PUNCT.test(cs[i])) return 'trim'
  for (let i = 1; i < cs.length; i++) if ((KANA.test(cs[i - 1]) || KANA.test(cs[i])) && CJK.test(cs[i - 1]) && CJK.test(cs[i])) return 'kana'
  return 'other'
}

// ---- the measures: every distinct (font, text) of the tables asked

if (!hasServed) {
  console.error(`the served faces are not here: ${TABLES}, ${SLICES.join(', ')}`)
  process.exit(2)
}
const all = readdirSync(join(TAP, 'metrics')).map((f) => f.replace(/\.metrics\.json\.gz$/, '')).sort()
const asked = arg('pairs')?.split(',').filter(Boolean)
for (const p of asked ?? []) if (!all.includes(p)) throw new Error(`no metrics table for ${p}`)
const pairs = asked ?? all
const families = catalogue()
const measures = []
const seen = new Set()
let rows = 0
for (const pair of pairs) {
  const T = readGz(join(TAP, 'metrics', `${pair}.metrics.json.gz`))
  const rights = new Map((T.rights ?? []).map(([font, text, r]) => [`${font}\u0000${text}`, r]))
  for (const [font, text, w, a, d] of T.widths) {
    rows++
    const k = `${font}\u0000${text}`
    if (seen.has(k)) continue
    seen.add(k)
    const cut = runsOf(families, font, text)
    measures.push({ font, text, w, a, d, r: rights.get(k), parts: cut && partsOf(font, cut) })
  }
}
const declared = [...families.values()].flatMap((list) => list.flatMap((f) => f.slices.map((s) => ({ f, s }))))
const files = new Map(declared.map(({ s }) => [s.name, s.file]))
const needed = new Set(measures.flatMap((m) => (m.parts ?? []).map((p) => p[3])))
const unserved = measures.filter((m) => !m.parts)

// ---- small capitals as the typesetter asks them, measured as the reader measures them and drawn as its class draws them
// Pieces of our own in a face of SMCP, each laid as the typesetter lays a `\textsc` piece (@readarxiv/text ownSmallCapsOf: the
// face's own small capitals where its smcp substitutes every lower-case letter of the piece, one run asking them; else the
// layer's, caseRuns: the face's capitals at SHARE of the size, runs of one case, none asked), measured by the rules'
// parts (each run's in its slices, partsOf: small capitals kept for a face of SMCP) and drawn as an SVG <text> of the reader's
// class rule (served.ts classOf: font-variant-caps as the run asks, font-synthesis none; each run a <tspan> at its share of the
// size). The two widths must be one, within the browser's text layout unit (1/64 px) a run. Beside each, for the record, the
// face's rule the typesetter read before (every piece of a face of SMCP one run asking its small capitals): its measure, its
// drawing and the piece's lower case.
/** the share B.tokens sets a faked small capital at where the page states none (its capsK) */
const SHARE = 0.8
const SMALL_CAPS_CASES = [
  ['libertine-regular', 'de', 'Abc'],
  ['libertine-regular', 'de', 'αβγδ'],
  ['libertine-regular', 'de', 'Abcδ'],
  ['cmun-sans-regular', 'ru', 'Abc'],
  ['cmun-mono-regular', 'ru', 'Abc'],
  ['cmun-sans-regular', 'ru', 'Абв'],
  ['cmun-sans-regular', 'ru', 'αβγ'],
]
/** a face's runs of a piece under a rule: [the run's text, its share, whether it asks the face's small capitals] */
const capsRunsOf = (id, to, text, rule) =>
  rule === 'face' || ownSmallCapsOf(id, text, upperOf(to))
    ? [[text, 1, true]]
    : caseRuns(text, SHARE, upperOf(to)).map((r) => [r.s, r.k, false])
const capsCases = SMALL_CAPS_CASES.map(([id, to, text]) => {
  const f = FACES[id]
  const fontOf = (caps) => `${f.style === 'italic' ? 'italic ' : ''}${caps ? 'small-caps ' : ''}${f.weight} 100px "${f.family}"`
  const ruleOf = (rule) => {
    const runs = capsRunsOf(id, to, text, rule).map(([s, k, caps]) => {
      const font = fontOf(caps)
      const cut = runsOf(families, font, s)
      if (!cut) throw new Error(`small capitals: no served face holds ${JSON.stringify(s)} in ${font}`)
      return { s, k, caps, parts: partsOf(font, cut) }
    })
    return runs
  }
  const plainCut = runsOf(families, fontOf(false), text)
  return { id, to, text, family: f.family, weight: f.weight, style: f.style, letter: ruleOf('letter'), face: ruleOf('face'), lower: partsOf(fontOf(false), plainCut) }
})
for (const c of capsCases) for (const r of [...c.letter, ...c.face]) for (const p of r.parts) needed.add(p[3])
for (const p of capsCases.flatMap((c) => c.lower)) needed.add(p[3])
const count = {
  pairs: pairs.length,
  rows,
  measures: measures.length,
  fonts: new Set(measures.map((m) => m.font)).size,
  unserved: unserved.length,
  parts: measures.reduce((n, m) => n + (m.parts?.length ?? 0), 0),
  slicesDeclared: declared.length,
  slicesNeeded: needed.size,
}
console.log(JSON.stringify(count))
if (DRY) process.exit(0)

// ---- the measurer's numbers, in Node

const M = servedMetrics()
for (const m of measures) if (m.parts) m.node = M.advance(m.font, 100, m.text)

// ---- the page: a static server on 127.0.0.1, the browser offline

const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname
  if (path === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    return res.end('<!doctype html><html lang="en"><meta charset="utf-8"><title>metrics</title><body></body></html>')
  }
  const name = /^\/static-fonts\/([0-9a-f]{16}\.woff2)$/.exec(path)?.[1]
  const file = name && files.get(name)
  if (!file) {
    res.writeHead(404)
    return res.end()
  }
  res.writeHead(200, { 'content-type': 'font/woff2' })
  res.end(readFileSync(file))
})
await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
const origin = `http://127.0.0.1:${server.address().port}`
const { chromium } = await import('playwright')
const browser = await chromium.launch({ headless: true, ...(CHROME ? { executablePath: CHROME } : {}) })
let offOrigin = 0
const out = {}
try {
  const context = await browser.newContext({ locale: 'en-US' })
  await context.route('**/*', (route) => {
    if (route.request().url().startsWith(`${origin}/`)) return route.continue()
    offOrigin++
    return route.abort()
  })
  const page = await context.newPage()
  await page.goto(`${origin}/`)
  out.chromium = browser.version()

  // every slice declared as the reader declares it; then each font string's characters loaded as Chrome selects them, and
  // each slice the rules' parts are set in
  await page.evaluate((faces) => {
    window.axtFaces = new Map()
    for (const [key, family, weight, style, url, unicodeRange] of faces) {
      const f = new FontFace(family, `url("${url}")`, { weight: String(weight), style, unicodeRange })
      document.fonts.add(f)
      window.axtFaces.set(key, f)
    }
  }, declared.map(({ f, s }) => [s.key, f.family, f.weight, f.style, `/static-fonts/${s.name}`, unicodeRangeOf(s.ranges)]))
  const charsBy = new Map()
  const add = (font, text) => {
    const set = charsBy.get(font) ?? charsBy.set(font, new Set()).get(font)
    for (const ch of text) set.add(ch)
  }
  for (const m of measures) {
    add(m.font, m.text)
    for (const [font, text] of m.parts ?? []) add(font, text)
  }
  out.faces = await page.evaluate(
    async ({ fonts, keys }) => {
      for (const [font, chars] of fonts) await document.fonts.load(font, chars).catch(() => null)
      await Promise.all(keys.map((k) => window.axtFaces.get(k).load().catch(() => null)))
      const st = {}
      for (const f of document.fonts) st[f.status] = (st[f.status] ?? 0) + 1
      const styled = document.createElement('canvas')
      styled.width = styled.height = 8
      styled.setAttribute('style', 'font-synthesis: none; text-spacing-trim: space-all')
      document.body.append(styled)
      window.axtStyled = styled.getContext('2d')
      const cs = getComputedStyle(styled)
      return { status: st, styled: { fontSynthesis: cs.fontSynthesis, textSpacingTrim: cs.textSpacingTrim ?? null } }
    },
    { fonts: [...charsBy].map(([font, set]) => [font, [...set].join('')]), keys: [...needed] },
  )

  // the measures, in batches: [rules [w, a, d, right] | null, plain [w, a, d, right], styled w]
  const measureAll = (items) => {
    const ink = (m) => [m.actualBoundingBoxAscent, m.actualBoundingBoxDescent, m.actualBoundingBoxRight].map((v) => (Number.isFinite(v) ? v : 0))
    window.axtPlain ??= new OffscreenCanvas(8, 8).getContext('2d')
    window.axtRules ??= new OffscreenCanvas(8, 8).getContext('2d')
    const plain = window.axtPlain
    const rules = window.axtRules
    const styled = window.axtStyled
    return items.map(([font, text, parts]) => {
      plain.font = font
      const p = plain.measureText(text)
      styled.font = font
      const s = styled.measureText(text).width
      if (!parts) return [null, [p.width, ...ink(p)], s]
      let w = 0
      let a = parts.length ? Number.NEGATIVE_INFINITY : 0
      let d = a
      let right = a
      for (const [pf, pt, flat] of parts) {
        rules.font = pf
        rules.fontKerning = flat ? 'none' : 'normal'
        const m = rules.measureText(pt)
        const [ma, md, mr] = ink(m)
        a = Math.max(a, ma)
        d = Math.max(d, md)
        right = Math.max(right, w + mr)
        w += m.width
      }
      return [[w, a, d, right], [p.width, ...ink(p)], s]
    })
  }
  const BATCH = 4000
  const t0 = Date.now()
  for (let i = 0; i < measures.length; i += BATCH) {
    const chunk = measures.slice(i, i + BATCH)
    const got = await page.evaluate(measureAll, chunk.map((m) => [m.font, m.text, m.parts?.map((p) => p.slice(0, 3)) ?? null]))
    got.forEach(([r, p, s], k) => Object.assign(chunk[k], { rules: r, plain: p, styled: s }))
  }
  out.measureMs = Date.now() - t0
  // (the small capitals' cases: each slice their parts are in loaded first, then measured on a canvas and drawn in an SVG)
  out.caps = await page.evaluate(async (cases) => {
    const keys = new Set(cases.flatMap((c) => [...c.letter, ...c.face].flatMap((r) => r.parts.map((p) => p[3])).concat(c.lower.map((p) => p[3]))))
    await Promise.all([...keys].map((k) => window.axtFaces.get(k)?.load().catch(() => null)))
    await document.fonts.ready
    const ctx = new OffscreenCanvas(8, 8).getContext('2d')
    const widthOf = (parts) => {
      let w = 0
      for (const [pf, pt, flat] of parts) {
        ctx.font = pf
        ctx.fontKerning = flat ? 'none' : 'normal'
        w += ctx.measureText(pt).width
      }
      return w
    }
    const NS = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(NS, 'svg')
    svg.setAttribute('width', '2000')
    svg.setAttribute('height', '300')
    document.body.append(svg)
    const drawn = (c, runs) => {
      const t = document.createElementNS(NS, 'text')
      t.setAttribute('x', '10')
      t.setAttribute('y', '200')
      for (const r of runs) {
        const span = document.createElementNS(NS, 'tspan')
        span.setAttribute(
          'style',
          `font-family:"${c.family}";font-weight:${c.weight};font-style:${c.style};font-variant-caps:${r.caps ? 'small-caps' : 'normal'};font-synthesis:none;text-spacing-trim:space-all;font-feature-settings:"locl" 0;font-size:${100 * r.k}px`,
        )
        span.textContent = r.s
        t.append(span)
      }
      svg.append(t)
      const w = t.getComputedTextLength()
      t.remove()
      return w
    }
    return cases.map((c) => ({
      measured: c.letter.reduce((w, r) => w + widthOf(r.parts) * r.k, 0),
      drawn: drawn(c, c.letter),
      faceMeasured: c.face.reduce((w, r) => w + widthOf(r.parts) * r.k, 0),
      faceDrawn: drawn(c, c.face),
      lower: widthOf(c.lower),
    }))
  }, capsCases)
  out.loadingAfter = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loading').length)
} finally {
  await browser.close()
  server.close()
}

// ---- the comparisons

const report = []
const failed = []
for (const mode of ['rules', 'plain', 'styled']) {
  for (const ref of ['table', 'measurer']) {
    let compared = 0
    let equal = 0
    const diffs = []
    for (const m of measures) {
      if (!m.parts) continue
      const ours = mode === 'rules' ? m.rules[0] : mode === 'plain' ? m.plain[0] : m.styled
      const theirs = ref === 'table' ? m.w : m.node
      compared++
      if (Math.abs(ours - theirs) <= EPS) equal++
      else diffs.push({ m, ours, cls: classOf(m.font, m.text) })
    }
    const by = {}
    for (const x of diffs) by[x.cls] = (by[x.cls] ?? 0) + 1
    report.push(`${mode} vs ${ref}: compared ${compared}, equal ${equal}, different ${diffs.length}${diffs.length ? ` ${JSON.stringify(by)}` : ''}`)
    for (const x of diffs.slice(0, LIST))
      report.push(`    [${x.cls}] ${x.m.font} ${JSON.stringify(x.m.text)}: ours ${x.ours}, table ${x.m.w}, measurer ${x.m.node}`)
    if (diffs.length > LIST) report.push(`    (${diffs.length - LIST} more)`)
    if (mode === 'styled') continue
    if (mode === 'rules' && ref === 'measurer' && diffs.length) failed.push(`rules differs from the measurer on ${diffs.length}`)
    if (by.other) failed.push(`${mode} vs ${ref}: ${by.other} differences of no named class`)
    for (const [c, n] of Object.entries(NAMED)) if ((by[c] ?? 0) > n) failed.push(`${mode} vs ${ref}: ${by[c]} of ${c}, the named ${n}`)
  }
}
// (the ink against the table's, read only: the measurer's is Skia's, rounded out to whole pixels)
for (const mode of ['rules', 'plain']) {
  let inks = 0
  let inkEqual = 0
  let rights = 0
  let rightEqual = 0
  for (const m of measures) {
    if (!m.parts) continue
    const [, a, d, r] = m[mode]
    inks++
    if (Math.abs(a - m.a) <= INK_EPS && Math.abs(d - m.d) <= INK_EPS) inkEqual++
    if (m.r === undefined || m.r === null) continue
    rights++
    if (Math.abs(r - m.r) <= INK_EPS) rightEqual++
  }
  report.push(`${mode} ink vs table (1/100 px): ascent and descent equal ${inkEqual} of ${inks}, right equal ${rightEqual} of ${rights}`)
}
if (unserved.length) report.push(`unserved (not compared): ${unserved.length}, first ${unserved.slice(0, 3).map((m) => `${m.font} ${JSON.stringify(m.text)}`).join('; ')}`)
if (out.faces.status.error) failed.push(`${out.faces.status.error} slices failed to load`)
// (the small capitals' cases: the typesetter's runs measured as drawn, within the layout unit a run; the face's rule beside them)
const UNIT = 1 / 64
capsCases.forEach((c, k) => {
  const m = out.caps[k]
  const same = Math.abs(m.measured - m.drawn) <= UNIT * c.letter.length
  const layer = c.letter.some((r) => !r.caps)
  report.push(
    `small capitals ${c.id} ${c.to} ${JSON.stringify(c.text)}: ${layer ? "the layer's" : "the face's own"} (${c.letter.map((r) => `${r.s}@${r.k}`).join(' ')}), measured ${m.measured.toFixed(2)}, drawn ${m.drawn.toFixed(2)}${same ? '' : ' DIFFER'}; the face's rule: measured ${m.faceMeasured.toFixed(2)}, drawn ${m.faceDrawn.toFixed(2)}${Math.abs(m.faceMeasured - m.faceDrawn) <= UNIT ? '' : ' (differ)'}, its lower case ${m.lower.toFixed(2)}`,
  )
  if (!same) failed.push(`small capitals ${c.id} ${JSON.stringify(c.text)}: measured ${m.measured.toFixed(2)}, drawn ${m.drawn.toFixed(2)}`)
})
if (out.loadingAfter) failed.push(`${out.loadingAfter} slices were still loading after the measures`)
if (offOrigin) failed.push(`${offOrigin} requests off the origin`)
console.log(JSON.stringify({ chromium: out.chromium, faces: out.faces, measureMs: out.measureMs, offOrigin }))
console.log(report.join('\n'))
console.log(failed.length ? `FAILED: ${failed.join('; ')}` : 'ok')
process.exit(failed.length ? 1 : 0)
