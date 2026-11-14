# Architecture

The map of this repository as it is built: what lives where, which way the imports run, the data that passes between the
parts, the life of a paper from a reader's open to a translated page, the promise each gate holds, and where a change
belongs. Read it before changing anything. Why each choice was made is in `docs/DESIGN.md` (the extension and the HTML
translator), `docs/PDF-READER.md` (the PDF reader: its interface in §1 to §17, its rulings in §18 and §19) and the header of
each file named here. Words are used as the code names them; DESIGN §3 is the glossary of the extension's.

The repository holds three things: the Chrome extension (the root package, `src/`); the workspace packages (`packages/`),
which the extension builds in and which the website (readarxiv.com, the private repository `readarxiv-web`) pins as a
submodule; and the gates (`tests/`, `scripts/`, `lab/`), which ship nothing. Our server, the website's, prepares each paper
once: the **prepare** reads the paper's source and compiles it with marks (its **front half**), then carries what that
compile says onto arXiv's own PDF and cuts the result into a **bundle** (its **back half**). A paper's bundle as our server
serves it is its **layer**. A reader shows arXiv's PDF on the left and, on the right, the same pages with their text laid
again in the translation.

## 1. The packages, and who may import whom

| Package | What it is | Its entry, the names that matter | May import |
|---|---|---|---|
| `@readarxiv/format` (`packages/format`) | The bundle's schema (`packages/format/src/schema.ts`), its one reader and writer (`packages/format/src/io.ts`), a unit's id (`packages/format/src/ids.ts`), and the documents our server gives a reader (`packages/format/src/doc.ts`) | `read`, `write`, `unitId`, `PaperDoc`, `OpenAsk`, `fold`, `FORMAT` | no package |
| `@readarxiv/text` (`packages/text`) | The sentence cuts several packages share (`packages/text/src/sentences.ts`) | `sentenceCuts`, `ABBR` | no package |
| `@readarxiv/ui` (`packages/ui`) | The controls, the design tokens and the one string catalogue of the extension, the reader and the website | the controls, `ROLES`, `S` | no package |
| `@readarxiv/engine` (`packages/engine`) | The prepare: a paper's source and arXiv's PDF in, its bundle out | `prepare` (`packages/engine/src/prepare.ts`), `prepareFront`, `prepareBack`, `align`, `locate`, `wrap`, `bundle` | format, text |
| `@readarxiv/typeset` (`packages/typeset`) | A page's translation laid into the room arXiv's page gives it: rules, language data, the breaker, the fit, the page fill | `layPage` (`packages/typeset/src/lay/entry.ts`), `rulesFor` | format, text |
| `@readarxiv/translate` (`packages/translate`) | The translator contract, the adapters (Microsoft, Google, the browser's built-in) and the chain that falls back between them | `chainOf`, `identityOf`, `keyOf`, `unitInOf`, `accept` | format, text |
| `@readarxiv/reader` (`packages/reader`) | The bilingual reader: the session, the panes and page stack, composing, the highlight, the chrome | `openReader` (`packages/reader/src/reader.ts`), `openSession`, `mountChrome`, the `Host` it runs in | format, typeset, text, ui |

The directions point one way, and `scripts/check-boundary.mjs` holds them (its table `PACKAGES`; it runs in `pnpm lint`): a
package imports another only through its entry, `@readarxiv/<name>`, never a deep or a relative path into it; no package
imports the extension's `src/`, its aliases, `wxt` or a virtual module; a directory under `packages/` that `PACKAGES` does not
list fails; and no package holds a hand-written declaration file, so the JavaScript modules a package still holds, all of
them the engine's, are typed by a `*.types.ts` facade that re-exports with its type each value read of them: today's ink
makers copied into `packages/engine/src/locate/today/` (`deps.mjs`,
`figure-text.mjs`, `ink-units.mjs`, `ledger.mjs`, and the `accents.mjs` and `content-classes.mjs` they import) by
`packages/engine/src/locate/today/today.types.ts`, but for the two values of `accents.mjs` that
`packages/engine/src/locate/facts.ts` reads and types itself; and the moved front half, the 27 modules of `source/`, `marks/`,
`own/`, `compile/` and `instrument/`, by one facade at the engine's entry, `packages/engine/src/front.types.ts`. Each package
is type-checked under its own `tsconfig.json` (`tsc -b packages`) and
tested under its own `vitest.config.ts`; `packages/README.md` states the rest.

The extension is the root package, over the packages and never under them:

| Area | What it is |
|---|---|
| `src/entrypoints/` | The extension's pages and scripts: the background (the one chain, `src/entrypoints/background/index.ts`), the content scripts of arXiv's HTML, abstract and PDF pages, the popup, the settings, the reader's page (`src/entrypoints/pdf-reader/main.tsx`) |
| `src/core/`, `src/providers/`, `src/cache/` | The HTML page's translator (DESIGN §4): rules, extractor, protector, renderer; the translators the chain is made of; the stores. Platform-free: `scripts/check-boundary.mjs` refuses an import of WXT, an entry point, the UI or the messaging there (hard rule 8) |
| `src/pdf-reader/host/` | The reader's two hosts behind the package's one chrome: `src/pdf-reader/host/v2.ts`, the reader package whole (the build's default), and `src/pdf-reader/host/today.ts`, today's session (`AXT_READER=today` in `wxt.config.ts`) |
| `src/pdf-reader/engine/`, `src/pdf-reader/session/` | Today's engine and session: the reader the released extension reads with, and the modules the website imports by path (`tests/contract/website-imports.test.ts` holds each). Its files may import the engine itself, four modules of the core, `node:` modules, `zod` in `rules/` and `@readarxiv/engine` (`scripts/check-boundary.mjs` `ENGINE_ALLOW`, `ENGINE_PACKAGES`) |

One door crosses the rule on purpose. The front half moved into the engine package, and each moved module's old path under
`src/pdf-reader/engine/` re-exports it through a transition path of its own, `@readarxiv/engine/today/<folder>/<file>.mjs`
(each named in `packages/engine/package.json`, whose note says the cut-over deletes them with the old paths); only those old
paths and the lab may import one (`tests/pdf-reader/engine-contract.test.ts`).

## 2. The four shapes of data

A paper's data takes four shapes, each written once and read downstream only. Two letters name the two PDFs: **A** is
arXiv's PDF, the page every reader sees; **B** is our marked compile of the paper's source, an instrument no reader sees.

| Shape | Defined in | Written by | Read by |
|---|---|---|---|
| **Units**: `Unit` in `Units` objects | `packages/format/src/schema.ts` (`Unit`, `Units`, `Piece`); the id `unitId` in `packages/format/src/ids.ts` | the front half, before any compile of the marks (`sourceUnitsOf`, `packages/engine/src/front.ts`); the back half's `bundle` (`packages/engine/src/bundle/bundle.ts`), with the units made on A | the translators, through `unitInOf` (`packages/translate/src/bundle.ts`); the reader: its contents, its kept units, the rows it makes |
| **Located** | `packages/engine/src/locate/work.ts` (`Located`, `Member`) | `locate` (`packages/engine/src/locate/locate.ts`) | `wrap` and `bundle`, inside the back half; the lab's dumps. Never stored or sent |
| **The bundle**: `Head`, `Units`, one `Part` a page, the add-on | `packages/format/src/schema.ts`; `BundleObject` in `packages/engine/src/bundle/bundle.ts`; `AddOn` in `packages/engine/src/wrap/wrap.ts` | `bundle`, in order: the units, each page's part, the add-on, the head last | the reader, through format's `read`; the add-on by ranges, as the composed document (`packages/reader/src/bytes/composed.ts`) |
| **Rows**: `Row`, `Rows` | `packages/format/src/schema.ts`; the same value as the chain's `Result` (`packages/translate/src/contract.ts`) | the chain (`chainOf`, `packages/translate/src/chain.ts`): our server's run for a target, or the extension's background | the reader, which hands them to the typesetter beside the part: `layPage(part, rows, rules, metrics)` |

**Units: what the paper says.** A unit is a piece of the paper's text translated as one: a paragraph, a heading, a caption, a
cell, a reference, a name babel generates; or text our compile set, or A prints, that no source unit owns (the kinds `ink…`).
Its content is a list of pieces: `text`; `el`, an element that travels with the text (a formula, a citation, a reference),
carrying its TeX source `src`; `span`, a group of the source with a style; `unit`, a unit nested in this one (a footnote set
inside a paragraph). Its id is the hash of its kind and its pieces as the source writes them, and nothing else, so equal
units share an id and one translation, and a change of a cut moves only the ids of the units it changes.
`sentences` says the reader lights it sentence by sentence, `kept` that the paper keeps it as it is (never translated: which
of a table's cells and a figure's texts are kept is decided in the engine alone, by `packages/engine/src/instrument/language.ts`,
a text that holds no ordinary word, a name the paper's own running text writes, a text a block of names in the paper's tables
keeps; read by `unitFactsOf`, `packages/engine/src/instrument/instrument.ts`, for the source's units, over the blocks the
source reader states, and by `packages/engine/src/locate/ink.ts` for the texts read off A; the typesetter decides none), and
`of` the block its source ties it to where that is not its kind's (a `\thanks` written in `\author{…}`, acmart's
`\authornote`: `of: 'author'`); `of` is in no id and reaches no translator. The kind a reading option decides by is
`toggleKind(x)`, `x.of ?? x.kind` (`packages/format/src/schema.ts`), and every site that decides one calls it.

**Located: where each unit stands on A.** The back half reads B's ownership of every glyph (which unit, which role, which
piece) and carries it onto A by aligning the two documents' glyph sequences (`packages/engine/src/align/align.ts`). A unit is
**located** where every glyph it owns on B has a partner on A: no partial credit, no threshold; one that is not stays the
original's, with its cause. Each located unit is placed on A as one or more **members** (`Member`; format's `Placed`): its
lines, elements, label, style and room read from A's own glyphs, and TeX's statements where B's log has them (a table cell's
room is its column's box where the column's entries establish it, `Room.column`: `packages/engine/src/locate/columns.ts`, read
in `packages/engine/src/locate/facts-pass.ts`). `locate` runs
its phases in one order (`packages/engine/src/locate/locate.ts`), and one module, `packages/engine/src/locate/ownership.ts`, is
the only writer of who owns each glyph of A and of the lists each member states its ink in. Locate also makes the units no
source unit is, of A's glyphs no source unit owns (a running head, text inside a figure: `packages/engine/src/locate/ink.ts`;
a figure box's flush rows joined into its texts, each list item one, a joined text's room across the box's inside:
`packages/engine/src/locate/figure-lines.ts`), and the units born on A, of text A prints and B never printed
(`packages/engine/src/locate/born.ts`); and it states the **flows** (members TeX set on shared lines, laid in order), the
**ties** (a table's cells; the members of a flow laid at one size; a figure's set, which the lay no longer reads, each figure
text sized by its own width, `packages/typeset/src/lay/figures.ts`), the links, and the **groups**: per member and page,
`<ord>.<page>.t` its text, `.e` its travelling
elements, `.l` its label; a display, a kept block and what is not located are in no group.

