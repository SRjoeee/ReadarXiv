import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { sourceOn } from '@/core/abstract/link'

const page = (html: string) => new DOMParser().parseFromString(html, 'text/html')

describe('sourceOn: the abstract page offers the paper\'s TeX source (the reader\'s design, §2)', () => {
  it('finds arXiv\'s own source link', () => {
    expect(sourceOn(page(readFileSync('tests/fixtures/abs/1706.03762.html', 'utf8')))).toBe(true)
  })

  it('finds none on a PDF-only submission, whose Access Paper list has View PDF alone', () => {
    expect(sourceOn(page('<ul><li><a href="/pdf/2608.07562" class="abs-button download-pdf">View PDF</a></li></ul>'))).toBe(false)
  })
})
