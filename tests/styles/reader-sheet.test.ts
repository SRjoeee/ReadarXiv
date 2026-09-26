// The PDF reader's own style sheet (src/entrypoints/pdf-reader/reader.css), held to a rule the interface review of
// 2026-09-26 brought in: a hover's look only where a pointer can hover — on a touch screen :hover latches after a tap
// and reads as a state stuck on (better-accessibility, hit areas)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SHEET = readFileSync(join(import.meta.dirname, '../../src/entrypoints/pdf-reader/reader.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** every style rule: its selector, its declarations, and the at-rules it sits in (a statement ends at `;`) */
function rules(css: string) {
  const out: { selector: string; body: string; within: string[] }[] = []
  const stack: string[] = []
  let start = 0
  for (let i = 0; i < css.length; i++) {
    const c = css[i]
    if (c === ';') start = i + 1
    else if (c === '}') { stack.pop(); start = i + 1 }
    else if (c === '{') {
      const prelude = css.slice(start, i).trim()
      if (prelude.startsWith('@')) { stack.push(prelude); start = i + 1; continue }
      const end = css.indexOf('}', i)
      out.push({ selector: prelude, body: css.slice(i + 1, end), within: [...stack] })
      i = end
      start = end + 1
    }
  }
  return out
}
const all = rules(SHEET)

describe('the reader\'s style sheet (the interface review, 2026-09-26)', () => {
  it('reads its rules: the toolbar button\'s among them', () => {
    expect(all.some(r => r.selector.startsWith('.tbtn'))).toBe(true)
  })

  it('draws a hover only where a pointer hovers: every :hover rule inside @media (hover: hover)', () => {
    const loose = all.filter(r => r.selector.includes(':hover') && !r.within.some(a => /^@media\s*\(hover:\s*hover\)/.test(a)))
    expect(loose.map(r => r.selector)).toEqual([])
  })

  it('rings the focus in the ink, in every theme: the reader\'s chrome has no hue but danger (the maintainer, 2026-09-26)', () => {
    const focus = [...SHEET.matchAll(/--focus:\s*([^;]+);/g)].map(m => m[1]!.trim())
    expect(focus.length).toBeGreaterThan(0)
    expect([...new Set(focus)]).toEqual(['var(--n-10)'])
  })

  it('marks a chosen swatch with the strong line, a step lighter than the focus\'s ink, so that the two read apart', () => {
    expect(all.some(r => r.body.includes('--line-strong:'))).toBe(true)
    const chosen = all.find(r => r.selector.startsWith('.swatch[aria-pressed="true"]'))
    expect(chosen?.body).toMatch(/outline:[^;]*var\(--line-strong\)/)
  })

  it('leaves a text field\'s ring, and the active option\'s beside it, to the keyboard: a click shows the caret', () => {
    const pointerOff = all.filter(r => r.selector.includes('[data-axt-pointer]') && /outline:\s*none/.test(r.body))
    expect(pointerOff.some(r => r.selector.includes('input:focus-visible'))).toBe(true)
    const itemRing = all.filter(r => r.selector.includes('.search:focus-visible') && r.selector.includes('.item[data-active]'))
    expect(itemRing.length).toBeGreaterThan(0)
    expect(itemRing.every(r => r.selector.includes(':not([data-axt-pointer])'))).toBe(true)
  })
})
