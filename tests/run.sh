#!/bin/sh
# SPDX-FileCopyrightText: 2026 Nahuel Genchi
# SPDX-License-Identifier: GPL-2.0-or-later
#
# Runs every check that needs no GNOME session: the source checks and the
# tests in this folder. The Checks workflow runs the same on every PR.
# Usage: tests/run.sh
set -eu
cd "$(dirname "$0")/.."

scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT

echo '== Source checks'
for file in src/*.js tests/*.js; do
    # A copy ending in .mjs is read as an ES module by every Node.js version.
    cp "$file" "$scratch/check.mjs"
    node --check "$scratch/check.mjs" || { echo "node --check failed: $file"; exit 1; }
done
PYTHONPYCACHEPREFIX="$scratch/pycache" python3 -m py_compile src/monitor.py src/rumble.py tests/*.py
echo 'JavaScript and Python parse.'

# Every group runs, so one report shows all the failures.
status=0
echo '== Detection and battery tests'
for file in tests/*.test.js; do
    gjs -m "$file" || status=1
done

echo '== Helper tests'
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_*.py' || status=1

if [ "$status" -eq 0 ]; then
    echo '== All checks passed'
else
    echo '== Some checks failed'
fi
exit "$status"
