# The layer lab

A local bench for the instant layer: a paper and a language, any two views side by side, pages in step. Its main view,
the **quick view** (`a=v0`, once called Layer v0), draws exactly what the engine draws (`src/pdf-reader/engine/`): the
hybrid over the paper's add-on, with D (adaptive fill), on the layer gate's own inputs. Like the gate it is a
measurement tool of the maintainer's machine: not part of the type check, the unit tests or the build
(`lab/pdf/README.md`), checked by `pnpm lint` alone.

## Start

From the worktree's root, on the gate's made fixtures and the PIPELINE 10 translations (a relative path is taken from
where the server is started):

```
LAYER_FIXTURES=lab/pdf/out/layer-gate/fixtures/41795914c3c84238 LAYER_RECORDS=lab/pdf/out/layer-gate/cut-p10/records LAYER_GEOMETRY=lab/pdf/out/layer-gate/cut-p10/geometry node lab/pdf/layer-lab/serve.mjs
```

Then open http://127.0.0.1:8093/ (`--port=` for another port). `npm run layer-lab` in `lab/pdf` starts the same server
(the variables then name paths from there: `out/layer-gate/…`). Without the three variables the server reads the lab's
own fixtures (`data/layer-fixtures`), which are an earlier cut, and the gate's geometry folder (`LAYER_GEOMETRY`'s
default, `layer-gate/ref.mjs`).

The address holds the view, for example:
- http://127.0.0.1:8093/#f=1512.03385v1-zh&a=v0&b=original&p=1&z=fit&s=continuous (ResNet in Chinese, dense);
- http://127.0.0.1:8093/#f=1706.03762v7-ja&a=v0&b=original&p=10&z=fit&s=continuous (the Transformer in Japanese,
  Table 4);
- http://127.0.0.1:8093/#f=2307.16209v1-zh&a=v0&b=original&p=52&z=fit&s=continuous (the thesis).

## What it serves

- **Fixtures** (`LAYER_FIXTURES`): arXiv's PDF and the layout file of each `<id>v<n>-<target>`, here the gate's made
  fixtures (all 29 outputs).
- **Translation** (`LAYER_RECORDS`): `units.json` and `record.json`, here the records on the front end's cut.
- **Geometry** (`LAYER_GEOMETRY`): v0's anchors by paper, here the remapped cut's. It is the gate's own variable and
  default (`lab/pdf/spikes/layer-gate/ref.mjs`).
- **Finals** (`LAYER_FINALS`, default `data/layer-fixtures`): the compiled finals, made on 2026-10-06 from the lab's own
  fixtures. The lab only reads them: the compile path is parked (`parked/README.md`), and nothing here makes a final.
- **The engine**: this worktree's (`LAYER_PROTO=<worktree>` runs another's).
- **The add-on**: one per paper, as the engine makes it (`layout/addon.mjs`, `paperAddon`: the gate's shipped half). It
  is read from the gate's cache (`out/layer-gate/removal/`) when that holds one for the paper's bytes, layout file and
  remover, else made once into `out/layer-lab/addon/`. It is opened as a reader opens it: arXiv's pages and the add-on's
  in one document, with its manifest.

## Views and controls

The page is drawn in the extension's tokens and controls (`/styles/tokens.css` and `controls.css`, from `src/styles`),
light or dark as the system is. Its words are `strings.mjs`'s: Chinese by default, English with `ui=en` (the switch at
the foot of the settings); the target languages are always named in their own languages.

- **The toolbar:** the paper (its title and arXiv id) and the target language; the page (its field, ‹ and ›, or ← and
  → anywhere outside a field; PageUp and PageDown in one-page scrolling), which brings each pane to the top of that
  page; the zoom; continuous or one-page scrolling; pages in step (`sync`); the settings shown or hidden (`panel=0`).
- **Each pane's head:** what it shows, Original, the quick view (`a=v0`) or Final, and what that view is drawn with.
  The final's entry says when its translation is older than the one the quick view lays (the finals are compiled from
  the lab's own fixtures, an earlier cut). The early engine (`a=layer`, Task 11's from-scratch entry, retired by the
  10-06 change of direction) is off the menus; an old link still opens it, under its own name and with no settings.
- **The settings:** the quick view's group while a pane shows it, the unit under the pointer, the paper, the notes, the
  interface's language. Each group says what the page shows in a few facts; the engine's own names and numbers (fit
  actions, steps, commits, paths) are under its technical details.
- **The quick view's choices** (kept in the address):
  - the hybrid: the layout file's geometry where it locates a unit whole (`v0tex`), else v0 alone;
  - over the paper's add-on (`v0rm`), else erased and put back;
  - the prototype's own faces (`v0=prototype`), else the role table's;

  Everything else the quick view does is the layout rule set's: see **The rules panel** below. (D, adaptive fill, and B, the
  script's leading on the original's pitch alone, are the rule `adaptiveFill`, set or empty; D's three sliders are its
  members.)
