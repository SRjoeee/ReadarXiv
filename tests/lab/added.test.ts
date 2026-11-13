// lab/typeset/added.mjs: the added pairs walked apart from a gate's set, and the root of links their today's side is read through
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ADDED, addedEnv, apartOf } from '../../lab/typeset/added.mjs'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})
/** a lab-data root of its own: the set's folders with a file each, the corpus list, the added pairs' folder */
function labOf(): string {
  const lab = mkdtempSync(join(tmpdir(), 'added-lab-'))
  dirs.push(lab)
  const put = (rel: string, text: string) => {
    mkdirSync(join(lab, rel, '..'), { recursive: true })
    writeFileSync(join(lab, rel), text)
  }
  put('bin/heavy-slot.sh', '#!/bin/sh\n')
  put('refactor-2026-11/STATE.md', 'state\n')
  put('refactor-2026-11/lanes/L1-papers87.tsv', 'a\t/papers/a\n')
  put('refactor-2026-11/lanes/x/note.md', 'x\n')
  put('refactor-2026-11/baseline/acceptance.json', '[]\n')
  put('refactor-2026-11/baseline/prepare/a.prepare.json', '{}\n')
  put('refactor-2026-11/baseline/reader/a-zh.reader.json', '{}\n')
  put('refactor-2026-11/baseline/tap/ledgers/a-zh.ledger.json.gz', 'l')
  put('refactor-2026-11/baseline/tap/metrics/a-zh.metrics.json.gz', 'm')
  put('refactor-2026-11/baseline/tap/tokens/a-zh.tokens.json.gz', 't')
  put('refactor-2026-11/baseline/tap/samples/U.x.json.gz', 's')
  put('refactor-2026-11/baseline/added/pairs.txt', 'b-zh\n')
  put('refactor-2026-11/baseline/added/papers.tsv', 'b\t/papers/b\n')
  put('refactor-2026-11/baseline/added/prepare/b.prepare.json', '{"b":1}\n')
  put('refactor-2026-11/baseline/added/reader/b-zh.reader.json', '{"b":1}\n')
  put('refactor-2026-11/baseline/added/tap/ledgers/b-zh.ledger.json.gz', 'L')
  put('refactor-2026-11/baseline/added/tap/metrics/b-zh.metrics.json.gz', 'M')
  put('refactor-2026-11/baseline/added/tap/tokens/b-zh.tokens.json.gz', 'T')
  put('refactor-2026-11/baseline/added/cache/papers/b/catalog.json', '{}\n')
  return lab
}

describe('the added pairs', () => {
  it('are walked after a gate\'s set, apart: every one in a walk of the set, the named ones in a named walk', () => {
    expect(ADDED).toEqual(['2111.09276v1-zh', '2611.03953v2-zh'])
    const set = ['1512.03385v1-zh', '2610.21312v1-zh']
    expect(apartOf(set, { named: false, argv: [] })).toEqual({ pairs: set, later: [...ADDED], apart: false })
    // (a folder the set's walk reads that holds an added pair: it is walked apart, never in the set)
    expect(apartOf([...set, ADDED[0]!], { named: false, argv: [] })).toEqual({ pairs: set, later: [...ADDED], apart: false })
    expect(apartOf([set[0]!, ADDED[1]!], { named: true, argv: [] })).toEqual({ pairs: [set[0]], later: [ADDED[1]], apart: false })
    expect(apartOf([ADDED[0]!], { named: true, argv: [] })).toEqual({ pairs: [], later: [ADDED[0]], apart: false })
    expect(apartOf(set, { named: true, argv: [] }).later).toEqual([])
    // (the run of the added pairs walks what it is given)
    expect(apartOf([...ADDED], { named: true, argv: ['--apart'] })).toEqual({ pairs: [...ADDED], later: [], apart: true })
  })

  it('read their today\'s side through a root of links where the set\'s stands, the set\'s files the same', () => {
    const lab = labOf()
    const env = addedEnv(lab)
    dirs.push(env.AXT_LAB_DATA)
    const root = env.AXT_LAB_DATA
    expect(env.AXT_SWEEP_CACHE).toBe(join(lab, 'refactor-2026-11/baseline/added/cache'))
    // (every folder the gates read: the set's files and the added pairs' side by side)
    expect(readdirSync(join(root, 'refactor-2026-11/baseline/tap/ledgers')).sort()).toEqual(['a-zh.ledger.json.gz', 'b-zh.ledger.json.gz'])
    expect(readdirSync(join(root, 'refactor-2026-11/baseline/reader')).sort()).toEqual(['a-zh.reader.json', 'b-zh.reader.json'])
    expect(readdirSync(join(root, 'refactor-2026-11/baseline/prepare')).sort()).toEqual(['a.prepare.json', 'b.prepare.json'])
    expect(readFileSync(join(root, 'refactor-2026-11/baseline/tap/metrics/b-zh.metrics.json.gz'), 'utf8')).toBe('M')
    expect(readFileSync(join(root, 'refactor-2026-11/baseline/tap/tokens/a-zh.tokens.json.gz'), 'utf8')).toBe('t')
    // (the corpus list the parity finds arXiv's PDFs by: the set's lines, then the added papers')
    expect(readFileSync(join(root, 'refactor-2026-11/lanes/L1-papers87.tsv'), 'utf8')).toBe('a\t/papers/a\nb\t/papers/b\n')
    // (everything else a link to the real lab-data's entry)
    for (const r of ['bin', 'refactor-2026-11/STATE.md', 'refactor-2026-11/lanes/x', 'refactor-2026-11/baseline/acceptance.json', 'refactor-2026-11/baseline/tap/samples', 'refactor-2026-11/baseline/added']) {
      expect([r, lstatSync(join(root, r)).isSymbolicLink(), realpathSync(join(root, r))]).toEqual([r, true, realpathSync(join(lab, r))])
    }
    // (the real lab-data is not written)
    expect(readdirSync(join(lab, 'refactor-2026-11/baseline/tap/ledgers'))).toEqual(['a-zh.ledger.json.gz'])
    // (asked again, the same root; one of the files it links moved, another)
    expect(addedEnv(lab).AXT_LAB_DATA).toBe(root)
    utimesSync(join(lab, 'refactor-2026-11/baseline/added/reader/b-zh.reader.json'), new Date(), new Date(Date.now() + 5000))
    const again = addedEnv(lab).AXT_LAB_DATA
    dirs.push(again)
    expect(again).not.toBe(root)
  })

  it('are refused where one of their files is the set\'s already, or where lab-data holds none', () => {
    const lab = labOf()
    writeFileSync(join(lab, 'refactor-2026-11/baseline/tap/ledgers/b-zh.ledger.json.gz'), 'l')
    expect(() => addedEnv(lab)).toThrow(/b-zh\.ledger\.json\.gz is the set's file already/)
    const none = mkdtempSync(join(tmpdir(), 'added-none-'))
    dirs.push(none)
    expect(() => addedEnv(none)).toThrow(/no added pairs' today's side/)
    expect(existsSync(join(none, 'refactor-2026-11'))).toBe(false)
  })
})
