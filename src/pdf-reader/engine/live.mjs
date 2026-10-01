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
// With the typesetting rule (typeset/plan.mjs; experiments/pdf-bilingual/plans/2026-10-01-flow-typesetting-handoff.md,
// "The compile sequence"), where the reader can read a PDF's marks (`readMarks`): the font probe measures the body face
// too (1); the original goes right after the first preview, in full with its line probes (4), since every plan is made
// from it; each later preview is planned on its snapshot (3); the last preview of the whole translation, complete,
// measures the final — else a draft one-pass of it does — and the final is set from that measure (5). The first
// preview is set as today: nothing is known to plan it from yet. Where a plan cannot be made, the translation is set as
// today, and the reason noted
import { analyze } from './paper-meta.mjs'
import { BALANCE_DEF, EVEN_SPACES, FIT_DEF, FONT_PROBE, FORBIDDEN_TO_WARNING, inMemory, lastTexLog, latin1, latin1Bytes, loadProject, localizeNames, MARK_DEF, markUnits, NO_OVERFLOW, patch, readFontProbe, stripPdftexOption, unitLeadTex, lineBreaks, XETEX_SHIM, XETEX_SHIM_R1 } from './latex-front.mjs'
import { authorsTranslated, strategiesFor, typesetBy } from './scripts.mjs'
import { nameCells, plainSource, textsShown, translateUnits } from './mt.mjs'
import { WIDTH_PROBE } from './typeset/density.mjs'
import { finalTypesetting, previewTypesetting } from './typeset/plan.mjs'
import { LINES_TEX } from './typeset/tex.mjs'

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
/** the name TeX gives a compile's .aux and .bbl: it runs in the project's root (BusyTeX's FS.chdir(project_dir)) and
 *  writes and reads them there, whatever folder the main file is in */
const stemOf = main => main.split('/').pop().replace(/\.[^.]+$/, '')
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

/** the preamble alone, closed at once: its log names the document's font families; with `width`, also how wide the
 *  body face sets and at what sizes (typeset/density.mjs WIDTH_PROBE), which the typesetting rule measures text by */
export function probeFiles({ fsys, project }, { width = false } = {}) {
  const text = latin1(fsys.read(project.main))
  const at = beginDocument(text)
  return new Map([[project.main, latin1Bytes(`${text.slice(0, at)}${FONT_PROBE}\\begin{document}${width ? WIDTH_PROBE : ''}\\end{document}\n`)]])
}

/** the original with unit marks, as its own engine sets it (images as frames change no place on the page); with
 *  `lines`, each unit's lines and the forced breaks in its log (typeset/tex.mjs LINES_TEX), which the typesetting rule
 *  takes the original's flow from */
export function originalFiles({ fsys, project }, { lines = false } = {}) {
  const base = markUnits(project.units), index = new Map(project.units.map((u, i) => [u, i]))
  const out = patch(project, new Map(), { mark: lines ? u => { const m = base(u); return m && { ...m, before: `\\axtlines{${index.get(u)}}` } } : base })
  const main = latin1(out.get(project.main))
  out.set(project.main, latin1Bytes(DRAFT + MARK_DEF + (lines ? LINES_TEX : '') + main))
  return out
}

/** the translation so far, with unit marks, set by one of strategiesFor (scripts.mjs); a strategy's `leading` sets the
 *  translated units' own paragraphs, and those alone, at that factor of the paper's spacing (latex-front unitLeadTex).
 *  `typeset`, the typesetting rule's (typeset/plan.mjs previewTypesetting, finalTypesetting): the strategy it sets the
 *  type of, its TeX, each translated unit's macros — for the strategy it was made for: with another the translation is
 *  set as today, and `note('typeset refused', …)` says so */
