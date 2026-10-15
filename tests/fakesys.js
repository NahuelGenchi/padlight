// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

// Builds made-up sysfs and /dev/input trees in a temporary folder, laid out
// like the kernel's, so scanControllers() can be tested without a controller.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const encoder = new TextEncoder();

export const GAMEPAD_KEYS = [0x130, 0x131, 0x133, 0x134, 0x136, 0x137, 0x13a, 0x13b, 0x13c, 0x13d, 0x13e];
export const RUMBLE = [0x50, 0x51, 0x58, 0x59, 0x5a, 0x60];

function mkdir(path) {
    GLib.mkdir_with_parents(path, 0o755);
}

function write(path, text) {
    mkdir(GLib.path_get_dirname(path));
    GLib.file_set_contents(path, encoder.encode(text));
}

function link(path, target) {
    mkdir(GLib.path_get_dirname(path));
    Gio.File.new_for_path(path).make_symbolic_link(target, null);
}

// One comma after every code, as in /sys/class/input/*/modalias
function codes(list = []) {
    return list.map(code => `${code.toString(16).toUpperCase()},`).join('');
}

export function modalias({bus, vendor, product, version = '0000', keys = GAMEPAD_KEYS, abs = [0, 1, 2, 3, 4, 5, 0x10, 0x11], ff = RUMBLE}) {
    const id = [bus, vendor, product, version].map(s => s.toUpperCase());
    return `input:b${id[0]}v${id[1]}p${id[2]}e${id[3]}-e0,1,3,15,k${codes(keys)}r` +
        `a${codes(abs)}m4,lsf${codes(ff)}w\n`;
}

// Deletes a tree without following links, and only one this module made
function removeTree(path) {
    const file = Gio.File.new_for_path(path);
    const info = file.query_info('standard::type', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
    if (info.get_file_type() === Gio.FileType.DIRECTORY) {
        const children = file.enumerate_children('standard::name',
            Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
        let child;
        while ((child = children.next_file(null)))
            removeTree(`${path}/${child.get_name()}`);
        children.close(null);
    }
    file.delete(null);
}

/**
 * Makes a tree with the given input devices. Each device has a bus, vendor,
 * product, name, and optionally version, kind ('usb', 'uhid' for Bluetooth LE,
 * 'virtual' for a made-up pad), driver, uniq, event and js numbers (null for
 * none), keys, ff, powerSupplies and hidraw numbers.
 *
 * @param {object[]} devices
 * @returns {{sys: string, dev: string, remove: Function}}
 */
export function makeTree(devices) {
    const root = GLib.dir_make_tmp('padlight-test-XXXXXX');
    const sys = `${root}/sys`;
    const dev = `${root}/dev/input`;
    mkdir(`${sys}/class/input`);
    mkdir(dev);

    devices.forEach((device, index) => {
        const number = 20 + index;
        const kind = device.kind ?? 'usb';
        let parent = null;
        if (kind === 'usb')
            parent = `${sys}/devices/pci0000:00/0000:00:14.0/usb1/1-${index + 1}/1-${index + 1}:1.0`;
        else if (kind === 'uhid')
            parent = `${sys}/devices/virtual/misc/uhid/0005:${device.vendor.toUpperCase()}:${device.product.toUpperCase()}.000${index + 1}`;
        const input = parent ? `${parent}/input/input${number}` : `${sys}/devices/virtual/input/input${number}`;

        write(`${input}/modalias`, modalias(device));
        write(`${input}/name`, `${device.name}\n`);
        write(`${input}/uniq`, `${device.uniq ?? ''}\n`);
        const event = device.event === undefined ? number : device.event;
        if (event !== null) {
            mkdir(`${input}/event${event}`);
            write(`${dev}/event${event}`, '');
        }
        if (device.js !== undefined && device.js !== null) {
            mkdir(`${input}/js${device.js}`);
            write(`${dev}/js${device.js}`, '');
        }
        if (parent) {
            mkdir(parent);
            link(`${input}/device`, parent);
            if (device.driver) {
                const driver = `${sys}/bus/${kind === 'usb' ? 'usb' : 'hid'}/drivers/${device.driver}`;
                mkdir(driver);
                link(`${parent}/driver`, driver);
            }
            for (const supply of device.powerSupplies ?? [])
                mkdir(`${parent}/power_supply/${supply}`);
            for (const hidraw of device.hidraw ?? []) {
                mkdir(`${parent}/hidraw/hidraw${hidraw}`);
                write(`${root}/dev/hidraw${hidraw}`, '');
            }
        }
        link(`${sys}/class/input/input${number}`, input);
    });

    return {
        sys,
        dev,
        remove: () => removeTree(root),
    };
}
