import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { extract } from '@/core/extractor'
import { VOID_DENSE_THRESHOLD, joinRuns, rehydrate, serialize, splitRuns, validate } from '@/core/protector'
import { htmlOf, sameModuloWhitespace, stripIds } from './helpers'

const FIXTURE_DIR = join(import.meta.dirname, '../fixtures/arxiv')

/**
 * A case walks every block of a paper of up to 1.8 MB through the whole protector. The heaviest, 2609.04056.html, took
 * 4.76 s alone (2026-09-27, the `[protector]` line below) and once ran past the suite's 30 s while three worktrees ran
 * their suites at once — the machine's load, not the code (the redesign's ledger). Twenty times the heaviest case
 * alone, so that load never fails it and a hang still does
 */
const TIMEOUT = 100_000

describe('fixture round trip', () => {
  const files = readdirSync(FIXTURE_DIR).filter(f => f.endsWith('.html')).sort()

  for (const f of files) {
    it(f, () => {
      const doc = new DOMParser().parseFromString(readFileSync(join(FIXTURE_DIR, f), 'utf8'), 'text/html')
      const before = doc.documentElement.outerHTML
      const targets: Element[] = []
      for (const b of extract(doc)) {
        if (b.kind === 'text') targets.push(b.el)
        else for (const c of b.cells) if (!c.numeric) targets.push(c.el)
      }
      const t0 = performance.now()
      let dense = 0
      for (const target of targets) {
        const block = serialize(target)
        if (block.voidCount > VOID_DENSE_THRESHOLD) dense++
        const v = validate(block.text, block)
        expect(v.ok, `${f} identity validation failed: ${target.id || target.className}`).toBe(true)
        const [got, want] = sameModuloWhitespace(htmlOf(rehydrate(block.text, block, doc)), stripIds(target.innerHTML))
        expect(got, `${f} rehydration not equivalent: ${target.id || target.className}`).toBe(want)
        const layout = splitRuns(block)
        joinRuns(layout.runs, layout, block, doc)
      }
      const ms = Math.round(performance.now() - t0)
      // A reading, not an assertion: the time is mostly happy-dom's and the runner's (6.5–8.5 s here, 11.6 s once on a
      // CI runner for a change that touched none of this), and a budget on it failed builds while catching nothing.
      // The line below stays, printed on every run, for anyone who changes the protector to compare against
      console.info(`[protector] ${f}: ${targets.length} blocks/cells round-tripped, ${dense} formula-dense blocks, ${ms} ms`)
      expect(doc.documentElement.outerHTML).toBe(before)
    }, TIMEOUT)
  }
})
