// The font role table (font-roles.mjs) and its generated coverage (font-coverage.mjs): a PDF font's class from its
// PostScript name, a paper's English family from the TeX path's probe or the layout file's fonts (one table of names behind
// both), the faces each target draws in under the maintainer's rulings of 2026-10-06 (spec §1.3, §4.4), and whether a
// text is drawable from the served faces alone. No face is the reader's own: one rendering on every device
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { COVERAGE, COVERAGE_SOURCE, METRICS } from '@/pdf-reader/engine/font-coverage.mjs'
import { canDraw, classifyFont, type Design, FACES, type FaceId, type FontClass, faceFor, familyOfFonts, familyOfProbe, rolesFor } from '@/pdf-reader/engine/font-roles.mjs'

const cls = (name: string) => { const c = classifyFont(name); return { cls: c.cls, bold: c.bold, italic: c.italic, caps: c.caps, design: c.design, known: c.known } }
const covers = (id: FaceId, cp: number) => {
  const r = COVERAGE[id] ?? []
  for (let i = 0; i + 1 < r.length; i += 2) if (cp >= r[i]! && cp <= r[i + 1]!) return true
  return false
}
const probe = (rm: string) => ({ rm, sf: 'cmss', tt: 'cmtt', body: rm })
const run = (o: Partial<{ script: 'cjk' | 'latin'; cls: FontClass['cls']; design: Design; bold: boolean; italic: boolean; caps: boolean }>) =>
  ({ script: 'latin' as const, cls: 'serif' as const, design: 'cm' as const, bold: false, italic: false, caps: false, ...o })
const STYLES = [[false, false, 'regular'], [true, false, 'bold'], [false, true, 'italic'], [true, true, 'bolditalic']] as const

describe('classifyFont', () => {
  it('each name\'s class', () => {
    const rows: [string, Partial<FontClass>][] = [
      ['ABCDEF+NimbusRomNo9L-Medi', { cls: 'serif', bold: true, italic: false, design: 'times', known: true }],
      ['NimbusRomNo9L-ReguItal', { cls: 'serif', bold: false, italic: true, design: 'times' }],
      ['CMTI10', { cls: 'serif', bold: false, italic: true, design: 'cm', known: true }],
      ['SFBX1200', { cls: 'serif', bold: true, italic: false, design: 'cm' }],
      ['LMRoman10-Bold', { cls: 'serif', bold: true, italic: false, design: 'cm' }],
      ['CMMI10', { cls: 'math' }],
      ['CMSY10', { cls: 'math' }],
      ['CMTT10', { cls: 'mono', design: 'cmtt', bold: false }],
      ['NimbusMonL-Regu', { cls: 'mono', design: 'courier', bold: false, italic: false }],
      ['CMSS10', { cls: 'sans', design: 'cmss' }],
      ['NimbusSanL-Regu', { cls: 'sans', design: 'helvetica', bold: false }],
      ['CMCSC10', { cls: 'serif', caps: true, design: 'cm', bold: false }],
      ['LinLibertineTB', { cls: 'serif', bold: true, italic: false, design: 'libertine' }],
      ['LinLibertineT', { cls: 'serif', bold: false, italic: false, design: 'libertine' }],
      ['URWPalladioL-Roma', { cls: 'serif', bold: false, italic: false, design: 'palatino' }],
      ['XCharter-Roman', { cls: 'serif', bold: false, italic: false, design: 'charter' }],
      ['T3Font_0', { known: false }],
    ]
    for (const [name, want] of rows) expect(cls(name), name).toMatchObject(want)
  })

  it('a name it cannot place is unknown, never a crash, whatever its length', () => {
    expect(classifyFont('').known).toBe(false)
    expect(classifyFont('ABCDEF+').known).toBe(false)
    const long = 'X'.repeat(10_000)
    expect(classifyFont(long)).toMatchObject({ known: false, design: 'other' })
    expect(classifyFont(`CMR10${long}`).known).toBe(false)
  })
})

