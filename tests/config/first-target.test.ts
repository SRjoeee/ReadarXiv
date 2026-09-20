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

  it('never starts a reader in a script the browser did not ask for: such a tag is passed over (Devin and Codex on #272)', () => {
    // The table's only Malay is Jawi, its Bosnian, Uzbek and Azerbaijani are named Cyrillic; a bare tag of those means Latin
    expect(pickTargetLanguage(['ms-MY', 'en'])).toBe('cmn')
    expect(pickTargetLanguage(['uz', 'ru-RU'])).toBe('rus')
    expect(pickTargetLanguage(['az-Latn-AZ', 'tr'])).toBe('tur')
    expect(pickTargetLanguage(['bs-Latn', 'hr'])).toBe('hrv')
    expect(pickTargetLanguage(['jv', 'id'])).toBe('ind')
    // Serbian is Cyrillic unless it says otherwise
    expect(pickTargetLanguage(['sr-Latn-RS', 'de'])).toBe('deu')
    expect(pickTargetLanguage(['sr-RS'])).toBe('srp')
    expect(pickTargetLanguage(['sr-Cyrl'])).toBe('srp')
    // The script asked for by name is given
    expect(pickTargetLanguage(['ms-Arab'])).toBe('zlm')
    expect(pickTargetLanguage(['uz-Cyrl-UZ'])).toBe('uzn')
  })

  it('gives a script asked for by name only where the table vouches for it; anywhere else the tag is passed over (Devin on #272)', () => {
    expect(pickTargetLanguage(['ru-Latn', 'de'])).toBe('deu')
    expect(pickTargetLanguage(['ja-Latn', 'ja-JP'])).toBe('jpn')
    // Chinese: its two entries are its two scripts, under either name of the language
    expect(pickTargetLanguage(['zh-Hans-CN'])).toBe('cmn')
    expect(pickTargetLanguage(['zh-Hant'])).toBe('cmn-Hant')
    expect(pickTargetLanguage(['cmn-Hant-TW', 'en'])).toBe('cmn-Hant')
    // Cantonese is given in Traditional characters, so naming them names what the table has (Codex on #272)
    expect(pickTargetLanguage(['yue-Hant-HK', 'en'])).toBe('yue')
    expect(pickTargetLanguage(['yue-HK'])).toBe('yue')
    expect(pickTargetLanguage(['yue-Hans', 'ja'])).toBe('jpn')
  })

  it('`ku` is Kurmanji, in Latin, which the table does not list: its Sorani is given only to a reader who asks for Arabic script or for `ckb` (Codex on #272)', () => {
    expect(pickTargetLanguage(['ku', 'tr'])).toBe('tur')
    expect(pickTargetLanguage(['ku-Latn-TR', 'tr'])).toBe('tur')
    expect(pickTargetLanguage(['ku-Arab-IQ'])).toBe('ckb')
    // Named by its own code it is asked for outright; a script it is not written in still is not given
    expect(pickTargetLanguage(['ckb-IQ', 'en'])).toBe('ckb')
    expect(pickTargetLanguage(['ckb'])).toBe('ckb')
    expect(pickTargetLanguage(['ckb-Latn', 'tr'])).toBe('tur')
    expect(pickTargetLanguage(['uzn'])).toBe('uzn')
  })

  it('reads the script where BCP-47 puts it: what follows a singleton is an extension, not the language (Codex on #272)', () => {
    // Arabic with Latin digits, a common system setting — not Arabic in Latin script
    expect(pickTargetLanguage(['ar-EG-u-nu-latn', 'en'])).toBe('arb')
    expect(pickTargetLanguage(['de-DE-u-co-phonebk'])).toBe('deu')
    expect(pickTargetLanguage(['zh-TW-u-ca-roc'])).toBe('cmn-Hant')
    expect(pickTargetLanguage(['sr-u-nu-latn'])).toBe('srp')
  })

  it('knows the two regions where an unmarked tag means another script, and passes them over', () => {
    expect(pickTargetLanguage(['sr-ME', 'de'])).toBe('deu')
    expect(pickTargetLanguage(['sr-Cyrl-ME'])).toBe('srp')
    expect(pickTargetLanguage(['pa-PK', 'ur'])).toBe('urd')
    expect(pickTargetLanguage(['pa-IN'])).toBe('pan')
  })

  it('knows a language by the code the browser uses for it, and a three-letter one with its region', () => {
    expect(pickTargetLanguage(['fil-PH', 'en'])).toBe('tgl')
    expect(pickTargetLanguage(['no'])).toBe('nob')
    expect(pickTargetLanguage(['ceb-PH', 'en'])).toBe('ceb')
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
