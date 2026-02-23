#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-8000}"
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "${ROOT_DIR}"

echo "Serving Boulder Dash at http://localhost:${PORT}/html/boulder-dash.html"
python3 -m http.server "${PORT}"
