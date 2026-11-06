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

const open = { is: 'open' } as const
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
    reads: ['words', 'captions'],
    file: 'unit/label.ts',
    state: { is: 'ported', replay: "samples/U.label.json.gz (+ today's rules/tex-names.json)", cases: 15 },
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
    reads: ['k.SHORT 0.5 em (a guard: TeX states the line a break ends, A.El.ends)'],
    file: 'unit/breaks.ts',
    state: {
      is: 'ported',
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
    reads: ["lineskip (TeX's log)", 'k.STEP_EM 2, k.MEASURE_TOL 0.5 (guards: TeX states the measure, Line m0..m1)'],
    file: 'unit/blocks.ts',
    state: { is: 'ported', replay: 'samples/U.blocks.json.gz', cases: 36 },
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
    reads: ['breaking.*', 'fit.autospace', 'fit.compressMax', 'words'],
    state: {
      is: 'ported',
      replay: "samples/B.tokens.json.gz with lanes/L3/replay/B.tokens.json.gz, its faces B.faces' port's",
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
    reads: ['fit.borrow', 'tex.predisplay', 'k.SHORT_SKIP 0.3'],
    file: 'breaker/slots.mjs',
    state: {
      is: 'ported',
      replay:
        "the walk whole at F2 (layoutCut): F2's slot on every laid round of the sampled units (164) and of the corpus (lab/typeset/replay-fit.mjs: 32,588 of 32,589, the one a crop's box the tap does not record)",
      cases: 32588,
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
    ruling: '2026-10-30 frames fill as TeX does',
    reads: [],
    file: 'breaker/cuts.mjs',
    state: {
      is: 'ported',
      replay:
        "the walk whole at F2 (layoutCut): F2's slot on every laid round of the sampled units (164) and of the corpus (lab/typeset/replay-fit.mjs: 32,588 of 32,589, the one a crop's box the tap does not record) (3 cut)",
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
    file: 'fit/walk.mjs',
    state: {
      is: 'ported',
      replay:
        "the walk whole at F2 (layoutCut): F2's slot on every laid round of the sampled units (164) and of the corpus (lab/typeset/replay-fit.mjs: 32,588 of 32,589, the one a crop's box the tap does not record)",
      cases: 32588,
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
    file: 'fit/cut.mjs',
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
    file: 'fit/at.mjs',
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
    file: 'fit/last-lines.mjs',
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
    file: 'fit/runs.mjs',
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
    state: open,
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
      is: 'ported',
      replay:
        "every figure text of the 123 reader dumps (tests/replay/figures.ts, lab/typeset/replay-figures.mjs): drawn, why and line (x0, baseline, rot, text), the figure rows, views and units read off today's bundle; kept, untranslated, unhidden, served, waiting: synthetic",
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
    reads: [],
    file: 'shared/row-start.ts',
    state: {
      is: 'ported',
      replay:
        "every F1 slot of the corpus (ledgers/*.ledger.json.gz): keptBetween, a page fact, taken from the slot's verdict where it decides",
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
    state: open,
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
    ruling: '2026-11-03 the run-in head over its row',
    reads: [],
    file: 'shared/over-follower.ts',
    state: {
      is: 'ported',
      replay:
        "chained from F2 on every laid round of the corpus (tests/replay/round.ts, lab/typeset/replay-fit.mjs): its slot (1,291: 25 taken, their layouts whole); the follower's first line read off today's bundle (tests/replay/today.ts)",
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
    file: 'shared/share.mjs',
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
    ports: ['RUN:512-558 fillLeadsOf', 'RUN:2617-2624 unitFillLeads'],
    how: 'ported',
    reads: ['fill.lead', 'fill.leadRel', 'fit.leadFloor'],
    file: 'shared/fill-leads.mjs',
    state: {
      is: 'ported',
      replay:
        'chained from F2 on every laid round of the sampled units and of the corpus (tests/replay/round.ts, lab/typeset/replay-fit.mjs): its slot (31,612 rounds that reach their out)',
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
    ports: [
      'RUN:325-327 fillUnitsOf',
      'RUN:365-490 fillPage',
      'RUN:569-579 closerLead',
      'RUN:587-595 guessCloser',
      'L2:4407-4424 keepsShare',
      'RUN:2365-2394 fillPass',
    ],
    how: 'ported',
    ruling: '2026-10-09 one page size',
    reads: ['fill.band', 'fill.track', 'fill.size', 'fit.step'],
    file: 'shared/fill-page.mjs',
    state: {
      is: 'ported',
      replay:
        "every pass of the corpus (tests/replay/pass.ts, lab/typeset/replay-fill.mjs): each unit laid by the chain from F2, the pass's target, each unit's decision, the page's size, each unit filled and each begun unit's L10 slot (3,013 of 3,014; the other holds the one unit whose walk differs at F2)",
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
    state: open,
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
    state: open,
  },
  {
    id: 'D.links',
    home: 'emit',
    step: 'E1',
    owns: ['T36', 'G13', 'G12', 'A27'],
    ports: ['links.mjs:344-369 matchUnit (owners stated)', 'links.mjs:485 placeUnit', 'RUN:1044-1128 linkUnit'],
    how: 'ported',
    reads: [],
    state: open,
  },
  {
    id: 'D.sentences',
    home: 'emit',
    step: 'E1',
    owns: ['T38', 'G11', 'G8'],
    ports: ['words.mjs:212-267 addUnitWords', 'words.mjs:159-169 tokenBand', 'L2:4718 keptLines'],
    how: 'ported',
    reads: [],
    state: open,
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
    ports: ['RUN:1557-1573 columnOf', 'RUN:1677-1687 freeFor', 'RUN:1699-1729 paperTo'],
    how: 'moved',
    reads: ['fit.borrowGap'],
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
