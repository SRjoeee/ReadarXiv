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
