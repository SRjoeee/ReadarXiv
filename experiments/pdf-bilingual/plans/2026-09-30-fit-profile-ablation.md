# Compile-free FIT profile prediction: first ablation

DESIGN §16 and the FIT-default roadmap delegate this experiment here. The owner wants broadly reusable rules that
approach measured FIT without extra whole-paper calibration. This experiment changes no reader default.

Owner clarification: **Original is the objective**, locally in block placement and globally in page count/layout.
FIT is the strongest current baseline, not a required architecture or parameter recipe. Prefer a simpler candidate
that improves Original correspondence, even if it differs from FIT. Natural readability and content integrity still
constrain alignment; matching page counts alone does not establish it.

Before implementation: test the simplest deterministic policy before designing a text/geometry predictor. Learn
medians of observed FIT typography from other papers, grouped by writing system; exclude the test paper identity
from every training language. The algorithm is common; profile data differs. Use no target paragraph heights,
target trial ratios or target FIT parameters in prediction. Report this as leave-one-paper-out, not new-corpus proof.

Five cases: zh 2212.06817, ja 2608.05876, ko 2608.21180, de 2608.06701, ru 2608.24839. Pin existing input scaffolds,
reference PDFs and training indices with hashes; reject changes to translated body text. Reuse the saved fit-1 source
and its existing probe scaffold to avoid parser/cache drift. For alphabetic font sizing, reuse only the probe's unit
IDs, not line counts, dimensions or leading; this offline metadata dependency is not a production implementation.

Generate one candidate per case: CJK gets median lead/track/scale, alphabetic text gets median size and bounded
global leading with no per-unit ratio. Reuse the existing unit-local TeX macros; no new page lock or figure scaling.
Compile each candidate sequentially in faithful native Docker, one latexmk invocation (normal TeX reruns count).
Record source preparation, compile and comparison separately, actual TeX-pass count, errors/missing glyphs/overfull
boxes, page counts, matched unit starts and positions against both original and saved FIT. Include missing marks.
Do not equate native timings with BusyTeX or compare them as a controlled speedup to older parallel runs.

Inspect a displayed source/FIT/candidate page. If Original position/page/content failures increase, retain that negative
result: parameters alone cannot establish quality, and fixed profiles are then insufficient. The next experiment
would add cheap source/translation features, still holding text and resources fixed. Do not silently tune on these
five test outputs and call the same outputs validation. Save raw artifacts outside tracked files and document the
verdict, including mixed historical profile versions, sample size and untested production/cold-cache behavior.

Keep each new experimental module below 100 lines. Required repository lint/test/build run before completion.
