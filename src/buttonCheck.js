// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {ControllerView} from './controllerView.js';

// Room under the picture for the count and the reset
const ROW_HEIGHT = 30;

// The button checklist: the live picture, on which every button pressed so
// far stays lit, with how many are done and a reset. It reads the controller
// only between start() and stop(); the checklist itself outlives it.
export const ButtonCheck = GObject.registerClass(
class ButtonCheck extends St.BoxLayout {
    /**
     * @param {object} images - cairo surfaces: {art, glow}
     * @param {object} params
     * @param {string} params.eventNode - controller to check
     * @param {string} params.monitorScript - program that reports its inputs
     * @param {object} params.checklist - the controller's Checklist
     * @param {number} params.height - the same as the picture's
     */
    _init(images, {eventNode, monitorScript, checklist, height}) {
        super._init({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'padlight-buttons',
            height,
            x_expand: true,
        });
        this._checklist = checklist;

        this._view = new ControllerView(images, {
            eventNode,
            monitorScript,
            height: height - ROW_HEIGHT,
            checklist,
            onChecked: () => this._update(),
        });
        this.add_child(this._view);

        const row = new St.BoxLayout({style_class: 'padlight-buttons-row', x_expand: true});
        this._count = new St.Label({
            style_class: 'padlight-buttons-count',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        row.add_child(this._count);
        this._reset = new St.Button({
            label: 'Reset',
            style_class: 'padlight-chip',
            can_focus: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._reset.connect('clicked', () => {
            this._checklist.reset();
            this._update();
            this._view.queue_repaint();
        });
        row.add_child(this._reset);
        this.add_child(row);

        this._update();
    }

    start() {
        this._view.start();
    }

    stop() {
        this._view.stop();
    }

    _update() {
        const {count, total, done} = this._checklist;
        this._count.text = done
            ? 'Every button responded'
            : `Press every button: ${count} of ${total}`;
        this._count.style_class = done
            ? 'padlight-buttons-count padlight-accent'
            : 'padlight-buttons-count padlight-dim';
        this._reset.reactive = count > 0;
        this._reset.opacity = count > 0 ? 255 : 120;
    }
});
