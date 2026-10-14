// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {formatTime} from 'resource:///org/gnome/shell/misc/dateUtils.js';

import {batteryIcon, batteryIsLow, batteryText} from './battery.js';
import {ControllerCheck} from './controllerCheck.js';
import {ControllerView, VIEW_HEIGHT} from './controllerView.js';

const GAP = 8;
const TILES = 4;
// Picture height when several controllers share the menu
const COMPACT_VIEW_HEIGHT = 186;

// What the card's tabs show in the space for the picture
const MODES = [['picture', 'Picture'], ['sticks', 'Sticks']];

const CONNECTIONS = {
    usb: {label: 'Wired (USB)', icon: null},
    bluetooth: {label: 'Bluetooth', icon: 'bluetooth-active-symbolic'},
    adapter: {label: 'Xbox adapter', icon: 'network-wireless-symbolic'},
};

function header(logo, title, subtitle, active) {
    const box = new St.BoxLayout({style_class: 'padlight-header'});
    box.add_child(new St.Icon({
        gicon: logo,
        style_class: active ? 'padlight-logo padlight-accent' : 'padlight-logo padlight-faint',
        y_align: Clutter.ActorAlign.CENTER,
    }));
    const text = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    text.add_child(new St.Label({text: title, style_class: 'padlight-title'}));
    text.add_child(new St.Label({text: subtitle, style_class: 'padlight-subtitle padlight-dim'}));
    box.add_child(text);
    return box;
}

function tile({caption, value, icon, warning}) {
    const box = new St.BoxLayout({style_class: 'padlight-tile', x_expand: true});
    box.add_child(new St.Icon({
        ...icon,
        style_class: warning ? 'padlight-tile-icon padlight-warning' : 'padlight-tile-icon',
        y_align: Clutter.ActorAlign.CENTER,
    }));
    const text = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    text.add_child(new St.Label({text: caption, style_class: 'padlight-caption padlight-dim'}));
    text.add_child(new St.Label({text: value, style_class: 'padlight-value'}));
    box.add_child(text);
    return box;
}

function button(label) {
    return new St.Button({
        label,
        style_class: 'padlight-button',
        can_focus: true,
        x_expand: true,
    });
}

// Two equal columns; a last child without a neighbour takes the whole row.
function grid(children) {
    const layout = new Clutter.GridLayout({
        column_homogeneous: true,
        column_spacing: GAP,
        row_spacing: GAP,
    });
    const box = new St.Widget({layout_manager: layout, x_expand: true});
    children.forEach((child, i) => {
        const alone = i % 2 === 0 && i === children.length - 1;
        layout.attach(child, i % 2, Math.floor(i / 2), alone ? 2 : 1, 1);
    });
    return box;
}

function batteryFact(controller, battery) {
    if (battery) {
        return {
            caption: 'Battery',
            value: batteryText(battery),
            icon: {icon_name: batteryIcon(battery)},
            warning: batteryIsLow(battery),
        };
    }
    // The kernel's USB driver for Xbox pads does not read the battery; on a
    // cable the controller runs from the computer anyway.
    if (controller.connection === 'usb')
        return {caption: 'Battery', value: 'On USB power', icon: {icon_name: 'ac-adapter-symbolic'}};
    return {caption: 'Battery', value: 'Unknown', icon: {icon_name: 'battery-missing-symbolic'}};
}

// Everything worth telling about a controller, the most useful first
function facts(controller, battery, usbIcon) {
    const connection = CONNECTIONS[controller.connection];
    const list = [
        batteryFact(controller, battery),
        {
            caption: 'Connection',
            value: connection.label,
            icon: connection.icon ? {icon_name: connection.icon} : {gicon: usbIcon},
        },
    ];
    if (controller.model)
        list.push({caption: 'Model', value: controller.model, icon: {icon_name: 'input-gaming-symbolic'}});
    if (controller.firmware) {
        list.push({
            caption: 'Firmware',
            value: controller.firmware,
            icon: {icon_name: 'application-x-firmware-symbolic'},
        });
    }
    if (controller.driver)
        list.push({caption: 'Driver', value: controller.driver, icon: {icon_name: 'emblem-system-symbolic'}});
    list.push({
        caption: 'Device',
        value: controller.jsNode ?? controller.eventNode,
        icon: {icon_name: 'utilities-terminal-symbolic'},
    });
    return list;
}

