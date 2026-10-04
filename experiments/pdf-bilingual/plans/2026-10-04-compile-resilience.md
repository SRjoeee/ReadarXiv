# A compile that fails is not a paper that cannot be set: compile resilience — plan

Branch `exp/fix-compile-resilience` (from `origin/exp/pdf-bilingual` at `dec4573e`, the web app's pin), worktree
`.worktrees/fix-compile-resilience`. The investigation of 2026-10-04 (2610.02069, ja and zh: only the first few sentences
translated) is in the session's scratchpad (`bug-2610.02069/report.md`, its runs and probes; the paper's source and its
outputs stay there and never enter git: its licence is not known to allow it).

## What happened

The front end (103 units, whole) and the translation (103 of 103 back, ja and zh) were sound. After the first preview,
every compile failed: the chain gave up XeLaTeX + xeCJK, the CJKutf8 fallback could not set the paper either, the run
ended `exhausted`, and the reader kept the first preview (page 1) without a word while the progress line completed.
Two defects, either of which sinks the run in the browser (BusyTeX halts at the first TeX error), both still in
`dec4573e`:

- **A, the references a draft is given** (`live.mjs:96` `referencesOf`): the original's `\bibcite` lines alone. apacite
  writes every entry twice, `\bibcite` then `\APACbibcite`; with babel loaded after apacite, babel's `\bibcite` stores
  the entry wrapped in `\@safe@activesfalse`, and only the `\APACbibcite` line after it makes it clean again. Given the
  first alone, apacite's `\protected@edef\B@my@dummy` breaks at every citation (`! Illegal parameter number`), then
  `TeX capacity exceeded`. Every target language, every draft after the original.
- **B, a citation's own syntax** (`latex-front.mjs:152–166`, the generic branch at `:659–666`): apacite's
  `\cite<prenote>[postnote]{key}` is not read as one command, so its notes and its key go out as prose; `patch()`'s
  guard (`:890`) writes `\cite{}` before the translated `<`, and the key's `_` stands in running text: `! Missing $
  inserted`, the CJK after it set in a math font that lacks it.

And when every way failed, the reader said nothing (`session.mjs:2306` speaks only when nothing was ever shown).

## The maintainer's decision (2026-10-04)

Fix it now, generally, in five parts: (1) every citation line of the original's aux for a draft; (2) retry without the
run's own additions before the chain moves on; (3) a command's own delimited arguments read as part of it, and a guard
that does not cut a command from them; (4) a safety net: a unit the log places a failure in is set in the source and
the compile tried again; (5) the reader says when the translation can be shown only in part.

## Global constraints

- **General methods only.** Every rule holds for any input: no paper's id, no apacite-only name list. Where a rule
  needs a bound, the bound is stated and justified.
- **Tests first** for every behaviour, from **synthetic, minimal TeX** only (the 7-line apacite + babel file, a
  `\cite<...>[...]{key}` unit, a unit that breaks TeX). Never 2610.02069's own source.
- **The happy path is not touched in cost**: no extra compile, no extra pass, no new file a compile reads. Fixes 2 and 4
  compile only after a compile failed, and within a stated budget.
- **English** in every file written (`pnpm check:english` runs in `pnpm lint`). Chinese product copy goes into
  `src/locales/zh-CN.ts` only (outside the gate); tests reach it through `R.status.*` or `\u` escapes; the `docs/UI.md`
  row it adds raises that file's allowance in `scripts/english-allowlist.txt` by one, with the reason beside it.
- **Gate before each commit:** `pnpm typecheck && pnpm lint && pnpm test && pnpm build`, judged by exit code; the case
  spikes a task names. Files added by name, never `git add -A`; commits end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; no push without the maintainer.
- **Versions** move once, in the last engine task (see "Versions").

## Order of work

The two safety nets come first, so that they are proven on 2610.02069 **while its two faults are still in the code**:
the paper must settle through them (A through fix 2, B through fix 4). Then the two causes are fixed, and the same paper
must settle with no remedy at all.

| Task | Fix | What | Size |
|---|---|---|---|
| 1 | 2 | the remedy ladder in `runLive`, its first two rungs (the rule as today, the run's additions) | ~60 lines + tests |
| 2 | 4 | the third rung: units set in the source, located from the log; the lost-letter diagnosis | ~140 lines (new `tex-errors.mjs`) + tests |
| 3 | 1 | citation lines, `refs()`'s test the same rule | ~15 lines + tests |
| 4 | 3 | a command's delimited arguments; the guard | ~25 lines + tests |
| 5 | 5 | the reader's words when only part can be shown | ~40 lines + tests |
| 6 | — | versions, gates, the paper's runs, the record | — |

---

## Task 1 (fix 2): the ladder, and the run's own additions

**Files.**
- `src/pdf-reader/engine/live.mjs`: `translationFiles` (`:167`, EVEN_SPACES at `:178`); in `runLive`'s `compiles()`:
  `ruleFailed`/`withoutRule` (`:450–451`), `bibtexFor` (`:482`), the preview's failure branch (`:500`, `:512–516`), the
  measure (`:547–585`), the final (`:592–610`).
- `src/pdf-reader/engine/live.d.mts:12` (`translationFiles`' options: `evenSpaces?: boolean`).
- `tests/pdf-reader/live-sequence.test.ts` (the fake compiler is there).

**What it does.** A failed compile (not BusyTeX's timeout, which keeps today's handling) walks a ladder before the
chain moves on, the least lost first, one remedy per compile:

1. **The rule's TeX** (ruling 6, as today): only when the compile had a plan and TeX failed.
2. **The run's own additions**: the references a draft or the final is given (`refs(aux)`, `bblAt()`) and
   EVEN_SPACES' microtype, all left out in one compile.
3. **(Task 2)** The units the log places the failure in, set in the source.

A remedy that set the paper is kept for the strategy (the rule off as today; the additions off: `plainFor`). A remedy
that did not is **taken back** before the next rung, since it was not the cause: the rule comes back too, which
refines ruling 6 (open question 1). When the ladder is spent, the chain moves on as today; moving on clears the
episode (and Task 2's units). A failed compile's aux and bibliography are no longer taken over the last good ones
(`:500` takes them from any compile today: a run cut short wrote half an aux).

**Failing tests first** (append to `tests/pdf-reader/live-sequence.test.ts`; `paper()`, `MARKS`, `FONT_LOG`,
`linesLog`, `kindOf`, `translator` are the file's own):

```ts
describe('a compile that fails is tried again without what the run added, before the chain moves on', () => {
  /** what a compile is in any language: the translation's carry babel's \babelprovide, the original's do not */
  const kindAny = (q: Req) => (main(q).includes('AXT-FONTS') ? 'probe' : main(q).includes('\\babelprovide') ? (q.rerun ? 'final' : 'preview') : 'original')
  /** a translation compile fails where `bad` says (A's shape, or microtype's); the original's aux has a \bibcite */
  const failingWith = (bad: (q: Req) => boolean) => {
    const calls: { kind: string; aux: string | null; microtype: boolean; cjkutf8: boolean }[] = []
    const compile = async (q: Req): Promise<Compiled> => {
      const kind = kindAny(q), given = q.overrides.get('main.aux'), aux = given ? new TextDecoder().decode(given) : null
      calls.push({ kind, aux, microtype: /\{microtype\}/.test(main(q)), cjkutf8: /CJKutf8/.test(main(q)) })
      if (kind !== 'probe' && kind !== 'original' && bad(q)) return { ok: false, pdf: null, log: '! Illegal parameter number in definition of \\B@my@dummy.\n', ms: 1 }
      const made = kind === 'original' ? '\\citation{a}\n\\bibcite{a}{1}\n' : '\\citation{a}\n'
      return { ok: true, pdf: new Uint8Array([calls.length]), aux: made, bbl: null, log: kind === 'probe' ? FONT_LOG : linesLog(paper().units.length), ms: 1 }
    }
    return { calls, compile }
  }
  /** Chinese for every word, no batch held back (the file's translator() holds its second batch until released) */
  const go = async (c: ReturnType<typeof failingWith>, lang = 'zh') => {
    const notes: [string, Record<string, unknown>][] = [], p = paper()
    const translate = async (texts: string[]) => texts.map(text => ({ text: text.replace(/(?<![@a-z])[A-Za-z]{2,}/g, '\u8bba\u6587'), by: 'B' }))
    const r = await runLive(p, { lang, compile: c.compile, translate, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(p.units.length), note: (e: string, d: Record<string, unknown> = {}) => notes.push([e, d]) })
    return { r, notes }
  }

  it('the references it was given break TeX: set without them, the strategy kept', async () => {
    const c = failingWith(q => /\\bibcite/.test(new TextDecoder().decode(q.overrides.get('main.aux') ?? new Uint8Array())))
    const { r, notes } = await go(c)
    expect(r.settled).toBe(true)
    expect(notes.map(([e]) => e)).toContain('without additions')
    expect(notes.map(([e]) => e)).not.toContain('next strategy')
  })

  it("EVEN_SPACES' microtype breaks TeX under the paper's pdfLaTeX: set without it, the strategy kept", async () => {
    const c = failingWith(q => /\{microtype\}/.test(main(q)))
    const { r, notes } = await go(c, 'de')
    expect(r.settled).toBe(true)
    expect(notes.find(([e]) => e === 'final')?.[1]).toMatchObject({ ok: true, strategy: 'own engine' })
    expect(c.calls.filter(q => q.kind === 'final').at(-1)?.microtype).toBe(false)
  })

  it('without them it fails too: they come back for the compiles after, and the chain moves on as before', async () => {
    const c = failingWith(() => true)
    const { r, notes } = await go(c)
    expect(r.exhausted).toBe(true)
    // under pdfLaTeX + CJKutf8 the retry left microtype out; the next compile of that strategy has it again
    const k = c.calls.findIndex(q => q.cjkutf8 && !q.microtype)
    expect(k).toBeGreaterThan(-1)
    expect(c.calls.slice(k + 1).filter(q => q.cjkutf8).some(q => q.microtype)).toBe(true)
    expect(notes.map(([e]) => e)).toContain('additions back')
  })

  it('a compile that sets the paper pays nothing: the happy path compiles as before', async () => {
    const t = translator(), n = paper().units.length
    const c = compiler(n, { on: k => { if (k === 'original') t.release() } })
    const { calls } = await run({ compiler: c, translate: t.translate })
    expect(calls.map(q => `${q.kind}${q.ruled ? '+rule' : ''}`)).toEqual(['probe', 'preview', 'original', 'preview+rule', 'final+rule'])
  })
})
```

(The file's `kindOf` knows a translation compile by `xeCJK|CJKutf8`, which a German one lacks; `kindAny` knows it by
babel's `\babelprovide`, which every strategy's preamble adds and the original's lacks.)

**Implementation.**

`translationFiles` gains `evenSpaces = true`:

```js
export function translationFiles({ fsys, project, meta }, translated, { strategy, fonts, draft, aux, bbl, typeset = null, evenSpaces = true, spans = null, note = () => {} }) {
  // …
  main = localizeNames(main.slice(0, at)) + FORBIDDEN_TO_WARNING + strategy.pre(fonts) + NO_OVERFLOW + (xe || !evenSpaces ? '' : EVEN_SPACES) + main.slice(at)
```

In `compiles()`, beside `ruleFailed`:

```js
    // the strategies that set the paper only without the run's own additions to it — the references a compile is
    // given (the original's or a draft's aux and bibliography) and EVEN_SPACES' microtype —: without them from then on
    const plainFor = new Set()
    const plain = () => plainFor.has(strategy().name)
    /** what a compile of the translation is given beside it */
    const given = () => (plain() ? { aux: null, bbl: null, evenSpaces: false } : { aux: refs(aux), bbl: bblAt(), evenSpaces: true })
    /** whether a compile under the strategy now has an addition to leave out */
    const added = () => !plain() && (!!refs(aux) || (!!bblAt() && !meta.bbl) || !strategy().xe)
    /**
     * The failure being recovered from (`episode`): the rungs tried, the units' rounds (Task 2), and the remedy the
     * next compile tries. null once a compile under the strategy sets, and when the chain moves on. `spent`: the
     * compiles remedies have cost the run, a diagnosis included (Task 2); past SPENT_MAX the chain moves on as before
     */
    let episode = null, spent = 0
    const SPENT_MAX = 8
    /**
     * After a compile that did not set the translation: the next thing to leave out, the least lost first — none of it
     * is the strategy's, and the paper may well be set without it. A remedy tried that did not set the paper is taken
     * back first. Gives the rung taken, or null: none left
     */
    const remedy = async (r, ruled, at) => {
      const name = strategy().name
      episode ??= { tried: new Set(), rounds: 0, trying: null }
      if (episode.trying === 'rule') { ruleFailed.delete(name); note('typeset back', { strategy: name }) }
      if (episode.trying === 'plain') { plainFor.delete(name); note('additions back', { strategy: name }) }
      episode.trying = null
      if (spent >= SPENT_MAX) return null
      const take = how => { episode.trying = how; spent++; return how }
      if (!r.ok && ruled && !episode.tried.has('rule')) { episode.tried.add('rule'); withoutRule(r); return take('rule') }
      if (!r.ok && added() && !episode.tried.has('plain')) { episode.tried.add('plain'); plainFor.add(name); note('without additions', { strategy: name, error: whyFailed(r) }); return take('plain') }
      // Task 2: the units the log places the failure in (`at`: the compile's files and its units' lines)
      return null
    }
    /** a compile under the strategy set the translation: the remedy it tried is kept, and said */
    const recovered = () => { if (episode?.trying) note('recovered', { strategy: strategy().name, by: episode.trying }); episode = null }
    const nextStrategy = (why = {}) => { s++; aux = null; episode = null; note('next strategy', { strategy: strategy().name, ...why }) }
```

Every `translationFiles(...)` call for the translation (preview `:499`, measure `:549`, final `:594`) takes
`...given()` in place of `aux: refs(aux), bbl: bblAt()`. The preview (`:500`, `:508–516`):

```js
        if (r.ok && r.aux) aux = r.aux
        if (r.ok && r.bbl) bbl = r.bbl
        // …
        if (shown) { recovered(); previews++; /* as today */ }
        else if (timedOut(r)) { /* as today */ }
        else if (await remedy(r, !!plan, null)) dirty = true
        else if (s + 1 < strategies.length) { nextStrategy(); dirty = true }
        else episode = null
```

The measure (`:554–581`): the rule is what is measured, so its rung is the existing fallback after the loop (the final
as today); the ladder's other rungs go first:

```js
          if ((unset || (!r.ok && !timedOut(r))) && await remedy(r, false, null)) continue
          if (unset && s + 1 < strategies.length) { nextStrategy({ measure: whyUnset(r) }); continue }
          break
        }
        if (timedOut(r)) { passing = true; return plan.typeset }
        if (!r.ok) { episode = null; withoutRule(r); return null }
        recovered()
