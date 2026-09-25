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
/** images as frames of their own size (graphicx's draft), each frame's corners marked — g<n>a and g<n>b at its left and
 *  right ends on its baseline, g<n>t at its top right, n counting \includegraphics in the order TeX runs them — so that
 *  the reader lays the left's figure over its frame (session.mjs leftFor). A transformed include (\rotatebox or
 *  \resizebox around it, angle=) turns or scales its frame and not the marks, whose rectangle then has the size of no
 *  figure on the left, and the reader leaves that frame as it is */
const DRAFT = [
  '\\PassOptionsToPackage{draft}{graphicx}',
  '\\makeatletter\\AddToHook{package/graphics/after}{\\newcount\\axt@g\\let\\axt@setfile\\Gin@setfile%',
  '\\def\\Gin@setfile#1#2#3{\\leavevmode\\global\\advance\\axt@g\\@ne\\axtmark{g\\the\\axt@g a}\\axt@setfile{#1}{#2}{#3}%',
  '\\axtmark{g\\the\\axt@g b}\\rlap{\\raise\\Gin@req@height\\hbox{\\axtmark{g\\the\\axt@g t}}}}}\\makeatother',
].join('\n') + '\n'
const beginDocument = text => text.search(/\\begin\s*\{document\}/)
const stemOf = main => main.replace(/\.[^./]+$/, '')
/** a compile the TeX page gave up on (BusyTeX's 180 s): the machine was slow, not the strategy wrong */
const timedOut = r => !r.ok && /Compilation timeout/.test(r.error ?? '')
/** why a compile gave no PDF: the first TeX error, or what the compiler said */
const whyFailed = r => (r.ok ? undefined : ((r.log ?? '').match(/^(?:\S+:\d+: .*|! .*)$/m)?.[0] ?? r.error ?? (r.log ?? '').slice(-300)).slice(0, 300))

/**
 * The compiler a visit uses, opened when first needed (`open` → { compile, close }) and again after a failure to open.
 * **A compile that did not answer throws it away**: BusyTeX gives up on waiting, not on the job, whose worker goes on
 * and whose output would answer the next compile — a draft taken for the final, the translation's PDF for the marked
 * original. Closing the TeX page's frame ends its worker; the next compile gets a fresh one (Part 4's final review)
 */
export function compilerKeeper(open) {
  let current = null
  const get = () => (current ??= open().catch(e => { current = null; throw e }))
  return {
    ready: () => get().then(() => undefined),
    async compile(req) {
      const mine = get()
      const r = await (await mine).compile(req)
      if (timedOut(r) && current === mine) { current = null; (await mine).close() }
      return r
    },
  }
}

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
 * The reader's pipeline version (REPORT, eighteenth addendum): raised with any change to what a compile puts out
 * (latex-front, mt, the fonts, the scripts' strategies, the TeX tree) or to what a cached record holds (the units'
 * cutting, kinds and texts, paperContext(), the marks). A record of another version is translated again
 */
// 2: the front matter's notes are units (latex-front.mjs FRONT_MATTER)
export const PIPELINE_VERSION = '2'

/**
 * Runs the whole of it. `compile({ main, engine, rerun, bibtex, overrides })` → { ok, pdf, aux, bbl, log, ms };
 * `translate(texts)` → translations of wire texts in `format` (mt.mjs WIRE: the chain's renderPath); `rank(i)` → how
 * far unit i is from the reader's place (lower comes first);
 * `onUpdate({ pdf,
 * texts, translated, final })` gets each compiled translation; `onOriginal({ pdf })` the marked original; `note(event,
 * data)` every step, for the timeline. A translation made again from a cached copy (REPORT, eighteenth addendum):
 * `seed`, index → the old translation { pieces, by, tried, state }, fills the run at the start; `marks`, the left
 * side's marks when known, skips the marked original; `identity` is what each unit is tried under; `pipelineCurrent`,
 * whether the seed's pipeline is this one. Resolves when the final compile is in, with `results` (index → { pieces,
 * state, by, tried }), `changed` (anything typeset changed), `settled` (a final that set every letter) and `exhausted`
 * (every strategy failed to set the final, none for want of time: the paper cannot be had this way).
 */
