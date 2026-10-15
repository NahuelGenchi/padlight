// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {InputMonitor} from './inputMonitor.js';

// The ring around the centre of each stick. Games commonly ignore a zone of
// about this size; a stick that rests outside it can move a game by itself.
const DEAD_ZONE = 0.1;
// A stick rests once it has held this still for this long, this close to the
// centre.
const REST_STILL = 0.02;
const REST_MS = 600;
const REST_REACH = 0.4;
const TICK_MS = 200;

// Gauge sizes when the card has the menu to itself and when it shares it
const GAUGE_SIZE = 116;
const COMPACT_GAUGE_SIZE = 92;

const TAU = 2 * Math.PI;
const GREEN_ON_DARK = [0.25, 0.83, 0.25];
const GREEN_ON_LIGHT = [0.06, 0.49, 0.06];
const WARNING_ON_DARK = [1, 0.69, 0.18];
const WARNING_ON_LIGHT = [0.76, 0.37, 0];

const MINUS = '−';

function percent(value) {
    const rounded = Math.round(value * 100);
    return rounded < 0 ? `${MINUS}${-rounded}%` : `${rounded}%`;
}

// Theme text colour of an actor, as [r, g, b] from 0 to 1, and whether it
// is light, which means a dark menu.
function foregroundOf(actor) {
    const {red, green, blue} = actor.get_theme_node().get_foreground_color();
    const colour = [red / 255, green / 255, blue / 255];
    const [r, g, b] = colour;
    return [colour, 0.299 * r + 0.587 * g + 0.114 * b > 0.5];
}

// A real stick moves in a circle; the raw corners reach past it.
function insideCircle([x, y]) {
    const reach = Math.hypot(x, y);
    return reach > 1 ? [x / reach, y / reach] : [x, y];
}

// Follows one stick and works out where it rests: wherever it holds still
// for a moment, close to the centre.
class RestFinder {
    constructor() {
        this.rest = null;
        this._anchor = null;
        this._since = 0;
    }

    feed([x, y], now) {
        if (Math.hypot(x, y) > REST_REACH) {
            this._anchor = null;
            return;
        }
        if (!this._anchor || Math.hypot(x - this._anchor[0], y - this._anchor[1]) > REST_STILL) {
            this._anchor = [x, y];
            this._since = now;
        } else if (now - this._since >= REST_MS) {
            this.rest = [x, y];
        }
    }
}

// One stick's whole travel as a circle, with the dead zone, where the stick
// rests and where it is now.
const StickGauge = GObject.registerClass(
class StickGauge extends St.DrawingArea {
    _init(size) {
        super._init({width: size, height: size, x_align: Clutter.ActorAlign.CENTER});
        this._position = [0, 0];
        this._rest = null;
        this._drifting = false;
    }

    update(position, rest, drifting) {
        this._position = position;
        this._rest = rest;
        this._drifting = drifting;
        this.queue_repaint();
    }

    vfunc_repaint() {
        const cr = this.get_context();
        const [width, height] = this.get_surface_size();
        const [foreground, onDark] = foregroundOf(this);
        const radius = Math.min(width, height) / 2 - 2;
        cr.translate(width / 2, height / 2);
        cr.setLineWidth(1);

        cr.arc(0, 0, radius, 0, TAU);
        cr.setSourceRGBA(...foreground, 0.07);
        cr.fillPreserve();
        cr.setSourceRGBA(...foreground, 0.22);
        cr.stroke();

        cr.moveTo(-radius, 0);
        cr.lineTo(radius, 0);
        cr.moveTo(0, -radius);
        cr.lineTo(0, radius);
        cr.setSourceRGBA(...foreground, 0.1);
        cr.stroke();

        cr.arc(0, 0, radius * DEAD_ZONE, 0, TAU);
        cr.setSourceRGBA(...foreground, 0.16);
        cr.fillPreserve();
        cr.setSourceRGBA(...foreground, 0.4);
        cr.stroke();

        if (this._rest) {
            const [x, y] = insideCircle(this._rest);
            cr.arc(x * radius, y * radius, 6, 0, TAU);
            if (this._drifting)
                cr.setSourceRGB(...(onDark ? WARNING_ON_DARK : WARNING_ON_LIGHT));
            else
                cr.setSourceRGBA(...foreground, 0.55);
            cr.setLineWidth(1.5);
            cr.stroke();
        }

        const [x, y] = insideCircle(this._position);
        cr.arc(x * radius, y * radius, 3.5, 0, TAU);
        cr.setSourceRGB(...(onDark ? GREEN_ON_DARK : GREEN_ON_LIGHT));
        cr.fill();
        cr.$dispose();
    }
});

