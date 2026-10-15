// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

// The notices for controllers that connect and disconnect: which controllers
// came and went, how to tell a controller across reconnects, and what a notice
// says.

import {batteryText} from './battery.js';

// As the card names each connection
const CONNECTION_NAMES = {usb: 'Wired (USB)', bluetooth: 'Bluetooth', adapter: 'Xbox adapter'};

/**
 * The controllers that came and went between two scans. A controller's
 * device path is new on every connection, so a reconnect counts as both.
 *
 * @param {object[]} before - the controllers of the earlier scan
 * @param {object[]} after - those of the latest
 * @returns {{arrived: object[], left: object[]}}
 */
export function connectionChanges(before, after) {
    const paths = controllers => new Set(controllers.map(c => c.path));
    const [was, is] = [paths(before), paths(after)];
    return {
        arrived: after.filter(c => !was.has(c.path)),
        left: before.filter(c => !is.has(c.path)),
    };
}

/**
 * The same for a controller across reconnects, so its newest notice can
 * replace the one before: its Bluetooth address, or else the USB port it is
 * plugged into. Only kept in memory.
 *
 * @param {object} controller
 * @returns {string}
 */
export function noticeKey(controller) {
    return `connection ${controller.address ?? controller.path.replace(/\/input\/input\d+$/, '')}`;
}

/**
 * What a notice says.
 *
 * @param {object} controller
 * @param {object|null} battery - its reading, when there is one
 * @param {boolean} connected - whether it arrived or left
 * @returns {{title: string, body: string}}
 */
export function noticeText(controller, battery, connected) {
    const connection = CONNECTION_NAMES[controller.connection];
    if (!connected)
        return {title: `${controller.name} disconnected`, body: connection};
    return {
        title: `${controller.name} connected`,
        body: battery ? `${connection} · ${batteryText(battery)}` : connection,
    };
}
