# Per-unit optional-content erasure: contract and tests (design v3, 2026-10-23)

Subject: architecture audit items 5(a) and 5(b). Read-only design, no code. Engine refs are to `.worktrees/route-delta`
(feat/delta-base, d50f78c1), `src/pdf-reader/engine/`. Inputs: `route/architecture-audit.md` §5, `route/ocg-spike.md`,
`route/delta.md` §2, §8, §13–15, `route/text-layer.md`, `layout/stream.mjs`, `layout/marks.mjs`, `layout/ink.mjs`,
`layout/remove.mjs`, `layer-proto/removal.mjs`, the coordinator's ruling R1–R6 (binding). The measurements behind §11 are
in `route/ocgrev/` (scripts `own.mjs`, `cmp2.mjs`, `paths.mjs`, `fetch.sh`; outputs `*.L2.json`, `api/`). v1 and v2 are kept as
`route/ocg-erasure.v1.md` and `route/ocg-erasure.v2.md`. v3 applies the coordinator's conditions C1–C4. C1's re-measure is
`ocgrev/cmp3.mjs` (outputs `*.CL3.json`, `dL2.txt`, `dL3.txt`); C2's delta pairs are `ocgrev/pairs/` and `ocgrev/runDelta.mjs`.

**Is erasing needed at all?** Yes. The translation is set in other words and in other places, so the original's ink under it
has to go. What changes is how: today by rectangles with pads, which leaves slivers; here by each unit's own operators, so no
sliver can be left.

## What changed from v2 (conditions C1–C4)

- **C1:** the 29 "original" units of §11 A are no longer a permanent class.
  - The 17 unmarked title-block units are a marker-coverage dependency on the engine lane's next LAYOUT bump (§1.6).
  - The page-spanning footnote gets a stream-order continuation rule (MR 2a). It is measured and fixes that unit.
  - `.l` is derived from stream order (MR 5, re-measured: it fixes 2 of the 11 label cases, 1 more turns out to be a babel name,
    and 8 remain).
  - The spell check stays as the safety net, and its hits are a build stat (§1.3).
- **C2:** `kind:'full'` stays. Wrapping is a property of our pages: the maker child appends one wrap section to our final PDF,
  and the delta and the full base are both written from those same wrapped bytes. The delta contract keeps one small amendment
  (§2.1). The full-fallback class is measured in §11 C.
- **C3:** the build starts after #440 merges and the pin is cut. File ownership between the lanes is in §10b.
- **C4:** E1/E3/E4/E5/E6/E8 are green under the coordinator's rulings (§10). Their numbers are now in §3.2, §4.1, §7.1 and §8.
  There is one final estimate (§10a).

## What changed from v1

- **Wrappers are in the delta's page streams (R1), not in W pages in tails.** Ownership comes from the marks, in stream order,
  in the maker child. Every replaced page is wrapped whatever the layout later decides: all groups ON shows the page as it is,
  so a page the draw rule later refuses costs nothing.
- **Gone with that:** the p/W(p) pair, W4's (n,k) renumbering, duplicate stream bytes, lever S4, E7, and the remover's tails
  altogether. Today the tails carry only the R pages (`SETS = ['R']`), so the add-on, the chain and TAIL_CAP go too. The head
  binds the wrapped delta as soon as the maker child ends, parts stream as they do today, and the proof runs once.
- **One build, no dual path (R2).** Slices S1–S3 and the per-paper switch are gone. Swap, paper fills, R pages, the old way
  and scale capture are deleted in this project. A page or unit that cannot be wrapped or hidden shows the original. A paper
  on an arXiv base shows the original. (v2 also retired `kind:'full'`; v3 keeps it, per C2.)
- **Ownership is measured (§11 A):** 1,752 of 1,802 units (97.2%) own exactly what they own today. Classes 1–5 of §11 A,
  29 units (1.6%, 0.38% of glyphs), cannot be delimited by marks alone or are delimited wrongly. Their contract is to show the
  original, enforced by a spell check (§1.4).
- **Q2 → R3:** a TJ split keeps its adjustments and the text position. Under marks ownership splits are rare by construction
  (§2.3). Residue inside split glyphs is counted and bounded, never a reason to leave a unit untranslated. Q3 is moot. Q4 is
  one line in §12. Q1 and Q5 are settled by R2.
- **Download (R5):** the composed document, with drawn units' groups OFF and the layer appended, is the future download.
  `/OCProperties` is laid out so that export needs no content-stream change (§3.3).
- **Experiments (R6):** E1, E3 (adding 10,000 and 20,000), E4, E5, E6 and E8 were run (all green, §10); E7 is dropped.

## Headline decisions
- D1. The maker child computes each unit's ownership classes from the marks of our final pass, in stream order (§1). Its inputs
  are the marks and the units' own source text. No layout file and no geometry, except one baseline test for labels.
- D2. The maker child wraps our final pass's page streams once, as one appended incremental section (the wrap section):
  `/OC /axt<group> BDC … EMC` around each owned run, `/Properties` in each page's resources, and `/OCProperties` in our catalog
  (§2). `deltaOf` and the full base are both made from these wrapped bytes. The proof runs once, on whichever form is shipped.
- D3. One group per ownership class: text `u<id>`, its placeholders `u<id>.p`, its label `u<id>.l`, a babel name `n<occ>`.
  Groups are flat and ON by default.
- D4. The reader draws the composed page with PDF.js's optionalContentConfig. Render A hides the drawn units. Render B is the
  crop source (all text OFF, placeholders ON). Render C supplies keep characters (§4).
- D5. Anything that cannot be wrapped, delimited or hidden shows the original, at the smallest granularity that is exact: the
  unit, then the page, then the paper (§6).
- D6. `kind:'full'` stays as the delta's fallback (delta.md §7), carrying the same wrapped streams. An arXiv base, and with it
  the original, remains only for a compile that fails its checks (boxes, marks, carry) or a wrap section that fails its proof.

---

## 1. Ownership by marks, in the maker child (engine: new `layout/own.mjs`, called by makerOf)

### 1.1 Contract
Input: our final pass (the marked compile) as the maker child already reads it, `pageInk(…, { indices: true })` per page
(glyphs with (n,k), rule boxes with their path index, points `{ name, glyph, box }`), page by page in order, plus the marking's
`follows(name)` (stream.mjs). Output per page: runs of (n,k) glyphs and path indices per group, plus `unhidden` units with a
reason. Ownership is a pure function of these inputs.

Rules (MR), over the document's stream order. Points are the `/axt-<name> ri` literals.
1. **Region** = in a column's body or not (`bs<n>`/`be<n>`) × float depth (`fs<n>`/`fe<n>`), as `stream.mjs regionsOf` defines it.
2. **Text `u<id>`**: the glyphs and rules between the unit's start mark (`<id>s`, `t<id>s`, `h<id>s`) and its end mark
   (`…e`), in the start mark's region. A range crosses a page only inside column bodies, except under rule 2a.
