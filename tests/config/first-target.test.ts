import { describe, expect, it } from 'vitest'
import { pickTargetLanguage } from '@/config/first-target'

// The target language a new reader starts with (DESIGN §9): from the browser's languages, once, at install

describe('pickTargetLanguage', () => {
  it('takes the first preferred language that is not English: a paper is in English already', () => {
    // An English system with the reader's own language second — what the interface's language alone would miss
    expect(pickTargetLanguage(['en-US', 'en', 'ja-JP', 'zh-CN'], 'en-US')).toBe('jpn')
    expect(pickTargetLanguage(['ko-KR', 'en-US'], 'ko')).toBe('kor')
    expect(pickTargetLanguage(['fr-CA', 'fr', 'en'], 'fr')).toBe('fra')
  })

  it('tells Traditional Chinese from Simplified by the script or the region', () => {
    expect(pickTargetLanguage(['zh-TW', 'zh', 'en'])).toBe('cmn-Hant')
    expect(pickTargetLanguage(['en', 'zh-Hant-HK'])).toBe('cmn-Hant')
    expect(pickTargetLanguage(['zh-CN', 'en'])).toBe('cmn')
  })

  it('passes over a tag it cannot place instead of reading it as Simplified Chinese', () => {
    expect(pickTargetLanguage(['xx-YY', '', 'de-DE'])).toBe('deu')
  })

  it('with only English preferred, the interface\'s language speaks — when it is not English either', () => {
    expect(pickTargetLanguage(['en-US', 'en'], 'pt-BR')).toBe('por')
  })

  it('stays Simplified Chinese, as before, when everything says English or nothing is known', () => {
    expect(pickTargetLanguage(['en-US', 'en'], 'en-GB')).toBe('cmn')
    expect(pickTargetLanguage([], undefined)).toBe('cmn')
    expect(pickTargetLanguage(['xx'], 'yy')).toBe('cmn')
  })
})
