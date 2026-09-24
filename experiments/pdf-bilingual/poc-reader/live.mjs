// The translation as it comes in (#292): a paper's source → translated PDFs, each one more complete than the last,
// then the final one. Runs in Node and in the browser alike; the compiler and the translator are passed in.
//
// Order of work, all of it measured in REPORT's sixth and seventh addenda:
//  1. the preamble alone, compiled in the paper's own engine, says which font families the document sets (FONT_PROBE);
//  2. units are translated nearest the reader first (as the page shows them, not in source order: a float's units sit
//     where the float was written), the first batch small so that it comes back soon;
//  3. whenever the compiler is free and new units have come in, the document is compiled again — one pass, images as
//     frames, the labels and citations of the pass before — untranslated units still in the source language;
//  4. the original itself with unit marks, for exact places on arXiv's PDF — when the compiler would otherwise wait,
//     or after the final compile: the translation comes first;
//  5. when every unit is in, the final compile: every pass, the images themselves.
import { analyze } from './paper-meta.mjs'
import { FONT_PROBE, FORBIDDEN_TO_WARNING, inMemory, latin1, latin1Bytes, loadProject, MARK_DEF, markUnits, patch, readFontProbe, stripPdftexOption, XETEX_SHIM, XETEX_SHIM_R1 } from './latex-front.mjs'
import { strategiesFor } from './scripts.mjs'
import { nameCells, plainSource, plainTranslated, translateUnits } from './mt.mjs'

/** The TeX log of a compile's last pass. The browser's compiler (poc-site/tex.js) joins each step's log with its terminal
 *  output — `$ <command>`, then `LOG:` … `==` `STDOUT:` — and the terminal output repeats the errors; the last TeX step's
 *  log is taken, as the one that made the PDF, whatever the earlier passes' logs hold (BusyTeX's pipeline empties them
 *  today, Devin and Codex on #294). bibtex, biber, makeindex and xdvipdfmx are no TeX passes. A native compile's .log is
 *  the last pass's already */
const lastTexLog = log => {
  if (!(log ?? '').includes('\n==\nSTDOUT:')) return log ?? ''
  const steps = [...log.matchAll(/^\$ (\S+)[^\n]*\n[\s\S]*?^LOG:\n([\s\S]*?)\n==\nSTDOUT:/gm)]
  return steps.filter(m => !/^(?:bibtex|biber|makeindex|xdvipdfmx)/.test(m[1])).at(-1)?.[2] ?? ''
}
/** The characters a compile could not set, as its log names them: a glyph a font lacks (TeX logs it and goes on) or a
 *  letter no encoding holds (LaTeX's error; pdfTeX goes on without it). By code point where the log gives one, so that
 *  either message about a character is the same loss, each with the number of times it was lost. Counted in the TeX
 *  log of the last pass alone (lastTexLog) */
export const lostIn = log => {
  const text = lastTexLog(log)
  const out = new Map()
  for (const m of text.matchAll(/^(?:Missing character: There is no (.+?) in font |! LaTeX Error: Unicode character (.+)$)/gm)) {
    const c = m[1] ?? m[2], at = c.match(/\(U\+([0-9A-F]+)\)/)?.[1] ?? c.trim()
    out.set(at, (out.get(at) ?? 0) + 1)
  }
  return out
}
/** A compile that gave a PDF but could not set some letter of the translation: the paper's pdfLaTeX meeting a letter no
 *  encoding it has loaded holds (Vietnamese's, under T1), or one a class's primitive \uppercase broke into bytes (amsart's
 *  titles, a French apostrophe); or a font whose metrics are nowhere (a size of a METAFONT-only font the file server does
 *  not have); or a character its font lacks, which leaves a gap in the PDF where it was (Devin and Codex on #294).
 *  `known` counts the characters the paper's own full compile could not set: the original lacks them too, and a
 *  translation that loses a character no more often is no worse; one more loss of it is a gap the translation added
 *  (Devin and Codex on #294). The chain moves on from it as from a compile with no PDF */
export const unsettable = (r, known = new Map()) => /^! Font .* not loadable/m.test(r.log ?? '') || [...lostIn(r.log)].some(([c, n]) => n > (known.get(c) ?? 0))
const DRAFT = '\\PassOptionsToPackage{draft}{graphicx}\n'
const beginDocument = text => text.search(/\\begin\s*\{document\}/)
const stemOf = main => main.replace(/\.[^./]+$/, '')
/** why a compile gave no PDF: the first TeX error, or what the compiler said */
const whyFailed = r => (r.ok ? undefined : ((r.log ?? '').match(/^(?:\S+:\d+: .*|! .*)$/m)?.[0] ?? r.error ?? (r.log ?? '').slice(-300)).slice(0, 300))

