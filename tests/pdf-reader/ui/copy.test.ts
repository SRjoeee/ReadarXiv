import { describe, expect, it } from 'vitest'
import { LOCALES } from '@/locales'

/** every string a pack's R holds, by its path; a function is called with a sample */
function strings(value: unknown, path = 'R'): [string, string][] {
  if (typeof value === 'string') return [[path, value]]
  if (typeof value === 'function') return [[path, String((value as (x: string) => string)('Deutsch'))]]
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => strings(v, `${path}.${k}`))
  return []
}
/** the reader never names a technical path (the reader's design, §1): what a technical reason makes unavailable is greyed */
const TECHNICAL = /\b(la)?tex\b|compil|typeset|engine|provider|pipeline|编译|排版|引擎|服务商|管线/i

describe("the reader's words", () => {
  it('carry the design\'s table (§15)', () => {
    const { R } = LOCALES['zh-CN']
    expect(R.display).toEqual({ name: '显示', original: '原文', bilingual: '对照', translation: '译文' })
    expect(R.status.unsupported('Deutsch')).toBe('PDF 对照暂不支持Deutsch')
    expect(R.status.narrow).toBe('窗口较窄，暂只显示译文')
    expect(LOCALES.en.R.display.bilingual).toBe('Side by side')
  })

  for (const [code, pack] of Object.entries(LOCALES)) {
    it(`are all there in ${code}, none empty`, () => {
      const found = strings(pack.R)
      expect(found.map(([p]) => p)).toEqual(strings(LOCALES['zh-CN'].R).map(([p]) => p))
      for (const [p, s] of found) expect(s.trim(), p).not.toBe('')
    })

    it(`name no technical path in ${code}`, () => {
      for (const [p, s] of strings(pack.R)) expect(s, p).not.toMatch(TECHNICAL)
    })
  }
})
