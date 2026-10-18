// A style sheet read as its rules, for the tests that hold a sheet to its design (the reader's, the pages', the shared
// controls'): each rule's selector, its declarations and the at-rules it sits in. Moved out of reader-sheet.test.ts
// for the redesign's Part 3, whose sheet tests read the same way
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface Rule { selector: string; body: string; within: string[] }

/** the files' text (paths relative to tests/styles), joined, comments removed */
export function sheet(...paths: string[]): string {
  return paths.map(p => readFileSync(join(import.meta.dirname, p), 'utf8')).join('\n').replace(/\/\*[\s\S]*?\*\//g, '')
}

/** every style rule: its selector, its declarations, and the at-rules it sits in (a statement ends at `;`) */
export function rules(css: string): Rule[] {
  const out: Rule[] = []
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

/** a rule's declarations, property to value, each value's white space folded to one space */
export function declarations(body: string): Record<string, string> {
  return Object.fromEntries(body.split(';').map(d => d.trim()).filter(Boolean).map(d => {
    const at = d.indexOf(':')
    return [d.slice(0, at).trim(), d.slice(at + 1).trim().replace(/\s+/g, ' ')]
  }))
}

/** the declarations of the one rule with exactly `selector` inside exactly the at-rules `within`; throws unless there is one */
export function ruleOf(all: Rule[], selector: string, within: string[]): Record<string, string> {
  const found = all.filter(r => r.selector === selector && r.within.join(' | ') === within.join(' | '))
  if (found.length !== 1) throw new Error(`${found.length} rules "${selector}" within [${within.join(', ')}]`)
  return declarations(found[0]!.body)
}
