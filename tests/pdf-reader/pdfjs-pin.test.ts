// The PDF.js internals today's engine read (its session.mjs) were checked in a real browser, by
// c7e44a94b:lab/pdf/spikes/reader-ui.mjs ("the PDF.js internals the engine reads"): PDF.js's modern build does
// not run in Node. That session and that check went at the cut-over; this test holds pdfjs-dist at the version they
// were checked on (the reader's design, §10.4) until a version is chosen anew
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const CHECKED = '6.3.289'
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'))

describe('pdfjs-dist', () => {
  it('is the version whose internals the browser check read', () => {
    const pkg = read('package.json')
    expect(pkg.dependencies?.['pdfjs-dist'] ?? pkg.devDependencies?.['pdfjs-dist']).toBe(CHECKED)
    expect(read('node_modules/pdfjs-dist/package.json').version).toBe(CHECKED)
  })
})
