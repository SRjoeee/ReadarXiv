#!/usr/bin/env bash
# The one writer of the Native Messaging host manifest (DESIGN §15.4). `install.sh` (the developer build inside the
# repository) and `install-remote.sh` (the one-click install under ~/Library/Application Support) both end here, so the two paths
# cannot disagree on the manifest's shape, its description or its policy — they did, and running them alternately on one machine
# flipped the manifest back and forth. Chrome reads <user data directory>/NativeMessagingHosts/<host>.json; written into the default
# user data directories of Chrome and Chromium (a browser started with --user-data-dir copies it into its own profile; the e2e does).
# Usage: register.sh <path to axt-helper> <extension-id> [<extension-id>...]
#   The ids an earlier run allowed are kept (another profile, a dev build beside the installed one): the origins are unioned, never
#   overwritten. To start over, delete the manifest files (helper/README.md, Uninstall).
set -euo pipefail
NAME=io.github.srjoeee.arxivtranslate

if [ $# -lt 2 ]; then
  echo "Usage: $0 <path to axt-helper> <extension-id> [<extension-id>...]" >&2
  exit 2
fi
BIN="$1"
shift
if ! [ -x "$BIN" ]; then
  echo "Not an executable helper binary: $BIN" >&2
  exit 2
fi
for id in "$@"; do
  if ! [[ "$id" =~ ^[a-p]{32}$ ]]; then
    echo "Not a valid extension id: $id (expected 32 lowercase letters a–p)" >&2
    exit 2
  fi
done

for dir in "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts" \
           "$HOME/Library/Application Support/Chromium/NativeMessagingHosts"; do
  mkdir -p "$dir"
  manifest="$dir/$NAME.json"
  # The ids given now first, then the ids an earlier run allowed, each once
  origins=""
  for id in "$@"; do origins="$origins chrome-extension://$id/"; done
  if [ -f "$manifest" ]; then
    origins="$origins $(grep -o 'chrome-extension://[a-p]\{32\}/' "$manifest" | tr '\n' ' ' || true)"
  fi
  list=""
  for origin in $(printf '%s\n' $origins | awk '!seen[$0]++'); do list="$list\"$origin\", "; done
  cat > "$manifest" <<JSON
{
  "name": "$NAME",
  "description": "The image recognition helper of Read arXiv (Apple Vision)",
  "path": "$BIN",
  "type": "stdio",
  "allowed_origins": [${list%, }]
}
JSON
  echo "Written $manifest"
done