- **The rules panel:** below the quick view's choices, while a pane shows the quick view. See below.
- **The page summary:** each page's units by geometry, the removal, the fit, and the first drawing's time: v0's step
  (render, text, lay, ops, svg) plus the pane's drawing at its resolution. Clicking a unit shows v0's record of it.

## The rules panel

The quick view is opened with the layout rule set (`src/pdf-reader/engine/rules/layout-rules.json`, read by
`rules/layout.mjs`; the rules-as-data plan §7): every typographic value the instant layer sets a translation by that differs
by target. The panel edits it where its effect is seen. The file it saves is a rule-set PR's whole change; the maintainer
gives it to the engine owner, who commits it and opens the PR.

- **The rows** are `RULES_FIELDS`' (the engine's own description of its fields: name, kind, range, step, one line of words),
  grouped as the fields' `group` says, for the target shown. A row shows the field's resolved value, a control by its kind
  (a range, a switch, a segment of values, chips for an ordering or a subset, a text, a switch and members for an object
  that may be empty), its words, **where the value comes from** (the script, the language, the set as a whole, or an unsaved
  edit) and a reset. Each edit is checked with the engine's own `parseRules`; a value the schema refuses is not applied and
  the panel says which field and why. An edit applies once it has rested (a range's key presses are one drawing).
- **Where an edit goes:** to the language by default (an override of that language's, `languages.<tag>.<field>`), which
  reaches that language alone. The switch on a script's row, *Whole <script>*, moves the edit to the script
  (`scripts.<script>.<field>`), which reaches every language of the script that does not override the field; the language's
  own value of the field is taken away so that the edit is what the target then draws. `rules-model.mjs` is the one place
  that knows this, and `tests/lab/layer-lab-rules-model.test.ts` holds it. A value a language sets that only repeats its
  script's is dropped, not saved as an override.
- **Load:** the worktree's file (the default); a file picked; the published current set of staging or production; a git ref
  (`#rules=<commit sha or branch>`, so that a CI comment's link opens the PR's set). Every set read, from any of them, is read
  as a reader reads one (`readRules`: its size, UTF-8, values counted, shape, ranges, the digest against the ETag), and a
  set that is refused is not loaded. Loading replaces the edits, after asking.
- **Compare:** what differs from the worktree's file and from the published set last fetched (*Fetch staging* and *Fetch
  production* read one without loading it), each field with its two values.
- **Save:** a note (required: what changed and why) and `POST /api/rules`. The server validates the set as a reader does,
  sets `version` to the file's plus one, writes the file in its canonical form (`writeRules`: one field a line, so a
  changed value is one line of a diff) by a temporary file renamed over it, and answers with the fields that changed. A save
  that changes no field is refused.

`rules-api.mjs` holds the routes, and `tests/lab/layer-lab-rules.test.ts` the tests (in a temporary repository, never the
worktree's file):

| Route | |
|---|---|
| `GET /api/rules` | the worktree's file, its bytes, the digest as the ETag |
| `GET /api/rules?ref=<ref>` | that commit's file (`git show <commit>:<path>`): a commit sha, full or abbreviated, or an existing branch of the repository (local or remote-tracking), checked by `git rev-parse`, the ref one argument of git and never through a shell; any other ref is refused |
| `GET /api/rules/published?env=staging\|production` | the published current set, fetched from the URL the lab was given (below); 404 where none was given or the route says 404, 502 where it is unreachable or answers an error |
| `POST /api/rules` | a save. Refused (writing nothing) unless `Content-Type` is `application/json` and `Origin` is exactly the lab's own (`http://127.0.0.1:<its port>`); the body is the set, at most `RULES_CAP` bytes; its `note` is required; one save at a time |

The server listens on 127.0.0.1 only. The published sets are read from the web's current-set route, whose URL the lab is
given: `LAYER_RULES_STAGING` and `LAYER_RULES_PRODUCTION` (for example `https://…/api/v1/rules/s1`). Without one, or where the
route answers 404 or is not there, the panel shows the set as unavailable; the lab asks nothing else of the network, and the
request carries a project user agent and nothing about the maintainer.

## Checks

- `pnpm test` runs `tests/lab/` (from the repository's root): the rules routes and the panel's model. The panel's page is
  checked by hand: edit a field, see the quick view redraw, save, and read `git diff` of the rule file.
- `node lab/pdf/layer-lab/smoke.mjs --port=8095`, with the same three variables: every fixture's Original, Final and
  quick view draw their first page (a fixture with no final is not checked on Final), and the early engine's view (an
  old link's `a=layer`) still draws. Screenshots go to `lab/pdf/data/layer-lab/shots/`.
- Against the gate's progress images (`I24`, `I25`), the quick view at the gate's resolution (zoom 0.9375 at device
  pixel ratio 2, 2.5 device px a unit) is pixel-identical on Letter pages.
- On A4 pages the gate's own panels differ slightly: the gate screenshots the text in a box of the page's fractional
  size (1490 x 2106 for 744.095 x 1052.36 CSS px) and draws it into its 1488 x 2104 canvas. Its text is therefore
  0.13 % smaller and a little lighter there. The lab draws it at its true size. With that step applied to the lab's own
  planes, they match the gate's panels.
