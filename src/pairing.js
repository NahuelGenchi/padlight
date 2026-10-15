// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const BLUEZ = 'org.bluez';
const ADAPTER = 'org.bluez.Adapter1';
const DEVICE = 'org.bluez.Device1';
const OBJECT_MANAGER = 'org.freedesktop.DBus.ObjectManager';
const PROPERTIES = 'org.freedesktop.DBus.Properties';

// How long to look for a controller in pairing mode, and to wait for BlueZ
const SEARCH_SECONDS = 30;
const PAIR_TIMEOUT_MS = 30000;
const CONNECT_TIMEOUT_MS = 15000;

// Xbox controllers announce themselves by name while they wait to pair.
const XBOX_NAME = /xbox/i;

// What went wrong, in words, for the errors BlueZ gives most often
const REASONS = {
    'org.bluez.Error.AuthenticationFailed': 'the controller turned it down',
    'org.bluez.Error.AuthenticationRejected': 'the controller turned it down',
    'org.bluez.Error.AuthenticationCanceled': 'it was canceled',
    'org.bluez.Error.AuthenticationTimeout': 'the controller stopped answering',
    'org.bluez.Error.ConnectionAttemptFailed': 'the controller could not be reached',
    'org.bluez.Error.InProgress': 'another pairing is under way',
};

function call(path, iface, method, params, timeout, cancellable) {
    return new Promise((resolve, reject) => {
        Gio.DBus.system.call(BLUEZ, path, iface, method, params, null,
            Gio.DBusCallFlags.NO_AUTO_START, timeout, cancellable, (bus, res) => {
                try {
                    resolve(bus.call_finish(res));
                } catch (e) {
                    reject(e);
                }
            });
    });
}

const errorName = e => Gio.DBusError.get_remote_error(e);

function reason(e) {
    if (e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.TIMED_OUT))
        return 'the controller took too long to answer';
    const known = REASONS[errorName(e)];
    if (known)
        return known;
    Gio.DBusError.strip_remote_error(e);
    return e.message;
}

/**
 * Finds Xbox controllers in pairing mode and pairs, trusts and connects the
 * one chosen, through BlueZ. It only talks to BlueZ between search() and the
 * end of the pairing, or cancel().
 *
 * state is one of idle, starting, unavailable, off, searching, not-found,
 * stopped, pairing, connected and failed.
 */
