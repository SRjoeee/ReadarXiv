# Parked

Code and records the repository keeps and the product no longer uses. On 2026-10-08 the maintainer decided that the
extension reads on the instant layer only: the compiled final — BusyTeX in the browser, the TeX page at
`tex.readarxiv.org`, its warm-up, the store of compiled PDFs — is parked, not deleted. What is here is what that path
needed and nothing else needs.

## Policy

- **Linted by the English gate alone** (`pnpm check:english`, part of `pnpm lint`; its allow-list names parked paths
  like any other). Biome ignores `parked/`, `tsconfig.json` and `vitest.config.ts` exclude it: **never built,
  type-checked or tested.** Its tests are kept as written and are not run.
- **Nothing alive imports from here.** No file under `src/`, `tests/`, `scripts/` or the lab, and not the build
  configuration, may import from `parked/`; `tests/scripts/parked.test.ts` checks it. Parked files may import from the
  live tree, and go stale when it changes: a part is revived against the commit it names, not against `HEAD`.
- **What moves here:** a module and its tests, once nothing shipped and no kept gate imports it. Git history is kept
  (`git mv`).
- **Roots.** Each part keeps the layout of the experiment's directory it came from (listed by
  `git show exp-freeze-2026-10-07:experiments/pdf-bilingual/`, a directory the tree no longer has), and stands as deep as
  that directory did, so its imports of `src/` and `tests/` resolve as they did. A path in a parked file's comment or
  command that begins `experiments/pdf-bilingual/` names the part's own root: `parked/tex-page/` for the TeX page,
  `parked/lab/` for the checks. A path without that prefix (`spikes/…`, `tex-page/…`, `records/…`) is relative to the
  root too. `data/`, `out/` and `node_modules/` are made on a machine and not kept (`.gitignore`).
- **What stayed alive.** The lab's gates and their helpers are in `lab/pdf/`, the browser checks' launch helper in
  `tests/e2e/lib/extension.mjs`: the parked spikes import `latex-front.mjs`, `paper-meta.mjs` and `faithful.mjs` from the
  first and the launch helper from the second, and the TeX page's local server from `parked/tex-page/spikes/`. A path in
  their comments that goes through `spikes/` or `out/` may still name the experiment's layout.

## parked/tex-page/ — the TeX page program

The page the reader frames, running BusyTeX in the browser (`poc-site/`: the page, its protocol, its worker, the TeX Live
tree's file index), the build and checks of the site that serves it (`tex-page/`: `build.mjs`, the manifest of files
fetched ahead, the upload list and `verify.mjs`, the timing, identity and network checks), our patches to BusyTeX
(`busytex/*.diff`), the same fixes as filed upstream with reproductions (`upstream/`), `setup.mjs`, `spikes/` (the
METAFONT outputs TeX Live does not ship, and the local server of the page) and the unit tests of the page (`tests/`).

Last ran at the freeze: the tag `exp-freeze-2026-10-07`, which names commit `a2267b287b2c7cb87dfdb70481a3832d140b8eb8`.
The files of this part are unchanged since commit `086d9009`, and the published site, content version `24335c65c173`, was built from these files.

**The source offer.** BusyTeX is under the GNU AGPL, version 3 or later, and runs with our page as one program. Every
version of the site that stays served at `tex.readarxiv.org` carries an offer of its source under `c/<version>/legal/`,
made by `tex-page/build.mjs` from the files its `SOURCE` list names, resolved against this directory. This tree must
keep every file on that list at the path the list gives; `tests/scripts/parked.test.ts` reads the list and checks it.
Change the list and the files together, or not at all.

**Reviving it needs:**
- `npm install` here (`texlyre-busytex`), then `node setup.mjs` (BusyTeX's published assets, about 685 MB, with
  `busytex/research.diff` applied);
- a TeX Live 2026 tree, and the METAFONT outputs `spikes/make-metafont.mjs` makes copied into it, then
  `node tex-page/build.mjs` (about half an hour the first time; `REHASH=1` and `FRAMERS=<origins>` for a build to
  publish) and `node spikes/serve-live.mjs` for the page on this machine;
- the engine of the reader under `src/pdf-reader/engine/` as it stood at the commit above: `tex-page/jobs.mjs`,
  `measure.mjs` and `speed.mjs` import it, and the extension still frames the production page by a constant address
  (`src/pdf-reader/addresses.mjs`) until its own compile client is parked.

## parked/lab/ — the typesetting gates and the compile-path checks