2a. **Continuation outside the bodies** (a footnote continued on the next page): with the start mark on page p and the end
   mark on page p+1, both outside any body at the same float depth, the text is page p from the start mark to the end of its
   stream, then page p+1 from the start of its stream to the end mark, in that region on each page.
   - On page p the range stops at the first later point in that region (another footnote's start); on page p+1 it starts after
     the last earlier one.
   - A span over more than two pages remains `unhidden: across`.
   - Measured: it fixes the one case on the pack, 1810.04805v2 u31 (147 glyphs).
   - Limit: TeX ships a page's running foot after its footnotes, in the same outside-body region, so on a paper with a page
     number in the foot rule 2a would take that number too. The spell check catches it and shows the unit as the original. A
     footnote-area bracket (`\footins` points, like `bs`/`be`) would close it exactly; it belongs to §1.6's LAYOUT bump.
3. **End-only unit** (a title: TeX sets no start in vertical mode): from the preceding point to its end mark, same page and
   region.
4. **`.p`**: for each `p<id>.<j>a`/`b` and `n<id>.<j>a`/`b` pair named by the unit, its glyphs and rules, wherever the pair
   lies, in the region of its opening mark. An opening alone (a display, a call) gets exactly `stream.mjs ownedOf`'s entry,
   which the maker already computes: to the text after it, its column's end, or past it. A display's ink is `.p`, kept ON
   where the reading keeps it, as today's "kept".
5. **`.l` (by stream order, C1)**: the glyphs between the previous unit's end mark (`[th]?<n>e`) and this unit's start mark,
   on the start's first glyph's baseline (|Δy| < 0.5 size). The walk skips another unit's placeholder range (`p…a`..`p…b`) and a
   babel name's range (`n<occ>.…s`..`.e`), which belong to their own groups. The measurement is in §11 A, C1.
6. **Names `n<occ>`**: between `n<occ>.<key>.s` and `.e`.
7. **Images and forms** (`Do`, inline images) are never unit text. Inside a `.p` range they are `.p`. No mark lies in a form
   on the pack (§11 A), so a form is wrapped whole or not at all.
8. **Invariant I1:** the layout file's unit id equals the mark number. It holds on all 7 papers (§11 A). It is tested.

### 1.2 What the maker child does with it
- It computes ownership during the walk it already makes, then passes compact runs (not operator lists) to `deltaOf` after the
  maker has released its documents (delta.md §13.5).
- Units with no marks, or with marks out of order or twice: `unhidden: 'marks'`.

### 1.6 Marker-coverage dependency (C1; engine lane, assigned)
- The 14 title-block author units and 3 `\thanks` footnotes carry no marks because the marker does not mark them: LAYOUT_TEX
  never reaches `\maketitle`'s moved arguments.
- This rides the engine lane's next LAYOUT bump, together with the revtex4-2 and cite.sty items.
- Acceptance: on the pack, 0 units `unhidden: marks` and 0 spell-check hits for these units once the marks land, and the native
  mark cases hold every text item in place.
- Until the bump, those units show the original. That is a state of the build, not a class of the design.

### 1.3 Spell check (the guard that makes "a failed check shows the original" exact)
- A unit is wrapped as drawable only if its `u` glyphs spell its source text, after NFKC and case folding, with no white space,
  hyphenation ignored, and placeholders' parts skipped. Its `.l` must spell a label form (number, item mark, caption label) or
  be empty. Otherwise its groups are still written, but the unit is `unhidden: 'spell'` and the reader shows it as the original.
- It catches every wrong-owner class measured in §11 A (classes 4–5).
- **Where its hits are reported:**
  - in the build's record: the prepare record's `own` stat, `{ units, unhidden: { marks, across, spell, page, bounds }, spell:
    [unit ids, at most 64] }`;
  - mirrored as integers in `head.base.stats.unhidden`;
  - in the sweep and lab-gate reports, per paper.
- **Target:** 0 spell hits on the pack once §1.6's marks land; at most 2% of units before that.

### 1.4 Failure modes (unit granularity: the unit shows the original, on all its pages)

| Case (§11 A class) | Share on the pack | Result |
|---|---|---|
| no marks: title-block authors, `\thanks` footnotes (1) | 17 units, 0.94% | `unhidden: marks` until §1.6 lands |
| footnote continued over a page (2) | 0 with rule 2a (1 before) | spans over 3+ pages: `unhidden: across` |
| label not adjacent to the start in stream order (3) | 1 unit with rule 5 (4 before) | `unhidden: spell` |
| label rule takes untranslated neighbouring ink on the baseline (4) | 8 units: the 6 of v2 plus 2 new +1-glyph cells | `unhidden: spell` |
| end-only title takes the line before it (5) | 1 unit | `unhidden: spell` |
| marks set twice, out of order, past WORK | 0 on the pack | `unhidden: marks` |

Classes 4–5 remain because stream order cannot tell a label from untranslated ink set between two units on one baseline (a
numeric cell, figure text, a journal header). A marker item that would remove them: a point around each untranslated table cell
and at the end of the title block's header. This is proposed to the engine lane with §1.6; until then the spell check holds them
at "original".

### 1.5 Tests (CI)
- T1.1: MR on synthetic mark streams (§7.2 generator): every rule above, cross-page bodies, end-only, an opening alone, a label
  on and off the line, a form inside a unit range.
- T1.2: I1 on sample-1. Spell check: an accepted unit, an over-take, an under-take.
- T1.3: the pack (lab): §11 A is reproduced, and the refused share is reported.

## 2. Our pages are wrapped once, in the maker child (engine: new `layout/wrap.mjs`, with the lexer and chunker kept from remove.mjs)

### 2.1 Contract
- `wrapOf(finalBytes, own, { PL, deflate })` → `wrapped` = finalBytes ++ one incremental section (the **wrap section**). The
  section is written by the shared `appendSection` writer that delta.md §13.2 already asks for, in the final's xref kind. It holds:
  - for each wrapped page, new `/Contents` stream objects: our streams re-lexed, wrapped by `own`, deflated at a fixed level, so
    the output is deterministic;
  - the page dict again (same number), with `/Resources` gaining `/Properties << /axt<group> ref … >>`;
  - the OCG objects;
  - the catalog again (same number), with `/OCProperties` added.
- Every page our compile marks is wrapped, whatever the layout later decides: all ON is our page.
- A page that cannot be wrapped (§2.4) keeps its streams, and its units are `unhidden: 'page'`.
- **Both forms come from `wrapped`:**
  - `deltaOf(origBytes, wrapped, { replacedPages })` copies the wrapped streams verbatim, as it copies any of our streams today.
    So delta.md §2.2's "copied verbatim, never re-encoded" holds unchanged.
  - The full base stored at `/base/` is `wrapped` itself.
  - The one delta amendment that remains: delta.md §2.5 says the catalog is the original's. The delta must carry our catalog's
    `/OCProperties` key (and only that key) into the composed catalog, and the proof checks that every other catalog key is the
    original's.
- **Which pass each check reads (decided):**
  - Everything that judges our compile reads the **unwrapped** pass: `finalCheck` (our compile's marks equal the draft's), the
    base check (pages, boxes, `carried`), and the layout maker's reading. Wrapping changes no glyph, so their verdicts cannot
    differ, and judging the compile before the wrap keeps a wrap fault from being reported as a compile fault.
  - Everything that addresses the shipped bytes reads the **wrapped** bytes: `head.base.sha256`, `bytes`, `xref` (for `full`,
    the wrap section's startxref; for `delta`, as today), `deltaOf`, the proof, the page pass's (n,k) numbering, and the reader.
- `head.base.stats` gains `{ wrapped, refusedPages, unhidden: { marks, across, spell, page, bounds }, split, groups }`, as
  integers, on both kinds.
- There is one stream per page in the shipped document, so (n,k) means the same to every consumer.

### 2.2 Where a wrapper may go
1. W1. Only between whole operators: never inside a TJ array, a path object, BI…EI, or between an operator and its operands.
2. W2. Each BDC and its EMC share a stream, a q-depth, a BT/ET state and a depth of foreign marked content. A run crossing one
   of these is closed before it and reopened after, as two sequences of the same group.
3. W3. The `/axt… ri` literals stay where they are: they are no-ops to every renderer, and the page pass reads them.
4. W4. A wholly owned form gets its `Do` wrapped. Partial forms do not arise under MR rule 7; if one did, its units would be
   `unhidden: 'page'`.
5. W5. An owned rule that sets a clip (`W n`, `W f`) is wrapped whole. PDF.js applies a hidden path's clip.
6. W6. All ON renders as our page (G1). This is the contract's core.

### 2.3 TJ splits (R3)
- Marked pdfTeX output closes the TJ at every `ri` literal (delta.md §15), so every MR boundary that is a mark is already a TJ
  boundary. Line starts (Td/T*) end TJs too. The only boundaries that can fall inside a TJ are the ends of openings alone
  (ownedOf's "text after it"). There are at most 650 on the pack; the gate counts the real number.
- A split makes each chunk its own TJ, and the adjustment numbers stay with the chunk before them. There is no re-anchor: E4 picked
  variant (a), the remover's chunking, the only one at 0 px outside in Node. Codes are never rewritten. The page counts `split`.
- The gate is 0 px outside the split glyphs' boxes (grown by 1 device px). Pixels inside those boxes are counted and bounded,
  bounded at ≤ 0.1% of the box pixels and Δ ≤ 16 per page (E4). A split never leaves a unit untranslated.

### 2.4 Page refusals (the page is replaced unwrapped, its units unhidden)
- Lexing or alignment fails (the shows counted from the lexed stream ≠ pageInk's `shows`).
- HELD_MAX, BYTES_MAX or WALK_MAX are passed.
- Clipping text mode (Tr ≥ 4) occurs in an owned run (E5: hiding the only clip run removes the clip, so the fill covers the
  page; the remover has the same defect). G0 checks that no owned run has Tr ≥ 4.
- A split is needed in a Type 3 font without widths, a vertical font, or a CMap that is not Identity or embedded (E5).
- The group bounds pass the ladder (§3.2).

### 2.5 The proof (once, in the box, on the form shipped: delta.md §8 and §14 for a delta, the same page checks for full)
- (a) The structure: delta.md §14.2 for a delta. For full, the wrap section's xref, `/Prev` and offsets, with the same checks.
- (b) Per wrapped page, inflate and re-lex: BDC/EMC balance per stream and depth, no BDC in a TJ, path or BI, and every
  `/axt…` property in the page's `/Properties`.
- (c) The page's glyph code sequence and its painted-op sequence equal the unwrapped pass's (splits only re-chunk).
- (d) The catalog equals the original's (delta) or ours (full), except `/OCProperties`.
- (e) Bounds: delta.md §14's rule for a delta, measured with wrapped streams. A delta past them falls to `full`, as today.
- A failed wrap proof makes the paper's base arXiv's, which shows the original, with why `wrap-<code>`. A failed delta proof
  falls to `full`.

### 2.7 What `full` with wrapped streams costs beyond "wrap before writing either form"
- `wrapOf` itself is shared by both forms and is the bulk of §2 (lexer reuse, W1–W6, splits, `appendSection` call): about
  350–450 lines. It is not a cost of `full`.
- **Specific to `full`** (about 60–90 lines plus about 80 lines of tests):
  - the stored base is `wrapped`, not `finalBytes`: one argument in the container's store call;
  - `head.base.xref` and `sha256` are taken from `wrapped`;
  - `readHead` accepts `stats` on a full head;
  - the wrap section's own (a) check for a full head, the same function the delta's proof calls on its own section;
  - e2e rows for a full head with wrapped pages (web and extension).
- **Specific to `delta`** (about 20–30 lines): carrying `/OCProperties` into the composed catalog, and the (d) check.
- Nothing in the reader is form-specific. It hides groups in whatever composed document it opened.

### 2.8 The file contract (decided by the file owner, 2026-10-23)
- **Groups:** one OCG per name, `<< /Type /OCG /Name (axt:<group>) >>`, group `u<id>`, `u<id>.p`, `u<id>.l` or `n<occ>`; content
  streams name them by `/OC /axt<group> BDC`, each page's `/Properties` mapping `/axt<group>` to its OCG. `/D << /BaseState
  /ON /ON [ours] /Order [] >>`. The reader finds a group by its name in PDF.js's config.
- **Where the lists are:** `head.base.unhidden` = `[[unit id, code], …]`, ids rising, code one of `marks`, `across`, `spell`,
  `page`, `bounds`; `head.base.labelKept` = rising unit ids, none of `unhidden`'s. Both on either kind (`full` and `delta`),
  beside `head.base.stats` (`wrapped`, `refusedPages`, `unhidden` counts by code, `split`, `groups`, `labelKept`; a delta's
  own counts kept). They are known in the maker child before the layout is made, so the head carries them and waits for
  nothing. Checked on both sides by `layout/delta-wire.mjs wrapWhy` (the counts equal the lists'). A head with no `stats`
  on a `full` base, or no lists on a `delta`, is an unwrapped base: no unit is hidden.
- **Bounds:** at most `UNHIDDEN_MAX` = 8,000 entries a list (as many as a document's groups, GROUPS_DOC; both full are
  32,000 of the head's 64,000 values). Past it the wrap is refused (`wrap-bound`) and the paper's base is arXiv's (`wrap`).
- **The reader's rule:** a unit is drawable over the file iff the config holds `axt:u<id>` and the unit is in neither
  list; a `labelKept` unit is drawn body only, its label left the original's ink (no `.l` group is written for it).
- **`units` of `wrapFinal`:** the paper's SOURCE units (`pipeline/live.mjs openPaper`'s `units`, the page pass's
  `source.units`), each `{ kind, pieces }` with untranslated text pieces; the spell check reads a unit's `src` where it has
  one, else its pieces' plain source text; the marking's `follows` (an opening alone's end, by the text after it) is made of
  the same pieces. A translation's units (a record's, text pieces `tr`) are refused with a TypeError: they give neither.
- **The cell rules** (the add-on manifest's per-page `rules`) are not the file side's: the maker returns them and the cut
  writes them into the part (the reader lane).
- **Wrap refused for the paper:** `wrapFinal` returns `{ refused: 'wrap-parse' | 'wrap-proof' | 'wrap-bound', why }`; the host
  passes `ours: { refused: 'wrap', why }` and the head's base is arXiv's with `why: 'wrap'` (a new LAYOUT_REFUSED code).

### 2.6 Tests (CI)
- T2.1: W1–W6 on S1–S12, with the proof's (b) and (c) as the oracle.
- T2.2: refusal rows, each with its reason. A refused page writes no `/Properties` of ours.
- T2.3: determinism: the same inputs give the same delta bytes.
- T2.4: sample-1 end to end, from the maker child's runs through `wrapOf`, then `deltaOf` or full, the proof, and the page pass's numbering.
- T2.5: the delta and the full base built from one `wrapped` render identically per page (G1 between the two forms, 0 px).

## 3. /OCProperties (in the delta)

### 3.1 Contract
- An OCG is `<< /Type /OCG /Name (axt:<group>) >>`. A unit spanning pages keeps one OCG. Groups exist for every marked unit,
  drawn or not: which units a target draws is known only in the reader.
- `/D << /BaseState /ON /ON [all ours] /Order [] >>`, with no `/AS` and no `/Usage`. Any viewer shows our page.
- A foreign `/OCProperties` is kept: its OCGs, states and OCMDs stay, ours are appended and listed in `/ON`. Our wrapper inside
  a foreign OFF group stays hidden, as PDF.js requires every entry of the stack to be visible.

### 3.2 Bounds (ladder kept, values set from E3)

| Bound | Until E3 | Past it |
|---|---|---|
| GROUPS_PAGE | 512 (E1: 800 groups / 2000 sequences still render A at 0.99x) | merge `.p`/`.l` into `u` on that page; units needing a kept placeholder become `unhidden: bounds`; still past it, the page is refused |
| SEQUENCES_PAGE | 2000 | same ladder |
| GROUPS_DOC | **8000** (E3: the ≤ 30 ms first-config bound holds to about 12,000 groups in Chromium and 8,500 in Node; the thesis needs 5,263) | later pages refused in page order |

Expected sizes: 10–60 units a page and at most 3 groups a unit. The 147-page thesis has 464 laid units.

### 3.3 Laid out for the later export (R5; nothing of it is built now)
- Content streams name properties (`/axtu12`), never OCG objects. The page's `/Properties` maps the names.
- The export is one more incremental update. It appends the layer (SVG text set with our font subsets) wrapped in one OCG
  `axt:layer`. It re-points each drawn unit's names to an OCMD `<< /OCGs [axt:layer] /P /AllOff >>`. It sets
  `/Order [(ReadarXiv) [axt:layer]]`.
- One viewer toggle then flips between the original and the translation, with no content stream rewritten.
- Invariant: no content stream of ours references an OCG directly.

### 3.4 Tests
- T3.1: O1: each name once in `/OCGs`, and `/Properties` resolves every name used on the page.
- T3.2: a foreign BaseState OFF (S10): all ON renders as our page.
- T3.3: each ladder step on S3/S4 (513 groups, 2001 sequences, 5001 doc groups).

## 4. The reader hides exactly the units it draws (engine: layer-proto/run.mjs, view/layer-side.mjs)

### 4.1 Contract
- D(p) is the units the door draws on p: laid, faces served, not `unhidden`, and a table group whole.
  OFF(p) = `u<id>` for each of them, plus `.p` unless the reading keeps every placeholder in place, plus `.l` where the label
  is drawn in the target's form, plus `n<occ>` for names drawn in the target's word.
- **One config per document** (E3, E8; ruling): the view builds one `getOptionalContentConfig({ intent: 'display' })` when the
  document opens, keeps it, and passes it to every render. PDF.js 6.3.289 otherwise builds a new config on every render (+23 MiB
  main-thread peak on the thesis).
  - The config is never changed while a render using it runs: renders of a document are serialized through one queue.
  - Each render sets the visibility it needs (`setVisibility`, 1.4 ms for 40,000 groups) just before it starts, and awaits the
    render before the next one sets visibility.
- Render A: the composed page at k with OFF(p) false and the rest true, on a canvas of `pageBox`.
- Render B: drawn only where a crop or a kept placeholder needs it. It has every `u` and `.l` OFF and every `.p` ON. Crops are
  cut through their own glyph boxes, so no neighbouring word comes along.
- Render C: all ON, for keep and orphan characters only, counted as `pastedKeep`.
- Commit is one task: A, the pastes and the SVG. No frame shows a unit hidden without its translation, or a translation over
  its visible ink.
- A change in D(p) (a later lay, a reopen, a fallback, a zoom) re-renders A with no re-parse, because visibility is read at
  paint time (spike).

### 4.2 Deleted in this project (R2)

| Deleted | Kept |
|---|---|
| `layer/swap.mjs`; `removal.mjs` (fileOwnership, pagePlan, pageDirty, protection, fileSwap, RULE_*; ~630 lines) | the SVG layer, faces, `commit`'s one task |
| the remover child and transport: `remove.mjs` (except `lex` and the hide-mode chunker, moved under delta), `addon.mjs`, `addon-manifest.mjs`, `chain.mjs`, `chain-wire.mjs`, `tail.mjs`, the cut's chain hooks, part tails in `format.mjs readPart`, Worker TAIL_CAP | `pageBox`/calcRound for our canvases, `drew(canvas, k)`, RECOPY_MS, COPY_PIXELS |
| paper fills (`erase` ops), the old way (`run.mjs` erase-and-restore, `cut.mjs:17`, `removal.mjs:12-14`), v0's own reading for units the file does not locate whole | crops (from B), kept placeholders (B), keep characters (C) |
| `drawnSource`, K_SLACK, left-canvas copies, `drawn.mjs` capture, ROUND_MAX for foreign canvases | — |

Roughly 2,300–2,800 lines across engine, web and extension (`full` is kept); the count is made at deletion. The outline table (`readOutlines`)
and the `rules` boxes stay only if a consumer other than the swap remains. That is audited at deletion.

### 4.3 Invariants
1. H1. Ink is hidden by groups only.
2. H2. A, B and C use one document, page, k and canvas size. Non-unit ink is pixel-equal across them except on image edges
   (E6: Chromium rasterizes an image's edge depending on what was drawn before it; today's removal moves the same pixels). B
   draws on the same GPU canvas kind as A; there is no CPU fallback.
3. H3. A unit's groups are OFF on p iff it is in D(p).

### 4.4 Failure modes

| Failure | Reader shows |
|---|---|
| a group named in the head's index missing from the config | that unit as the original; warned once |
| render A or B throws or is aborted | the page as the original (`shownOriginal`, `rearm`) |
| host PDF.js ≠ PDFJS | the original; warning `pdfjs` |

### 4.5 Tests
- T4.1 (fake PDF.js): OFF(p) for kept or moved placeholders, labels, names, table groups, and units spanning pages.
- T4.2 (Node PDF.js over S1/sample-1): A equals G2's oracle, and a D(p) change does not call `getOperatorList` (spy).
- T4.3: no `swap` or `erase` op exists anywhere: grep gate plus one runtime assertion.

## 5. Hosts

| | Web | Extension |
|---|---|---|
| Composed document | delta: the original's rangeSource + the delta in memory (`composedRange`); full: `/base/` by ranges; no tails in either | full as today; delta once delta heads are bound (delta.md §15.4c) |
| Container / Worker | the maker child calls `wrapOf`, then `deltaOf(orig, wrapped)`; the full base stored is `wrapped`; no remover child; parts carry no tails | — |
| Shared view | `createLayerSide`: all of §4, once | same module |
| PDF.js | the vendor pin, = PDFJS (X1: the view checks `lib.version`) | the bundled pdfjs-dist, = PDFJS |

## 6. Showing the original (R2: one rule, smallest exact granularity)
- **Unit:** `unhidden` (marks, across, spell, bounds, page) → not drawn. Its ink stays, and the status line counts it untranslated.
- **Page:** refused in §2.4 → unwrapped. With every unit on it `unhidden`, the page is the original's ink: our compile, which
  equals arXiv's on the pixel for 99 of 302 pages and closely elsewhere (delta.md §15).
- **Paper:** with no delta, the paper falls to `full` (wrapped, laid as normal). Only when the base is arXiv's (boxes, marks,
  carry, or `wrap-<code>`) is there no layer. The reader shows arXiv's PDF (the owner's
  2026-10-22 ruling 3). arXiv-base pages are never laid by geometric ownership.
- Tests: T6.1, a unit with ink on a wrapped and a refused page is drawn nowhere (O3). T6.2, an arXiv-base head gives the
  original with no layer request.
- **Amendment (coordinator, GO of 2026-10-28), the `.l` class only:** a unit whose label (`.l`) cannot be owned is NOT shown
  original whole. O3 is relaxed for that class alone: when the unit's TEXT class is owned and the label's ink is disjoint from
  the body's drawing area, the text is hidden, the label stays as the original's ink and only the body is drawn (the layer's
  existing "label kept" reading); the prepare record counts these as `labelKept` (beside `own`, spell hits and `unhidden`).
  Only a unit whose text class is unowned shows the original. The label rule improvement (stream order, §1.1) stays on the
  list, measured per build. T6.3: a unit with an unowned label whose ink is disjoint from the body draws the body only and counts
  `labelKept`; a unit whose label ink overlaps the body's drawing area shows the original.

## 7. The glyph-exact gate (tolerance 0)

### 7.1 Compared
PDF.js 6.3.289 with `isImageDecoderSupported:false`, re-rendered once on a mismatch.

| Gate | Compared | Must be |
|---|---|---|
| G0 structure | §2.2, §2.5 (b)–(d), O1, bounds, no owned run with Tr ≥ 4 | all hold |
| G1 identity | all ON vs our final page | 0 px outside split glyphs' boxes (+1 px) and image edges; inside split boxes ≤ 0.1% of their pixels and max channel Δ ≤ 16 per page (E4 variant a; worst seen 0.07%, Δ13, Node only, 0 in Chromium) |
| G2 exact hiding | one unit's groups OFF vs an oracle of the page without that unit's ink | 0 px under G1's two allowances |
| G3 containment | diff(all ON, unit OFF) vs the unit's ink mask | 0 px outside the mask under G1's allowances; formulas 0 changed |
| G4 toggle | setVisibility on an existing config vs a fresh config | 0 px; no new operator list |
| G5 crop source | B vs "placeholders + non-unit ink" | 0 px |
| G6 pastes | `pastedKeep` per page | counted; 0 on synthetic, reported on the pack |
| G7 ownership | §11 A rerun: identical, `unhidden` by reason, spell refusals | spell refusals ≤ 2% of units; no unit drawn whose spell check failed |

- **Image edges** (E6 ruling): pixels within 1 device px of an image XObject's boundary. They are counted per page and the count
  must EQUAL the one today's removal (the remover's cut, or `3 Tr`) gives on that page, in the same environment. In Node they
  are 0; on H2 in Chromium they are 70 px (GPU) or 60 px (CPU), and equal to the remover's.

Oracles: on synthetic pages, the generator emits the page without unit u's operators, positioned by absolute `Tm`, plus a
`3 Tr` variant. On real pages, u's codes are cut with the kept chunker in cut mode: exact advances, paints → `n`.

### 7.2 CI with no network: the synthetic generator
- Built with @cantoo/pdf-lib, sample-1's Computer Modern Type 1 fonts and a generated Type 3 font. Rendered with pdfjs-dist
  legacy and @napi-rs/canvas at scale 2. The output digest is pinned.
- Cases, with the marks written as `ri` literals so that §1 runs on them:

| Case | Content |
|---|---|
| S1 | 50 units, boundaries at TJ ends |
| S2 | 300 groups |
| S3 | ladder |
| S4 | 5001 doc groups |
| S5 | a form inside a unit range |
| S6 | foreign tagged BDC |
| S7 | an opening alone ending mid-TJ |
| S8 | Type 3 |
| S9 | Tr 7 and vertical (refusals) |
| S10 | foreign OCProperties |
| S11 | owned rules and a clip |
| S12 | a /Contents array, a unit over two streams, q/Q |

- Under 3 MB generated and under 60 s in Vitest. sample-1 runs G0–G5 end to end.

### 7.3 Lab gate (not CI)
- The pack's 7 papers (2602.23285v2 once a layout exists) and the sweep sample. It runs G0–G2 on every replaced page, G3 on up
  to 20 units a page, and G6 and G7, on CPU and GPU canvases.
- G7 answers what v1's §6.4 left open: ownership correctness now has its own gate.

## 8. Browser render-time measurement (staging, before merge)
- Pages:
  - H1 2312.17141v1 p8: most sequences.
  - H2 2602.23285v2 p8: heavy images.
  - H3 2307.16209v1: most groups; its densest page and a 10-page scroll.
  - Control: 2608.16117.
- Harness: Playwright Chromium, production PDF_OPTIONS, dpr 1 and 2, HWA on and off.
- A/B: today's build (swap path) against the new build on the same papers. This is two deployments, not a flag, since there is
  no dual path.
- Go/no-go:
  - cold A ≤ 1.5x page p's;
  - warm and toggled ≤ 1.1x;
  - asked → committed not slower than today at p50 and p95;
  - no new long task on H3;
  - first config ≤ 30 ms per document (E3: 14–24 ms at 5,000–10,000 groups in Chromium);
  - JS heap + canvas ≤ +10 MiB per document on the 147-page thesis in the real reader (E8 ruling, absolute; the harness measured
    +6.0 MiB for 5,263 groups), with no new long task.

## 9. Interactions

| With | Contract |
|---|---|
| Delta | Wrapping is upstream of `deltaOf` (§2.1); the one amendment is the catalog's `/OCProperties` (delta.md §2.5). `base.replaced` = every page our compile changes. Both `delta` and `full` carry wrapped streams |
| Audit 1 (unmarked compile as the reader's page) | Would remove the `ri` literals that make MR boundaries TJ boundaries. It conflicts with §1–2 and is not taken while ownership comes from the marks |
| PDF.js pin | X1. A version move passes G0–G7 in CI and the lab, and §8 on staging, both hosts on one pin |
| Highlight, sync, links, contents | They read the layout file, the parts and the left document. Their (n,k) is the composed page's, the only one there is |
| Text layer (text-layer.md) | Invariant: no `getTextContent` on a wrapped page, because it ignores visibility. The text layer's kept items on a wrapped page come from the layout file and units (text-layer.md §7: `textOf` in the run) for units not in D(p), and from the original's (left) document for ink no unit owns. Hidden units contribute only translated items |
| Download (R5) | Today: the compiled final and arXiv's link. Future (owner's 10-08 decision, download = the instant layer exported): the composed document with drawn units' names re-pointed OFF and the layer appended as one incremental update with our font subsets (§3.3). Now: `/D` all ON and `/Order []` |
| Printing | The DOM is printed (canvas A + SVG). The PDF.js `print` intent is unused; if it is ever used, configs are made with that intent |
| Prefetch (delta.md §16) | Unchanged: one byte source, and the delta is in memory |

## 10. Experiments (slice 0; R6): all GREEN (report `route/ocgx/experiments.md`, coordinator's rulings applied)

The build may start (C4). Each experiment's go/no-go and what it set:

| # | Risk | Result | Go/no-go | Set in the design |
|---|---|---|---|---|
| E1 | browser font path, GPU | S2 and H1 in Node, Chromium GPU and CPU: G1/G2/G3 0 px. Cold, new worker: 1.00–1.15x; shared worker S2 1.43x (frame-quantized), H1 0.97x. Operator list H1 +4%; 800 groups / 2000 sequences +37%, render A 0.99x | **GO** | §3.2 GROUPS_PAGE / SEQUENCES_PAGE kept |
| E2 | nested and foreign OC | S6, S10: G1/G2/G3 0 px in all three environments; ours stays hidden under a foreign OFF group; BaseState OFF does not hide ours listed in `/ON` | **GO** | §3.1 as written |
| E3 | group counts | first config 14 / 24 / 44 / 85 ms (Chromium) at 5,000 / 10,000 / 20,000 / 40,000 groups; later calls 1.4–12.7 ms; about 0.85 KB a group. PDF.js builds a new config per render unless one is passed | **GO** | GROUPS_DOC = 8000; one config per document, kept, unchanged during a render (§4.1) |
| E4 | split drift | variant (a), the remover's chunked split: 0 px outside everywhere; inside 0 in Chromium, ≤ 0.07% and Δ ≤ 13 in Node. (b)/(d) 28–30 px outside in Node; (c) wrong by the spec | **GO** with (a) | G1: 0 px outside, ≤ 0.1% of the box pixels and Δ ≤ 16 inside (§7.1); §2.3 uses (a) only, no re-anchor |
| E5 | Type 3, vertical, CMap | whole TJs 0 px; splits in Type 3, Identity-H and an embedded CMap 0 px outside; a vertical split refused; hiding the only clip run removes the clip (the remover has the same defect) | **GO** | §2.4 refusals kept; G0 checks Tr ≥ 4 |
| E6 | A/B/C paste seam | H1 0 px. H2 (images): 70 px (GPU) / 60 px (CPU) on one image's edges, the same with `3 Tr` or the remover's cut. A CPU canvas is no better and is nondeterministic with the ImageDecoder | **GO** under the ruling | G1–G3 exclude image-edge pixels, counted per page and equal to the remover's (§7.1); the CPU fallback is dropped (H2 invariant) |
| E8 | memory | thesis, 147 pages, every page wrapped, 5,263 groups: +6.0 MiB after GC; render 15.1 → 15.7 ms; main-thread peak 34–36 MiB without config reuse, 17 MiB with it | **GO** under the ruling (absolute budget) | §8: ≤ +10 MiB heap + canvas per document in the real reader, no new long task |
| — | E7 tail growth | dropped: no tails (R1) | — | — |

Two measurements remain for the reader on staging (§8), not blocking the build: E8's budget in the real reader, and the E6
image-edge equality on the pack's image pages.

## 10a. Final estimate (days, one engineer per lane; at least 0.5 d of review per PR not counted)

| Work | Engine | Web | Ext. |
|---|---|---|---|
| §1 ownership by marks in the maker child (MR 1–8 with 2a and the stream-order `.l`), spell check and its record stat, I1 | 3 | — | — |
| §2 `wrapOf`: lexer and chunker reuse, W1–W6, split variant (a), refusals with Tr ≥ 4, deterministic deflate, `appendSection`, proof (b)–(e) on both forms | 4 | — | — |
| §2.7 the forms: full base = `wrapped`, delta carries `/OCProperties` and the (d) check | 0.5 | — | — |
| §3 `/OCProperties`, ladder (GROUPS_DOC 8000), head stats | 1 | — | — |
| §4 reader: OFF(p), one config per document with a serialized render queue, renders A/B/C, pastes, commit and redraw, X1 | 3 | — | — |
| View: sourceOf over the composed page; drop drawnSource/K_SLACK/capture | 1 | — | — |
| §4.2 deletions: remover, add-on, chain, tails, swap, fills, old way, capture (`full` kept) | 2.5 | 1 | 0.5 |
| §7 generator S1–S12, G0–G7 (with the E4 bound and image-edge counting) in Vitest, sample-1 end to end, lab pack run | 3 | — | — |
| Hosts: container wiring (maker child → `wrapOf` → `deltaOf`/full store, no remover child), Worker (no tails), reader (`composedRange` without tails; full by ranges), e2e rows (wrapped delta, wrapped full, unhidden unit, refused page, arXiv base), regenerated sample bundle | — | 2.5 | 1 |
| Extension: pin, delta heads bound (delta.md §15.4c), e2e rows for both forms | — | — | 1.5 |
| §8 staging measurement (E8 budget and E6 image edges in the real reader) | 1 | 0.5 | — |
| **Total** | **19** | **4** | **3** |

- **Prerequisites (not counted):** #440 merged and the pin cut (C3); experiments green (done, §10). The §1.6 marker coverage is
  on the engine lane's next LAYOUT bump. It is a dependency for the "0 spell hits on the pack" acceptance, not for merge.
- **Critical path (about 20 working days from the pin):**
  1. §1 ownership and the spell check (3 d);
  2. §2 `wrapOf`, the forms and the proof (4.5 d);
  3. §3 (1 d);
  4. §4 reader (3 d; the view and the generator alongside, same engineer: +4 d);
  5. lab gate G7 (1 d);
  6. deletions (2.5 d);
  7. engine pin → web hosts (2.5 d) and the extension (2.5 d) in parallel, on stacked branches (§10b);
  8. staging §8 (1 d).
- The deletions are on the path because R2 forbids a dual-path period: the build that ships is the one without the old
  machinery. The calendar total is about 22 working days, with the web and extension lanes starting their own parts (fixtures,
  e2e scaffolding) before the engine pin.

## 10b. Sequencing and file ownership (C3)

**Sequencing.**
1. The build starts after #440 merges and the engine pin is cut.
2. Each lane works on a stacked branch off `next` and rebases at each merge.
3. Order of merge: the pipeline lane's erasure branch first, since it is the larger and the reader's base, then the web lane's
   prefetch and text-layer branches rebased on it. The two lanes do not edit the same function in one PR window.

**Pipeline lane owns** (erasure: swap, paper fills, drawnSource, K_SLACK, capture, removal; and everything §1–§4 adds). Files
found by grep in the route-delta engine and the web repo's delta-web worktree:
- **engine/layout/:** `own.mjs` (new), `wrap.mjs` (new), `delta.mjs`, `remove.mjs`, `addon.mjs`, `addon-manifest.mjs`,
  `chain.mjs`, `chain-wire.mjs`, `tail.mjs`, `make.mjs` (the call), `stream.mjs`.
- **engine/layer/:** `swap.mjs`, `check.mjs`.
- **engine/layer-proto/:** `removal.mjs`, `cut.mjs`, `format.mjs` (part tails), `reader.mjs`, `layer2.mjs`, `links.mjs`,
  `check.mjs`, `tex.mjs`, `bundle.mjs`, `facade.mjs` (removal and erase uses), and `run.mjs`: renders A/B/C, erase-and-restore,
  the commit.
- **engine/view/:** `drawn.mjs` (capture), `layer-side.mjs` (drawnSource, K_SLACK, the copy path), `lighting.mjs`
  (scaleOf/drawing uses).
- **pipeline:** `pipeline/page-pass.mjs` (tails out, wrapped bytes in).
- **web:** `container/` (maker child → `wrapOf`/`deltaOf`; no remover child), `worker/src/layer/*` (no tails, TAIL_CAP gone),
  `web/src/layer/index.ts` (the removal and erase uses), `web/src/layer/transport.ts` and `web/src/ranges.ts` (`composedRange`
  without tails).
- **extension:** `session/run.ts` (renders), `session/base.ts` (delta binding).

**Web lane owns** (prefetch and the unified text layer):
- **prefetch:** `web/src/ranges.ts` (priority gate, prefetch wrapper), `web/src/session/run.mjs` (idle hooks); extension
  `session/ranges.ts` and `session/run.ts`.
- **text layer:** `web/src/layer/door.ts` (host DOM from `textOf`); `engine/view/places.mjs` and `view/reader-view.mjs` (the
  page's DOM slot, `textLayerMode`); `engine/layer-proto/run.mjs` `textOf` (text-layer.md §7: the engine lane writes it, the web
  lane hosts it).

**Known overlaps** (each change goes through the lane named first; the other reviews):

| File | Pipeline lane's part | Web lane's part | Rule |
|---|---|---|---|
| `engine/view/layer-side.mjs` | drawnSource, K_SLACK, copy path deleted; renders wired | `noLayoutPage` / `originalPageOf` (prefetch's idle test and text-layer "original" pages read them) | pipeline first; `noLayoutPage` keeps its signature |
| `engine/layer-proto/run.mjs` | renders A/B/C, commit, deleted erase-and-restore | `textOf`; the `prefetched` pixel-task path (~2458) | pipeline first; `textOf` reads the layout file (§9) and never `getTextContent` on a wrapped page |
| `engine/view/places.mjs`, `view/reader-view.mjs` | place content as laid (A + SVG) | text-layer DOM slot | `swap(n, …)` in places.mjs is the place's content swap, not the erasure swap, and stays |
| `web/src/ranges.ts` (+ extension `session/ranges.ts`) | `composedRange` without tails | priority gate and prefetch wrapper | web lane first (prefetch is planned before); pipeline rebases |
| `session/run.ts` (extension), `web/src/session/run.mjs` | renders and host wiring | idle hooks, text-layer hosting | split by function; one PR per lane per merge window |

Name collisions that are not erasure: the panes' "swapped" preference (`session/host.ts`, `web/src/session/run.mjs`) and
`web/src/session/swaps.ts` (layer states).

## 11. The two numbers

### A. Marks-only ownership vs today's, on the gate pack (zh fixtures, 7 papers)

**Method.**
- `own.mjs` reads each fixture's `base.pdf` (our final pass, marks included) with the engine's `pageInk(…, { indices: true })`.
  That is the PDF.js operator list in content-stream order, with forms inlined; it is the order the remover's `alignOf` maps
  onto `lex`.
- Today's ownership: `pagePlan(indexLayout(layout.json), p, ink)`, i.e. `fileOwnership`'s owner plus labels. These are the
  glyphs the remover removes per unit.
- `cmp2.mjs` applies MR (§1.1, rules 1–5) and compares the two per unit as glyph sets (page, n, k).
- A display's ink is `.p` in both readings (kept), so it is not counted as a difference.
- Not measured: 2602.23285v2. The pack has no layout file for it, so there is no today to compare with; its marks exist in the
  spike's composed.pdf.

| Paper | Units | Identical | Differ | Glyphs owned today |
|---|---:|---:|---:|---:|
| 1512.03385v1 | 319 | 314 | 5 | 40,355 |
| 1706.03762v7 | 175 | 167 | 8 | 24,986 |
| 1810.04805v2 | 278 | 274 | 4 | 41,482 |
| 2307.16209v1 | 464 | 454 | 10 | 173,902 |
| 2608.04322v1 | 311 | 308 | 3 | 42,758 |
| 2608.16117v1 | 121 | 110 | 11 | 57,823 |
| 2609.26457v1 | 134 | 125 | 9 | 45,349 |
| **Total** | **1,802** | **1,752 (97.2%)** | **50** | **426,655** |

By kind, identical/units:

| Kind | Identical/units |
|---|---|
| para | 746/766 |
| cell | 589/593 |
| heading | 205/209 |
| caption | 155/159 |
| footnote | 50/54 |
| abstract | 6/6 |
| theorem | 1/1 |
| author | 0/14 |

| # | Class of difference | Units | Glyphs | Example | Marks right? | Design |
|---|---|---:|---:|---|---|---|
| 1 | no marks: title-block authors (14), `\thanks` footnotes (3) | 17 | 1,393 | 1706 u2 footnote (782), u3 author (140) | cannot delimit | original (`marks`) |
| 2 | footnote continued over a page: outside-body region, unbracketed | 1 | 147 | 1810 u31 (p3 → p4) | cannot | original (`across`) |
| 3 | label not on the start's line or not adjacent: subfigure "(a)"/"(b)", "Appendix", a cell label | 4 | 17 | 2608.16117 u81 "(a)", 1512 u281 "LOC" | cannot | original (`spell`) |
| 4 | label rule takes a neighbour's ink on the start's line: an untranslated cell, figure text | 6 | 24 | 1512 u48 cell takes "2 1 1 ×"; 2609 u96 caption takes "\|8er" | wrong | caught by the spell check → original |
| 5 | end-only title takes the line before it (journal header) | 1 | 35 | 2608.04322 u0 takes "JOUR…" | wrong | spell check → original |
| 6 | marks take punctuation, symbols or a word that today's geometry gives no one | 20 | 135 | 1512 u181 "@ ="; 1706 u33 "." after a display | marks right (residue today) | no action; G7 confirms |
| 7 | figure-internal text in a form XObject given to a heading by geometry | 1 | 16 | 1706 u172 "Input-Input Layer5" | marks right (today wrong) | no action |

- **Share that marks alone cannot delimit, or delimit wrongly:** classes 1–5, 29 units = 1.6% of units (1,616 glyphs = 0.38%).
  Of these, 22 units (1.2%) have no marks for that ink (classes 1–3), and 7 (0.4%) are rule over-takes (classes 4–5) that the
  spell check turns into "original". Under R2 those 29 units show the original. The visible loss is the author block and
  `\thanks` notes on 6 of 7 papers, one split footnote, and four labels' units.
- **C1 re-measure** (`ocgrev/cmp3.mjs`, rule 2a on; the label rule as v2's (L2) and as stream order (L3, MR 5); per-unit
  diffs in `ocgrev/dL2.txt` and `dL3.txt`):

| | L2 + 2a | L3 + 2a (MR 5) |
|---|---:|---:|
| identical units | 1,753 | 1,753 |
| class 2: footnote over a page | 0 (rule 2a fixed 1810 u31) | 0 |
| class 3: label not adjacent | 4 | 1 (1512 u281 "LOC"); 2608.16117 u81/u82 "(a)"/"(b)" fixed; u108 "Appendix" is a babel name, owned by its `n<occ>` group (today calls it the heading's label) |
| class 4: neighbour's ink on the baseline | 6 | 8 (the same 6, plus 2307.16209 u332, u397: cells, +1 glyph each) |
| class 5: end-only title over-take | 1 | 1 |

  - Of the 11 label cases (classes 3–5), stream order fixes 2 outright and resolves 1 as a name group. 8 remain: 1 off-line
    label and 7 over-takes, plus 2 new 1-glyph cell over-takes.
  - A first L3 that did not skip placeholder and name ranges took a neighbouring cell's trailing cite and the "Abstract" and
    "Appendix" names: 1,704 identical, 115 conflicts. The skips in MR 5 are required.
  - Remaining after C1: 17 units (unmarked, §1.6), 1 off-line label, 9 over-takes (classes 4–5). That is 27 units, 1.5%. After
    §1.6 lands, 10 (0.55%), all caught by the spell check.

- **Floats, forms, display math, inline placeholders, table cells:**
  - Of 15,468 `/axt… ri` marks, none lies inside a form XObject.
  - 10,287 glyphs inside forms (figures) are no unit's under marks (one is a unit's today, class 7).
  - Float brackets (`fs`/`fe`) delimit captions exactly: 155/159 identical, the rest class 3.
  - Inline placeholders and their trailing cites (a cell's "[18]" after its end mark) are owned by their `p<id>.<j>` names,
    wherever they lie.
  - Of 650 placeholders with an opening mark alone (displays, calls), 52 run onto a later page. They are bounded by
    stream.mjs's ownedOf (rule 4), which matches today on every one.
  - Cells: 589/593 identical.
- **Rules (painted paths):**
  - Every rule today's plan gives a unit (84) lies inside that unit's marks: 0 missing.
  - The marks enclose 1,132 further horizontal rules that today's plan leaves standing. 276 of them are inside display
    placeholders (`.p`, kept); 856 are in text ranges (2307.16209: 773, 2608.16117: 82, 2609.26457: 1), most likely inline
    fraction bars and underlines.
  - These 856 are not verified one by one: G3 and G7 decide them on the pack before merge.
- **Not hand-checked:** class 6 is believed to be today's residue. G7 confirms it.

### B. Laid pages on an arXiv base

- **Staging now (2026-10-23, the 53 sweep papers, both CTAGs, at most 1 request per 3 s, project UA; log
  `route/ocgrev/api/log.txt`):** 3 catalogs are served, all under `b8-j6.3.289` and all of **image set 4**. All 3 have an ours
  base (`kind` absent, so full; no delta head yet):

| Paper | Pages | Base |
|---|---:|---|
| 2610.11256v1 | 42 | ours |
| 2610.19860v1 | 19 | ours (was arXiv, `marks`, on 10-22: fixed) |
| 2610.21765v1 | 14 | ours |

  So on staging today, 75 pages are laid on ours and **0 on arXiv**. The other 50 papers answer `b8` 404 `not-prepared`. All
  53 answer `b7` (the sweep's CTAG) 404 `unknown-versions`: no image-set-3 catalog is served any more.
- **The sweep's own catalogs** (2026-10-22, read by the sweep under CTAG b7-j6.3.289 and cached in
  `readarxiv-web-wt/sweep/sweep-data/cache/papers/*/catalog.json`; all of image set 3, catalog bundle 8, `versions.image = '3'`):

| Base source | Papers | Pages laid |
|---|---:|---:|
| ours (kind absent = full) | 50 | 1,367 (95.5%) |
| arXiv | 3 | 64 (4.5%) |

- The arXiv-base three:

| Paper | Pages | Why |
|---|---:|---|
| 2610.20030v1 | 12 | boxes |
| 2610.20581v1 | 33 | boxes |
| 2610.19860v1 | 19 | marks |

  They match the previous summary and are said to be fixed since; staging could not confirm this today.
- **Reading:** today's staging state shows 0 arXiv-base pages, and one of the three earlier cases is confirmed fixed. The
  other two (2610.20030, 2610.20581: `boxes`) are not prepared on staging, so their fix cannot be confirmed there.
  The sweep's 4.5% is the last full measurement.
- Under R2 any arXiv-base page shows the original, so this share is lost to the layer outright. The next sweep reports it per
  `why`.

### C. The full-fallback class: delta refused or over 35% (C2, for the record)
- **Sweep originals' engines** (53 papers; 2 range reads each, at most 1 request per 3 s, project UA; `ocgrev/orig/`). Every
  arXiv PDF is rewritten by arXiv (Producer `pikepdf 8.15.1`, Creator `arXiv GenPDF`), so the engine was read from the bytes:
  51 show pdfTeX (`PTEX.Fullbanner`), and 2 show none (1810.04805v2, whose range held no Info; 2610.21765v1).
- **TL banner survey** (a one-off survey of this session (not kept), 187 papers): 171 TL 2025, 2 TL 2023, 14 no banner (7.5%). The
  no-banner papers are the latex (dvips/dvipdfmx), xelatex and lualatex candidates.
- **deltaOf on real non-pack pairs** (staging's only three catalogs, image set 4; the original and the base fetched, base sha256
  verified; `ocgrev/runDelta.mjs`):

| Paper | Engine (arXiv's) | Original | Our base | Delta | Share of base | Result |
|---|---|---:|---:|---:|---:|---|
| 2610.19860v1 | pdfTeX | 616,661 | 637,368 | 147,887 | 23.2% | delta |
| 2610.11256v1 | pdfTeX | 635,541 | 677,808 | (349,515) | 51.6% | refused `delta-bound`: full |
| 2610.21765v1 | dvips + Ghostscript (36 FontFile3, no pdfTeX trace) | 588,602 | 513,786 | (508,984) | 99.1% | refused: full |

- **Reading:**
  - A dvips paper shares nothing with our compile, as delta.md §3 predicted (fonts differ in kind), so every latex, xelatex
    and lualatex paper will be `full`. The survey puts that class at about 7.5% of papers.
  - A pdfTeX paper can also fall to `full` when arXiv's subsets differ from ours; 2610.11256 is light (0.6 MB), so it falls
    under the 35% rule.
  - Over the 8 pack pairs plus these 3, 2 of 11 are `full` (18%).
  - Estimate: `full` ≈ 7.5% (non-pdfTeX) + a pdfTeX share that this sample cannot size, between 0 and 1 in 3 light papers;
    plausibly 10–20% of papers. That is why C2 keeps `full`.
- Not done: 4–6 non-pdfTeX pairs. Staging serves bases only for prepared papers, and only these three are prepared now.
  Preparing more would need a POST, which this read-only task does not make. The next sweep (after redeploy) should report
  `base.kind` per paper.

## 12. For the owner
- Q4 (option, a UI change, not in this project): a per-unit "show original" (press or hover). It becomes nearly free: groups
  ON plus the SVG removed. Cleaner formula crops come anyway, since B holds no text.
- Visible changes from R2:
  - the author block and `\thanks` notes stay English (class 1);
  - a paper whose delta or marks fail shows arXiv's PDF;
  - no slivers anywhere.
- The later options of §1.4 would win back class 1 and class 2 with TeX marks (`\maketitle`, footnote area).
