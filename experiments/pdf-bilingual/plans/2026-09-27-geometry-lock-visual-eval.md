# Geometry lock visual evaluation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate, for 57 paper–language pairs, the original, today's and the locked translation as page images, and a local page that shows them side by side, so the owner can judge the geometry lock by eye.

**Architecture:** The lock's TeX and measurements move out of the spike into `spikes/lock.mjs`; a generator (`spikes/visual-eval.mjs`) translates each paper once with Microsoft's free engine, compiles today's and the locked version natively in Docker, renders every page with `pdftoppm`, and writes a per-paper `index.json` plus a catalog; a static page (`visual-eval/index.html`) served by `spikes/serve-eval.mjs` shows them. Service H's column is made outside the repository and dropped in as `h.pdf`.

**Tech Stack:** Node (tsx for the engine's `@/` imports), the reader's engine (`src/pdf-reader/engine/*.mjs`), pdfjs-dist 6 (destinations), TeX Live 2026 in Docker (`texlive/texlive:latest`), poppler's `pdftoppm`, Playwright (root dependency) for the page's checks.

**Spec:** `experiments/pdf-bilingual/plans/2026-09-27-geometry-lock-visual-eval-design.md`

## Global Constraints

- Everything committed is English; no CJK character in any committed file (`pnpm lint` runs the English gate).
- Nothing under `src/` changes; the lock stays in `experiments/pdf-bilingual/spikes/` this round.
- Service H is never named in the repository; the tools that make its column stay outside it.
- Outputs live in `experiments/pdf-bilingual/data/runs/visual-eval/` (ignored by git); nothing is published.
- Microsoft's free engine only, through the reader's own wire (`mt.mjs` `translateUnits`, markers format).
- Unit leading / floor (× font size): zh 1.3 / 1.1; ja, ko 1.2 / 1.05; de, ru 1.05 / 1.0.
- Column labels on the page: Original, Today, Locked, H.
- Corpus: zh = 2212.06817 and the 24 papers of `lang-gate.mjs` SAMPLE; ja, ko, de, ru = 2608.05876, 2608.18090, 2608.06701, 2608.24839, 2608.02785, 2608.21180, 2608.15761, 2608.06233.
- Local commits on `exp/geometry-lock` only, no push; messages `type(scope): summary` ending with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`; `pnpm lint` passes before each commit.

## Review Focus

1. A column that failed to compile, or has no file (H outside Chinese): the page shows why in that column, never a broken image — owned by Task 5 (`visual-eval-view-cases.mjs`, locked column failed).
2. Columns of different lengths (Today 32 pages against 31): the whole-paper rows run to their own length and the page view shows "no page N" — Task 5 (original 2 pages, today 3).
3. A column whose marks cannot be read, so its numbers have no units: the list shows "—", never `NaN%` — Task 5 (today with `units: 0`).
4. A paper Microsoft could not translate whole: its header says how many units stay in English — Task 3 writes `translation.untranslated`, Task 5 checks the text.
5. A sync point at a run-in `\paragraph` head or a list item: the head must not be set alone and every later unit still meets its page — Task 1's TeX case has both.

---

### Task 1: The lock module

**Files:**
- Delete: `experiments/pdf-bilingual/spikes/geometry-lock.mjs`, `experiments/pdf-bilingual/spikes/geometry-lock2.mjs`, `experiments/pdf-bilingual/spikes/prompt-ablation.mjs` (untracked spikes; copies are kept in the research directory)
- Create: `experiments/pdf-bilingual/spikes/lock.mjs`
- Test: `experiments/pdf-bilingual/spikes/lock-cases.mjs`

**Interfaces:**
- Consumes: `MARK_DEF`, `markUnits`, `patch`, `latin1`, `latin1Bytes`, `FORBIDDEN_TO_WARNING`, `XETEX_SHIM`, `XETEX_SHIM_R1`, `stripPdftexOption` from `src/pdf-reader/engine/latex-front.mjs`; a paper from `live.mjs` `openPaper(files)` → `{ fsys, meta, project, units, kept }`.
- Produces:
  - `SYNC_TEX: string`, `LINES_TEX: string`, `unitLeadTex(em: number): string`
  - `theoremEnvs(files: Map<string, Uint8Array>): string[]`
  - `originalProbeFiles(paper, theorems: string[]): Map<string, Uint8Array>`
  - `lockedFiles(paper, translated: Map<unit, pieces>, { strategy, fonts, em, leads?: Map<number, number>, targets?: Map<string, {page, col, total}>, theorems }): Map<string, Uint8Array>`
  - `readTargets(log): Map<string, {page: number, col: number, total: number}>`, `readLines(log): Map<number, {lines, bs}>`, `readLockEvents(log): { breaks: {page}[], gaps: {page, pt}[] }` (pages 1-based)
  - `marksOf(file): Promise<{ pages, width, twoColumn, marks: Map<string, {page, x, y}> }>` (page 0-based)
  - `heights(units, m, lines?): Map<number, {page, x, y, hy, hl}>`, `pairOf(o, t): [number, number] | null`
  - `tightenedLeads(orig, tr, { em, min }): Map<number, number>`
  - `compare(units, orig, tm): { pages, units, samePage, within10pt, captions, captionsSamePage, offPage: {i, page, origPage}[] }`

- [ ] **Step 1: Set up the worktree**

```bash
cd /Users/cheongzhiyan/Developer/ArxivTranslate/.worktrees/geometry-lock
pnpm install --frozen-lockfile
(cd experiments/pdf-bilingual && npm install)
rm experiments/pdf-bilingual/spikes/geometry-lock.mjs experiments/pdf-bilingual/spikes/geometry-lock2.mjs experiments/pdf-bilingual/spikes/prompt-ablation.mjs
ls experiments/pdf-bilingual/data/corpus/2608.24839   # arxiv.pdf source.gz (the corpus link made on 2026-09-27)
docker image inspect texlive/texlive:latest --format '{{.Id}}' | head -c 20
```
Expected: installs finish; the corpus lists `arxiv.pdf` and `source.gz`; the image id prints.

- [ ] **Step 2: Write the failing cases**

```js
// experiments/pdf-bilingual/spikes/lock-cases.mjs
// Cases for lock.mjs: the log readers, heights, the leading of units that grew, and the TeX itself — a two-column
// document whose translation is shorter must start every unit on the page and in the column the original did, with a
// run-in \paragraph head and a list among the units. Exits non-zero on a failure.
//   node experiments/pdf-bilingual/spikes/lock-cases.mjs
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MARK_DEF } from '../../../src/pdf-reader/engine/latex-front.mjs'
import { heights, LINES_TEX, marksOf, readLines, readLockEvents, readTargets, SYNC_TEX, tightenedLeads, unitLeadTex } from './lock.mjs'

