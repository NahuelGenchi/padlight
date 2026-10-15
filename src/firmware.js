// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

// The newest firmware seen for each controller, by product ID. Microsoft
// numbers firmware like 5.23.5.0, and the controller reports only 5.23, as
// the two bytes 0x05 0x23. Only the Bluetooth LE product IDs are listed:
// over USB, it is not known yet whether the number keeps following the
// firmware past 5.9. The sources are in issue #30. Add newer versions as
// they appear; until then, controllers on them get no hint.
const NEWEST = {
    '0b13': '0523', // Series X|S (1914)
    '0b20': '0523', // Xbox One S (1708)
    '0b22': '0523', // Elite Series 2 (1797)
};

// "0523" -> [5, 23]; null if it is not two decimal pairs
function parse(version) {
    if (!/^\d{4}$/.test(version ?? ''))
        return null;
    return [Number(version.slice(0, 2)), Number(version.slice(2))];
}

/**
 * Finds out whether a controller is known to run old firmware.
 *
 * @param {string} product - the product ID, four lowercase hex digits
 * @param {string} version - the version the kernel reports, such as "0509"
 * @returns {string|null} the newer version, such as "5.23", or null when the
 *   firmware is current or cannot be compared
 */
export function newerFirmware(product, version) {
    const newest = parse(NEWEST[product]);
    const current = parse(version);
    if (!newest || !current)
        return null;
    const older = current[0] < newest[0] || (current[0] === newest[0] && current[1] < newest[1]);
    return older ? newest.join('.') : null;
}
