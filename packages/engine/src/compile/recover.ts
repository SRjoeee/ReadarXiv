// The bounded recovery of a marked compile that fails (design §4.1 "What the marks are freed from"; contract stage 1b,
// deliverable 3). B is never shown, so a mark may move lines; what it must still let happen is the compile itself and the
// same glyphs. A marked compile fails where TeX did not run through (no PDF, or no AXT-END: an emergency stop, a hundred
// errors, a fatal error) or where its last pass raised errors the unmarked first pass did not (the paper's own errors are
// not the marks'). Then, once more without the marks of the region TeX's errors name (the units whose marks the error's
// context shows, and the units with a mark on the line of input TeX names); failing that (or where the errors name no
// region), with the units' own marks alone (UNITS_ONLY, the region still unmarked); else the paper has no layer and says
// why. Three compiles at most. The probe's vetoes and today's guard are not here: stage 1b's count says whether they go.
import type { Tree } from '../source/definitions.ts'
import type { SourceDoc } from '../source/read.ts'
import { type MarkOptions, markSource, type Plan, UNITS_ONLY } from '../marks/mark.ts'

/** one error of TeX's log: its message, its line of input and the text there before and after its place, and the levels
 *  of context TeX printed above that line (what it was reading: a macro's expansion, an argument) */
export interface TexError {
  message: string
  line: number | null
  before: string
  after: string
  context: string[]
  /** a character the font lacks (Missing character, a Unicode character LaTeX does not know): the paper's text, not ours */
  char?: number
}

/** the last TeX run of a log joined from several (a driver's or BusyTeX's: each run begins with TeX's banner) */
export function lastTexRun(log: string): string {
  const all = [...log.matchAll(/^This is \S*TeX\b/gm)]
  return all.length > 1 ? log.slice((all.at(-1) as RegExpMatchArray).index) : log
}

/** the most of a log the recovery reads, in its characters (a byte each: the log is read Latin-1), and the most errors it
 *  keeps of one: resource limits, a paper deciding how long its log is. On the corpus the longest log is 1.21 MB
 *  (2307.16209v1's marked draft, TeX's state stated at every mark) and the most errors 688 (2610.21377v1's first pass); past
 *  either the recovery ends with its reason */
export const LOG_MAX = 32 * 2 ** 20
export const ERRORS_MAX = 10_000
/** each error TeX wrote in a log's last run (an error in an output routine or a \write is read as its own context alone), at
 *  most `max` + 1 (one past the bound tells it is passed) */
export function texErrors(log: string, max = ERRORS_MAX): TexError[] {
  const lines = lastTexRun(log).split('\n')
  const out: TexError[] = []
  for (let k = 0; k < lines.length && out.length <= max; k++) {
    const l = lines[k] as string
    if (!l.startsWith('! ')) continue
    let message = l.slice(2)
    const context: string[] = []
    let line: number | null = null
    let before = ''
    let after = ''
    for (let j = k + 1; j < Math.min(lines.length, k + 40); j++) {
      const x = lines[j] as string
      if (x.startsWith('! ')) break
      const m = /^l\.(\d+) ?(.*)$/.exec(x)
      if (m) {
        line = Number(m[1])
        before = (m[2] as string).replace(/^\.\.\./, '')
        after = (lines[j + 1] ?? '').trim().replace(/\.\.\.$/, '')
        break
      }
      // (a message longer than a log line goes on on the next: TeX wraps at 79 columns)
      if (j === k + 1 && !/^[<\\]/.test(x) && x.trim() && !/^ /.test(x)) message += x
      else if (x.trim()) context.push(x)
    }
    const char =
      /^Missing character: There is no .*?\(U\+([0-9A-F]+)\)|^LaTeX Error: Unicode character .*?\(U\+([0-9A-F]+)\)/.exec(
        message,
      )
    out.push({
      message,
      line,
      before,
      after,
      context,
      ...(char ? { char: Number.parseInt((char[1] ?? char[2]) as string, 16) } : {}),
    })
  }
  return out
}

/** our head's commands as TeX's log shows them in a context (MARK_DEF, LAYOUT_TEX: each with its argument, and the
 *  \leavevmode a unit's start comes with) */
const OURS =
  /\\leavevmode\s*(?=\\axtmark\b)|\\(?:axtmark|axtend|axtlines|axtpma|axtpmm|axtpm|axthmark|axtcolour|axtbrname)\s*\{[^{}]*\}/g
