// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PAGE_FILES, unservedImports } from '../../lab/pdf/layer-lab/page-files.mjs'

// The layer lab serves its page and modules from a fixed list (lab/pdf/layer-lab/page-files.mjs); a module the page imports
// that is not on it left the lab without its script. The list is held against the files' own imports

const LAB = join(process.cwd(), 'lab/pdf/layer-lab')

describe("the layer lab's served files", () => {
  it('every module the page imports by a relative path, and every file it names under /lab/, is served', () => {
    expect(unservedImports(LAB)).toEqual([])
    for (const f of ['doc-loads.mjs', 'notes.mjs', 'run-slot.mjs']) expect(PAGE_FILES.has(f), f).toBe(true)
  })

  it('finds a module that is imported (statically or dynamically) and not served', () => {
    const dir = mkdtempSync(join(tmpdir(), 'axt-lab-'))
    try {
      writeFileSync(join(dir, 'a.mjs'), "import { x } from './b.mjs'\nimport './c.mjs'\nconst d = await import('./d.mjs')\nimport { y } from '/proto-engine/e.mjs'\n")
      writeFileSync(join(dir, 'b.mjs'), 'export const x = 1\n')
      writeFileSync(join(dir, 'p.html'), '<script type="module" src="/lab/a.mjs"></script><link href="/lab/q.css">\n<link href="/styles/tokens.css">')
      expect(unservedImports(dir, new Set(['a.mjs', 'b.mjs', 'p.html']))).toEqual(['a.mjs -> c.mjs', 'a.mjs -> d.mjs', 'p.html -> q.css'])
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})
