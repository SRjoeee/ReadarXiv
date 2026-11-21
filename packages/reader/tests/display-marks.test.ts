// The reader's marks of the display (panes/panes.ts DISPLAY_MARKS): written on the reader's root, never on <html>, and taken
// away with the reader's other marks of its root when it is closed; what a host put on that root stays. A host whose sheet
// reads the marks elsewhere copies them by the same list (the website: onto <html>, where the chrome's sheet reads them).
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as entry from '../src/index.ts'
import { DISPLAY_MARKS } from '../src/panes/panes.ts'
import { DEFAULTS } from '../src/prefs.ts'
import type { Reader } from '../src/reader.ts'

vi.mock('../src/pdfjs/kit.ts', async (real) => ({
  ...(await real<object>()),
  loadKit: () => new Promise(() => {}),
}))
const { openReader } = await import('../src/reader.ts')

let reader: Reader | null = null
afterEach(() => {
  reader?.close()
  reader = null
})

describe("the reader's marks of the display", () => {
  it('are the display shown, the narrow width and the sides swapped, a host takes them from the package entry', () => {
    expect([...DISPLAY_MARKS]).toEqual(['data-axt-pdf-mode', 'data-axt-narrow', 'data-axt-swapped'])
    expect(entry.DISPLAY_MARKS).toBe(DISPLAY_MARKS)
  })
  it("go from the reader's root when it is closed, and what the host put there stays", async () => {
    const root = document.createElement('div')
    root.setAttribute('data-host-own', 'kept')
    // (a fetch that never answers: the reader opens, asks, and is closed before anything comes back)
    const fetch = () => new Promise<Response>(() => {})
    reader = openReader(root, {
      host: {
        fetch,
        original: () => '/api/v2/o/arxiv/2600_00001v1.pdf',
        prefs: { read: async () => ({ ...DEFAULTS }), write: async () => {}, watch: () => () => {} },
      },
      paper: '2600.00001v1',
    })
    // (the marks as the panes write them: the display shown, one pane at a narrow width, the sides swapped)
    root.setAttribute('data-axt-pdf-mode', 'bilingual')
    root.toggleAttribute('data-axt-narrow', true)
    root.toggleAttribute('data-axt-swapped', true)
    reader.close()
    reader = null
    for (let turn = 0; turn < 200 && root.hasAttribute('data-axt-pdf-mode'); turn++)
      await new Promise<void>((r) => setTimeout(r, 0))
    for (const a of ['data-axt-pdf-mode', 'data-axt-narrow', 'data-axt-swapped'])
      expect(root.hasAttribute(a), a).toBe(false)
    expect(root.getAttribute('data-host-own')).toBe('kept')
    expect(root.classList.contains('axt-reader')).toBe(false)
  })
})
