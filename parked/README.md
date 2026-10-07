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
- **Roots.** Each part keeps the layout of `experiments/pdf-bilingual/`, which it came from, and stands as deep as that
  directory did, so its imports of `src/` and `tests/` resolve as they did. A path in a parked file's comment or
  command that begins `experiments/pdf-bilingual/` names the part's own root: `parked/tex-page/` for the TeX page,
  `parked/lab/` for the checks. A path without that prefix (`spikes/…`, `tex-page/…`, `records/…`) is relative to the
  root too. `data/`, `out/` and `node_modules/` are made on a machine and not kept (`.gitignore`).

## parked/tex-page/ — the TeX page program

The page the reader frames, running BusyTeX in the browser (`poc-site/`: the page, its protocol, its worker, the TeX Live
tree's file index), the build and checks of the site that serves it (`tex-page/`: `build.mjs`, the manifest of files
fetched ahead, the upload list and `verify.mjs`, the timing, identity and network checks), our patches to BusyTeX
(`busytex/*.diff`), the same fixes as filed upstream with reproductions (`upstream/`), `setup.mjs`, `spikes/` (the
METAFONT outputs TeX Live does not ship, and the local server of the page) and the unit tests of the page (`tests/`).

Last ran end to end at commit `76c55ae00dc31ccb85bbbb1236fe8e1ba7922bfd`: the published site, content version
`24335c65c173`, was built there. No file of this part differs between that commit and the freeze commit below.

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
  (`src/pdf-reader/engine/addresses.mjs`) until its own compile client is parked.

## parked/lab/ — the typesetting gates and the compile-path checks

`spikes/`: the multi-language gate (`lang-gate.mjs`, `lang-ratio.mjs`), the typesetting rule's gate and its inputs
(`typeset-gate.mjs`, `typeset-translate.mjs`, `reader-typeset.mjs`), the cases that compile small documents to check the
TeX the engine writes (`typeset-tex-cases.mjs`, `typeset-busytex-cases.mjs`, `compile-resilience-cases.mjs`,
`lost-cases.mjs`, `cjk-cases.mjs`, `line-env-cases.mjs`), the compile layer's corpus runs (`c0-*.mjs`, `c1-*.mjs`,
`prefix-browser.mjs`, `busytex.mjs`, `poc-run.mjs`) and the checks of the store of compiled PDFs (`cache-revisit.mjs`,
`cache-faults.mjs`). `records/`: `typesetting.md`, the record the typesetting rule in `src/pdf-reader/engine/typeset/`
cites, `typeset-gate.json` (each paper's record the gate holds a change to) and `round-34.json` (the round of 34 papers
the rule was chosen on).

Last ran at commit `a2267b287b2c7cb87dfdb70481a3832d140b8eb8`, the freeze commit of the experiment branch
(`exp/pdf-bilingual`), reachable from `next` through pull request #325, which merged it. The annotated tag
`exp-freeze-2026-10-07` will name it once the maintainer pushes the tag.

**Reviving it needs** the experiment's local data (the corpus, the runs, the Microsoft answers the gates read — never in
the repository), Docker with TeX Live 2026 for the native compiles, and for the browser checks the TeX page above. These
files import the reader's engine from `src/pdf-reader/engine/`, and some import siblings that stayed in the experiment's
`spikes/` (`faithful.mjs`, `paper-meta.mjs`, `extension.mjs`): point them at where those are then.

## Still to come

The extension's own compile client — the final compile in the reader's session and the store of compiled PDFs under
`src/` — is parked by a later change. It last ran at the freeze commit `a2267b28`, named above. It gets a section
here, with its commit, when it moves.
