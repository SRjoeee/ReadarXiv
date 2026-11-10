// The registry (interfaces/page/design-b.md §1.1): every rule of today's typesetting with one named home, the inventory rows
// it is the one home of (interfaces/typeset-inputs.md: A1…G17, T1…T39, §3.x; "1F:<field>" a field of its §1F), the code it
// ports (engine 065c1d973, `src/pdf-reader/engine/`: L2 layer-proto/layer2.mjs, RUN layer-proto/run.mjs, TEX layer-proto/tex.mjs,
// other files by name), and its state. Data only. Rule ids and step names are a persisted vocabulary: the gate's ledgers and
// the tap (baseline/tap/) are kept in lab-data and read across versions, so an id is never renamed; a rule split in two
// keeps its parent's id in `parent`.
import type { Home, RuleId, Step } from './types.ts'

/**
 * Where a rule stands in the port. `open`: not ported yet. `ported`: the same function, typed, inputs made explicit, its
 * replay equal to today's recorded output on every sampled case (`replay`: the tap's sample it is replayed from and the
 * cases). `void`: no counterpart, the inventory classes it as a guard of a re-derivation the stated fact makes void (`why`).
 * `changed`: ported with a difference, listed with its cause (`why`). `elsewhere`: a fact the prepare states (lane L1's
 * `packages/engine`), registered here so that every row of the inventory has one home
 */
export type RuleState =
  | { is: 'open' }
  | { is: 'ported'; replay: string; cases: number }
  | { is: 'void'; why: string }
  | { is: 'changed'; why: string; replay: string; cases: number }
  | { is: 'elsewhere'; lane: 'L1' }

export type RuleSpec = {
  id: RuleId
  home: Home
  /** the step of design-b's fixed order (§1.6) it is applied at */
  step: Step | 'prepare' | 'E1'
  /** the inventory rows and decisions it is the one home of */
  owns: readonly string[]
  /** today's code it carries */
  ports: readonly string[]
  /** 'ported': the same function, typed; 'moved': the same rule run by the prepare on A; 'replaced': a stated fact stands in */
  how: 'ported' | 'moved' | 'replaced'
  /** the owner's ruling it carries (inventory §4.3), by date */
  ruling?: string
  /** the Rules fields and constants it reads */
  reads: readonly string[]
  /** the file it lives in, under packages/typeset/src, once ported. A `.mjs` file is today's code moved as it is, its
   *  inputs made explicit (lab/typeset/move-fit.mjs lists every change), typed by the `.types.ts` beside it: its TypeScript
   *  port is still to come, held by the same replay */
  file?: string
  parent?: RuleId
  state: RuleState
}

const L1 = { is: 'elsewhere', lane: 'L1' } as const

