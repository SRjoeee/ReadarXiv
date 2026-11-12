// lab/release-check/census-profile.mjs: this repository as the census reads it (census.mjs): its areas, its aliases, the
// entry points of its builds and what the cut-over cuts. The private repository's profile is its own file, kept with the
// lab's notes and given to census.mjs by path (--web-profile): nothing of that repository is written here. Not shipped.

/** the engine repository: the extension, today's engine, the workspace packages */
export const ENGINE_PROFILE = {
  name: 'engine',
  exclude: ['lab/pdf/out/', 'tests/fixtures/', 'public/'],
  areas: [
    { prefix: 'src/pdf-reader/engine/', area: 'today-engine', role: 'product' },
    { prefix: 'src/', area: 'extension', role: 'product' },
    ...['engine', 'typeset', 'format', 'text', 'translate', 'reader', 'ui'].flatMap(p => [
      { prefix: `packages/${p}/src/`, area: `pkg:${p}`, role: 'product' },
      { prefix: `packages/${p}/`, area: `pkg:${p}`, role: 'config' },
    ]),
    { prefix: 'packages/', area: 'packages', role: 'config' },
    { prefix: 'lab/', area: 'lab', role: 'lab' },
    { prefix: 'scripts/', area: 'scripts', role: 'tooling' },
    { prefix: 'parked/', area: 'parked', role: 'parked' },
    { prefix: 'tests/', area: 'tests', role: 'test' },
    { prefix: 'docs/', area: 'docs', role: 'docs' },
    { prefix: '', area: 'root', role: 'config' },
  ],
  aliases: [
    { from: '@/', to: 'src/' },
    { from: '~/', to: 'src/' },
    { from: '@@/', to: '' },
    { from: '~~/', to: '' },
  ],
  workspaces: ['packages'],
  /** the modules the repository offers another to import: the packages' entries (their manifests' `exports`) and today's
   *  engine's five entry modules (its contract with the website until the cut-over) */
  publicEntries: { packageExports: 'packages', files: ['src/pdf-reader/engine/view.mjs', 'src/pdf-reader/engine/layer.mjs', 'src/pdf-reader/engine/pipeline.mjs', 'src/pdf-reader/engine/rules.mjs', 'src/pdf-reader/engine/translate.mjs'] },
  /** the areas the design's "engine" names (§7: 64,000 lines, about 30,000 estimated): today's engine and the packages that
   *  replace it (the interface package `ui` apart: the extension's controls) */
  engineAreas: ['today-engine', 'pkg:engine', 'pkg:typeset', 'pkg:format', 'pkg:text', 'pkg:translate', 'pkg:reader'],
  /** the areas the rule debt is headlined for: the prepare and the typesetter, today's and the packages' */
  debtAreas: ['today-engine', 'pkg:engine', 'pkg:typeset'],
  builds: [
    {
      name: 'extension',
      entries: { under: 'src/entrypoints/' },
      // the reader page's build switch (wxt.config.ts AXT_READER): 'today' runs today's session over the engine's view,
      // 'v2' the reader package whole. main.tsx imports today's host and the engine's sheet whatever the switch says, so the
      // cut-over cuts those two edges: design Appendix B, "Extension src/pdf-reader/session (114 KB), the website's
      // session/run.mjs (71 KB), both ranged loaders -> two small Hosts over reader"
      cut: {
        switch: 'src/entrypoints/pdf-reader/main.tsx',
        seeds: ['src/pdf-reader/host/today.ts', 'src/pdf-reader/engine/view/engine.css'],
        why: "AXT_READER (wxt.config.ts): the cut-over keeps 'v2' (design Appendix B: the extension's session becomes a small Host over reader)",
      },
    },
    { name: 'packages', entries: { packageExports: 'packages' } },
  ],
}