```

The final (`:597–609`): the rule's rung keeps the plan aside (`let planAside = null` beside `typeset`; not `held`,
which the preview loop has) so that it can come back:

```js
      if (ok) { recovered(); break }
      if (timedOut(r)) { /* as today */ }
      const back = episode?.trying === 'rule'
      const how = await remedy(r, !!typeset, null)
      if (back && planAside) { typeset = planAside; planAside = null }
      if (how === 'rule') { planAside = typeset; typeset = null; continue }
      if (how) continue
      if (s + 1 >= strategies.length) { exhausted = true; break }
      nextStrategy()
      typeset = planFor(all)?.typeset ?? null
```

**Verification.** The four tests; the file's existing sequence tests unchanged; `cache-cases.mjs` (a seeded run's compile
counts) exit 0.

---

## Task 2 (fix 4): a unit the log places a failure in, set in the source

**Files.**
- New `src/pdf-reader/engine/tex-errors.mjs` (+ `.d.mts`): `texErrors(log)`, `unitsAtErrors(errors, files, lines)`.
- `src/pdf-reader/engine/latex-front.mjs` `patch` (`:810`, the file loop `:898–913`): an optional `spans` collector
  (`latex-front.d.mts:10`).
- `src/pdf-reader/engine/live.mjs`: `translationFiles` returns the units' lines in the files it writes (`spans` out);
  `compiles()`: the third rung, `inSource`, the diagnosis; every place a snapshot is set (`:498`, `:533` `all`, `:459`
  `whole`, `:487` `complete`, `:612–621` the record's `inSource`).
- Tests: new `tests/pdf-reader/tex-errors.test.ts`; `tests/pdf-reader/latex-front.test.ts` (spans);
  `tests/pdf-reader/live-sequence.test.ts` (the rung).
- New `experiments/pdf-bilingual/spikes/compile-resilience-cases.mjs` (native, Docker) and two cases in
  `spikes/typeset-busytex-cases.mjs` (BusyTeX).

**Why not the marks alone.** `\axtmark{<i>s}` and `\axtend{<i>e}` are only on prose units (`markUnits`, `:1137`: no
heading, cell, figure text or front matter), and they stand inside a unit, not around all of it. `patch()` writes every
unit and knows each one's exact range, so it says it: `spans` gives `{ file, unit, from, to }` in byte offsets of
the file it writes, for every top-level unit. A nested unit (a footnote) is located by its top-level unit, and setting
that one in the source sets its nested units in the source too.

**Locating a failure.** These rules hold for native nonstop latexmk and for halt-on-error BusyTeX alike:
- **The errors.** In the last TeX pass's log (`lastTexLog`), each `! <message>` block with its `l.<n> <before>` line and
  the `<after>` line under it. Under halt-on-error there is one; under nonstop, all.
- **The file.** A unit's translation is written on its unit's lines, so line `n` of the file TeX was reading is
  enough, once the file is known. The file is a TeX file the compile was given, with line `n` covered by a unit and its
  text holding the error's context:
  - `before`'s tail and `after`'s head, whitespace collapsed, `^^xx` taken out;
  - compared with the line decoded as Latin-1 and as UTF-8, since a native log is read as Latin-1 and BusyTeX's as
    text.
  - The context is checked even in a paper of one TeX file: it is what keeps a package's own line `n` off the unit on
    the paper's line `n`. Two candidate files, or none, place nothing.
- **What does not count.** An error the paper's own compile raised (its message is in the original's log) is the
  paper's. A unit not translated in this compile is already in the source.
- **Lost letters, no TeX error to place them.** The same compile, one pass, with `\AtBeginDocument{\tracinglostchars=3
  \relax}` (TeX Live 2021 on: each lost letter an error at its place). Verified natively on TeX Live 2026: XeTeX gives
  `! Missing character: There is no ... (U+3067) in font ...` then `l.6 Text $x$ and ...`, and pdfTeX the same form.
  - Only after a compile was judged unsettable for letters the original does not lose.
  - Errors for letters the original lost are skipped.
- **Bounds.** At most 3 rounds and `max(3, ceil(2 % of the units))` units in the source per strategy. A failure placed
  in more units than that is the paper's or the strategy's, not a unit's: 2610.02069's fault A stands in about ten of
  its 103 units, its fault B in one. All remedies of the run, diagnoses included, stay within `SPENT_MAX` (8).

**Failing tests first.**

`tests/pdf-reader/tex-errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { texErrors, unitsAtErrors } from '@/pdf-reader/engine/tex-errors.mjs'

