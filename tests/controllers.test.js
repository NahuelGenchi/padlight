// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

// scanControllers() on made-up sysfs trees. Run: gjs -m tests/controllers.test.js

import {scanControllers} from '../src/controllers.js';
import {GAMEPAD_KEYS, makeTree} from './fakesys.js';
import {done, equal, test} from './harness.js';

// A documentation address (RFC 7042), never a real controller's
const ADDRESS = '00:00:5e:00:53:01';

const SERIES_USB = {
    bus: '0003', vendor: '045e', product: '0b12', version: '0509',
    name: 'Microsoft Xbox Series S|X Controller', driver: 'xpad', js: 0,
};
// As a real Series X|S controller appears over Bluetooth LE, through BlueZ and uhid
const SERIES_BLE = {
    bus: '0005', vendor: '045e', product: '0b13', version: '0509',
    name: 'Xbox Wireless Controller', kind: 'uhid', driver: 'microsoft', uniq: ADDRESS, js: 1,
    keys: [0xa7, ...GAMEPAD_KEYS], abs: [0, 1, 2, 5, 9, 0xa, 0x10, 0x11],
};

function scan(devices) {
    const tree = makeTree(devices);
    try {
        return {controllers: scanControllers(tree.sys, tree.dev), dev: tree.dev};
    } finally {
        tree.remove();
    }
}

const pick = (controller, keys) => Object.fromEntries(keys.map(key => [key, controller[key]]));
const CARD = ['name', 'connection', 'model', 'firmware', 'driver', 'address', 'rumble'];

test('an empty tree has no controllers', () => {
    equal(scan([]).controllers, []);
});

test('a wired Series X|S controller', () => {
    const {controllers: [pad], dev} = scan([SERIES_USB]);
    equal(pick(pad, CARD), {
        name: 'Xbox Series S|X Controller', connection: 'usb', model: '1914', firmware: '5.9',
        driver: 'xpad', address: null, rumble: true,
    });
    equal([pad.eventNode, pad.jsNode], [`${dev}/event20`, `${dev}/js0`], 'device nodes');
    equal(typeof pad.since, 'number', 'connected since');
    equal(pad.powerSupplies, [], 'power supplies');
});

test('a Bluetooth LE controller stays, although uhid puts it under /devices/virtual/', () => {
    const {controllers} = scan([SERIES_BLE]);
    equal(controllers.length, 1, 'controllers');
    equal(controllers[0].path.includes('/devices/virtual/misc/uhid/'), true, 'sysfs path');
    equal(pick(controllers[0], CARD), {
        name: 'Xbox Wireless Controller', connection: 'bluetooth', model: '1914', firmware: '5.9',
        driver: 'microsoft', address: ADDRESS, rumble: true,
    });
});

test('raw HID nodes, which some programs open instead of the input nodes', () => {
    const {controllers, dev} = scan([SERIES_USB, {...SERIES_BLE, hidraw: [3]}]);
    const root = dev.replace(/\/input$/, '');
    equal(controllers.map(c => [c.connection, c.hidrawNodes]),
        [['usb', []], ['bluetooth', [`${root}/hidraw3`]]]);
});

test('virtual pads from Steam Input and game streaming are left out', () => {
    equal(scan([
        {bus: '0003', vendor: '28de', product: '11ff', name: 'Microsoft X-Box 360 pad 0', kind: 'virtual'},
        {bus: '0003', vendor: '045e', product: '028e', name: 'Microsoft X-Box 360 pad', kind: 'virtual'},
    ]).controllers, []);
});

test('the Xbox 360 Wireless Receiver counts as the adapter', () => {
    const {controllers: [pad]} = scan([
        {bus: '0003', vendor: '045e', product: '0719', name: 'Xbox 360 Wireless Receiver', driver: 'xpad', js: 0},
    ]);
    equal(pick(pad, ['name', 'connection', 'model', 'firmware']),
        {name: 'Xbox 360 Wireless Receiver', connection: 'adapter', model: null, firmware: null});
});

test('Xbox-compatible pads are recognized by name or by driver', () => {
    const {controllers} = scan([
        {bus: '0003', vendor: '0e6f', product: '02a8', version: '0100', name: 'PDP Xbox Wired Controller', js: 0},
        {bus: '0003', vendor: '2dc8', product: '2002', name: '8BitDo Ultimate Wired Controller', driver: 'xpad', js: 1},
    ]);
    equal(controllers.map(c => pick(c, ['name', 'model', 'firmware', 'driver'])), [
        {name: 'PDP Xbox Wired Controller', model: null, firmware: null, driver: null},
        {name: '8BitDo Ultimate Wired Controller', model: null, firmware: null, driver: 'xpad'},
    ]);
});

test('other gamepads and devices without gamepad buttons are left out', () => {
    equal(scan([
        {bus: '0003', vendor: '054c', product: '0ce6', name: 'Sony Interactive Entertainment DualSense Wireless Controller', driver: 'playstation', js: 0},
        {bus: '0003', vendor: '045e', product: '07a5', name: 'Microsoft Wireless Keyboard', driver: 'usbhid', keys: [1, 2, 0x1e]},
    ]).controllers, []);
});

test('a controller without an event node is left out', () => {
    equal(scan([{...SERIES_USB, event: null}]).controllers, []);
});

test('controllers come in joystick order', () => {
    const {controllers} = scan([{...SERIES_USB, js: 3}, {...SERIES_BLE, js: 1}]);
    equal(controllers.map(c => c.connection), ['bluetooth', 'usb']);
});

test('a nameless Microsoft pad is called Xbox Controller, and no rumble without force feedback', () => {
    const {controllers: [pad]} = scan([{...SERIES_USB, name: '', ff: []}]);
    equal(pick(pad, ['name', 'rumble']), {name: 'Xbox Controller', rumble: false});
});

test('firmware versions are binary-coded decimal', () => {
    const {controllers} = scan(['0000', '0117', '1005'].map((version, js) => ({...SERIES_USB, version, js})));
    equal(controllers.map(c => c.firmware), [null, '1.17', '10.5']);
});

test('power supplies of the parent device are listed for battery matching', () => {
    const {controllers: [pad]} = scan([{...SERIES_BLE, powerSupplies: ['hid-test-battery']}]);
    equal(pad.powerSupplies, ['hid-test-battery']);
});

// The number on the controller's label for each USB or Bluetooth product id.
// Kept apart from src/controllers.js on purpose, so a wrong edit there fails here (#9).
const LABELS = [
    ['02d1', '1537', 'usb'], ['02dd', '1537 / 1697', 'usb'], ['02e3', '1698', 'usb'],
    ['02ea', '1708', 'usb'], ['02e0', '1708', 'bt'], ['02fd', '1708', 'bt'], ['0b20', '1708', 'bt'],
    ['0b00', '1797', 'usb'], ['0b05', '1797', 'bt'], ['0b22', '1797', 'bt'],
    ['0b0a', '1836', 'usb'], ['0b0c', '1836', 'bt'], ['0b21', '1836', 'bt'],
    ['0b12', '1914', 'usb'], ['0b13', '1914', 'bt'],
];

test('model numbers for every known product id', () => {
    const {controllers} = scan(LABELS.map(([product, , bus], js) => bus === 'usb'
        ? {...SERIES_USB, product, js}
        : {...SERIES_BLE, product, js}));
    equal(controllers.map(c => c.model), LABELS.map(([, model]) => model));
});

test('an unknown Microsoft product id has no model number', () => {
    equal(scan([{...SERIES_USB, product: '0bff'}]).controllers[0].model, null);
});

done();