const Card = GObject.registerClass(
class Card extends St.BoxLayout {
    _init() {
        super._init({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'padlight-card',
        });
        this._onDark = null;
    }

    // Tells the stylesheet whether the menu around the card is dark or light,
    // whichever theme draws it. The card sets no text colour of its own, so
    // what it reads here is always the menu's.
    vfunc_style_changed() {
        super.vfunc_style_changed();
        const {red, green, blue} = this.get_theme_node().get_foreground_color();
        const onDark = 0.299 * red + 0.587 * green + 0.114 * blue > 127;
        if (onDark === this._onDark)
            return;
        this._onDark = onDark;
        this.remove_style_class_name(onDark ? 'padlight-on-light' : 'padlight-on-dark');
        this.add_style_class_name(onDark ? 'padlight-on-dark' : 'padlight-on-light');
    }
});

// One connected controller: live picture or stick check, the facts about it
// and its actions. Reads the controller only between start() and stop().
export const ControllerCard = GObject.registerClass({
    Signals: {
        'rumble': {},
        'disconnect': {},
        'mode-changed': {param_types: [GObject.TYPE_STRING]},
    },
}, class ControllerCard extends Card {
    /**
     * @param {object} controller - an entry from scanControllers()
     * @param {object|null} battery - its entry from listBatteries(), if any
     * @param {object} assets - {images, logo, usbIcon, monitorScript}
     * @param {boolean} compact - leave room for more cards
     * @param {string} mode - what the card shows first: picture or sticks
     */
    _init(controller, battery, assets, compact = false, mode = 'picture') {
        super._init();

        const since = controller.since
            ? `Connected since ${formatTime(GLib.DateTime.new_from_unix_local(controller.since))}`
            : 'Connected';
        this.add_child(header(assets.logo, controller.name, since, true));

        const height = compact ? COMPACT_VIEW_HEIGHT : VIEW_HEIGHT;
        this._view = new ControllerView(assets.images, {
            eventNode: controller.eventNode,
            monitorScript: assets.monitorScript,
            height,
        });
        this._check = new ControllerCheck({
            eventNode: controller.eventNode,
            monitorScript: assets.monitorScript,
            height,
            compact,
        });
        const hero = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'padlight-hero',
        });
        hero.add_child(this._view);
        hero.add_child(this._check);
        this.add_child(hero);

        const tabs = new St.BoxLayout({style_class: 'padlight-tabs', x_align: Clutter.ActorAlign.CENTER});
        this._tabs = new Map(MODES.map(([name, label]) => {
            const tab = new St.Button({label, style_class: 'padlight-tab', can_focus: true});
            tab.connect('clicked', () => this._show(name));
            tabs.add_child(tab);
            return [name, tab];
        }));
        this.add_child(tabs);
        this._open = false;
        this._mode = null;
        this._show(mode);

        const all = facts(controller, battery, assets.usbIcon);
        this.add_child(grid(all.slice(0, TILES).map(tile)));

        const actions = [];
        if (controller.rumble) {
            const rumble = button('Test Vibration');
            rumble.connect('clicked', () => {
                this._view.shake();
                this.emit('rumble');
            });
            actions.push(rumble);
        }
        if (controller.connection === 'bluetooth' && controller.address) {
            const disconnect = button('Disconnect');
            disconnect.connect('clicked', () => this.emit('disconnect'));
            actions.push(disconnect);
        }
        if (actions.length)
            this.add_child(grid(actions));

        const rest = all.slice(TILES).map(fact => `${fact.caption} ${fact.value}`);
        if (rest.length && !compact) {
            this.add_child(new St.Label({
                text: rest.join('  ·  '),
                style_class: 'padlight-footnote padlight-dim',
                x_align: Clutter.ActorAlign.CENTER,
            }));
        }
    }

    start() {
        this._open = true;
        this._shown().start();
    }

    stop() {
        this._open = false;
        this._view.stop();
        this._check.stop();
    }

    _shown() {
        return this._mode === 'sticks' ? this._check : this._view;
    }

    _show(mode) {
        if (mode === this._mode)
            return;
        if (this._open)
            this._shown().stop();
        this._mode = mode;
        this._view.visible = mode === 'picture';
        this._check.visible = mode === 'sticks';
        for (const [name, tab] of this._tabs)
            tab.checked = name === mode;
        if (this._open)
            this._shown().start();
        this.emit('mode-changed', mode);
    }
});

// Shown while no controller is connected.
export const EmptyCard = GObject.registerClass(
class EmptyCard extends Card {
    _init(assets) {
        super._init();

        this.add_child(header(assets.logo, 'Xbox Controller', 'Not connected', false));

        const hero = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'padlight-hero padlight-hero-empty',
        });
        hero.add_child(new ControllerView(assets.images));
        const hint = new St.Label({
            text: 'Plug in a USB cable or connect over Bluetooth',
            style_class: 'padlight-hint padlight-dim',
        });
        hint.clutter_text.line_wrap = true;
        hero.add_child(hint);
        this.add_child(hero);
    }
});
