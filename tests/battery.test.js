// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

// The battery helpers, on made-up UPower readings. Run: gjs -m tests/battery.test.js

import {
    batteryCharge, batteryFor, batteryIcon, batteryIsCharging, batteryIsLow, batteryLevelName,
    batteryLowStage, batteryText, lowestBattery,
} from '../src/battery.js';
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

test('low at the level from the settings and below, never while charging', () => {
    equal(batteryIsLow(reading(20), 20), true, '20% with the default level');
    equal(batteryIsLow(reading(21), 20), false, '21% with the default level');
    equal(batteryIsLow(reading(35), 35), true, '35% with the level at 35');
    equal(batteryIsLow(reading(36), 35), false, '36% with the level at 35');
    equal(batteryIsLow(reading(5), 5), true, '5% with the lowest level');
    equal(batteryIsLow(reading(5, CHARGING), 20), false, 'charging');
    equal(batteryIsLow(reading(5, FULLY_CHARGED), 20), false, 'charged');
});

test('a coarse level decides over the percentage and the setting', () => {
    equal(batteryIsLow(reading(90, DISCHARGING, LOW), 20), true, 'Low');
    equal(batteryIsLow(reading(90, DISCHARGING, CRITICAL), 20), true, 'Critical');
    equal(batteryIsLow(reading(5, DISCHARGING, NORMAL), 50), false, 'Normal');
    equal(batteryIsLow(reading(5, DISCHARGING, HIGH), 50), false, 'High');
});

test('how far down the charge is: low at the level, very low at 10% as well', () => {
    equal(batteryLowStage(reading(21), 20), 0, '21% with the default level');
    equal(batteryLowStage(reading(20), 20), 1, '20%');
    equal(batteryLowStage(reading(11), 20), 1, '11%');
    equal(batteryLowStage(reading(10), 20), 2, '10%');
    equal(batteryLowStage(reading(0), 20), 2, '0%');
    equal(batteryLowStage(reading(10, CHARGING), 20), 2, 'charging does not change the charge');
});

test('with the level at 10% or below, low is very low at once', () => {
    equal(batteryLowStage(reading(11), 10), 0, '11% with the level at 10');
    equal(batteryLowStage(reading(10), 10), 2, '10% with the level at 10');
    equal(batteryLowStage(reading(6), 5), 0, '6% with the lowest level');
    equal(batteryLowStage(reading(5), 5), 2, '5% with the lowest level');
});

test('a coarse level gives the stage itself', () => {
    equal(batteryLowStage(reading(90, DISCHARGING, LOW), 20), 1, 'Low');
    equal(batteryLowStage(reading(90, DISCHARGING, CRITICAL), 20), 2, 'Critical');
    equal(batteryLowStage(reading(5, DISCHARGING, NORMAL), 50), 0, 'Normal');
    equal(batteryLowStage(reading(5, DISCHARGING, FULL), 50), 0, 'Full');
    equal(batteryLevelName(reading(5, DISCHARGING, CRITICAL)), 'Critical', 'its name');
    equal(batteryLevelName(reading(5)), null, 'no name for a percentage');
});

test('charging and charged count as on a cable', () => {
    equal(batteryIsCharging(reading(50, CHARGING)), true, 'charging');
    equal(batteryIsCharging(reading(100, FULLY_CHARGED)), true, 'charged');
    equal(batteryIsCharging(reading(50, DISCHARGING)), false, 'discharging');
    equal(batteryIsCharging(reading(50, UNKNOWN)), false, 'no state, as from BlueZ');
});

test('battery icons in steps of ten', () => {
    equal(batteryIcon(reading(70)), 'battery-level-70-symbolic', '70%');
    equal(batteryIcon(reading(74)), 'battery-level-70-symbolic', '74%');
    equal(batteryIcon(reading(75)), 'battery-level-80-symbolic', '75%');
    equal(batteryIcon(reading(42, CHARGING)), 'battery-level-40-charging-symbolic', 'charging');
    equal(batteryIcon(reading(100, FULLY_CHARGED)), 'battery-level-100-charged-symbolic', 'charged');
});

test('the charge alone, for the top bar', () => {
    equal(batteryCharge(reading(45.4)), '45%', 'a percentage');
    equal(batteryCharge(reading(45, CHARGING)), '45%', 'charging');
    equal(batteryCharge(reading(0, DISCHARGING, LOW)), 'Low', 'a coarse level');
});

test('the top bar shows the lowest charge', () => {
    const [a, b, c] = [reading(60), reading(15), reading(35)];
    equal(lowestBattery([a, b, c]), b, 'three controllers');
    equal(lowestBattery([a, null, c]), c, 'one without a reading');
    equal(lowestBattery([null, null]), null, 'no readings');
    equal(lowestBattery([]), null, 'no controllers');
});

test('a battery already charging comes after the others', () => {
    const charging = reading(10, CHARGING);
    const charged = reading(100, FULLY_CHARGED);
    equal(lowestBattery([charging, reading(60)]), reading(60), 'the other needs charging first');
    equal(lowestBattery([charging, charged]), charging, 'all on the charger: the lowest');
});

test('coarse levels compare with percentages', () => {
    const low = reading(0, DISCHARGING, LOW);
    const normal = reading(0, DISCHARGING, NORMAL);
    equal(lowestBattery([reading(30), low]), low, 'Low is below 30%');
    equal(lowestBattery([reading(30), normal]), reading(30), 'Normal is above 30%');
    equal(lowestBattery([reading(4), reading(0, DISCHARGING, CRITICAL)]), reading(4), '4% is below Critical');
});

done();
