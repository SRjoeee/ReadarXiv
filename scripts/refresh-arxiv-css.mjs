// Refreshes the style sheets vendored for the offline accessibility audit (tests/e2e/fixtures/arxiv-css/README.md).
// A fixture links arXiv's sheets by a name that carries a date, and arXiv moves it; this reads the sheets a fixture links
// from the fixture itself, follows their `@import`s, downloads each into the same path under the vendored tree, and removes
// the vendored sheets nothing links any more:
//
//   node scripts/refresh-arxiv-css.mjs [tests/fixtures/arxiv/2410.00260.html]
//
// One request every three seconds and the project's name as the user agent, as arXiv asks of automated clients. The
// sheets are MIT-licensed (arXiv/arxiv-browse and arXiv/arxiv-base); the README says where to look if that ever changes
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const VENDORED = join(ROOT, 'tests/e2e/fixtures/arxiv-css')
const DEFAULT_FIXTURE = join(ROOT, 'tests/fixtures/arxiv/2410.00260.html')
const USER_AGENT = 'ReadarXiv/0.1 (+https://readarxiv.org; research)'
const GAP_MS = 3_000

/** The style sheets a page links on arXiv's own `/static/` tree, as paths with their query dropped */
export function stylesheetLinks(html) {
  const paths = new Set()
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/\brel=["']?stylesheet/i.test(tag)) continue
    const href = /\bhref=["']([^"']+)["']/i.exec(tag)?.[1]
    if (href?.startsWith('/static/') && href.split('?')[0].endsWith('.css')) paths.add(href.split('?')[0])
  }
  return [...paths]
}

/** The sheets of arXiv's `/static/` tree that a style sheet imports */
export function importsOf(css) {
  return [...css.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']/g)].map(m => m[1]).filter(path => path.startsWith('/static/'))
}

/** Every file under a directory, as paths relative to it */
function filesUnder(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true }).filter(e => e.isFile()).map(e => join(e.parentPath, e.name).slice(dir.length + 1))
}

async function main() {
  const fixture = process.argv[2] ?? DEFAULT_FIXTURE
  const queue = stylesheetLinks(readFileSync(fixture, 'utf8'))
  if (queue.length === 0) throw new Error(`${fixture} links no style sheet on /static/`)
  const reached = new Set()
  for (let first = true; queue.length > 0; first = false) {
    const path = queue.shift()
    if (reached.has(path)) continue
    if (!first) await new Promise(resolve => setTimeout(resolve, GAP_MS))
    const response = await fetch(`https://arxiv.org${path}`, { headers: { 'user-agent': USER_AGENT } })
    if (!response.ok) throw new Error(`arXiv answered HTTP ${response.status} for ${path}; nothing more was written`)
    const css = Buffer.from(await response.arrayBuffer())
    const file = join(VENDORED, path.slice(1))
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, css)
    reached.add(path)
    console.log(`${createHash('sha256').update(css).digest('hex')}  ${path} (${css.length} bytes)`)
    queue.push(...importsOf(css.toString('utf8')))
  }
  for (const stale of filesUnder(join(VENDORED, 'static')).filter(name => !reached.has(`/static/${name}`))) {
    rmSync(join(VENDORED, 'static', stale))
    console.log(`removed ${stale}: nothing links it`)
  }
  console.log(`\n${reached.size} sheets in ${VENDORED}. Write the date, the hashes and what changed into README.md.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