export function translationFiles({ fsys, project, meta }, translated, { strategy, fonts, draft, aux, bbl, typeset = null, note = () => {} }) {
  if (typeset && typeset.for !== strategy.name) { note('typeset refused', { plan: typeset.for, strategy: strategy.name }); typeset = null }
  if (typeset) strategy = typeset.strategy(strategy)
  const xe = strategy.xe
  translated = new Map([...typesetBy(translated, strategy)].map(([u, pieces]) => [u, lineBreaks(u, pieces)]))
  const base = markUnits(project.units, translated)
  const index = new Map(project.units.map((u, i) => [u, i]))
  const mark = typeset ? typeset.mark(base, translated) : strategy.leading ? u => { const m = base(u); return m && !m.whole && translated.has(u) ? { ...m, before: `\\axtlead{${index.get(u)}}` } : m } : base
  const out = patch(project, translated, { mark })
  let main = latin1(out.get(project.main))
  const at = beginDocument(main)
  main = localizeNames(main.slice(0, at)) + FORBIDDEN_TO_WARNING + strategy.pre(fonts) + NO_OVERFLOW + (xe ? '' : EVEN_SPACES) + main.slice(at)
  // the translation is UTF-8, and a Latin-1 source was transcoded to UTF-8 on the way out: say so
  if (project.inputenc) main = main.replace(/(\\usepackage\s*\[)([^\]]*)(\]\s*\{inputenc\})/, (m, a1, opts, a3) => a1 + opts.split(',').map(o => (o.trim() === project.inputenc ? 'utf8' : o)).join(',') + a3)
  if (xe && strategy.engine !== meta.compiler) main = XETEX_SHIM + XETEX_SHIM_R1 + stripPdftexOption(main)
  // what the strategy puts before \documentclass (scripts.mjs: a paper's own CJK packages kept from loading under xeCJK)
  main = (strategy.front ?? '') + (draft ? DRAFT : '') + MARK_DEF + FIT_DEF + BALANCE_DEF + (strategy.leading ? unitLeadTex(`${strategy.leading}\\baselineskip`) : '') + (typeset?.head ?? '') + main
  out.set(project.main, latin1Bytes(main))
  if (xe && strategy.engine !== meta.compiler) for (const f of fsys.list()) if (/\.(tex|sty|cls)$/i.test(f) && f !== project.main) { const t = latin1(out.get(f) ?? fsys.read(f)), u = stripPdftexOption(t); if (u !== t) out.set(f, latin1Bytes(u)) }
  for (const f of fsys.list()) if (/\.(tex|sty|cls)$/i.test(f) && f !== project.main) { const t = latin1(out.get(f) ?? fsys.read(f)), u = localizeNames(t); if (u !== t) out.set(f, latin1Bytes(u)) }
  const stem = stemOf(project.main)
  if (aux) out.set(`${stem}.aux`, new TextEncoder().encode(aux))
  if (bbl && !meta.bbl) out.set(`${stem}.bbl`, new TextEncoder().encode(bbl))
  return out
}

/** the units a translation into `lang` leaves as they are: the names a table holds (nameCells), and the author block's
 *  names and places where the target writes them as the paper does (scripts.mjs authorsTranslated) */
export const keptFor = (paper, lang) => (authorsTranslated(lang) ? paper.kept : new Set([...paper.kept, ...paper.units.filter(u => u.kind === 'author')]))

/**
 * The reader's versions (REPORT, eighteenth addendum), apart since 2026-10-02 so that a change to the typesetting never
 * asks the service again (the evaluation's ruling 4):
 * - PIPELINE_VERSION, the translation's: raised with any change to what a unit is or what is sent for it and made of
 *   the answer — the units' cutting, kinds and texts (latex-front), the wire and its reading back (mt), paperContext(),
 *   the left side's marks. A record of another version is translated again, its translations shown meanwhile (session.mjs
 *   seedFrom); one of this version gives its whole units by the identity that would answer now as they are (cache.mjs
 *   reusable).
 * - TYPESETTING_VERSION: raised with any change to how a compile sets a translation it is given — latex-front's TeX,
 *   the scripts' strategies, the fonts, the typesetting rule (typeset/), the TeX tree. A record of another version is
 *   compiled again from its translation; a paper none of the ways could set is tried again.
 */