const enc = (s: string) => new TextEncoder().encode(s)
const MAIN = ['\\documentclass{article}', '\\begin{document}', 'A first paragraph, untouched.', '', 'TRANSLATED with \\cite{}<>[\\url{x}]{ modified _ code } here.', '', 'A last one.', '\\end{document}'].join('\n')
// the lines of main.tex each unit stands on, as translationFiles gives them
const LINES = [{ file: 'main.tex', unit: 'u0', first: 3, last: 3 }, { file: 'main.tex', unit: 'u1', first: 5, last: 5 }, { file: 'main.tex', unit: 'u2', first: 7, last: 7 }]

describe('texErrors: what TeX stopped at, and where it was reading', () => {
  it('reads a block under nonstop and under halt-on-error alike, an inserted text between', () => {
    const log = ['! Missing $ inserted.', '<inserted text> ', '                $', 'l.5 ...cite{}<>[\\url{x}]{ modified _', '                                      code } here.', '', 'No pages of output.'].join('\n')
    expect(texErrors(log)).toEqual([{ message: 'Missing $ inserted.', line: 5, before: 'cite{}<>[\\url{x}]{ modified _', after: 'code } here.' }])
  })
  it('a lost letter made an error by \\tracinglostchars=3, its message on two lines', () => {
    const log = '! Missing character: There is no \u3067 (U+3067) in font [lmroman10-regular]:mapping\n=tex-text;.\nl.6 Text $x$ and \u3067 \n                   here.\n'
    expect(texErrors(log)[0]).toMatchObject({ line: 6, message: expect.stringMatching(/^Missing character/) })
  })
  it('an error with no line of input (a shipout, the end of the job) is none it can place', () => {
    expect(texErrors('! Emergency stop.\n<*> main.tex\n')).toEqual([])
  })
})

describe('unitsAtErrors: the units whose lines hold the errors', () => {
  const files = new Map([['main.tex', enc(MAIN)], ['main.aux', enc('\\relax\n'.repeat(9))]])
  it('the unit on the error\'s line, its context found there; never a line of a file no unit is in', () => {
    const errors = [{ message: 'Missing $ inserted.', line: 5, before: 'cite{}<>[\\url{x}]{ modified _', after: 'code } here.' }]
    expect(unitsAtErrors(errors, files, LINES)).toEqual(['u1'])
  })
  it('a context that line does not hold places nothing (an error in a package\'s own line 5)', () => {
    expect(unitsAtErrors([{ message: 'Undefined control sequence.', line: 5, before: '\\def\\x{\\y', after: '}' }], files, LINES)).toEqual([])
  })
  it('a blank line between units is in none (a paragraph that ended inside an argument)', () => {
    expect(unitsAtErrors([{ message: 'Paragraph ended before \\@@cite was complete.', line: 6, before: '', after: '' }], files, LINES)).toEqual([])
  })
})
```

`tests/pdf-reader/live-sequence.test.ts`, the rung. The translator keeps each paragraph's number, so unit 7's
translation is the one line that holds `\u8bba\u6587 7 \u8bba\u6587`:

```ts
describe('a unit the log places the failure in is set in the source, and the compile tried again', () => {
  const T = '\u8bba\u6587'
  const numbered = { translate: async (texts: string[]) => texts.map(text => ({ text: text.replace(/(?<![@a-z])[A-Za-z]{2,}/g, T), by: 'B' })) }
  /** TeX on unit 7's translation: an error at its line (halt: no PDF), or the error and a letter lost (nonstop) */
  const breaking = (mode: 'halt' | 'nonstop') => {
    const calls: { kind: string; has7: boolean }[] = []
    const compile = async (q: Req): Promise<Compiled> => {
      const kind = kindOf(q), lines = main(q).split('\n'), n = lines.findIndex(l => l.includes(`${T} 7 ${T}`)) + 1
      calls.push({ kind, has7: n > 0 })
      if (kind === 'probe') return { ok: true, pdf: null, log: FONT_LOG, ms: 1 }
      if (n > 0) {
        const at = lines[n - 1] as string, k = at.indexOf(`${T} 7`) + 4
        const block = `! Missing $ inserted.\n<inserted text> \n                $\nl.${n} ${at.slice(Math.max(0, k - 30), k)}\n    ${at.slice(k, k + 30)}\n`
        if (mode === 'halt') return { ok: false, pdf: null, log: block, ms: 1 }
        return { ok: true, pdf: new Uint8Array([1]), aux: null, bbl: null, log: `${block}Missing character: There is no ${T[0]} (U+8BBA) in font cmmi10!\n${linesLog(12)}`, ms: 1 }
      }
      return { ok: true, pdf: new Uint8Array([calls.length]), aux: null, bbl: null, log: linesLog(12), ms: 1 }
    }
    return { calls, compile }
  }
  for (const mode of ['halt', 'nonstop'] as const) {
    it(`${mode}: unit 7 alone set in the source, said, and kept so in the record; the strategy kept`, async () => {
      const c = breaking(mode), notes: [string, Record<string, unknown>][] = [], p = paper()
      const r = await runLive(p, { lang: 'zh', compile: c.compile, translate: numbered.translate, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(p.units.length), note: (e: string, d: Record<string, unknown> = {}) => notes.push([e, d]) })
      expect(r.settled).toBe(true)
      expect(notes.find(([e]) => e === 'in source')?.[1]).toMatchObject({ units: [7] })
      expect(notes.map(([e]) => e)).not.toContain('next strategy')
      expect((r.results.get(7) as { inSource?: boolean }).inSource).toBe(true)
      expect((r.results.get(6) as { inSource?: boolean }).inSource).toBeUndefined()
      expect(c.calls.filter(q => q.kind === 'final').every(q => !q.has7)).toBe(true)
    })
  }
  it('a failure in every unit is no unit\'s: per strategy at most the bound set in the source, then the chain moves on', async () => {
    // every translated line breaks TeX
    const calls: string[] = []
    const compile = async (q: Req): Promise<Compiled> => {
      const kind = kindOf(q), lines = main(q).split('\n'), n = lines.findIndex(l => l.includes(T)) + 1
      calls.push(kind)
      if (kind === 'probe') return { ok: true, pdf: null, log: FONT_LOG, ms: 1 }
      if (n > 0 && kind !== 'original') return { ok: false, pdf: null, log: `! Undefined control sequence.\nl.${n} ${(lines[n - 1] as string).slice(0, 20)}\n  x\n`, ms: 1 }
      return { ok: true, pdf: new Uint8Array([1]), aux: null, bbl: null, log: linesLog(12), ms: 1 }
    }
    const notes: [string, Record<string, unknown>][] = [], p = paper()
    const r = await runLive(p, { lang: 'zh', compile, translate: numbered.translate, format: 'markers', marks: new Map(), identity: 'B', readMarks: async () => MARKS(p.units.length), note: (e: string, d: Record<string, unknown> = {}) => notes.push([e, d]) })
    expect(r.exhausted).toBe(true)
    // twelve units: the bound is max(3, ceil(2 % of 12)) = 3 per strategy, and 8 remedy compiles in all
    for (const name of ['XeLaTeX + xeCJK', 'pdfLaTeX + CJKutf8']) expect(notes.filter(([e, d]) => e === 'in source' && d.strategy === name).flatMap(([, d]) => d.units as number[]).length).toBeLessThanOrEqual(3)
    expect(notes.filter(([e]) => ['in source', 'without additions', 'typeset failed'].includes(e)).length).toBeLessThanOrEqual(8)
  })
})
```

`tests/pdf-reader/latex-front.test.ts`: `patch(p, translated, { spans })` gives one span per top-level unit, in file
order, whose bytes are that unit's rendering, and a footnote is inside its paragraph's span. The patched bytes are the
same with `spans` and without (`patch-identity.mjs` runs on the corpus too).

`spikes/compile-resilience-cases.mjs` (native, Docker; exits non-zero on a failure):
- A unit of a synthetic article that breaks TeX (`\foo_bar` in text) under `xelatex -halt-on-error` and under nonstop
  `latexmk -f`: `unitsAtErrors(texErrors(log), files, lines)` names that unit, from `translationFiles`' own outputs.
- The `\tracinglostchars=3` diagnosis under pdflatex and xelatex: a lost letter becomes an error with its `l.<n>`.

The same two cases go into `spikes/typeset-busytex-cases.mjs`, from BusyTeX's joined log through `lastTexLog`.

**Implementation.**

`tex-errors.mjs`:

```js
// A compile's TeX errors and the units they stand in (live.mjs's safety net, plans/2026-10-04-compile-resilience.md)
import { lastTexLog, latin1 } from './latex-front.mjs'
import { utf8 } from './mt.mjs'

