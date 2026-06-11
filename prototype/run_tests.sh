#!/usr/bin/env bash
# Run all smoke tests against a built HTML. Copies the app+tests into a temp dir.
# Usage: bash run_tests.sh [path-to-html]   (defaults to app/...v1_43_0.html)
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
HTML="${1:-$HERE/app/FGEHA_NLC_F14F15_UnifiedControl_v1_43_0.html}"
WORK="$HERE/_test"; rm -rf "$WORK" && mkdir -p "$WORK"
cp "$HTML" "$WORK/FGEHA_NLC_F14F15_UnifiedControl_v1_0.html"
cp "$HERE/tests/"*.js "$WORK/"
cd "$WORK"
pass=0; fail=0
for t in smoke_test_*.js; do
  out=$(node "$t" 2>/dev/null || true)
  line=$(echo "$out" | grep -E "passed" | tail -1)
  echo "$(printf '%-28s' "${t%.js}") $line"
done