**The bundle: Located cut for the reader.** Every object is canonical JSON named by the SHA-256 of its bytes (format's
`write`). The **head** names everything else: the paper, A's length, digest and each 64 KiB chunk's digest, the units'
objects, one part a page (or none), the add-on, the pages refused, the outline. A **part** is a page's whole problem, so
that a page is laid from its own part alone: every flow with a line on the page, every flow with a line on an earlier page
where a member of those has its first line, and every flow tied to any of them; and what the lay needs of the paper (its
faces, TeX's `\lineskip`, its names). The **add-on** is A's own runs wrapped in optional content groups, written as
an incremental update over A's exact bytes: A followed by it is the **composed document**, whose every group on is A's page.
The units are cut into objects under the units' bound (1 MiB, `packages/format/src/io.ts` `BOUNDS`).

**Rows: the translations.** A row is one unit's translation for one target, keyed by unit id: the translated pieces (every
element of the unit back exactly once), the translator that gave it, and its sentences on both sides, or why there is none.

Two more values cross a seam and are not shapes of the paper. **The instrument** (`packages/engine/src/instrument.ts`) is what
the front half hands the back half: B's pages read, each glyph's and box's owner, the units, TeX's statements; it is stored as
four objects (`b.pdf`, `log`, `plan`, `definitions`: `StoredInstrument`, `packages/engine/src/plan.ts`) so that a prepare of
the same original runs no TeX. **The paper's document** (`PaperDoc`, `packages/format/src/doc.ts`) is what our server tells a
reader of a paper: the prepare's run and stage, the source's units as soon as they are read, the layer that serves (its
catalog, the head), and the asked target's run and its rows objects. A reader keeps the newest of two (`fold`); a word that
decides what a reader does is closed, one that refines what it is told is read openly.

