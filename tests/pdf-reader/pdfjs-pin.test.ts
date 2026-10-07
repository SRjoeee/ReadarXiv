// The PDF.js internals the engine reads (session.mjs) are checked in a real browser, by
// experiments/pdf-bilingual/spikes/reader-ui.mjs ("the PDF.js internals the engine reads"): PDF.js's modern build does
// not run in Node. This test fails on any other version of pdfjs-dist until that check has passed on it and CHECKED
// names it (the reader's design, §10.4)
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
