// @vitest-environment node
// The e2e scripts that go online (tests/e2e/lib/online.mjs) run only when asked (AXT_E2E_ONLINE=1), under the project's
// User-Agent on every page and request, and never against our production server; the list of them is held here, against
// the scripts themselves: each calls goOnline() right after its imports and launches only through online(), and each run
// without the opt-in exits at once, before any browser starts
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { goOnline, ONLINE, online, PROJECT_UA, readerServerOf, refuseProduction, STAGING_API } from './online.mjs'

const ROOT = resolve(__dirname, '../../..')
/** every e2e script that reaches the real network: arXiv's pages, the free translation engines, the reader's server */
const ONLINE_SCRIPTS = [
  'extension', 'floating-button', 'image', 'layout', 'local-endpoint', 'pdf-entry', 'placeholders', 'popup',
  'probes/action-icon', 'probes/floating-shots', 'probes/highlight-lag', 'probes/insert-recalc', 'probes/popup-first-paint',
  'probes/reading-costs', 'probes/reading-position', 'probes/ref-highlight', 'probes/reflow-shots', 'probes/restore-cost',
  'probes/retainer-path', 'probes/toggle-latency', 'probes/toggle-profile', 'probes/toggle-timeline',
].map(f => `tests/e2e/${f}.mjs`)
/** the scripts that name arXiv and stay on this machine: a route table or a page.route answers it, or a local server */
const OFFLINE_SCRIPTS = ['a11y', 'framing', 'reader', 'registration', 'viewer-control', 'probes/pinch-cost', 'probes/tex-partition', 'probes/web-app-mark'].map(f => `tests/e2e/${f}.mjs`)
const source = (file: string) => readFileSync(join(ROOT, file), 'utf8')
const LAUNCH = /\b(launchPersistentContext|launchWithReader|newContext|chromium\.launch)\(/

const dirs: string[] = []
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) })
const build = (hosts: string[]) => {
  const dir = mkdtempSync(join(tmpdir(), 'online-build-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ host_permissions: hosts }))
  return dir
}

describe('an online run: the project\'s User-Agent, and never our production server', () => {
  it('every page and every request of the browser says it is the project, not Playwright\'s browser', () => {
    expect(PROJECT_UA).toBe('ReadarXiv/0.1 (+https://readarxiv.org; research)')
    const o = online({ channel: 'chromium', args: ['--load-extension=x'] })
    expect(o.userAgent).toBe(PROJECT_UA)
    expect(o.args).toEqual(['--load-extension=x', `--user-agent=${PROJECT_UA}`])
    expect(online().userAgent).not.toMatch(/HeadlessChrome|Chrome\//)
  })

  it('our production server is refused; staging, a server on this machine and our other hosts are not', () => {
    for (const url of ['https://readarxiv.com', 'https://www.readarxiv.com/api/v1/layer', 'https://READARXIV.COM/']) expect(() => refuseProduction(url)).toThrow(/production server/)
    for (const url of [STAGING_API, 'http://127.0.0.1:8787', 'https://readarxiv.org', 'https://tex.readarxiv.org']) expect(refuseProduction(url)).toBe(url)
  })

  it('a context loading an extension whose reader talks to production is refused; a staging build is taken', () => {
    const production = build(['https://arxiv.org/*', 'https://readarxiv.com/*']), staging = build(['https://readarxiv.com/*', `${STAGING_API}/*`])
    expect(readerServerOf(production)).toBe('https://readarxiv.com')
    expect(readerServerOf(staging)).toBe(STAGING_API)
    expect(() => online({ args: [`--disable-extensions-except=${production}`, `--load-extension=${production}`] })).toThrow(/production server/)
    expect(online({ args: [`--load-extension=${staging}`] }).userAgent).toBe(PROJECT_UA)
  })

  it('without the opt-in it says how to opt in, on one line, and exits 2 (not run); with it, it goes on', () => {
    expect(goOnline('pnpm e2e:pdf', { env: { [ONLINE]: '1' } })).toBe(true)
    const lines: string[] = [], codes: number[] = []
    goOnline('pnpm e2e:pdf', { env: {}, exit: c => codes.push(c), log: l => lines.push(l) })
    expect(codes).toEqual([2])
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain(`${ONLINE}=1`)
    expect(lines[0]).not.toContain('\n')
  })
})

describe('the online scripts', () => {
  it('every e2e script that launches a browser and names arXiv is listed online or offline', () => {
    const files = ['tests/e2e', 'tests/e2e/probes'].flatMap(d => readdirSync(join(ROOT, d)).filter(f => f.endsWith('.mjs')).map(f => `${d}/${f}`))
    const naming = files.filter(f => { const s = source(f); return LAUNCH.test(s) && s.includes('https://arxiv.org') })
    expect(naming.filter(f => !ONLINE_SCRIPTS.includes(f) && !OFFLINE_SCRIPTS.includes(f))).toEqual([])
  })

  it('each calls goOnline() right after its imports, and launches every context through online()', () => {
    for (const file of ONLINE_SCRIPTS) {
      const s = source(file), lines = s.split('\n'), guard = lines.findIndex(l => /^goOnline\('[^']+'\)$/.test(l))
      expect(guard, file).toBeGreaterThan(0)
      // (nothing but imports and comments above it)
      expect(lines.slice(0, guard).filter(l => l && !/^(import\b|\/\/|\s|\})/.test(l)), file).toEqual([])
      const launches = [...s.matchAll(new RegExp(LAUNCH.source, 'g'))]
      expect(launches.length, file).toBeGreaterThan(0)
      for (const m of launches) expect(s.slice(m.index), file).toMatch(/^launchPersistentContext\([^,]+,\s*online\(/)
    }
  })

  it('run without the opt-in, each exits at once with the opt-in\'s name, and no browser starts', async () => {
    // (no browser to start, should one be asked for: Playwright's browsers looked for in an empty directory)
    const none = mkdtempSync(join(tmpdir(), 'online-no-browser-'))
    dirs.push(none)
    mkdirSync(join(none, 'empty'), { recursive: true })
    const env: NodeJS.ProcessEnv = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: join(none, 'empty') }
    delete env[ONLINE]
    const run = (file: string) => new Promise<{ file: string; code: number | null; err: string }>(done => {
      const p = spawn(process.execPath, [join(ROOT, file)], { cwd: ROOT, env, stdio: ['ignore', 'ignore', 'pipe'] })
      let err = ''
      p.stderr.on('data', d => { err += d })
      p.on('close', code => done({ file, code, err }))
    })
    const runs = await Promise.all(ONLINE_SCRIPTS.map(run))
    for (const r of runs) {
      expect(r.code, `${r.file}: ${r.err}`).toBe(2)
      expect(r.err.trim().split('\n'), r.file).toHaveLength(1)
      expect(r.err, r.file).toContain(`${ONLINE}=1`)
    }
  }, 120_000)
})
