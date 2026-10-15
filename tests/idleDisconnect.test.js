// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

// Idle disconnect: which controllers it looks after, the times offered, when
// a controller counts as idle, and the timer that disconnects it.
// Run: gjs -m tests/idleDisconnect.test.js

import GLib from 'gi://GLib';

import {canIdleDisconnect, IDLE_MINUTES, IdleDisconnect, IdleWatch, nearestChoice} from '../src/idleDisconnect.js';
import {done, equal, test} from './harness.js';

const pad = (path, connection = 'bluetooth', address = '00:00:5e:00:53:01') =>
    ({path, connection, address, name: 'Xbox Wireless Controller'});

// Runs the main loop for a while, doing each step at its time, in milliseconds.
function runFor(ms, steps = []) {
    const loop = new GLib.MainLoop(null, false);
    for (const [at, step] of steps) {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, at, () => {
            step();
            return GLib.SOURCE_REMOVE;
        });
    }
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
        loop.quit();
        return GLib.SOURCE_REMOVE;
    });
    loop.run();
}

// An IdleDisconnect that notes each disconnect and when it came, in
// milliseconds from its making, then does what follows it
function recorder(then = () => {}) {
    const start = GLib.get_monotonic_time();
    const calls = [];
    const idle = new IdleDisconnect(controller => {
        calls.push([controller.path, Math.round((GLib.get_monotonic_time() - start) / 1000)]);
        then(controller);
    });
    return {idle, calls};
}

// What the tests below use as the time before a disconnect: 300 ms
const SHORT = 0.005;

test('only Bluetooth controllers with an address are looked after', () => {
    equal(canIdleDisconnect(pad('a')), true, 'Bluetooth');
    equal(canIdleDisconnect(pad('a', 'usb', null)), false, 'wired');
    equal(canIdleDisconnect(pad('a', 'adapter', null)), false, 'the Xbox adapter');
    equal(canIdleDisconnect(pad('a', 'bluetooth', null)), false, 'Bluetooth without an address');
});

test('the times offered, and the nearest one to a time set elsewhere', () => {
    equal(IDLE_MINUTES, [5, 10, 15, 30]);
    equal(IDLE_MINUTES.map(nearestChoice), [0, 1, 2, 3], 'each offered time');
    equal([1, 7, 8, 12, 13, 22, 23, 120].map(m => IDLE_MINUTES[nearestChoice(m)]),
        [5, 5, 10, 10, 15, 15, 30, 30], 'others');
});

test('a controller is idle after the time without input, counted from when it is first watched', () => {
    const watch = new IdleWatch();
    equal(watch.next(60), null, 'nothing watched');
    watch.update(['a', 'b'], 0);
    equal(watch.next(60), 60, 'when the first goes idle');
    equal(watch.due(59, 60), [], 'not yet');
    equal(watch.due(60, 60), ['a', 'b'], 'both at the time');
});

test('input starts the count again', () => {
    const watch = new IdleWatch();
    watch.update(['a', 'b'], 0);
    watch.input('a', 30);
    equal(watch.due(60, 60), ['b'], 'only the one without input');
    equal(watch.due(89, 60), [], 'the other, not yet');
    equal(watch.due(90, 60), ['a'], 'the other, a full time after its input');
    watch.input('x', 10);
    equal(watch.next(60), 120, 'input from a controller not watched changes nothing');
});

test('a due controller is counted again, so one still connected is due again a full time later', () => {
    const watch = new IdleWatch();
    watch.update(['a'], 0);
    equal(watch.due(60, 60), ['a']);
    equal(watch.next(60), 120, 'next');
    equal(watch.due(119, 60), [], 'not yet');
    equal(watch.due(120, 60), ['a'], 'again');
});

test('an update keeps the counts of the controllers still there, forgets the others and counts new ones from then', () => {
    const watch = new IdleWatch();
    watch.update(['a', 'b'], 0);
    watch.input('a', 50);
    watch.update(['a', 'c'], 70);
    equal(watch.due(109, 60), [], 'b is forgotten');
    equal(watch.due(110, 60), ['a'], 'a keeps its count');
    equal(watch.due(130, 60), ['c'], 'c counts from its update');
    watch.update([], 140);
    equal(watch.next(60), null, 'none left');
});

test('the timer disconnects a controller left idle, and not one in use', () => {
    let connected = [pad('a'), pad('b', 'bluetooth', '00:00:5e:00:53:02')];
    // As Padlight's scan does, a controller disconnected leaves the list a little later.
    const {idle, calls} = recorder(controller => GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        connected = connected.filter(c => c !== controller);
        idle.update(connected, SHORT);
        return GLib.SOURCE_REMOVE;
    }));
    idle.update(connected, SHORT);
    runFor(1000, [100, 200, 300, 400].map(at => [at, () => idle.input('b')]));
    idle.destroy();
    equal(calls.map(([path]) => path), ['a', 'b'], 'disconnected, in order');
    const [[, a], [, b]] = calls;
    equal(a >= 300 && a < 550, true, `a, without input, at ${a} ms of 300`);
    equal(b >= 700 && b < 950, true, `b, used until 400 ms, at ${b} ms of 700`);
});

test('nothing is disconnected once the switch is off', () => {
    const {idle, calls} = recorder();
    idle.update([pad('a')], SHORT);
    runFor(600, [[150, () => idle.update([], SHORT)]]);
    idle.destroy();
    equal(calls, []);
});

test('a controller still connected after its disconnect is tried again a full time later', () => {
    const {idle, calls} = recorder();
    idle.update([pad('a')], SHORT);
    runFor(850);
    idle.destroy();
    equal(calls.map(([path]) => path), ['a', 'a']);
    const [[, first], [, second]] = calls;
    equal(first >= 300 && second >= 600, true, `at ${first} and ${second} ms`);
});

test('a new time counts every controller again from then', () => {
    const {idle, calls} = recorder();
    idle.update([pad('a')], SHORT);
    runFor(1000, [[200, () => idle.update([pad('a')], SHORT * 2)]]);
    idle.destroy();
    equal(calls.length, 1, 'one disconnect');
    const [[, at]] = calls;
    equal(at >= 800, true, `at ${at} ms of 800`);
});

test('destroy stops the timer', () => {
    const {idle, calls} = recorder();
    idle.update([pad('a')], SHORT);
    idle.destroy();
    runFor(450);
    equal(calls, []);
});

done();
