// lab/pdf/spikes/pack-make.mjs
// gate-pack.mjs make's steps over an assembled inputs folder <inputs>/{fixtures,refs,geometry,fonts,texmf} (each output's arxiv.pdf,
// layout.json, units.json and record.json under fixtures/<name>/), made with the engine tree <engine>: the inputs may come from several
// places (another engine's layout files, a new output's own), which the make from the record's folders cannot name. The compile image
// is checked as  checks it, and written into the manifest. <repo> is the tree whose gate-pack.mjs runs.
//   node lab/pdf/spikes/pack-make.mjs <repo> <engine> <inputs> <out pack folder> <out gate-pack.json>
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const [repo, engineRoot, P, out, jsonOut] = process.argv.slice(2)
const G = await import(pathToFileURL(join(repo, 'lab/pdf/spikes/gate-pack.mjs')).href)
const ENGINE = 'src/pdf-reader/engine'
const E = f => import(pathToFileURL(join(engineRoot, ENGINE, f)).href)
const [{ FACES }, { BUILTIN_RULES, resolveRules, SCRIPTS }, { TEX_PATTERN_FILES }, { nameOf }, { PIPELINE_VERSION }] = await Promise.all([E('rules/font-roles.mjs'), E('rules/layout.mjs'), E('layer-proto/hyph.mjs'), import(pathToFileURL(join(repo, 'lab/pdf/spikes/layer-gate/ref.mjs')).href), E('pipeline/versions.mjs')])
const compileImage = G.compileImageOf()
G.checkCompileImage(compileImage, G.localImageDigests(compileImage.texlive))
const fixtures = join(P, 'fixtures'), records = fixtures, refs = join(P, 'refs'), geometry = join(P, 'geometry')
const names = G.outputsOf(refs)
const layout = G.layoutVersionOf(fixtures, names, await G.layoutOfEngine(engineRoot))
const targets = [...new Set(names.map(n => nameOf(n).target))].sort()
const known = SCRIPTS.map(s => BUILTIN_RULES.scripts[s].cjkFaces).filter(Boolean)
const used = [...new Map(targets.map(t => resolveRules(BUILTIN_RULES, t).cjkFaces).filter(Boolean).map(c => [`${c.group}|${c.kai}`, c])).values()]
const entries = G.entriesOf({ fixtures, records, refs, geometry, fontsDir: join(P, 'fonts'), fonts: G.fontFiles(FACES, known, used), patterns: TEX_PATTERN_FILES, texmf: join(P, 'texmf') })
const manifest = G.makePack({ entries, out, pipeline: PIPELINE_VERSION, layout, compileImage })
writeFileSync(jsonOut, `${JSON.stringify(G.packJsonOf(manifest), null, 1)}\n`)
const s = G.summaryOf(manifest.files)
console.log(`pack ${manifest.digest} (PIPELINE ${manifest.pipeline}, layout ${layout.schema}/${layout.version}): ${s.files} files; ${s.objects} distinct objects ${s.objectBytes} bytes; ${names.length} outputs`)
