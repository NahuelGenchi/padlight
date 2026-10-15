// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

// When low battery alerts are due, and what they say, on made-up readings.
// Run: gjs -m tests/batteryAlerts.test.js

import {alertText, BatteryAlerts} from '../src/batteryAlerts.js';
import {done, equal, test} from './harness.js';

// UPower's State and BatteryLevel values
const UNKNOWN = 0, CHARGING = 1, DISCHARGING = 2, FULLY_CHARGED = 4;
const NONE = 1, LOW = 3, CRITICAL = 4, NORMAL = 6;

const pad = (path = '/sys/devices/virtual/misc/uhid/0005:045E:0B13.0001/input/input20', connection = 'bluetooth') =>
    ({path, connection, name: 'Xbox Wireless Controller'});
const reading = (percentage, state = UNKNOWN, level = NONE) => ({percentage, state, level});

// Feeds readings of one controller in turn and lists the stage of each alert
function stages(alerts, controller, readings, low = 20, enabled = true) {
    return readings.map(battery => alerts.update([{controller, battery}], low, enabled)
        .map(alert => alert.stage).join(','));
}

test('one alert at the low level and one more at 10%', () => {
    equal(stages(new BatteryAlerts(), pad(), [50, 20, 15, 10, 5].map(p => reading(p))),
        ['', '1', '', '2', '']);
});

test('a reading that wobbles around the level alerts once', () => {
    equal(stages(new BatteryAlerts(), pad(), [20, 25, 20, 30, 20].map(p => reading(p))),
        ['1', '', '', '', '']);
});

test('after climbing more than 10 above the level, the next drop alerts again', () => {
    equal(stages(new BatteryAlerts(), pad(), [20, 31, 20].map(p => reading(p))), ['1', '', '1']);
});

test('after charging above the level, the next drop alerts again', () => {
    equal(stages(new BatteryAlerts(), pad(),
        [reading(20, DISCHARGING), reading(25, CHARGING), reading(20, DISCHARGING)]),
    ['1', '', '1']);
});

test('nothing while charging or charged, even when low', () => {
    equal(stages(new BatteryAlerts(), pad(),
        [reading(15, CHARGING), reading(15, FULLY_CHARGED), reading(15, DISCHARGING)]),
    ['', '', '1']);
    equal(stages(new BatteryAlerts(), pad(), [reading(15, DISCHARGING), reading(18, CHARGING), reading(15, DISCHARGING)]),
        ['1', '', ''], 'charging that stops below the level');
});

test('never for a controller on a cable', () => {
    const wired = pad('/sys/devices/pci0000:00/usb1/1-2/1-2:1.0/input/input9', 'usb');
    equal(stages(new BatteryAlerts(), wired, [20, 10, 5].map(p => reading(p, DISCHARGING))), ['', '', '']);
});

test('a controller that connects already low gets one alert at once', () => {
    equal(stages(new BatteryAlerts(), pad(), [reading(15)]), ['1']);
    equal(stages(new BatteryAlerts(), pad(), [reading(8), reading(5)]), ['2', ''], 'very low: only that one');
});

test('a controller that leaves and comes back is a new connection', () => {
    const alerts = new BatteryAlerts();
    equal(stages(alerts, pad(), [reading(15)]), ['1']);
    alerts.update([], 20);
    equal(stages(alerts, pad(), [reading(15)]), ['1']);
});

test('a moment without a reading forgets nothing', () => {
    equal(stages(new BatteryAlerts(), pad(), [reading(15), null, reading(15)]), ['1', '', '']);
});

test('drivers that only report a coarse level', () => {
    equal(stages(new BatteryAlerts(), pad(),
        [NORMAL, LOW, LOW, CRITICAL, NORMAL, LOW].map(level => reading(0, DISCHARGING, level))),
    ['', '1', '', '2', '', '1']);
});

test('with the level at 10% or below, there is one alert', () => {
    equal(stages(new BatteryAlerts(), pad(), [12, 10, 5].map(p => reading(p)), 10), ['', '2', '']);
    equal(stages(new BatteryAlerts(), pad(), [8, 5, 3].map(p => reading(p)), 5), ['', '2', '']);
});

test('switched off, nothing is due; switched on, a low battery is told at once', () => {
    const alerts = new BatteryAlerts();
    equal(stages(alerts, pad(), [reading(15), reading(15)], 20, false), ['', '']);
    equal(stages(alerts, pad(), [reading(15), reading(10)]), ['1', '2']);
});

test('every controller has alerts of its own', () => {
    const alerts = new BatteryAlerts();
    const first = pad();
    const second = pad('/sys/devices/virtual/misc/uhid/0005:045E:0B13.0002/input/input21');
    const due = readings => alerts.update(readings, 20).map(a => `${a.controller.path.slice(-2)}:${a.stage}`);
    equal(due([{controller: first, battery: reading(15)}, {controller: second, battery: reading(60)}]), ['20:1']);
    equal(due([{controller: first, battery: reading(15)}, {controller: second, battery: reading(9)}]), ['21:2']);
    equal(due([{controller: first, battery: reading(15)}]), []);
});

test('what an alert says', () => {
    equal(alertText('Xbox Wireless Controller', reading(18.4), 1), {
        title: 'Xbox Wireless Controller battery low',
        body: '18% left. Charge it or change its batteries soon.',
    }, 'low');
    equal(alertText('Xbox Wireless Controller', reading(9.6), 2), {
        title: 'Xbox Wireless Controller battery very low',
        body: '10% left. Charge it or change its batteries before it switches off.',
    }, 'very low');
    equal(alertText('Xbox Elite Wireless Controller', reading(0, DISCHARGING, LOW), 1).body,
        'Its charge is low. Charge it or change its batteries soon.', 'coarse Low');
    equal(alertText('Xbox Elite Wireless Controller', reading(0, DISCHARGING, CRITICAL), 2).body,
        'Its charge is critical. Charge it or change its batteries before it switches off.', 'coarse Critical');
});

done();
