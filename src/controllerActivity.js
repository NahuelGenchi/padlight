// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

import {InputMonitor} from './inputMonitor.js';

// Reads controllers in the background while a feature needs to know when they
// are in use: Keep the screen awake and idle disconnect. A reader per
// controller runs monitor.py --activity, which opens the controller without
// taking it over and says at most every five seconds that it is in use.
export class ControllerActivity {
    /**
     * @param {string} monitorScript - monitor.py
     * @param {Function} onInput - called with the device path of a controller in use
     */
    constructor(monitorScript, onInput) {
        this._monitorScript = monitorScript;
        this._onInput = onInput;
        // A reader per controller, by device path, which is new on every
        // connection: a controller that comes back gets a new reader
        this._readers = new Map();
    }

    /**
     * Reads these controllers, and stops reading any others.
     *
     * @param {object[]} controllers - from scanControllers()
     */
    update(controllers) {
        const nodes = new Map(controllers.map(c => [c.path, c.eventNode]));
        for (const [path, reader] of this._readers) {
            if (!nodes.has(path)) {
                reader.stop();
                this._readers.delete(path);
            }
        }
        for (const [path, node] of nodes) {
            if (this._readers.has(path))
                continue;
            const reader = new InputMonitor(
                ['python3', this._monitorScript, '--activity', node], () => this._onInput(path));
            reader.start();
            this._readers.set(path, reader);
        }
    }

    destroy() {
        this.update([]);
    }
}
