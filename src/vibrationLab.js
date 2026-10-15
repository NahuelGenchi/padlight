// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Slider from 'resource:///org/gnome/shell/ui/slider.js';

import {VERTICAL} from './shellVersions.js';

// The same limits as rumble.py's, in the steps the sliders move in
const STRENGTH_STEP = 5;
const MIN_LENGTH_MS = 100;
const MAX_LENGTH_MS = 2000;
const LENGTH_STEP_MS = 100;

// What a new lab starts with: Test Vibration's buzz
export const DEFAULT_VIBRATION = {strong: 75, weak: 75, length: 400};

const strengthOf = value => Math.round(value * 100 / STRENGTH_STEP) * STRENGTH_STEP;
const lengthOf = value => MIN_LENGTH_MS +
    Math.round(value * (MAX_LENGTH_MS - MIN_LENGTH_MS) / LENGTH_STEP_MS) * LENGTH_STEP_MS;
const seconds = ms => `${(ms / 1000).toFixed(1)} s`;

// The vibration lab: how hard each motor runs and for how long, and Play.
// The values live in an object the menu keeps for the controller, so they
// outlive the card.
export const VibrationLab = GObject.registerClass(
class VibrationLab extends St.BoxLayout {
    /**
     * @param {object} params
     * @param {object} params.values - {strong, weak, length}: percent, percent, ms
     * @param {Function} params.onPlay - called with the values when Play is pressed
     * @param {number} params.height - the same as the picture's
     * @param {boolean} params.compact - leave room for more cards
     */
    _init({values, onPlay, height, compact}) {
        super._init({
            ...VERTICAL,
            style_class: compact ? 'padlight-lab padlight-lab-compact' : 'padlight-lab',
            height,
            x_expand: true,
        });
        this._values = values;
        // Centred in the space the picture takes on the other tabs
        this._content = new St.BoxLayout({
            ...VERTICAL,
            style_class: 'padlight-lab-content',
            x_expand: true,
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this._content);

        this._row('Strong motor · left', values.strong / 100, value => {
            values.strong = strengthOf(value);
            return `${values.strong}%`;
        });
        this._row('Weak motor · right', values.weak / 100, value => {
            values.weak = strengthOf(value);
            return `${values.weak}%`;
        });
        this._row('Length', (values.length - MIN_LENGTH_MS) / (MAX_LENGTH_MS - MIN_LENGTH_MS), value => {
            values.length = lengthOf(value);
            return seconds(values.length);
        });

        this._play = new St.Button({
            label: 'Play',
            style_class: 'padlight-button padlight-lab-play',
            can_focus: true,
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._play.connect('clicked', () => {
            onPlay({...values});
            this._playing(values.length);
        });
        this._content.add_child(this._play);

        this._playingId = 0;
        this.connect('destroy', () => this._stopPlaying());
    }

    // A caption with the value on its right, and a slider under them
    _row(caption, start, update) {
        const group = new St.BoxLayout({
            ...VERTICAL,
            style_class: 'padlight-lab-group',
            x_expand: true,
        });
        const top = new St.BoxLayout({x_expand: true});
        top.add_child(new St.Label({
            text: caption,
            style_class: 'padlight-caption padlight-dim',
            x_expand: true,
        }));
        const value = new St.Label({style_class: 'padlight-value padlight-lab-value'});
        top.add_child(value);
        group.add_child(top);

        const slider = new Slider.Slider(Math.min(Math.max(start, 0), 1));
        slider.accessible_name = caption;
        slider.connect('notify::value', () => (value.text = update(slider.value)));
        value.text = update(slider.value);
        group.add_child(slider);
        this._content.add_child(group);
    }

    // Says so on the button while the controller is vibrating.
    _playing(length) {
        this._stopPlaying();
        this._play.label = 'Playing…';
        this._playingId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, length, () => {
            this._playingId = 0;
            this._play.label = 'Play';
            return GLib.SOURCE_REMOVE;
        });
    }

    _stopPlaying() {
        if (this._playingId)
            GLib.source_remove(this._playingId);
        this._playingId = 0;
    }

    // Nothing to read from the controller; the card starts and stops every tab.
    start() {
    }

    stop() {
    }
});
