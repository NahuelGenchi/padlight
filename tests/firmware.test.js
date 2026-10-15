// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

// The firmware hint's table and comparison. Run: gjs -m tests/firmware.test.js

import {newerFirmware} from '../src/firmware.js';
import {done, equal, test} from './harness.js';

test('older firmware on a listed Bluetooth LE controller gets the newest version', () => {
    equal(newerFirmware('0b13', '0509'), '5.23', 'Series X|S on 5.9');
    equal(newerFirmware('0b20', '0417'), '5.23', 'Xbox One S on 4.17');
    equal(newerFirmware('0b22', '0522'), '5.23', 'Elite Series 2 on 5.22');
});

test('versions compare by number, not as text', () => {
    // 5.9 is older than 5.23 although "9" sorts after "2"
    equal(newerFirmware('0b13', '0509'), '5.23', '5.9');
    equal(newerFirmware('0b13', '0600'), null, '6.0');
});

test('no hint for current or newer firmware', () => {
    equal(newerFirmware('0b13', '0523'), null, 'the newest');
    equal(newerFirmware('0b13', '0524'), null, 'newer than the table');
});

test('no hint over USB or for controllers not in the table', () => {
    equal(newerFirmware('0b12', '0509'), null, 'Series X|S over USB');
    equal(newerFirmware('02ea', '0408'), null, 'Xbox One S over USB');
    equal(newerFirmware('0b05', '0903'), null, 'Elite Series 2 over Bluetooth Classic');
});

test('no hint when the version cannot be read', () => {
    for (const version of [null, undefined, '', '5.9', '050', '05a9', '00509'])
        equal(newerFirmware('0b13', version), null, JSON.stringify(version));
});

done();
