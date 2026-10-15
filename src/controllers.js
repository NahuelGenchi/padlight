// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {checklistButtons} from './checklist.js';
import {newerFirmware} from './firmware.js';

const BUS_BLUETOOTH = '0005';
const VENDOR_MICROSOFT = '045e';

// Key and force-feedback codes as they appear in an input modalias.
const BTN_GAMEPAD = '130';
const FF_RUMBLE = '50';

// input:b<bus>v<vendor>p<product>e<version>-e..k<keys>r..a..m..l..s..f<ff>w..
const MODALIAS = /^input:b([0-9A-F]{4})v([0-9A-F]{4})p([0-9A-F]{4})e([0-9A-F]{4})-e[0-9A-F,]*k([0-9A-F,]*)r[0-9A-F,]*a([0-9A-F,]*)m[0-9A-F,]*l[0-9A-F,]*s[0-9A-F,]*f([0-9A-F,]*)w/;

// Model number on the controller's label, by USB or Bluetooth product id.
const MODEL_NUMBERS = {
    '02d1': '1537',
    '02dd': '1537 / 1697',
    '02e3': '1698',
    '02ea': '1708',
    '02e0': '1708',
    '02fd': '1708',
    '0b20': '1708',
    '0b00': '1797',
    '0b05': '1797',
    '0b22': '1797',
    '0b0a': '1836',
    '0b0c': '1836',
    '0b21': '1836',
    '0b12': '1914',
    '0b13': '1914',
};

const decoder = new TextDecoder();

function readText(path) {
    try {
        const [, bytes] = GLib.file_get_contents(path);
        return decoder.decode(bytes).trim();
    } catch {
        return '';
    }
}

function linkTarget(path) {
    try {
        return GLib.canonicalize_filename(GLib.file_read_link(path), GLib.path_get_dirname(path));
    } catch {
        return null;
    }
}

function childNames(dir) {
    const names = [];
    try {
        const children = Gio.File.new_for_path(dir).enumerate_children(
            'standard::name', Gio.FileQueryInfoFlags.NONE, null);
        let info;
        while ((info = children.next_file(null)))
            names.push(info.get_name());
        children.close(null);
    } catch {
    }
    return names;
}

function modifiedTime(path) {
    try {
        return Gio.File.new_for_path(path)
            .query_info('time::modified', Gio.FileQueryInfoFlags.NONE, null)
            .get_attribute_uint64('time::modified');
    } catch {
        return null;
    }
}

// The serial number of the USB device that a controller's input device hangs
// from. USB devices are named by bus and port, such as 1-2 or 1-2.4; that
// stops the search before the root hub above (usb1), whose serial number is
// the same for every device on it.
function usbSerial(parent) {
    let dir = parent;
    for (let i = 0; i < 4 && dir; i++, dir = GLib.path_get_dirname(dir)) {
        if (/^\d+-[\d.]+$/.test(GLib.path_get_basename(dir)))
            return readText(`${dir}/serial`) || null;
    }
    return null;
}

// The version is binary-coded decimal: 0509 -> "5.9"
function firmwareLabel(version) {
    if (version === '0000')
        return null;
    return `${version.slice(0, 2).replace(/^0/, '')}.${version.slice(2).replace(/^0/, '')}`;
}

/**
 * Lists the Xbox controllers the kernel currently has, in joystick order.
 *
 * @param {string} sysRoot - where sysfs is mounted
 * @param {string} devDir - where the input device nodes are
 * @returns {object[]}
 */
export function scanControllers(sysRoot = '/sys', devDir = '/dev/input') {
    const classDir = `${sysRoot}/class/input`;
    const controllers = [];

    for (const entry of childNames(classDir)) {
        if (!/^input\d+$/.test(entry))
            continue;

        const match = MODALIAS.exec(readText(`${classDir}/${entry}/modalias`));
        if (!match)
            continue;
        const [bus, vendor, product, version, keys, axes, ff] = match.slice(1).map(s => s.toLowerCase());
        if (!keys.split(',').includes(BTN_GAMEPAD))
            continue;

        const path = linkTarget(`${classDir}/${entry}`) ?? `${classDir}/${entry}`;
        // Steam Input and game streaming add made-up Xbox pads of their own.
        // A Bluetooth pad is also "virtual" to the kernel, so those stay.
        if (path.includes('/devices/virtual/') && bus !== BUS_BLUETOOTH)
            continue;

        const parent = linkTarget(`${path}/device`);
        const driverPath = parent ? linkTarget(`${parent}/driver`) : null;
        const driver = driverPath ? GLib.path_get_basename(driverPath) : null;
        const kernelName = readText(`${path}/name`);

        const isXbox = vendor === VENDOR_MICROSOFT || /x-?box/i.test(kernelName) ||
            /^(xpad|xpadneo|xone)/.test(driver ?? '');
        if (!isXbox)
            continue;

        const nodes = childNames(path);
        const eventNode = nodes.find(n => /^event\d+$/.test(n)) ?? null;
        const jsNode = nodes.find(n => /^js\d+$/.test(n)) ?? null;
        if (!eventNode)
            continue;

        let connection = 'usb';
        if (bus === BUS_BLUETOOTH)
            connection = 'bluetooth';
        else if (/wireless receiver/i.test(kernelName))
            connection = 'adapter';

        controllers.push({
            path,
            name: kernelName.replace(/^Microsoft\s+/, '') || 'Xbox Controller',
            connection,
            model: vendor === VENDOR_MICROSOFT ? MODEL_NUMBERS[product] ?? null : null,
            firmware: vendor === VENDOR_MICROSOFT ? firmwareLabel(version) : null,
            // A newer firmware version, when this one is known to be old
            firmwareUpdate: vendor === VENDOR_MICROSOFT ? newerFirmware(product, version) : null,
            driver,
            // Bluetooth address of the controller, empty over USB
            address: readText(`${path}/uniq`) || null,
            // Serial number of a controller on a cable, for its nickname. The
            // adapter's own would be the same for each of its controllers.
            serial: connection === 'usb' && parent ? usbSerial(parent) : null,
            eventNode: `${devDir}/${eventNode}`,
            jsNode: jsNode ? `${devDir}/${jsNode}` : null,
            rumble: ff.split(',').includes(FF_RUMBLE),
            // What the button checklist asks for
            buttons: checklistButtons(keys.split(','), axes.split(',')),
            since: modifiedTime(`${devDir}/${eventNode}`),
            powerSupplies: parent ? childNames(`${parent}/power_supply`) : [],
            // Raw HID access, which some programs use instead of the input nodes
            hidrawNodes: parent
                ? childNames(`${parent}/hidraw`).map(n => `${GLib.path_get_dirname(devDir)}/${n}`)
                : [],
        });
    }

    const order = c => parseInt((c.jsNode ?? c.eventNode).match(/\d+$/)[0]);
    return controllers.sort((a, b) => order(a) - order(b));
}