/** TeX's errors in a compile's last pass, each with the line of input TeX was reading and the text around its place:
 *  { message, line, before, after }. An error with no line of input (`<*>`, `<output>`) is left out */
export function texErrors(log) {
  const lines = lastTexLog(log ?? '').split('\n'), out = []
  for (let k = 0; k < lines.length; k++) {
    if (!lines[k].startsWith('! ')) continue
    let message = lines[k].slice(2)
    for (let j = k + 1; j < Math.min(lines.length, k + 40) && !lines[j].startsWith('! '); j++) {
      const m = /^l\.(\d+) ?(.*)$/.exec(lines[j])
      if (!m) { if (j === k + 1 && !/^[<\\]/.test(lines[j]) && lines[j].trim()) message += lines[j]; continue }
      out.push({ message, line: Number(m[1]), before: m[2].replace(/^\.\.\./, ''), after: (lines[j + 1] ?? '').trim().replace(/\.\.\.$/, '') })
      break
    }
  }
  return out
}
const squeeze = s => s.replace(/\^\^[0-9a-f]{2}/g, '').replace(/\s+/g, '')
/** whether a line holds an error's context: the last 12 characters before its place and the first 12 after, either
 *  decoding of the line's bytes */
const holds = (bytes, e) => {
  const b = squeeze(e.before).slice(-12), a = squeeze(e.after).slice(0, 12)
  return [latin1(bytes), utf8(bytes)].some(t => { const l = squeeze(t); return (!b || l.includes(b)) && (!a || l.includes(a)) })
}
/**
 * The units whose lines hold the errors: `files`, path → the bytes a compile was given; `lines`, each unit's
 * { file, unit, first, last } in them (translationFiles' `spans`). A line two units share, a file no unit is in, or a
 * line of another file the paper also has that many lines in, and holding the context too, place nothing
 */