`spikes/`: the multi-language gate (`lang-gate.mjs`, `lang-ratio.mjs`), the typesetting rule's gate and its inputs
(`typeset-gate.mjs`, `typeset-translate.mjs`, `reader-typeset.mjs`), the cases that compile small documents to check the
TeX the engine writes (`typeset-tex-cases.mjs`, `typeset-busytex-cases.mjs`, `compile-resilience-cases.mjs`,
`lost-cases.mjs`, `cjk-cases.mjs`, `line-env-cases.mjs`), the compile layer's corpus runs (`c0-*.mjs`, `c1-*.mjs`,
`prefix-browser.mjs`, `busytex.mjs`, `poc-run.mjs`), the checks of the compile path's results and caches
(`cache-cases.mjs`, `fonts-fidelity.mjs`, `pdf-profile.mjs`, `reader-progressive.mjs`) and of the store of compiled PDFs
(`cache-revisit.mjs`, `cache-faults.mjs`), and the reader's browser checks that need the local TeX page: `diag-anchors`,
`reader-a11y`, `reader-click`, `reader-in-source`, `reader-live`, `reader-partial`, `reader-ui-live`, `service-faults`,
`sync-frames`, `sync-smoke` and `viewer-faults` (all `.mjs`). `records/`: `typesetting.md`, the record the typesetting
rule in `src/pdf-reader/engine/pipeline/typeset/` cites, `typeset-gate.json` (each paper's record the gate holds a change to) and
`round-34.json` (the round of 34 papers the rule was chosen on).

Last ran at the freeze: the tag `exp-freeze-2026-10-07`, which names commit `a2267b287b2c7cb87dfdb70481a3832d140b8eb8`,
reachable from `next` through pull request #325, which merged it.

**The eleven browser checks that need the TeX page** are not run. The reader's own end-to-end check, `e2e:reader`
(Stage 5, Task 6), is to take over the assertions that still apply to the instant layer, by reading them here. By the
rule that settled them, a check that served static pages alone would have stayed in `lab/pdf/`; none does, since each
drives the reader in its live mode, with the TeX page as its `site`.

**Reviving it needs** the experiment's local data (the corpus, the runs, the Microsoft answers the gates read — never in
the repository), Docker with TeX Live 2026 for the native compiles, and for the browser checks the TeX page above.
`pdfjs-dist` is imported by six of the spikes (`cjk-cases`, `line-env-cases`, `reader-typeset`, `typeset-busytex-cases`,
`typeset-gate`, `typeset-tex-cases`): the repository's own install serves the import, and the ones that read its
standard fonts by a path under `node_modules/` need the `npm install` of `lab/pdf/`. These files import the reader's
engine from `src/pdf-reader/engine/`, and the siblings that stayed alive from `lab/pdf/spikes/`; paths they build from
their own location (`out/…`, `data/…`, `new URL('..', import.meta.url)`) name the experiment's layout, which a part's
root is, not the lab's.

## parked/engine/ — the first instant layer (v1) and its tests

The engine's first layer, `layer/{breaks,draw,fit,hyphen,layer,net,page,tokens}.mjs` (with their `.d.mts`): the unit-by-unit fit
into the layout file's frames, the line breaker, the net that refused a failing unit, the page-even pass and the entry that
joined them (`layer/layer.mjs`), and `rules/layer-rules.mjs`, its per-script rules. The drawn layer is v0, `layer-proto/`,
opened through the reader's door (`layer-proto/reader.mjs`); nothing in an entry or in a kept gate imports these any more.
`tests/` holds their unit tests and the two helpers they share (`helpers/layer-fixtures.ts`, `helpers/layer-layout.ts`; the
layout builder the live tests use is `tests/pdf-reader/helpers/layout-of.ts`). The checker `layer/check.mjs` stayed in the engine,
since the layer gate's instrument imports it by its address; its test, which sets units with the fit, is here, and the cases of its lost-ink function, which need no fit, stayed live (`tests/pdf-reader/layer-check-ink.test.ts`).

Last ran at the freeze: the tag `exp-freeze-2026-10-07`, which names commit `a2267b287b2c7cb87dfdb70481a3832d140b8eb8`, and
with the engine's tests at commit `010c578996e1d0764337f1f42f9e22a40d722d37` (`next` after pull request #331).

**Reviving it needs** that commit's tree around it: the files import the live engine from `src/pdf-reader/engine/` (the font
roles, the layout file's parser, the pieces) by relative paths, and `scriptOf`, which `layer-rules.mjs` re-exports, is now
`rules/script.mjs`'s. The layer gate's default kind is `proto`, the drawn layer; it refuses `--engine-kind=layer` for an engine
that has no `layer/layer.mjs`, and the layer lab's v1 view loads the entry and reports that it is not there. The gate measures
v0 (`--engine-kind=proto`, `--door`).

## Still to come

The extension's own compile client — the final compile in the reader's session and the store of compiled PDFs under
`src/` — is parked by a later change. It last ran at the freeze, the tag `exp-freeze-2026-10-07`, named above. It gets a section
here, with its tag or commit, when it moves.
