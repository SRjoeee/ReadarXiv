import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Every caller of the wrap (layout/wrap.mjs wrapFinal) says the marking's texts and inkless macros: the marks file's
// `marking.texts` and `marking.inkless` where it holds the marks (a cell's lead macro is owned by its texts alone, a unit that opens
// with a macro TeX said sets no ink opens with its text: layout/own.mjs), null where it does not; and the paper's theorem-like
// environments' printed names (openPaper's `theoremNames`: a head of one of them is its unit's label), null where it reads no
// source. wrapFinal refuses a call without them at run time; this holds the callers the unit tests never run (the lab's spikes,
// the scripts) to it as well

const ROOT = process.cwd()
const files = (dir: string): string[] => readdirSync(join(ROOT, dir)).flatMap(f => { const p = join(dir, f); return statSync(join(ROOT, p)).isDirectory() ? (f === 'node_modules' || f.startsWith('.') ? [] : files(p)) : /\.(?:mjs|ts)$/.test(f) && !/\.tmp\./.test(f) ? [p] : [] })
/** each `wrapFinal(` call's argument text, to its closing parenthesis */
const callsIn = (text: string) => {
  const out: string[] = []
  for (const m of text.matchAll(/\bwrapFinal\(/g)) {
    let depth = 0, i = m.index! + m[0].length - 1
    for (; i < text.length; i++) { if (text[i] === '(') depth++; else if (text[i] === ')' && --depth === 0) break }
    out.push(text.slice(m.index!, i + 1))
  }
  return out
}

describe('the wrap\'s callers', () => {
  it('each pass `texts`, `inkless` and `names` (null said where the marks or the source are not in hand)', () => {
    const found: string[] = []
    for (const f of [...files('lab/pdf'), ...files('scripts'), ...files('src/pdf-reader'), ...files('tests/pdf-reader')]) {
      const text = readFileSync(join(ROOT, f), 'utf8')
      for (const call of callsIn(text)) {
        // (the declaration and the run-time refusals' own cases, `expect(wrapFinal(…)).rejects`, pass none on purpose)
        if (/export (?:async )?function wrapFinal|declare function wrapFinal/.test(call) || /^\)?\)\.rejects\.toThrow\(/.test(text.slice(text.indexOf(call) + call.length).replace(/^ as never/, ''))) continue
        found.push(f)
        expect(/\btexts\b/.test(call), `${f}: ${call.slice(0, 120)}`).toBe(true)
        expect(/\binkless\b/.test(call), `${f}: ${call.slice(0, 120)}`).toBe(true)
        expect(/\bnames\b/.test(call), `${f}: ${call.slice(0, 120)}`).toBe(true)
      }
    }
    expect(found.length).toBeGreaterThanOrEqual(6)
  })
})
