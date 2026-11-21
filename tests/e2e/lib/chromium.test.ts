// @vitest-environment node
// The browser checks' launches (tests/e2e/lib/chromium.mjs): every persistent context of tests/e2e and lab is launched with
// chromium.mjs's options (directly, or through online() or launchWithReader, which make them so), and the features they turn
// off are one list, Chrome's process priority policy among them
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CHROME_OFF, chromiumOptions, PLAYWRIGHT_OFF } from './chromium.mjs'

const ROOT = resolve(__dirname, '../../..')
const offOf = (args: string[]) => {
  const switches = args.filter(a => a.startsWith('--disable-features='))
  expect(switches).toHaveLength(1)
  return (switches[0] as string).slice('--disable-features='.length).split(',')
}
/** the repository's scripts under tests/e2e and lab (parked/ is no one's: never run) */
const scripts = () => execFileSync('git', ['ls-files', 'tests/e2e', 'lab'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(f => /\.m?js$/.test(f))

describe('the launch options', () => {
  it('turn Playwright\'s features off and Chrome\'s process priority policy, one --disable-features, the launch\'s own switches after', () => {
    const o = chromiumOptions({ channel: 'chromium', args: ['--load-extension=x'] })
    expect(offOf(o.args)).toEqual([...PLAYWRIGHT_OFF, 'PMProcessPriorityPolicy'])
    expect(CHROME_OFF).toEqual(['PMProcessPriorityPolicy'])
    expect(o.args.slice(1)).toEqual(['--load-extension=x'])
    expect(o.channel).toBe('chromium')
  })
  it('leave storage partitioning on where asked, as a reader\'s Chrome has it', () => {
    const off = offOf(chromiumOptions({}, { partitioned: true }).args)
    expect(off).not.toContain('ThirdPartyStoragePartitioning')
    expect(off).toContain('PMProcessPriorityPolicy')
    expect(offOf(chromiumOptions({}).args)).toContain('ThirdPartyStoragePartitioning')
  })
  it('refuse a --disable-features of the launch\'s own: it would replace the list', () => {
    expect(() => chromiumOptions({ args: ['--disable-features=Translate'] })).toThrow(/one list/)
  })
  it('state an interface language where asked, as Playwright\'s locale for every page and frame and as Chromium\'s own --lang, and nothing where not', () => {
    const o = chromiumOptions({ channel: 'chromium', args: ['--load-extension=x'] }, { partitioned: true, language: 'zh-CN' })
    expect(o.locale).toBe('zh-CN')
    expect(o.args.filter(a => a.startsWith('--lang'))).toEqual(['--lang=zh-CN'])
    expect(o.args.at(-1)).toBe('--load-extension=x')
    const none = chromiumOptions({ channel: 'chromium', args: [] as string[] })
    expect('locale' in none).toBe(false)
    expect(none.args.some(a => a.startsWith('--lang'))).toBe(false)
    // (one place states it: a launch's own locale or --lang beside it would contradict it)
    expect(() => chromiumOptions({ locale: 'en-US' }, { language: 'zh-CN' })).toThrow(/chromium\.mjs's to state/)
    expect(() => chromiumOptions({ args: ['--lang=en-US'] }, { language: 'zh-CN' })).toThrow(/chromium\.mjs's to state/)
  })
  it('state it as the browser\'s own language too where Chromium reads that from the environment (Linux), and nowhere else', () => {
    // (the locale override is the renderer's, held by one page: a sibling reads the browser's own once that page closes)
    const linux = chromiumOptions({ args: [], env: { PATH: '/bin', LANG: 'C.UTF-8' } }, { language: 'zh-CN', platform: 'linux' })
    expect(linux.env).toEqual({ PATH: '/bin', LANGUAGE: 'zh_CN', LC_MESSAGES: 'zh_CN.UTF-8', LANG: 'zh_CN.UTF-8' })
    expect(linux.locale).toBe('zh-CN')
    expect('env' in chromiumOptions({ args: [] }, { language: 'zh-CN', platform: 'darwin' })).toBe(false)
    expect('env' in chromiumOptions({ args: [] }, { platform: 'linux' })).toBe(false)
  })
})

describe('the suites that find the extension by its Chinese words', () => {
  // (GitHub's runner's browser speaks English and this machine's Chinese: run 44432025091 failed e2e:reader's key card and its
  // count of papers kept, and e2e:a11y's first look for the settings page's sections, on the runner alone)
  it('state Chinese where they launch: e2e:reader through launchWithReader, e2e:a11y both its contexts', () => {
    expect(readFileSync(join(ROOT, 'tests/e2e/reader-v2.mjs'), 'utf8')).toMatch(/await launchWithReader\(\{[^\n]*language: 'zh-CN' \}\)/)
    const a11y = readFileSync(join(ROOT, 'tests/e2e/a11y.mjs'), 'utf8')
    expect(a11y).toContain("const LANGUAGE = { language: 'zh-CN' }")
    expect(a11y.match(/launchPersistentContext\((BASE_PROFILE|PROFILE), chromiumOptions\(/g)).toHaveLength(2)
    expect(a11y.match(/chromiumOptions\(LAUNCH, LANGUAGE\)|\}, LANGUAGE\)\)/g)).toHaveLength(2)
  })
})

describe('the launches', () => {
  it('every persistent context of tests/e2e and lab is launched with chromium.mjs\'s options', () => {
    const astray: string[] = []
    for (const file of scripts()) {
      const s = readFileSync(join(ROOT, file), 'utf8')
      for (const m of s.matchAll(/launchPersistentContext\(([^,]+),\s*/g)) {
        const rest = s.slice((m.index as number) + m[0].length)
        if (!/^(chromiumOptions|online)\(/.test(rest)) astray.push(`${file}: launchPersistentContext(${m[1]}, ${rest.slice(0, 40)}`)
      }
    }
    expect(astray).toEqual([])
  })
  it('no script but chromium.mjs names the features turned off', () => {
    const naming = scripts().filter(f => f !== 'tests/e2e/lib/chromium.mjs' && /--disable-features=/.test(readFileSync(join(ROOT, f), 'utf8')))
    expect(naming).toEqual([])
  })
})