export function unitsAtErrors(errors, files, lines) {
  const out = new Set()
  for (const e of errors) {
    const at = lines.filter(x => x.first <= e.line && e.line <= x.last)
    const fit = [...new Set(at.map(x => x.file))].filter(f => { const t = files.get(f); return t && holds(lineBytes(t, e.line), e) })
    if (fit.length !== 1) continue
    const here = at.filter(x => x.file === fit[0])
    if (here.length === 1) out.add(here[0].unit)
  }
  return [...out]
}
const lineBytes = (bytes, n) => { let at = 0; for (let k = 1; k < n; k++) { at = bytes.indexOf(10, at) + 1; if (!at) return new Uint8Array() } const end = bytes.indexOf(10, at); return bytes.subarray(at, end < 0 ? bytes.length : end) }
```

`patch()`'s file loop keeps the size of what it has written, and pushes a span per top-level unit:

```js
export function patch(project, translated, { guardControlWords = true, mark, spans = null } = {}) {
  // …
    let size = 0
    const add = b => { parts.push(b); size += b.length }
    const copy = (from, to) => {
      for (const [pos, bytes] of inserts) if (pos >= from && pos < to) { add(bytesOf(text.slice(from, pos), enc)); bytes.forEach(add); from = pos }
      add(bytesOf(text.slice(from, to), enc))
    }
    let at = 0
    for (const u of us) { if (u.start < at) continue; copy(at, u.start); const b = render(u); spans?.push({ file, unit: u, from: size, to: size + b.length }); add(b); at = u.end }
```

`translationFiles(…, { spans })` turns them into lines of the files as written. Its own edits (the preamble's additions,
the shims, `localizeNames`) come after `patch`, so each span's bytes are found again in the written file, in order, from
the last one's end, and given as `{ file, unit, first, last }` (1-based lines):

```js
  const raw = spans ? [] : null
  const out = patch(project, translated, { mark, spans: raw })
  const patched = new Map(out) // the bytes patch wrote, before this function's own edits
  // … the edits, as today …
  if (spans) spans.push(...linesOf(raw, patched, out))

/** each unit's span found again in the file as written, as the lines it stands on */
const linesOf = (raw, patched, out) => {
  const found = []
  for (const [file, list] of Map.groupBy(raw, x => x.file)) {
    const was = latin1(patched.get(file)), now = latin1(out.get(file) ?? patched.get(file))
    let cursor = 0, line = 1, counted = 0
    const lineAt = k => { for (; counted < k; counted++) if (now.charCodeAt(counted) === 10) line++; return line }
    for (const x of list) {
      const k = now.indexOf(was.slice(x.from, x.to), cursor)
      if (k < 0) continue
      cursor = k + (x.to - x.from)
      found.push({ file, unit: x.unit, first: lineAt(k), last: lineAt(cursor - 1) })
    }
  }
  return found
}
```

A unit set in the source is set with every unit nested in it (`withNested`, below): a footnote's error is placed in its
paragraph's span, and its paragraph's source still holds the footnote's translated piece otherwise.

In `compiles()`, the units set in the source and the third rung:

```js
    // the units a compile under this strategy could not set translated (the safety net): set in the source until the
    // chain moves on — another strategy may set them — and so in the record (`inSource`)
    const inSource = new Set(), indexOf = new Map(units.map((u, i) => [u, i]))
    const ROUNDS = 3, IN_SOURCE_MAX = Math.max(3, Math.ceil(units.length * 0.02))
    /** a unit and every unit nested in it (a footnote, an author's note): set in the source together */
    const withNested = u => [u, ...u.pieces.filter(p => p.t === 'nested').flatMap(p => withNested(p.unit))]
    /** a snapshot as a compile sets it: the units set in the source left out */
    const setting = snap => { if (!inSource.size) return snap; const m = new Map(snap); for (const u of inSource) m.delete(u); return m }
    /** the paper's own errors, which no unit of a translation is the cause of */
    const ownErrors = async () => new Set(texErrors((await original()).log).map(e => e.message))
    /** the units a failed compile's log places its failure in (`at`: its files and its units' lines) */
    const unitsOf = async (r, at, q) => {
      const own = await ownErrors()
      let errors = texErrors(r.log).filter(e => !own.has(e.message))
      if (!errors.length && r.ok && lostIn(r.log).size && spent < SPENT_MAX) {
        spent++
        const known = lostIn((await original()).log)
        const d = await ask({ ...q, rerun: false, bibtex: false, overrides: tracked(q.overrides, project.main) })
        errors = texErrors(d.log).filter(e => /^Missing character/.test(e.message) && !known.has(charOf(e.message)))
      }
      return unitsAtErrors(errors, at.files, at.lines).filter(u => at.snapshot.has(u) && !inSource.has(u))
    }
```

and in `remedy`, after the second rung:

```js
      if (at) {
        const found = await unitsOf(r, at, at.ask)
        if (found.length && episode.rounds < ROUNDS && inSource.size + found.length <= IN_SOURCE_MAX && spent < SPENT_MAX) {
          episode.rounds++
          for (const u of found.flatMap(withNested)) inSource.add(u)
          note('in source', { strategy: name, units: found.map(u => indexOf.get(u)), error: whyFailed(r) ?? whyUnset(r) })
          return take('units')
        }
      }
```

`nextStrategy` also clears `inSource`. Each call site keeps what it gave the compile (`{ snapshot, files: overrides,
lines: spans, ask: req }`) and passes it as `at`. `tracked(overrides, main)` is the main file with
`\AtBeginDocument{\tracinglostchars=3\relax}` before `\documentclass`, and `charOf` reads the code point out of the
message, as `lostIn` does. The units set in the source count as done wherever the run asks whether a translation is
whole. `whole` (`:459`) and `complete` (`:487`) read `kept.has(u) || inSource.has(u) || snapshot.has(u)`.

Every compile sets `setting(snapshot)`: the preview's snapshot (`:498`), `all` in the measure and the final, `planFor`'s
input and `texts(...)` for the anchors (a unit set in the source is shown with its source's text). After a final that
set, `typesetBy(setting(all), strategy())` (`:615`) marks the units set in the source `inSource: true` in the results,
the field the record already keeps (cache.mjs `inSourceOf`). A copy that sets them so is current, so the next visit
compiles nothing: they are tried again only after a version bump, a service change, or a change to the paper
(corrected after the reviews, below; the failure note counts them on every visit meanwhile).

**Verification.** The tests; `compile-resilience-cases.mjs` and `typeset-busytex-cases.mjs` exit 0; and **2610.02069
with Tasks 1–2 only** (faults A and B still in the code): it must settle, ja and zh, native and `SLOW HALT`:
- under XeLaTeX + xeCJK;
- with `without additions` noted (A) and `in source` noted for unit 99 alone (B);
- with no `next strategy`.

---

## Task 3 (fix 1): every citation line of the original's aux

**Files.** `src/pdf-reader/engine/live.mjs`: `auxLines` (`:93`), `referencesOf` (`:96`), `refs` (`:418`); a new
exported `citationLines(aux)` (+ `live.d.mts`). Tests: `tests/pdf-reader/live-sequence.test.ts`,
`spikes/compile-resilience-cases.mjs`.

**The rule.** A citation's line is a closed aux line whose first argument is a key the aux cites: a key of a
`\citation{...}` line, or of a `\bibcite{...}` one (`\nocite{*}` cites keys no `\citation` line names). The `\citation`
lines themselves are excluded, since a draft writes its own. This takes `\bibcite`, `\APACbibcite`, `\harvardcite`,
`\backcite`, apacite's `\definemetaflag` and any other package's citation command, in the aux's order, so a later line
still overrides an earlier one as in the original's own passes. biblatex's `\abx@aux@*` lines name a refsection first and
are left out; biblatex's drafts read the bibliography. `refs()`'s question, "the draft's own aux has citations of its
own", is the same rule.

**Failing tests first.**

```ts
import { citationLines } from '@/pdf-reader/engine/live.mjs'

describe("citationLines: every line of an aux for a key it cites, in its order", () => {
  it('apacite\'s second line, harvard\'s, backref\'s; not \\citation, not a label, not a line cut short', () => {
    const aux = ['\\relax', '\\citation{smith,jones}', '\\bibcite{smith}{\\citeauthoryear{Smith}{Smith}{{\\APACyear{2001}}}}', '\\APACbibcite{smith}{\\citeauthoryear{Smith}{Smith}{{\\APACyear{2001}}}}', '\\harvardcite{jones}{Jones}{Jones}{1999}', '\\backcite{smith}{{1}{1}{section.1}}', '\\newlabel{sec:a}{{1}{1}}', '\\@writefile{toc}{x}', '\\bibcite{cut}{{1}'].join('\n')
    expect(citationLines(aux).split('\n')).toEqual(aux.split('\n').slice(2, 6))
  })
  it('\\nocite{*}: the keys \\bibcite names', () => {
    expect(citationLines('\\citation{*}\n\\bibcite{a}{1}\n\\APACbibcite{a}{1}\n')).toBe('\\bibcite{a}{1}\n\\APACbibcite{a}{1}')
  })
})
```

And in `runLive`: a fake compiler whose original's aux holds `\citation{a}`, `\bibcite{a}{W}`, `\APACbibcite{a}{C}`.
The next draft's `main.aux` must end with those two lines, in that order. Natively (`compile-resilience-cases.mjs`):
- **The document:** the 7-line minimal file (article; `apacite`, then `babel[english]`; two `\cite`s; `\bibliography`
  of a synthetic two-entry `.bib`), compiled in full.
- **Given only its `\bibcite` lines:** a one-pass draft fails with `Illegal parameter number in definition of
  \B@my@dummy`. This case documents the fault.
- **Given `citationLines(aux)`:** 0 errors under pdflatex and xelatex, and under `-halt-on-error`.

**Implementation.**

```js
/** every closed line of an aux whose first argument is a key it cites — a \citation's or a \bibcite's —, \citation's
 *  own left out, in the aux's order: apacite's \APACbibcite after its \bibcite (which babel loaded after apacite
 *  wraps, and only the second makes whole again: 2610.02069), harvard's \harvardcite, backref's \backcite */
export const citationLines = aux => {
  const all = (aux ?? '').split('\n').filter(closed), keys = new Set()
  for (const l of all) { const m = /^\\(citation|bibcite)\{([^}]*)\}/.exec(l); if (m) for (const k of m[2].split(',')) keys.add(k.trim()) }
  return all.filter(l => { const m = /^\\([A-Za-z@]+)\{([^{}]*)\}/.exec(l); return m && m[1] !== 'citation' && keys.has(m[2].trim()) }).join('\n')
}
const referencesOf = o => ({ cites: citationLines(o.aux), labels: auxLines(o.aux, 'newlabel'), bbl: o.bbl ?? null })
    const refs = a => (a ? (!originalRefs.cites || citationLines(a) ? a : `${a}\n${originalRefs.cites}`) : [originalRefs.labels, originalRefs.cites].filter(Boolean).join('\n') || null)