export const Pairing = GObject.registerClass({
    Signals: {'changed': {}},
}, class Pairing extends GObject.Object {
    _init() {
        super._init();
        this.state = 'idle';
        // Controllers waiting to pair: [{path, name}]
        this.found = [];
        // The name of the controller being paired
        this.target = null;
        // Why the pairing failed
        this.reason = null;

        this._cancellable = null;
        this._adapter = null;
        this._devices = new Map();
        this._subscriptions = [];
        this._timeoutId = 0;
        this._discovering = false;
        this._pairingPath = null;
    }

    _set(state, details = {}) {
        Object.assign(this, {state, ...details});
        this.emit('changed');
    }

    async search() {
        this._reset();
        const cancellable = this._cancellable = new Gio.Cancellable();
        this._set('starting', {found: [], target: null, reason: null});

        let objects;
        try {
            [objects] = (await call('/', OBJECT_MANAGER, 'GetManagedObjects', null, -1, cancellable))
                .recursiveUnpack();
        } catch (e) {
            if (!cancellable.is_cancelled())
                this._set('unavailable');
            return;
        }
        if (cancellable.is_cancelled())
            return;

        const adapters = Object.entries(objects).filter(([, ifaces]) => ADAPTER in ifaces);
        const adapter = adapters.find(([, ifaces]) => ifaces[ADAPTER].Powered);
        if (!adapter) {
            this._set(adapters.length ? 'off' : 'unavailable');
            return;
        }
        this._adapter = adapter[0];
        this._watch();
        for (const [path, ifaces] of Object.entries(objects)) {
            if (DEVICE in ifaces)
                this._devices.set(path, ifaces[DEVICE]);
        }

        try {
            await call(this._adapter, ADAPTER, 'StartDiscovery', null, -1, cancellable);
            this._discovering = true;
        } catch (e) {
            if (cancellable.is_cancelled())
                return;
            // Someone else's search finds the controllers just as well.
            if (errorName(e) !== 'org.bluez.Error.InProgress') {
                this._finish('failed', {reason: reason(e)});
                return;
            }
        }

        this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, SEARCH_SECONDS, () => {
            this._timeoutId = 0;
            this._finish(this.found.length ? 'stopped' : 'not-found');
            return GLib.SOURCE_REMOVE;
        });
        this._set('searching', {found: this._waiting()});
    }

    async pair(path) {
        const device = this.found.find(d => d.path === path);
        if (this.state !== 'searching' || !device)
            return;
        // The state changes at once, so a second click pairs nothing else.
        const cancellable = this._cancellable;
        this._clearTimeout();
        this._pairingPath = path;
        this._set('pairing', {target: device.name});
        // Searching while pairing slows Bluetooth down.
        await this._stopDiscovery();
        if (cancellable.is_cancelled())
            return;

        try {
            await call(path, DEVICE, 'Pair', null, PAIR_TIMEOUT_MS, cancellable);
        } catch (e) {
            if (cancellable.is_cancelled())
                return;
            if (errorName(e) !== 'org.bluez.Error.AlreadyExists') {
                // BlueZ may still be trying after the wait is over.
                if (e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.TIMED_OUT))
                    call(path, DEVICE, 'CancelPairing', null, -1, null).catch(() => {});
                this._finish('failed', {reason: reason(e)});
                return;
            }
        }
        try {
            // Trusted lets the controller connect again by itself later.
            await call(path, PROPERTIES, 'Set',
                new GLib.Variant('(ssv)', [DEVICE, 'Trusted', new GLib.Variant('b', true)]),
                -1, cancellable);
            await call(path, DEVICE, 'Connect', null, CONNECT_TIMEOUT_MS, cancellable);
        } catch (e) {
            if (cancellable.is_cancelled())
                return;
            if (errorName(e) !== 'org.bluez.Error.AlreadyConnected') {
                this._finish('failed', {reason: reason(e)});
                return;
            }
        }
        this._finish('connected');
    }

    // Stops searching, and any pairing under way.
    cancel() {
        if (this._pairingPath)
            call(this._pairingPath, DEVICE, 'CancelPairing', null, -1, null).catch(() => {});
        this._reset();
        if (this.state !== 'idle')
            this._set('idle');
    }

    // A search ends with the menu. A pairing carries on, and its result is
    // shown the next time the menu opens.
    menuClosed() {
        if (this.state !== 'pairing')
            this.cancel();
    }

    destroy() {
        this.cancel();
    }

    // Controllers heard during this search (BlueZ gives those a signal
    // strength) that are not paired yet. Same names get a number.
    _waiting() {
        const found = [...this._devices]
            .filter(([path, props]) => path.startsWith(`${this._adapter}/`) &&
                props.RSSI !== undefined && !props.Paired && XBOX_NAME.test(props.Name ?? ''))
            .map(([path, props]) => ({path, name: props.Name}))
            .sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
        const seen = new Map();
        for (const device of found) {
            const count = (seen.get(device.name) ?? 0) + 1;
            seen.set(device.name, count);
            if (count > 1)
                device.name = `${device.name} (${count})`;
        }
        return found;
    }

    _update() {
        if (this.state !== 'searching')
            return;
        const found = this._waiting();
        if (JSON.stringify(found) !== JSON.stringify(this.found))
            this._set('searching', {found});
    }

    _watch() {
        const subscribe = (iface, signal, path, handler) => this._subscriptions.push(
            Gio.DBus.system.signal_subscribe(BLUEZ, iface, signal, path, null,
                Gio.DBusSignalFlags.NONE, (...args) => handler(args[5].recursiveUnpack())));

        subscribe(OBJECT_MANAGER, 'InterfacesAdded', '/', ([path, ifaces]) => {
            if (DEVICE in ifaces) {
                this._devices.set(path, ifaces[DEVICE]);
                this._update();
            }
        });
        subscribe(OBJECT_MANAGER, 'InterfacesRemoved', '/', ([path, ifaces]) => {
            if (ifaces.includes(DEVICE)) {
                this._devices.delete(path);
                this._update();
            }
        });
        this._subscriptions.push(Gio.DBus.system.signal_subscribe(BLUEZ, PROPERTIES,
            'PropertiesChanged', null, DEVICE, Gio.DBusSignalFlags.NONE,
            (_bus, _sender, path, _iface, _signal, params) => {
                const [, changed, invalidated] = params.recursiveUnpack();
                const props = {...this._devices.get(path), ...changed};
                for (const name of invalidated)
                    delete props[name];
                this._devices.set(path, props);
                this._update();
            }));
    }

    async _stopDiscovery() {
        if (!this._discovering)
            return;
        this._discovering = false;
        try {
            await call(this._adapter, ADAPTER, 'StopDiscovery', null, -1, null);
        } catch {
        }
    }

    _clearTimeout() {
        if (this._timeoutId)
            GLib.source_remove(this._timeoutId);
        this._timeoutId = 0;
    }

    // Lets go of BlueZ: no search, no signals, no calls under way.
    _reset() {
        this._clearTimeout();
        this._stopDiscovery();
        this._subscriptions.forEach(id => Gio.DBus.system.signal_unsubscribe(id));
        this._subscriptions = [];
        this._cancellable?.cancel();
        this._cancellable = null;
        this._devices.clear();
        this._pairingPath = null;
    }

    _finish(state, details = {}) {
        this._reset();
        this._set(state, details);
    }
});