const SPECS: readonly RuleSpec[] = [
  // ---------------------------------------------------------------- the unit's rules (step L1, L5, L6)
  {
    id: 'U.admit',
    home: 'unit',
    step: 'L1',
    owns: ['T1', 'T2', 'T4', 'T18', 'A9', 'B19', 'B26', '1F:refused'],
    ports: [
      'RUN:844 translated',
      'RUN:1173-1188 shapely, refusalOf',
      'RUN:1196-1218 decide',
      'RUN:827-831 judge',
      'TEX:35-46 kOfPieces',
      'TEX:66-80 locatedWhole',
      'RUN:834-843 placeByFile (pages, cut)',
      'RUN:737 unhiddenOf',
      'RUN:854 unanchoredOf',
      'RUN:3104 account',
    ],
    how: 'ported',
    reads: ['N (the last page shown)'],
    file: 'unit/admit.ts',
    state: { is: 'ported', replay: 'samples/U.admit.json.gz and lanes/L3/replay/U.admit.json.gz', cases: 27 },
  },
  {
    id: 'U.elements',
    home: 'unit',
    step: 'L5',
    owns: ['D2', '1F:prep'],
    ports: [
      'L2:1382-1465 resolvePlaceholders (the translation half)',
      'L2:1062 placeholdersOf',
      "TEX:404-435 cropsOf (the translation half: which resolution, in the row's order)",
      'L2:1018-1048 prepareUnit (the order of its parts)',
    ],
    how: 'ported',
    reads: [],
    file: 'unit/elements.ts',
    state: { is: 'ported', replay: 'every sampled reading with lanes/L3/replay/U.elements.json.gz', cases: 101 },
  },
  {
    id: 'U.leadMark',
    home: 'unit',
    step: 'L5',
    owns: ['T11'],
    ports: [
      'L2:1405 the first placeholder with nothing visible before it (the row half; leadMark L2:2029 is the page half, El.leads)',
    ],
    how: 'ported',
    reads: [],
    file: 'unit/elements.ts',
    parent: 'U.elements',
    state: { is: 'ported', replay: 'every sampled reading with lanes/L3/replay/U.elements.json.gz', cases: 101 },
  },
  {
    id: 'U.brackets',
    home: 'unit',
    step: 'L5',
    owns: ['T12'],
    ports: [
      'L2:1943-1956 bracketed',
      'L2:1413-1419, 1446-1457 its two uses (the inner rendering: unbracketed L2:1365 is the page half, El.brackets)',
    ],
    how: 'ported',
    reads: [],
    file: 'unit/elements.ts',
    parent: 'U.elements',
    state: { is: 'ported', replay: 'every sampled reading with lanes/L3/replay/U.elements.json.gz', cases: 101 },
  },
  {
    id: 'U.render',
    home: 'unit',
    step: 'L5',
    owns: ['D9'],
    ports: [
      'L2:1392-1440 each mode by its class and its stated rendering (drawnAs L2:1757 is the page half: El.text, El.ink, El.style)',
      'L2:1458-1464 a macro learnt by its rendering',
    ],
    how: 'ported',
    reads: [],
    file: 'unit/elements.ts',
    parent: 'U.elements',
    state: { is: 'ported', replay: 'every sampled reading with lanes/L3/replay/U.elements.json.gz', cases: 101 },
  },
  {
    id: 'U.rename',
    home: 'unit',
    step: 'L5',
    owns: ['T15', 'D12', 'A6'],
    ports: [
      'L2:1289-1306 renameRefs',
      'L2:1266 nameOfRow',
      'RUN:2026',
      'rules/tex-names.mjs:74-140 refName, conjunctionOf, refInTarget',
    ],
    how: 'ported',
    reads: ['words', "the packages' names (rules/tex-names.json, a data file of Rules)"],
    file: 'unit/rename.ts',
    state: {
      is: 'ported',
      replay:
        "samples/U.rename.json.gz (6) and the ledger's U.rename slot on every other sampled reading of its pairs (38)",
      cases: 44,
    },
  },
  {
    id: 'U.label',
    home: 'unit',
    step: 'L5',
    owns: ['T26', 'T27', 'E3', 'C10:drawn'],
    ports: [
      'L2:1184-1195 labelInTarget',
      'L2:1245-1259 headLabelInTarget',
      'L2:1230 spacedText',
      'RUN:740 relabels',
      'RUN:744-752 headOf',
      'RUN:2029-2042',
    ],
    how: 'ported',
    ruling: "2026-11-08 a figure's and a table's label in one form a paper, by its float's type",
    reads: [
      'words',
      'captions',
      "the target's head names (Rules.heads: data/rules/heads.ts, from rules/tex-names.json)",
      "the paper's own names (Part.paper.names, their rows: ownNamesOf)",
    ],
    file: 'unit/label.ts',
    state: {
      is: 'changed',
      why: "a caption whose part states its float's type (Label.float) is relabelled by the type, its number as printed (today's spelling of the name and the number read only where no type is stated): 'Table A1', 'Figure S3' relabelled beside 'Table 1', an algorithm's label kept",
      replay: "samples/U.label.json.gz (+ today's rules/tex-names.json); tests/unit/label-float.test.ts",
      cases: 15,
    },
  },
  {
    id: 'U.lead',
    home: 'unit',
    step: 'L5',
    owns: ['T29', 'E4', 'C25'],
    ports: ['RUN:2047-2072', 'RUN:1841-1847 unlead', 'L2:2912 styleOfChars'],
    how: 'ported',
    reads: ['words', "the paper's serif design (A3)"],
    file: 'unit/lead.ts',
    state: { is: 'ported', replay: "samples/U.lead.json.gz (+ the ledger's U.lead slot)", cases: 10 },
  },
  {
    id: 'U.marks',
    home: 'unit',
    step: 'L5',
    owns: ['T16', 'T17'],
    ports: ['L2:2666-2680', 'L2:2379 droppedHeld', 'L2:2363 markKind', 'L2:2773-2778', 'L2:2845-2878'],
    how: 'ported',
    reads: ['breaking.noStart'],
    file: 'unit/marks.ts',
    state: {
      is: 'ported',
      replay: "every sampled round of tokensOf2 (U.marks' and B.tokens' samples) against the ledger's U.marks slot",
      cases: 50,
    },
  },
  {
    id: 'U.breaks',
    home: 'unit',
    step: 'L5',
    owns: ['T19', 'T20', 'C14', 'C15', 'C16', 'C17', 'C18', 'C12:referenced'],
    ports: [
      'TEX:120-199 forcedBreaks',
      'TEX:222-255 paragraphBreaks',
      'TEX:515-531 measureOfLine, parts.breaks',
      "L2:1484-1525 finishUnit's maps (regionOf, breakAt, joinAt, paraAt, referenced, openBreaks; region, brk, room, brkAt)",
      'break-room.mjs pitchOf, roomOf, naturalOf',
    ],
    how: 'ported',
    reads: [
      'k.SHORT 0.5 em (a guard: TeX states the line a break ends, A.El.ends)',
      "Placed.lead (TeX's \\baselineskip, where the part states it)",
    ],
    file: 'unit/breaks.ts',
    state: {
      is: 'changed',
      why: "a forced break's frame pitch (its next line's, the grid's `joinAt`) is TeX's \\baselineskip where the part states it (Placed.lead with no 'lead' read), not the median of the frame's other gaps, which a gap TeX's \\lineskip rule opened under a tall line passes for one; the engine reads the break's room (El.ends) against the same pitch. A part that states none reads as today",
      replay: 'samples/U.breaks.json.gz (+ every sampled reading) and lanes/L3/replay/U.breaks.json.gz',
      cases: 101,
    },
  },
  {
    id: 'U.blocks',
    home: 'unit',
    step: 'L6',
    owns: ['T21', 'E10', 'E11', '1F:blocks'],
    ports: [
      'L2:2966-3032 blocks2',
      'L2:626-695 blocksOf2',
      'L2:549-576 measuresOf',
      'L2:3172-3176 evenGridOf',
      'L2:3037-3040 tightOf',
    ],
    how: 'ported',
    ruling: "2026-10-29 the even grid (lane B's B1)",
    reads: [
      "lineskip (TeX's log)",
      "Placed.lead (TeX's \\baselineskip, where the part states it)",
      'k.STEP_EM 2, k.MEASURE_TOL 0.5 (guards: TeX states the measure, Line m0..m1)',
    ],
    file: 'unit/blocks.ts',
    state: {
      is: 'changed',
      why: "a block's pitch is TeX's \\baselineskip where the part states it (Placed.lead with no 'lead' read: LINES_TEX's AXT-LINES as its paragraph ends), every block's of the unit, a single line's too, where none of its gaps is under it; today's read the upper median of its gaps, which a gap TeX's \\lineskip rule opened under a tall line passes for one (2602.23285v2-ja p4 t29: gaps 10.96 and 12.24, read 12.24): the even grid kept that gap where the translation set the tall line elsewhere, the push of its own tall line was added to it, and the paragraph's last line fell past TeX's text block bottom and it shrank. A part that states none reads as today: the replay's samples are unchanged",
      replay: 'samples/U.blocks.json.gz',
      cases: 36,
    },
  },
  {
    id: 'U.decor',
    home: 'unit',
    step: 'L6',
    owns: ['T30', 'E9', 'E12', 'E13', 'E14', 'E15', 'E16', 'E17', 'E22'],
    ports: [
      'RUN:2101-2137',
      "RUN:2225-2238 the carried label's crop token",
      'L2:3048-3056 shortSkipsTo',
      'RUN:1576-1587 widen (its room: Room.side)',
      'RUN:1596-1607 keptAfter (Placed.join kept)',
      'L2:4316 originalLines',
    ],
    how: 'ported',
    reads: [],
    file: 'unit/decor.ts',
    state: {
      is: 'ported',
      replay:
        "samples/U.decor.json.gz: its blocks by U.blocks' port, each widened line's room read from the captured page (the crop's baseline the reading's: within the line)",
      cases: 39,
    },
  },
  {
    id: 'U.params',
    home: 'unit',
    step: 'L6',
    owns: ['E6', 'E7', 'E23', 'E24', '1F:clear', '1F:s', '1F:P'],
    ports: [
      'RUN:2088-2089 s, base',
      'L2:796-803 unitSizeOf',
      'RUN:2244-2251 P',
      'L2:3073-3079 leadOf',
      'RUN:1822-1826 cjkAdvance',
      'RUN:1638-1672 edgesOf (its facts: Room.next, Line PINNED)',
      'RUN:1673-1675 clearanceOf',
      'L2:352-380 cellBands',
    ],
    how: 'ported',
    ruling: '2026-10-24 CJK_CAPS_SIZE 1',
    reads: ['fit.leadBase', 'cells.clear', 'cells.capMin', 'k.SOLID 1.25'],
    file: 'unit/params.ts',
    state: {
      is: 'ported',
      replay:
        "samples/U.params.json.gz (27: P, clear, fillable; its edges read from the captured page) and every sampled reading's s and base against the ledger's U.params slot (98)",
      cases: 125,
    },
  },
  // ---------------------------------------------------------------- the breaker (L7, inside the fit)
  {
    id: 'B.tokens',
    home: 'breaker',
    step: 'L7',
    owns: ['T39', 'E21', '1F:tokens'],
    ports: [
      'L2:2524-2890 tokensOf2',
      'L2:2406 glueOf',
      'L2:2472 caseRuns',
      'L2:2454 upperOf',
      'L2:2487 smallCapsAt',
      'no-start.mjs',
      'hyph.mjs',
    ],
    file: 'breaker/tokens.ts',
    how: 'ported',
    ruling:
      "2026-11-10 no space beside a full-width mark's blank side (xeCJK's rule; the owner's staging case 2611.03953v2-zh)",
    reads: ['breaking.*', 'fit.autospace', 'fit.compressMax', 'words'],
    state: {
      is: 'changed',
      why: "a space after a full-width closing mark or before an opening mark (a mark of the CJK blocks, or a curly quote the target sets in its CJK face) is not set, whatever stands on the mark's other side: the mark carries its white, and a translator's space beside it doubled it (2611.03953v2-zh's references, every name followed by U+FF0C and a space: about 1 em of white where the original's comma and space held 0.3 em). Today's set it unless a CJK character stood on both sides. The replays read today's tokens through the ruling (tests/replay/tap.ts markSpaced): 1 of the 42 sampled rounds, 3 spaces; U.marks' 2 of 50, 4. And a mark's class (`punct`) is set only where the mark is full-width by that definition: a curly quote an alphabet's target sets in its Latin face, proportional, gets none, and no blank half of it hangs past a line's end (today's hung it half an em past the measure: 1810.04805v2-es p8 t155); tap.ts quotesUnmarked: 3 rounds, 10 quotes",
      replay:
        "samples/B.tokens.json.gz with lanes/L3/replay/B.tokens.json.gz, its faces B.faces' port's, today's tokens read through markSpaced; tests/unit/mark-space.test.ts",
      cases: 42,
    },
  },
  {
    id: 'B.faces',
    home: 'breaker',
    step: 'L7',
    owns: ['G2', 'A4'],
    ports: [
      'fonts.mjs:388 faceOf, :89-100 roleFaceOf, :83 CJK_SLANT_DEG',
      'rules/font-roles.mjs:340 rolesFor, :432 faceFor, :403 styled, :386 alphabetOf, :418 capsLetters, :423 ownSmallCaps',
      'rules/font-letters.mjs HOLDS, SMCP (data/faces.ts)',
    ],
    how: 'ported',
    ruling: "2026-10-06 faces are the role table's only",
    reads: ['faces'],
    file: 'breaker/faces.ts',
    state: {
      is: 'ported',
      replay:
        "every face faceOf gave the sampled rounds of tokensOf2 (lanes/L3/replay/B.tokens.json.gz faces); B.tokens' replay now sets its tokens in B.faces' port",
      cases: 50,
    },
  },
  {
    id: 'B.cover',
    home: 'breaker',
    step: 'L7',
    owns: ['T3', 'A8'],
    ports: ['RUN:2203-2207 FS.check(runsOfTokens(tokens))', 'fonts.mjs:314-325 runsOfTokens'],
    how: 'ported',
    reads: [],
    file: 'breaker/cover.ts',
    state: {
      is: 'ported',
      replay:
        "samples/B.tokens.json.gz: every sampled round's runs over its pair's table ({ ok: true }, its slot); `served` (3 units of the corpus) needs the served slices' coverage, which the tap does not record: synthetic",
      cases: 42,
    },
  },
  {
    id: 'B.measure',
    home: 'breaker',
    step: 'L7',
    owns: ['1F:tokens:w100'],
    ports: ['L2:2899-2907 measureTokens', 'L2:2303 w100', 'L2:2319 ink100', 'L2:2347 inkRight100'],
    file: 'breaker/measure.ts',
    how: 'ported',
    reads: [],
    state: { is: 'ported', replay: "samples/B.tokens.json.gz, the pair's metrics table", cases: 42 },
  },
  {
    id: 'B.slots',
    home: 'breaker',
    step: 'F2',
    owns: [],
    ports: [
      'L2:3206-3281 slotsAt',
      'L2:3137-3148 footFloorAt',
      'L2:3190 texRoomOf',
      'L2:597-610 flowMeasureAt',
      'L2:3061 inFlow',
    ],
    how: 'ported',
    ruling:
      "2026-11-08 the gap under a paragraph its own leading's alone; 2026-11-10 a borrowing paragraph's gap from the borrow's limit",
    reads: ['fit.borrow', 'tex.predisplay', 'k.SHORT_SKIP 0.3', 'Room.stays'],
    file: 'breaker/slots.mjs',
    state: {
      is: 'changed',
      why: "a slot whose reach (SHORT_SKIP under its baseline to an em over it) meets ink that stays beside the unit's lines, no member's (Room.stays: amsthm's QED box after a proof's last words, 2610.40645v1-ja p12 t80 and p31 t260), keeps half an em off it, borrowed or not; today's slots ran across the block's hull and a ragged last line missed such ink by its shortness alone. And the owner's ruling of 2026-11-08 on the gap, chosen on a preview of two rules: footFloorAt holds the gap under a paragraph to its own leading alone, where today's held it to the larger of its own and the next paragraph's (the page fill's `next`), which pulled a paragraph whose translation nearly fills its block under the leading its own block allows (1810.04805v2 p8 t156 1.08 among 1.38-1.5, its own 1.14; 229 of 3,900 units of the 22 parity pairs, 228 looser by a median 0.02). The same floor under each paragraph TeX states inside a unit (paraFloorAt: a block whose next opens a paragraph in its column), at that paragraph's own leading (the owner's comment #9 on 2608.25210v2 p3: each paragraph of a unit filled at its own, S.fill.leads); today's held the unit's last alone. And a state that borrows TeX's room under a paragraph (floorOver, the owner's of 2026-11-10, option (i)) has the gap measured from the borrow's limit, its last line down to (L - 1) pitches over it, where today's held it from TeX's last line: a reference that needs every line of its own stood at the original's pitch among entries spread to 1.38 (1810.04805v2's references; their blocks' laid share 0.854 to 0.877); its fill leadings move (tests/replay/round.ts `L9 (i)`). The walk's states carry no `next` and no `box`: its replay is unchanged",
      replay:
        "the walk whole at F2 (layoutCut): F2's slot on every laid round of the sampled units (164, a borrowed line's 19 among them), as on the corpus (lab/typeset/replay-fit.mjs: 32,588 of 32,589 before the rulings of 2026-11-08)",
      cases: 164,
    },
  },
  {
    id: 'B.break',
    home: 'breaker',
    step: 'F2',
    owns: ['T22'],
    ports: [
      'L2:3365-3893 breakLines',
      'L2:3289-3355 cropExtent, lineExtent, tokW, squeeze',
      'hyph.mjs:68-142 hyphenationOf, breakPoints (breaker/hyph.ts)',
    ],
    how: 'ported',
    reads: ['fit.cjkJust', 'fit.spaceMax', 'fit.spaceMin', 'breaking.*', 'lineskip'],
    file: 'breaker/break.mjs',
    state: {
      is: 'ported',
      replay:
        "the walk whole at F2 (layoutCut): F2's slot on every laid round of the sampled units (164) and of the corpus (lab/typeset/replay-fit.mjs: 32,588 of 32,589, the one a crop's box the tap does not record)",
      cases: 32588,
    },
  },
  {
    id: 'B.place',
    home: 'breaker',
    step: 'F2',
    owns: ['G1'],
    ports: ['L2:3980-4037 placeItems', 'L2:4139-4160 laidOut'],
    how: 'ported',
    reads: [],
    file: 'breaker/place.mjs',
    state: {
      is: 'ported',
      replay:
        "the walk whole at F2 (layoutCut): F2's slot on every laid round of the sampled units (164) and of the corpus (lab/typeset/replay-fit.mjs: 32,588 of 32,589, the one a crop's box the tap does not record)",
      cases: 32588,
    },
  },
  {
    id: 'B.cuts',
    home: 'breaker',
    step: 'F2',
    owns: ['T23'],
    ports: ['L2:3894-3942 pageCutsOf', 'L2:3965 withPageBreaks'],
    how: 'ported',
    ruling: "2026-10-30 frames fill as TeX does; 2026-11-10 the frames' share within the page's band",
    reads: [],
    file: 'breaker/cuts.mjs',
    state: {
      is: 'changed',
      why: "a cut also stands where the fit sets the line its frame's share begins with in that frame or later, marked `share`: today's set none there, the frame before not full at the fit's state. A marked cut is read by a lay at a state that holds the share alone (breakLines, keepsPages), the page fill's where every frame before the last holds it at or above its page's band floor (S.fill.leads frameShareOf, S.fill.page; the owner's of 2026-11-10): 2610.22065v1-zh p5 t94, 8 lines and 2, TeX's, where the fit left 7 and 3. Every other lay, the fit's own among them, reads the tokens as today's",
      replay:
        "the walk whole at F2 (layoutCut): F2's slot on every laid round of the sampled units (164) and of the corpus (lab/typeset/replay-fit.mjs: 32,588 of 32,589, the one a crop's box the tap does not record) (3 cut), its cut tokens counted without the share's (18 rounds hold one)",
      cases: 32588,
    },
  },
  // ---------------------------------------------------------------- the fit
  {
    id: 'X.walk',
    home: 'fit',
    step: 'F2',
    owns: ['T31', '1F:layout'],
    ports: ['L2:4041-4080 statesOf', 'L2:4085 sharedStates', 'L2:4102-4137 layoutUnit2'],
    how: 'ported',
    reads: [
      'fit.order',
      'fit.leadBase',
      'fit.leadFloor',
      'fit.trackMin',
      'fit.compressMax',
      'fit.borrow',
      'fit.floor',
      'fit.step',
    ],
    file: 'fit/walk.ts',
    ruling: "2026-11-08 borrowing bounded by TeX's facts, before shrinking: a room under a whole line offered too",
    state: {
      is: 'changed',
      why: "the borrow knob offers the whole of TeX's room wherever a block has any, where today's offered it only where a block's room held a whole line at its pitch: a line TeX's \\lineskip rule sets lower takes a fraction of a line, which the room holds (2602.23285v2-ja p5 t32: 1.25 pt of 10.82, a pitch 10.96, shrunk to 9.71 where today kept 9.96), and a state after it (a looser leading) lays into it too. The replays read today's room as today's walk offered it (tests/replay/tap.ts ruledRoom, roomUnderIn)",
      replay:
        "the walk whole at F2 (layoutCut): F2's slot on every laid round of the sampled units (164, a borrowed line's 19 among them), as on the corpus (lab/typeset/replay-fit.mjs: 32,588 of 32,589, the one a crop's box the tap does not record), today's room as its walk offered it",
      cases: 164,
    },
  },
  {
    id: 'X.cut',
    home: 'fit',
    step: 'F2',
    owns: ['3.6'],
    ports: ['L2:3952-3962 layoutCut'],
    how: 'ported',
    reads: [],
    file: 'fit/cut.ts',
    state: {
      is: 'ported',
      replay:
        "the walk whole at F2 (layoutCut): F2's slot on every laid round of the sampled units (164) and of the corpus (lab/typeset/replay-fit.mjs: 32,588 of 32,589, the one a crop's box the tap does not record) (3 cut)",
      cases: 32588,
    },
  },
  {
    id: 'X.at',
    home: 'fit',
    step: 'L10',
    owns: [],
    ports: ['L2:4263 layoutAt'],
    how: 'ported',
    reads: [],
    file: 'fit/at.ts',
    state: {
      is: 'ported',
      replay:
        'inside layoutCut where a unit is cut at its frames, and in every search of S.fill.leads (31,612 corpus rounds reaching their out)',
      cases: 31612,
    },
  },
  {
    id: 'X.numbered',
    home: 'fit',
    step: 'F4',
    owns: ['E17:numbered'],
    ports: ['RUN:2272-2286'],
    how: 'ported',
    reads: [],
    file: 'fit/numbered.ts',
    state: {
      is: 'ported',
      replay:
        'chained from F2 on every laid round of the sampled units and of the corpus (tests/replay/round.ts, lab/typeset/replay-fit.mjs): its slot (64 ran on the corpus)',
      cases: 64,
    },
  },
  {
    id: 'X.lastLines',
    home: 'fit',
    step: 'F2',
    owns: ['T25'],
    ports: ['L2:4291-4314 toLastLines', 'RUN:2136 lastLines'],
    how: 'ported',
    ruling: "2026-10-19 a heading on the original's last baseline",
    reads: [],
    file: 'fit/last-lines.ts',
    state: {
      is: 'ported',
      replay:
        "the walk whole at F2 (layoutCut): F2's slot on every laid round of the sampled units (164) and of the corpus (lab/typeset/replay-fit.mjs: 32,588 of 32,589, the one a crop's box the tap does not record) (11 sampled with lastLines)",
      cases: 32588,
    },
  },
  {
    id: 'X.runs',
    home: 'fit',
    step: 'F6',
    owns: ['T6', 'T32', 'E28', '1F:runs', '1F:whole'],
    ports: [
      'L2:4171 runsOf',
      'L2:4211 runParams',
      'L2:4223 layoutRuns',
      'L2:4252 joinRuns',
      'L2:4390-4400 keepsPages',
      'RUN:2298-2309',
    ],
    how: 'ported',
    ruling: '2026-10-09 sizes per unit',
    reads: [],
    file: 'fit/runs.ts',
    state: {
      is: 'ported',
      replay:
        'chained from F2 on every laid round of the sampled units and of the corpus (tests/replay/round.ts, lab/typeset/replay-fit.mjs): its slot (25,617 ran)',
      cases: 25617,
    },
  },
  {
    id: 'X.further',
    home: 'fit',
    step: 'F6',
    owns: ['T5', 'E27'],
    ports: ['RUN:1796-1814 fitFurther', 'RUN:1738-1753 widenOverPaper', 'RUN:1699-1729 paperTo (its room: Room.side)'],
    how: 'ported',
    reads: ['fit.further', 'fit.floorMin'],
    file: 'fit/further.ts',
    state: {
      is: 'ported',
      replay:
        'chained from F2 on every laid round of the sampled units and of the corpus (tests/replay/round.ts, lab/typeset/replay-fit.mjs): its slot (584 ran; the widened blocks, Room.side, from the slot)',
      cases: 584,
    },
  },
  // ---------------------------------------------------------------- what flows share
  {
    id: 'S.table.read',
    home: 'shared',
    step: 'L2',
    owns: ['T7', 'A11', 'B28', '3.4:read'],
    ports: ['RUN:1235-1246 readGroup', 'RUN:2969-2985 the split', 'rows.mjs:265-292 layerRows'],
    how: 'ported',
    ruling: '2026-10-24 a table with one English cell beats an English table',
    reads: [],
    file: 'shared/table-read.ts',
    state: { is: 'ported', replay: 'every call of the corpus: ledgers/*.ledger.json.gz tables', cases: 2059 },
  },
  {
    id: 'S.table.groups',
    home: 'shared',
    step: 'L2',
    owns: ['3.4:decide'],
    ports: ['groups.mjs:37-93 groupOf, decideGroups, NAMES_SHARE, unchanged', 'rows.mjs:265-292 layerRows'],
    how: 'ported',
    ruling: "2026-11-08 a table's cells translated or kept by group, the way the production site judges them",
    reads: ['NAMES_SHARE'],
    file: 'shared/table-groups.ts',
    state: {
      is: 'changed',
      why: "decided in the entry over each member's own row and TeX's grid places (Placed.cell), not over the rows the door gives a unit id; a member the prepare leaves the original's (its why) tells nothing, where today counted its row",
      replay:
        'tests/unit/table-groups.test.ts over hand-made parts (the corpus rows the parity reads are decided already)',
      cases: 7,
    },
  },
  {
    id: 'S.names',
    home: 'shared',
    step: 'L3',
    owns: ['T9', 'T28', 'G15', 'A25'],
    ports: [
      'RUN:1355-1425 paintNames',
      'L2:1205-1227 nameInTarget, nameStyleOf',
      'L2:4755-4812 nameRuns, nameScriptRuns',
    ],
    how: 'ported',
    ruling: 'babel names wherever TeX identified them (D1a I4)',
    reads: ['words', 'fit.floorMin'],
    file: 'shared/names.ts',
    state: {
      is: 'ported',
      replay:
        "every babel name of the corpus against the baseline's reader dumps (lab/typeset/tests/replay/names.ts, lab/typeset/replay-names.mjs): 503 of 503 (206 drawn on their own, line x0/baseline/text; 297 leading a unit, its word against U.lead's slot); the names' rows, the page's draw and the rule set's labels from today's bundle and code (lab/typeset/tests/replay/today-names.ts)",
      cases: 503,
    },
  },
  {
    id: 'S.figures',
    home: 'shared',
    step: 'L4',
    owns: ['T10', 'G16', 'A26'],
    ports: [
      'RUN:1441-1496 paintFigures',
      'figure-fit.mjs:42 fitFigureSet',
      'figure-fit.mjs:1-76 lineOf, CJK_FOOT, sameAsSource',
      'L2:4824-4839 figureRuns',
    ],
    how: 'ported',
    reads: ['fit.floorMin'],
    file: 'shared/figures.ts',
    state: {
      is: 'changed',
      why: "a translation fitted and anchored by its ink, as every line the breaker sets: the blank half of a full-width mark at its line's edge (B.break leadOf and hangOf at its target's first state: an opening mark's leading half, a closing mark's trailing half) is no part of the line it needs and stands past its anchor's edge, where today's set it by its advance (the parity's ink reading, 9744efab3: 32 figure texts of its pages a quarter em off their original's middle or half an em short of its end, 1810.04805v2 p16's masked-LM label 3.49 pt at 6.97)",
      replay:
        "every figure text of the 123 reader dumps (tests/replay/figures.ts, lab/typeset/replay-figures.mjs --marks=today): with today's marks (no mark's em holding a blank half, as a target whose faces centre them) drawn, why and line (x0, baseline, rot, text) all today's; by ink 609 move, 452 level ones' x0, 154 turned ones' place along their run, 3 left unfit by their advance drawn; the figure rows, views and units read off today's bundle; kept, untranslated, unhidden, served, waiting: synthetic",
      cases: 14351,
    },
  },
  {
    id: 'S.rowStart',
    home: 'shared',
    step: 'F1',
    owns: ['E18', 'T34', '1F:ledBy'],
    ports: [
      'RUN:2152-2183',
      "RUN:2215-2224 the row label's crop token",
      'RUN:1623-1628 ownLabelOnRow (its fact: Placed.join, the label)',
    ],
    how: 'ported',
    ruling:
      "2026-11-09 a translated author line reflows as one line, set with the alignment TeX gave it (the coordinator's, on the owner's 2604.14228v3)",
    reads: [],
    file: 'shared/row-start.ts',
    state: {
      is: 'changed',
      why: "a line of TeX's that several members share whole and TeX set centred or flush right (RowLine: their own marks' alignment, a member made on A taking the line's) is laid as one run, its members run on and the run placed as TeX placed the line (lay/flow.ts layLine), where today's left a centred member where TeX set it (RUN:2152 `!b.centred`) and each translation, shorter, left a hole before the next: 2610.21106v1 p1's amsart \"A AND B\", 36.11 pt where TeX set 3.32",
      replay:
        "every F1 slot of the corpus (ledgers/*.ledger.json.gz): keptBetween, a page fact, taken from the slot's verdict where it decides; the lines it lays as one run, synthetic (tests/unit/entry.test.ts) and the 23 such lines of the 88 papers' parts (lanes/author-line)",
      cases: 1349,
    },
  },
  {
    id: 'S.nameLed',
    home: 'shared',
    step: 'F1',
    owns: ['E19'],
    ports: ['RUN:2184-2192'],
    how: 'ported',
    reads: [],
    file: 'shared/name-led.ts',
    state: {
      is: 'ported',
      replay: 'its F1 slots of the corpus, 9 of 9, and no start on the 31,231 other laid rounds',
      cases: 9,
    },
  },
  {
    id: 'S.onLeadRetry',
    home: 'shared',
    step: 'F3',
    owns: ['E25'],
    ports: ['RUN:2256-2269'],
    how: 'ported',
    reads: [],
    file: 'shared/on-lead.ts',
    state: {
      is: 'ported',
      replay: 'chained after F2 on every laid round of the corpus (lab/typeset/replay-fit.mjs): its F3 slot',
      cases: 3,
    },
  },
  {
    id: 'S.overFollower',
    home: 'shared',
    step: 'F5',
    owns: ['E26', '1F:over'],
    ports: ['RUN:1754-1789 overFollower', 'RUN:2287-2292'],
    how: 'ported',
    ruling: "2026-11-03 the run-in head over its row; 2026-11-10 the row before the head's size",
    reads: [],
    file: 'shared/over-follower.ts',
    state: {
      is: 'changed',
      why: "a head its row holds only by shrinking runs on over its row too, taken where it is set larger there: today's took the row for a clipped head alone, and since the size tie (2026-11-08: one paragraph's text at one scale) a head shrunk in its row sets its paragraph at its scale (the owner's report of 2026-11-10, 2611.03178v1-zh p16: \"ML Coding.\" and its paragraph at 0.85 of the body among paragraphs at full size). Over the 90 pairs with stored rows, 29 heads (34 with every toggle on) to 1 or nearer it, no paragraph smaller",
      replay:
        "chained from F2 on every laid round of the corpus (tests/replay/round.ts, lab/typeset/replay-fit.mjs): its slot (1,291: 25 taken, their layouts whole), before the shrunk case; the sampled rounds hold no head its row holds only by shrinking; the follower's first line read off today's bundle (tests/replay/today.ts)",
      cases: 1291,
    },
  },
  {
    id: 'S.relay',
    home: 'shared',
    step: 'F9',
    owns: ['3.1:relay', '1F:noOver'],
    ports: ['RUN:2540-2559 settleLeadOf', 'RUN:2565-2602 relay'],
    how: 'ported',
    reads: [],
    file: 'shared/relay.ts',
    state: {
      is: 'ported',
      replay: 'never taken on the corpus (the tap: no relay round, F9 0): synthetic tests (tests/unit/cover.test.ts)',
      cases: 0,
    },
  },
  {
    id: 'S.share',
    home: 'shared',
    step: 'F8',
    owns: ['E29', '1F:share'],
    ports: ['L2:4363-4378 shareOf', 'L2:4331-4347 inkEndOf', 'L2:4322 onShare', 'RUN:2312-2316'],
    how: 'ported',
    reads: [],
    file: 'shared/share.ts',
    state: {
      is: 'ported',
      replay:
        "chained from F2 on every laid round of the sampled units and of the corpus (tests/replay/round.ts, lab/typeset/replay-fit.mjs): its slot (1,266 ran; the row the follower's F1, the kept row, or the share's own)",
      cases: 1266,
    },
  },
  {
    id: 'S.settle',
    home: 'shared',
    step: 'F7',
    owns: ['T35'],
    ports: ['RUN:305-307 settleLayout', 'L2:387-392 clearLines'],
    how: 'ported',
    reads: [],
    file: 'shared/settle.ts',
    state: {
      is: 'ported',
      replay:
        "chained from F2 on every laid round of the corpus (tests/replay/round.ts, lab/typeset/replay-fit.mjs): its slot (5,678: 435 moved), the cells' bands over the page's rules read off today's bundle (tests/replay/today.ts)",
      cases: 5678,
    },
  },
  {
    id: 'S.fill.leads',
    home: 'shared',
    step: 'L9',
    owns: ['E30', '1F:fillLead', '1F:fillTop', '1F:fitLines'],
    // (closerLead and guessCloser, which the page fill read too until the gap ruling of 2026-11-08, are the fill leadings' alone)
    ports: [
      'RUN:512-558 fillLeadsOf',
      'RUN:2617-2624 unitFillLeads',
      'RUN:569-579 closerLead',
      'RUN:587-595 guessCloser',
    ],
    how: 'ported',
    reads: ['fill.lead', 'fill.leadRel', 'fit.leadFloor'],
    file: 'shared/fill-leads.mjs',
    state: {
      is: 'changed',
      why: "the owner on staging, 2026-11-08 (each paragraph fills the original's block, as its neighbours): a unit over a page or column break has each frame's own fill leading beside its own (frameLeadsOf), where today's held every frame to the one its fullest frame allowed (1810.04805v2 p6: four lines at the original's pitch in a frame of five); and each paragraph TeX states inside a unit (a block that opens one: SpanAt.opens, El.opens) a frame of its own, its leading its own (the owner's comment #9 on 2608.25210v2 p3: a prompt box's text held to the original's pitch by its unit's run-in line, which needed both its lines, beside a box whose run-in line took one and whose text spread; the ruling of 2026-11-08, (a)); the frames filled where the gap under the unit takes its fill leading closer than its fit's too (1810.04805v2 p6/p7 t119: five lines on p6 at the original's pitch and one of two characters alone on p7, its fit's four and two). And the frames' share (frameShareOf, the owner's of 2026-11-10): each frame filled while it holds TeX's share of the unit's lines, lowered towards the original's pitch only where it must, with the leading each frame before the last holds it at, which the page fill keeps where every one is at or above its page's band floor; recorded where it lays something the frames' own leadings do not. The unit's fill leading, top and line count, its L9 slot, as today's, but a round that borrows room (B.slots' option (i), tests/replay/round.ts `L9 (i)`)",
      replay:
        "chained from F2 on every laid round of the sampled units and of the corpus (tests/replay/round.ts, lab/typeset/replay-fit.mjs): its slot (31,612 rounds that reach their out); the frames' own leadings in the page replays where they differ",
      cases: 31612,
    },
  },
  {
    id: 'S.fill.target',
    home: 'shared',
    step: 'L10',
    owns: ['3.3:target'],
    ports: ['RUN:329-345 pageTarget', 'RUN:235-236 BODY_KINDS'],
    how: 'ported',
    reads: ['fill.band', 'fill.kinds'],
    file: 'shared/fill-target.ts',
    state: { is: 'ported', replay: 'every call of the corpus: ledgers/*.ledger.json.gz passes[].target', cases: 3014 },
  },
  {
    id: 'S.fill.page',
    home: 'shared',
    step: 'L10',
    owns: ['T33', '1F:fillable'],
    ports: ['RUN:325-327 fillUnitsOf', 'RUN:365-490 fillPage', 'L2:4407-4424 keepsShare', 'RUN:2365-2394 fillPass'],
    how: 'ported',
    ruling:
      "2026-10-09 one page size; 2026-11-08 no letter spacing on a table cell; 2026-11-08 the gap under a paragraph its own leading's alone; 2026-11-10 the frames' share within the page's band",
    reads: ['fill.band', 'fill.track', 'fill.size', 'fit.step'],
    file: 'shared/fill-page.ts',
    state: {
      is: 'changed',
      why: "the page's one size found a step up at a time, the first a body unit no longer holds ending it, where today's halved the steps (the owner's word of 2026-11-08: today's effect, by the simplest search and the fewest lays); a page that grows not at all is tried once, not twice. Every page's size today's halving gives (the 22 parity pairs' 344 pages laid both ways, 2026-11-08: growth's lays 223 to 153 of about 89,400); and a table cell takes no tracking from the page's fill (TeX stretches no tabular entry; the owner's ruling of 2026-11-08), where today's tracked a CJK cell short of its fill: such a cell is laid untracked, its decision otherwise today's (pass.ts trackedCells); and the next paragraph's leading is no longer read (the owner's gap ruling of 2026-11-08, B.slots): no unit is set closer for it, so a decision tells neither `next` nor `closer`, and a pass where today's held a gap to the next paragraph's leading lays otherwise (tap.ts flooredIn) And the gap over a unit whose paragraph over it cannot end higher (headOf: its last line alone on the one line TeX set in its last frame, a column's or a page's first, TeX's widow): its own leading is the whole paragraph's, its frame before's, and the unit under it starts lower within its own lines by what that gap lacks (the owner on staging, 2610.20967v1-zh p4: a one-line continuation 10.41 over a paragraph set at 13.43, under one set at 14.78; ruling (a) of 2026-11-08); where its own lines leave no room, as before. And a unit over frames keeps TeX's share of its lines in each (S.fill.leads frameShareOf, its cuts marked `share` read) where every frame before the last holds it at or above the page's band floor, the target less the band, else its frames as without it (the owner's of 2026-11-10: unbounded, the share set 34 of the 50 frames it tightened over the corpus at 1.0, a pair at a column's foot where the fit had left one line); a paragraph that borrows room still votes in the page's target (2610.20484v1-zh p8, 1.45 where it was 1.30)",
      replay:
        "every pass of the corpus before the change (tests/replay/pass.ts, lab/typeset/replay-fill.mjs: 3,013 of 3,014), and of the three pairs tests/replay/fill-page.test.ts replays but a pass the gap ruling or a frame's own leading changes; the 344 pages of the parity pairs laid both ways; and every pass of the corpus (tests/replay/pass.ts, lab/typeset/replay-fill.mjs): each unit laid by the chain from F2, the pass's target, each unit's decision, the page's size, each unit filled and each begun unit's L10 slot (3,013 of 3,014; the other holds the one unit whose walk differs at F2), a cell today tracked untracked",
      cases: 3013,
    },
  },
  {
    id: 'S.table.settle',
    home: 'shared',
    step: 'L11',
    owns: ['T8', '1F:withheld', '3.4:settle'],
    ports: ['RUN:2401-2409 withhold', 'RUN:2411-2425 settleGroup'],
    how: 'ported',
    reads: [],
    file: 'shared/table-settle.ts',
    state: { is: 'ported', replay: 'every call of the corpus: ledgers/*.ledger.json.gz settles', cases: 1479 },
  },
  // ---------------------------------------------------------------- what the reader paints, hides, selects and links
  {
    id: 'D.groups',
    home: 'emit',
    step: 'E1',
    owns: ['T13', 'T14', 'T24', 'G3', 'A10'],
    ports: ['hide.mjs:46-99 unitHiding (its groups; planes B and C have no counterpart)'],
    how: 'ported',
    ruling: '2026-10-30 frames fill as TeX does; a block lights whole',
    reads: [],
    file: 'emit/groups.ts',
    state: {
      is: 'ported',
      replay:
        "hand-made members held to today's unitHiding (lab/typeset/tests/unit/groups.test.ts): off bits, shown ink; a group in Placed.fixed never off",
      cases: 9,
    },
  },
  {
    id: 'D.display',
    home: 'emit',
    step: 'E1',
    owns: ['G9:items', '3.5'],
    ports: ['L2:4633-4694 lineRuns', 'L2:4695 runEdge', 'L2:1875 cropPartsOf'],
    how: 'ported',
    reads: ['tex.copySpace'],
    file: 'emit/display.ts',
    state: {
      is: 'ported',
      replay:
        "every laid unit of the 123 reader dumps (tests/replay/display.ts, lab/typeset/replay-display.mjs): from the chain's and the fill's final layout, size, leading, each line's page, x0, x1, baseline and text, each crop's piece and box (32,023 of 32,035; the other 12 are the one F2 difference and its page's pass)",
      cases: 32023,
    },
  },
  {
    id: 'D.text',
    home: 'emit',
    step: 'E1',
    owns: ['T37', 'G14', 'A28'],
    ports: [
      'textlayer.mjs:108 segsOfUnit',
      'textlayer.mjs:151 nameSeg',
      'textlayer.mjs:241 textLayerOf (by marked content)',
    ],
    how: 'ported',
    reads: ['tex.copySpace'],
    file: 'emit/text.ts',
    state: {
      is: 'ported',
      replay:
        "segsOfUnit against today's on every laid unit's every page of the corpus (lab/typeset/replay-emit.mjs): 308,051 segments; textLayer against textLayerOf on hand-made pages, groups for hide operations",
      cases: 308051,
    },
  },
  {
    id: 'D.links',
    home: 'emit',
    step: 'E1',
    owns: ['T36', 'G13', 'G12', 'A27'],
    ports: ['links.mjs:344-369 matchUnit (owners stated)', 'links.mjs:485 placeUnit', 'RUN:1044-1128 linkUnit'],
    how: 'ported',
    reads: [],
    file: 'emit/links.ts',
    state: {
      is: 'changed',
      why: "a mark TeX set as written whose copy holds no white space (a URL, a DOI: the engine joins its lines, lane url-join, 2026-11-10) and whose annotations name one target is one link over its whole drawing (Target.word): TeX's line break split it into an annotation a line, and the translation draws the word whole, where the second line's part stood past DRIFT_BOUND in its run and was dropped (2610.40645v1-ja p38, p39; 2608.06701v1-zh p12). Today's split the word at the space its text held, and placed each part on its own run",
      replay:
        "placeUnit against today's on every laid unit of the corpus (lab/typeset/replay-emit.mjs): 70,174 records over 14,359 units; matchUnit's tiers and pairs on hand-made cases (the baseline records no links); tests/unit/entry-lit-links.test.ts",
      cases: 70174,
    },
  },
  {
    id: 'D.sentences',
    home: 'emit',
    step: 'E1',
    owns: ['T38', 'G11', 'G8'],
    ports: ['words.mjs:212-267 addUnitWords', 'words.mjs:159-169 tokenBand', 'L2:4718 keptLines'],
    how: 'ported',
    reads: [],
    file: 'emit/sentences.ts',
    state: {
      is: 'ported',
      replay:
        "addUnitWords against today's on every laid unit's every page of the corpus (lab/typeset/replay-emit.mjs): 1,914,671 tokens; keptLines and the kept ink on hand-made cases",
      cases: 1914671,
    },
  },
  // ---------------------------------------------------------------- facts the prepare states (lane L1, packages/engine)
  {
    id: 'F.chains',
    home: 'fact',
    step: 'prepare',
    owns: ['3.1:chains', 'B22', '1F:lead', '1F:follows'],
    ports: ['need.mjs:37-57 rowLeadOf', 'need.mjs:112-164 lineAfterOf'],
    how: 'moved',
    reads: ['k.SHARED_SEP 3 em'],
    state: L1,
  },
  {
    id: 'F.align.cell',
    home: 'fact',
    step: 'prepare',
    owns: ['E8', 'B3'],
    ports: ['RUN:1508-1535 cellCentred'],
    how: 'moved',
    reads: [],
    state: L1,
  },
  {
    id: 'F.room',
    home: 'fact',
    step: 'prepare',
    owns: ['E20', 'A19', 'A20', 'A23', '3.2'],
    // (today's freeFor, RUN:1677-1687, the room a block borrowed under it: its rule ported, its room TeX's (the owner's ruling of
    // 2026-11-08): the engine states the depth under each run's last baseline of the next ink's baseline and of TeX's text
    // block bottom, and the paragraph's \baselineskip and \parskip (Room.runs, Room.sep, the marked compile's AXT-BODY and
    // AXT-LINES); the adapter reads the room so (lay/adapt.ts), never today's pixel map and its share of a pitch (borrowGap). And
    // the ink that stays beside its lines, no member's, which today never read (Room.stays: a rule or a glyph no unit owns, a QED
    // box), on the block of the line it stood beside)
    ports: ['RUN:1557-1573 columnOf', 'RUN:1677-1687 freeFor', 'RUN:1699-1729 paperTo'],
    how: 'moved',
    reads: [],
    state: L1,
  },
  {
    id: 'F.edges',
    home: 'fact',
    step: 'prepare',
    owns: ['E23:halfLead'],
    ports: ['RUN:1638-1672 edgesOf'],
    how: 'moved',
    reads: [],
    state: L1,
  },
  {
    id: 'F.breaks.tex',
    home: 'fact',
    step: 'prepare',
    owns: ['C13', 'C14:tex'],
    ports: [
      "TEX:139-198 (TeX's half of forcedBreaks)",
      "TEX:226-249 (TeX's half of paragraphBreaks)",
      'L2:2182 pieceLinesOf',
    ],
    how: 'moved',
    reads: [],
    state: L1,
  },
  {
    id: 'F.shortSkips',
    home: 'fact',
    step: 'prepare',
    owns: ['E15:tex'],
    ports: ['TEX:328-341 shortSkipsOf'],
    how: 'moved',
    reads: ['k.SHORT_SKIP 0.3', 'tex.predisplay'],
    state: L1,
  },
  {
    id: 'F.marks',
    home: 'fact',
    step: 'prepare',
    owns: ['C20', 'D10', 'D11'],
    ports: [
      'L2:1638 tailOf',
      'L2:1608 sourceEndMarks',
      'L2:1535-1561 origAfter, heldAfter',
      'L2:2029 leadMark (the page half)',
    ],
    how: 'moved',
    reads: [],
    state: L1,
  },
  {
    id: 'F.elements',
    home: 'fact',
    step: 'prepare',
    owns: ['D1', 'D3', 'D4', 'D5', 'D6', 'D7', 'B10', 'B11', 'B13', 'B14', 'A17', 'C9', 'C12:regions'],
    ports: [
      'TEX:358-378 renderingOf',
      'TEX:404-435 cropsOf (the translation-free half)',
      'L2:1757-1794 drawnAs',
      'L2:1365 unbracketed',
      'L2:1933 displayLines',
      'L2:1673 displayTouched',
      'L2:299-350 phClass2, phClassProven',
    ],
    how: 'moved',
    reads: [],
    state: L1,
  },
  {
    id: 'F.label',
    home: 'fact',
    step: 'prepare',
    owns: ['C10:box', 'B16', 'E9:carry', 'C8'],
    ports: ["TEX:543-568 the label's box", "RUN:744 headOf's glyphs", 'RUN:2050-2059 jointOf', 'L2:1107-1111 firstX0'],
    how: 'moved',
    reads: [],
    state: L1,
  },
]

/** the registry, by id */
export const RULES: Readonly<Record<RuleId, RuleSpec>> = Object.freeze(
  Object.fromEntries(SPECS.map((s) => [s.id, Object.freeze(s)])),
)
/** the registry in its order */
export const RULE_LIST: readonly RuleSpec[] = Object.freeze(SPECS)