/** a paper's files (Map path → bytes) → what the pipeline works on */
export function openPaper(files) {
  const fsys = inMemory(files)
  const meta = analyze(fsys)
  if (!meta.main) throw new Error('no main file')
  const project = loadProject(fsys, meta.main, { tables: true })
  return { fsys, meta, project, units: project.units, kept: nameCells(project.units) }
}

/** the preamble alone, closed at once: its log names the document's font families */
export function probeFiles({ fsys, project }) {
  const text = latin1(fsys.read(project.main))
  const at = beginDocument(text)
  return new Map([[project.main, latin1Bytes(text.slice(0, at) + FONT_PROBE + '\\begin{document}\\end{document}\n')]])
}

/** the original with unit marks, as its own engine sets it (images as frames change no place on the page) */
export function originalFiles({ fsys, project }) {
  const out = patch(project, new Map(), { mark: markUnits(project.units) })
  const main = latin1(out.get(project.main))
  out.set(project.main, latin1Bytes(DRAFT + MARK_DEF + main))
  return out
}

/** the translation so far, with unit marks, set by one of strategiesFor (scripts.mjs) */
export function translationFiles({ fsys, project, meta }, translated, { strategy, fonts, draft, aux, bbl }) {
  const xe = strategy.xe
  const out = patch(project, translated, { mark: markUnits(project.units) })
  let main = latin1(out.get(project.main))
  const at = beginDocument(main)
  main = main.slice(0, at) + FORBIDDEN_TO_WARNING + strategy.pre(fonts) + main.slice(at)
  // the translation is UTF-8, and a Latin-1 source was transcoded to UTF-8 on the way out: say so
  if (project.inputenc) main = main.replace(/(\\usepackage\s*\[)([^\]]*)(\]\s*\{inputenc\})/, (m, a1, opts, a3) => a1 + opts.split(',').map(o => (o.trim() === project.inputenc ? 'utf8' : o)).join(',') + a3)
  if (xe && strategy.engine !== meta.compiler) main = XETEX_SHIM + XETEX_SHIM_R1 + stripPdftexOption(main)
  main = (draft ? DRAFT : '') + MARK_DEF + main
  out.set(project.main, latin1Bytes(main))
  if (xe && strategy.engine !== meta.compiler) for (const f of fsys.list()) if (/\.(tex|sty|cls)$/i.test(f) && f !== project.main) { const t = latin1(out.get(f) ?? fsys.read(f)), u = stripPdftexOption(t); if (u !== t) out.set(f, latin1Bytes(u)) }
  const stem = stemOf(project.main)
  if (aux) out.set(`${stem}.aux`, new TextEncoder().encode(aux))
  if (bbl && !meta.bbl) out.set(`${stem}.bbl`, new TextEncoder().encode(bbl))
  return out
}

/**
 * Runs the whole of it. `compile({ main, engine, rerun, bibtex, overrides })` → { ok, pdf, aux, bbl, log, ms };
 * `translate(texts)` → translations; `rank(i)` → how far unit i is from the reader's place (lower comes first);
 * `onUpdate({ pdf,
 * texts, translated, final })` gets each compiled translation; `onOriginal({ pdf })` the marked original; `note(event,
 * data)` every step, for the timeline. Resolves when the final compile is in.
 */
