# Block-level audit: where the layer still optimises, penalises or gates line-level matching

Read-only. Nothing in any repository was changed.

**What was read**
- Engine: worktree `fill-pitch`, head fe09b27f (PR #438), with the working tree's uncommitted edits (another session's). Its base is 6c735aab, which predates #437.
- `origin/next` 911043c5 (#437), for the per-page draw rule.
- Web sweep: `readarxiv-web-wt/delta-web` 634b201, `scripts/sweep/invariants.mjs`.
- Gate: `lab/pdf/spikes/rules-gate.mjs`, `layer-gate/{score,measure,fill-measures}.mjs`, `lab/pdf/rulings/*`.
- Scratchpad reports: route `design.md`, `layer-side.md`, `architecture-audit.md`, `delta.md`; residuals `pr438-sample-report.md`, `fill-pitch-report.md`, `j-cjk-stretch-report.md`.

**The standard, as quoted.** 「我们关注的是整个 block 内部的均匀度和自然度是否一致」; 「句子允许有自然的位移，分布在段落中对应正确的位置即可，不需要绝对一致」; 「有行间上下位移和差距是非常正常的」; 「而不是去追求绝对的每一行文字颗粒度都匹配」.

**Headline**
- The Rules gate and its rulings are clean. Every gated measure is block-level or page-level: fill, blank lines per frame, frames with a blank line, pitch spread, size, size spread, over-right, paragraph gaps, and the completeness and pixel defects. The line-position readings (`onGrid`, `dTop`, `pageDrift`, `paraGap`) are `REPORTED`, not gated (`score.mjs:110`).
- No ruling quotes a line-level standard.
- The fit is first-fit over states. It never compares line counts with the original.
- The fill is a frame-level search (`run.mjs:317-417`, `:430-471`).
- **What remains is one engine mechanism, one evaluation rubric and one stale gate/doc.** The first is the only one that changes pixels.

## 1. Violations, ranked by impact

| # | Location | What it does | Why it violates | Block-level replacement | Cost | Reader effect |
|---|---|---|---|---|---|---|
| 1 | `layer2.mjs:2531-2536` (`slotsAt`: `onGrid ? G[k] : B[0] − k·pitch`), with `blocks2` `:2336-2347` (G closes only the forced-break gaps, `joinAt`) | At leading exactly 1, line k of the translation is put on the original's **own baseline k**, not on a uniform pitch from the first baseline. Where TeX opened a gap for a tall line of the original (\lineskip under a fraction or a big operator), the translation inherits it at line k, whatever it sets there. The translation's own tall lines are then opened again by `breakLines`' settle (`:2670-2725`). Who is at leading 1: every Latin and Cyrillic unit (`fillLead` null gives `fillTop = 1`, `run.mjs:433`), Japanese and Korean units the fill leaves at 1, and zh units on loose originals or that led down to 1. **Measured** (zh sweep, 53 papers, jstretch laid records): 520 of 3,839 multi-line body units are at leading 1. 32 of them (6 %) hold an on-grid gap more than 1 pt over their median pitch, up to +6.7 pt (2610.21026 u103: 13.25 pt pitch, gaps of 18.9 and 20.0). This is an upper bound: some of those lines may be tall in the translation too. | It copies the original's **per-line positions**, so its per-line irregularities land on whatever line now stands there. That breaks the block's internal rhythm: 「整个 block 内部的均匀度」. | Close TeX's tall-line openings in G the way `joinAt` gaps are closed. Use the box test `blocks2` already applies for `through` (`:2384`): baseline gap ≤ depth + height + \lineskip. Every grid line then stands at the original's pitch, and the drawing's own rule reopens a gap only where **its** line is tall. Alternatively, drop the special grid and use `B[0] − k·p0` (pitch-uniform), still on the original's lines wherever the original is regular. | 2–4 h with a unit test (an irregular B; the existing "on the original's own baselines" test at `layer-proto-step3.test.ts:44` uses a uniform B and stays). Rules-gate run. No rule-set version (code, not data), no gate-pack remake (the refs are the originals), no PIPELINE/TRANSLATE bump. A ruling only if a gated measure moves; `onGrid` (reported) will drop. | Even line rhythm in alphabetic, Japanese and Korean paragraphs with tall inline math: no stray half-line gap two lines away from the formula that caused it. It touches only the ~6 % of lead-1 units with such gaps, and is invisible elsewhere. |
| 2 | Evaluation rubric. `pr438-sample-report.md` § "Verdicts, head against base, by closeness to the original" (CLOSER / SAME / FARTHER per unit). The fill-pitch and jstretch studies use the same framing. | It judges each unit by how near it lands to the original. It credits CLOSER for "the paragraph's foot 2–2.5 pt nearer its frame" (4 of 14 in stratum A). | This is sub-line positional matching as a verdict: 「不需要追求绝对的句子级精细」, 「不用太吹毛求疵」. The owner has already judged it wrong today. | Per unit, BETTER / SAME / WORSE against base on three block questions. (i) Uniformity inside the block: no line visibly looser, tighter, ragged or letter-spaced against its siblings; density natural for the script. (ii) The block lands: first line where the original's paragraph starts, last line inside its frame, the gap to the next paragraph not tighter than its lines, no overlap. (iii) Rhythm against the neighbouring blocks on the page. A shift under a pitch with (i)–(iii) unchanged is SAME. | About 1 h to write it down in the next study's brief. No code. | Indirect: no more decisions that trade naturalness for points of position. Under it, PR #438's stratum A is all SAME, and B's two FARTHER stay WORSE (a ragged mid-paragraph line; a re-break that starts a line with a formula). |
| 3 | This head only: `pipeline/page-pass.mjs:347-350` (`verdictOf`: a part is refused when < `CARRY_MIN` 0.9 of our base's lines lie within 0.5 pt of arXiv's), `layout/make.mjs:601-611` (`shareOf`); documented as current in route `design.md` §3.3.5 (`:149-152`) and `docs/PDF-READER.md:1792-1797`. | A strict per-line in-place share gates whether a part gets a layout at all. | It compares our English base with arXiv's English, which is source identity, not a translation-versus-original match. As a **gate**, though, its line-level strictness showed whole parts in English for re-broken lines. Already replaced on `next` by #437 (9718884b): `verdictOf` reads only, and `make.mjs` refuses `carry` only where no unit is laid; the per-line counts are information. | Merge `next` into #438 before it merges (`page-pass.mjs` is not in #438's diff). Amend `design.md` §3.3.5 to the per-page rule. | 0.5 h of docs. Nothing in the engine. | None after the merge. Until then, a test build from this head could still fall back to English on parts the per-page rule would draw. |
| 4 | Web sweep (m), `invariants.mjs:971-984` (`crowding`), with `emptySlots` `:958-969` | It fires when a CJK unit has ≥ 2 of its original line slots empty **and** either it sits at floor tracking or **any one line** is letter-spaced past 0.15 em. | The room half is block-level and right. The `spaced` arm is a per-line trigger that duplicates (j): in PR #438, 4 of the 16 new rows were detector flips with no change. It does not match lines to the original, so it is a precision problem rather than a breach. | (m) as a block verdict: the unit at its tracking floor, or denser than its page's other body units, while ≥ 2 slots of its frame stay empty. Letter-spaced lines live in (j) alone. | 0.5–1 h in the web repo and a sweep recompute. | None directly. Cleaner residual lists, so engine work goes to real crowding. |

## 2. Line-level uses that look like violations but are legitimate

- **Paragraph anchors.**
  - The first line stays on the original's first baseline (`footFloorAt`, `layer2.mjs:2476-2479`; the half-leading ruling of 2026-10-17).
  - A heading set in fewer lines than its original drops onto the original's last lines (`toLastLines`, `:3316-3329`; `run.mjs:1937`, `:2018`). The trigger is a line count, but the effect is block alignment to the paragraph it heads (owner, 2026-10-19).
  - Sweep (h) checks each paragraph start within 0.5 pt (`invariants.mjs:745-764`).
  - All three are paragraph correspondence, the standard's own 「段落级别的匹配」.
- **The alphabets' pitch policy.** `fillLead` null (`run.mjs:433`) and the order shrink-before-lead (Latn/Cyrl in `layout-rules.json`; test `layer-proto-step3.test.ts:52`) keep alphabetic lines on the original's pitch. That is a density choice the owner ruled on (D6 2026-10-08 "choose A"; fillPage ruling 2026-10-09), not per-line matching. Revisit only with crops, if alphabetic paragraphs read short.
- **Per-line naturalness inside the block.** These measure lines against the unit's own natural spacing, never against the original's lines. That is exactly 「block 内部的均匀度」:
  - PR #438's squeeze (`layer2.mjs:2802-2830`, `:3132-3140`);
  - (j)'s `END_EXTRA` and `LINE_EXTRA` (`invariants.mjs:909-921`);
  - `lineStartPunct` and `slotsSkipped` (`measure.mjs:497-565`).
  - Two have small quirks. `slotsSkipped` credits TeX's room by the original's gap positions (`:519-526`), but it counts whole pitches only (`floor(over)`), so it never penalises a natural sub-line shift. `lineStartPunct` exempts a line by the original's line on its baseline. Leave both.
- **Formula ink.** A formula TeX broke across lines arrives as one crop per TeX line (`cropPartsOfSegments`, `layer2.mjs:1384-1442`). That is forced by (k), a formula is drawn as its own ink. The long-formula-line stretch it causes is the approved decision "A".
- **Collision and shape.** These use the original's lines to avoid ink or to keep the paragraph's shape, not to match:
  - rule bands (`:368-377`) and cell bands;
  - the short-skip end before a display (`:2546-2552`);
  - per-line measures where TeX changed the measure (`measuresOf` / `measureAt`, wrapfigure, hangindent);
  - the shared-row start (`run.mjs:1938-1960`).
- **Information, sync and highlight.**
  - The carry line check's `pageLines` (`carry.mjs:307`; info-only on `next`).
  - Each laid line's `target` and `exact` in the records (`run.mjs:1675`).
  - `onGrid`, `dTop`, `pageDrift` and `paraGap`, all reported and not gated.
  - `fitLines ≥ 2` in `pageTarget` (`run.mjs:283-292`), which only decides whether a unit has a leading to tell.
- **Erasure and removal.** Per-line erase extents and glyph ownership by baseline (`unitOps`/`removalOps`; `removal.mjs:175`), and the crops' TeX baselines (the `cropBaselineOff` gate: a formula's vertical place in its own line). These are completeness, not layout.
- **Page and sentence placement.** The E3c page cuts and sweep (i) work at page granularity, the standard's 「区块对应」.

## 3. Recommendation

**In the next engine PR**
- Close TeX's tall-line openings in the leading-1 grid (finding 1). It is one small change in `blocks2`, reusing its own \lineskip box test, plus a unit test with an irregular original and a rules-gate run. It is the only remaining place where the engine carries an original line's position, rather than its paragraph's, into the translation.
- Merge `next` into #438 so the per-page draw rule replaces this head's 0.9 per-line gate.
- Amend `design.md` §3.3.5 to match.

**In the evaluation**
- Retire CLOSER / SAME / FARTHER for the block rubric in §1 #2.
- Optionally narrow sweep (m) to its block half.

**Leave**
- The paragraph anchors.
- The alphabets' pitch policy.
- The heading bottom anchoring.
- The per-line naturalness checks.
- The crop splits.
- Every information and sync use.
- The Rules gate as it is: it already gates nothing line-level.

**Longer term.** The block-level answer to the (j) and (m) residuals is not more per-line patches (squeeze, stretch caps). It is paragraph-level line breaking that minimises the spread of per-gap stretch over the whole block, a total fit in place of the greedy breaker. That is a separate design to measure first, not part of the next PR.