const MARK_NAMED =
  /\\(?:axtmark|axtend|axtpma|axtpmm|axtpm|axthmark|axtcolour|axtbrname)\s*\{([^{}\s]*?)(?:\}|\.\.\.$)/g
const NAME_MARK = /\\axt@?nm[ab]\b/
/** a text as TeX's log and a file agree on it: printable ASCII, our marks out */
const skeleton = (s: string) =>
  s
    .replace(OURS, '')
    .replace(/\^\^\^\^[0-9a-f]{4}|\^\^[0-9a-f]{2}|\^\^[@-_?]/g, '')
    .replace(/[^\x21-\x7e]/g, '')
/** how much of the text before and after an error's place identifies it */
const CONTEXT = 12
/** an error whatever marks stand around it: its message and the text right before and after its place */
const keyOf = (e: TexError) =>
  `${e.message}|${skeleton(e.before).slice(-CONTEXT)}|${skeleton(e.after).slice(0, CONTEXT)}`

/** whether TeX ran through to the document's end (END_TEX's AXT-END) */
export const ranThrough = (log: string) => /^AXT-END$/m.test(lastTexRun(log))

export interface Judged {
  ok: boolean
  why?: string
  /** the marked compile's errors the unmarked pass has not (a letter a font lacks is never the marks') */
  errors: TexError[]
  /** a resource limit passed (LOG_MAX, ERRORS_MAX): no step after it reads less */
  bound?: true
}
/** a marked compile against the unmarked first pass's log */
export function judge(c: { pdf: Uint8Array | null | undefined; log: string }, unmarkedLog: string): Judged {
  if (c.log.length > LOG_MAX || unmarkedLog.length > LOG_MAX)
    return { ok: false, why: `a log longer than ${LOG_MAX} bytes`, errors: [], bound: true }
  const theirs = texErrors(unmarkedLog)
  const mine = texErrors(c.log)
  if (theirs.length > ERRORS_MAX || mine.length > ERRORS_MAX)
    return { ok: false, why: `more than ${ERRORS_MAX} errors in a log`, errors: [], bound: true }
  const own = new Set(theirs.map(keyOf))
  const errors = mine.filter((e) => e.char === undefined && !own.has(keyOf(e)))
  if (!c.pdf?.length) return { ok: false, why: 'no PDF', errors }
  if (!ranThrough(c.log)) return { ok: false, why: 'TeX did not run through', errors }
  if (errors.length) return { ok: false, why: `errors the unmarked pass has not: ${errors[0]?.message}`, errors }
  return { ok: true, errors }
}

const latin1 = (b: Uint8Array) => {
  let s = ''
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192))
  return s
}
/**
 * The units a marked compile's errors name (`source` the tree as the paper wrote it, `marked` the marked tree, `plan` its
 * plan): each mark of ours the error's context or its line of input shows by its name, and each mark written on the line
 * of input TeX names, in a file of ours whose line there holds the error's text; and for "Incomplete \if…; all text was ignored after line N", the
 * marks on line N. `names`: an error whose context shows a babel name's mark (the names' wraps, NAMES_TEX)
 */
