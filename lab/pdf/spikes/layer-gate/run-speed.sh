#!/bin/zsh
# The speed check's driver (speed.mjs summarises): the layer gate's model tier with --perf, one worker, on the 30 outputs, for
# HEAD's engine and BASE's, interleaved so that drift and load fall on both alike (repetition 1 head then base, 2 base then
# head, 3 head then base). Both runs use HEAD's gate scripts and instrument, and --engine names the engine each measures.
# Run it in a quiet window: these are timings. One job at a time, workers 1 (the flag forces it). No --record.
#   run-speed.sh <head worktree> <base worktree> [repetitions, default 3]
# Environment: PACK  the fixture pack folder, required (read only; rules-gate.mjs's pack), its sources passed as the rules gate
#                    passes them (without them every base page is drawn unwrapped, every unit the original's: a run that lays
#                    nothing);
#              AXT_DATA, TEXMF_DIST as the gate reads them (default the pack's own data and texmf);
#              SPEED_LOGS  the logs folder (default <head>/lab/pdf/out/speed).
# Then: node lab/pdf/spikes/layer-gate/speed.mjs <logs folder>
set -u
head=${1:?usage: run-speed.sh <head worktree> <base worktree> [repetitions]}
base=${2:?usage: run-speed.sh <head worktree> <base worktree> [repetitions]}
reps=${3:-3}
PACK=${PACK:?PACK names the fixture pack folder (fixtures, refs, geometry, data, texmf)}
LOGS=${SPEED_LOGS:-$head/lab/pdf/out/speed}
mkdir -p $LOGS
cd $head || exit 2
for r in $(seq 1 $reps); do
  if [ $((r % 2)) -eq 1 ]; then sides=(head base); else sides=(base head); fi
  for s in $sides; do
    if [ $s = head ]; then eng=$head; else eng=$base; fi
    echo "$(date '+%H:%M:%S') model-$s-r$r"
    LAYER_REFS=$PACK/refs LAYER_GEOMETRY=$PACK/geometry AXT_DATA=${AXT_DATA:-$PACK/data} TEXMF_DIST=${TEXMF_DIST:-$PACK/texmf} \
      node_modules/.bin/tsx lab/pdf/spikes/layer-gate.mjs --tier=model --engine-kind=proto --proto-tex=lines --layouts=fixed \
      --fixtures=$PACK/fixtures --sources=$PACK/sources --engine=$eng --perf --workers=1 --no-progress > $LOGS/model-$s-r$r.log 2>&1
    echo "exit $?" >> $LOGS/model-$s-r$r.log
  done
done
echo "done; node lab/pdf/spikes/layer-gate/speed.mjs $LOGS"