describe('the family of a paper', () => {
  it('by probe and by fonts', () => {
    const rows: [string, string][] = [
      ['cmr', 'cm'], ['ptm', 'times'], ['txr', 'times'], ['ntxtlf', 'times'], ['LinuxLibertineT-TLF', 'libertine'],
      ['ppl', 'palatino'], ['zpl', 'palatino'], ['bch', 'charter'], ['XCharter-TLF', 'charter'], ['put', 'utopia'],
      ['Erewhon-TLF', 'utopia'], ['ebg', 'garamond'], ['EBGaramond-TLF', 'garamond'], ['foo', 'other'],
    ]
    for (const [rm, family] of rows) expect(familyOfProbe(probe(rm)), rm).toBe(family)
    expect(familyOfProbe(null)).toBe('other')
    expect(familyOfFonts(['CMR10', 'NimbusRomNo9L-Regu'], [10, 90])).toBe('times')
    expect(familyOfFonts(['CMR10', 'NimbusRomNo9L-Regu'], [90, 10])).toBe('cm')
  })

  it('weighs only the text faces, and any input it is given', () => {
    // the math and the code are not the body: a CM-math Times paper is a Times paper
    expect(familyOfFonts(['CMMI10', 'CMSY10', 'CMTT10', 'NimbusRomNo9L-Regu'], [500, 500, 500, 1])).toBe('times')
    expect(familyOfFonts([], [])).toBe('other')
    expect(familyOfFonts(['CMR10'], [])).toBe('other')
    expect(familyOfFonts(['CMR10', 'NimbusRomNo9L-Regu'], [Number.NaN, 1])).toBe('times')
    expect(familyOfFonts(['CMR10', 'NimbusRomNo9L-Regu'], [-100, 1])).toBe('times')
    expect(familyOfFonts(['CMR10', 'NimbusRomNo9L-Regu'], [Number.POSITIVE_INFINITY, 1])).toBe('times')
  })
})

