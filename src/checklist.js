// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

// The button checklist's bookkeeping: which buttons a controller has, and
// which of them have been pressed since the last reset.

// Every button the checklist knows, in the order it lists them, with the
// names monitor.py gives them
export const BUTTONS = [
    'a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'view', 'menu', 'xbox', 'share',
    'ls', 'rs', 'up', 'down', 'left', 'right',
];

// A trigger counts once it is pulled this far: all the way, give or take a
// worn spring.
export const TRIGGER_PULL = 0.9;

// Key codes as in an input modalias, lowercase hex
const KEY_CODES = {
    a: '130', b: '131', x: '133', y: '134', lb: '136', rb: '137',
    view: '13a', menu: '13b', xbox: '13c', ls: '13d', rs: '13e',
    // The Series X|S controller's Share button is the Record key.
    share: 'a7',
    // Some drivers send the d-pad as buttons instead of a hat.
    up: '220', down: '221', left: '222', right: '223',
};
const DPAD = ['up', 'down', 'left', 'right'];
// Absolute axes: the d-pad as a hat, and the triggers, which the xpad driver
// puts on Z and RZ and Bluetooth on Brake and Gas
const HAT = ['10', '11'];
const TRIGGERS_XPAD = ['2', '5'];
const TRIGGERS_BLUETOOTH = ['9', 'a'];

/**
 * The checklist's buttons for a controller with these capabilities.
 *
 * @param {string[]} keys - key codes from its modalias
 * @param {string[]} axes - absolute axis codes from its modalias
 * @returns {string[]} names from BUTTONS, in that order
 */
export function checklistButtons(keys, axes) {
    const has = (list, codes) => codes.every(code => list.includes(code));
    const triggers = has(axes, TRIGGERS_BLUETOOTH) || has(axes, TRIGGERS_XPAD);
    return BUTTONS.filter(name => {
        if (name === 'lt' || name === 'rt')
            return triggers;
        if (DPAD.includes(name))
            return has(axes, HAT) || keys.includes(KEY_CODES[name]);
        return keys.includes(KEY_CODES[name]);
    });
}

// What has been pressed on one controller since the last reset
export class Checklist {
    /**
     * @param {string[]} buttons - from checklistButtons()
     */
    constructor(buttons) {
        this.buttons = buttons;
        this.seen = new Set();
    }

    get total() {
        return this.buttons.length;
    }

    get count() {
        return this.seen.size;
    }

    get done() {
        return this.total > 0 && this.count === this.total;
    }

    /**
     * Notes what a state from monitor.py has pressed.
     *
     * @param {object} state - {buttons, lt, rt, ...}
     * @returns {boolean} whether a button was pressed for the first time
     */
    feed(state) {
        const before = this.seen.size;
        const pressed = new Set(state.buttons ?? []);
        if ((state.lt ?? 0) >= TRIGGER_PULL)
            pressed.add('lt');
        if ((state.rt ?? 0) >= TRIGGER_PULL)
            pressed.add('rt');
        for (const name of this.buttons) {
            if (pressed.has(name))
                this.seen.add(name);
        }
        return this.seen.size > before;
    }

    reset() {
        this.seen.clear();
    }
}
