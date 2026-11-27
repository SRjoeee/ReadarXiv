// A link's target by its destination (preview/targets.ts): the head's `targets` keyed by Link.to.dest; a laid link's href and a
// PDF.js link's (getDestinationHash: `#` + escape(name), or + escape(JSON of an explicit array)) read back to that key.
import type { Target } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { destOfHash, destOfLink, targetOf, targetsOf } from '../../src/preview/targets.ts'

const cite: Target = ['"cite.smith"', 'reference', 4, 12, [72, 500, 300, 530]]
const arr = JSON.stringify([{ num: 12, gen: 0 }, { name: 'XYZ' }, 72, 700, null])
const fig: Target = [arr, 'float', 2, 3, [72, 400, 540, 700]]
const targets = targetsOf({ targets: [cite, fig] })

/** PDF.js's own link anchor for a destination (pdf_link_service.js getDestinationHash) */
const pdfjsAnchor = (dest: string | unknown[]) => {
  const a = document.createElement('a')
  const esc = (globalThis as unknown as { escape(s: string): string }).escape
  a.setAttribute('href', `#${esc(typeof dest === 'string' ? dest : JSON.stringify(dest))}`)
  return a
}
/** a laid link's anchor (compose/links.ts: `#` + encodeURIComponent(Link.to.dest)) */
const laidAnchor = (key: string) => {
  const a = document.createElement('a')
  a.className = 'axt-link'
  a.setAttribute('href', `#${encodeURIComponent(key)}`)
  return a
}

describe('a link’s target', () => {
  it('a laid link’s dest and a PDF.js link’s hash find the same target', () => {
    expect(targetOf(targets, destOfLink(laidAnchor('"cite.smith"'))!)).toBe(cite)
    expect(targetOf(targets, destOfLink(pdfjsAnchor('cite.smith'))!)).toBe(cite)
    expect(targetOf(targets, destOfLink(laidAnchor(arr))!)).toBe(fig)
    expect(targetOf(targets, destOfLink(pdfjsAnchor(JSON.parse(arr)))!)).toBe(fig)
  })
  it('a name with characters escape writes as %u reads back whole', () => {
    expect(destOfHash(`#${(globalThis as unknown as { escape(s: string): string }).escape('cite.Müller–2020')}`)).toBe(
      JSON.stringify('cite.Müller–2020'),
    )
  })
  it('an unknown destination finds none; a head of before states none', () => {
    expect(targetOf(targets, '"cite.nobody"')).toBeNull()
    expect(targetsOf(null).size).toBe(0)
    expect(targetsOf({}).size).toBe(0)
  })
  it('no hash, or an empty one, is no destination', () => {
    expect(destOfHash('')).toBeNull()
    expect(destOfHash('#')).toBeNull()
  })
})