export function regionOf(
  errors: readonly TexError[],
  plan: Plan,
  source: Tree,
  marked: Tree,
  log = '',
): { units: Set<number>; names: boolean } {
  const byName = new Map(plan.marks.map((m) => [m.name, m.unit]))
  const units = new Set<number>()
  let names = false
  // (each written file's lines, and each mark's line: our marks and wraps hold no line end, so a mark's line is its byte's
  // line in the paper's file, after the head's lines in the main file)
  const files = new Map<string, { lines: string[]; marks: Map<number, number[]> }>()
  const fileOf = (path: string) => {
    let f = files.get(path)
    if (f) return f
    const text = latin1((marked.files.get(path) as Uint8Array | undefined) ?? new Uint8Array())
    const paper = (source.files.get(path) as Uint8Array | undefined) ?? new Uint8Array()
    const head = path === plan.main ? (text.slice(0, plan.head).match(/\n/g) ?? []).length : 0
    const ends: number[] = []
    for (let i = paper.indexOf(10); i >= 0; i = paper.indexOf(10, i + 1)) ends.push(i)
    const marks = new Map<number, number[]>()
    for (const m of plan.marks) {
      if (m.file !== path) continue
      let lo = 0
      let hi = ends.length
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if ((ends[mid] as number) < m.byte) lo = mid + 1
        else hi = mid
      }
      const n = head + lo + 1
      const l = marks.get(n) ?? (marks.set(n, []).get(n) as number[])
      l.push(m.unit)
    }
    f = { lines: text.split('\n'), marks }
    files.set(path, f)
    return f
  }
  for (const e of errors) {
    if (e.context.some((c) => NAME_MARK.test(c))) names = true
    // (the levels of context, and the line of input itself as TeX shows it: our marks there by their names)
    for (const c of [...e.context, e.before, e.after])
      for (const m of c.matchAll(MARK_NAMED)) {
        const u = byName.get(m[1] as string)
        if (u !== undefined) units.add(u)
      }
    if (e.line === null) continue
    const b = skeleton(e.before).slice(-CONTEXT)
    const a = skeleton(e.after).slice(0, CONTEXT)
    for (const path of plan.files) {
      const f = fileOf(path)
      const text = skeleton(f.lines[e.line - 1] ?? '')
      if (!text || (b && !text.includes(b)) || (!b && a && !text.includes(a))) continue
      for (const u of f.marks.get(e.line) ?? []) units.add(u)
    }
  }
  for (const m of lastTexRun(log).matchAll(/^! Incomplete \\if\w*; all text was ignored after line (\d+)\./gm))
    for (const path of plan.files) for (const u of fileOf(path).marks.get(Number(m[1])) ?? []) units.add(u)
  return { units, names }
}

export type RecoveryStep = 'marked' | 'region' | 'units'
export interface Attempt {
  step: RecoveryStep
  ok: boolean
  why?: string
  /** units left unmarked at this step */
  unmarked: number[]
  errors: number
  ms?: number
}
export type Compiled = { pdf: Uint8Array | null | undefined; log: string; ms?: number }
export type Recovered =
  | { ok: true; step: RecoveryStep; plan: Plan; pdf: Uint8Array; log: string; attempts: Attempt[] }
  | { ok: false; why: string; attempts: Attempt[] }

/**
 * The marked compile with its recovery: `compile` runs the compile plan over a marked tree (the host's: the box's jail, the
 * lab's docker slot) and gives the last pass's PDF and log; `unmarkedLog` the unmarked first pass's log (its errors are the
 * paper's own)
 */
export async function compileMarked(o: {
  tree: Tree
  doc: SourceDoc
  options: MarkOptions
  unmarkedLog: string
  compile: (marked: Tree, plan: Plan, step: RecoveryStep) => Promise<Compiled>
}): Promise<Recovered> {
  const attempts: Attempt[] = []
  const run = async (step: RecoveryStep, options: MarkOptions) => {
    const { tree, plan } = markSource(o.tree, o.doc, options)
    const c = await o.compile(tree, plan, step)
    const j = judge(c, o.unmarkedLog)
    attempts.push({
      step,
      ok: j.ok,
      ...(j.why ? { why: j.why } : {}),
      unmarked: [...(options.unmarked ?? [])],
      errors: j.errors.length,
      ...(c.ms !== undefined ? { ms: c.ms } : {}),
    })
    return { c, j, plan, tree }
  }
  const first = await run('marked', o.options)
  if (first.j.ok)
    return { ok: true, step: 'marked', plan: first.plan, pdf: first.c.pdf as Uint8Array, log: first.c.log, attempts }
  if (first.j.bound) return { ok: false, why: first.j.why as string, attempts }
  const region = regionOf(first.j.errors, first.plan, o.tree, first.tree, first.c.log)
  let unmarked: ReadonlySet<number> = region.units
  if (region.units.size || region.names) {
    const second = await run('region', {
      ...o.options,
      unmarked: region.units,
      ...(region.names ? { names: false } : {}),
    })
    if (second.j.ok)
      return {
        ok: true,
        step: 'region',
        plan: second.plan,
        pdf: second.c.pdf as Uint8Array,
        log: second.c.log,
        attempts,
      }
    unmarked = new Set([
      ...region.units,
      ...regionOf(second.j.errors, second.plan, o.tree, second.tree, second.c.log).units,
    ])
  }
  const third = await run('units', { ...o.options, ...UNITS_ONLY, unmarked })
  if (third.j.ok)
    return { ok: true, step: 'units', plan: third.plan, pdf: third.c.pdf as Uint8Array, log: third.c.log, attempts }
  return { ok: false, why: `the marked compile failed with unit marks only: ${third.j.why}`, attempts }
}
