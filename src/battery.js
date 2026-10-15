// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const UPOWER = 'org.freedesktop.UPower';
const UPOWER_PATH = '/org/freedesktop/UPower';
const DEVICE_IFACE = 'org.freedesktop.UPower.Device';

// org.freedesktop.UPower.Device State and BatteryLevel values
const STATE_CHARGING = 1;
const STATE_FULLY_CHARGED = 4;
const LEVEL_LABELS = {3: 'Low', 4: 'Critical', 6: 'Normal', 7: 'High', 8: 'Full'};
const LOW_LEVELS = [3, 4];

function call(path, iface, method, params, cancellable) {
    return new Promise((resolve, reject) => {
        Gio.DBus.system.call(UPOWER, path, iface, method, params, null,
            Gio.DBusCallFlags.NONE, 3000, cancellable, (connection, res) => {
                try {
                    resolve(connection.call_finish(res).recursiveUnpack());
                } catch (e) {
                    reject(e);
                }
            });
    });
}

/**
 * Asks UPower for every battery it knows about.
 *
 * @param {Gio.Cancellable} cancellable
 * @returns {Promise<object[]>}
 */
export async function listBatteries(cancellable = null) {
    const [paths] = await call(UPOWER_PATH, UPOWER, 'EnumerateDevices', null, cancellable);
    const devices = await Promise.all(paths.map(path =>
        call(path, 'org.freedesktop.DBus.Properties', 'GetAll',
            new GLib.Variant('(s)', [DEVICE_IFACE]), cancellable).catch(() => null)));

    return devices.filter(d => d?.[0].IsPresent).map(([props]) => ({
        nativePath: props.NativePath,
        serial: props.Serial,
        percentage: props.Percentage,
        state: props.State,
        level: props.BatteryLevel,
    }));
}

// UPower names a battery after its kernel power supply; for a Bluetooth LE
// pad the reading comes from BlueZ instead, known by the Bluetooth address.
export function batteryFor(controller, batteries) {
    const address = controller.address?.toLowerCase();
    return batteries.find(b => controller.powerSupplies.includes(b.nativePath)) ??
        batteries.find(b => address && b.serial?.toLowerCase() === address) ?? null;
}

export function batteryText(battery) {
    // Some drivers only report a coarse level, not a percentage.
    const charge = LEVEL_LABELS[battery.level] ?? `${Math.round(battery.percentage)}%`;
    if (battery.state === STATE_CHARGING)
        return `${charge} · Charging`;
    if (battery.state === STATE_FULLY_CHARGED)
        return `${charge} · Charged`;
    return charge;
}

// Whether it is time to charge or change the batteries: at lowPercentage, the
// level from the settings window, or below. A driver that only reports a
// coarse level says Low or Critical itself.
export function batteryIsLow(battery, lowPercentage) {
    if (battery.state === STATE_CHARGING || battery.state === STATE_FULLY_CHARGED)
        return false;
    if (battery.level in LEVEL_LABELS)
        return LOW_LEVELS.includes(battery.level);
    return battery.percentage <= lowPercentage;
}

export function batteryIcon(battery) {
    const level = Math.round(battery.percentage / 10) * 10;
    if (battery.state === STATE_FULLY_CHARGED)
        return 'battery-level-100-charged-symbolic';
    if (battery.state === STATE_CHARGING)
        return `battery-level-${level}-charging-symbolic`;
    return `battery-level-${level}-symbolic`;
}