## 3. The life of a paper

```
 our server's box, or the lab's runner          a reader's browser: openReader(root, { host, paper })
 ─────────────────────────────────────          ─────────────────────────────────────────────────────
 source + A ─► prepare(take, host)              A by ranges ─► the left pane (PDF.js's viewer)
   front half: the source's units handed out    POST /api/v2/open, then the follow ─► the paper's document
     the marked compile (B), the instrument     the head ─► the composed document: A, then the add-on
   back half: A read; align, locate, wrap       the units the head names ─► rows: Host.translate (the extension)
     bundle: units, parts, add-on, head ─────►                               or the Rows objects (the website)
     each object handed out as it is made       each page: its part + its rows ─► layPage ─► the composed page
                                                  drawn with the laid groups off, the translation over them
```

A reader's open starts what our server lacks for the paper: its prepare, where no layer serves, and the asked target's
translation (`POST /api/v2/open`; the follow never starts work: `packages/reader/src/session/client.ts`). Until a layer
serves, the reader shows A, and the paper's document tells the prepare's stage.

**The prepare** runs on our server and, through the same door, in the lab. The host takes the inputs once (the source's files,
A, and the four stored objects of an instrument made with the same original) and calls `prepare(take, host)`
(`packages/engine/src/prepare.ts`); the lab's runner, `lab/pdf/prepare-back/run.mjs`, calls it as the box does, from cached
compiles. What the host owns enters as `host`: the compile, PDF.js and its options, zlib, pdf-lib, the TeX engines and trees
it serves, where each object goes.

