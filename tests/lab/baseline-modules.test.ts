// The node modules the lab's baseline tools run on (lab-data's refactor-2026-11/baseline/tools and baseline/tap/tools: today's
// prepare dumps, reader dumps and the tap's ledgers, which the reader gate and the display gate read) come from one place the
// baseline states once (baseline/tools/modules.mjs: the baseline's own `modules/` folder, its package.json pinning the versions
// the baseline was made with). Until 2026-11-13 each tool named a lane's worktree's node_modules, and a clean-up of finished
// worktrees took it: neither make could run. This test fails where that place, a pinned version or Playwright's browser is
// missing, or where a tool names a node_modules of its own again. It reads lab-data; where the machine holds no baseline, it
// has nothing to hold and is skipped.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const LAB = process.env.AXT_LAB_DATA ?? '/Users/cheongzhiyan/Developer/readarxiv-lab-data'
const BASE = join(LAB, 'refactor-2026-11', 'baseline')
const hasBaseline = existsSync(join(BASE, 'tap', 'ledgers'))

describe.skipIf(!hasBaseline)("the baseline's tools' node modules", () => {
  // (the statement is read as the tools read it, by Node itself: its command form prints each path)
  const stated = (name: string) =>
    execFileSync(process.execPath, [join(BASE, 'tools', 'modules.mjs'), name], { encoding: 'utf8' }).trim()

  it('come from the one place the baseline states, holding every pinned version', () => {
    expect(existsSync(join(BASE, 'tools', 'modules.mjs'))).toBe(true)
    const MODS = stated('MODS')
    expect(MODS).toBe(join(BASE, 'modules', 'node_modules'))
    const PINS = JSON.parse(readFileSync(join(BASE, 'modules', 'package.json'), 'utf8')).dependencies as Record<string, string>
    expect(Object.keys(PINS).sort()).toEqual(['@cantoo/pdf-lib', 'esbuild', 'pdfjs-dist', 'playwright', 'tsx'])
    for (const [name, version] of Object.entries(PINS)) {
      const pkg = join(MODS, name, 'package.json')
      expect([name, existsSync(pkg)]).toEqual([name, true])
      expect([name, JSON.parse(readFileSync(pkg, 'utf8')).version]).toEqual([name, version])
    }
    expect(existsSync(stated('TSX'))).toBe(true)
  })

  it("find Playwright's browser at the pinned version", () => {
    const index = pathToFileURL(join(stated('MODS'), 'playwright', 'index.mjs')).href
    const browser = execFileSync(
      process.execPath,
      ['--input-type=module', '-e', `const { chromium } = await import(${JSON.stringify(index)}); console.log(chromium.executablePath())`],
      { encoding: 'utf8' },
    ).trim()
    expect([browser, existsSync(browser)]).toEqual([browser, true])
  })

  it("are named by no tool but through the statement: no tool names a node_modules or a worktree's modules of its own", () => {
    const tools = [
      ...readdirSync(join(BASE, 'tools')).map((f) => join(BASE, 'tools', f)),
      ...readdirSync(join(BASE, 'tap', 'tools')).map((f) => join(BASE, 'tap', 'tools', f)),
      join(BASE, 'tap', 'make.sh'),
    ].filter((f) => /\.(mjs|sh)$/.test(f) && !f.endsWith(join('tools', 'modules.mjs')))
    const own = tools.flatMap((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .filter((l) => !/^\s*(\/\/|#|\*)/.test(l) && /node_modules['/]|lost-c3-base/.test(l))
        .map((l) => `${f.slice(BASE.length + 1)}: ${l.trim().slice(0, 100)}`),
    )
    expect(own).toEqual([])
  })
})
