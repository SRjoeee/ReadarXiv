// lab/pdf/spikes/face-identity.mjs
// Whether the role table's TeX Live faces are the same bytes in every pinned TeX Live tree (lab/pdf/compile-images.json). The
// reader draws every layout with the hosted faces, which are the default tree's files (font-coverage.mjs METRICS' `sha256`,
// COVERAGE_SOURCE.release.texlive): a layout made on another tree is drawn safely only where its tree's file of each face is
// those bytes too. For each year's image (local, by its pinned digest: never pulled) the file of each face whose source is
// `texlive` (rules/font-roles.mjs FACES) is found by kpsewhich in the image and hashed there, in one container a year
// (--network none); then each face is told the same in every tree, different in some, or missing in one.
//   node lab/pdf/spikes/face-identity.mjs [--years=2025,2023] [--json]
// COMPILE_PLATFORM as compile-image.mjs reads it (linux/amd64 to emulate on arm64). Exits 1 where a face differs from the hosted
// bytes in a tree or is missing from one, 0 where every face is the same bytes in every tree, 2 on an error.
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { METRICS } from '../../../src/pdf-reader/engine/rules/font-coverage.mjs'
import { FACES } from '../../../src/pdf-reader/engine/rules/font-roles.mjs'
import { checkCompileImage, compileImageRef, platformArgs } from './compile-image.mjs'

const run = promisify(execFile)

/** the faces a tree holds: the role table's whose source is TeX Live, as [id, file] in the table's order */
export function treeFaces(faces = FACES) {
  return Object.values(faces).filter(f => f.source === 'texlive').map(f => [f.id, f.file])
}

/** the shell a container runs: each file found by kpsewhich and hashed, one line each (`file\tsha256\tbytes`, `-` for one not found) */
const FIND = 'for f in "$@"; do p=$(kpsewhich "$f"); if [ -n "$p" ]; then printf "%s\\t%s\\t%s\\n" "$f" "$(sha256sum < "$p" | cut -d" " -f1)" "$(wc -c < "$p")"; else printf "%s\\t-\\t-\\n" "$f"; fi; done'

/** a container's lines read back: Map of file to { sha256, bytes } (null for a file the tree does not have) */
export function readFound(stdout) {
  const out = new Map()
  for (const line of String(stdout).split('\n')) {
    const [file, sha, bytes] = line.split('\t')
    if (!file || sha === undefined) continue
    out.set(file, sha === '-' ? null : { sha256: sha.trim(), bytes: Number(bytes) })
  }
  return out
}

/**
 * Each tree face told against the hosted bytes (METRICS' sha256) in every tree: `byYear` { year: Map(file → { sha256, bytes } |
 * null) }. Gives { same: [id], differ: [{ id, file, years: [year whose file is not the hosted bytes] }], missing: [{ id, file,
 * years }] }; a face whose hosted digest is not recorded is `differ` in every tree (nothing says the bytes are the reader's)
 */
export function compareTrees(byYear, faces = treeFaces(), metrics = METRICS) {
  const same = [], differ = [], missing = []
  const years = Object.keys(byYear)
  // (a comparison of no tree would call every face the same)
  if (!years.length) throw new Error('no tree to compare the faces in')
  for (const [id, file] of faces) {
    const hosted = metrics[id]?.sha256 ?? null
    const gone = years.filter(y => !byYear[y].get(file)), other = years.filter(y => byYear[y].get(file) && byYear[y].get(file).sha256 !== hosted)
    if (gone.length) missing.push({ id, file, years: gone })
    if (other.length) differ.push({ id, file, years: other })
    if (!gone.length && !other.length) same.push(id)
  }
  return { same, differ, missing }
}

/** the trees a run asks: those `--years=<y>,…` names, else every pinned year, the default first; never none, and none not pinned */
export function yearsOf(argv, pins) {
  const a = argv.find(x => x.startsWith('--years='))
  const all = [pins.default, ...Object.keys(pins.images).filter(y => y !== pins.default).sort().reverse()]
  const years = a === undefined ? all : [...new Set(a.slice(8).split(',').map(y => y.trim()).filter(Boolean))]
  if (!years.length) throw new Error('--years names no TeX Live year')
  for (const y of years) if (!Object.hasOwn(pins.images, y)) throw new Error(`--years: ${y} is not pinned (lab/pdf/compile-images.json: ${Object.keys(pins.images).join(', ')})`)
  return years
}

/** one year's image asked: its tree's file of each face, hashed in the image (the image checked to be the pinned digest first) */
export async function facesInImage(year, files, { env = process.env, ask = args => run('docker', args, { maxBuffer: 1 << 24 }) } = {}) {
  const ref = compileImageRef({ ...env, COMPILE_IMAGE: '' }, year), platform = platformArgs(env)
  await checkCompileImage(ref, platform, undefined, { ...env, NATIVE_TEX: '' })
  const { stdout } = await ask(['run', ...platform, '--rm', '--network', 'none', '--entrypoint', 'sh', ref, '-c', FIND, 'sh', ...files])
  return readFound(stdout)
}

async function main(argv) {
  const pins = JSON.parse(readFileSync(new URL('../compile-images.json', import.meta.url), 'utf8'))
  const years = yearsOf(argv, pins)
  const faces = treeFaces(), files = [...new Set(faces.map(([, f]) => f))]
  const byYear = {}
  for (const y of years) byYear[y] = await facesInImage(y, files)
  const r = compareTrees(byYear, faces)
  if (argv.includes('--json')) console.log(JSON.stringify({ years, faces: faces.length, ...r }, null, 1))
  else {
    console.log(`${faces.length} TeX Live faces of the role table, in TeX Live ${years.join(', ')} (hosted: TeX Live ${pins.default}'s bytes)`)
    console.log(`  the hosted bytes in every tree: ${r.same.length}`)
    for (const d of r.differ) console.log(`  DIFFERS ${d.id} (${d.file}): not the hosted bytes in TeX Live ${d.years.join(', ')}`)
    for (const m of r.missing) console.log(`  MISSING ${m.id} (${m.file}): not in TeX Live ${m.years.join(', ')}`)
  }
  return r.differ.length || r.missing.length ? 1 : 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(code => process.exit(code), e => { console.error(String(e?.message ?? e)); process.exit(2) })
}