1. A's facts (`originalFactsOf`: its page count, its day, the TeX Live year its banner names) and the tree (`treeOf`: the
   paper's declaration, else the banner's year, else the default). A paper of another tree is answered with that tree before
   anything is compiled.
2. The front half, `prepareFront` (`packages/engine/src/front.ts`), in a frame of its own so that the source's files are let go
   before the back half begins. Its stored half, `compiledOf` (`packages/engine/src/compiled.ts`), opens the paper with the
   source reader (`packages/engine/src/source/latex-front.ts`), makes the bibliography where TeX must, hands the source's units
   out as `Units` objects, then runs the marked compile with its final pass (`markedOfPaper`,
   `packages/engine/src/compile/paper.mjs`: the probe, the marks of `packages/engine/src/marks/marks.ts`, the guard of
   `packages/engine/src/compile/guard.mjs`), or reads a stored instrument back where A's facts are the ones it was made for.
   What is stored of a compile is `plan.ts`'s (`storedInstrumentOf`). `instrumentOf`
   (`packages/engine/src/instrument/instrument.ts`) then states the instrument over B.
3. The back half, `prepareBack`: A read once (`packages/engine/src/read.ts`), aligned with B, located, wrapped
   (`packages/engine/src/wrap/wrap.ts`) and cut into the bundle's objects, each handed to the host as it is made; then a tally.
   The prepare tells the host its stages as `PREPARE_STAGES` names them (`packages/format/src/doc.ts`).

Our server stores each object by its digest and names the layer in the paper's document; how it stores, keys and schedules a
prepare is the private repository's and not described here.

**The reader on the extension's host.**

1. On arXiv's PDF page, `src/entrypoints/pdf.content.ts` frames the reader's page, `src/entrypoints/pdf-reader/main.tsx`, which
   reads the settings, builds the extension's `Host` (`extensionHost`, `src/pdf-reader/host/v2.ts`) and opens the reader under
   the package's chrome. The Host gives the network (our server and arXiv alone, never the visitor's credentials or a referrer,
   through this machine's store of papers, `src/pdf-reader/host/stored-fetch.ts`), where A is read, the preferences over the
   extension's configuration, and `translate`, the rows made here.
2. The session is a machine (`packages/reader/src/session/machine.ts`): `step` is pure, each state declares the resources it
   owns, and the runtime acquires and lets go of them. It reads A by ranges in 64 KiB chunks (`packages/reader/src/bytes/source.ts`)
   into the left pane, asks our server `POST /api/v2/open` with no target (the extension makes its own rows) and follows the
   paper's document at `GET /api/v2/papers/<seg>` (`packages/reader/src/session/client.ts`).
