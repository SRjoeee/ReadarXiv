#!/bin/bash
# lab/marks/time.sh <out> <ids…>: stage 1b's timings (deliverable 6), like with like: for each paper, one after the other,
# today's prepare (lab/marks/time-today.mjs: `next`'s head, every compile fresh) then the new one (lab/marks/time-new.mjs),
# each TeX run through the heavy slot; none started under 12 GiB free. Then node lab/marks/time-sum.mjs <out>/today <out>/new.
set -u
HERE=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$HERE/../.." && pwd)
B=/Users/cheongzhiyan/Developer/readarxiv-lab-data/refactor-2026-11
OUT=${1:?out}; shift
mkdir -p "$OUT/today" "$OUT/new"
for id in "$@"; do
  dir=$(node -e 'console.log(require(process.argv[1]).papers.find(x => x.id === process.argv[2]).dir)' "$B/baseline/corpora/papers.json" "$id")
  free=$(df -g /System/Volumes/Data | awk 'NR==2{print $4}')
  if [ "$free" -lt 12 ]; then echo "$id refused: $free GiB free" >> "$OUT/log.txt"; continue; fi
  (cd "$ROOT" && node --max-old-space-size=6144 --import tsx "$HERE/time-today.mjs" --dir="$dir" --id="$id" --out="$OUT/today") >> "$OUT/log.txt" 2>&1
  (cd "$ROOT" && node --max-old-space-size=6144 --import tsx "$HERE/time-new.mjs" --dir="$dir" --id="$id" --out="$OUT/new" --prepare="$B/baseline/prepare") >> "$OUT/log.txt" 2>&1
done
node "$HERE/time-sum.mjs" "$OUT/today" "$OUT/new"