// How far a trigger is pulled, filling from the left.
const TriggerBar = GObject.registerClass(
class TriggerBar extends St.DrawingArea {
    _init() {
        super._init({height: 8, x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        this._value = 0;
    }

    update(value) {
        this._value = Math.min(Math.max(value, 0), 1);
        this.queue_repaint();
    }

    vfunc_repaint() {
        const cr = this.get_context();
        const [width, height] = this.get_surface_size();
        const [foreground, onDark] = foregroundOf(this);
        const pill = w => {
            const r = height / 2;
            cr.newSubPath();
            cr.arc(r, r, r, TAU / 4, TAU * 3 / 4);
            cr.arc(Math.max(w - r, r), r, r, -TAU / 4, TAU / 4);
            cr.closePath();
        };
        pill(width);
        cr.setSourceRGBA(...foreground, 0.14);
        cr.fill();
        if (this._value > 0) {
            pill(Math.max(width * this._value, height));
            cr.setSourceRGB(...(onDark ? GREEN_ON_DARK : GREEN_ON_LIGHT));
            cr.fill();
        }
        cr.$dispose();
    }
});

function label(styleClass, text = '') {
    return new St.Label({text, style_class: styleClass, x_align: Clutter.ActorAlign.CENTER});
}

// The stick and trigger check: both sticks before any dead zone, the
// triggers, and where each stick rests. It reads the controller only
// between start() and stop().
export const ControllerCheck = GObject.registerClass(
class ControllerCheck extends St.BoxLayout {
    /**
     * @param {object} params
     * @param {string} params.eventNode - controller to check
     * @param {string} params.monitorScript - program that reports its inputs
     * @param {number} params.height - the same as the picture's
     * @param {boolean} params.compact - leave room for more cards
     */
    _init({eventNode, monitorScript, height, compact}) {
        super._init({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'padlight-check',
            height,
            x_expand: true,
        });

        const sticks = new St.BoxLayout({style_class: 'padlight-check-sticks', x_expand: true});
        this._sticks = [['Left stick', 'lx', 'ly'], ['Right stick', 'rx', 'ry']].map(([name, x, y]) => {
            const column = new St.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL,
                style_class: 'padlight-check-stick',
                x_expand: true,
            });
            const stick = {
                axes: [x, y],
                gauge: new StickGauge(compact ? COMPACT_GAUGE_SIZE : GAUGE_SIZE),
                values: label('padlight-value padlight-check-values'),
                rest: label('padlight-caption padlight-dim'),
            };
            if (!compact)
                column.add_child(label('padlight-caption padlight-dim', name));
            column.add_child(stick.gauge);
            column.add_child(stick.values);
            column.add_child(stick.rest);
            sticks.add_child(column);
            return stick;
        });
        this.add_child(sticks);

        const triggers = new St.BoxLayout({style_class: 'padlight-check-triggers', x_expand: true});
        this._triggers = [['LT', 'lt'], ['RT', 'rt']].map(([name, axis]) => {
            const row = new St.BoxLayout({style_class: 'padlight-check-trigger', x_expand: true});
            const trigger = {axis, bar: new TriggerBar(), value: label('padlight-value padlight-check-percent')};
            row.add_child(label('padlight-caption padlight-dim', name));
            row.add_child(trigger.bar);
            row.add_child(trigger.value);
            triggers.add_child(row);
            return trigger;
        });
        this.add_child(triggers);

        this._monitor = new InputMonitor(['python3', monitorScript, '--raw', eventNode], state => {
            this._state = state;
            this._refresh();
        });
        this._tickId = 0;
        this._reset();

        this.connect('destroy', () => this._halt());
    }

    start() {
        this._monitor.start();
        // Notices a stick holding still even when no new reading comes.
        this._tickId ||= GLib.timeout_add(GLib.PRIORITY_DEFAULT, TICK_MS, () => {
            this._refresh();
            return GLib.SOURCE_CONTINUE;
        });
    }

    stop() {
        this._halt();
        this._reset();
    }

    _halt() {
        this._monitor.stop();
        if (this._tickId)
            GLib.source_remove(this._tickId);
        this._tickId = 0;
    }

    // Forgets where the sticks rest, so each look measures afresh.
    _reset() {
        this._state = {};
        this._finders = this._sticks.map(() => new RestFinder());
        this._refresh();
    }

    _refresh() {
        const now = GLib.get_monotonic_time() / 1000;
        this._sticks.forEach((stick, i) => {
            const position = stick.axes.map(axis => this._state[axis] ?? 0);
            const finder = this._finders[i];
            if (this._tickId)
                finder.feed(position, now);
            const reach = finder.rest ? Math.hypot(...finder.rest) : 0;
            const drifting = reach > DEAD_ZONE;

            stick.gauge.update(position, finder.rest, drifting);
            // Up counts as positive, as on a chart.
            stick.values.text = `X ${percent(position[0])}   Y ${percent(-position[1])}`;
            if (!finder.rest)
                stick.rest.text = 'Let go to see where it rests';
            else if (drifting)
                stick.rest.text = `Rests at ${percent(reach)}, may drift`;
            else
                stick.rest.text = `Rests at ${percent(reach)}`;
            stick.rest.style_class = drifting
                ? 'padlight-caption padlight-warning'
                : 'padlight-caption padlight-dim';
        });
        for (const trigger of this._triggers) {
            const value = this._state[trigger.axis] ?? 0;
            trigger.bar.update(value);
            trigger.value.text = percent(value);
        }
    }
});
