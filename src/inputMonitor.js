// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

// Runs monitor.py for one controller between start() and stop(), and hands
// every state it prints to onState.
export class InputMonitor {
    /**
     * @param {string[]} argv - the monitor and its arguments
     * @param {Function} onState - called with each state, parsed
     */
    constructor(argv, onState) {
        this._argv = argv;
        this._onState = onState;
        this._process = null;
        this._cancellable = null;
    }

    start() {
        if (this._process)
            return;
        try {
            this._process = Gio.Subprocess.new(this._argv,
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
        } catch (e) {
            console.error(`padlight: ${e.message}`);
            return;
        }
        this._cancellable = new Gio.Cancellable();
        this._readNext(
            new Gio.DataInputStream({base_stream: this._process.get_stdout_pipe()}),
            this._cancellable);
    }

    stop() {
        this._cancellable?.cancel();
        this._cancellable = null;
        this._process?.force_exit();
        this._process = null;
    }

    _readNext(lines, cancellable) {
        lines.read_line_async(GLib.PRIORITY_DEFAULT, cancellable, (stream, res) => {
            let line;
            try {
                [line] = stream.read_line_finish_utf8(res);
            } catch {
                return;
            }
            // The monitor ends by itself when the controller goes away.
            if (line === null)
                return;
            let state = null;
            try {
                state = JSON.parse(line);
            } catch {
            }
            if (state)
                this._onState(state);
            this._readNext(lines, cancellable);
        });
    }
}
