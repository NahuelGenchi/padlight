// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

// Nicknames for controllers. The settings keep each one under a key made from
// the controller's Bluetooth address, or its USB serial number on a cable:
// an HMAC-SHA256 with a random salt of this computer's, so they never hold the
// address or the number.

import GLib from 'gi://GLib';

// The longest nickname, in characters
export const NICKNAME_LENGTH = 32;

const encoder = new TextEncoder();

// What tells a controller apart from every other, or null when it reports
// nothing that does
function identity(controller) {
    if (controller.address)
        return `address ${controller.address.toLowerCase()}`;
    if (controller.serial)
        return `serial ${controller.serial}`;
    return null;
}

/**
 * Whether a controller can keep a nickname: it reports a Bluetooth address,
 * or a serial number on a cable.
 *
 * @param {object} controller - from scanControllers()
 * @returns {boolean}
 */
export function canHaveNickname(controller) {
    return identity(controller) !== null;
}

/**
 * The key a controller's nickname is kept under.
 *
 * @param {object} controller - from scanControllers()
 * @param {string} salt - the nickname-salt setting
 * @returns {string|null} 64 hex digits; null when the controller cannot keep
 *   a nickname, or there is no salt yet because none was ever set
 */
export function nicknameKey(controller, salt) {
    const id = identity(controller);
    if (!id || !salt)
        return null;
    return GLib.compute_hmac_for_string(GLib.ChecksumType.SHA256, encoder.encode(salt), id, -1);
}

/**
 * A nickname as typed, tidied: no spaces at the ends or twice in a row, and
 * no longer than NICKNAME_LENGTH. Empty means no nickname.
 *
 * @param {string} text
 * @returns {string}
 */
export function cleanNickname(text) {
    return [...text.trim().replace(/\s+/g, ' ')].slice(0, NICKNAME_LENGTH).join('').trim();
}

/**
 * What to call a controller: its nickname, or else its model's name.
 *
 * @param {object} controller - from scanControllers(), with its nickname
 * @returns {string}
 */
export function controllerName(controller) {
    return controller.nickname ?? controller.name;
}
