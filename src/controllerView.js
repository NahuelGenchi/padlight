// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {drawController, drawPlaceholder} from './controllerArt.js';
import {InputMonitor} from './inputMonitor.js';

export const VIEW_HEIGHT = 236;
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
        this._state = IDLE;
        this._monitor = eventNode
            ? new InputMonitor(['python3', monitorScript, eventNode], state => {
                this._state = state;
                this.queue_repaint();
            })
            : null;

        this.connect('destroy', () => this._monitor?.stop());
    }

    vfunc_repaint() {
        const cr = this.get_context();
        const [width, height] = this.get_surface_size();
        const {red, green, blue} = this.get_theme_node().get_foreground_color();
        const foreground = [red / 255, green / 255, blue / 255];
        if (this._monitor)
            drawController(cr, width, height, this._images, this._state, foreground);
        else
            drawPlaceholder(cr, width, height, this._images.art, foreground);
        cr.$dispose();
    }

    start() {
        this._monitor?.start();
    }

    stop() {
        this._monitor?.stop();
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
});
