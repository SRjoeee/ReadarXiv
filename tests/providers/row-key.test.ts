// The extension's row key reads a unit's statement by the package's digest (packages/translate askedOf, the one our server's
// rows name theirs by), and no key a reader's store holds moves for it: over every unit this extension sends (the HTML page's
// every fixture block on both wires, the PDF reader's units as format's reader gives them and `unitInOf` projects them, the
// old PDF reader's texts read back as units), the digest equals the key's hash as it was made before it,
// `sha256(JSON.stringify([kind or null, content, sentences, strict, entry]))` over the unit as it reached the background
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { read } from '@readarxiv/format'
import { askedOf, sha256Hex, type UnitIn, unitInOf } from '@readarxiv/translate'
import { describe, expect, it } from 'vitest'
import { extract } from '@/core/extractor'
import type { Segment } from '@/core/pipeline/batches'
import { unitOfSegment } from '@/core/pipeline/units'
import { serialize } from '@/core/protector'
import { unitOfWire } from '@/core/protector/units'

const FIXTURES = join(import.meta.dirname, '../fixtures/arxiv')
const BUNDLES = join(import.meta.dirname, '../../packages/reader/e2e/fixtures')

/** the unit's part of a row's key before the package's digest (transport.ts unitKeyOf, fix 0d5e306fa) */
const keyBefore = (u: UnitIn): string =>
  sha256Hex(JSON.stringify([u.kind ?? null, u.content, u.sentences === true, u.strict === true, u.entry === true]))

/** the units whose keys moved, by id */
const moved = (units: readonly UnitIn[]): string[] => units.filter(u => askedOf(u) !== keyBefore(u)).map(u => u.id)

describe("the extension's row key: the package's digest of a unit's statement, every stored key where it was", () => {
  // (the HTML page's every fixture block, on the markers wire and the tags wire: one paper a test, so that a parsed page is let
  // go before the next, as tests/setup-memory.ts lets it go)
  for (const format of ['markers', 'tags'] as const) {
    for (const f of readdirSync(FIXTURES).filter(x => x.endsWith('.html')).sort()) {
      it(`the HTML page's every block, ${format}: ${f}`, () => {
        const doc = new DOMParser().parseFromString(readFileSync(join(FIXTURES, f), 'utf8'), 'text/html')
        const all: UnitIn[] = []
        for (const b of extract(doc)) {
          const targets = b.kind === 'text' ? [b.el] : b.cells.flatMap(c => (c.numeric ? [] : [c.el]))
          for (const target of targets) {
            const p = serialize(target, format)
            const s: Segment = { id: target.id, text: p.text, block: b, protected: p }
            all.push(unitOfSegment(s, format).unit)
          }
        }
        expect(all.length).toBeGreaterThan(0)
        expect(moved(all)).toEqual([])
      })
    }
  }

  it("the PDF reader's units, read by format's reader and projected by unitInOf: the reader's every fixture bundle", () => {
    const all: UnitIn[] = []
    for (const paper of readdirSync(BUNDLES).filter(d => /^s\d/.test(d)).sort()) {
      const dir = join(BUNDLES, paper, 'bundle')
      for (const f of readdirSync(dir).filter(x => x.endsWith('.units')))
        all.push(...read('units', readFileSync(join(dir, f)), f.slice(0, 64)).units.map(unitInOf))
    }
    expect(all.length).toBeGreaterThan(20)
    expect(all.some(u => u.content.some(p => p.t === 'el'))).toBe(true)
    expect(moved(all)).toEqual([])
  })

  it("the old PDF reader's texts read back as units (session/translate.mjs), elements and pairs with them", () => {
    const texts = [
      'Let <x id="1"/> be a <t id="2">connected</t> graph; see <x id="3"/>.',
      'A <t id="1">nested <t id="2">pair</t> here</t>.',
    ]
    const all = [
      ...texts.map((t, i) => unitOfWire(`t${i}`, t, 'tags', { sentences: i === 0 }).unit),
      unitOfWire('m', 'Let @a# and @b# hold.', 'markers', { sentences: true }).unit,
    ]
    expect(moved(all)).toEqual([])
  })
})