export async function runLive(paper, { lang, compile, translate, format = 'markers', rank = i => i, onUpdate, onOriginal, note = () => {}, seed = null, marks = null, identity = null, pipelineCurrent = false }) {
  const { units, kept, meta, project } = paper
  // the chain: a compile that gives no PDF moves on to the next strategy, which is tried at once
  const strategies = strategiesFor(meta, lang)
  let s = 0
  const strategy = () => strategies[s]
  const translated = new Map()
  // index → { pieces, state, by, tried }: what the run made of each unit, for the record (cache.mjs unitsOf)
  const results = new Map()
  if (seed) for (const [i, s] of seed) translated.set(units[i], s.pieces)
  let changed = false
  // why the run stopped short: the service's failure (engine.mjs's kinds), after which nothing more is sent (§10.3)
  let stopped = null
  // every unit to translate has a translation, seeded or new: a seeded run shows no preview before, or a paragraph the
  // copy had translated would be shown in the source (REPORT, eighteenth addendum)
  const complete = () => units.every(u => kept.has(u) || translated.has(u))
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
    for (let first = true; todo.size && !stopped; first = false) {
      const batch = nextBatch(first ? 2500 : 12000)
      batch.forEach(i => todo.delete(i))
      const t0 = Date.now()
      let got, how
      try { ({ results: got, how } = await translateUnits(batch.map(i => units[i]), translate, format)) } catch (e) {
        // a refusal for good (engine.mjs: a key missing or refused) stops the run, as a failure of the service does
        if (!e?.kind) throw e
        stopped = e.kind
        for (const i of batch) todo.add(i)
        break
      }
      // whether this batch changed what is typeset: a batch that gives back its seeds asks for no preview (Devin on #298)
      let fresh = false
      for (const i of batch) {
        const r = got.get(units[i]), old = seed?.get(i)
        if (!r) continue
        // a new result replaces a seed only when whole; with no seed, anything is better than the source
        if (r.state === 'whole' || (!old && r.pieces)) {
          if (!old || JSON.stringify(old.pieces) !== JSON.stringify(r.pieces)) changed = fresh = true
          translated.set(units[i], r.pieces)
          results.set(i, { pieces: r.pieces, state: r.state, by: r.by, tried: identity })
        } else results.set(i, { ...(old ? { pieces: old.pieces, by: old.by } : {}), state: r.state, tried: identity })
      }
      note('translated', { units: batch.length, how, ms: Date.now() - t0, total: translated.size })
      // a failure of the service, not of these texts (engine.mjs EngineError's lost): the batches after it would fail
      // the same way, each after the background's retries (the reader's design, §10.3)
      if (how.error) stopped = how.error
      if (fresh) { dirty = true; signal() }
    }
    // stopped short: what was not sent is lost to the service, a seed's translation kept on screen
    if (stopped) {
      for (const i of todo) { const old = seed?.get(i); results.set(i, { ...(old ? { pieces: old.pieces, by: old.by } : {}), state: 'lost', tried: identity }) }
      note('stopped', { kind: stopped, untried: todo.size })
      todo.clear()
    }
    } finally { mtDone = true; signal() }
  })()
  // awaited after the compiles: handled from now, so that an error inside is no unhandled rejection meanwhile
  mt.catch(() => {})
  /** the units left in the source language for the service's failure: lost, with no seed's translation to show */
  const missing = () => [...results.values()].filter(r => r.state === 'lost' && !r.pieces).length

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
    // a seeded run shows a preview only once no unit it would show in the source is left
    if (dirty && seed && !complete()) dirty = false
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
      else if (!timedOut(r) && s + 1 < strategies.length) { s++; aux = null; dirty = true; note('next strategy', { strategy: strategy().name }) }
      continue
    }
    if (mtDone) break
    // nothing new to compile yet: the original, if it is still to do, else wait for the next batch
    if (!marks && !originalP && previews) { await original(); continue }
    await sleep()
  }
  await mt
  // nothing to show: nothing compiled, not even the marked original; the reader says why (the reader's design, §10.3)
  if (stopped && !translated.size) return { previews, translated: 0, units: units.length, results, changed: false, settled: false, exhausted: false, stopped, missing: missing() }
  // a seeded run that changed nothing typeset, on the same pipeline: nothing to compile but the marked original, for a
  // copy that has no marks — else they would never come (Devin on #298)
  if (seed && !changed && pipelineCurrent) {
    if (!marks) await original()
    note('unchanged')
    return { previews, translated: translated.size, units: units.length, results, changed: false, settled: false, exhausted: false, stopped, missing: missing() }
  }
  const all = new Map(translated), t0 = Date.now()
  let r, ok, retried = false, exhausted = false
  for (;;) {
    r = await compile({ main: project.main, engine: strategy().engine, rerun: true, bibtex: meta.bbl ? false : null, overrides: translationFiles(paper, all, { strategy: strategy(), fonts, draft: false, aux, bbl }) })
    ok = await settled(r)
    note('final', { ok, ms: r.ms, roundTrip: Date.now() - t0, previews, strategy: strategy().name, undefinedCitations: [...new Set([...(r.log ?? '').matchAll(/^(?:LaTeX|Package natbib) Warning: Citation [`']([^']+)' .*undefined/gm)].map(m => m[1]))].slice(0, 8), error: ok ? undefined : whyFailed(r) ?? 'a letter it could not set' })
    if (ok) break
    // not answered: once more with the same strategy, then what is shown stays — a slow machine is no reason to change
    // how the paper is set (Part 3's checks: a timed-out preview moved 2608.02163 to a strategy its class refuses)
    if (timedOut(r)) { if (retried) break; retried = true; note('final again', { strategy: strategy().name }); continue }
    if (s + 1 >= strategies.length) { exhausted = true; break }
    s++; aux = null
    note('next strategy', { strategy: strategy().name })
  }
  if (ok) onUpdate?.({ pdf: r.pdf, texts: texts(all), translated: all.size, final: true })
  if (!marks) await original()
  return { previews, translated: translated.size, units: units.length, results, changed: true, settled: !!ok, exhausted, stopped, missing: missing() }
}
