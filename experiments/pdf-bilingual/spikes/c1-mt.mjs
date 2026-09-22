// C1 with a real translator: units of a stratified sample of C0-clean papers sent to Microsoft's free endpoint (the
// extension's default engine) in the `markers` wire format of DESIGN §6 — a void marker @a# for every opaque piece, the
// two ends of a formatting group as two voids — then validated, rehydrated, patched and compiled natively. Measures
// how many units come back with their markers intact, and whether the patched papers compile and are whole.
// A JavaScript re-statement of the markers rules for the spike, not the extension's protector (which works on DOM nodes).
//   node spikes/c1-mt.mjs <lang: zh|ja|de> [id ...]
import { execFile, execFileSync } from 'node:child_process'
import { existsSync, linkSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { promisify } from 'node:util'
import { latinFontsFor, loadProject, MARK_DEF, markUnits, patch, XETEX_SHIM } from './latex-front.mjs'
import { decode, escape, nameCells, plainSource, plainTranslated, rehydrate, serialize, texEscape, translateMicrosoft, utf8 } from '../poc-reader/mt.mjs'
import { analyze } from './paper-meta.mjs'

const run = promisify(execFile)
const root = new URL('..', import.meta.url).pathname
const [lang, ...only] = process.argv.slice(2)
// PROVIDER=llm: an OpenAI-compatible model in the `tags` wire format (the extension's format for LLMs); the key is read
// from a file outside the research folder (LLM_KEY_FILE) and never written anywhere
const LLM = process.env.PROVIDER === 'llm'
const LLM_BASE = process.env.LLM_BASE ?? 'https://apihub.agnes-ai.com/v1', LLM_MODEL = process.env.LLM_MODEL ?? 'agnes-3.0-flash'
const LLM_KEY = LLM ? readFileSync(process.env.LLM_KEY_FILE, 'utf8').trim() : null
const LANG_NAME = { zh: 'Simplified Chinese', ja: 'Japanese', de: 'German' }[lang]
const PRE = {
  zh: { engine: 'xelatex', pre: '\\usepackage{xeCJK}\n\\setCJKmainfont[BoldFont=FandolSong-Bold.otf,ItalicFont=FandolKai-Regular.otf]{FandolSong-Regular.otf}\n' },
  ja: { engine: 'xelatex', pre: '\\usepackage{xeCJK}\n\\setCJKmainfont[AutoFakeBold=2.5]{ipaexm.ttf}\n' },
  de: { engine: 'keep', pre: '' },
}[lang]
// the document's own Latin faces under XeLaTeX: its font families from the probe in gt-orig.mjs's compile of the
// original (run it first), their OpenType forms set after xeCJK (latinFontsFor)
const FONTS = existsSync(join(root, 'out/fonts.json')) ? JSON.parse(readFileSync(join(root, 'out/fonts.json'), 'utf8')) : {}
const SAMPLE = only.length ? only : JSON.parse(readFileSync(join(root, 'out/c1-mt-sample.json'), 'utf8'))
// MARK=1: every unit's start and end recorded as a PDF destination (ground truth for the reader's anchors)
const MARK = !!process.env.MARK
// STAGES=0,0.3,0.6: also the document with only its first share of units translated (the rest in English), as a reader
// that shows the translation while it is still coming in would compile it; into <work>/stages/<share>/
const STAGES = process.env.STAGES ? process.env.STAGES.split(',').map(Number) : []
const TAG = (LLM ? '-llm' : '') + (MARK ? '-marks' : '')
const outFile = join(root, `out/c1-mt${TAG}-${lang}.json`)

// ---------------------------------------------------------------- markers wire format (DESIGN §6)
/** tags format (LLM): <x id="n"/> for an opaque piece, <t id="n">…</t> for a formatting pair */
function serializeTags(u) {
  const slots = [], pairSlot = new Map()
  let wire = ''
  const lead = u.pieces[0]?.t === 'text' ? u.pieces[0].s.match(/^\s*/)[0] : ''
  const trail = u.pieces.at(-1)?.t === 'text' ? u.pieces.at(-1).s.match(/\s*$/)[0] : ''
  u.pieces.forEach((p, k) => {
    if (p.t === 'text') { let s = utf8(p.s).replace(/\s+/g, ' '); if (k === 0) s = s.trimStart(); if (k === u.pieces.length - 1) s = s.trimEnd(); wire += s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); return }
    if (p.t === 'open') { slots.push({ open: p }); pairSlot.set(p.id, slots.length); wire += `<t id="${slots.length}">`; return }
    if (p.t === 'close') { const n = pairSlot.get(p.id); if (n) slots[n - 1].close = p; wire += '</t>'; return }
    slots.push({ void: p }); wire += `<x id="${slots.length}"/>`
  })
  return { wire, slots, lead, trail }
}
function rehydrateTags(text, { slots, lead, trail }) {
  const pieces = [], seenVoid = new Set(), seenPair = new Set(), stack = []
  const re = /<x\s+id\s*=\s*["']?(\d+)["']?\s*\/?>(?:\s*<\/x>)?|<t\s+id\s*=\s*["']?(\d+)["']?\s*>|<\/t\s*>/g
  let last = 0, m
  const pushText = s => { const d = decode(s); if (d) pieces.push({ t: 'text', tr: true, s: texEscape(d) }) }
  while ((m = re.exec(text))) {
    pushText(text.slice(last, m.index)); last = re.lastIndex
    if (m[1]) { const n = Number(m[1]), slot = slots[n - 1]; if (!slot?.void || seenVoid.has(n)) return { error: slot?.void ? 'duplicated placeholder' : 'unknown placeholder' }; seenVoid.add(n); pieces.push(slot.void) }
    else if (m[2]) { const n = Number(m[2]), slot = slots[n - 1]; if (!slot?.open || !slot.close || seenPair.has(n)) return { error: 'bad pair' }; seenPair.add(n); stack.push(n); pieces.push(slot.open) }
    else { const n = stack.pop(); if (!n) return { error: 'bad pair' }; pieces.push(slots[n - 1].close) }
  }
  pushText(text.slice(last))
  if (stack.length) return { error: 'bad pair' }
  const voids = slots.filter(x => x.void).length, pairs = slots.filter(x => x.open && x.close).length
  if (seenVoid.size !== voids) return { error: 'lost placeholder' }
  if (seenPair.size !== pairs) return { error: 'lost pair' }
  if (lead) pieces.unshift({ t: 'text', s: lead }); if (trail) pieces.push({ t: 'text', s: trail })
  return { pieces }
}

// ---------------------------------------------------------------- the engine, as the extension calls it
const SYSTEM = `You are translating a scientific paper from English into ${LANG_NAME}. The text may contain placeholders: <x id="N"/> stands for a formula, a citation, a reference or a command, and must appear exactly once in your translation; <t id="N">…</t> marks formatted text: translate what is inside and keep the pair around it. Do not add, remove or renumber placeholders. Keep technical terms accurate. Output only the translation.`
// one shared cool-down: a 429 pauses every worker, doubling each time it recurs, reset by a success
let pauseUntil = 0, backoff = 2000
async function translateLLM(text) {
  for (let attempt = 0; attempt < 8; attempt++) {
    while (Date.now() < pauseUntil) await new Promise(r => setTimeout(r, pauseUntil - Date.now()))
    try {
      const res = await fetch(`${LLM_BASE}/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${LLM_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: LLM_MODEL, temperature: 0, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: text }] }) })
      if (res.status === 429) { pauseUntil = Math.max(pauseUntil, Date.now() + backoff * (0.8 + 0.4 * Math.random())); backoff = Math.min(backoff * 2, 60000); throw new Error('HTTP 429') }
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`)
      const j = await res.json()
      backoff = Math.max(2000, backoff / 2)
      const out = j.choices?.[0]?.message?.content
      if (typeof out !== 'string') throw new Error(`no content: HTTP ${res.status} ${JSON.stringify(j.error ?? j).slice(0, 120)}`)
      llmUsage.prompt += j.usage?.prompt_tokens ?? 0; llmUsage.completion += j.usage?.completion_tokens ?? 0
      return out.trim()
    } catch (e) { llmErrors[String(e.message ?? e).slice(0, 90)] = (llmErrors[String(e.message ?? e).slice(0, 90)] ?? 0) + 1; if (attempt === 7) return null; if (!String(e.message).includes('429')) await new Promise(r => setTimeout(r, 2000 * (attempt + 1))) }
  }
}
const llmErrors = {}
const llmUsage = { prompt: 0, completion: 0 }
async function translateAll(wires) {
  if (LLM) {
    const out = new Array(wires.length).fill(null)
    let next = 0
    await Promise.all(Array.from({ length: Number(process.env.LLM_CONCURRENCY ?? 3) }, async () => { while (next < wires.length) { const i = next++; out[i] = await translateLLM(wires[i]) } }))
    return out
  }
  const batches = []
  let cur = [], chars = 0
  for (const [i, w] of wires.entries()) { if (cur.length && (chars + w.length > 2000 || cur.length >= 100)) { batches.push(cur); cur = []; chars = 0 } cur.push(i); chars += w.length }
  if (cur.length) batches.push(cur)
  const out = new Array(wires.length).fill(null)
  let next = 0
  await Promise.all(Array.from({ length: 4 }, async () => { while (next < batches.length) { const b = batches[next++]; const res = await translateMicrosoft(b.map(i => wires[i]), lang); b.forEach((i, k) => { out[i] = res[k] }) } }))
  return out
}

// ---------------------------------------------------------------- per paper
const IMAGE = /\.(pdf|png|jpe?g|eps|ps|gif|tiff?|svg)$/i
const walkFiles = dir => readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? walkFiles(p) : [p] })
const sh = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }) } catch { return null } }
function signals(pdf) {
  if (!existsSync(pdf)) return null
  const text = (sh('pdftotext', ['-q', pdf, '-']) ?? '').replace(/-\n/g, '')
  return { pages: Number(sh('pdfinfo', [pdf])?.match(/^Pages:\s+(\d+)/m)?.[1]) || null, cjk: (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? []).length, leaks: (text.match(/@[a-z]{1,3}#/g) ?? []).length, unresolved: (text.match(/\?\?|\[\?\]/g) ?? []).length, images: (sh('pdfimages', ['-list', pdf]) ?? '').split('\n').filter(l => /^\s*\d+\s+\d+\s+image/.test(l)).length }
}

const results = []
for (const id of SAMPLE) {
  const src = join(root, 'data/corpus', id, 'src')
  const meta = analyze(src)
  // table cells are units too (C1: no cost in compile rate); TABLES=0 for the prose-only runs of before
  const project = loadProject(src, meta.main, { tables: process.env.TABLES !== '0' })
  const units = project.units
  const kept = nameCells(units)
  const sers = units.map(LLM ? serializeTags : serialize)
  const t0 = Date.now()
  const sent = units.map((u, i) => i).filter(i => !kept.has(units[i]))
  const got0 = await translateAll(sent.map(i => sers[i].wire))
  const texts = new Array(units.length).fill(null)
  sent.forEach((i, j) => { texts[i] = got0[j] })
  const mtMs = Date.now() - t0
  const translated = new Map(), failures = {}, how = { markers: 0, tolerant: 0, runs: 0, untranslated: 0 }
  const failed = []
  units.forEach((u, i) => {
    if (kept.has(u)) return
    if (texts[i] == null) { failures['no response'] = (failures['no response'] ?? 0) + 1; failed.push(u); return }
    const strict = LLM ? rehydrateTags(texts[i], sers[i]) : rehydrate(texts[i], sers[i])
    if (!strict.error) { translated.set(u, strict.pieces); how.markers++; return }
    failures[strict.error] = (failures[strict.error] ?? 0) + 1
    const loose = LLM ? { error: 'no tolerant parse for tags' } : rehydrate(texts[i], sers[i], true)
    if (!loose.error) { translated.set(u, loose.pieces); how.tolerant++; return }
    failed.push(u)
  })
  // what still failed goes as runs: each stretch of text between opaque pieces on its own, the pieces kept in place
  const runs = []
  for (const u of failed) u.pieces.forEach((p, k) => { if (p.t === 'text' && (utf8(p.s).match(/\p{L}/gu) ?? []).length >= 2) { const plain = utf8(p.s).replace(/\s+/g, ' ').trim(); runs.push({ u, k, wire: LLM ? plain.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : escape(plain) }) } })
  const runTexts = runs.length ? await translateAll(runs.map(r => r.wire)) : []
  const byUnit = new Map()
  runs.forEach((r, j) => { if (runTexts[j] != null) (byUnit.get(r.u) ?? byUnit.set(r.u, new Map()).get(r.u)).set(r.k, runTexts[j]) })
  for (const u of failed) {
    const got = byUnit.get(u)
    if (!got?.size) { how.untranslated++; continue }
    translated.set(u, u.pieces.map((p, k) => got.has(k) ? { t: 'text', tr: true, s: p.s.match(/^\s*/)[0] + texEscape(decode(got.get(k).replace(/@@/g, '@'))) + p.s.match(/\s*$/)[0] } : p))
    how.runs++
  }
  const withMarkers = sers.filter(s => s.slots.length).length
  const files = patch(project, translated, MARK ? { mark: markUnits(units) } : {})
  // for the reader: every unit's plain text on both sides, placeholders dropped (anchors are found from text alone)
  const dumpUnits = units.map((u, i) => ({ i, kind: u.kind, nested: !!u.nested, src: plainSource(u), tr: translated.has(u) ? plainTranslated(translated.get(u)) : null }))
  const work = join(root, `data/runs/c1-mt${TAG}`, lang, id)
  rmSync(work, { recursive: true, force: true })
  for (const f of walkFiles(src)) { const rel = relative(src, f), to = join(work, rel); mkdirSync(dirname(to), { recursive: true }); if (IMAGE.test(f)) linkSync(f, to); else writeFileSync(to, readFileSync(f)) }
  for (const [rel, bytes] of files) writeFileSync(join(work, rel), bytes)
  writeFileSync(join(work, 'units.json'), JSON.stringify(dumpUnits))
  const engine = PRE.engine === 'keep' ? meta.compiler : PRE.engine
  let main = readFileSync(join(work, project.main), 'latin1')
  const at = main.search(/\\begin\s*\{document\}/)
  main = main.slice(0, at) + PRE.pre + (engine === 'xelatex' ? latinFontsFor(FONTS[id]) : '') + main.slice(at)
  if (engine === 'xelatex') main = XETEX_SHIM + main
  if (MARK) main = MARK_DEF + main
  writeFileSync(join(work, project.main), Buffer.from(main, 'latin1'))
  const flag = { pdflatex: '-pdf', xelatex: '-xelatex', lualatex: '-lualatex', latex: '-pdfps' }[engine] ?? '-pdf'
  try { await run('docker', ['run', '--rm', '--init', '--network', 'none', '--cpus', '2', '--memory', '3g', '-v', `${work}:/work`, '-w', '/work', 'texlive/texlive:latest', 'timeout', '300', 'latexmk', flag, ...(meta.bbl ? ['-bibtex-'] : []), '-interaction=nonstopmode', '-file-line-error', '-f', meta.main], { maxBuffer: 1 << 26 }) } catch {}
  const stem = meta.main.split('/').pop().replace(/\.[^.]+$/, '')
  for (const share of STAGES) {
    const partial = new Map([...translated].filter(([u]) => units.indexOf(u) < Math.round(units.length * share)))
    const dir = join(work, 'stages', String(share))
    rmSync(dir, { recursive: true, force: true })
    for (const f of walkFiles(src)) { const rel = relative(src, f), to = join(dir, rel); mkdirSync(dirname(to), { recursive: true }); if (IMAGE.test(f)) linkSync(f, to); else writeFileSync(to, readFileSync(f)) }
    for (const [rel, bytes] of patch(project, partial, MARK ? { mark: markUnits(units) } : {})) writeFileSync(join(dir, rel), bytes)
    let m2 = readFileSync(join(dir, project.main), 'latin1')
    const at2 = m2.search(/\\begin\s*\{document\}/)
    m2 = m2.slice(0, at2) + PRE.pre + (engine === 'xelatex' ? latinFontsFor(FONTS[id]) : '') + m2.slice(at2)
    if (engine === 'xelatex') m2 = XETEX_SHIM + m2
    if (MARK) m2 = MARK_DEF + m2
    writeFileSync(join(dir, project.main), Buffer.from(m2, 'latin1'))
    try { await run('docker', ['run', '--rm', '--init', '--network', 'none', '--cpus', '2', '--memory', '3g', '-v', `${dir}:/work`, '-w', '/work', 'texlive/texlive:latest', 'timeout', '300', 'latexmk', flag, ...(meta.bbl ? ['-bibtex-'] : []), '-interaction=nonstopmode', '-file-line-error', '-f', meta.main], { maxBuffer: 1 << 26 }) } catch {}
    console.log(`  stage ${share}: ${partial.size} of ${translated.size} units translated, pdf=${existsSync(join(dir, `${stem}.pdf`))}`)
  }
  const sig = signals(join(work, `${stem}.pdf`)), ref = signals(join(root, 'data/runs/native', id, `${stem}.pdf`))
  let firstError = '', errors = 0, refErrors = 0
  try { const log = readFileSync(join(work, `${stem}.log`), 'latin1'); firstError = (log.match(/^(?:\S+:\d+: .*|! .*)$/m)?.[0] ?? '').slice(0, 160); errors = (log.match(/^(?:\S+:\d+: |! )/gm) ?? []).length } catch {}
  try { refErrors = (readFileSync(join(root, 'data/runs/native', id, `${stem}.log`), 'latin1').match(/^(?:\S+:\d+: |! )/gm) ?? []).length } catch {}
  how.namesKept = kept.size
  const r = { id, lang, provider: LLM ? LLM_MODEL : 'microsoft', tokens: LLM ? { ...llmUsage } : undefined, llmErrors: LLM ? { ...llmErrors } : undefined, documentclass: meta.documentclass, units: units.length, withMarkers, translated: translated.size, how, failures, newErrors: errors - refErrors, mtSeconds: Math.round(mtMs / 1000), pdf: !!sig, pages: sig?.pages, refPages: ref?.pages, leaks: sig?.leaks, newUnresolved: sig && ref ? sig.unresolved - ref.unresolved : null, lostImages: sig && ref ? ref.images - sig.images : null, cjk: sig?.cjk, firstError }
  results.push(r)
  writeFileSync(outFile, JSON.stringify(results, null, 1))
  console.log(`${id} ${lang} ${meta.documentclass} units ${units.length} ${JSON.stringify(how)} err+${r.newErrors} pdf=${r.pdf} pages=${r.pages}/${r.refPages} leaks=${r.leaks} ??+${r.newUnresolved} mt=${r.mtSeconds}s ${firstError}`.slice(0, 250))
}
