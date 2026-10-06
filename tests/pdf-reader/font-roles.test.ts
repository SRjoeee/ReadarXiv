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
    // Korean: Source Han Serif K, as SC and TC (the maintainer, 2026-10-06), its emphasis upright
    expect(rolesFor('ko', 'cm').cjk).toEqual({ body: 'shs-k-light', bold: 'shs-k-semibold', italic: null, boldItalic: null })
    expect(rolesFor('ko', 'times').cjk).toEqual({ body: 'shs-k-regular', bold: 'shs-k-bold', italic: null, boldItalic: null })
    for (const lang of ['de', 'fr', 'ru']) expect(rolesFor(lang, 'cm').cjk, lang).toBeNull()
    expect(rolesFor('zh', 'cm')).toMatchObject({ target: 'zh', family: 'cm' })
    expect(() => rolesFor('ar', 'cm')).toThrow()
  })

  it('the fallbacks: TC to SC at its weight, a Kai to the body, every Latin face to Latin Modern Math', () => {
    const tw = rolesFor('zh-TW', 'cm')
    expect(tw.fallbacks['shs-tc-light']).toEqual(['shs-sc-light'])
    expect(tw.fallbacks['shs-tc-semibold']).toEqual(['shs-sc-semibold'])
    expect(tw.fallbacks.bkai00mp).toEqual(['shs-tc-light'])
    expect(rolesFor('zh', 'times').fallbacks.fandolkai).toEqual(['shs-sc-regular'])
    for (const [id, face] of Object.entries(FACES)) {
      const latin = !/^(shs-|haranoaji|fandolkai|bkai00mp)/.test(face.id) && id !== 'lm-math'
      if (latin) expect(tw.fallbacks[id], id).toEqual(['lm-math'])
    }
    expect(tw.fallbacks['lm-math']).toBeUndefined()
  })

  it('faceFor by design', () => {
    // [design, the Latin target's group (and a CJK target's Latin runs), the Cyrillic target's]
    // CM's text in CMU Serif, CM's own glyphs, but its bold italic in Latin Modern (nearer CM's than CMU's)
    const CM_TEXT = { regular: 'cmun-serif', bold: 'cmun-serif', italic: 'cmun-serif', bolditalic: 'lm-roman' }
    const table: [Design, string | Record<string, string>, string][] = [
      ['cm', CM_TEXT, 'cmun-serif'], ['other', 'lm-roman', 'cmun-serif'], ['times', 'nimbus-roman', 'nimbus-roman'],
      ['libertine', 'libertine', 'libertine'], ['palatino', 'domitian', 'domitian'], ['charter', 'xcharter', 'xcharter'],
      ['garamond', 'ebgaramond', 'ebgaramond'], ['utopia', 'erewhon', 'erewhon'], ['helvetica', 'nimbus-sans', 'nimbus-sans'],
      ['cmss', 'lm-sans', 'cmun-sans'], ['courier', 'cursor', 'nimbus-mono'], ['cmtt', 'lm-mono', 'cmun-mono'],
      ['beramono', 'dejavu-mono', 'dejavu-mono'], ['inconsolata', 'inconsolata', 'pt-mono'], ['biolinum', 'biolinum', 'biolinum'],
    ]
    // a group without a style's file: its italic set upright, its bold set regular, as TeX's substitution does; and a
    // style whose file lacks the target's letters, the nearest style that has them (Linux Libertine O's bold italic has
    // no Cyrillic)
    const missing: Record<string, Partial<Record<string, string>>> = {
      'lm-mono': { bold: 'regular', bolditalic: 'italic' },
      inconsolata: { italic: 'regular', bolditalic: 'bold' },
      'pt-mono': { italic: 'regular', bolditalic: 'bold' },
    }
    const missingIn = (target: string, group: string) => (target === 'ru' && group === 'libertine' ? { bolditalic: 'bold' } : missing[group])
    const clsOf = (d: Design): FontClass['cls'] => (['helvetica', 'cmss', 'biolinum'].includes(d) ? 'sans' : ['courier', 'cmtt', 'beramono', 'inconsolata'].includes(d) ? 'mono' : 'serif')
    for (const [design, latn, cyrl] of table) {
      for (const [target, groups] of [['de', latn], ['zh', latn], ['ja', latn], ['ru', cyrl]] as const) {
        const roles = rolesFor(target, 'cm')
        for (const [bold, italic, style] of STYLES) {
          const group = typeof groups === 'string' ? groups : groups[style]!
          const want = `${group}-${missingIn(target, group)?.[style] ?? style}`
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
    expect(faceFor(rolesFor('de', 'times'), run({ design: 'times', caps: true }))).toBe('nimbus-roman-regular')
    expect(faceFor(rolesFor('ru', 'cm'), run({ design: 'cm', caps: true }))).toBe('cmun-serif-regular')
    // the caps face has an oblique and no bold: italic small capitals take it, bold ones the family's bold
    expect(faceFor(rolesFor('de', 'cm'), run({ design: 'cm', caps: true, italic: true }))).toBe('lm-roman-caps-italic')
    expect(faceFor(rolesFor('de', 'cm'), run({ design: 'cm', caps: true, bold: true }))).toBe('cmun-serif-bold')
    expect(faceFor(rolesFor('de', 'cm'), run({ design: 'cm', caps: true, bold: true, italic: true }))).toBe('lm-roman-bolditalic')
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
    expect(faceFor(rolesFor('ko', 'cm'), run({ script: 'cjk', bold: true }))).toBe('shs-k-semibold')
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
      // what is hosted is Source Han Serif's regional OTFs and URW's base 35 release, and only they
      expect(face.source === 'hosted', id).toBe(/^(SourceHanSerif(SC|TC|K)|NimbusRoman|NimbusSans|NimbusMonoPS)-/.test(face.file))
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
      'fandolkai', 'bkai00mp',
      ...['lm-roman', 'lm-sans', 'nimbus-roman', 'nimbus-sans', 'nimbus-mono', 'cursor', 'libertine', 'biolinum', 'xcharter', 'ebgaramond', 'erewhon', 'cmun-serif', 'cmun-sans', 'cmun-mono', 'domitian', 'dejavu-mono'].flatMap(g => four.map(s => `${g}-${s}`)),
      'lm-roman-caps', 'lm-roman-caps-italic', 'lm-mono-regular', 'lm-mono-italic', 'lm-math',
      'inconsolata-regular', 'inconsolata-bold', 'pt-mono-regular', 'pt-mono-bold',
    ]
    expect(Object.keys(FACES).sort()).toEqual(want.sort())
    expect(FACES['shs-sc-light']).toMatchObject({ file: 'SourceHanSerifSC-Light.otf', family: 'axt-shs-sc', weight: 300, style: 'normal', source: 'hosted' })
    expect(FACES['haranoaji-semibold']).toMatchObject({ file: 'HaranoAjiMincho-SemiBold.otf', family: 'axt-haranoaji', weight: 600, source: 'texlive' })
    expect(FACES['lm-sans-bolditalic']).toMatchObject({ file: 'lmsans10-boldoblique.otf', family: 'axt-lm-sans', weight: 700, style: 'italic' })
    expect(FACES['lm-roman-caps-italic']).toMatchObject({ file: 'lmromancaps10-oblique.otf', family: 'axt-lm-roman-caps', weight: 400, style: 'italic' })
    expect(FACES['cmun-mono-bolditalic']).toMatchObject({ file: 'cmuntx.otf', family: 'axt-cmun-mono', weight: 700, style: 'italic' })
    expect(FACES['dejavu-mono-italic']).toMatchObject({ file: 'DejaVuSansMono-Oblique.ttf', family: 'axt-dejavu-mono', weight: 400, style: 'italic' })
    expect(FACES['biolinum-bolditalic']).toMatchObject({ file: 'LinBiolinum_RBO.otf', family: 'axt-biolinum', weight: 700, style: 'italic' })
    expect(FACES['lm-sans-italic']).toMatchObject({ file: 'lmsans10-oblique.otf', family: 'axt-lm-sans', weight: 400, style: 'italic' })
    expect(FACES['nimbus-roman-bolditalic']).toMatchObject({ file: 'NimbusRoman-BoldItalic.otf', family: 'axt-nimbus-roman', weight: 700, style: 'italic', source: 'hosted' })
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
    expect(COVERAGE_SOURCE.release['urw-base35-fonts']).toBe('20200910')

    const web = (re: RegExp) => Object.values(FACES).filter(f => re.test(f.id)).map(f => f.web)
    for (const f of Object.values(FACES)) {
      // an SPDX identifier, an identifier WITH an exception, or a LicenseRef-
      expect(f.licence, f.id).toMatch(/^(LicenseRef-[A-Za-z0-9.-]+|[A-Za-z0-9.+-]+(?: WITH [A-Za-z0-9.+-]+)?)$/)
      expect(['ofl', 'gfl', 'notice', 'gpl', 'review'], f.id).toContain(f.web)
      // an OFL face is served as one, and only an OFL face
      expect(f.licence === 'OFL-1.1', f.id).toBe(f.web === 'ofl')
    }
    // nothing is left for review: URW's own release carries its embedding exception (the maintainer, 2026-10-06)
    expect(Object.values(FACES).filter(f => f.web === 'review')).toEqual([])
    expect(new Set(web(/^(lm-|cursor-)/))).toEqual(new Set(['gfl']))
    expect(new Set(web(/^(bkai00mp|xcharter-|dejavu-mono-)/))).toEqual(new Set(['notice']))
    expect(Object.values(FACES).filter(f => f.web === 'gpl').map(f => f.id).sort())
      .toEqual(['fandolkai', ...['nimbus-roman', 'nimbus-sans', 'nimbus-mono'].flatMap(g => ['regular', 'bold', 'italic', 'bolditalic'].map(s => `${g}-${s}`))].sort())
    expect(new Set(web(/^(shs-|haranoaji-|cmun-|domitian-|erewhon-|ebgaramond-|libertine-|biolinum-)/))).toEqual(new Set(['ofl']))
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
    for (let cp = 0x2200; cp <= 0x22ff && symbol < 0; cp++) if (covers('lm-math', cp) && !covers('nimbus-roman-regular', cp)) symbol = cp
    expect(symbol).toBeGreaterThan(0)
    expect(canDraw(String.fromCodePoint(symbol), ['nimbus-roman-regular'], rolesFor('de', 'times'))).toBe(true)
    expect(canDraw(String.fromCodePoint(symbol), ['nimbus-roman-regular'], { ...rolesFor('de', 'times'), fallbacks: {} })).toBe(false)
    // a code point past the BMP is one character
    expect(canDraw('\u{1F600}', ['lm-roman-regular'], tw)).toBe(covers('lm-roman-regular', 0x1f600) || covers('lm-math', 0x1f600))
  })
})

