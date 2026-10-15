// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

// Connection notices: which controllers came and went, how one is told apart
// across reconnects, and what a notice says. Run: gjs -m tests/connectionNotices.test.js

import {connectionChanges, noticeKey, noticeText} from '../src/connectionNotices.js';
import {done, equal, test} from './harness.js';

const BLE = '/sys/devices/virtual/misc/uhid/0005:045E:0B13.0001/input/input20';
const USB = '/sys/devices/pci0000:00/0000:00:14.0/usb1/1-2/1-2:1.0/input/input9';
const pad = (path, connection = 'bluetooth', address = '00:00:5e:00:53:01') =>
    ({path, connection, address, name: 'Xbox Wireless Controller'});
const paths = ({arrived, left}) => ({arrived: arrived.map(c => c.path), left: left.map(c => c.path)});

test('controllers that came and went between two scans', () => {
    const [a, b] = [pad(BLE), pad(USB, 'usb', null)];
    equal(paths(connectionChanges([], [a])), {arrived: [BLE], left: []}, 'one arrives');
    equal(paths(connectionChanges([a], [a, b])), {arrived: [USB], left: []}, 'a second arrives');
    equal(paths(connectionChanges([a, b], [b])), {arrived: [], left: [BLE]}, 'one leaves');
    equal(paths(connectionChanges([a, b], [a, b])), {arrived: [], left: []}, 'nothing changes');
});

test('a reconnect has a new device path, so it is a departure and an arrival', () => {
    const again = pad(BLE.replace('0001/input/input20', '0002/input/input21'));
    equal(paths(connectionChanges([pad(BLE)], [again])), {arrived: [again.path], left: [BLE]});
});

test('a controller keeps its notice key across reconnects', () => {
    const again = pad(BLE.replace('0001/input/input20', '0002/input/input21'));
    equal(noticeKey(again), noticeKey(pad(BLE)), 'Bluetooth, by address');
    const replugged = pad(USB.replace('input9', 'input12'), 'usb', null);
    equal(noticeKey(replugged), noticeKey(pad(USB, 'usb', null)), 'USB, by port');
    equal(noticeKey(pad(USB, 'usb', null)) === noticeKey(pad(USB.replace('1-2', '1-3'), 'usb', null)), false,
        'another USB port is another controller');
    equal(noticeKey(pad(BLE)) === noticeKey(pad(BLE, 'bluetooth', '00:00:5e:00:53:02')), false,
        'another address is another controller');
});

test('what a notice says', () => {
    const reading = (percentage, state = 0) => ({percentage, state, level: 1});
    equal(noticeText(pad(BLE), reading(70), true),
        {title: 'Xbox Wireless Controller connected', body: 'Bluetooth · 70%'}, 'Bluetooth with a battery');
    equal(noticeText(pad(BLE), null, true).body, 'Bluetooth', 'no reading yet');
    equal(noticeText(pad(USB, 'usb', null), null, true).body, 'Wired (USB)', 'wired');
    equal(noticeText(pad(USB, 'adapter', null), reading(42, 1), true).body, 'Xbox adapter · 42% · Charging',
        'the adapter, charging');
    equal(noticeText(pad(BLE), reading(70), false),
        {title: 'Xbox Wireless Controller disconnected', body: 'Bluetooth'}, 'disconnected');
});

test('a notice calls a controller by its nickname', () => {
    const blue = {...pad(BLE), nickname: 'Blue pad'};
    equal(noticeText(blue, null, true).title, 'Blue pad connected', 'connected');
    equal(noticeText(blue, null, false).title, 'Blue pad disconnected', 'disconnected');
});

done();