// A menu entry that acts without closing the menu, so the states show
const ActionItem = GObject.registerClass(
class ActionItem extends PopupMenu.PopupBaseMenuItem {
    _init(text, iconName, onActivate) {
        super._init();
        if (iconName)
            this.add_child(new St.Icon({icon_name: iconName, style_class: 'popup-menu-icon'}));
        this.label = new St.Label({text, y_align: Clutter.ActorAlign.CENTER});
        this.add_child(this.label);
        this.label_actor = this.label;
        this._onActivate = onActivate;
    }

    activate(_event) {
        this._onActivate();
    }
});

// What the menu says in each state, and what its entry does then
const STATES = {
    idle: {action: 'Pair a Controller'},
    starting: {action: 'Stop Searching', status: 'Looking for Bluetooth…'},
    unavailable: {action: 'Pair a Controller', status: 'Bluetooth is not available on this computer.'},
    off: {action: 'Pair a Controller', status: 'Bluetooth is off. Turn it on in the system menu, then try again.'},
    searching: {
        action: 'Stop Searching',
        status: 'Searching… Hold the pair button on top of the controller until the Xbox button flashes quickly.',
    },
    'not-found': {
        action: 'Search Again',
        status: 'No controller found. Hold the pair button until the Xbox button flashes quickly, then search again.',
    },
    stopped: {
        action: 'Search Again',
        status: `The search stopped after ${SEARCH_SECONDS} seconds. Search again, and choose the controller while its Xbox button flashes quickly.`,
    },
    pairing: {status: p => `Pairing with ${p.target}…`},
    connected: {action: 'Pair Another Controller', status: p => `${p.target} is paired and connected.`},
    failed: {action: 'Try Again', status: p => `Could not pair: ${p.reason}. Try again, or use Bluetooth Settings.`},
};

/**
 * The menu's "Pair a Controller" entry, with the search and its results
 * below it. It shows the state of a Pairing, which outlives the menu.
 */
export class PairingSection extends PopupMenu.PopupMenuSection {
    constructor(pairing) {
        super();
        this._pairing = pairing;

        this._action = new ActionItem('', null, () => {
            if (['starting', 'searching'].includes(pairing.state))
                pairing.cancel();
            else
                pairing.search();
        });
        this.addMenuItem(this._action);

        this._status = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        // The card sets the menu's width, and the status wraps to it.
        this._statusLabel = new St.Label({
            style_class: 'padlight-pair-status', x_expand: true, min_width: 0, natural_width: 0,
        });
        this._statusLabel.clutter_text.line_wrap = true;
        this._statusLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        this._status.add_child(this._statusLabel);
        this.addMenuItem(this._status);

        this._controllers = new PopupMenu.PopupMenuSection();
        this._rows = new Map(); // object path: row
        this._shownFound = null;
        this.addMenuItem(this._controllers);

        this._changedId = pairing.connect('changed', () => this._sync());
        this.connect('destroy', () => pairing.disconnect(this._changedId));
        this._sync();
    }

    _sync() {
        const pairing = this._pairing;
        const focus = global.stage.get_key_focus();
        const hadFocus = Boolean(focus) && this.actor.contains(focus);
        const focusedPath = [...this._rows].find(([, row]) => row === focus)?.[0];

        const {action, status} = STATES[pairing.state];
        if (!action)
            this._release([this._action]);
        this._action.visible = Boolean(action);
        this._action.label.text = action ?? '';
        const text = typeof status === 'function' ? status(pairing) : status;
        this._status.visible = Boolean(text);
        this._statusLabel.text = text ?? '';

        // Rows are rebuilt only when the list changes, and hidden otherwise:
        // the row just clicked must outlive its own click.
        const found = JSON.stringify(pairing.found);
        const searching = pairing.state === 'searching';
        if (!searching || found !== this._shownFound)
            this._release(this._rows.values());
        if (found !== this._shownFound) {
            this._shownFound = found;
            this._controllers.removeAll();
            this._rows = new Map(pairing.found.map(({path, name}) => {
                const row = new ActionItem(name, 'input-gaming-symbolic', () => pairing.pair(path));
                this._controllers.addMenuItem(row);
                return [path, row];
            }));
        }
        this._controllers.actor.visible = searching;

        // When the entry with the keyboard focus goes away, the focus moves to
        // the same controller's new row, the entry shown now, or the section
        // until an entry is shown, so the arrow keys keep working.
        const now = global.stage.get_key_focus();
        if (!hadFocus || (now && now !== this.actor && this.actor.contains(now)))
            return;
        const next = (searching && this._rows.get(focusedPath)) ||
            (this._action.visible && this._action) || this.actor;
        next.grab_key_focus();
    }

    // A menu forgets an item under the pointer that goes away only when the
    // item sits directly in it. The menus around this section would keep it
    // and touch it after it is gone, so items let go first.
    _release(items) {
        for (const item of items)
            item.active = false;
    }

    destroy() {
        this._release([this._action, ...this._rows.values()]);
        super.destroy();
    }
}
