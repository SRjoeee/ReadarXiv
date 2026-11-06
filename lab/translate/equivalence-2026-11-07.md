# Equivalence with today on recorded material (lane L6)

Input: 14150 records from today's tests (6379 distinct). A verdict is compared only where the adapter writes today's wire byte for byte.

| source | wire | outcome | records |
|---|---|---|---|
| html | markers | agree | 2124 |
| html | tags | agree | 1631 |
| html | markers | agree, white space apart | 1198 |
| html | tags | agree, white space apart | 1162 |
| html | markers | wire | 128 |
| pdf | markers | agree | 82 |
| pdf | tags | agree | 21 |
| html | tags | wire | 15 |
| web | markers | agree | 10 |
| pdf | markers | wire | 3 |

## Disagreements (the same wire, or one but for white space; different verdicts), each with its cause


## Records whose wire differs, by cause

- 128 × html/markers: side-by-side elements one marker here (the PDF wire's rule, now the one Microsoft adapter's), one each on the HTML page; fewer markers here
- 15 × html/tags: a span holding no text one void here, a pair around its elements on the HTML page; fewer markers here
- 1 × pdf/markers: today same-style neighbour pairs one span; one span each here (a limit of this conversion: the source reader types the span); a placeholder that sets no ink: no piece; TeX's space (a tie) a marker today, text here; more markers here
- 1 × pdf/markers: a lone end: a marker where it stands today, no piece here (typed pieces nest); a placeholder that sets no ink: no piece; fewer markers here
- 1 × pdf/markers: TeX's space (a tie) a marker today, text here; fewer markers here
