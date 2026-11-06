#!/bin/bash
# lab/marks/back.sh <front run dir> <store> <out>: lab/marks/back.mjs (the back half over the stored instruments: units located on
# arXiv's page) for every paper the front run made, one at a time, none started under 12 GiB free; then a sum (located, the
# source units located, by id) in <out>/sum.json. Not shipped.
set -u
HERE=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$HERE/../.." && pwd)
B=/Users/cheongzhiyan/Developer/readarxiv-lab-data/refactor-2026-11
RUN=${1:?run}; STORE=${2:?store}; OUT=${3:?out}
mkdir -p "$OUT"
while IFS=$'\t' read -r id dir; do
  free=$(df -g /System/Volumes/Data | awk 'NR==2{print $4}')
  if [ "$free" -lt 12 ]; then echo "$id refused: $free GiB free" >> "$OUT/log.txt"; continue; fi
  (cd "$ROOT" && node --max-old-space-size=6144 --import tsx "$HERE/back.mjs" --id="$id" --dir="$dir" --run="$RUN" --store="$STORE" --out="$OUT") >> "$OUT/log.txt" 2>&1
done < "$RUN/papers.tsv"
node -e '
const fs = require("fs"), d = process.argv[1]
const t = { papers: 0, located: 0, unlocated: {}, units: 0, unitsLocated: 0, msBack: [] }
for (const f of fs.readdirSync(d).filter(f => f.endsWith(".json") && f !== "sum.json")) {
  const r = JSON.parse(fs.readFileSync(`${d}/${f}`, "utf8")); if (!r.stats) continue
  t.papers++; t.located += r.stats.located
  for (const [k, v] of Object.entries(r.stats.unlocated)) t.unlocated[k] = (t.unlocated[k] ?? 0) + v
  t.units += r.units.length; t.unitsLocated += r.units.filter(u => u[1]).length; t.msBack.push(r.ms.back)
}
t.msBack.sort((a, b) => a - b); t.msBack = { p50: t.msBack[Math.floor(t.msBack.length / 2)], p90: t.msBack[Math.floor(0.9 * t.msBack.length)] }
fs.writeFileSync(`${d}/sum.json`, JSON.stringify(t, null, 1)); console.log(JSON.stringify(t))' "$OUT"