let failed = 0
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`) }

// log readers
const log = 'x\nAXT-AT 3 0 1 346.0pt\nAXT-AT h2 1 2 12.5pt\nAXT-LINES 3 4 11.0pt\nAXT-BREAK 4\nAXT-GAP 5 30.5pt\n'
const t = readTargets(log)
check('targets read', t.size === 2 && JSON.stringify(t.get('h2')) === JSON.stringify({ page: 1, col: 2, total: 12.5 }), JSON.stringify([...t]))
check('lines read', JSON.stringify(readLines(log).get(3)) === JSON.stringify({ lines: 4, bs: 11 }))
const ev = readLockEvents(log)
check('events read, pages 1-based', ev.breaks[0]?.page === 5 && ev.gaps[0]?.page === 6 && ev.gaps[0]?.pt === 30.5, JSON.stringify(ev))

// heights: one column split, one within a column; line-count height where the marks cannot tell
const units = [{ pieces: [] }, { pieces: [] }]
const m = { width: 612, twoColumn: true, marks: new Map([['0s', { page: 0, x: 60, y: 700 }], ['0e', { page: 0, x: 250, y: 650 }], ['1s', { page: 0, x: 60, y: 100 }], ['1e', { page: 0, x: 400, y: 700 }]]) }
const h = heights(units, m, new Map([[1, { lines: 5, bs: 12 }]]))
check('height within a column', h.get(0).hy === 50)
check('height across columns by lines', h.get(1).hy === null && Math.abs(h.get(1).hl - (4 * 12 * 72) / 72.27) < 1e-9)

// leading of units that grew
const orig = new Map([[0, { hy: 100 }], [1, { hy: 100 }], [2, { hy: 100 }]])
const tr = new Map([[0, { hy: 130 }], [1, { hy: 110 }], [2, { hy: 90 }]])
const leads = tightenedLeads(orig, tr, { em: 1.3, min: 1.1 })
check('floor holds', leads.get(0) === 1.1)
check('proportional', Math.abs(leads.get(1) - 1.3 * 100 / 110) < 1e-9)
check('shorter units untouched', !leads.has(2))

// the TeX: original with probes, translation shorter, locked with the original's targets
const dir = mkdtempSync(join(tmpdir(), 'lock-cases-'))
const unit = (i, text, tr) => `${tr ? `\\axtsync{${i}}\\axtlines{${i}}\\axtlead{${i}}` : `\\axtat{${i}}\\axtlines{${i}}`}\\leavevmode\\axtmark{${i}s}${text}\\axtend{${i}e}\n\n`
const body = tr => {
  let s = ''
  for (let i = 0; i < 14; i++) {
    if (i % 5 === 0) s += `\\section{Part ${i}}\n`
    if (i === 7) s += '\\paragraph{Run-in head.}\n'
    // the last unit is the same short line in both, so that the original's last page never holds only its overflow
    s += unit(i, i === 13 ? 'The end.' : tr ? `\\lipsum[${i + 1}][1-2]` : `\\lipsum[${i + 1}]`, tr)
    if (i === 10) s += `\\begin{itemize}\n\\item ${unit(100, tr ? 'Short item.' : '\\lipsum[20][1-3]', tr)}\\end{itemize}\n`
  }
  return s
}
const doc = (tr, table = '') => `${MARK_DEF}${LINES_TEX}${SYNC_TEX}${tr ? unitLeadTex(1.3) : ''}\\axtsyncpoints{theorem}\n${table}\n\\documentclass[twocolumn]{article}\n\\usepackage{lipsum}\n\\begin{document}\n${body(tr)}\\end{document}\n`
const tex = (name, src) => {
  writeFileSync(join(dir, `${name}.tex`), src)
  try { execFileSync('docker', ['run', '--rm', '--network', 'none', '-v', `${dir}:/work`, '-w', '/work', 'texlive/texlive:latest', 'pdflatex', '-interaction=nonstopmode', `${name}.tex`], { stdio: 'ignore' }) } catch {}
  return readFileSync(join(dir, `${name}.log`), 'latin1')
}
const targets = readTargets(tex('original', doc(false)))
const table = '\\makeatletter\n' + [...targets].map(([i, x]) => `\\expandafter\\def\\csname axt@t@${i}\\endcsname{{${x.page}}{${x.col}}{${x.total}pt}}`).join('\n') + '\n\\makeatother'
const lockedLog = tex('locked', doc(true, table))
const [om, lm] = [await marksOf(join(dir, 'original.pdf')), await marksOf(join(dir, 'locked.pdf'))]
const col = (mm, x) => (mm.twoColumn && x >= mm.width / 2 ? 1 : 0)
const off = [...om.marks].filter(([k]) => k.endsWith('s')).filter(([k, o]) => { const l = lm.marks.get(k); return !l || l.page !== o.page || col(lm, l.x) !== col(om, o.x) })
check('targets recorded for units and headings', targets.size >= 15 && [...targets.keys()].some(k => k.startsWith('h')), `${targets.size}`)
check('every unit starts where the original did', off.length === 0, off.map(([k]) => k).join(' '))
check('same page count', lm.pages === om.pages, `${lm.pages} vs ${om.pages}`)
check('the lock inserted space', readLockEvents(lockedLog).gaps.length > 0)
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
```

- [ ] **Step 3: Run the cases to see them fail**

Run: `pnpm exec tsx experiments/pdf-bilingual/spikes/lock-cases.mjs`
Expected: an import error — `lock.mjs` does not exist.

- [ ] **Step 4: Write the module**