// Task 7's fix round 1 (task-7-review.md): each row failed before its fix
describe('the fixes of the review', () => {
  const LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
  // each target's own letters: what a face must hold to set its text
  const LETTERS: Record<string, string> = {
    de: `${LATIN}ÄÖÜäöüß`, fr: `${LATIN}ÀÂÆÇÉÈÊËÎÏÔŒÙÛÜŸàâæçéèêëîïôœùûüÿ`, es: `${LATIN}ÁÉÍÑÓÚÜáéíñóúü¡¿`,
    pt: `${LATIN}ÃÕÁÂÀÇÉÊÍÓÔÚÜãõáâàçéêíóôúü`, ru: 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', zh: LATIN,
  }
  const DESIGNS: Design[] = ['cm', 'other', 'times', 'libertine', 'palatino', 'charter', 'garamond', 'utopia', 'helvetica', 'cmss', 'courier', 'cmtt', 'beramono', 'inconsolata', 'biolinum']

  it('I2: canDraw skips the invisible characters, as the TeX path drops them', () => {
    const zh = rolesFor('zh', 'cm'), ja = rolesFor('ja', 'cm'), ko = rolesFor('ko', 'cm')
    // a zero width space, non-joiner, joiner, word joiner, byte order mark, soft hyphen, variation selector
    for (const ch of ['\u200b', '\u200c', '\u200d', '\u2060', '\ufeff', '\u00ad', '\ufe00']) {
      expect(canDraw(`\u4e2d${ch}\u6587`, ['shs-sc-light'], zh), ch.codePointAt(0)!.toString(16)).toBe(true)
      expect(canDraw(`\u65e5${ch}\u672c`, ['haranoaji-light'], ja)).toBe(true)
      expect(canDraw(`\ud55c${ch}\uad6d`, ['shs-k-light'], ko)).toBe(true)
    }
    // a visible character no face holds still is not drawable
    expect(canDraw('\u4e2d\u200b\ue000', ['shs-sc-light'], zh)).toBe(false)
  })

  it('M3: a style whose face lacks the target\'s letters falls back within its family, never to the original', () => {
    const ru = rolesFor('ru', 'libertine')
    const face = faceFor(ru, run({ design: 'libertine', bold: true, italic: true }))
    expect(face).toBe('libertine-bold')
    expect(canDraw(LETTERS.ru!, [face], { ...ru, fallbacks: {} })).toBe(true)
    // every design, target and style: the face drawn holds every letter of the target, with no fallback
    for (const target of Object.keys(LETTERS)) {
      const roles = rolesFor(target, 'cm'), alone = { ...roles, fallbacks: {} }
      for (const design of DESIGNS) {
        const cls: FontClass['cls'] = ['helvetica', 'cmss', 'biolinum'].includes(design) ? 'sans' : ['courier', 'cmtt', 'beramono', 'inconsolata'].includes(design) ? 'mono' : 'serif'
        for (const [bold, italic, style] of STYLES) {
          for (const caps of [false, true]) {
            const id = faceFor(roles, run({ design, cls, bold, italic, caps }))
            expect(canDraw(LETTERS[target]!, [id], alone), `${target} ${design} ${style}${caps ? ' caps' : ''}: ${id}`).toBe(true)
          }
        }
      }
    }
  })

  it('M4: the styles TeX Live has are the layer\'s too; Biolinum is its own family', () => {
    expect(faceFor(rolesFor('de', 'cm'), run({ design: 'cmss', cls: 'sans', bold: true, italic: true }))).toBe('lm-sans-bolditalic')
    expect(faceFor(rolesFor('de', 'cm'), run({ design: 'beramono', cls: 'mono', italic: true }))).toBe('dejavu-mono-italic')
    expect(faceFor(rolesFor('ru', 'cm'), run({ design: 'beramono', cls: 'mono', bold: true, italic: true }))).toBe('dejavu-mono-bolditalic')
    expect(faceFor(rolesFor('ru', 'cm'), run({ design: 'cmtt', cls: 'mono', bold: true }))).toBe('cmun-mono-bold')
    expect(faceFor(rolesFor('ru', 'cm'), run({ design: 'cmtt', cls: 'mono', bold: true, italic: true }))).toBe('cmun-mono-bolditalic')
    for (const [name, bold, italic] of [['LinBiolinumT', false, false], ['LinBiolinumTB', true, false], ['LinBiolinumOI', false, true], ['LinBiolinumOBO', true, true]] as const) {
      expect(classifyFont(name), name).toMatchObject({ cls: 'sans', design: 'biolinum', bold, italic, known: true })
    }
    expect(familyOfProbe({ rm: 'LinuxLibertineT-TLF', sf: 'LinuxBiolinumT-TLF', tt: 'cmtt', body: 'LinuxLibertineT-TLF' })).toBe('libertine')
    expect(faceFor(rolesFor('de', 'libertine'), run({ design: 'biolinum', cls: 'sans', bold: true }))).toBe('biolinum-bold')
    expect(faceFor(rolesFor('ru', 'libertine'), run({ design: 'biolinum', cls: 'sans', italic: true }))).toBe('biolinum-italic')
  })

  it('M6 (with M1 and M2): every face\'s licence identifier, as its name table or licence file states it', () => {
    const GUST = 'LicenseRef-GUST-Font-License', URW = 'AGPL-3.0-only WITH PS-or-PDF-font-exception-20170817'
    const BY_GROUP: Record<string, string> = {
      'shs-sc': 'OFL-1.1', 'shs-tc': 'OFL-1.1', 'shs-k': 'OFL-1.1', haranoaji: 'OFL-1.1',
      fandolkai: 'GPL-3.0-or-later WITH Font-exception-2.0', bkai00mp: 'Arphic-1999',
      'lm-roman': GUST, 'lm-roman-caps': GUST, 'lm-sans': GUST, 'lm-mono': GUST, 'lm-math': GUST, cursor: GUST,
      libertine: 'OFL-1.1', biolinum: 'OFL-1.1', xcharter: 'Bitstream-Charter', ebgaramond: 'OFL-1.1', erewhon: 'OFL-1.1',
      'cmun-serif': 'OFL-1.1', 'cmun-sans': 'OFL-1.1', 'cmun-mono': 'OFL-1.1', domitian: 'OFL-1.1',
      'nimbus-roman': URW, 'nimbus-sans': URW, 'nimbus-mono': URW,
      'dejavu-mono': 'Bitstream-Vera', 'pt-mono': 'ParaType-Free-Font-1.3',
    }
    const BY_FACE: Record<string, string> = { 'inconsolata-regular': 'OFL-1.1', 'inconsolata-bold': 'Apache-2.0' }
    for (const f of Object.values(FACES)) expect(f.licence, f.id).toBe(BY_FACE[f.id] ?? BY_GROUP[f.family.slice('axt-'.length)])
  })

  it('M6: fallbacks of more than one hop; the probe\'s body before its roman', () => {
    const tw = rolesFor('zh-TW', 'cm')
    // a character AR PL KaitiM Big5 lacks, drawn only two hops away
    let lacks = -1
    for (let cp = 0x4e00; cp <= 0x9fff && lacks < 0; cp++) if (!canDraw(String.fromCodePoint(cp), ['bkai00mp'], { ...tw, fallbacks: {} }) && canDraw(String.fromCodePoint(cp), ['shs-sc-light'], { ...tw, fallbacks: {} })) lacks = cp
    expect(lacks).toBeGreaterThan(0)
    const chain = { ...tw, fallbacks: { bkai00mp: ['lm-roman-regular'], 'lm-roman-regular': ['shs-sc-light'] } }
    expect(canDraw(String.fromCodePoint(lacks), ['bkai00mp'], chain)).toBe(true)
    expect(canDraw(String.fromCodePoint(lacks), ['bkai00mp'], { ...chain, fallbacks: { bkai00mp: ['lm-roman-regular'] } })).toBe(false)
    expect(familyOfProbe({ rm: 'cmr', sf: 'cmss', tt: 'cmtt', body: 'ptm' })).toBe('times')
    // a body set sans keeps its roman's weights
    expect(familyOfProbe({ rm: 'ptm', sf: 'phv', tt: 'pcr', body: 'phv' })).toBe('times')
  })

  it('the same glyphs and family as the English original, from the cleanest source of them (the maintainer\'s rule)', () => {
    // Times, Helvetica and Palatino papers: one family for every target, URW's own glyphs (urw-base35 20200910; Domitian
    // for Palatino, P052's glyphs under the OFL); Courier: TeX Gyre Cursor at the original's weight, Nimbus Mono PS for
    // its Cyrillic
    const want: [Design, FontClass['cls'], string, string][] = [
      ['times', 'serif', 'nimbus-roman', 'nimbus-roman'], ['helvetica', 'sans', 'nimbus-sans', 'nimbus-sans'],
      ['palatino', 'serif', 'domitian', 'domitian'], ['courier', 'mono', 'cursor', 'nimbus-mono'],
    ]
    for (const [design, cls, latn, cyrl] of want) {
      for (const [bold, italic, style] of STYLES) {
        for (const target of ['de', 'fr', 'zh', 'ja']) expect(faceFor(rolesFor(target, 'times'), run({ design, cls, bold, italic })), `${target} ${design} ${style}`).toBe(`${latn}-${style}`)
        expect(faceFor(rolesFor('ru', 'times'), run({ design, cls, bold, italic })), `ru ${design} ${style}`).toBe(`${cyrl}-${style}`)
      }
    }
    expect(FACES['nimbus-sans-regular']).toMatchObject({ file: 'NimbusSans-Regular.otf', source: 'hosted', licence: 'AGPL-3.0-only WITH PS-or-PDF-font-exception-20170817', web: 'gpl' })
    expect(FACES['nimbus-mono-bolditalic']).toMatchObject({ file: 'NimbusMonoPS-BoldItalic.otf', source: 'hosted' })
    // no face of TeX Live's nimbus15 (AGPL with no exception in its files), no Tempora, no TeX Gyre Termes, Heros or Pagella
    expect(Object.values(FACES).filter(f => /^(zhv|zco|Tempora|texgyre(termes|heros|pagella))-/.test(f.file))).toEqual([])
  })

  it('Computer Modern: CMU Serif, CM\'s own glyphs; Latin Modern where it is nearer CM\'s, and for an unknown family', () => {
    // against TeX Live's AMS Type 1 CM (cmr10, cmbx10, cmti10, cmbxti10, cmcsc10): CMU 62 of 62 for the roman, bold and
    // italic; for the bold italic Latin Modern 59 to CMU's 32, for the small capitals LM's caps face 26 of 26 to CMU's smcp 3
    for (const target of ['de', 'fr', 'zh', 'ja']) {
      const roles = rolesFor(target, 'cm')
      expect(faceFor(roles, run({ design: 'cm' })), target).toBe('cmun-serif-regular')
      expect(faceFor(roles, run({ design: 'cm', bold: true }))).toBe('cmun-serif-bold')
      expect(faceFor(roles, run({ design: 'cm', italic: true }))).toBe('cmun-serif-italic')
      expect(faceFor(roles, run({ design: 'cm', bold: true, italic: true }))).toBe('lm-roman-bolditalic')
      expect(faceFor(roles, run({ design: 'cm', caps: true }))).toBe('lm-roman-caps')
      expect(faceFor(roles, run({ design: 'cm', caps: true, italic: true }))).toBe('lm-roman-caps-italic')
      // CM's sans and typewriter stay Latin Modern's, nearer CMSS's and CMTT's than CMU's
      expect(faceFor(roles, run({ design: 'cmss', cls: 'sans' }))).toBe('lm-sans-regular')
      expect(faceFor(roles, run({ design: 'cmtt', cls: 'mono', italic: true }))).toBe('lm-mono-italic')
      // a family of no table: Latin Modern, as fontspec's default
      expect(faceFor(roles, run({ design: 'other' }))).toBe('lm-roman-regular')
    }
    for (const [bold, italic, style] of STYLES) expect(faceFor(rolesFor('ru', 'cm'), run({ design: 'cm', bold, italic }))).toBe(`cmun-serif-${style}`)
    expect(FACES['cmun-serif-regular']).toMatchObject({ file: 'cmunrm.otf', licence: 'OFL-1.1', web: 'ofl', source: 'texlive' })
  })

  it('Korean: Source Han Serif K with its size correction, and no role draws Un Batang', () => {
    // Source Han Serif K's Hangul matched to SC's ideographs at the same weight (median ink heights, task-7-report.md)
    const want: Record<string, number> = { 'shs-k-light': 0.956, 'shs-k-regular': 0.959, 'shs-k-medium': 0.965, 'shs-k-semibold': 0.967, 'shs-k-bold': 0.974 }
    for (const f of Object.values(FACES)) expect(f.size, f.id).toBe(want[f.id] ?? 1)
    expect(faceFor(rolesFor('ko', 'cm'), run({ script: 'cjk' }))).toBe('shs-k-light')
    expect(faceFor(rolesFor('ko', 'times'), run({ script: 'cjk', bold: true, italic: true }))).toBe('shs-k-bold')
    expect(Object.values(FACES).some(f => /unbatang/i.test(f.id + f.file))).toBe(false)
    for (const target of ['ko', 'zh', 'zh-TW', 'ja', 'de', 'ru']) {
      for (const family of ['cm', 'times', 'libertine', 'palatino', 'charter', 'garamond', 'utopia', 'other'] as const) {
        const roles = rolesFor(target, family)
        for (const script of ['cjk', 'latin'] as const) {
          for (const [bold, italic] of STYLES) expect(faceFor(roles, run({ script, bold, italic })), `${target} ${family}`).not.toMatch(/unbatang/)
        }
      }
    }
  })
})
