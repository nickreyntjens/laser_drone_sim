#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLAYWRIGHT_CLI="$ROOT_DIR/node_modules/@playwright/test/cli.js"

if [[ ! -f "$PLAYWRIGHT_CLI" ]]; then
  echo "Missing Playwright CLI at $PLAYWRIGHT_CLI. Run npm install first." >&2
  exit 1
fi

declare -a CANDIDATES=()

if [[ -n "${PLAYWRIGHT_NODE_BIN:-}" ]]; then
  CANDIDATES+=("$PLAYWRIGHT_NODE_BIN")
fi

if [[ -d "$HOME/.nvm/versions/node" ]]; then
  while IFS= read -r candidate; do
    CANDIDATES+=("$candidate")
  done < <(find "$HOME/.nvm/versions/node" -maxdepth 3 -path "*/bin/node" -type f | sort -Vr)
fi

CANDIDATES+=("/opt/homebrew/bin/node")

CURRENT_NODE="$(command -v node || true)"
if [[ -n "$CURRENT_NODE" ]]; then
  CANDIDATES+=("$CURRENT_NODE")
fi

for candidate in "${CANDIDATES[@]}"; do
  if [[ ! -x "$candidate" ]]; then
    continue
  fi

  major_version="$("$candidate" -p "process.versions.node.split('.')[0]" 2>/dev/null || true)"
  if [[ -n "$major_version" && "$major_version" =~ ^[0-9]+$ && "$major_version" -ge 18 ]]; then
    exec "$candidate" "$PLAYWRIGHT_CLI" "$@"
  fi
done

echo "Playwright requires Node 18+. Set PLAYWRIGHT_NODE_BIN to a Node 18+ binary or install one." >&2
exit 1
