// BusyTeX's pipeline as the page builds it — its busytex_pipeline.js (data/busytex-site, fetched by setup.mjs) with
// busytex/research.diff, tex-log.diff and xdvipdfmx.diff applied, as tex-page/build.mjs applies them —: which steps'
// logs a compile returns, and how a XeLaTeX compile's PDF is written (xdvipdfmx at zlib level 6). Every TeX pass's log but the last one's is emptied (they are long); biber is not a TeX pass, so a
// draft whose biber runs after its one pass keeps that pass's log, which the reader reads lost letters and line
// measurements from (live.mjs lostIn, unsettable). The steps themselves are faked: what is tested is the pipeline's
// own bookkeeping around them. Skipped where BusyTeX's files are not on this machine
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const EXP = join(__dirname, '..')
const SOURCE = join(EXP, 'data/busytex-site/busytex/busytex_pipeline.js')

// biome-ignore lint/suspicious/noExplicitAny: BusyTeX's class, loaded from its script
function pipelineClass(): any {
  const dir = mkdtempSync(join(tmpdir(), 'pipeline-log-'))
  try {
    for (const f of ['busytex_pipeline.js', 'busytex_biber.js']) copyFileSync(join(EXP, 'data/busytex-site/busytex', f), join(dir, f))
    for (const diff of ['research.diff', 'tex-log.diff', 'xdvipdfmx.diff']) execFileSync('patch', ['-s', '-p0', '-d', dir, '-i', join(EXP, 'busytex', diff)])
    return new Function(`${readFileSync(join(dir, 'busytex_pipeline.js'), 'utf8')}\nreturn BusytexPipeline`)()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

type Entry = { cmd: string; log: string }
/** a pipeline whose steps are fakes: each TeX pass, BibTeX and biber logs "LOG of <its program>" and succeeds */
async function compile({ biber, rerun, driver = 'pdftex_bibtex8' }: { biber: boolean; rerun: boolean; driver?: string }) {
  const Pipeline = pipelineClass()
  const p = Object.create(Pipeline.prototype)
  const FS = {
    analyzePath: () => ({ exists: true, object: { mount: { mountpoint: '/' } } }),
    unmount() {}, mount() {}, filesystems: { MEMFS: {} }, writeFile() {}, chdir() {}, readFile: () => '',
  }
  const PATH = { basename: (p: string) => p.split('/').pop(), dirname: () => '.', join: (...a: string[]) => a.join('/') }
  const entry = (cmd: string) => ({ cmd, log: `LOG of ${cmd.split(' ')[0]}`, exit_code: 0, texmflog: '', missfontlog: '', stdout: '', stderr: '' })
  Object.assign(p, {
    supported_drivers: ['pdftex_bibtex8', 'xetex_bibtex8_dvipdfmx'], print() {}, project_dir: '/project', mem_header_size: 0, max_tex_passes: 3,
    error_messages_fatal: [], error_messages_all: [], preload_data_packages_js: [], biber: {},
    verbose_args: { [Pipeline.VerboseSilent]: { pdftex: [], bibtex8: [], biber: [], xetex: [], xdvipdfmx: [], luahbtex: [] } },
    fmt: { pdftex: 'pdflatex.fmt', xetex: 'xelatex.fmt' },
    bibtex_resolver: { resolve: () => true, resolve_backend: () => (biber ? 'biber' : 'bibtex8') },
    data_package_resolver: { resolve: async () => ({}), data_packages_js: [] },
    reload_module_if_needed: () => Promise.resolve({ FS, PATH, HEAPU8: new Uint8Array(0), ENV: {} }),
    mkdir_p() {}, read_all_text: () => 'a bibliography', read_all_bytes: () => new Uint8Array([37]), _needs_rerun: () => false,
    _run_cmd(_m: unknown, _fs: unknown, cmd: string[], ...rest: unknown[]) { const logs = rest.at(-1) as Entry[]; const e = entry(cmd.join(' ')); logs.push(e); return { exit_code: 0, log: e.log } },
    async _run_biber(_fs: unknown, _tex: unknown, _files: unknown, _args: unknown, logs: Entry[]) { logs.push(entry('biber main.bcf')); return 0 },
  })
  const r = await p.compile([{ path: 'main.tex', contents: 'x' }], 'main.tex', true, biber ? true : null, false, rerun, Pipeline.VerboseSilent, driver)
  return r.logs as Entry[]
}

describe.skipIf(!existsSync(SOURCE))('the logs a compile returns', () => {
  it('a draft whose biber runs after its one TeX pass keeps that pass\'s log (biblatex: every preview of 2608.08872)', async () => {
    const logs = await compile({ biber: true, rerun: false })
    expect(logs.map(l => [l.cmd.split(' ')[0], l.log])).toEqual([['pdflatex', 'LOG of pdflatex'], ['biber', 'LOG of biber']])
  })

  it('as one with BibTeX does', async () => {
    const logs = await compile({ biber: false, rerun: false })
    expect(logs.map(l => [l.cmd.split(' ')[0], l.log])).toEqual([['pdflatex', 'LOG of pdflatex'], ['bibtex8', 'LOG of bibtex8']])
  })

  it('a compile with its passes after biber keeps the last pass\'s log alone, of the TeX passes (a pass, then the final)', async () => {
    const logs = await compile({ biber: true, rerun: true })
    expect(logs.map(l => [l.cmd.split(' ')[0], l.log])).toEqual([['pdflatex', ''], ['biber', 'LOG of biber'], ['pdflatex', ''], ['pdflatex', 'LOG of pdflatex']])
  })

  it('a XeLaTeX compile writes its PDF with xdvipdfmx at zlib level 6, not its 9: the same decoded PDF; 2608.16117\'s Chinese final, xdvipdfmx 67 s → 26 s (the patch\'s figure) of a compile in Chromium 75 s → 37 s (xdvipdfmx-report)', async () => {
    const logs = await compile({ biber: false, rerun: false, driver: 'xetex_bibtex8_dvipdfmx' })
    expect(logs.find(l => l.cmd.startsWith('xdvipdfmx'))?.cmd).toMatch(/^xdvipdfmx -z 6 /)
  })
})