```js
// experiments/pdf-bilingual/spikes/lock.mjs
// The geometry lock (plans/2026-09-27-geometry-lock-visual-eval-design.md). TeX that records, in the original's compile,
// where every unit and every heading, theorem-like environment, list item and float starts — page, column and
// \pagetotal — and makes the translation start each of them there again; a unit's line count at its paragraph's end;
// leading local to translated units. And the measurements: marks read from a PDF, unit heights, the leading a unit
// that grew is set at, and how far a compile is from the original.
import { readFileSync } from 'node:fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { FORBIDDEN_TO_WARNING, latin1, latin1Bytes, MARK_DEF, markUnits, patch, stripPdftexOption, XETEX_SHIM, XETEX_SHIM_R1 } from '../../../src/pdf-reader/engine/latex-front.mjs'

/**
 * Sync points. \axtat logs page (shipouts so far), column and \pagetotal in outer vertical mode; \axtsync, given the
 * original's point as \axt@t@<name>, ends the column while behind it (at most three times, never while floats wait,
 * whose float page would overshoot) and then \vspace*s up to the same \pagetotal (a \vspace* is kept at a column's
 * top). Skipped while a run-in head, a list label or a heading's no-break is pending: \newpage there sets the head
 * alone. \axtsyncpoints{envs} puts a point before every sectioning command, the given environments, \item and float.
 * AXT-BREAK and AXT-GAP lines record what the lock did, for the evaluation's suspicious pages.
 */
export const SYNC_TEX = String.raw`\makeatletter
\newcount\axt@pages \newcount\axt@rel \newcount\axt@h
\AddToHook{shipout/after}{\global\advance\axt@pages\@ne}
\def\axt@col{\if@twocolumn\if@firstcolumn1\else2\fi\else1\fi}
\protected\def\axtat#1{\ifvmode\ifinner\else\par\message{^^JAXT-AT #1 \the\axt@pages\space\axt@col\space\the\pagetotal^^J}\fi\fi}
\def\axt@cmp#1#2{\axt@rel=0 \ifnum\axt@pages<#1 \axt@rel=-1 \else\ifnum\axt@pages>#1 \axt@rel=1 \else\ifnum\axt@col<#2 \axt@rel=-1 \else\ifnum\axt@col>#2 \axt@rel=1 \fi\fi\fi\fi}
\def\axt@step#1#2{\ifnum\axt@rel<0 \ifx\@deferlist\@empty\message{^^JAXT-BREAK \the\axt@pages^^J}\newpage\axt@cmp{#1}{#2}\else\axt@rel=2 \fi\fi}
\def\axt@sync#1#2#3{\axt@cmp{#1}{#2}\axt@step{#1}{#2}\axt@step{#1}{#2}\axt@step{#1}{#2}%
\ifnum\axt@rel=0 \ifdim\pagetotal<\dimexpr#3-0.5pt\relax\message{^^JAXT-GAP \the\axt@pages\space\the\dimexpr#3-\pagetotal\relax^^J}\vspace*{\dimexpr#3-\pagetotal\relax}\fi\fi}
\protected\def\axtsync#1{\ifvmode\ifinner\else\if@noskipsec\else\if@inlabel\else\if@nobreak\else\ifcsname axt@t@#1\endcsname\par\expandafter\expandafter\expandafter\axt@sync\csname axt@t@#1\endcsname\fi\fi\fi\fi\fi\fi}
\def\axt@hook{\ifhmode\if@noskipsec\else\par\fi\fi\global\advance\axt@h\@ne\axtat{h\the\axt@h}\axtsync{h\the\axt@h}}
\protected\def\axtsyncpoints#1{\AtBeginDocument{\AddToHook{cmd/section/before}{\axt@hook}\AddToHook{cmd/subsection/before}{\axt@hook}\AddToHook{cmd/subsubsection/before}{\axt@hook}\AddToHook{cmd/paragraph/before}{\axt@hook}\AddToHook{cmd/subparagraph/before}{\axt@hook}\@for\axt@e:=#1\do{\AddToHook{env/\axt@e/before}{\axt@hook}}\AddToHook{cmd/item/before}{\ifvmode\axt@hook\fi}\AddToHook{cmd/@float/before}{\ifvmode\axt@hook\fi}\AddToHook{cmd/@dblfloat/before}{\ifvmode\axt@hook\fi}}}
\makeatother
`

/** a unit's line count and leading at its paragraph's end, in the log. Through \message: \typeout reads \prevgraf as 0 */
export const LINES_TEX = String.raw`\protected\def\axtlines#1{\ifdefined\AddToHookNext\AddToHookNext{para/after}{\message{^^JAXT-LINES #1 \the\prevgraf\space\the\baselineskip^^J}}\fi}
`

/** baselines `em` × the font size inside translated units alone (or \axtlead@<unit>'s factor), the paper's after */
export const unitLeadTex = em => String.raw`\makeatletter\protected\def\axtlead#1{\ifdefined\AddToHookNext\edef\axt@bs{\the\baselineskip}\baselineskip=\ifcsname axtlead@#1\endcsname\csname axtlead@#1\endcsname\else ` + em + String.raw`\fi\dimexpr\f@size pt\relax\AddToHookNext{para/after}{\baselineskip=\axt@bs\relax}\fi}\makeatother
`

/** the theorem-like environments whose heads are run-in: the usual names and every \newtheorem of the paper */
export const theoremEnvs = files => [...new Set(['theorem', 'lemma', 'corollary', 'proposition', 'definition', 'remark', 'example', 'proof', 'claim', 'conjecture', 'assumption', ...[...files].filter(([p]) => /\.(tex|sty|cls)$/i.test(p)).flatMap(([, b]) => [...latin1(b).matchAll(/\\newtheorem\*?\s*\{([^}]+)\}/g)].map(m => m[1].trim()))])]

/** the original with unit marks, line probes and sync probes: the lock's target */
export function originalProbeFiles({ project, units }, theorems) {
  const index = new Map(units.map((u, i) => [u, i]))
  const base = markUnits(units)
  const files = patch(project, new Map(), { mark: u => { const m = base(u); return m && { start: `\\axtat{${index.get(u)}}\\axtlines{${index.get(u)}}${m.start}`, end: m.end } } })
  files.set(project.main, latin1Bytes(MARK_DEF + LINES_TEX + SYNC_TEX + `\\axtsyncpoints{${theorems.join(',')}}\n` + latin1(files.get(project.main))))
  return files
}

/** the translation, locked: the strategy's global leading replaced by unit-local leading, every unit synced */
export function lockedFiles({ fsys, meta, project, units }, translated, { strategy, fonts, em, leads = new Map(), targets = new Map(), theorems }) {
  const index = new Map(units.map((u, i) => [u, i]))
  const base = markUnits(units)
  const mark = u => { const m = base(u); if (!m) return m; const i = index.get(u); return { start: `\\axtsync{${i}}\\axtlines{${i}}\\axtlead{${i}}${m.start}`, end: m.end } }
  const files = patch(project, translated, { mark })
  let main = latin1(files.get(project.main))
  const at = main.search(/\\begin\s*\{document\}/)
  const pre = strategy.pre(fonts).replace(/\\expanded\{\\noexpand\\linespread\{\\fpeval\{[^\n]*\n/, '')
  main = main.slice(0, at) + FORBIDDEN_TO_WARNING + pre + main.slice(at)
  if (strategy.xe && strategy.engine !== meta.compiler) main = XETEX_SHIM + XETEX_SHIM_R1 + stripPdftexOption(main)
  const table = [
    ...[...targets].map(([i, t]) => `\\expandafter\\def\\csname axt@t@${i}\\endcsname{{${t.page}}{${t.col}}{${t.total}pt}}`),
    ...[...leads].map(([i, f]) => `\\expandafter\\def\\csname axtlead@${i}\\endcsname{${f.toFixed(4)}}`),
  ].join('\n')
  main = MARK_DEF + LINES_TEX + SYNC_TEX + unitLeadTex(em) + `\\axtsyncpoints{${theorems.join(',')}}\n` + table + '\n' + main
  files.set(project.main, latin1Bytes(main))
  if (strategy.xe && strategy.engine !== meta.compiler) for (const f of fsys.list()) if (/\.(tex|sty|cls)$/i.test(f) && f !== project.main) { const t = latin1(files.get(f) ?? fsys.read(f)), s = stripPdftexOption(t); if (s !== t) files.set(f, latin1Bytes(s)) }
  return files
}

export const readTargets = log => new Map([...log.matchAll(/^AXT-AT (h?\d+) (\d+) (\d+) ([\d.]+)pt/gm)].map(m => [m[1], { page: Number(m[2]), col: Number(m[3]), total: Number(m[4]) }]))
export const readLines = log => new Map([...log.matchAll(/^AXT-LINES (\d+) (\d+) ([\d.]+)pt/gm)].map(m => [Number(m[1]), { lines: Number(m[2]), bs: Number(m[3]) }]))
export const readLockEvents = log => ({
  breaks: [...log.matchAll(/^AXT-BREAK (\d+)/gm)].map(m => ({ page: Number(m[1]) + 1 })),
  gaps: [...log.matchAll(/^AXT-GAP (\d+) (-?[\d.]+)pt/gm)].map(m => ({ page: Number(m[1]) + 1, pt: Number(m[2]) })),
})

/** every axt-<n>s / axt-<n>e destination (page 0-based, PDF points), the page width, and whether units start in two columns */
export async function marksOf(file) {
  const pdf = await getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 }).promise
  const dests = await pdf.getDestinations()
  const marks = new Map()
  for (const [name, d] of dests instanceof Map ? dests : Object.entries(dests)) if (/^axt-\d+[se]$/.test(name) && d) marks.set(name.slice(4), { page: await pdf.getPageIndex(d[0]), x: d[2], y: d[3] })
  const [x0, , x1] = (await pdf.getPage(1)).view
  const width = x1 - x0, pages = pdf.numPages
  await pdf.destroy()
  const starts = [...marks].filter(([k]) => k.endsWith('s'))
  return { pages, width, twoColumn: starts.length > 0 && starts.filter(([, s]) => s.x >= width / 2).length >= 0.2 * starts.length, marks }
}

const DISPLAY = /^(\$\$|\\\[|\\begin\s*\{(equation|align|gather|multline|eqnarray|displaymath|flalign|alignat|dmath))/
const hasDisplay = u => u.pieces.some(p => p.t === 'ph' && DISPLAY.test(p.src))
/** unit index → its start and its height: first to last baseline where both marks are on one page and in one column
 *  (hy), else its line count times its leading (hl) for a unit without display math, which \prevgraf counts as three lines */
export function heights(units, m, lines = new Map()) {
  const col = x => (m.twoColumn && x >= m.width / 2 ? 1 : 0)
  const out = new Map()
  for (let i = 0; i < units.length; i++) {
    const s = m.marks.get(`${i}s`), e = m.marks.get(`${i}e`)
    if (!s || !e) continue
    const simple = s.page === e.page && col(s.x) === col(e.x) && s.y >= e.y - 0.5
    const l = lines.get(i)
    const hl = l && l.lines >= 1 && !hasDisplay(units[i]) ? ((l.lines - 1) * l.bs * 72) / 72.27 : null
    out.set(i, { page: s.page, x: s.x, y: s.y, hy: simple ? s.y - e.y : null, hl })
  }
  return out
}
/** one unit's heights in two compiles, measured the same way in both */
export const pairOf = (o, t) => (o?.hy != null && t?.hy != null ? [o.hy, t.hy] : o?.hl != null && t?.hl != null ? [o.hl, t.hl] : null)

/** the leading (× font size) a unit the translation made taller is set at next: baselines drawn closer in proportion,
 *  down to `min`; its lines break where they did, since leading moves no line break */
export function tightenedLeads(orig, tr, { em, min }) {
  const leads = new Map()
  for (const [i, o] of orig) {
    const hh = pairOf(o, tr.get(i))
    if (hh && hh[1] > hh[0] + 0.01 && hh[1] > 0) leads.set(i, Math.max(min, (em * hh[0]) / hh[1]))
  }
  return leads
}

/** how far a compile is from the original: each marked unit's start on the same page, within 10 pt; captions apart */
export function compare(units, orig, tm) {
  const tr = heights(units, tm)
  const rows = []
  for (const [i, o] of orig) {
    const t = tr.get(i)
    if (t) rows.push({ i, kind: units[i].kind, page: t.page, origPage: o.page, samePage: o.page === t.page, dy: o.page === t.page ? Math.abs(o.y - t.y) : null })
  }
  const caps = rows.filter(r => r.kind === 'caption')
  return {
    pages: tm.pages, units: rows.length, samePage: rows.filter(r => r.samePage).length, within10pt: rows.filter(r => r.samePage && r.dy <= 10).length,
    captions: caps.length, captionsSamePage: caps.filter(r => r.samePage).length,
    offPage: rows.filter(r => !r.samePage).map(({ i, page, origPage }) => ({ i, page, origPage })),
  }
}
```

- [ ] **Step 5: Run the cases to see them pass**

Run: `pnpm exec tsx experiments/pdf-bilingual/spikes/lock-cases.mjs`
Expected: every line `ok`, last line `all passed`, exit code 0. If "every unit starts where the original did" fails, print both PDFs' marks for the listed units and fix the TeX before going on; do not weaken the check.

- [ ] **Step 6: Lint and commit**

```bash
pnpm lint
git add experiments/pdf-bilingual/spikes/lock.mjs experiments/pdf-bilingual/spikes/lock-cases.mjs
git commit -m "feat(pdf-bilingual): the geometry lock as a module, with its cases

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Suspicious pages and catalog entries

**Files:**
- Create: `experiments/pdf-bilingual/spikes/visual-eval-lib.mjs`
- Test: `experiments/pdf-bilingual/spikes/visual-eval-cases.mjs`

**Interfaces:**
- Consumes: `readLockEvents` output `{ breaks, gaps }`, `compare(...)` output, `marksOf(...)` output (Task 1).
- Produces:
  - constants `LANGS: string[]`, `PARAMS: Record<lang, {em, min}>`, `PAPERS: Record<lang, string[]>`, `COLUMNS: {key, label}[]`, `GAP_PT = 24`
  - `suspiciousPages({ events, leads, min, lockedMarks, lockedCompare }): {page, kind, detail}[]` (pages 1-based, sorted, one entry per page and kind)
  - `overfullCount(log): number`
  - `catalogEntry(index): { paper, cls, pages: Record<column, number|null>, today, locked, failed, flags, untranslated }`

- [ ] **Step 1: Write the failing cases**

```js
// experiments/pdf-bilingual/spikes/visual-eval-cases.mjs
// Cases for visual-eval-lib.mjs: suspicious pages and catalog entries. Exits non-zero on a failure.
//   node experiments/pdf-bilingual/spikes/visual-eval-cases.mjs
import { catalogEntry, COLUMNS, overfullCount, PAPERS, PARAMS, suspiciousPages } from './visual-eval-lib.mjs'

