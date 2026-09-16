#!/usr/bin/env bash
# Developer install (DESIGN §15.4): builds the helper in the repository and registers it through register.sh, the one writer of the
# Native Messaging host manifest (the one-click install-remote.sh ends in the same script). Re-running keeps the ids earlier runs allowed.
# Usage: helper/install.sh <extension-id> [<extension-id>...]
#   The extension id is shown in chrome://extensions (the ID on each extension's card in developer mode). An unpacked extension's id derives
#   from its load path and is stable on one machine; Playwright loading from the same .output/chrome-mv3 path gets the same id.
set -euo pipefail
cd "$(dirname "$0")"

if [ $# -lt 1 ]; then
  echo "Usage: $0 <extension-id> [<extension-id>...]" >&2
  exit 2
fi
for id in "$@"; do
  if ! [[ "$id" =~ ^[a-p]{32}$ ]]; then
    echo "Not a valid extension id: $id (expected 32 lowercase letters a–p)" >&2
    exit 2
  fi
done

swift build -c release
BIN="$(pwd)/.build/release/axt-helper"
./register.sh "$BIN" "$@"

echo "helper $("$BIN" --version), binary $BIN"
echo "Image translation is available now; no need to reload the extension."
