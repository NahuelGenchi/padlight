// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

// A very small test harness for gjs: test() runs a case and reports it,
// equal() compares values of any shape, done() sets the exit status.

import System from 'system';

let count = 0;
let failures = 0;

// JSON with sorted keys, so objects compare by content and not key order
function canonical(value) {
    return JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v)
        ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
        : v);
}

export function equal(actual, expected, what = 'value') {
    const [got, wanted] = [canonical(actual), canonical(expected)];
    if (got !== wanted)
        throw new Error(`${what}: expected ${wanted}, got ${got}`);
}

export function test(name, fn) {
    count++;
    try {
        fn();
        print(`ok ${count} - ${name}`);
    } catch (e) {
        failures++;
        print(`not ok ${count} - ${name}\n    ${e.message}`);
    }
}

export function done() {
    print(`${count - failures} of ${count} passed`);
    if (failures)
        System.exit(1);
}