describe('the roles', () => {
  it('the CJK roles follow the rulings', () => {
    expect(rolesFor('zh', 'cm').cjk).toEqual({ body: 'shs-sc-light', bold: 'shs-sc-semibold', italic: 'fandolkai', boldItalic: 'fandolkai' })
    expect(rolesFor('zh', 'garamond').cjk).toEqual({ body: 'shs-sc-light', bold: 'shs-sc-semibold', italic: 'fandolkai', boldItalic: 'fandolkai' })
    for (const family of ['times', 'libertine', 'palatino', 'charter', 'utopia', 'other'] as const) {
      expect(rolesFor('zh', family).cjk, family).toEqual({ body: 'shs-sc-regular', bold: 'shs-sc-bold', italic: 'fandolkai', boldItalic: 'fandolkai' })
    }
    expect(rolesFor('zh-TW', 'cm').cjk).toEqual({ body: 'shs-tc-light', bold: 'shs-tc-semibold', italic: 'bkai00mp', boldItalic: 'bkai00mp' })
    expect(rolesFor('zh-Hant', 'times').cjk).toEqual({ body: 'shs-tc-regular', bold: 'shs-tc-bold', italic: 'bkai00mp', boldItalic: 'bkai00mp' })
    expect(rolesFor('ja', 'cm').cjk).toEqual({ body: 'haranoaji-light', bold: 'haranoaji-semibold', italic: null, boldItalic: null })
    expect(rolesFor('ja', 'times').cjk).toEqual({ body: 'haranoaji-regular', bold: 'haranoaji-bold', italic: null, boldItalic: null })
    for (const family of ['cm', 'times'] as const) {
      expect(rolesFor('ko', family).cjk, family).toEqual({ body: 'unbatang', bold: 'unbatang-bold', italic: null, boldItalic: null })
    }
    for (const lang of ['de', 'fr', 'ru']) expect(rolesFor(lang, 'cm').cjk, lang).toBeNull()
    expect(rolesFor('zh', 'cm')).toMatchObject({ target: 'zh', family: 'cm' })
    expect(() => rolesFor('ar', 'cm')).toThrow()
    // Source Han Serif K waits for decision 1d: in the table, in no role
    expect(FACES['shs-k-light']).toBeDefined()
  })

  it('the fallbacks: TC to SC at its weight, a Kai to the body, every Latin face to Latin Modern Math', () => {
    const tw = rolesFor('zh-TW', 'cm')
    expect(tw.fallbacks['shs-tc-light']).toEqual(['shs-sc-light'])
    expect(tw.fallbacks['shs-tc-semibold']).toEqual(['shs-sc-semibold'])
    expect(tw.fallbacks.bkai00mp).toEqual(['shs-tc-light'])
    expect(rolesFor('zh', 'times').fallbacks.fandolkai).toEqual(['shs-sc-regular'])
    for (const [id, face] of Object.entries(FACES)) {
      const latin = !/^(shs-|haranoaji|fandolkai|bkai00mp|unbatang)/.test(face.id) && id !== 'lm-math'
      if (latin) expect(tw.fallbacks[id], id).toEqual(['lm-math'])
    }
    expect(tw.fallbacks['lm-math']).toBeUndefined()
  })

  it('faceFor by design', () => {
    // [design, the Latin target's group (and a CJK target's Latin runs), the Cyrillic target's]
    const table: [Design, string, string][] = [
      ['cm', 'lm-roman', 'cmun-serif'], ['other', 'lm-roman', 'cmun-serif'], ['times', 'termes', 'tempora'],
      ['libertine', 'libertine', 'libertine'], ['palatino', 'pagella', 'domitian'], ['charter', 'xcharter', 'xcharter'],
      ['garamond', 'ebgaramond', 'ebgaramond'], ['utopia', 'erewhon', 'erewhon'], ['helvetica', 'heros', 'nimbus-sans'],
      ['cmss', 'lm-sans', 'cmun-sans'], ['courier', 'cursor', 'nimbus-mono'], ['cmtt', 'lm-mono', 'cmun-mono'],
      ['beramono', 'dejavu-mono', 'dejavu-mono'], ['inconsolata', 'inconsolata', 'pt-mono'],
    ]
    // a group without a style's file: its italic set upright, its bold set regular, as TeX's substitution does
    const missing: Record<string, Partial<Record<string, string>>> = {
      'lm-sans': { bolditalic: 'bold' },
      'lm-mono': { bold: 'regular', bolditalic: 'italic' },
      'cmun-mono': { bold: 'regular', bolditalic: 'italic' },
      'dejavu-mono': { italic: 'regular', bolditalic: 'bold' },
      inconsolata: { italic: 'regular', bolditalic: 'bold' },
      'pt-mono': { italic: 'regular', bolditalic: 'bold' },
    }
    const clsOf = (d: Design): FontClass['cls'] => (['helvetica', 'cmss'].includes(d) ? 'sans' : ['courier', 'cmtt', 'beramono', 'inconsolata'].includes(d) ? 'mono' : 'serif')
    for (const [design, latn, cyrl] of table) {
      for (const [target, group] of [['de', latn], ['zh', latn], ['ja', latn], ['ru', cyrl]] as const) {
        const roles = rolesFor(target, 'cm')
        for (const [bold, italic, style] of STYLES) {
          const want = `${group}-${missing[group]?.[style] ?? style}`
          expect(faceFor(roles, run({ design, cls: clsOf(design), bold, italic })), `${target} ${design} ${style}`).toBe(want)
          expect(FACES[want], want).toBeDefined()
        }
      }
    }
    // the math class, whatever its design
    for (const target of ['de', 'ru', 'zh']) {
      expect(faceFor(rolesFor(target, 'times'), run({ cls: 'math', design: 'cm' }))).toBe('lm-math')
      expect(faceFor(rolesFor(target, 'times'), run({ cls: 'math', design: 'times', bold: true }))).toBe('lm-math')
    }
    // an unknown family is set in Latin Modern by its class
    expect(faceFor(rolesFor('de', 'other'), run({ design: 'other', cls: 'sans' }))).toBe('lm-sans-regular')
    expect(faceFor(rolesFor('de', 'other'), run({ design: 'other', cls: 'mono' }))).toBe('lm-mono-regular')
    expect(faceFor(rolesFor('ru', 'other'), run({ design: 'other', cls: 'mono' }))).toBe('cmun-mono-regular')
    // small capitals: Latin Modern's caps face; elsewhere the face itself (its smcp, or capitals at 0.8: the drawing's)
    expect(faceFor(rolesFor('de', 'cm'), run({ design: 'cm', caps: true }))).toBe('lm-roman-caps')
    expect(faceFor(rolesFor('zh', 'cm'), run({ design: 'cm', caps: true }))).toBe('lm-roman-caps')
    expect(faceFor(rolesFor('de', 'times'), run({ design: 'times', caps: true }))).toBe('termes-regular')
    expect(faceFor(rolesFor('ru', 'cm'), run({ design: 'cm', caps: true }))).toBe('cmun-serif-regular')
    // CJK runs: the body family by weight and slant, whatever the run's class (no sans, no fangsong: §4.4)
    const zh = rolesFor('zh', 'cm')
    expect(faceFor(zh, run({ script: 'cjk', cls: 'sans', design: 'helvetica' }))).toBe('shs-sc-light')
    expect(faceFor(zh, run({ script: 'cjk', cls: 'mono', design: 'cmtt' }))).toBe('shs-sc-light')
    expect(faceFor(zh, run({ script: 'cjk', cls: 'sans', design: 'helvetica', bold: true }))).toBe('shs-sc-semibold')
    expect(faceFor(zh, run({ script: 'cjk', italic: true }))).toBe('fandolkai')
    expect(faceFor(zh, run({ script: 'cjk', bold: true, italic: true }))).toBe('fandolkai')
    const ja = rolesFor('ja', 'times')
    expect(faceFor(ja, run({ script: 'cjk', italic: true }))).toBe('haranoaji-regular')
    expect(faceFor(ja, run({ script: 'cjk', bold: true, italic: true }))).toBe('haranoaji-bold')
    expect(faceFor(rolesFor('ko', 'cm'), run({ script: 'cjk', bold: true }))).toBe('unbatang-bold')
  })
})

