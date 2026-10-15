// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

import GLib from 'gi://GLib';

// The times Padlight Settings offers, in minutes
export const IDLE_MINUTES = [5, 10, 15, 30];

/**
 * Which of the offered times is nearest to a time, for showing one set
 * elsewhere, such as with gsettings.
 *
 * @param {number} minutes
 * @returns {number} its index in IDLE_MINUTES
 */
export function nearestChoice(minutes) {
    let nearest = 0;
    for (const [i, choice] of IDLE_MINUTES.entries()) {
        if (Math.abs(choice - minutes) < Math.abs(IDLE_MINUTES[nearest] - minutes))
            nearest = i;
    }
    return nearest;
}

/**
 * Whether idle disconnect looks after a controller: one on Bluetooth, which
 * can be disconnected by its address. Wired ones and those on the Xbox
 * adapter are left alone.
 *
 * @param {object} controller - from scanControllers()
 * @returns {boolean}
 */
export const canIdleDisconnect = controller =>
    controller.connection === 'bluetooth' && Boolean(controller.address);

// Which watched controllers have gone idle. The time comes in from outside, in
// seconds, so this part can be tested without waiting.
export class IdleWatch {
    constructor() {
        // When each watched controller was last used, or first watched, by device path
        this._since = new Map();
    }

    /**
     * Watches these controllers, counting a new one from now, and forgets the
     * others.
     *
     * @param {string[]} paths - the controllers' device paths
     * @param {number} now - seconds
     */
    update(paths, now) {
        const keep = new Set(paths);
        for (const path of [...this._since.keys()]) {
            if (!keep.has(path))
                this._since.delete(path);
        }
        for (const path of paths) {
            if (!this._since.has(path))
                this._since.set(path, now);
        }
    }

    /**
     * A watched controller was used: its count starts again.
     *
     * @param {string} path
     * @param {number} now - seconds
     */
    input(path, now) {
        if (this._since.has(path))
            this._since.set(path, now);
    }

    /**
     * When the next controller goes idle, if nothing is used before then.
     *
     * @param {number} seconds - how long without input counts as idle
     * @returns {number|null} seconds, or null while nothing is watched
     */
    next(seconds) {
        return this._since.size ? Math.min(...this._since.values()) + seconds : null;
    }

    /**
     * The controllers idle for at least the given time. Each is counted again
     * from now, so one still connected a full time later is due again.
     *
     * @param {number} now - seconds
     * @param {number} seconds - how long without input counts as idle
     * @returns {string[]} their device paths
     */
    due(now, seconds) {
        const due = [...this._since].filter(([, since]) => now - since >= seconds).map(([path]) => path);
        for (const path of due)
            this._since.set(path, now);
        return due;
    }
}

const now = () => GLib.get_monotonic_time() / 1e6;

// Disconnects a Bluetooth controller that has had no input for the chosen
// time, as consoles turn an unused controller off to save its battery. Input
// comes from the background readers; a timer waits for the next controller
// to go idle.
export class IdleDisconnect {
    /**
     * @param {Function} disconnect - called with a controller to disconnect
     */
    constructor(disconnect) {
        this._disconnect = disconnect;
        this._watch = new IdleWatch();
        this._controllers = new Map();
        this._seconds = 0;
        this._timerId = 0;
    }

    /**
     * Watches these controllers, and no others.
     *
     * @param {object[]} controllers - the ones canIdleDisconnect() allows, or none while the switch is off
     * @param {number} minutes - how long without input before a disconnect
     */
    update(controllers, minutes) {
        // A new time counts every controller from now.
        if (minutes * 60 !== this._seconds) {
            this._seconds = minutes * 60;
            this._watch = new IdleWatch();
        }
        this._controllers = new Map(controllers.map(c => [c.path, c]));
        this._watch.update([...this._controllers.keys()], now());
        this._schedule();
    }

    /**
     * A controller was used.
     *
     * @param {string} path - its device path
     */
    input(path) {
        // The timer stays: when it comes, it finds this one not idle yet and
        // waits again.
        this._watch.input(path, now());
    }

    _schedule() {
        this._stopTimer();
        const next = this._watch.next(this._seconds);
        if (next === null)
            return;
        const delay = Math.max(0, Math.ceil((next - now()) * 1000));
        this._timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this._timerId = 0;
            for (const path of this._watch.due(now(), this._seconds)) {
                const controller = this._controllers.get(path);
                if (controller)
                    this._disconnect(controller);
            }
            this._schedule();
            return GLib.SOURCE_REMOVE;
        });
    }

    _stopTimer() {
        if (this._timerId)
            GLib.source_remove(this._timerId);
        this._timerId = 0;
    }

    destroy() {
        this._stopTimer();
        this._controllers.clear();
    }
}
