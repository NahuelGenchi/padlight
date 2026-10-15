// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

// The button checklist's bookkeeping. Run: gjs -m tests/checklist.test.js

import {BUTTONS, Checklist, checklistButtons} from '../src/checklist.js';
import {done, equal, test} from './harness.js';

// Capabilities as the kernel lists them in a modalias, lowercase hex
const FACE = ['130', '131', '133', '134', '136', '137', '13a', '13b', '13c', '13d', '13e'];
const XPAD = {keys: FACE, axes: ['0', '1', '2', '3', '4', '5', '10', '11']};
const BLUETOOTH = {keys: ['a7', ...FACE], axes: ['0', '1', '2', '5', '9', 'a', '10', '11']};

test('a Series X|S controller over Bluetooth has all 18', () => {
    equal(checklistButtons(BLUETOOTH.keys, BLUETOOTH.axes), BUTTONS);
});

test('without Share, 17; triggers on Z and RZ still count', () => {
    const buttons = checklistButtons(XPAD.keys, XPAD.axes);
    equal(buttons.length, 17, 'count');
    equal(buttons.includes('share'), false, 'share');
    equal(['lt', 'rt'].every(b => buttons.includes(b)), true, 'triggers');
});

test('a d-pad sent as buttons instead of a hat', () => {
    const buttons = checklistButtons([...FACE, '220', '221', '222', '223'], ['0', '1', '2', '5']);
    equal(['up', 'down', 'left', 'right'].every(b => buttons.includes(b)), true);
});

test('no d-pad and no triggers when the controller reports neither', () => {
    equal(checklistButtons(FACE, ['0', '1']), ['a', 'b', 'x', 'y', 'lb', 'rb', 'view', 'menu', 'xbox', 'ls', 'rs']);
});

test('each button counts once, and only the ones the controller has', () => {
    const list = new Checklist(['a', 'b', 'up']);
    equal([list.count, list.total, list.done], [0, 3, false], 'at first');
    equal(list.feed({buttons: ['a']}), true, 'A is new');
    equal(list.feed({buttons: ['a']}), false, 'A again');
    equal(list.feed({buttons: []}), false, 'released');
    equal(list.feed({buttons: ['share']}), false, 'a button it does not have');
    equal(list.feed({buttons: ['b', 'up']}), true, 'two at once');
    equal([list.count, list.done], [3, true], 'all done');
});

test('a trigger counts once pulled at least 90%', () => {
    const list = new Checklist(['lt', 'rt']);
    list.feed({buttons: [], lt: 0.89, rt: 0.5});
    equal(list.count, 0, 'not far enough');
    list.feed({buttons: [], lt: 0.9, rt: 1});
    equal([...list.seen].sort(), ['lt', 'rt'], 'pulled');
});

test('reset starts over', () => {
    const list = new Checklist(['a', 'b']);
    list.feed({buttons: ['a', 'b']});
    list.reset();
    equal([list.count, list.done], [0, false]);
    equal(list.feed({buttons: ['a']}), true, 'counted again');
});

test('an empty checklist is never done', () => {
    equal(new Checklist([]).done, false);
});

done();
