# Generic alignment: fixed-profile ablation against Original

2026-09-30. **Original is the objective; FIT is a baseline.** The owner's aim is local block correspondence and global
page/layout correspondence with natural typography, without costly online calibration. A cheaper method may replace
FIT's mechanism if it serves those objectives better. The reader/default and comparison page are unchanged here.

## Question and controlled inputs

Could medians learned from other FIT papers replace document trial compiles? This tests the simplest candidate before
building a source/translation estimator. All computation is a shared median rule. Data groups are Chinese, Japanese,
Korean and a pooled German/Russian alphabetic group; they are not separate fitting algorithms. CJK uses median
lead/track/scale, alphabets use median size plus global leading bounded to 0.95–1.1, without FIT's unit-specific nudges.

Every prediction excludes the test paper identity across all languages. The five cases use 4, 7, 7, 11 and 11 training
records respectively. This is leave-one-paper-out within existing historical data, not a new-corpus acceptance.
Historical records are not a uniform-version training corpus; every used index is pinned by SHA-256. No tuning or
retry of parameters was performed after seeing these test results.

The saved fit-1 source is reused to hold translation/parser/macros/assets fixed. Candidate changes only typography;
body equality is checked after removing size markers. Saved fit-1 and fit-3 translated bodies also match in all five
cases, and each stored reference FIT PDF matches its fit-3 PDF hash. CJK sets the source font's scale/tracking and
local leading. Alphabetic sizing reuses only fit-1 probe unit IDs, not their heights/line counts/leading. That saved
metadata/scaffold dependency means this pilot is not a ready runtime integration. No translator/API call is made.

## Original correspondence, not just page counts

Starts are matched through existing marked-original destinations. Missing marks count in the denominator. Same-page
does not imply same column; both are reported. Position tolerance is 10 PDF points in two dimensions, conditioned on
same page/column. Within-column start/end height comparisons are a subset, not whole-paragraph shape verification.

| Target / paper | Original / FIT / candidate pages | FIT starts on original page | Candidate starts on original page | FIT / candidate on original page and column | FIT / candidate within 10 pt XY |
|---|---|---|---|---|---|
| zh / 2212.06817 | 31 / 31 / 31 | 130/158 (82.3%) | 132/158 (83.5%) | 130 / 132 | 19 / 20 |
| ja / 2608.05876 | 13 / 14 / 14 | 74/85 (87.1%) | 67/85 (78.8%) | 69 / 58 | 12 / 3 |
| ko / 2608.21180 | 13 / 13 / 13 | 35/38 (92.1%) | 24/38 (63.2%) | 35 / 24 | 6 / 2 |
| de / 2608.06701 | 12 / 12 / 12 | 79/87 (90.8%) | 76/87 (87.4%) | 78 / 71 | 20 / 21 |
| ru / 2608.24839 | 7 / 7 / 7 | 58/58 (100%) | 55/58 (94.8%) | 58 / 52 | 39 / 8 |

All five candidate page counts match FIT. Only four match Original, the same as FIT. Yet four cases lose same-page
starts, and all four lose same-page/column starts. German improves one XY count while losing page/column matches;
one aggregate metric cannot establish superiority. Chinese is slightly better on these start metrics, not a general
visual acceptance for RT-1. Three German original starts are missing in both translations, not silently excluded.

Same-page/column median vertical errors, FIT → candidate: zh 16.8→17.1 pt, ja 22.2→96.3 pt, ko 50.8→165.8 pt,
de 17.4→16.0 pt, ru 6.1→24.7 pt. These medians involve different matched subsets and exclude off-page starts.
Height-error medians are also in the raw report, with the exact paired-end and within-column denominators.

