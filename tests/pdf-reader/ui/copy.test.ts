import { describe, expect, it } from 'vitest'
import { LANG_CODE_TO_LOCALE_NAME as OWN } from '@/config/languages'
import { LOCALES } from '@/locales'
import { spacedAfterChinese } from '@/locales/spacing'

/** every string a pack's R holds, by its path; a function is called with a sample */
function strings(value: unknown, path = 'R'): [string, string][] {
  if (typeof value === 'string') return [[path, value]]
  if (typeof value === 'function') return [[path, String((value as (x: string) => string)('Deutsch'))]]
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => strings(v, `${path}.${k}`))
  return []
}
/** the reader never names a technical path (the reader's design, §1): what a technical reason makes unavailable is greyed */
const TECHNICAL = /\b(la)?tex\b|compil|typeset|engine|provider|pipeline|编译|排版|引擎|服务商|管线/i

/** S-R-13's Chinese sentence up to the language's name */
const UNSUPPORTED = 'PDF 对照暂不支持'

describe("the reader's words", () => {
  it('carry the design\'s table (§15)', () => {
    const { R } = LOCALES['zh-CN']
    expect(R.display).toEqual({ name: '显示', original: '原文', bilingual: '对照', translation: '译文' })
    expect(R.status.narrow).toBe('窗口较窄，暂只显示译文')
    expect(LOCALES.en.R.display.bilingual).toBe('Side by side')
  })

  it('S-R-13 spaces the language\'s own name from the Chinese before it only where it is not Han, kana or hangul (UI.md §1 rule 9; the maintainer, 2026-10-04)', () => {
    const { R } = LOCALES['zh-CN']
    // Latin, Cyrillic, Greek and Arabic names take the space; Han, kana and hangul names sit against the Chinese as it does
    for (const code of ['deu', 'rus', 'ell', 'arb'] as const) expect(R.status.unsupported(OWN[code]), code).toBe(`${UNSUPPORTED} ${OWN[code]}`)
    for (const code of ['jpn', 'kor', 'cmn', 'cmn-Hant'] as const) expect(R.status.unsupported(OWN[code]), code).toBe(`${UNSUPPORTED}${OWN[code]}`)
    // the English sentence has no Chinese before the name: unchanged, whatever the name's script
    for (const code of ['deu', 'jpn', 'arb'] as const) expect(LOCALES.en.R.status.unsupported(OWN[code]), code).toBe(`A bilingual PDF isn't available in ${OWN[code]} yet`)
    // nothing to space: no stray space
    expect(spacedAfterChinese('')).toBe('')
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