describe('the faces', () => {
  it('no face is the system\'s', () => {
    const GENERIC = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace|ui-rounded|math|emoji|fangsong|-apple-system|BlinkMacSystemFont)$/i
    const SYSTEM = /^(Times|Arial|Helvetica|Courier|Georgia|Verdana|Palatino|Cambria|Calibri|SimSun|SimHei|KaiTi|FangSong|PingFang|Hiragino|Songti|STSong|STKaiti|Yu ?Mincho|YuGothic|MS ?Mincho|MS ?Gothic|Meiryo|Batang|Gulim|Malgun|AppleMyungjo|Apple ?SD|Noto Serif CJK|Microsoft)/i
    for (const [id, face] of Object.entries(FACES)) {
      expect(face.id, id).toBe(id)
      expect(face.family, id).toMatch(/^axt-[a-z0-9-]+$/)
      expect(face.family, id).not.toMatch(GENERIC)
      expect(face.file, id).not.toMatch(SYSTEM)
      expect(face.file, id).toMatch(/^[A-Za-z0-9_-]+\.(otf|ttf)$/)
      expect(['texlive', 'hosted'], id).toContain(face.source)
      // what is hosted is Source Han Serif's regional OTFs, and only they
      expect(face.source === 'hosted', id).toBe(/^SourceHanSerif(SC|TC|K)-/.test(face.file))
      expect([300, 400, 500, 600, 700], id).toContain(face.weight)
      expect(['normal', 'italic'], id).toContain(face.style)
    }
    // one face a file, one family-weight-style a face
    const files = Object.values(FACES).map(f => f.file)
    expect(new Set(files).size).toBe(files.length)
    const keys = Object.values(FACES).map(f => `${f.family}|${f.weight}|${f.style}`)
    expect(new Set(keys).size).toBe(keys.length)
    for (const file of ['src/pdf-reader/engine/font-roles.mjs', 'src/pdf-reader/engine/font-coverage.mjs']) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/local\(/)
    }
  })

  it('the table\'s faces are the plan\'s', () => {
    const cjk = ['light', 'regular', 'medium', 'semibold', 'bold']
    const four = ['regular', 'bold', 'italic', 'bolditalic']
    const want = [
      ...['shs-sc', 'shs-tc', 'shs-k', 'haranoaji'].flatMap(g => cjk.map(w => `${g}-${w}`)),
      'fandolkai', 'bkai00mp', 'unbatang', 'unbatang-bold',
      ...['lm-roman', 'termes', 'heros', 'cursor', 'pagella', 'libertine', 'xcharter', 'ebgaramond', 'erewhon', 'cmun-serif', 'cmun-sans', 'tempora', 'domitian', 'nimbus-sans', 'nimbus-mono'].flatMap(g => four.map(s => `${g}-${s}`)),
      'lm-roman-caps', 'lm-sans-regular', 'lm-sans-bold', 'lm-sans-italic', 'lm-mono-regular', 'lm-mono-italic', 'lm-math',
      'cmun-mono-regular', 'cmun-mono-italic', 'dejavu-mono-regular', 'dejavu-mono-bold', 'inconsolata-regular', 'inconsolata-bold', 'pt-mono-regular', 'pt-mono-bold',
    ]
    expect(Object.keys(FACES).sort()).toEqual(want.sort())
    expect(FACES['shs-sc-light']).toMatchObject({ file: 'SourceHanSerifSC-Light.otf', family: 'axt-shs-sc', weight: 300, style: 'normal', source: 'hosted' })
    expect(FACES['haranoaji-semibold']).toMatchObject({ file: 'HaranoAjiMincho-SemiBold.otf', family: 'axt-haranoaji', weight: 600, source: 'texlive' })
    expect(FACES['unbatang-bold']).toMatchObject({ file: 'UnBatangBold.ttf', family: 'axt-unbatang', weight: 700 })
    expect(FACES['lm-sans-italic']).toMatchObject({ file: 'lmsans10-oblique.otf', family: 'axt-lm-sans', weight: 400, style: 'italic' })
    expect(FACES['termes-bolditalic']).toMatchObject({ file: 'texgyretermes-bolditalic.otf', family: 'axt-termes', weight: 700, style: 'italic' })
    expect(FACES['lm-roman-caps']).toMatchObject({ file: 'lmromancaps10-regular.otf', family: 'axt-lm-roman-caps' })
  })

  it('every face has its coverage, metrics and licence', () => {
    expect(Object.keys(COVERAGE).sort()).toEqual(Object.keys(FACES).sort())
    expect(Object.keys(METRICS).sort()).toEqual(Object.keys(FACES).sort())
    for (const id of Object.keys(FACES)) {
      const r = COVERAGE[id] ?? []
      expect(r.length % 2, id).toBe(0)
      expect(r.length, id).toBeGreaterThan(0)
      for (let i = 0; i + 1 < r.length; i += 2) {
        const start = r[i]!, end = r[i + 1]!
        expect(Number.isInteger(start) && Number.isInteger(end), id).toBe(true)
        expect(start >= 0 && start <= end && end <= 0x10ffff, `${id} range ${i / 2}`).toBe(true)
        // sorted and disjoint, and two ranges that touch are one
        if (i > 0) expect(start > r[i - 1]! + 1, `${id} range ${i / 2}`).toBe(true)
      }
      const m = METRICS[id]!
      expect(m.unitsPerEm, id).toBeGreaterThanOrEqual(16)
      expect(m.ascent, id).toBeGreaterThan(0)
      expect(m.descent, id).toBeGreaterThanOrEqual(0)
      expect(typeof m.smcp, id).toBe('boolean')
      expect(m.sha256, id).toMatch(/^[0-9a-f]{64}$/)
    }
    // the same file, the same digest
    const digest = new Map<string, string>()
    for (const [id, f] of Object.entries(FACES)) {
      const sha = METRICS[id]?.sha256 ?? ''
      const seen = digest.get(sha)
      expect(seen === undefined || seen === f.file, id).toBe(true)
      digest.set(sha, f.file)
    }
    expect(COVERAGE_SOURCE.release['source-han-serif']).toMatch(/^\d+\.\d+R?$/)
    expect(COVERAGE_SOURCE.release.texlive).toMatch(/^texlive\/texlive@sha256:[0-9a-f]{64}$/)

    const web = (re: RegExp) => Object.values(FACES).filter(f => re.test(f.id)).map(f => f.web)
    for (const f of Object.values(FACES)) {
      // an SPDX identifier, an identifier WITH an exception, or a LicenseRef-
      expect(f.licence, f.id).toMatch(/^(LicenseRef-[A-Za-z0-9.-]+|[A-Za-z0-9.+-]+(?: WITH [A-Za-z0-9.+-]+)?)$/)
      expect(['ofl', 'gfl', 'notice', 'gpl', 'review'], f.id).toContain(f.web)
      // an OFL face is served as one, and only an OFL face
      expect(f.licence === 'OFL-1.1', f.id).toBe(f.web === 'ofl')
    }
    expect(Object.values(FACES).filter(f => f.web === 'review').map(f => f.id).sort())
      .toEqual(['tempora', 'nimbus-sans', 'nimbus-mono'].flatMap(g => ['regular', 'bold', 'italic', 'bolditalic'].map(s => `${g}-${s}`)).sort())
    expect(new Set(web(/^(lm-|termes-|heros-|cursor-|pagella-)/))).toEqual(new Set(['gfl']))
    expect(new Set(web(/^(bkai00mp|xcharter-|dejavu-mono-)/))).toEqual(new Set(['notice']))
    expect(new Set(web(/^(fandolkai|unbatang)/))).toEqual(new Set(['gpl']))
    expect(new Set(web(/^(shs-|haranoaji-|cmun-|domitian-|erewhon-|ebgaramond-|libertine-)/))).toEqual(new Set(['ofl']))
  })

  it('canDraw by coverage and fallbacks', () => {
    const tw = rolesFor('zh-TW', 'cm')
    const alone = { ...tw, fallbacks: {} }
    // the first character of `face`'s coverage, from the CJK blocks on, that `other` alone cannot draw
    const firstLacking = (face: FaceId, other: FaceId) => {
      const r = COVERAGE[face] ?? []
      for (let i = 0; i + 1 < r.length; i += 2) {
        for (let cp = Math.max(r[i]!, 0x2e80); cp <= r[i + 1]!; cp++) if (!canDraw(String.fromCodePoint(cp), [other], alone)) return cp
      }
      return -1
    }
    // a character Source Han Serif SC holds and TC lacks is drawn through TC's fallback. Release 2.003R's language OTFs
    // map the same 44,779 code points in SC and in TC, so there it draws nothing TC cannot: the coverage is then equal
    const only = firstLacking('shs-sc-light', 'shs-tc-light')
    if (only < 0) expect(COVERAGE['shs-tc-light']).toEqual(COVERAGE['shs-sc-light'])
    else {
      expect(canDraw(String.fromCodePoint(only), ['shs-tc-light'], tw)).toBe(true)
      expect(canDraw(String.fromCodePoint(only), ['shs-tc-light'], alone)).toBe(false)
    }
    // a character the Kai lacks is drawn in the body: AR PL KaitiM Big5's Big5 set against Source Han Serif TC's
    const kaiLacks = firstLacking('shs-tc-light', 'bkai00mp')
    expect(kaiLacks, 'TC holds a character AR PL KaitiM Big5 lacks').toBeGreaterThan(0)
    expect(canDraw(String.fromCodePoint(kaiLacks), ['bkai00mp'], tw)).toBe(true)
    expect(canDraw(String.fromCodePoint(kaiLacks), ['bkai00mp'], alone)).toBe(false)
    // and in zh-Hans, FandolKai's GB 2312 against Source Han Serif SC
    const fandolLacks = firstLacking('shs-sc-light', 'fandolkai')
    expect(canDraw(String.fromCodePoint(fandolLacks), ['fandolkai'], rolesFor('zh', 'cm'))).toBe(true)
    expect(canDraw(String.fromCodePoint(fandolLacks), ['fandolkai'], { ...rolesFor('zh', 'cm'), fallbacks: {} })).toBe(false)
    // a character no face holds (the private use area), and one face unknown to the table
    expect(canDraw('\ue000', Object.keys(FACES), tw)).toBe(false)
    expect(canDraw(`a\ue000`, ['lm-roman-regular'], tw)).toBe(false)
    expect(canDraw('a', ['no-such-face'], { ...tw, fallbacks: {} })).toBe(false)
    // white space is never a character to draw
    expect(canDraw(' \t\n\u00a0\u3000', [], tw)).toBe(true)
    expect(canDraw('', [], tw)).toBe(true)
    expect(canDraw('a b', ['lm-roman-regular'], tw)).toBe(true)
    // a symbol a Latin face lacks comes from Latin Modern Math
    let symbol = -1
    for (let cp = 0x2200; cp <= 0x22ff && symbol < 0; cp++) if (covers('lm-math', cp) && !covers('termes-regular', cp)) symbol = cp
    expect(symbol).toBeGreaterThan(0)
    expect(canDraw(String.fromCodePoint(symbol), ['termes-regular'], rolesFor('de', 'times'))).toBe(true)
    expect(canDraw(String.fromCodePoint(symbol), ['termes-regular'], { ...rolesFor('de', 'times'), fallbacks: {} })).toBe(false)
    // a code point past the BMP is one character
    expect(canDraw('\u{1F600}', ['lm-roman-regular'], tw)).toBe(covers('lm-roman-regular', 0x1f600) || covers('lm-math', 0x1f600))
  })
})