// 2: the front matter's notes are units (latex-front.mjs FRONT_MATTER)
// 3, 4: two branches each raised it twice, and their 3s and 4s are other pipelines —
//   the highlight's (exp/pdf-highlight): 3, a translation's invisible characters dropped before TeX (mt.mjs texEscape) —
//   a mark "cannot typeset" they caused goes; 4, a file \input under another spelling (./sections/a.tex) gets its
//   translation (latex-front.mjs loadProject) — the copies that set it in English go;
//   the typesetting rule's (exp/flow-integration): 3, CJK leading inside translated units alone, their displays at the
//   paper's, and English hyphenation under a CJK target (scripts.mjs, latex-front.mjs unitLeadTex); the paper's own
//   macros, argument-less declarations and the author block's names and places cut into units (latex-front.mjs); the
//   wire spaced after a period (mt.mjs); 4, IEEEtran's blocks of names and of places each a unit; a translated line of
//   names in a box that does not wrap set as a paragraph of the line's width (\\axtwide); a table narrower than its
//   original kept at the original's width, and a tabular* measured at its columns' width before it is fitted
//   (latex-front.mjs FIT_DEF, AUTHOR_WIDE); an e-mail address, and a list of names in braces before its domain, a
//   placeholder (keepAddresses); a name kept whole in a line of names (lineBreaks)
// 5: the two together, and the wire's spaces beside a digit taken back (mt.mjs rehydrate)
export const PIPELINE_VERSION = '5'
// 1: the typesetting rule wired (typeset/plan.mjs, F2 of 2026-10-02); the versions apart; under xeCJK a paper's own CJK
//    packages kept from loading and xeCJK's microtype slot set right (scripts.mjs)
export const TYPESETTING_VERSION = '1'

/**
 * Runs the whole of it. `compile({ main, engine, rerun, bibtex, overrides })` → { ok, pdf, aux, bbl, log, ms };
 * `translate(texts, cuts)` → translations of wire texts in `format` (mt.mjs WIRE: the chain's renderPath; `cuts` each text's
 * sentence cuts on the tags path, mt.mjs translateUnits); `rank(i)` → how
 * far unit i is from the reader's place (lower comes first);
 * `onUpdate({ pdf,
 * texts, translated, final })` gets each compiled translation; `onOriginal({ pdf })` the marked original; `note(event,
 * data)` every step, for the timeline. A translation made again from a cached copy (REPORT, eighteenth addendum):
 * `seed`, index → the old translation { pieces, by, tried, state, current }, fills the run at the start, and one
 * `current` (cache.mjs reusable) is not sent again; `marks`, the left
 * side's marks when known, skips the marked original; `identity` is what each unit is tried under; `pipelineCurrent`,
 * whether the seed's pipeline is this one. Resolves when the final compile is in, with `results` (index → { pieces,
 * state, by, tried, sentences? }), `changed` (anything typeset changed), `settled` (a final that set every letter), `exhausted`
 * (every strategy failed to set the final, none for want of time: the paper cannot be had this way) and, with it,
 * `originalOk` (the paper's own source set here, or before: only then is it the translation that cannot be set, rather
 * than the compiler or its files that were down). `readMarks(pdf)` → a PDF's marks and page columns (typeset/places.mjs
 * marksOf on a PDF.js document of the bytes, which it must not take: the reader shows them too): with it the
 * translation is set by the typesetting rule, without as today.
 */
