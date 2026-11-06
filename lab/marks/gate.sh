#!/bin/bash
# lab/marks/gate.sh <out> [ids…]: the equivalence gate (lab/marks/gate.mjs) over the corpus's 87 papers, one process a paper,
# none started under 12 GiB free; compiles go through the heavy slot one at a time (lab/marks/today.mjs). One line a paper in
# <out>/log.tsv. Then: node lab/marks/gate-sum.mjs <out>
set -u
HERE=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$HERE/../.." && pwd)
B=/Users/cheongzhiyan/Developer/readarxiv-lab-data/refactor-2026-11
OUT=${1:?out}; shift
mkdir -p "$OUT/logs"
node -e 'const p=require(process.argv[1]).papers.filter(x=>x.sets.includes("87")); for (const x of p) console.log(x.id+"\t"+x.dir)' "$B/baseline/corpora/papers.json" > "$OUT/papers.tsv"
while IFS=$'\t' read -r id dir; do
  if [ $# -gt 0 ] && ! printf '%s\n' "$@" | grep -qx "$id"; then continue; fi
  free=$(df -g /System/Volumes/Data | awk 'NR==2{print $4}')
  if [ "$free" -lt 12 ]; then printf '%s\trefused\t%s GiB free\n' "$id" "$free" >> "$OUT/log.tsv"; continue; fi
  (cd "$ROOT" && node --max-old-space-size=6144 --import tsx "$HERE/gate.mjs" --id="$id" --dir="$dir" --out="$OUT" --defs="$B/lanes/L2/defs" --answers="$B/lanes/L2/marks/answers.json" --bbl="$B/lanes/L2/marks/bbl" --compiles="$B/lanes/L2/marks/compiles" --keep="$OUT/keep") > "$OUT/logs/$id.log" 2>&1
  printf '%s\t%s\t%s\n' "$id" "$?" "$(tail -1 "$OUT/logs/$id.log" | cut -c1-300)" >> "$OUT/log.tsv"
done < "$OUT/papers.tsv"
echo "gate: $(awk -F'\t' '$2==0' "$OUT/log.tsv" | wc -l | tr -d ' ') papers run, $(awk -F'\t' '$2!=0' "$OUT/log.tsv" | wc -l | tr -d ' ') failed"
