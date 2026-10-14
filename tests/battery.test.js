// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

// The battery helpers, on made-up UPower readings. Run: gjs -m tests/battery.test.js

import {batteryFor, batteryIcon, batteryIsLow, batteryText} from '../src/battery.js';
import {done, equal, test} from './harness.js';

// UPower's State and BatteryLevel values
const UNKNOWN = 0, CHARGING = 1, DISCHARGING = 2, FULLY_CHARGED = 4;
const NONE = 1, LOW = 3, CRITICAL = 4, NORMAL = 6, HIGH = 7, FULL = 8;

const reading = (percentage, state = DISCHARGING, level = NONE, more = {}) =>
    ({nativePath: 'hid-test-battery', serial: '', percentage, state, level, ...more});

test('a battery is matched by its power supply first', () => {
    const bySupply = reading(50);
    const byAddress = reading(60, DISCHARGING, NONE, {nativePath: '/org/bluez/hci0/dev_X', serial: '00:00:5E:00:53:01'});
    const pad = {powerSupplies: ['hid-test-battery'], address: '00:00:5e:00:53:01'};
    equal(batteryFor(pad, [byAddress, bySupply]), bySupply);
});

test('a Bluetooth LE battery from BlueZ is matched by address, ignoring case', () => {
    const fromBlueZ = reading(70, UNKNOWN, NONE, {nativePath: '/org/bluez/hci0/dev_X', serial: '00:00:5E:00:53:01'});
    equal(batteryFor({powerSupplies: [], address: '00:00:5e:00:53:01'}, [reading(10), fromBlueZ]), fromBlueZ);
});

test('no battery for a wired controller', () => {
    equal(batteryFor({powerSupplies: [], address: null}, [reading(10, DISCHARGING, NONE, {serial: ''})]), null);
});

test('battery text', () => {
    equal(batteryText(reading(70.4, UNKNOWN)), '70%', 'percentage only');
    equal(batteryText(reading(42, CHARGING)), '42% · Charging', 'charging');
    equal(batteryText(reading(100, FULLY_CHARGED)), '100% · Charged', 'charged');
    equal(batteryText(reading(0, DISCHARGING, LOW)), 'Low', 'coarse level');
    equal(batteryText(reading(0, CHARGING, FULL)), 'Full · Charging', 'coarse level, charging');
});

test('low at 20% and below, never while charging', () => {
    equal(batteryIsLow(reading(20)), true, '20%');
    equal(batteryIsLow(reading(21)), false, '21%');
    equal(batteryIsLow(reading(5, CHARGING)), false, 'charging');
    equal(batteryIsLow(reading(5, FULLY_CHARGED)), false, 'charged');
});

test('a coarse level decides over the percentage', () => {
    equal(batteryIsLow(reading(90, DISCHARGING, LOW)), true, 'Low');
    equal(batteryIsLow(reading(90, DISCHARGING, CRITICAL)), true, 'Critical');
    equal(batteryIsLow(reading(5, DISCHARGING, NORMAL)), false, 'Normal');
    equal(batteryIsLow(reading(5, DISCHARGING, HIGH)), false, 'High');
});

test('battery icons in steps of ten', () => {
    equal(batteryIcon(reading(70)), 'battery-level-70-symbolic', '70%');
    equal(batteryIcon(reading(74)), 'battery-level-70-symbolic', '74%');
    equal(batteryIcon(reading(75)), 'battery-level-80-symbolic', '75%');
    equal(batteryIcon(reading(42, CHARGING)), 'battery-level-40-charging-symbolic', 'charging');
    equal(batteryIcon(reading(100, FULLY_CHARGED)), 'battery-level-100-charged-symbolic', 'charged');
});

done();