export async function runLive(paper, { lang, compile, translate, format = 'markers', rank = i => i, onUpdate, onOriginal, note = () => {}, seed = null, marks = null, identity = null, pipelineCurrent = false, readMarks = null }) {
  const { units, meta, project } = paper
  const kept = keptFor(paper, lang)
  // the chain: a compile that gives no PDF moves on to the next strategy, which is tried at once
  const strategies = strategiesFor(meta, lang)
  let s = 0
  const strategy = () => strategies[s]
  const translated = new Map()
  // index → { pieces, state, by, tried, sentences? }: what the run made of each unit, for the record (cache.mjs unitsOf)
  const results = new Map()
  // each translation's sentences (mt.mjs sentencesOf), by its pieces: a compile's texts carry those of the pieces it
  // typeset, not of a translation come in while it compiled
  const sentencesBy = new WeakMap()
  const keep = (pieces, sentences) => { if (sentences) sentencesBy.set(pieces, sentences) }
  const seeded = old => (old ? { pieces: old.pieces, by: old.by, ...(old.sentences ? { sentences: old.sentences } : {}) } : {})
  if (seed) for (const [i, s] of seed) { translated.set(units[i], s.pieces); keep(s.pieces, s.sentences) }
  // a seed taken as it is (cache.mjs reusable: whole, by this identity, of the wire sent now) is not sent again: a change
  // to the typesetting alone asks the service for nothing (the evaluation's ruling 4)
  const taken = new Set([...(seed ?? [])].filter(([, s]) => s.current).map(([i]) => i))
  for (const i of taken) results.set(i, { ...seeded(seed.get(i)), state: 'whole', tried: identity })
  let changed = false
  // why the run stopped short: the service's failure (engine.mjs's kinds), after which nothing more is sent (§10.3)
  let stopped = null
  // every unit to translate has a translation, seeded or new: a seeded run shows no preview before, or a paragraph the
  // copy had translated would be shown in the source (REPORT, eighteenth addendum)
  const complete = () => units.every(u => kept.has(u) || translated.has(u))
  let dirty = false, mtDone = false, wake = null
  const signal = () => { const w = wake; wake = null; w?.() }
  const sleep = () => new Promise(r => { wake = r })

  // 1. the document's fonts, while the first batch is out; with the rule, how wide its body face sets and at what sizes
  const fontsP = compile({ main: project.main, engine: meta.compiler, rerun: false, bibtex: false, overrides: probeFiles(paper, { width: !!readMarks }) }).then(r => { const fonts = readFontProbe(r.log ?? ''); note('fonts', { fonts, ms: r.ms }); return { fonts, log: r.log ?? '' } })

  // 2. translation nearest the reader first, asked afresh for every batch: the reader may have moved
  const todo = new Set(units.map((u, i) => i).filter(i => !kept.has(units[i]) && !taken.has(i)))
  if (taken.size) note('translated', { units: 0, taken: taken.size, total: translated.size })
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
          keep(r.pieces, r.sentences)
          results.set(i, { pieces: r.pieces, state: r.state, by: r.by, tried: identity, ...(r.sentences ? { sentences: r.sentences } : {}) })
        } else results.set(i, { ...seeded(old), state: r.state, tried: identity })
      }
      note('translated', { units: batch.length, how, ms: Date.now() - t0, total: translated.size })
      // a failure of the service, not of these texts (engine.mjs EngineError's lost): the batches after it would fail
      // the same way, each after the background's retries (the reader's design, §10.3)
      if (how.error) stopped = how.error
      if (fresh) { dirty = true; signal() }
    }
    // stopped short: what was not sent is lost to the service, a seed's translation kept on screen
    if (stopped) {
      for (const i of todo) results.set(i, { ...seeded(seed?.get(i)), state: 'lost', tried: identity })
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
  const { fonts, log: fontLog } = await fontsP
  // each unit's text as that compile has it: translated if it was in the snapshot, the source's otherwise; with where its
  // placeholders stood, its displays beyond its marks and the sentences of the translation typeset, for the anchors
  const texts = done => textsShown(units, done, pieces => sentencesBy.get(pieces))
  let aux = null, bbl = null, previews = 0, originalP = null
  /** the original as the rule reads it: its log (each unit's lines, the forced breaks, the document's end), its marks
   *  with every page's columns, its references; null until it is in, and where it could not be read */
  let readings = null
  /**
   * A draft's references, the original's citations with them where they have none. A first preview runs BibTeX after
   * its one pass, so the preview after it read every citation from an aux that had none yet, set them as "?" and could
   * measure nothing; and a visit whose translation comes quickly has just those two previews. A translation keeps every
   * citation and leaves the bibliography as it is, so the original's labels are the ones its own passes write
   */
  let originalCites = ''
  const withCites = a => (!originalCites || /^\\bibcite\{/m.test(a ?? '') ? a : `${a ?? ''}\n${originalCites}`)
  // the marked original, compiled once: the left side's anchors, the characters the paper's own compile could not set,
  // and with the rule every plan's base — so in full, every pass: one pass sets references, citations and the pages they
  // move unsettled, and its readings are another paper's (the review of 2026-10-01, M3)
  const original = () => (originalP ??= compile({ main: project.main, engine: meta.compiler, rerun: true, bibtex: meta.bbl ? false : null, overrides: originalFiles(paper, { lines: !!readMarks }) }).then(async o => {
    note('original', { ok: o.ok, ms: o.ms, error: whyFailed(o) })
    if (o.ok) {
      onOriginal?.({ pdf: o.pdf })
      originalCites = (o.aux ?? '').match(/^\\bibcite\{.*$/gm)?.join('\n') ?? ''
      if (readMarks) readings = await readMarks(o.pdf).then(m => ({ log: o.log ?? '', marks: m, aux: o.aux ?? '' }), e => { note('typeset', { missing: `the original's marks (${String(e?.message ?? e).slice(0, 120)})` }); return null })
    }
    return o
  }))
  /**
   * Whether a compile set the translation (unsettable). A character its font lacks counts only if the paper's own
   * compile set it, which only the original's full compile tells: the font probe has no body (probeFiles). So the
   * original is asked for ahead of its turn, and only when a translation leaves a character out at all (Devin and
   * Codex on #294)
   */
  const settled = async r => r.ok && !unsettable(r, lostIn(r.log).size ? lostIn((await original()).log) : undefined)
  // the rule's plans, one per compile, made for the strategy the compile sets: none until the original is read, and
  // none where an input is missing or partial (plan.mjs previewTypesetting) — the translation is set as today then,
  // and the reason noted once
  let toldMissing = null
  // the strategies a compile with the rule failed under, TeX's failure: each tried again as today, the rule left out,
  // before the chain moves on — the rule's TeX is one more thing that can fail, the strategy may well set the paper
  // (the evaluation's ruling 6, 2026-10-01); and set as today from then on
  const ruleFailed = new Set()
  const withoutRule = r => { ruleFailed.add(strategy().name); note('typeset failed', { strategy: strategy().name, error: whyFailed(r) }) }
  const planFor = snapshot => {
    if (!readings || ruleFailed.has(strategy().name)) return null
    const plan = previewTypesetting({ paper, translated: snapshot, lang, strategy: strategy(), fonts, fontLog, original: readings })
    if (!plan.typeset && toldMissing !== plan.missing) { toldMissing = plan.missing; note('typeset', { missing: plan.missing }) }
    return plan.typeset ? plan : null
  }
  /** every unit to translate in a snapshot: the whole translation, which alone can measure the final */
  const whole = snapshot => units.every(u => kept.has(u) || snapshot.has(u))
  /** a compile's references as complete as the original's: its citations defined, and as many entries in its
   *  bibliography (a pass set from an earlier pass's references may lack some, and a bibliography of another length
   *  moves every page after it) */
  const bibcites = text => (text ?? '').match(/\\bibcite\{/g)?.length ?? 0
  const referencesWhole = r => !/^(?:LaTeX|Package natbib) Warning: Citation .*undefined/m.test(lastTexLog(r.log)) && bibcites(r.aux) === bibcites(readings?.aux)
  /** the preview that can measure the final: the last of the whole translation, planned, shown */
  let measuring = null
  while (true) {
    // with the rule, the original right after the first preview: every plan after it is made from it
    if (readMarks && previews && !originalP) { await original(); continue }
    // a seeded run shows a preview only once no unit it would show in the source is left
    if (dirty && seed && !complete()) dirty = false
    if (dirty) {
      dirty = false
      const snapshot = new Map(translated), t0 = Date.now(), plan = planFor(snapshot)
      const r = await compile({ main: project.main, engine: strategy().engine, rerun: false, bibtex: !meta.bbl && !bbl, overrides: translationFiles(paper, snapshot, { strategy: strategy(), fonts, draft: true, aux: withCites(aux), bbl, typeset: plan?.typeset ?? null, note }) })
      if (r.aux) aux = r.aux
      if (r.bbl) bbl = r.bbl
      // shown only when it set every letter: a translation with letters missing is not one (Devin on #294); the note says
      // ok for what is shown, and with no strategy left the reader keeps what it has
      const shown = await settled(r)
      note('preview', { ok: shown, units: snapshot.size, ms: r.ms, roundTrip: Date.now() - t0, strategy: strategy().name, typeset: !!plan, error: shown ? undefined : whyFailed(r) ?? 'a letter it could not set' })
      if (shown) {
        previews++
        measuring = plan && whole(snapshot) ? { plan, strategy: strategy().name, r } : null
        onUpdate?.({ pdf: r.pdf, texts: texts(snapshot), translated: snapshot.size, final: false })
      } else if (plan && !r.ok && !timedOut(r)) { withoutRule(r); dirty = true }
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
  /**
   * The final's typesetting (plan.mjs finalTypesetting): measured by the last preview where it was of the whole
   * translation, under this strategy, and complete; else by a draft one-pass of the whole translation, planned — the
   * evaluation's rulings of 2026-10-01: no measuring compile of its own in full, the last preview measures. null where
   * no plan can be made: the final is set as today
   */
  const finalTypeset = async () => {
    if (!readMarks) return null
    if (!originalP) await original()
    const read = async r => { try { return await readMarks(r.pdf) } catch (e) { note('typeset', { missing: `a preview's marks (${String(e?.message ?? e).slice(0, 120)})` }); return null } }
    let m = measuring?.strategy === strategy().name && referencesWhole(measuring.r) ? measuring : null
    let fin = m && finalTypesetting(m.plan.state, { log: m.r.log, marks: await read(m.r) }, all)
    if (!fin?.typeset || fin.missing === 'a plan of the whole translation') {
      const plan = planFor(all)
      if (!plan) return null
      const t1 = Date.now()
      const r = await compile({ main: project.main, engine: strategy().engine, rerun: false, bibtex: !meta.bbl && !bbl, overrides: translationFiles(paper, all, { strategy: strategy(), fonts, draft: true, aux: withCites(aux), bbl, typeset: plan.typeset, note }) })
      note('measure', { ok: r.ok, ms: r.ms, roundTrip: Date.now() - t1, strategy: strategy().name, error: whyFailed(r) })
      // TeX's failure under the rule: the final as today (ruling 6); the page's, the plan uncorrected
      if (!r.ok) { if (timedOut(r)) return plan.typeset; withoutRule(r); return null }
      if (r.aux) aux = r.aux
      if (r.bbl) bbl = r.bbl
      m = { plan, r }
      fin = finalTypesetting(plan.state, { log: r.log, marks: await read(r) }, all)
    }
    note('typeset', { final: true, missing: fin.missing, faces: fin.faces.size, measured: m.r === measuring?.r ? 'preview' : 'draft' })
    return fin.typeset ?? m.plan.typeset
  }
  let typeset = await finalTypeset()
  let r, ok, retried = false, exhausted = false
  for (;;) {
    r = await compile({ main: project.main, engine: strategy().engine, rerun: true, bibtex: meta.bbl ? false : null, overrides: translationFiles(paper, all, { strategy: strategy(), fonts, draft: false, aux, bbl, typeset, note }) })
    ok = await settled(r)
    note('final', { ok, ms: r.ms, roundTrip: Date.now() - t0, previews, strategy: strategy().name, typeset: !!typeset, undefinedCitations: [...new Set([...(r.log ?? '').matchAll(/^(?:LaTeX|Package natbib) Warning: Citation [`']([^']+)' .*undefined/gm)].map(m => m[1]))].slice(0, 8), error: ok ? undefined : whyFailed(r) ?? 'a letter it could not set' })
    if (ok) break
    // not answered: once more with the same strategy, then what is shown stays — a slow machine is no reason to change
    // how the paper is set (Part 3's checks: a timed-out preview moved 2608.02163 to a strategy its class refuses)
    if (timedOut(r)) { if (retried) break; retried = true; note('final again', { strategy: strategy().name }); continue }
    if (typeset && !r.ok) { withoutRule(r); typeset = null; continue }
    if (s + 1 >= strategies.length) { exhausted = true; break }
    s++; aux = null
    note('next strategy', { strategy: strategy().name })
    // a plan is made for one strategy: the new one's, uncorrected, since what the preview measured was set by another
    // (the handoff, 6)
    typeset = planFor(all)?.typeset ?? null
  }
  if (ok) onUpdate?.({ pdf: r.pdf, texts: texts(all), translated: all.size, final: true })
  // marks known come only from a compile of the paper's own source that set (onOriginal)
  const own = marks && !originalP ? null : await original()
  return { previews, translated: translated.size, units: units.length, results, changed: true, settled: !!ok, exhausted, originalOk: !own || own.ok, stopped, missing: missing() }
}
