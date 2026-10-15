// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const SESSION_MANAGER = ['org.gnome.SessionManager', '/org/gnome/SessionManager',
    'org.gnome.SessionManager'];
// org.gnome.SessionManager.Inhibit's flag for keeping the session from going idle
const INHIBIT_IDLE = 8;
// How long the inhibitor stays after the last input: twice the time monitor.py
// waits between saying that a controller is in use
const HOLD_SECONDS = 10;

// Keeps the screen from dimming and locking while a controller is in use, as
// a video player does while it plays. The background readers say when a
// controller is used, and the session's idle inhibitor is held until no
// controller has been used for a few seconds. GNOME counts idle time again
// from the moment the inhibitor goes, so the screen then dims, blanks and
// locks after the delays from Settings › Power, as it would after the last
// key press.
export class KeepAwake {
    constructor() {
        this._timerId = 0;
        // Whether the inhibitor should be held, and its cookie once it is
        this._holding = false;
        this._cookie = null;
        this._failed = false;
    }

    /**
     * A controller was used: the screen stays awake for a few seconds more.
     */
    input() {
        this._hold();
        this._stopTimer();
        this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, HOLD_SECONDS, () => {
            this._timerId = 0;
            this.release();
            return GLib.SOURCE_REMOVE;
        });
    }

    _stopTimer() {
        if (this._timerId)
            GLib.source_remove(this._timerId);
        this._timerId = 0;
    }

    _hold() {
        if (this._holding)
            return;
        this._holding = true;
        // Not cancelled: an inhibitor granted after Padlight let go, or one
        // more than it needs, is released as soon as its cookie arrives.
        Gio.DBus.session.call(...SESSION_MANAGER, 'Inhibit',
            new GLib.Variant('(susu)', ['Padlight', 0, 'A game controller is in use', INHIBIT_IDLE]),
            new GLib.VariantType('(u)'), Gio.DBusCallFlags.NONE, -1, null, (connection, res) => {
                let cookie;
                try {
                    [cookie] = connection.call_finish(res).deepUnpack();
                } catch (e) {
                    if (!this._failed)
                        console.error(`padlight: cannot keep the screen awake: ${e.message}`);
                    this._failed = true;
                    this._holding = false;
                    return;
                }
                if (this._holding && this._cookie === null)
                    this._cookie = cookie;
                else
                    this._uninhibit(cookie);
            });
    }

    /**
     * Lets the screen go idle again now, as when the switch goes off or the
     * last controller leaves.
     */
    release() {
        this._stopTimer();
        if (!this._holding)
            return;
        this._holding = false;
        if (this._cookie !== null)
            this._uninhibit(this._cookie);
        this._cookie = null;
    }

    _uninhibit(cookie) {
        Gio.DBus.session.call(...SESSION_MANAGER, 'Uninhibit', new GLib.Variant('(u)', [cookie]),
            null, Gio.DBusCallFlags.NONE, -1, null, (connection, res) => {
                try {
                    connection.call_finish(res);
                } catch (e) {
                    console.error(`padlight: ${e.message}`);
                }
            });
    }

    destroy() {
        this.release();
    }
}
