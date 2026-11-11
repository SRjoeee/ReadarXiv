#!/bin/bash
# lab/pdf/prepare-back/corpus.sh <papers.tsv> <out> <caches> [parallel] [run.mjs flags…]: every paper of the list (id <tab> dir) through run.mjs,
# at most `parallel` (default 2) at once, none started under 12 GiB free. One line a paper in <out>/log.tsv: id, exit, the
# summary line (exit 3: a compile no cache holds; exit 4: run.mjs's gate of a paragraph opened at a group written as its content,
# counted failed). Run it inside the lab's heavy slot (its machine is short of memory).
set -u
HERE=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$HERE/../../.." && pwd)
LIST=${1:?papers.tsv}; OUT=${2:?out}; CACHES=${3:?caches}; PAR=${4:-2}; shift 4 2>/dev/null || shift $#; FLAGS=("$@")
mkdir -p "$OUT/logs"; : > "$OUT/log.tsv"
# (the run.mjs flags and the caches, one a line: what a run's outputs are made from besides the code; same.mjs compares two runs'
# outputs only where these agree, a dump's `replaced` units being --baseline's)
printf '%s\n' "--caches=$CACHES" ${FLAGS[@]+"${FLAGS[@]}"} > "$OUT/flags.txt"
one() {
  local id=$1 dir=$2 rc free
  free=$(df -g /System/Volumes/Data | awk 'NR==2{print $4}')
  if [ "$free" -lt 12 ]; then printf '%s\trefused\t%s GiB free\n' "$id" "$free" >> "$OUT/log.tsv"; return; fi
  (cd "$ROOT" && node --max-old-space-size=6144 --import tsx "$HERE/run.mjs" --dir="$dir" --id="$id" --out="$OUT" --caches="$CACHES" ${FLAGS[@]+"${FLAGS[@]}"}) > "$OUT/logs/$id.log" 2>&1
  rc=$?
  printf '%s\t%s\t%s\n' "$id" "$rc" "$(grep -v '^\s*at ' "$OUT/logs/$id.log" | grep -v '^$' | grep -v '^Node.js' | tail -1 | tr '\t' ' ' | cut -c1-400)" >> "$OUT/log.tsv"
}
while IFS=$'\t' read -r id dir; do
  [ -z "$id" ] && continue
  while [ "$(jobs -rp | wc -l)" -ge "$PAR" ]; do sleep 1; done
  one "$id" "$dir" &
done < "$LIST"
wait
LC_ALL=C sort -o "$OUT/log.tsv" "$OUT/log.tsv"
echo "prepare-back: $(awk -F'\t' '$2==0' "$OUT/log.tsv" | wc -l | tr -d ' ') made, $(awk -F'\t' '$2==3' "$OUT/log.tsv" | wc -l | tr -d ' ') missing a compile, $(awk -F'\t' '$2!=0 && $2!=3' "$OUT/log.tsv" | wc -l | tr -d ' ') failed"