3. Once the document names a layer, the reader loads its layer code (after the left's first page, or 1.5 s), reads the head
   (format's `read`, held to its digest) and opens the composed document over the same byte store: every chunk of A is then held
   to the digest the head names for it, and a chunk that disagrees puts our copy on both panes.
4. The layer's units are the `Units` objects the head names (`layerUnitsOf`, `packages/reader/src/session/machine.ts`), read
   once: the contents, the kept units and the rows come from them, never from the document's `layer.units`, which is our
   server's word for what its own run was given. The rows are made here: `Host.translate` (`src/pdf-reader/host/translate.ts`,
   each unit through `unitInOf`) sends them to the background, whose transport (`src/providers/transport.ts`) runs them through
   the one chain (`chainOf`, made once in `src/entrypoints/background/index.ts`), the page in view first. The background keeps
   each accepted raw reply (the chain's store) and each row (`src/cache/translate-store.ts`).
5. Each page's part is read as the page comes near, and the composer (`packages/reader/src/compose/composer.ts`) lays it with the
   reader's typesetter (`packages/reader/src/compose/typeset.ts`, `layPage`) once every row and face the page waits for is in. A laid page
   is the composed document's page drawn by PDF.js with its laid members' groups off (`packages/reader/src/compose/groups.ts`),
   under the translations and each element's crop (`packages/reader/src/compose/paint.ts`), with our text layer and links
   (`packages/reader/src/compose/text.ts`, `packages/reader/src/compose/links.ts`). A page with no part, a member not laid and a
   page that failed stay arXiv's. The highlight paints a lit unit's boxes alike on both panes, the union of its boxes and never
   part of one: boxes that share a band are never met (`packages/reader/src/compose/highlight.ts`, `paintRows`).

**The reader on the website's host.** The same `openReader`, under a `Host` the website gives (in the private repository) with
no `translate`. Its open names the target; our server translates that target's units with `@readarxiv/translate` and the
document lists the target's `Rows` objects as they are made (`targets[<target>].rows`), which the reader reads, each held to its
digest, until the run is done or failed (`packages/reader/src/reader.ts`). Everything else, the session, the composer, the
typesetter and the painter, is the package's, the same on both hosts.

## 4. The invariants, and the gates that hold them

Hosted CI (`.github/workflows/ci.yml`) runs `pnpm typecheck`, `pnpm lint`, `pnpm build` and `pnpm test`. Every other gate runs
by `pnpm release-check --tier fast|full|release` (`lab/release-check/run.mjs`; each gate, the invariants it holds and the gaps
it states, in `lab/release-check/gates.mjs`; where each tier runs, `lab/release-check/CI.md`), the full and release tiers on
the lab's data, which the repository does not hold.

I1 to I10 and D are the approved design's invariants as `lab/release-check/gates.mjs` states them, with the gaps it states;
a gate is named by its id there. The rows after them are this repository's own.

| Invariant | Held by | Not held |
|---|---|---|
| I1: all groups on, the composed page paints what A paints, glyph, box and pixel | `prepare` (PDF.js's proofs over the corpus, `lab/pdf/prepare-back/prove.mjs` (a)); `pixels` (poppler); `canvas` (Chromium); `harness` (the reader's fixtures) | in the reader, held on the harness's fixtures alone; `canvas` has passed only with a stand-in (`--normalize`) |
| I2: a group off hides exactly its ink, and no pixel outside it changes | `prepare` (proof (c′)); `pixels` (Cairo) | no gate turns a group off in the reader |
| I3: a laid unit's ink stays inside its regions and room and overlaps no other ink | `harness`; `typeset-today`, `reader-parts`; `display`, `display-wide` | |
| I4: every element of a laid unit appears exactly once | `harness`; `typeset-today`, `reader-parts` | |
| I5: no line wider than its frame beyond the stated tolerance; no unit under the size floor | `typeset-today`, `reader-parts` | no gate counts the size floor |
| I6: the same inputs give the same bytes (the prepare) and the same display list (the lay) | `prepare-same` (the corpus twice, `lab/pdf/prepare-back/same.mjs`); `sentence-cover` (a unit laid alike by every page's lay that holds it); `packages/typeset/tests/replay/purity.test.ts`; the private repository's box tier (the corpus through the box) | a page laid twice is compared on one pair alone, with the lab's data |
| I7: a unit's boxes on the left and on the right are the same boxes | no gate | |
| I8: the text layer of a laid page reads the translation in reading order | `harness`; `harness-lab` (five corpus papers); the website's reader checks (private) | not over the corpus |
| I9: the box refuses each escape of the security suite and has no network | the private repository's box tier | run under emulation alone |
| I10: on both panes every drawn piece of a lit unit is in exactly one of its sentences, the same sentences on both | `sentence-cover`; `display`, `display-wide` | not over our server's own rows |
| D: no unit drawn or laid at the frozen baseline (the released reader's output, recorded in the lab) is lost, but for the acceptance list | `prepare-diff`; `typeset-today`; the private repository's sweep against its staging server | |
| Display: no page drawn worse than today's reader draws it, a difference only where nearer A | `display` (`lab/typeset/parity/`: both drawn beside A's page with the same rows) | |
| I11: every box of a lit unit painted whole on both panes, as the reader's painter draws it | the reader gate's entry (`lab/typeset/gate-l1.mjs` with `--entry`, `lab/typeset/painted.mjs`: a box not painted whole fails its run), so `reader-parts` and `sentence-cover`; `packages/reader/tests/highlight-display-rows.test.ts`; `tests/lab/parity-paint-binds.test.ts` (the display gate's paint model the painter's outlines) | the release check counts no I11 of its own (`lab/release-check/gates.mjs` `entryRunOf` reads the run's exit): a run that also exits 1 for what it states, as the door's rows do for the added pairs' paragraph points, would pass a box not painted whole |
| A package imports only the packages `PACKAGES` allows, by entry; nothing of the extension | `scripts/check-boundary.mjs` (`pnpm lint`) | |
| The core is platform-free; today's engine imports only what `ENGINE_ALLOW` and `ENGINE_PACKAGES` name | `scripts/check-boundary.mjs` | |
| A transition path is imported by an old path or the lab alone | `tests/pdf-reader/engine-contract.test.ts` | |
| Every module the website imports by path stays at it, with every name it takes | `tests/contract/website-imports.test.ts`, `tests/contract/website-use.tsx` (type-checked) | |
| No code ported from a GPL project is reached by an extension entry | `tests/contract/no-gpl.test.ts` | |
| Nothing under `src/` imports `lab/` | `tests/scripts/doc-paths.test.ts` | |
| Format's `read` checks an object's digest and bounds before it parses it, then its schema; `write` gives the canonical bytes `read` takes | `packages/format/tests/format.test.ts` | |
| The reader holds every object it fetches to its digest and its bound | `packages/reader/tests/client.test.ts` | |
| A unit's id is its kind and its pieces' source, nothing else | `packages/format/tests/format.test.ts` | |
| One writer of A's ownership; the members' lists agree with it | `packages/engine/tests/helpers/locate.ts` (every locate test fails on a disagreement not carried) | over the corpus the lab's runner writes the findings (`ownership/<id>.json`) and its exit does not take them |
| A unit is located only where every glyph it owns on B has a partner on A | `packages/engine/tests/locate.test.ts` | |
| The prepare's entry re-exports each module's own values; the front half's files are let go before the back half; a run given a stored instrument hands out none | `packages/engine/tests/entry.test.ts`, `packages/engine/tests/front.test.ts` | |
| Each behaviour digest is the hash of its case table's outcomes | `packages/translate/tests/digests.test.ts`, `packages/translate/tests/chain-digest.test.ts`, `tests/providers/prompt.test.ts`; `pnpm digests` | |
| A translator is sent no field of identity (`src`, `keys`, `open`, `close`, `depth`, `of`) | `packages/translate/tests/bundle.test.ts` | |
| Every site that decides a reading option reads `toggleKind` | `tests/pdf-reader/toggle-kind.test.ts` | |
| The layer's units are those its head names, each read once | `packages/reader/tests/session.test.ts`; the harness (`packages/reader/e2e/run.mjs`) | |
| The HTML page's DOM: a translation only as its block's next sibling, the original gaining `data-axt-*` alone, restore giving back the DOM node by node (DESIGN §7.1) | `tests/renderer/restore.test.ts` and the renderer's tests on every fixture; `pnpm e2e` | |
| No `:has()` in an injected style sheet | `tests/styles/no-has.test.ts` | |
| No measure of the complexity census rises past its ledger, among them the thresholds and lists with no reason | `census` (`lab/release-check/census.mjs`, its ledger `lab/release-check/census-ledger.json`; the rule ledger `lab/rules/ledger.json`) | not in hosted CI |

## 5. A change of X belongs in Y

| A change of | Belongs in | What moving it costs |
|---|---|---|
| how the source is read: a command's arguments, a piece's kind, what a unit holds | the source reader, `packages/engine/src/source/latex-front.ts`, and its tables in `packages/engine/src/source/` (`tex-names.json` is made by `lab/pdf/spikes/tex-names-make.mjs`, `latexml-args.ts` by `scripts/latexml-args.mjs`) | the units whose content changes take new ids and are translated again; it is the compile side (below); today's reader reads the same front half, so `PIPELINE_VERSION` moves with it (`src/pdf-reader/engine/pipeline/versions.mjs`) |
| what the marked compile is asked and what TeX states back: the marks, the probe, the frames, skips and alignments of the log | `packages/engine/src/marks/` (`marks.mjs` writes and reads the probe; `channels.ts` reads TeX's statements), the compile's driver `packages/engine/src/compile/` | the compile side: a host that keys the stored instrument by the code of `compiled.ts`, `plan.ts` and what they reach compiles every paper once more |
| what the instrument says of B: an element's class, a piece TeX set no ink for | `packages/engine/src/instrument/instrument.ts`, its typed seam `packages/engine/src/instrument.ts` | after TeX: a stored instrument stays good, nothing compiles again; the bundle's objects move |
| which of a table's cells and a figure's texts are kept as written | `packages/engine/src/instrument/language.ts` (the rules), read by `unitFactsOf` in `packages/engine/src/instrument/instrument.ts` over the table blocks the source reader states (`packages/engine/src/source/latex-front.ts`) and by `packages/engine/src/locate/ink.ts`; the typesetter holds no table rule but a group's lay (`packages/typeset/src/lay/entry.ts`) | the units' `kept` moves, with `PIPELINE_VERSION`: a unit kept is asked no more, one no longer kept is asked |
| which glyph of A a unit owns, whether it is located, what a member states | `packages/engine/src/align/`, `packages/engine/src/locate/` (the phases' order in `locate.ts`; ownership written only by `ownership.ts`; the facts read off A in `facts.ts` and `facts-pass.ts`); written into the part by `packages/engine/src/bundle/bundle.ts` | the parts move. Proof: the lab's corpus run object for object against the last (`lab/pdf/prepare-back/same.mjs`), the differential (`prepare-diff`) |
| which ink a reader can hide | the groups, `groupsOf` in `packages/engine/src/locate/ownership.ts`; the add-on, `packages/engine/src/wrap/wrap.ts` over `packages/engine/src/wrap.ts` | the add-on moves. Proof: `lab/pdf/prepare-back/prove.mjs`, `pixels` |
| a field of a bundle object | `packages/format/src/schema.ts` | an optional field is free: a reader strips what it does not know. One an old reader would misread raises `FORMAT`, and a reader names the formats it reads in its open (`FORMATS`) |
| a word of the paper's document | `packages/format/src/doc.ts` | a closed word (what a reader does) needs a new `v`; an open word (what it is told) is free |
| a rule of the lay: breaking, the fit, the page fill, a figure's text, a table's group, a cell in its column's box | `packages/typeset/src/` (`breaker/`, `fit/`, `shared/`, `unit/`, `lay/`; a cell's room `packages/typeset/src/lay/adapt.ts`), entered by `packages/typeset/src/lay/entry.ts` | nothing stored moves and no number rises: a page is laid when it is read. Proof: the typesetter's tests, `display`, `sentence-cover` |
| a language's data: labels, hyphenation, punctuation, faces, the names of headings and references | `packages/typeset/src/data/`, the source, edited by hand: `rules/` (a file a language over its script's; what each field mirrors, babel's captions and minimums, hyph-utf8's patterns, TeX Live's names, in `rules/types.ts`), `faces.ts` (the face catalogue; each face's coverage and small capitals as its file's cmap and GSUB state them), `marks.ts` (the CJK marks' ink, measured in the face files by `lab/typeset/marks-data.py`). Today's reader keeps its own copies under `src/pdf-reader/engine/rules/` until the cut-over | nothing stored moves: a page is laid when it is read, so a value edited moves the lay's dumps (the reader gate, `display`); `packages/typeset/tests/unit/data.test.ts` holds every export's shape, and `tests/typeset/tex-names.test.ts` the head and reference names equal to the engine's `packages/engine/src/source/tex-names.json`, which they mirror |
| what a reading option shows | `packages/reader/src/compose/classes.ts`, by format's `toggleKind` | nothing stored |
| how a translation is drawn | `packages/reader/src/compose/paint.ts` | nothing stored |
| how a lit unit is painted | `packages/reader/src/compose/highlight.ts` (`paintRows`), the display gate's model of it `lab/typeset/parity/paint.mjs` | nothing stored. Proof: I11 in the reader gate, `tests/lab/parity-paint-binds.test.ts` |
| a translator's contract: what it is sent, how its reply is read | `packages/translate/src/contract.ts`, the wires in `packages/translate/src/wire/`, the adapters in `packages/translate/src/adapters/` | the adapter's behaviour digest moves; below |
| when a reply is accepted; the chain's own rules (fall-through, re-ask, the runs floor, groups, names) | `packages/translate/src/accept.ts`; `packages/translate/src/chain.ts` with `groups.ts`, `runs.ts`, `names.ts`, `words.ts`, each rule a case of `packages/translate/tests/chain-cases.ts` | `ACCEPT_DIGEST` or `CHAIN_DIGEST` moves; below |
| an LLM's prompt | `src/providers/prompt.ts`, `src/providers/prompt-library.ts` | `PROMPT_DIGEST` moves; below |
| what a store keeps or how a saved setting reads | the store's own module, with its schema number (below) | the number rises, and old entries are refused or migrated |
| a rule of the HTML page | `src/core/rules/latexml.ts`, the one file of `ltx_*` selectors | DESIGN §5 |

**Where a version or a digest moves, and what moving it costs.** A number that says "what is computed changed" is a digest
derived from bytes or from behaviour; a number raised by hand is the schema number of a store.

| Identity | Where | What it is | Moving it |
|---|---|---|---|
| a unit's id | `unitId`, `packages/format/src/ids.ts` | its content's hash | that unit's rows alone are made again |
| `ACCEPT_DIGEST`, `GOOGLE_DIGEST`, `MICROSOFT_DIGEST`, `TAGS_DIGEST`, `CHROME_DIGEST`, `CHAIN_DIGEST` | `packages/translate/src/` | each the hash of a function's outcomes over its case table, a test failing until the literal matches; `pnpm digests --write` writes them | `identityOf` moves for every chain that holds it, and so does every row's key: each row is made again, read from the stored raw reply where the translator was sent the same bytes (`keyOf`: `t1`, the translator's identity, the target, the wire's hash, the context's) and asked again where it was not |
| `PROMPT_DIGEST` | `src/providers/prompt.ts` | the prompt's data hashed at load (`PROMPT_TEXT_DIGEST`) with `buildPrompts`' behaviour digest (`BUILD_PROMPTS_DIGEST`, its cases in `tests/providers/prompt-cases.ts`) | an LLM translator's identity: its stored answers are never reached again |
| `FORMAT` | `packages/format/src/schema.ts` | the bundle's schema number | a reader of the old number no longer reads a new bundle |
| `KEY_VERSION`, `ROWS` | `packages/translate/src/chain.ts`, `src/providers/transport.ts` | the grammars of the raw replies' and the extension's rows' keys | every entry under the old grammar is unreachable |
| `CONFIG_VERSION` | `src/config/schema.ts` | the saved configuration's schema | needs its migration in `src/config/storage.ts` (hard rule 7) |
| `OCR_KEY_VERSION`, `OCR_VERSION` | `src/cache/ocr-key.ts`, `src/core/ocr/version.ts` | both in the recogniser's key: its result's shape, the model and pipeline that read | every figure is read again |
| `PIPELINE_VERSION`, `TRANSLATE_VERSION`, `LAYOUT` | `src/pdf-reader/engine/pipeline/versions.mjs`, `src/pdf-reader/engine/translate/version.mjs`, `src/pdf-reader/engine/layout/file.mjs` | today's engine's, raised by hand | the layers and rows today's reader reads that were made under the old number are made again |

## 6. Where the build differs from the approved design

| The design | As built | Why that is safe |
|---|---|---|
| A rebuilt front half: a typed source reader under TeX's definitions, marks freed of the rule that they move nothing, a drafts-only compile plan | Today's front half, moved whole into `packages/engine/src/source/`, `marks/`, `own/`, `compile/` and `instrument/`: JavaScript, typed at the package's entry by `packages/engine/src/front.types.ts`, behind `prepareFront` | The rebuilt one, run beside it over the 87 corpus papers, lost 314 units against the frozen baseline where today's loses 3, and stated none of the element classes, spans, cells and kept units the back half and the typesetter read (DESIGN §16, "One front half, today's") |
| Each fact decided once, typed, at the source: no later module reads a piece's TeX with a pattern | Modules downstream of the source reader still read a piece's `src` with a pattern: in the typesetter `packages/typeset/src/breaker/tokens.ts`, `packages/typeset/src/emit/links.ts`, `packages/typeset/src/unit/breaks.ts`, `packages/typeset/src/unit/rename.ts`; in locate `packages/engine/src/locate/place.ts`, `packages/engine/src/locate/ink.ts`, `packages/engine/src/locate/facts.ts`, `packages/engine/src/locate/facts-pass.ts` | Each reads what the source reader wrote, and each is held by the gates of section 4; a fact moved to the source is one change per fact, with its own proof |
| No final pass; B from the marked drafts; no probe and no guard unless their counts call for them | The marked compile keeps its probe, its final pass (B is the final pass's PDF, figures included) and its guard (`packages/engine/src/compile/paper.mjs`, `packages/engine/src/compile/guard.mjs`) | Locate's rules for text inside figures read a B that holds the figures: the drafts-only compile made 6,614 figure ticks and labels into units, for a saving that was this very pass (DESIGN §16) |
| One page stack of our own under both panes | The left pane is PDF.js's viewer (`packages/reader/src/panes/left.ts`), which still reads one private member of PDF.js; the right is the reader's stack | The design moves the left only where the stack matches the viewer's first paint. Measured on three papers, the stack matched the scroll trace and held 8 to 12 % less renderer memory, but painted the first page 8.5 ms (9 %) and 20.5 ms (17 %) later on two of them |
| A `Host` that states facts: the original, an object by digest, the follow, the rows, the preferences, the words, opening a link | A `Host` that gives a network: `fetch`, `original(ref)`, `prefs` and, where the host makes rows, `translate` (`packages/reader/src/reader.ts`); the follow, the objects and the words are the reader's own over that `fetch` | They are the same code on both hosts once a host gives a `fetch`, so they live inside the reader; the host's `fetch` refuses any origin it does not serve (the extension's: our server and arXiv alone, `src/pdf-reader/host/v2.ts` `hostFetch`), and every object read is held to its digest. A host that states facts reopens that interface, and is left until after the cut-over |
| A canvas painter, with the page's own weight and no layout cost | The SVG painter (`packages/reader/src/compose/paint.ts`) behind the same interface | The canvas changes how text looks, and the design ships it only after the maintainer has compared both on crops at three zooms; until then the SVG stays, as the design says |
