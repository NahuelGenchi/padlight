// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {drawController, drawPlaceholder} from './controllerArt.js';

const VIEW_HEIGHT = 236;
const PLACEHOLDER_HEIGHT = 124;
const IDLE = {buttons: []};

const SHAKE_DISTANCE = 3;
const SHAKE_STEP_MS = 45;
const SHAKE_STEPS = 8;

// A picture of the controller that mirrors what is pressed on the real one.
// It only listens to the controller between start() and stop(). Without a
// controller to listen to, it draws the outline of one as a placeholder.
export const ControllerView = GObject.registerClass(
class ControllerView extends St.DrawingArea {
    /**
     * @param {object} images - cairo surfaces: {art, glow}
     * @param {object} [params]
     * @param {string} [params.eventNode] - controller to mirror; a placeholder without
     * @param {string} [params.monitorScript] - program that reports its inputs
     * @param {number} [params.height] - the picture takes all the width it gets
     */
    _init(images, {eventNode = null, monitorScript = null, height = null} = {}) {
        super._init({
            height: height ?? (eventNode ? VIEW_HEIGHT : PLACEHOLDER_HEIGHT),
            x_expand: true,
        });

        this._images = images;
        this._argv = eventNode ? ['python3', monitorScript, eventNode] : null;
        this._state = IDLE;
        this._monitor = null;
        this._cancellable = null;

        this.connect('destroy', () => this._endMonitor());
    }

    vfunc_repaint() {
        const cr = this.get_context();
        const [width, height] = this.get_surface_size();
        const {red, green, blue} = this.get_theme_node().get_foreground_color();
        const foreground = [red / 255, green / 255, blue / 255];
        if (this._argv)
            drawController(cr, width, height, this._images, this._state, foreground);
        else
            drawPlaceholder(cr, width, height, this._images.art, foreground);
        cr.$dispose();
    }

    start() {
        if (this._monitor || !this._argv)
            return;
        try {
            this._monitor = Gio.Subprocess.new(this._argv,
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
        } catch (e) {
            console.error(`padlight: ${e.message}`);
            return;
        }
        this._cancellable = new Gio.Cancellable();
        this._readNext(
            new Gio.DataInputStream({base_stream: this._monitor.get_stdout_pipe()}),
            this._cancellable);
    }

    stop() {
        this._endMonitor();
        this._state = IDLE;
        this.queue_repaint();
    }

    // Rattles the picture for about as long as a vibration test lasts.
    shake() {
        this.remove_all_transitions();
        this.translation_x = -SHAKE_DISTANCE;
        this.ease({
            translation_x: SHAKE_DISTANCE,
            duration: SHAKE_STEP_MS,
            mode: Clutter.AnimationMode.EASE_IN_OUT_SINE,
            repeatCount: SHAKE_STEPS - 1,
            autoReverse: true,
            onStopped: () => (this.translation_x = 0),
        });
    }

    _endMonitor() {
        this._cancellable?.cancel();
        this._cancellable = null;
        this._monitor?.force_exit();
        this._monitor = null;
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
            try {
                this._state = JSON.parse(line);
            } catch {
            }
            this.queue_repaint();
            this._readNext(lines, cancellable);
        });
    }
});
