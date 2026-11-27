// The page a pane's pill reads (panes/panes.ts pageInView; PDF-READER §6.4): one rule for both panes, PDF.js's own (its viewer's
// update: the current page where it is still wholly in view, else the page most of which the view shows, the first of equals).
// The right read the page at its view's top before: at a paper's end, with the last 70 px of page 1 over page 2, the left's pill
// read 2 / 2 and the right's 1 / 2 over the same place (the lead's look at shot 04c).
import { describe, expect, it } from 'vitest'
import { pageInView } from '../src/panes/panes.ts'

// (three pages 1000 px tall, 20 px apart)
const pages = [0, 1020, 2040].map((top) => ({ top, end: top + 1000 }))

describe('pageInView', () => {
  it('the page most of which the view shows: page 2 under the last 70 px of page 1', () => {
    expect(pageInView(pages, 930, 900, 1)).toBe(2)
  })
  it('the current page while it is still wholly in view', () => {
    // (a view taller than a page: page 2 wholly in view, page 3 half; the current kept)
    expect(pageInView(pages, 1000, 1600, 2)).toBe(2)
    expect(pageInView(pages, 1000, 1600, 1)).toBe(2)
  })
  it('the first of equals; a view over no page reads none', () => {
    expect(pageInView(pages, 500, 1020, 3)).toBe(1)
    expect(pageInView([], 0, 900, 1)).toBe(0)
  })
  it('a page in the middle, wholly in a view between two', () => {
    expect(pageInView(pages, 1000, 1060, 1)).toBe(2)
  })
})