```

`referencesWhole`'s count (`:465`, `\bibcite` lines on both sides) stays as it is: both sides keep the same number of
`\bibcite` lines.

**Verification.** The tests; the case spike; 2610.02069 after Task 3: no `without additions` note.

---

## Task 4 (fix 3): a command's own delimited arguments; the guard

**Files.** `src/pdf-reader/engine/latex-front.mjs`: the generic command branch (`:659–666`); a new
`delimitedAfter`; `patch()`'s guard (`:888–890`). Tests: `tests/pdf-reader/latex-front.test.ts`.

**The rule, general and with no list of names.** TeX reads `<...>` and `(...)` after a command only when the command
looks for them. Examples: apacite's prenote `\cite<e.g.,>[...]{k}`, biblatex's multicite notes
`\cites(pre)(post)[...]{a}[...]{b}`, picture-mode `\makebox(w,h)[...]{...}`. Prose has no `<`, and its parentheses
follow a space. So, for a command with a letter name, not in `NO_ARGS` and not of fixed arity (`ARITY`), the walker
takes these as the command's own, then its `[...]` and `{...}` as today:
- a `<...>` right after the name, spaces allowed (TeX's `\@ifnextchar` skips them);
- a `(...)` touching it.

Each group must close within 300 characters, inside the paragraph, braces balanced. Otherwise it is prose, as today.
The command's keys are then inside its placeholder and are never sent. This holds for natbib (`[...][...]{...}`, as
today), biblatex, apacite and harvard (`\citeaffixed{k}{pre}`, as today) with no name named.

**The guard.** `{}` was put after a control word before any translated text but a space, `{` or `[`, because XeTeX
reads CJK characters as letters (`\method` followed by a CJK character is one control word). It is needed only before
a letter. A single space ends the name just as well and is no token (TeX skips it after a control word), so whatever
the command reads next it reads as in the source: `\@ifnextchar` still sees `<`, `(` or `[`, and an undelimited
argument is still the next token. So:
- before a letter (`\p{L}`, `\p{M}` or `@`), a space;
- before `*`, `{}` as today (a space would not stop `\@ifstar`);
- before anything else, nothing.

**Failing tests first.**

```ts
describe("a command's own delimited arguments are part of it, its keys never prose", () => {
  const enc = (s: string) => new TextEncoder().encode(s)
  const unitsOf = (body: string) => loadProject(inMemory(new Map([['main.tex', enc(`\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`)]])), 'main.tex').units as Unit[]
  const phs = (u: Unit) => u.pieces.filter(p => p.t === 'ph').map(p => (p as unknown as { src: string }).src)
  const prose = (u: Unit) => u.pieces.filter(p => p.t === 'text').map(p => p.s).join('')
  it("apacite's prenote and postnote, and its key", () => {
    const [u] = unitsOf('As shown before \\cite<e.g.,>[p.~5]{smith_jones}, the effect holds.') as [Unit]
    expect(phs(u)).toEqual(['\\cite<e.g.,>[p.~5]{smith_jones}'])
    expect(prose(u)).not.toMatch(/smith|jones|e\.g\.|p\.~5/)
  })
  it('a space before < too, as \\@ifnextchar reads it', () => {
    const [u] = unitsOf('The code is archived \\cite <>[available at \\url{https://example.org}]{modified_code} for all.') as [Unit]
    expect(phs(u)).toEqual(['\\cite <>[available at \\url{https://example.org}]{modified_code}'])
  })
  it("biblatex's multicite notes", () => {
    const [u] = unitsOf('Both hold \\cites(see)(and more)[12]{alpha}[3]{beta} in general.') as [Unit]
    expect(phs(u)).toEqual(['\\cites(see)(and more)[12]{alpha}[3]{beta}'])
  })
  it('prose parentheses after a space stay prose; a < with no > stays prose', () => {
    const [u] = unitsOf('We use \\LaTeX (a typesetting system) and \\eg < some words with no close.') as [Unit]
    expect(prose(u)).toContain('(a typesetting system)')
    expect(prose(u)).toContain('< some words with no close.')
  })
})

describe("patch: a control word ended where a translated letter would run on, and nowhere else", () => {
  const out = (body: string, tr: (s: string) => string) => {
    const p = loadProject(inMemory(new Map([['main.tex', new TextEncoder().encode(`\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`)]])), 'main.tex')
    const units = p.units as Unit[]
    const translated = new Map(units.map(u => [u, u.pieces.map(x => (x.t === 'text' ? { ...x, tr: true, s: tr(x.s ?? '') } : x))]))
    return new TextDecoder().decode(patch(p, translated as Map<(typeof p.units)[number], unknown[]>).get('main.tex'))
  }
  it('a space before a letter, not {}', () => expect(out('Using \\method we see it.', s => s.replace(/^ we/, '\u540e'))).toContain('\\method \u540e'))
  it('nothing before < or (', () => {
    expect(out('Using \\method we see it.', s => s.replace(/^ we/, '(\u540e'))).toContain('\\method(\u540e')
    expect(out('Using \\method we see it.', s => s.replace(/^ we/, '<\u540e'))).toContain('\\method<\u540e')
  })
  it('{} before * still', () => expect(out('Using \\method we see it.', s => s.replace(/^ we/, '*\u540e'))).toContain('\\method{}*'))
})
```

**Implementation.**

```js
/**
 * Past the groups TeX reads only as a command's own: a `<…>` right after its name, spaces allowed (\@ifnextchar skips
 * them, and prose has no `<`) — apacite's prenote; a `(…)` touching it — biblatex's multicite notes, picture mode's
 * coordinates; each closed within 300 characters of the paragraph, braces balanced. Where none, `i`
 */
function delimitedAfter(s, i, to) {
  for (;;) {
    const k = s[i] === '(' ? i : skipSpaces(s, i), close = { '<': '>', '(': ')' }[s[k]]
    if (!close || (s[k] === '(' && k !== i)) return i
    const e = matchGroup(s, k, s[k], close), lim = Math.min(to, k + 300)
    if (e < 0 || e > lim || /\n[ \t]*\n/.test(s.slice(k, e)) || matchGroup(`{${s.slice(k + 1, e - 1)}}`, 0) < 0) return i
    i = e
  }
}
```

In the generic branch (`:661`), after `let from = end`:

```js
    if (/^[A-Za-z@]+$/.test(name) && !NO_ARGS.has(name) && !ARITY.has(name)) from = delimitedAfter(s, from, to)
```

The guard (`:888–890`):

```js
      // XeTeX reads CJK characters as letters: \method and the CJK character after it would be one control word. A space
      // ends the name and is no token — TeX skips it after a control word —, so the command reads what it read in the
      // source (\@ifnextchar's <, ( or [, an undelimited argument's next token); before * a group, which \@ifstar does
      // not pass
      const next = pieces[k + 1], word = /\\[A-Za-z@]+$/.test(p.src)
      if (guardControlWords && word && next?.t === 'text' && next.tr) {
        if (/^[\p{L}\p{M}@]/u.test(next.s)) parts.push(utf8Bytes(' '))
        else if (next.s.startsWith('*')) parts.push(utf8Bytes('{}'))
      }
```

(The comment at `:888` spells its example with a CJK character today; the new one says it in words, so
`scripts/english-allowlist.txt`'s entry for `latex-front.mjs` goes from 5 to 4 and drops "a control word glued to a
CJK character, quoted" from its reason: the gate fails on an allowance larger than the file holds.)

**Verification.** The tests; `front-gate.mjs` against a snapshot taken at `dec4573e` (no paper should move by 5 %; any
paper listed is inspected, and its moved text must be a command's `<...>` or `(...)` argument); `patch-identity.mjs`
all ok; `lang-gate.mjs --check` (see below); 2610.02069 after Task 4: unit 99 one placeholder, no `in source` note.

---

## Task 5 (fix 5): the reader says when the translation can be shown only in part

**Where it is today.**
- `session.mjs:2306`: `exhausted` is said (`fail('cannot typeset', ...)`, the original shown, the translated displays
  greyed, S-R-17) only when nothing was ever shown (`!compiledOnce && !cached`).
- Otherwise the run falls through, keeps its last preview, and `'done'` ends the progress line.
- The words reach the screen as a capsule: `controller.ts:136` (`'fail'`), `ui/status.ts:23` `capsuleOf`,
  `ui/StatusCapsule.tsx:66–80`.
- The register is S-R-17/18 (`docs/UI.md:257–258`): it says what, never why, offers the HTML version where there is
  one, and names no technical path (`tests/pdf-reader/ui/copy.test.ts`'s `TECHNICAL`).

**What it does.**
- **The condition.** The run is exhausted, did not stop for the service, a preview of this visit is on screen, and no
  final is (`compiledOnce && !finalShown`).
- **The session** emits `{ type: 'html', url }` (the HTML version, as for S-R-17) and then
  `{ type: 'fail', event: 'shown in part' }`. It keeps the preview, and changes neither the display nor what is greyed.
- **The controller** sets `partial: true` (a new `ReaderState` field, `false` in `INITIAL`, cleared by `'translating'`).
- **The capsule** is `{ kind: 'partial', text: R.status.partial, href? }`:
  - its action is S-R-18's `useHtml` where there is an HTML version;
  - it can be closed (S-R-15), like the notice of passages that failed;
  - it is checked before that notice.
- The decision is a pure function, `endOf({ exhausted, stopped }, { compiledOnce, finalShown, cached })` →
  `'cannot typeset' | 'shown in part' | null`. It goes in `cache.mjs` beside `unsetAfter`, so that it can be tested
  without the DOM.

**The words** (S-R-19; product copy, the maintainer to approve):
- zh-CN: `\u8fd9\u7bc7\u8bba\u6587\u53ea\u80fd\u663e\u793a\u90e8\u5206\u8bd1\u6587\uff0c\u5176\u4f59\u4e3a\u539f\u6587` —
  "this paper can show only part of its translation; the rest is the original".
- en: `Only part of this paper's translation can be shown; the rest is in the original`.
- Its action, where arXiv has an HTML version, is S-R-18 as it is; it can be closed (S-R-15).

**Failing tests first.**

```ts
// tests/pdf-reader/controller.test.ts
it('a run that could show only part: said, the preview kept, the translated displays not greyed', () => {
  const s = fold([{ type: 'note', event: 'shown preview', data: {}, got: 9, total: 103, lost: 0, again: false }, { type: 'html', url: 'https://arxiv.org/html/x#readarxiv' }, { type: 'fail', event: 'shown in part', text: '' }, { type: 'note', event: 'done', data: {}, got: 103, total: 103, lost: 0, again: false }])
  expect(s).toMatchObject({ partial: true, available: true, phase: 'ready', shown: 'preview', failure: null })
})
// tests/pdf-reader/ui/status.test.ts
it('says a translation shown in part, offers the HTML version, and closes', () => {
  expect(capsuleOf(at({ phase: 'ready', partial: true, htmlVersion: 'https://arxiv.org/html/x#readarxiv' }), none)).toEqual({ kind: 'partial', text: R.status.partial, href: 'https://arxiv.org/html/x#readarxiv' })
  expect(capsuleOf(at({ phase: 'ready', partial: true, htmlVersion: null, failedUnits: 2 }), none)).toMatchObject({ kind: 'partial' })
  expect(capsuleOf(at({ phase: 'ready', partial: true }), { closed: true, narrowShown: false })).toBeNull()
  expect(capsuleOf(at({ phase: 'translating', partial: true }), none)).toBeNull()
})
// tests/pdf-reader/cache.test.ts
it('endOf: nothing ever shown is S-R-17; a preview and no final is the translation shown in part; a final or a copy, nothing', () => {
  const ex = { exhausted: true, stopped: null }
  expect(endOf(ex, { compiledOnce: false, finalShown: false, cached: false })).toBe('cannot typeset')
  expect(endOf(ex, { compiledOnce: true, finalShown: false, cached: false })).toBe('shown in part')
  expect(endOf(ex, { compiledOnce: true, finalShown: true, cached: false })).toBeNull()
  expect(endOf(ex, { compiledOnce: false, finalShown: false, cached: true })).toBeNull()
  expect(endOf({ exhausted: true, stopped: 'network' }, { compiledOnce: true, finalShown: false, cached: false })).toBeNull()
})
```

`copy.test.ts` already holds every pack to the zh-CN pack's keys and to `TECHNICAL`; it fails until both packs have
`R.status.partial`.

**Implementation.**
- **cache.mjs:**
  `export const endOf = (r, { compiledOnce, finalShown, cached }) => (!r.exhausted || r.stopped ? null : !compiledOnce && !cached ? 'cannot typeset' : compiledOnce && !finalShown ? 'shown in part' : null)`.
- **session.mjs:2306:**
  - `const end = endOf(result, { compiledOnce, finalShown, cached: !!cached })`.
  - `'cannot typeset'` keeps today's branch.
  - `'shown in part'`: emit the HTML URL, emit the `fail` event, say the words in `status()`, and fall through to the
    record and `'done'` as today.
- **controller.ts:**
  - `ReaderState.partial`, `INITIAL.partial = false`.
  - `case 'fail'`: `if (event.event === 'shown in part') return { ...state, partial: true }`.
  - `'translating'`: `partial: false`.
- **status.ts:**
  - `Capsule` gains `{ kind: 'partial'; text: string; href?: string }`.
  - In `capsuleOf`, after `unsupported`:
    `if (state.partial && !seen.closed) return state.htmlVersion ? { kind: 'partial', text: R.status.partial, href: state.htmlVersion } : { kind: 'partial', text: R.status.partial }`.
- **StatusCapsule.tsx:** `partial` renders the HTML chip as `unavailable` does, and the close button as `notice` does.
- **Locales and docs:**
  - `R.status.partial` goes into both packs, the zh-CN line commented `// S-R-19`.
  - `docs/UI.md` gets a row after S-R-18, and the allow-list entry for `docs/UI.md` goes up by one, with its reason.

**Verification.** The tests. In the browser, the reader's own probe with a paper forced to exhaust: the same
`breaking()` shape, through a `spikes/` probe that serves a synthetic source whose every translated unit breaks TeX.
The capsule appears after the first preview, the preview stays, the translated displays stay enabled, and its close
works. Screenshots are taken by the maintainer, not by the probe (the media rule).

---

## Task 6: versions, gates, the paper, the record

### Versions

The engine's conventions (`live.mjs:203–253`) call for both bumps:

- **`TYPESETTING_VERSION` 5 → 6.** Fixes 1, 2 and 4 and fix 3's guard all change how a compile sets a translation it is
  given.
  - A record of version 5 is compiled again from its translation, and a paper none of the ways could set (2610.02069's
    record) is tried again.
  - A stored original's readings (`originalRow`, keyed by both versions) are made again, with the citation lines in
    them. A version-5 reading has only `\bibcite` lines, and would keep fault A alive on a revisit.
  - It also covers `2a346741` and `9cc9cd2d`, which changed `\axtfit` decisions without a bump.
- **`PIPELINE_VERSION` 7 → 8.** Fix 3 changes the pieces of the units it touches.
  - Matching by hash alone keeps translations right, but a unit can change size or vanish (one whose letters were all
    in a command's `<...>`), and the left marks and the original's readings are by unit index.
  - The cost: every cached paper is translated again once, on its next visit. Its seeds are shown meanwhile, and the
    background's 30-day cache answers what it still holds.
  - The web app's records move with its next pin; its child refuses a skew (`job.ts` `VersionSkew`).
  - Open question 3.

The comment lines `// 6: …` and `// 8: …` say what each bump is for, in the file's own form.

### Gates: nothing changes on a paper that already worked

All are run before (at `dec4573e`, into a baseline) and after (the branch). Pass means:

| Gate | Run | Pass |
|---|---|---|
| unit, lint, build | `pnpm typecheck && pnpm lint && pnpm test && pnpm build` | exit 0 |
| case spikes, native | `typeset-tex-cases.mjs`, `line-env-cases.mjs`, `cjk-cases.mjs`, `lost-cases.mjs`, `cache-cases.mjs`, `mt-cases.mjs`, `wire-cases.mjs`, the new `compile-resilience-cases.mjs` (`pnpm exec tsx experiments/pdf-bilingual/spikes/<name>`) | each exit 0 |
| case spikes, BusyTeX | `typeset-busytex-cases.mjs` (TeX Live server on :8070, Playwright's Chromium) | exit 0 |
| front end | `front-gate.mjs` (`--accept` at `dec4573e`, then plain) | no paper listed, or each listed paper's moved text a command's delimited argument, inspected |
| marks | `patch-identity.mjs` | every paper ok |
| languages | `lang-gate.mjs --accept` at `dec4573e`, `lang-gate.mjs --check` on the branch | exit 0: no result, letter or reference lost, no more errors or overfull boxes |
| typesetting rule | `DRAFT=1 AXT_DATA=<data> typeset-gate.mjs` then `--check` (not `ASIDE`: the aside set is spent once per round) | every paper and set holds its record in `records/typeset-gate.json`; the record is not rewritten |
| highlight | `highlight-gate.mjs` against its baselines | unchanged |

### 2610.02069 (the scratchpad's probes, the source and translations cached there)

- **Setup.** Copy `bug-2610.02069/live-probe-v2.mjs` to `experiments/pdf-bilingual/out/probe/live-probe.mjs`
  (git-ignored). Run it from the worktree's root:
  `pnpm exec tsx experiments/pdf-bilingual/out/probe/live-probe.mjs <scratchpad>/src.bin <ja|zh> <out> <scratchpad>/cache-<lang>.json`.
  The cached translations send nothing to the service.
- **Runs:** natively, and with `SLOW=1 HALT=1` (the first preview holds the first batch alone, and halt-on-error with
  no PDF on a `!`, as BusyTeX).
- **After Task 2:** settled under XeLaTeX + xeCJK, through `without additions` and `in source` (unit 99 alone).
- **After Task 4:** settled under XeLaTeX + xeCJK with the rule (`final … typeset: true`), and no remedy noted.
  - The compile sequence is the happy path's: probe, preview(s), original, previews, final.
  - Per page of the final PDF, CJK text on every page whose original has prose (`pdftotext -f p -l p`). This is judged
    on the PDF, not on the status line.
- **In the browser:** `spikes/reader-live.mjs 2610.02069` (the build's language), with the source placed in the
  ignored `data/corpus/2610.02069/` from the scratchpad. The maintainer checks ja in the test package.

### Performance

- **No extra compile on the happy path.** The existing sequence test pins it (`probe, preview, original, preview+rule,
  final+rule`). `live-node.mjs` on two papers that settle today (zh 2608.02163, ja 2608.06701) gives the same compiles,
  in the same order, before and after.
- **The added work per compile:** `citationLines`, and the spans found again in `translationFiles`, both linear in the
  files' size. `translationFiles` is timed on the heaviest paper (2608.02459, 88 pages), before and after, interleaved,
  10 runs each. Its median must not grow by more than 5 ms.
- **Remedies cost compiles only after a failure,** at most `SPENT_MAX` = 8 per run.

### The record

`REPORT.md` gets an addendum: the investigation, the five fixes, the gates' numbers, and the paper's runs before and
after.

## Open questions for the maintainer

1. **Ruling 6, refined.** A rule that was left out and still did not let the paper set is put back, so that a unit's
   fault no longer costs the rest of the run its typesetting rule. Agreed?
2. **The ladder's order is the least lost first:** the rule, then the additions, then units. In the browser, a unit's
   fault (B) costs up to two compiles before the unit is set in the source. Placing units first would save them, but
   would set innocent paragraphs in the source when the fault is the rule's or the references' (A, under
   halt-on-error, places itself in the first citing unit). Keep this order?
3. **The pipeline bump** re-translates every cached paper once, on its next visit, and moves the web app's records.
   Take it now with fix 3, or hold fix 3 for the next pipeline change and ship fixes 1, 2, 4 and 5 under the
   typesetting bump alone? (B is then still caught by fix 4, at the cost of unit 99 in English.)
4. **The bounds:** 3 rounds, `max(3, 2 %)` units, 8 compiles per run. They come from this paper and from the reasoning
   above, not from a corpus measurement. Accept them, or measure them on the corpus first?
5. **Additions dropped together.** The references and microtype are dropped in one retry, as asked. A strategy left
   without them sets its drafts with no bibliography and with "?" citations (the final makes its own). Should this be
   split into two retries, one compile more?
6. **Units set in the source are noted but not shown.** A paper fixed by the safety net shows one paragraph in English
   without a word. Should the capsule's passage count (S-P-60) include them?
7. **The words of S-R-19**, above.

## Rulings (2026-10-04)

The maintainer's answers to the open questions above. They bind the work and override the tasks where they differ.

1. **Ruling 6, refined: agreed.** When dropping the rule does not fix a failure, the rule comes back.
2. **The remedies' order: the least lost first,** as planned.
3. **The pipeline bump: fix 3 with `PIPELINE_VERSION` 7 → 8,** on one condition. The controller doubted the cost:
   `session.mjs` seeds a run from the copy by source (`seedFrom`), so a unit whose source is unchanged should be reused
   across a pipeline change, the compile alone redone. That was to be verified, and if a copy of 7 opened under 8 has
   everything translated again, the work stops before the bump and reports.
   - **Measured** (`tests/pdf-reader/live-sequence.test.ts`, "a copy made by another pipeline"): everything is sent
     again. `seedFrom` does seed every unchanged unit, so the copy's translation is shown meanwhile. But `reusable` takes
     a seed as it is only with `copyWire` or the visit's own last run (`made`), and `session.mjs` sets `copyWire` only
     for a copy of this pipeline (`p.sameUnits`). On a visit's first run under 8, no seed of a copy of 7 is current, and
     every unit is sent to the extension's chain again; the background's 30-day cache answers what it still holds. The
     cost statement under "Versions" stands as written.
   - **So the bump is not taken, and fix 3 (Task 4) is held with it,** for the maintainer to decide. The branch ships
     fixes 1, 2, 4 and 5 under the typesetting bump alone, which is open question 3's other course: fault B is caught by
     fix 4, at the cost of 2610.02069's unit 99 in English.
4. **The bounds: accepted for now** (3 rounds, `max(3, 2 %)` of the units, 8 compiles a run). Each remedy taken is
   noted in the reader's log (`note`: `without spacing`, `without references`, `typeset failed`, `in source`, each
   `… back`, `recovered`), so that a corpus run can measure them later.
5. **The additions' retry is split in two,** in this order:
   1. without EVEN_SPACES' microtype, which loses only spacing;
   2. then without the references the run gives a compile.

   Each is taken back when it did not set the paper, as the rule is. This costs one more compile, on a failure path
   only, and a preview keeps its citations whenever microtype alone was the fault.
6. **Units set in the source by fix 4 count in S-P-60's notice** of passages that failed. The reader must not claim a
   passage is translated when it is not.
7. **S-R-19's wording is approved,** in `docs/UI.md`'s conventions:
   - zh-CN: `\u8fd9\u7bc7\u8bba\u6587\u53ea\u80fd\u663e\u793a\u90e8\u5206\u8bd1\u6587\uff0c\u5176\u4f59\u4e3a\u539f\u6587`
   - en: "Only part of this paper's translation can be shown; the rest is in the original"

### Review response (2026-10-04, the fix round)

Two reviews of `b6d5f8cf` returned "with fixes": Opus's (`I-1` to `I-6`, `M-1` to `M-10`) and Codex's (two high, two
medium). The controller's rulings on them, as built:

- **I-1, Codex high 1: the rule before units, everywhere.** The measure takes the remedies in their order, the rule's
  first (`live.mjs` `remedy(r, true, …)`): a re-set whose rule breaks one unit settles as `dec4573e` did, every unit
  translated, the rule left out, in `probe, original, draft+rule, final`.
- **I-2: lost letters are the strategy's.** A TeX error placed in a unit is set in the source at once; letters lost (a
  PDF that left them out, or LaTeX's "Unicode character not set up") move the chain on first. Once no strategy after
  the current one is left, the units holding them are set in the source under the first strategy that lost them, the
  run going back to it once (`back to strategy`), from that strategy's own compile and within its own bounds.
- **I-3, Codex high 2.** The final restores the rule's plan only where the remedy took the rule back.
- **I-4.** The paper's own errors are read only once an error stands in a unit, and only if the original is in; they
  are never waited for (the review's probe: 45 ms again, as at `dec4573e`, against 1509).
- **I-5.** S-P-61's retry comes only where the run stopped for a reason a retry mends (the reader's `failure`).
- **I-6, Codex medium 2.** A copy's `cache current` and a seeded run that changes nothing count the record's units
  marked set in the source but the author block's (`cache.mjs` `passagesInSource`). No field is added to the record.
- **Codex medium 1.** The bound counts every passage a unit set in the source takes with it, nested units expanded and
  deduped, each translated one charged.
- **Found on the way, fixed:** a remedy taken back is untried again once another remedy uncovers another failure (the
  references' fault hiding the rule's in the final); and what a compile set translated is judged by the strategy (the
  author block CJKutf8 sets as the paper has it is not a candidate for the source).

The minors:

| | Disposition |
|---|---|
| M-1 | Fixed: the paper's own errors keyed by message and unit, the original's located in its own files (`originalFiles` gains `spans`). |
| M-2 | Fixed: S-R-19 only where the last preview shown lacked part of the translation (`shownPartial`). |
| M-3 | Fixed: nested units have spans, and the innermost unit holding the context is placed. TeX reads a footnote as its command's argument and logs an error in it where the argument ends, so a nested unit holds the error when the text before the place stands in it and its closing brace (checked natively, halting and nonstop, and under BusyTeX). |
| M-4 | Fixed: the references rung is skipped for an error the log shows before TeX read the aux. |
| M-5 | Fixed: the rule's remedy is neither counted nor refused by `SPENT_MAX`. |
| M-6 | Fixed: `docs/UI.md`'s reader section says what S-P-60 counts in the reader, and when S-P-61 comes. |
| M-7 | Fixed: the count is the passages in the source the shown compile had translated, so a footnote the service lost is counted once, as lost. |
| M-8 | Declined: a unit set in the source gets none of the plan's macros (`typeset/tex.mjs` `mark` gives them to translated units alone), only unused definitions stay in the head, and planning again would cost a measure on a failure path for a drift of that unit's height. |
| M-9 | Fixed: the spikes' comments write their dashes as dashes. |
| M-10 | Fixed: DESIGN §16 says that an error whose context holds no ASCII places nothing. |

### Review response, the last round (2026-10-04)

The re-review of `f2170c0a` (N-1 to N-5) and Codex's second round (four mediums), as built:

- **N-1:** the measure tries leaving the rule out with its own draft without the plan, not with the final. The same
  failure takes the rule back and the ladder goes on in the measure's drafts; the draft setting means the rule was the
  cause, and the final is set as today. A unit's fault on a re-set costs drafts and keeps the final measured, as on
  `b6d5f8cf`; a rule-only fault costs one draft more than at `dec4573e`.
- **N-2, Codex medium 2:** a nested unit holds an error with both halves of the context in its own text, or where it
  closes on the error's line and the text before the place ends there.
- **Codex medium 1:** the bound counts the passages still to be translated with those translated.
- **Codex medium 3:** a changed failure after units go to the source re-opens the remedies taken back.
- **Codex medium 4:** the units holding a lost letter are found by their own text, footnotes apart from their paragraph.
- **N-3:** "No file <job>.aux." is TeX past the aux: the references remedy stays for a compile given no aux.
- **N-5:** the count is taken from the record when the copy is shown, every later path included.
- The author block left out of the count is noted in DESIGN §16, with the field that would let it be counted.

