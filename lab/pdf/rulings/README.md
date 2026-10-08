# Rulings

A pull request that changes the layout rule set (or the drawing code that reads it) is held by the rules gate to the merge
rule: on no target may a model-tier measure be worse than on the merge base (`lab/pdf/README.md`, "The rules gate in CI").
A change that is worse on purpose is accepted by a **ruling**: a JSON file the pull request adds to this directory, in the
form of the layer gate's `--ruling` (`lab/pdf/spikes/layer-gate.mjs`), with the targets it covers beside the measures.

```json
{
  "date": "2026-10-09",
  "by": "the maintainer",
  "on": "zh leadBase 1.35 (pull request 123)",
  "quote": "the maintainer's own words, in the language he wrote them",
  "english": "the same, in English, where the quote is not",
  "measures": ["pitch spread"],
  "targets": ["zh"],
  "scope": "which outputs and pages move, and by how much",
  "why": "why the regression is the better layout"
}
```

- `by`, `quote`, `why`, `measures` and `targets` are required. A measure is named by its label as the comment shows it
  (`pitch spread`, `text units left English`) or by its key (`pitchSpread`, `unitsLeft`); a target by its tag (`zh`, `ja`).
- A ruling covers a regression when it names the regression's measure and its target. A regression it does not name still
  fails the run.
- Only a file the pull request **adds** counts: a ruling on the branch's base is history, and accepts nothing new.
- The comment quotes `english` (else `quote`) and `why`, which are the only free text in it; the gate refuses to write a
  comment that carries a stretch of a paper.