Visual check: Korean page 4 in [Original](../data/runs/fit-profile-ablation/1790757091990/visual/ko-original-p4.png),
[FIT](../data/runs/fit-profile-ablation/1790757091990/visual/ko-fit-p4.png) and
[candidate](../data/runs/fit-profile-ablation/1790757091990/visual/ko-candidate-p4.png). The candidate page begins at
Table 1, instead of the original's preceding text, and Figure 1 enters this page early. FIT retains the preceding
text, but still does not put all following content at Original's height. Changing body density changes TeX's choices
for floats; preserved figures and equal page counts do not ensure preserved layout. No claim of repaired table flags.

Diagnostics: all candidate runs exit successfully with zero TeX errors. Candidate missing-glyph counts match FIT:
Japanese has two; the other cases have zero. Overfull H/V warnings, FIT → candidate: zh 4/0→4/0, ja 107/1→100/1,
ko 0/0→0/0, de 1/34→1/33, ru 3/0→3/0. Fewer warnings do not override the positional regression; these are log counts,
not proof of visibly clipped text. Source/body integrity likewise does not prove complete rendered-ink integrity.

## Costs and reproducibility

Sequential native Docker, TeX Live image `sha256:7334b00bf8e7a0996f7ddd65482363aaf7711d372e569f3ea78509619e3083ff`,
2 CPU limit, 3 GB limit, no network, faithful METAFONT settings. One latexmk invocation per candidate, with normal
TeX reruns counted. Timing includes Docker startup and compilation; source copying and PDF comparison are separate.

| Target | Prepare source, ms | Compile wall time, ms | Actual TeX passes |
|---|---:|---:|---:|
| zh | 53.8 | 23,468 | 3 |
| ja | 25.8 | 19,176 | 3 |
| ko | 25.6 | 10,047 | 2 |
| de | 28.7 | 7,175 | 3 |
| ru | 27.7 | 9,653 | 3 |

No extra whole-paper calibration compiles were performed. This is **not** a zero-compile translation update and is
not a controlled speedup measurement versus old FIT runs or browser BusyTeX. It is one timing per case, not a p95,
and excludes training-data loading/profile construction, live translation, cold internet delivery and production
memory. Do not compare these native numbers with the native-overlay prototype's millisecond local fits.

Run from the worktree root (fresh output directory by default):

```bash
pnpm exec tsx experiments/pdf-bilingual/spikes/fit-profile-ablation.mjs
```

Re-score the recorded run without a compile:

```bash
node experiments/pdf-bilingual/spikes/fit-profile-score.mjs experiments/pdf-bilingual/data/runs/fit-profile-ablation/1790757091990
```

Raw `results.json`, `scored-results.json`, copied candidate inputs/PDFs, compiler stdout/stderr/logs and visuals are
under `data/runs/fit-profile-ablation/1790757091990` (ignored, local). The Russian run initially selected an included
template rather than the main file; main detection now uses latexmk's recorded entry. That preparation failure ran
no Russian compile; resume completed only the missing case. The first four were not repeated or tuned.

## Verdict and reusable rules

**Fixed profiles alone fail this pilot's Original-correspondence requirement. Do not enable this candidate.**
The useful conclusion is not that online trials are necessary; only this particular trial-free estimator failed.

- Keep a shared mechanism with explicit font/script/role data. Average language parameters are priors, not sufficient
  per-paper density predictions. Fit to the actual source/translation and Original layout, not a language label alone.
- Measure local starts/ends, columns, floats and global pages together. Never accept page-count equality as a substitute
  for block correspondence or treat similarity to FIT as the primary objective.
- Keep body changes local and graphics intact, but model the resulting flow/float consequences. Shrinking entire
  figures/tables or forcing gaps is not justified by this experiment.
- Next hypothesis: estimate occupancy using already available source/translated runs, source font/width/line geometry
  and bounded role-specific rules, without additional full-document trials. Separate uncertainty for math, tables,
  headings and float-bearing pages. A cheap estimate must earn acceptance against Original; it is not assumed accurate.
- Broaden only after a small held-out review has no obvious failures. Do not re-tune these five and call them unseen
  validation. Cold delivery, browser behavior and end-to-end performance remain separate gates.
