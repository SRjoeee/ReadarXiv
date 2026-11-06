#!/bin/bash
# lab/marks/front.sh <out> [ids…]: the new front half (lab/marks/front.mjs: the instrument's cache, drafts only) over the
# corpus's 87 papers, one process a paper, none started under 12 GiB free; compiles go through the heavy slot one at a time
# (lab/marks/today.mjs); the store is lanes/L2/marks/store unless STORE names another, today's owners gate6's kept ones.
# KEEP=1 keeps each instrument's inputs in <out>/keep; PROBE=off places the marks without the probe's answers. One line a paper in <out>/log.tsv. Then: node lab/marks/gate-sum.mjs <out>
set -u
HERE=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$HERE/../.." && pwd)
B=/Users/cheongzhiyan/Developer/readarxiv-lab-data/refactor-2026-11
M=$B/lanes/L2/marks
OUT=${1:?out}; shift
mkdir -p "$OUT/logs"
node -e 'const p=require(process.argv[1]).papers.filter(x=>x.sets.includes("87")); for (const x of p) console.log(x.id+"\t"+x.dir)' "$B/baseline/corpora/papers.json" > "$OUT/papers.tsv"
while IFS=$'\t' read -r id dir; do
  if [ $# -gt 0 ] && ! printf '%s\n' "$@" | grep -qx "$id"; then continue; fi
  free=$(df -g /System/Volumes/Data | awk 'NR==2{print $4}')
  if [ "$free" -lt 12 ]; then printf '%s\trefused\t%s GiB free\n' "$id" "$free" >> "$OUT/log.tsv"; continue; fi
  keep=(); if [ "${KEEP:-0}" = 1 ]; then keep=(--keep="$OUT/keep"); fi
  (cd "$ROOT" && node --max-old-space-size=6144 --import tsx "$HERE/front.mjs" --id="$id" --dir="$dir" --out="$OUT" --store="${STORE:-$M/store}" --today="$M/gate6/keep" --defs="$B/lanes/L2/defs" --answers="$M/answers.json" --bbl="$M/bbl" --compiles="$M/compiles" ${PROBE:+--probe=$PROBE} ${keep[@]+"${keep[@]}"}) > "$OUT/logs/$id.log" 2>&1
  printf '%s\t%s\t%s\n' "$id" "$?" "$(tail -1 "$OUT/logs/$id.log" | cut -c1-300)" >> "$OUT/log.tsv"
done < "$OUT/papers.tsv"
echo "front: $(awk -F'\t' '$2==0' "$OUT/log.tsv" | wc -l | tr -d ' ') papers run, $(awk -F'\t' '$2!=0' "$OUT/log.tsv" | wc -l | tr -d ' ') failed"
