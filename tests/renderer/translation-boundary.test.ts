// One definition of "a real translation node" (DESIGN §7.1): `TRANSLATION_EXCLUDED_CLASSES` in attrs.ts — issue #46
// was this list drifting between copies. Two kinds of copy cannot import it, and are held to it here, every `:not(…)`
// read with its parentheses balanced, nested ones included:
// - the style sheets: a list naming two or more of the four classes is the whole list, in order. A list naming one is
//   a deliberately narrower rule (`.axt-t:not(.axt-error)`, `:not(:where(.axt-split) *)`) and is left alone;
// - the browser suites (their selectors run inside the page): a list naming any of the four is the whole list, written
//   out flat — nested, interpolated or prefixed (`span.axt-mirror`), it fails, since none of those can be read here.
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REAL_TRANSLATION, TRANSLATION_EXCLUDED_CLASSES } from '@/core/renderer/attrs'
import { TOP_TRANSLATION_SELECTOR, TRANSLATION_SELECTOR } from '@/core/renderer/style-preset'

const STYLES = join(import.meta.dirname, '../../src/styles')
const canonical = TRANSLATION_EXCLUDED_CLASSES.map(c => `.${c}`).join(', ')

/** One of the four classes, as a whole class name */
const EXCLUDED = /\.axt-(?:pending|error|mirror|split)(?![\w-])/g

/** Every `:not(…)` in a text, nested ones included: its whole content and its top-level items */
function notLists(text: string): { content: string; items: string[] }[] {
  const lists: { content: string; items: string[] }[] = []
  for (let at = text.indexOf(':not('); at >= 0; at = text.indexOf(':not(', at + 1)) {
    const start = at + ':not('.length
    const items: string[] = []
    let depth = 1
    let from = start
    let i = start
    for (; i < text.length && depth > 0; i++) {
      const c = text[i]
      if (c === '(') depth++
      else if (c === ')') depth--
      else if (c === ',' && depth === 1) {
        items.push(text.slice(from, i).trim())
        from = i + 1
      }
    }
    const end = i - 1
    items.push(text.slice(from, end).trim())
    lists.push({ content: text.slice(start, end), items })
  }
  return lists
}

describe('the translation boundary', () => {
  it('is the four injected sub-classes, in the documented order', () => {
    expect(canonical).toBe('.axt-pending, .axt-error, .axt-mirror, .axt-split')
    expect(REAL_TRANSLATION).toBe(`.axt-t:not(${canonical})`)
    expect(TRANSLATION_SELECTOR).toBe(`html[data-axt-on] ${REAL_TRANSLATION}`)
    expect(TOP_TRANSLATION_SELECTOR).toContain(REAL_TRANSLATION)
  })

  it('every copy in the style sheets lists the same classes', () => {
    const seen: string[] = []
    for (const file of readdirSync(STYLES).filter(f => f.endsWith('.css'))) {
      const css = readFileSync(join(STYLES, file), 'utf8')
      for (const { content, items } of notLists(css)) {
        // Items that are one of the four classes themselves; an item with parentheses is read as its own list
        const named = items.filter(item => /^\.axt-(?:pending|error|mirror|split)$/.test(item))
        if (named.length < 2) continue
        seen.push(`${file}: ${content}`)
        expect(items.join(', '), `${file} writes a different boundary: :not(${content})`).toBe(canonical)
      }
    }
    // the sheets do carry the boundary — a parser that read nothing would pass vacuously
    expect(seen.length).toBeGreaterThanOrEqual(6)
  })

  it('every copy in the browser suites lists the same classes: a count of “real translations” that forgot one kind of copy counts copies', () => {
    const root = join(import.meta.dirname, '../..')
    const tracked = execFileSync('git', ['ls-files', 'tests/e2e'], { cwd: root, encoding: 'utf8' }).split('\n').filter(f => f.endsWith('.mjs'))
    const seen: string[] = []
    for (const file of tracked) {
      const script = readFileSync(join(root, file), 'utf8')
      // Chains (`:not(.a):not(.b)`) are not a way round the rule: the list is written once, as production writes it
      expect(script, `${file} chains :not() over our classes`).not.toMatch(/(?::not\([^()]*\.axt-[^()]*\)){2,}/)
      for (const { content, items } of notLists(script)) {
        if (!content.match(EXCLUDED)) continue
        seen.push(`${file}: ${content}`)
        expect(/[()]|\$\{/.test(content), `${file} nests or interpolates a boundary it must write out: :not(${content})`).toBe(false)
        expect(items.join(', '), `${file} writes a different boundary: :not(${content})`).toBe(canonical)
      }
    }
    expect(seen.length).toBeGreaterThan(5)
  })
})
