#!/bin/bash
# lab/release-check/today-build.sh <repository> <dir>: the extension built with today's reader (AXT_READER=today) from the
# repository's HEAD, into <dir>/.output/chrome-mv3, for the release check's full tier: today's reader is the way back until the
# cut-over deletes it, and a default build carries the rebuilt reader, on which tests/e2e/reader.mjs and registration.mjs run the
# rebuilt reader's checks. WXT's build takes no output folder, so the commit is exported (git archive: no worktree registered,
# nothing of the checkout touched) into <dir>, installed from the store and built there; the e2e scripts are then run from the
# checkout against it (AXT_EXT_DIR). Exit 0 with the build made, 1 where a step failed or the build carries the rebuilt reader's
# PDF.js files (pdfjs/: a default build). Not shipped.
set -euo pipefail
REPO=${1:?usage: today-build.sh <repository> <dir>}
DIR=${2:?usage: today-build.sh <repository> <dir>}
COMMIT=$(git -C "$REPO" rev-parse HEAD)
rm -rf "$DIR"
mkdir -p "$DIR"
git -C "$REPO" archive "$COMMIT" | tar -x -C "$DIR"
cd "$DIR"
pnpm install --frozen-lockfile --prefer-offline > install.log 2>&1 || { tail -20 install.log; exit 1; }
AXT_READER=today pnpm build
if [ -d .output/chrome-mv3/pdfjs ]; then
  echo "today-build: the build carries pdfjs/ (the rebuilt reader's): not today's reader"
  exit 1
fi
echo "today-build: today's reader at $COMMIT: $DIR/.output/chrome-mv3 ($(du -sh .output/chrome-mv3 | cut -f1))"
