// The registry is complete and consistent (design-b §1.1: a test fails when a decision has no home, when two rules claim
// one, or when a ported rule has no file).
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RULE_LIST, RULES } from '../src/rules.ts'

const SRC = join(import.meta.dirname, '..', 'src')

describe('the registry', () => {
  it('names every rule once, each id under its home’s letter', () => {
    const ids = RULE_LIST.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    const letter = { fact: 'F', unit: 'U', shared: 'S', breaker: 'B', fit: 'X', emit: 'D' } as const
    for (const r of RULE_LIST) expect(r.id.startsWith(`${letter[r.home]}.`), r.id).toBe(true)
  })
  it('gives each of the 39 translation-dependent decisions one home', () => {
    for (let t = 1; t <= 39; t++) {
      const homes = RULE_LIST.filter((r) => r.owns.includes(`T${t}`)).map((r) => r.id)
      expect(homes, `T${t}`).toHaveLength(1)
    }
  })
  it('lets no row be claimed by two rules', () => {
    const by = new Map<string, string>()
    for (const r of RULE_LIST)
      for (const o of r.owns) {
        expect(by.get(o), `${o}: ${by.get(o)} and ${r.id}`).toBeUndefined()
        by.set(o, r.id)
      }
  })
  it('keeps a split rule’s parent in the registry', () => {
    for (const r of RULE_LIST) if (r.parent) expect(RULES[r.parent], r.id).toBeDefined()
  })
  it('names the file of every rule that has one, and the file exists', () => {
    for (const r of RULE_LIST) {
      if (r.state.is !== 'ported' && r.state.is !== 'changed') continue
      expect(r.file, r.id).toBeDefined()
      expect(existsSync(join(SRC, r.file!)), `${r.id}: ${r.file}`).toBe(true)
    }
  })
  it('says why a rule is void or changed', () => {
    for (const r of RULE_LIST)
      if (r.state.is === 'void' || r.state.is === 'changed') expect(r.state.why.length, r.id).toBeGreaterThan(0)
  })
})
