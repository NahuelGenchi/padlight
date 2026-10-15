// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

// When to send a low battery alert, and what it says: once when a controller's
// battery reaches the low level, and once more when it is about to switch off,
// until it charges above the level again.

import {batteryIsCharging, batteryLevelName, batteryLowStage} from './battery.js';

// How far above the low level a reading has to climb, unless the battery is
// seen charging, before the next drop is news again. Readings wobble a little
// around the level, and each wobble would otherwise send another alert.
const RECHARGE_MARGIN = 10;

export class BatteryAlerts {
    constructor() {
        // The stage each controller was last told about, by device path
        this._told = new Map();
    }

    /**
     * Notes the latest readings and returns the alerts that are now due.
     *
     * @param {object[]} readings - {controller, battery} for every connected
     *   controller; battery is null while there is no reading
     * @param {number} lowPercentage - the level from the settings window
     * @param {boolean} enabled - whether alerts are on; while they are off,
     *   none is due and nothing counts as told
     * @returns {object[]} {controller, battery, stage} for each alert to send
     */
    update(readings, lowPercentage, enabled = true) {
        // A controller that comes back is a new connection, with alerts of its own.
        const paths = new Set(readings.map(({controller}) => controller.path));
        for (const path of this._told.keys()) {
            if (!paths.has(path))
                this._told.delete(path);
        }

        const due = [];
        for (const {controller, battery} of readings) {
            // On a cable the controller runs from the computer.
            if (!battery || controller.connection === 'usb')
                continue;
            const stage = batteryLowStage(battery, lowPercentage);
            const charging = batteryIsCharging(battery);
            if (stage === 0 &&
                (charging || batteryLowStage(battery, lowPercentage + RECHARGE_MARGIN) === 0)) {
                this._told.delete(controller.path);
                continue;
            }
            if (enabled && !charging && stage > (this._told.get(controller.path) ?? 0)) {
                this._told.set(controller.path, stage);
                due.push({controller, battery, stage});
            }
        }
        return due;
    }
}

/**
 * What an alert says.
 *
 * @param {string} name - the controller's name
 * @param {object} battery - its reading
 * @param {number} stage - from batteryLowStage(): 1 low, 2 very low
 * @returns {{title: string, body: string}}
 */
export function alertText(name, battery, stage) {
    const level = batteryLevelName(battery);
    const left = level ? `Its charge is ${level.toLowerCase()}.` : `${Math.round(battery.percentage)}% left.`;
    return stage > 1
        ? {title: `${name} battery very low`, body: `${left} Charge it or change its batteries before it switches off.`}
        : {title: `${name} battery low`, body: `${left} Charge it or change its batteries soon.`};
}
