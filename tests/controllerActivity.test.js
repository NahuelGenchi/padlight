// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

// The background readers behind Keep the screen awake and idle disconnect:
// one per controller, saying which controller is in use, and none once it is
// gone. A stand-in for monitor.py notes which controller it was started for
// and says it is in use every 50 ms.
// Run: gjs -m tests/controllerActivity.test.js

import GLib from 'gi://GLib';

import {ControllerActivity} from '../src/controllerActivity.js';
import {done, equal, test} from './harness.js';

const scratch = GLib.dir_make_tmp('padlight-XXXXXX');
const script = GLib.build_filenamev([scratch, 'monitor.py']);
const startedFile = GLib.build_filenamev([scratch, 'started']);
GLib.file_set_contents(script, `import os, sys, time
with open(os.path.join(os.path.dirname(sys.argv[0]), 'started'), 'a') as started:
    started.write(sys.argv[-1] + '\\n')
while True:
    print('{"input":true}', flush=True)
    time.sleep(0.05)
`);

const pad = (path, eventNode) => ({path, eventNode, connection: 'bluetooth', name: 'Xbox Wireless Controller'});
const [a, b] = [pad('/sys/a', '/dev/input/event30'), pad('/sys/b', '/dev/input/event31')];

// Runs the main loop for a while, in milliseconds.
function runFor(ms) {
    const loop = new GLib.MainLoop(null, false);
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
        loop.quit();
        return GLib.SOURCE_REMOVE;
    });
    loop.run();
}

// The event nodes readers were started for, in order
function started() {
    if (!GLib.file_test(startedFile, GLib.FileTest.EXISTS))
        return [];
    const [, bytes] = GLib.file_get_contents(startedFile);
    return new TextDecoder().decode(bytes).split('\n').filter(Boolean);
}

// How many times each controller was said to be in use
function counter() {
    if (GLib.file_test(startedFile, GLib.FileTest.EXISTS))
        GLib.unlink(startedFile);
    const seen = new Map();
    const activity = new ControllerActivity(script, path => seen.set(path, (seen.get(path) ?? 0) + 1));
    return {activity, seen};
}

test('a reader per controller, each saying which controller is in use', () => {
    const {activity, seen} = counter();
    activity.update([a, b]);
    runFor(400);
    activity.destroy();
    equal([...seen.keys()].sort(), [a.path, b.path], 'in use');
    equal(started().sort(), [a.eventNode, b.eventNode], 'started, once each');
});

test('a controller that is gone is no longer read, and the others still are', () => {
    const {activity, seen} = counter();
    activity.update([a, b]);
    runFor(300);
    activity.update([b]);
    // What the reader had already sent comes in now.
    runFor(100);
    seen.clear();
    runFor(300);
    activity.destroy();
    equal([...seen.keys()], [b.path]);
});

test('a controller already read keeps its reader across updates', () => {
    const {activity, seen} = counter();
    activity.update([a]);
    runFor(200);
    activity.update([a]);
    activity.update([a, b]);
    runFor(200);
    activity.update([b, a]);
    runFor(200);
    activity.destroy();
    equal(started(), [a.eventNode, b.eventNode], 'readers started');
    equal(seen.has(a.path) && seen.has(b.path), true, 'both read');
});

test('nothing is read after destroy', () => {
    const {activity, seen} = counter();
    activity.update([a, b]);
    runFor(200);
    activity.destroy();
    runFor(100);
    seen.clear();
    runFor(300);
    equal(seen.size, 0);
});

GLib.unlink(startedFile);
GLib.unlink(script);
GLib.rmdir(scratch);
done();