let failed = 0
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`) }

check('corpus sizes', PAPERS.zh.length === 25 && ['ja', 'ko', 'de', 'ru'].every(l => PAPERS[l].length === 8))
check('parameters per language', PARAMS.zh.em === 1.3 && PARAMS.ja.min === 1.05 && PARAMS.de.em === 1.05 && PARAMS.ru.min === 1)
check('column labels', COLUMNS.map(c => c.label).join() === 'Original,Today,Locked,H')

const s = suspiciousPages({
  events: { breaks: [{ page: 4 }], gaps: [{ page: 2, pt: 10 }, { page: 3, pt: 40 }, { page: 3, pt: 30 }] },
  leads: new Map([[7, 1.1], [8, 1.25]]),
  min: 1.1,
  lockedMarks: { marks: new Map([['7s', { page: 5, x: 0, y: 0 }], ['8s', { page: 6, x: 0, y: 0 }]]) },
  lockedCompare: { offPage: [{ i: 9, page: 8, origPage: 7 }] },
})
check('small gaps ignored', !s.some(x => x.page === 2))
check('one entry per page and kind', s.filter(x => x.page === 3).length === 1, JSON.stringify(s))
check('kinds found', ['forced break', 'large gap', 'tight leading', 'drift'].every(k => s.some(x => x.kind === k)), JSON.stringify(s))
check('pages 1-based and sorted', JSON.stringify(s.map(x => x.page)) === JSON.stringify([3, 4, 6, 9]), JSON.stringify(s.map(x => x.page)))
check('overfull counted', overfullCount('Overfull \\vbox (3pt too high) has occurred while \\output is active\nOverfull \\hbox (1pt too wide)\nOverfull \\vbox (1pt too high)\n') === 2)

const entry = catalogEntry({ paper: 'p', cls: 'article', columns: [{ key: 'original', pages: 10 }, { key: 'today', pages: 11 }, { key: 'locked', pages: null }], numbers: { today: { units: 0, samePage: 0 } }, failed: { locked: '! Undefined control sequence.' }, flags: [], translation: { untranslated: 3 } })
check('failed column kept, numbers null', entry.pages.locked === null && entry.locked === null && entry.failed.locked.startsWith('!'))
check('untranslated carried', entry.untranslated === 3)
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
```

- [ ] **Step 2: Run the cases to see them fail**

Run: `node experiments/pdf-bilingual/spikes/visual-eval-cases.mjs`
Expected: an import error — `visual-eval-lib.mjs` does not exist.

- [ ] **Step 3: Write the library**

```js
// experiments/pdf-bilingual/spikes/visual-eval-lib.mjs
// The visual evaluation's corpus, parameters and checks (plans/2026-09-27-geometry-lock-visual-eval-design.md): the
// locked column's suspicious pages and the catalog's entries. Pure: no files, no TeX.
export const LANGS = ['zh', 'ja', 'ko', 'de', 'ru']
/** unit leading and its floor, × the font size, per writing system */
export const PARAMS = { zh: { em: 1.3, min: 1.1 }, ja: { em: 1.2, min: 1.05 }, ko: { em: 1.2, min: 1.05 }, de: { em: 1.05, min: 1 }, ru: { em: 1.05, min: 1 } }
const GATE = ['2608.02163', '2608.05876', '2608.09746', '2608.12333', '2608.18090', '2608.23393', '2608.26528', '2608.29867', '2608.06701', '2608.15016', '2608.25750', '2608.06233', '2608.20847', '2608.23586', '2608.06007', '2608.24839', '2608.02785', '2608.24503', '2608.21180', '2608.15761', '2608.25928', '2608.09038', '2608.02991', '2608.12606']
const EIGHT = ['2608.05876', '2608.18090', '2608.06701', '2608.24839', '2608.02785', '2608.21180', '2608.15761', '2608.06233']
export const PAPERS = { zh: ['2212.06817', ...GATE], ja: EIGHT, ko: EIGHT, de: EIGHT, ru: EIGHT }
export const COLUMNS = [{ key: 'original', label: 'Original' }, { key: 'today', label: 'Today' }, { key: 'locked', label: 'Locked' }, { key: 'h', label: 'H' }]
/** a sync point's inserted space worth a look: about two lines */
export const GAP_PT = 24

/** the locked column's pages worth a look, one entry per page and kind, in page order (pages 1-based) */
export function suspiciousPages({ events, leads, min, lockedMarks, lockedCompare }) {
  const out = []
  for (const b of events.breaks) out.push({ page: b.page, kind: 'forced break', detail: 'a sync point ended the column or page here' })
  for (const g of events.gaps) if (g.pt > GAP_PT) out.push({ page: g.page, kind: 'large gap', detail: `${Math.round(g.pt)} pt inserted` })
  for (const [i, f] of leads) {
    const m = lockedMarks.marks.get(`${i}s`)
    if (m && f <= min + 0.02) out.push({ page: m.page + 1, kind: 'tight leading', detail: `unit ${i} at ${f.toFixed(2)} × the font size` })
  }
  for (const r of lockedCompare.offPage) out.push({ page: r.page + 1, kind: 'drift', detail: `unit ${r.i} is here, on page ${r.origPage + 1} in the original` })
  const seen = new Set()
  return out.filter(x => { const k = `${x.page} ${x.kind}`; if (seen.has(k)) return false; seen.add(k); return true }).sort((a, b) => a.page - b.page || a.kind.localeCompare(b.kind))
}

/** overfull vertical boxes in a TeX log: content taller than its page or column */
export const overfullCount = log => (log.match(/^Overfull \\vbox/gm) ?? []).length

/** a paper's line in the catalog: page counts per column, the two compiles' numbers, what failed */
export function catalogEntry(index) {
  return {
    paper: index.paper, cls: index.cls,
    pages: Object.fromEntries(index.columns.map(c => [c.key, c.pages ?? null])),
    today: index.numbers?.today ?? null, locked: index.numbers?.locked ?? null,
    failed: index.failed ?? {}, flags: index.flags ?? [], untranslated: index.translation?.untranslated ?? 0,
  }
}
```

- [ ] **Step 4: Run the cases to see them pass**

Run: `node experiments/pdf-bilingual/spikes/visual-eval-cases.mjs`
Expected: every line `ok`, `all passed`, exit code 0.

- [ ] **Step 5: Lint and commit**

```bash
pnpm lint
git add experiments/pdf-bilingual/spikes/visual-eval-lib.mjs experiments/pdf-bilingual/spikes/visual-eval-cases.mjs
git commit -m "feat(pdf-bilingual): the visual evaluation's corpus, parameters and checks

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The generator

**Files:**
- Create: `experiments/pdf-bilingual/spikes/visual-eval.mjs`

**Interfaces:**
- Consumes: Task 1's `originalProbeFiles`, `lockedFiles`, `theoremEnvs`, `readTargets`, `readLines`, `readLockEvents`, `marksOf`, `heights`, `tightenedLeads`, `compare`; Task 2's `PARAMS`, `PAPERS`, `COLUMNS`, `suspiciousPages`, `overfullCount`, `catalogEntry`; the engine's `openPaper`, `probeFiles`, `translationFiles`, `lostIn` (`live.mjs`), `readFontProbe`, `latin1` (`latex-front.mjs`), `strategiesFor` (`scripts.mjs`), `translateUnits`, `translateTexts` (`mt.mjs`), `unpackSource` (`tar.mjs`), `faithfulDockerArgs` (`spikes/faithful.mjs`).
- Produces, per paper, `data/runs/visual-eval/<lang>/<paper>/`: `original.pdf`, `today.pdf`, `locked.pdf`, `translation.json`, `pages/<column>-<n>.jpg`, `thumbs/<column>-<n>.jpg`, and `index.json`:

```json
{ "lang": "zh", "paper": "2608.24839", "cls": "acmart",
  "columns": [{ "key": "original", "label": "Original", "pages": 7 }, { "key": "today", "label": "Today", "pages": 7 }, { "key": "locked", "label": "Locked", "pages": 7 }],
  "numbers": { "today": { "pages": 7, "units": 58, "samePage": 49, "within10pt": 3, "captions": 16, "captionsSamePage": 12 }, "locked": { "…": "same shape" } },
  "translation": { "units": 140, "untranslated": 0 },
  "failed": {}, "flags": [], "lostExtra": [], "overfull": 0,
  "suspicious": [{ "page": 3, "kind": "large gap", "detail": "31 pt inserted" }] }