export async function runLive(paper, { lang, compile, translate, rank = i => i, onUpdate, onOriginal, note = () => {} }) {
  const { units, kept, meta, project } = paper
  // the chain: a compile that gives no PDF moves on to the next strategy, which is tried at once
  const strategies = strategiesFor(meta, lang)
  let s = 0
  const strategy = () => strategies[s]
  const translated = new Map()
  let dirty = false, mtDone = false, wake = null
  const signal = () => { const w = wake; wake = null; w?.() }
  const sleep = () => new Promise(r => { wake = r })

  // 1. the document's fonts, while the first batch is out
  const fontsP = compile({ main: project.main, engine: meta.compiler, rerun: false, bibtex: false, overrides: probeFiles(paper) }).then(r => { const fonts = readFontProbe(r.log ?? ''); note('fonts', { fonts, ms: r.ms }); return fonts })

  // 2. translation nearest the reader first, asked afresh for every batch: the reader may have moved
  const todo = new Set(units.map((u, i) => i).filter(i => !kept.has(units[i])))
  const nextBatch = maxChars => {
    const order = [...todo].map(i => [i, rank(i)]).sort((a, b) => a[1] - b[1] || a[0] - b[0]).map(([i]) => i)
    const batch = []
    let chars = 0
    for (const i of order) { const n = plainSource(units[i]).length; if (batch.length && chars + n > maxChars) break; batch.push(i); chars += n }
    return batch
  }
  const mt = (async () => {
    try {
    for (let first = true; todo.size; first = false) {
      const batch = nextBatch(first ? 2500 : 12000)
      batch.forEach(i => todo.delete(i))
      const t0 = Date.now()
      const { translated: got, how } = await translateUnits(batch.map(i => units[i]), translate)
      for (const [u, pieces] of got) translated.set(u, pieces)
      note('translated', { units: batch.length, how, ms: Date.now() - t0, total: translated.size })
      dirty = true; signal()
    }
    } finally { mtDone = true; signal() }
  })()

  // 3–5. compiles
  const fonts = await fontsP
  // each unit's text as that compile has it: translated if it was in the snapshot, the source's otherwise
  const texts = done => units.map((u, i) => ({ id: i, text: done.has(u) ? plainTranslated(done.get(u)) : plainSource(u) }))
  let aux = null, bbl = null, previews = 0, originalP = null
  // the marked original, compiled once: the left side's anchors, and the characters the paper's own compile could not set
  const original = () => (originalP ??= compile({ main: project.main, engine: meta.compiler, rerun: true, bibtex: meta.bbl ? false : null, overrides: originalFiles(paper) }).then(o => {
    note('original', { ok: o.ok, ms: o.ms, error: whyFailed(o) })
    if (o.ok) onOriginal?.({ pdf: o.pdf })
    return o
  }))
  /**
   * Whether a compile set the translation (unsettable). A character its font lacks counts only if the paper's own
   * compile set it, which only the original's full compile tells: the font probe has no body (probeFiles). So the
   * original is asked for ahead of its turn, and only when a translation leaves a character out at all (Devin and
   * Codex on #294)
   */
  const settled = async r => r.ok && !unsettable(r, lostIn(r.log).size ? lostIn((await original()).log) : undefined)
  while (true) {
    if (dirty) {
      dirty = false
      const snapshot = new Map(translated), t0 = Date.now()
      const r = await compile({ main: project.main, engine: strategy().engine, rerun: false, bibtex: !meta.bbl && !bbl, overrides: translationFiles(paper, snapshot, { strategy: strategy(), fonts, draft: true, aux, bbl }) })
      if (r.aux) aux = r.aux
      if (r.bbl) bbl = r.bbl
      // shown only when it set every letter: a translation with letters missing is not one (Devin on #294); the note says
      // ok for what is shown, and with no strategy left the reader keeps what it has
      const shown = await settled(r)
      note('preview', { ok: shown, units: snapshot.size, ms: r.ms, roundTrip: Date.now() - t0, strategy: strategy().name, error: shown ? undefined : whyFailed(r) ?? 'a letter it could not set' })
      if (shown) { previews++; onUpdate?.({ pdf: r.pdf, texts: texts(snapshot), translated: snapshot.size, final: false }) }
      else if (s + 1 < strategies.length) { s++; aux = null; dirty = true; note('next strategy', { strategy: strategy().name }) }
      continue
    }
    if (mtDone) break
    // nothing new to compile yet: the original, if it is still to do, else wait for the next batch
    if (!originalP && previews) { await original(); continue }
    await sleep()
  }
  await mt
  const all = new Map(translated), t0 = Date.now()
  let r, ok
  for (;;) {
    r = await compile({ main: project.main, engine: strategy().engine, rerun: true, bibtex: meta.bbl ? false : null, overrides: translationFiles(paper, all, { strategy: strategy(), fonts, draft: false, aux, bbl }) })
    ok = await settled(r)
    note('final', { ok, ms: r.ms, roundTrip: Date.now() - t0, previews, strategy: strategy().name, error: ok ? undefined : whyFailed(r) ?? 'a letter it could not set' })
    if (ok || s + 1 >= strategies.length) break
    s++; aux = null
    note('next strategy', { strategy: strategy().name })
  }
  if (ok) onUpdate?.({ pdf: r.pdf, texts: texts(all), translated: all.size, final: true })
  await original()
  return { previews, translated: translated.size, units: units.length }
}