```

  `flags` holds `original-mismatch` when our compile of the original has a different page count from arXiv's. The catalog `data/runs/visual-eval/index.json` is `{ "langs": { "zh": [catalogEntry, …], … } }`.
  CLI: `pnpm exec tsx experiments/pdf-bilingual/spikes/visual-eval.mjs <lang> <paper>…` generates; `--reindex` renders and re-indexes existing PDFs without compiling (for `h.pdf`); `--catalog` rebuilds the catalog.

- [ ] **Step 1: Write the generator**

```js
// experiments/pdf-bilingual/spikes/visual-eval.mjs
// The visual evaluation's generator (plans/2026-09-27-geometry-lock-visual-eval-design.md): for a paper and a language,
// the translation once through Microsoft's free engine (the reader's wire), today's typesetting and the locked one
// compiled natively in Docker, every page rendered, the checks, and the paper's index; then the catalog.
//   pnpm exec tsx experiments/pdf-bilingual/spikes/visual-eval.mjs <lang> <paper>...   generate
//   pnpm exec tsx experiments/pdf-bilingual/spikes/visual-eval.mjs <lang> <paper>... --reindex   render and index existing PDFs
//   pnpm exec tsx experiments/pdf-bilingual/spikes/visual-eval.mjs --catalog
import { execFile, execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { unpackSource } from '../../../src/pdf-reader/engine/tar.mjs'
import { lostIn, openPaper, probeFiles, translationFiles } from '../../../src/pdf-reader/engine/live.mjs'
import { latin1, readFontProbe } from '../../../src/pdf-reader/engine/latex-front.mjs'
import { strategiesFor } from '../../../src/pdf-reader/engine/scripts.mjs'
import { translateTexts, translateUnits } from '../../../src/pdf-reader/engine/mt.mjs'
import { faithfulDockerArgs } from './faithful.mjs'
import { compare, heights, lockedFiles, marksOf, originalProbeFiles, readLines, readLockEvents, readTargets, theoremEnvs, tightenedLeads } from './lock.mjs'
import { catalogEntry, COLUMNS, overfullCount, PARAMS, suspiciousPages } from './visual-eval-lib.mjs'

const run = promisify(execFile)
const root = new URL('..', import.meta.url).pathname
const OUT = join(root, 'data/runs/visual-eval')
const argv = process.argv.slice(2)
const firstError = log => (log.match(/^(?:\S+:\d+: .*|! .*)$/m)?.[0] ?? 'no PDF').slice(0, 200)

async function compile(work, name, paper, files, overrides, { engine, rerun }) {
  const dir = join(work, name)
  rmSync(dir, { recursive: true, force: true })
  for (const [p, b] of files) { const f = join(dir, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, b) }
  for (const [p, b] of overrides) { const f = join(dir, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, b) }
  const { project, meta } = paper
  const stem = project.main.split('/').pop().replace(/\.[^./]+$/, '')
  const docker = cmd => run('docker', ['run', '--rm', '--init', '--network', 'none', '--cpus', '2', '--memory', '3g', ...faithfulDockerArgs(root), '-v', `${dir}:/work`, '-w', '/work', 'texlive/texlive:latest', 'timeout', '300', ...cmd], { maxBuffer: 1 << 26 }).catch(() => null)
  if (rerun) await docker(['latexmk', { xelatex: '-xelatex', lualatex: '-lualatex' }[engine] ?? '-pdf', ...(meta.bbl ? ['-bibtex-'] : []), '-interaction=nonstopmode', '-f', project.main])
  else await docker([engine, '-interaction=nonstopmode', project.main])
  const pdf = join(dir, `${stem}.pdf`), log = join(dir, `${stem}.log`)
  return { ok: existsSync(pdf), pdf, log: existsSync(log) ? readFileSync(log, 'latin1') : '' }
}

/** every page of a column: 144 dpi into pages/, 24 dpi into thumbs/, named <column>-<n>.jpg */
function render(dir, key) {
  for (const [sub, dpi] of [['pages', 144], ['thumbs', 24]]) {
    const d = join(dir, sub)
    mkdirSync(d, { recursive: true })
    for (const f of readdirSync(d)) if (f.startsWith(`${key}-`)) rmSync(join(d, f))
    execFileSync('pdftoppm', ['-jpeg', '-jpegopt', 'quality=82', '-r', String(dpi), join(dir, `${key}.pdf`), join(d, key)])
    for (const f of readdirSync(d)) { const m = f.match(new RegExp(`^${key}-0*(\\d+)\\.jpg$`)); if (m) renameSync(join(d, f), join(d, `${key}-${Number(m[1])}.jpg`)) }
  }
}

/** the paper's index from what its directory holds: columns present or failed, rendered, with their page counts */
async function writeIndex(dir, base) {
  const columns = []
  for (const c of COLUMNS) {
    const file = join(dir, `${c.key}.pdf`)
    if (existsSync(file)) { render(dir, c.key); columns.push({ ...c, pages: (await marksOf(file)).pages }) }
    else if (base.failed?.[c.key]) columns.push({ ...c, pages: null })
  }
  const index = { ...base, columns }
  writeFileSync(join(dir, 'index.json'), JSON.stringify(index, null, 1))
  return index
}

async function generate(lang, id) {
  const dir = join(OUT, lang, id), work = join(dir, 'work')
  mkdirSync(work, { recursive: true })
  const t0 = Date.now(), note = (...a) => console.log(`[${lang} ${id} ${Math.round((Date.now() - t0) / 1000)}s]`, ...a)
  copyFileSync(join(root, 'data/corpus', id, 'arxiv.pdf'), join(dir, 'original.pdf'))
  const { files } = await unpackSource(new Uint8Array(readFileSync(join(root, 'data/corpus', id, 'source.gz'))))
  const paper = openPaper(files)
  const { units, meta, project } = paper
  const cls = latin1(files.get(project.main)).match(/\\documentclass\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/)?.[1] ?? '?'
  const base = { lang, paper: id, cls, numbers: {}, failed: {}, flags: [], lostExtra: [], overfull: 0, suspicious: [] }

  // 1. the translation, once: both columns read it
  const cache = join(dir, 'translation.json')
  const translated = new Map()
  if (existsSync(cache)) {
    const c = JSON.parse(readFileSync(cache, 'utf8'))
    for (const { id: i, pieces } of c.pieces) translated.set(units[i], pieces)
    base.translation = c.summary
  } else {
    const todo = units.filter(u => !paper.kept.has(u))
    const { results } = await translateUnits(todo, texts => translateTexts(texts, lang).then(r => r.map(text => (text == null ? null : { text, by: null }))), 'markers')
    for (const [u, r] of results) if (r.pieces) translated.set(u, r.pieces)
    base.translation = { units: todo.length, untranslated: todo.length - translated.size }
    writeFileSync(cache, JSON.stringify({ summary: base.translation, pieces: [...translated].map(([u, pieces]) => ({ id: units.indexOf(u), pieces })) }))
  }
  note('translated', JSON.stringify(base.translation))

  // 2. fonts, the original with probes (the lock's target), today, locked twice
  const fonts = readFontProbe((await compile(work, 'probe', paper, files, probeFiles(paper), { engine: meta.compiler, rerun: false })).log)
  const strategy = strategiesFor(meta, lang)[0]
  const theorems = theoremEnvs(files)
  const o = await compile(work, 'original', paper, files, originalProbeFiles(paper, theorems), { engine: meta.compiler, rerun: true })
  const today = await compile(work, 'today', paper, files, translationFiles(paper, translated, { strategy, fonts, draft: false }), { engine: strategy.engine, rerun: true })
  if (today.ok) copyFileSync(today.pdf, join(dir, 'today.pdf')); else base.failed.today = firstError(today.log)
  note('today', today.ok)
  if (!o.ok) { base.failed.locked = `the original with probes did not compile: ${firstError(o.log)}`; return writeIndex(dir, base) }
  const om = await marksOf(o.pdf), orig = heights(units, om, readLines(o.log)), targets = readTargets(o.log)
  if (om.pages !== (await marksOf(join(dir, 'original.pdf'))).pages) base.flags.push('original-mismatch')
  const { em, min } = PARAMS[lang]
  const opts = { strategy, fonts, em, targets, theorems }
  let locked = await compile(work, 'locked-1', paper, files, lockedFiles(paper, translated, opts), { engine: strategy.engine, rerun: true })
  let leads = new Map()
  if (locked.ok) {
    leads = tightenedLeads(orig, heights(units, await marksOf(locked.pdf), readLines(locked.log)), { em, min })
    if (leads.size) {
      const second = await compile(work, 'locked-2', paper, files, lockedFiles(paper, translated, { ...opts, leads }), { engine: strategy.engine, rerun: true })
      if (second.ok) locked = second; else { base.flags.push('second-pass-failed'); leads = new Map() }
    }
  }
  if (locked.ok) copyFileSync(locked.pdf, join(dir, 'locked.pdf')); else base.failed.locked = firstError(locked.log)
  note('locked', locked.ok, 'tightened', leads.size)

  // 3. numbers and checks
  if (today.ok) base.numbers.today = { ...compare(units, orig, await marksOf(today.pdf)), offPage: undefined }
  if (locked.ok) {
    const lm = await marksOf(locked.pdf), lc = compare(units, orig, lm)
    base.numbers.locked = { ...lc, offPage: undefined }
    base.suspicious = suspiciousPages({ events: readLockEvents(locked.log), leads, min, lockedMarks: lm, lockedCompare: lc })
    base.overfull = overfullCount(locked.log)
    if (today.ok) { const t = lostIn(today.log), l = lostIn(locked.log); base.lostExtra = [...l].filter(([c, n]) => n > (t.get(c) ?? 0)).map(([c]) => c) }
  }
  const index = await writeIndex(dir, base)
  note('done', JSON.stringify({ today: index.numbers.today?.samePage, locked: index.numbers.locked?.samePage, units: index.numbers.locked?.units, suspicious: index.suspicious.length }))
  return index
}

function catalog() {
  const langs = {}
  for (const lang of existsSync(OUT) ? readdirSync(OUT) : []) {
    const d = join(OUT, lang)
    if (!existsSync(join(d)) || lang === 'index.json') continue
    langs[lang] = readdirSync(d).filter(p => existsSync(join(d, p, 'index.json'))).sort().map(p => catalogEntry(JSON.parse(readFileSync(join(d, p, 'index.json'), 'utf8'))))
  }
  writeFileSync(join(OUT, 'index.json'), JSON.stringify({ langs }, null, 1))
  console.log('catalog', Object.entries(langs).map(([l, a]) => `${l} ${a.length}`).join(', '))
}

if (argv.includes('--catalog')) catalog()
else {
  const [lang, ...ids] = argv.filter(a => !a.startsWith('--'))
  if (!PARAMS[lang] || !ids.length) { console.error('usage: visual-eval.mjs <lang> <paper>... [--reindex] | --catalog'); process.exit(2) }
  for (const id of ids) {
    if (argv.includes('--reindex')) { const dir = join(OUT, lang, id); await writeIndex(dir, JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'))) }
    else await generate(lang, id).catch(e => console.error(`[${lang} ${id}] failed:`, e?.stack ?? e))
  }
  catalog()
}
```

- [ ] **Step 2: Run it on one small paper and check the outputs**

Run: `pnpm exec tsx experiments/pdf-bilingual/spikes/visual-eval.mjs zh 2608.24839`
Expected: log lines `translated`, `today true`, `locked true`, `done` within about five minutes, and `catalog zh 1`.

Then:

```bash
D=experiments/pdf-bilingual/data/runs/visual-eval/zh/2608.24839
ls $D/*.pdf                                  # original.pdf locked.pdf today.pdf
node -e 'const i=require(process.argv[1]); console.log(i.columns.map(c=>c.key+":"+c.pages).join(" "), JSON.stringify(i.numbers.locked), i.suspicious.length, JSON.stringify(i.translation))' "$PWD/$D/index.json"
ls $D/pages | wc -l; ls $D/thumbs | wc -l   # both equal to the sum of the three page counts
```
Expected: three columns of 7 pages each (the spike measured 7/7/7 on this paper), `locked.samePage` at least 50 of 58 units (the spike's v2 run gave 54–58), both image counts 21, `untranslated` 0 or small.

- [ ] **Step 3: Lint and commit**

```bash
pnpm lint
git add experiments/pdf-bilingual/spikes/visual-eval.mjs
git commit -m "feat(pdf-bilingual): the visual evaluation's generator

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The page and its server

**Files:**
- Create: `experiments/pdf-bilingual/spikes/serve-eval.mjs`
- Create: `experiments/pdf-bilingual/visual-eval/index.html`
- Test: `experiments/pdf-bilingual/spikes/visual-eval-view-cases.mjs`

**Interfaces:**
- Consumes: the catalog (`data/index.json`) and per-paper `index.json` of Task 3, served at `/data/…`; images at `/data/<lang>/<paper>/thumbs/<column>-<n>.jpg` and `pages/…`; PDFs at `/data/<lang>/<paper>/<column>.pdf`.
- Produces: `node experiments/pdf-bilingual/spikes/serve-eval.mjs [--port=8090] [--data=<dir>]` serving `/` (the page) and `/data/` (the data directory) on 127.0.0.1; the page's flags in `localStorage['axt-eval-flags']`, exported as `flags.json` (`[{ lang, paper, page, note, at }]`).

- [ ] **Step 1: Write the failing check**

```js
// experiments/pdf-bilingual/spikes/visual-eval-view-cases.mjs
// The evaluation page in a real browser over made-up data: languages, papers, the whole-paper rows (a failed column,
// columns of different lengths), the page view (keys, a missing page, a hidden column), numbers with no units, the
// untranslated count, and a flag exported. Exits non-zero on a failure.
//   node experiments/pdf-bilingual/spikes/visual-eval-view-cases.mjs
import { execFileSync, spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'

const root = new URL('..', import.meta.url).pathname
let failed = 0
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`) }

// made-up data: one paper; Original 2 pages, Today 3 (its marks unread: 0 units), Locked failed
const data = mkdtempSync(join(tmpdir(), 'eval-view-')), dir = join(data, 'zh', 'p1')
for (const sub of ['pages', 'thumbs']) mkdirSync(join(dir, sub), { recursive: true })
execFileSync('pdftoppm', ['-jpeg', '-r', '24', '-f', '1', '-l', '1', '-singlefile', join(root, 'data/corpus/2608.15016/arxiv.pdf'), join(data, 'one')])
for (const [key, n] of [['original', 2], ['today', 3]]) for (let p = 1; p <= n; p++) for (const sub of ['pages', 'thumbs']) copyFileSync(join(data, 'one.jpg'), join(dir, sub, `${key}-${p}.jpg`))
const index = { lang: 'zh', paper: 'p1', cls: 'article', columns: [{ key: 'original', label: 'Original', pages: 2 }, { key: 'today', label: 'Today', pages: 3 }, { key: 'locked', label: 'Locked', pages: null }], numbers: { today: { pages: 3, units: 0, samePage: 0, captions: 0, captionsSamePage: 0 } }, failed: { locked: '! Undefined control sequence.' }, flags: [], translation: { units: 10, untranslated: 2 }, suspicious: [{ page: 2, kind: 'large gap', detail: '30 pt inserted' }], lostExtra: [], overfull: 0 }
writeFileSync(join(dir, 'index.json'), JSON.stringify(index))
writeFileSync(join(data, 'index.json'), JSON.stringify({ langs: { zh: [{ paper: 'p1', cls: 'article', pages: { original: 2, today: 3, locked: null }, today: index.numbers.today, locked: null, failed: index.failed, flags: [], untranslated: 2 }] } }))

const server = spawn('node', [join(root, 'spikes/serve-eval.mjs'), '--port=8099', `--data=${data}`], { stdio: 'ignore' })
for (let i = 0; i < 50; i++) { try { await fetch('http://localhost:8099/'); break } catch { await new Promise(r => setTimeout(r, 100)) } }
const browser = await chromium.launch()
try {
  const page = await (await browser.newContext({ acceptDownloads: true })).newPage()
  await page.goto('http://localhost:8099/')
  check('language tab', (await page.locator('#langs button').allTextContents()).join() === 'zh')
  const item = page.locator('#papers .paper', { hasText: 'p1' })
  check('paper listed', (await item.count()) === 1)
  check('no NaN for a column without units', !(await item.textContent()).includes('NaN') && (await item.textContent()).includes('—'))
  await item.click()
  check('untranslated shown', (await page.locator('#view').textContent()).includes('2 units untranslated'))
  check('rows run to their own length', (await page.locator('.row[data-key="today"] img').count()) === 3 && (await page.locator('.row[data-key="original"] img').count()) === 2)
  check('failed column says why', (await page.locator('.row[data-key="locked"]').textContent()).includes('Undefined control sequence'))
  check('suspicious page listed', (await page.locator('.suspicious a').first().textContent()).includes('large gap'))
  await page.locator('.row[data-key="original"] img').first().click()
  const srcs = async () => page.locator('.col img').evaluateAll(els => els.map(e => e.getAttribute('src')))
  check('page view at page 1', (await srcs()).some(s => s.endsWith('original-1.jpg')) && (await srcs()).some(s => s.endsWith('today-1.jpg')))
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight')
  check('page 3: today shown, original missing', (await srcs()).some(s => s.endsWith('today-3.jpg')) && (await page.locator('.col[data-key="original"]').textContent()).includes('no page 3'))
  await page.keyboard.press('2')
  check('column hidden by its number', (await page.locator('.col[data-key="today"]').isHidden()))
  await page.locator('#flag').click()
  await page.locator('#flag-note').fill('a test note')
  await page.locator('#flag-save').click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export').click()])
  const flags = JSON.parse(readFileSync(await download.path(), 'utf8'))
  check('flag exported', flags.length === 1 && flags[0].page === 3 && flags[0].note === 'a test note' && flags[0].paper === 'p1', JSON.stringify(flags))
} finally { await browser.close(); server.kill() }
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
```

- [ ] **Step 2: Run it to see it fail**

Run: `node experiments/pdf-bilingual/spikes/visual-eval-view-cases.mjs`
Expected: failures (no server script, no page). If Chromium is missing: `npx playwright install chromium` once.

- [ ] **Step 3: Write the server**

```js
// experiments/pdf-bilingual/spikes/serve-eval.mjs
// The visual evaluation's page and its data, served on this machine only
// (plans/2026-09-27-geometry-lock-visual-eval-design.md). Files only: / is the page, /data/ the data directory.
//   node experiments/pdf-bilingual/spikes/serve-eval.mjs [--port=8090] [--data=<dir>]
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const opt = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d
const port = Number(opt('port', 8090)), data = resolve(opt('data', join(root, 'data/runs/visual-eval')))
const page = join(root, 'visual-eval/index.html')
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg', '.pdf': 'application/pdf' }
createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
  const file = path === '/' ? page : path.startsWith('/data/') ? resolve(data, normalize(path.slice('/data/'.length))) : null
  if (!file || (file !== page && !file.startsWith(`${data}/`)) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end('not found'); return }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' })
  createReadStream(file).pipe(res)
}).listen(port, '127.0.0.1', () => console.log(`http://localhost:${port}/`))
```

- [ ] **Step 4: Write the page**

```html
<!doctype html>
<!-- The geometry lock's visual evaluation (plans/2026-09-27-geometry-lock-visual-eval-design.md). Served by spikes/serve-eval.mjs. -->
<html lang="en">
<head>
<meta charset="utf-8">
<title>Geometry lock: pages side by side</title>
<style>
:root { --bg: #fafaf9; --fg: #1c1917; --muted: #78716c; --line: #e7e5e4; --accent: #b31b1b; --hl: #fde68a }
@media (prefers-color-scheme: dark) { :root { --bg: #1c1917; --fg: #f5f5f4; --muted: #a8a29e; --line: #44403c; --hl: #854d0e } }
* { box-sizing: border-box }
body { margin: 0; font: 14px/1.4 system-ui, sans-serif; background: var(--bg); color: var(--fg) }
header { display: flex; gap: 12px; align-items: center; padding: 8px 16px; border-bottom: 1px solid var(--line); position: sticky; top: 0; background: var(--bg); z-index: 2 }
header button, #view button { font: inherit; padding: 4px 10px; border: 1px solid var(--line); border-radius: 6px; background: transparent; color: inherit; cursor: pointer }
#langs button.on { border-color: var(--accent); color: var(--accent) }
#flags-count { color: var(--muted) }
main { display: grid; grid-template-columns: 300px 1fr; height: calc(100vh - 45px) }
aside { overflow: auto; border-right: 1px solid var(--line) }
aside select { margin: 8px 12px }
.paper { padding: 8px 12px; border-bottom: 1px solid var(--line); cursor: pointer }
.paper.on { background: var(--line) }
.paper b { display: block }
.paper small { color: var(--muted); display: block }
#view { overflow: auto; padding: 12px 16px }
.head { display: flex; gap: 16px; align-items: baseline; margin-bottom: 8px; color: var(--muted) }
.head h2 { color: var(--fg); margin: 0; font-size: 16px }
.strip { display: grid; gap: 6px; overflow-x: auto; padding-bottom: 8px }
.row { display: flex; gap: 6px; align-items: center }
.row .label, .nums .label { width: 64px; flex: none; color: var(--muted) }
.row img, .row .none { width: 102px; flex: none; border: 1px solid var(--line); background: #fff; cursor: pointer }
.row .none { height: 132px; display: grid; place-items: center; color: var(--muted); background: transparent; cursor: default; font-size: 12px }
.row img.hl { outline: 3px solid var(--hl) }
.row .fail { color: var(--accent) }
.suspicious { margin-top: 12px; columns: 2 }
.suspicious a { display: block; color: inherit; cursor: pointer }
.pageview { display: flex; gap: 8px; align-items: flex-start }
.col { flex: 1; min-width: 0 }
.col .cap { display: flex; justify-content: space-between; color: var(--muted) }
.col img { width: 100%; max-height: calc(100vh - 120px); object-fit: contain; background: #fff; border: 1px solid var(--line) }
.zoom .col img { width: 200%; max-height: none }
.zoom .col { overflow: auto; max-height: calc(100vh - 120px) }
.col .none { padding: 40px; text-align: center; color: var(--muted); border: 1px dashed var(--line) }
.flagbox { display: none; gap: 6px; margin: 8px 0 }
.flagbox.open { display: flex }
.flagbox input { flex: 1; font: inherit; padding: 4px 8px }
</style>
</head>
<body>
<header><nav id="langs"></nav><span style="flex:1"></span><span id="flags-count"></span><button id="export">Export flags</button></header>
<main><aside><select id="sort"><option value="paper">By paper</option><option value="gain">Most gained first</option><option value="loss">Least gained first</option></select><div id="papers"></div></aside><section id="view"></section></main>
<script type="module">
const $ = s => document.querySelector(s)
const state = { catalog: null, lang: null, paper: null, index: null, page: 0, hidden: new Set(), zoom: false }
const rate = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : '—')
const gain = e => (e.today?.units && e.locked?.units ? e.locked.samePage / e.locked.units - e.today.samePage / e.today.units : -Infinity)
const flags = () => { try { return JSON.parse(localStorage.getItem('axt-eval-flags') ?? '[]') } catch { return [] } }
const saveFlags = f => { try { localStorage.setItem('axt-eval-flags', JSON.stringify(f)) } catch {} ; $('#flags-count').textContent = `${f.length} flagged` }
const base = () => `data/${state.lang}/${state.paper}`

function renderLangs() {
  $('#langs').replaceChildren(...Object.keys(state.catalog.langs).map(l => {
    const b = document.createElement('button'); b.textContent = l; b.className = l === state.lang ? 'on' : ''
    b.onclick = () => { state.lang = l; state.paper = null; renderLangs(); renderPapers(); $('#view').replaceChildren() }
    return b
  }))
}
function renderPapers() {
  const list = [...state.catalog.langs[state.lang]]
  const by = $('#sort').value
  if (by !== 'paper') list.sort((a, b) => (by === 'gain' ? gain(b) - gain(a) : gain(a) - gain(b)))
  $('#papers').replaceChildren(...list.map(e => {
    const d = document.createElement('div'); d.className = `paper${e.paper === state.paper ? ' on' : ''}`
    const pages = Object.entries(e.pages).map(([k, n]) => `${k} ${n ?? '×'}`).join(' · ')
    d.innerHTML = `<b>${e.paper}</b><small>${e.cls}</small><small>pages ${pages}</small><small>units on their page ${rate(e.today?.samePage, e.today?.units)} → ${rate(e.locked?.samePage, e.locked?.units)}</small><small>captions ${e.today?.captionsSamePage ?? '—'}/${e.today?.captions ?? '—'} → ${e.locked?.captionsSamePage ?? '—'}/${e.locked?.captions ?? '—'}</small>`
    d.onclick = () => openPaper(e.paper)
    return d
  }))
}
async function openPaper(id) {
  state.paper = id; state.page = 0; renderPapers()
  state.index = await (await fetch(`${base()}/index.json`)).json()
  renderStrip()
}
function head() {
  const i = state.index, h = document.createElement('div'); h.className = 'head'
  h.innerHTML = `<h2>${i.paper}</h2><span>${i.cls}</span>${i.translation?.untranslated ? `<span>${i.translation.untranslated} units untranslated</span>` : ''}${i.flags?.includes('original-mismatch') ? '<span>our compile of the original differs from arXiv\'s</span>' : ''}${i.lostExtra?.length ? `<span>characters lost only when locked: ${i.lostExtra.join(' ')}</span>` : ''}${i.overfull ? `<span>${i.overfull} overfull boxes when locked</span>` : ''}`
  return h
}
function renderStrip() {
  const i = state.index, max = Math.max(...i.columns.map(c => c.pages ?? 0))
  const strip = document.createElement('div'); strip.className = 'strip'
  for (const c of i.columns) {
    const row = document.createElement('div'); row.className = 'row'; row.dataset.key = c.key
    row.innerHTML = `<span class="label">${c.label}</span>`
    if (c.pages == null) { const f = document.createElement('span'); f.className = 'fail'; f.textContent = `compile failed: ${i.failed?.[c.key] ?? 'no file'}`; row.append(f) }
    else for (let p = 1; p <= max; p++) {
      if (p > c.pages) { const n = document.createElement('span'); n.className = 'none'; n.textContent = '—'; row.append(n); continue }
      const img = document.createElement('img'); img.loading = 'lazy'; img.src = `${base()}/thumbs/${c.key}-${p}.jpg`; img.dataset.page = p; img.title = `${c.label} page ${p}`
      img.onmouseenter = () => document.querySelectorAll(`.row img[data-page="${p}"]`).forEach(x => x.classList.add('hl'))
      img.onmouseleave = () => document.querySelectorAll('.row img.hl').forEach(x => x.classList.remove('hl'))
      img.onclick = () => { state.page = p; renderPage() }
      row.append(img)
    }
    strip.append(row)
  }
  const sus = document.createElement('div'); sus.className = 'suspicious'
  for (const s of i.suspicious ?? []) { const a = document.createElement('a'); a.textContent = `page ${s.page} · ${s.kind} · ${s.detail}`; a.onclick = () => { state.page = s.page; renderPage() }; sus.append(a) }
  $('#view').replaceChildren(head(), strip, sus)
}
function renderPage() {
  const i = state.index, p = state.page
  const bar = document.createElement('div'); bar.className = 'head'
  bar.innerHTML = `<button id="back">All pages</button><span>page ${p}</span><span>← → pages · 1–${i.columns.length} hide a column · Z zoom · Esc all pages</span><button id="flag">Flag this page</button>`
  const box = document.createElement('div'); box.className = 'flagbox'; box.innerHTML = '<input id="flag-note" placeholder="What is wrong on this page"><button id="flag-save">Save</button>'
  const view = document.createElement('div'); view.className = `pageview${state.zoom ? ' zoom' : ''}`
  i.columns.forEach(c => {
    const col = document.createElement('div'); col.className = 'col'; col.dataset.key = c.key; col.hidden = state.hidden.has(c.key)
    const cap = document.createElement('div'); cap.className = 'cap'
    cap.innerHTML = `<span>${c.label}</span>${c.pages != null && p <= c.pages ? `<a href="${base()}/${c.key}.pdf#page=${p}" target="_blank">PDF</a>` : ''}`
    col.append(cap)
    if (c.pages == null) { const n = document.createElement('div'); n.className = 'none'; n.textContent = `compile failed: ${i.failed?.[c.key] ?? 'no file'}`; col.append(n) }
    else if (p > c.pages) { const n = document.createElement('div'); n.className = 'none'; n.textContent = `no page ${p}`; col.append(n) }
    else { const img = document.createElement('img'); img.src = `${base()}/pages/${c.key}-${p}.jpg`; col.append(img) }
    view.append(col)
  })
  $('#view').replaceChildren(head(), bar, box, view)
  $('#back').onclick = renderStrip
  $('#flag').onclick = () => { box.classList.add('open'); $('#flag-note').focus() }
  $('#flag-save').onclick = () => { const f = flags(); f.push({ lang: state.lang, paper: state.paper, page: p, note: $('#flag-note').value, at: new Date().toISOString() }); saveFlags(f); box.classList.remove('open') }
}
document.addEventListener('keydown', e => {
  if (!state.index || !document.querySelector('.pageview') || e.target.tagName === 'INPUT') return
  const max = Math.max(...state.index.columns.map(c => c.pages ?? 0))
  if (e.key === 'ArrowRight' && state.page < max) { state.page++; renderPage() }
  else if (e.key === 'ArrowLeft' && state.page > 1) { state.page--; renderPage() }
  else if (e.key === 'Escape') renderStrip()
  else if (e.key === 'z' || e.key === 'Z') { state.zoom = !state.zoom; renderPage() }
  else if (/^[1-9]$/.test(e.key)) { const c = state.index.columns[Number(e.key) - 1]; if (c) { state.hidden.has(c.key) ? state.hidden.delete(c.key) : state.hidden.add(c.key); renderPage() } }
})
$('#sort').onchange = renderPapers
$('#export').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(flags(), null, 1)], { type: 'application/json' })); a.download = 'flags.json'; a.click() }
state.catalog = await (await fetch('data/index.json')).json()
state.lang = Object.keys(state.catalog.langs)[0]
saveFlags(flags()); renderLangs(); renderPapers()
</script>
</body>
</html>
```

- [ ] **Step 5: Run the check to see it pass**

Run: `node experiments/pdf-bilingual/spikes/visual-eval-view-cases.mjs`
Expected: every line `ok`, `all passed`, exit code 0.

- [ ] **Step 6: Look at it with the real paper of Task 3**

```bash
node experiments/pdf-bilingual/spikes/serve-eval.mjs &
open -a "Google Chrome" http://localhost:8090/
```
Expected: zh → 2608.24839 shows three rows of 7 thumbnails; clicking a page shows the three pages side by side; the PDF link opens that page. Stop the server afterwards (`kill %1`).

- [ ] **Step 7: Lint and commit**

```bash
pnpm lint
git add experiments/pdf-bilingual/spikes/serve-eval.mjs experiments/pdf-bilingual/visual-eval/index.html experiments/pdf-bilingual/spikes/visual-eval-view-cases.mjs
git commit -m "feat(pdf-bilingual): the visual evaluation's page, its server and its checks

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The whole corpus, and service H's column

**Files:**
- None in the repository; outputs under `experiments/pdf-bilingual/data/runs/visual-eval/`.
- Used from outside the repository: `$SERVICE_H_TOOLS/h-column.sh`, where `SERVICE_H_TOOLS` is the tools directory of the research notes on service H (the owner's machine; the repository never names the service, so neither the path nor the script is written here).

**Interfaces:**
- Consumes: Task 3's CLI (`<lang> <paper>...`, `--reindex`, `--catalog`).
- `h-column.sh <worktree> <paper>...` runs service H's PDF translator on each paper with its application's default options, fed by Microsoft through a local endpoint of the research notes, copies each output to `data/runs/visual-eval/zh/<paper>/h.pdf`, then runs `visual-eval.mjs zh <paper>... --reindex`; it prints `<paper> ok` or `<paper> failed` per paper.
- Produces: 57 paper directories with indexes; `h.pdf` and its images in the zh directories; the catalog.

- [ ] **Step 1: Generate the corpus in the background, two queues**

```bash
cd /Users/cheongzhiyan/Developer/ArxivTranslate/.worktrees/geometry-lock
Z=$(node -e 'import("./experiments/pdf-bilingual/spikes/visual-eval-lib.mjs").then(m=>console.log(m.PAPERS.zh.join(" ")))')
E=$(node -e 'import("./experiments/pdf-bilingual/spikes/visual-eval-lib.mjs").then(m=>console.log(m.PAPERS.ja.join(" ")))')
L=experiments/pdf-bilingual/data/runs/visual-eval-logs; mkdir -p $L
nohup pnpm exec tsx experiments/pdf-bilingual/spikes/visual-eval.mjs zh ${=Z} > $L/zh.log 2>&1 &
nohup zsh -c "for l in ja ko de ru; do pnpm exec tsx experiments/pdf-bilingual/spikes/visual-eval.mjs \$l ${E}; done" > $L/others.log 2>&1 &
```
Expected: both queues run for about one to two hours; `grep -c ' done ' $L/*.log` reaches 25 and 32.

- [ ] **Step 2: Service H's column, once the zh queue is done**

```bash
test -x "$SERVICE_H_TOOLS/h-column.sh" || echo "set SERVICE_H_TOOLS to the research notes' tools directory"
until [ "$(grep -c ' done ' $L/zh.log)" -ge 25 ]; do sleep 30; done
"$SERVICE_H_TOOLS/h-column.sh" $PWD ${=Z} > $L/h.log 2>&1
grep -c ' ok$' $L/h.log
```
Expected: 25 (a paper it cannot translate prints `failed` and simply has no H column). The zh catalog entries then list an `h` page count.

- [ ] **Step 3: Check the whole run**

```bash
until [ "$(grep -c ' done ' $L/others.log)" -ge 32 ]; do sleep 30; done
pnpm exec tsx experiments/pdf-bilingual/spikes/visual-eval.mjs --catalog
node -e '
const c=require(process.argv[1]); for (const [l,a] of Object.entries(c.langs)) {
  const s=(k,f)=>a.reduce((x,e)=>x+(e[k]?.[f]??0),0), failed=a.filter(e=>Object.keys(e.failed).length)
  console.log(l, a.length, "papers; units on their page", s("today","samePage")+"/"+s("today","units"), "→", s("locked","samePage")+"/"+s("locked","units"), "; failed", failed.map(e=>e.paper+":"+Object.keys(e.failed)).join(" ")||"none")
}' "$PWD/experiments/pdf-bilingual/data/runs/visual-eval/index.json"
grep -h "failed:" $L/*.log | head
```
Expected: zh 25, ja 8, ko 8, de 8, ru 8; locked counts above today's for zh, ja and ko, close to the spike's (zh 69 → 87 %); each failure listed with its reason, none silent.

- [ ] **Step 4: Open the page and look through a sample before handing over**

```bash
node experiments/pdf-bilingual/spikes/serve-eval.mjs &
open -a "Google Chrome" http://localhost:8090/
```
Look at one paper per language in both views and at two suspicious pages of each; note anything that is the evaluation's fault rather than the lock's (a missing image, a wrong label, a column out of order) and fix it before the owner looks. Leave the server running for the owner.

- [ ] **Step 5: Record where things are**

Add to the research notes' `PLAN.md` (outside the repository) under E3: the page's address, the per-language totals of Step 3, and the paper failures. No repository commit in this task.

---

## Self-review

- Spec coverage: columns and rules (Tasks 1, 3); corpus and parameters (Task 2); translation once, native compiles, renders, layout (Task 3); checks 1–5 — compile failures, lost characters, our original against arXiv's, suspicious pages, per-language table (Tasks 2, 3, 5 Step 3); the page's views, keys, PDF links and flags (Task 4); service H outside the repository (Task 5); review and decision are the owner's, after Task 5.
- Types: `marksOf` pages 0-based in marks and `suspiciousPages` 1-based throughout; `compare` returns `offPage` used by `suspiciousPages` and dropped from the stored numbers; `catalogEntry` reads `numbers.today/locked`, `columns[].pages`, `failed`, `translation.untranslated` as Task 3 writes them.
