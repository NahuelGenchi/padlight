// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {formatTime} from 'resource:///org/gnome/shell/misc/dateUtils.js';

import {batteryIcon, batteryIsLow, batteryText} from './battery.js';
import {ButtonCheck} from './buttonCheck.js';
import {ControllerCheck} from './controllerCheck.js';
import {ControllerView, VIEW_HEIGHT} from './controllerView.js';
import {canHaveNickname, cleanNickname, controllerName, NICKNAME_LENGTH} from './nicknames.js';
import {VibrationLab} from './vibrationLab.js';

const GAP = 8;
const TILES = 4;
// Picture height when several controllers share the menu
const COMPACT_VIEW_HEIGHT = 186;

// What the card's tabs show in the space for the picture
const MODES = [['picture', 'Picture'], ['sticks', 'Sticks'], ['buttons', 'Buttons'], ['vibration', 'Vibration']];

const CONNECTIONS = {
    usb: {label: 'Wired (USB)', icon: null},
    bluetooth: {label: 'Bluetooth', icon: 'bluetooth-active-symbolic'},
    adapter: {label: 'Xbox adapter', icon: 'network-wireless-symbolic'},
};

function header(logo, title, subtitles, active) {
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
    for (const subtitle of subtitles)
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

function batteryFact(controller, battery, lowBattery) {
    if (battery) {
        return {
            caption: 'Battery',
            value: batteryText(battery),
            icon: {icon_name: batteryIcon(battery)},
            warning: batteryIsLow(battery, lowBattery),
        };
    }
    // The kernel's USB driver for Xbox pads does not read the battery; on a
    // cable the controller runs from the computer anyway.
    if (controller.connection === 'usb')
        return {caption: 'Battery', value: 'On USB power', icon: {icon_name: 'ac-adapter-symbolic'}};
    return {caption: 'Battery', value: 'Unknown', icon: {icon_name: 'battery-missing-symbolic'}};
}

// Everything worth telling about a controller, the most useful first
function facts(controller, battery, usbIcon, lowBattery) {
    const connection = CONNECTIONS[controller.connection];
    const list = [
        batteryFact(controller, battery, lowBattery),
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
            warning: Boolean(controller.firmwareUpdate),
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

// One connected controller: live picture, stick check, button checklist or
// vibration lab, the facts about it and its actions. Reads the controller
// only between start() and stop().
export const ControllerCard = GObject.registerClass({
    Signals: {
        'rumble': {},
        // The vibration lab's Play: strong and weak motor in percent, length in ms
        'play': {param_types: [GObject.TYPE_INT, GObject.TYPE_INT, GObject.TYPE_INT]},
        'disconnect': {},
        // A nickname typed on the card; empty to drop it
        'rename': {param_types: [GObject.TYPE_STRING]},
        // Find Controller, pressed to start or to stop
        'find': {},
        'mode-changed': {param_types: [GObject.TYPE_STRING]},
    },
}, class ControllerCard extends Card {
    /**
     * @param {object} controller - an entry from scanControllers(), with its nickname
     * @param {object|null} battery - its entry from listBatteries(), if any
     * @param {object} assets - {images, logo, usbIcon, monitorScript}
     * @param {object} options
     * @param {boolean} options.compact - leave room for more cards
     * @param {number} options.lowBattery - the low battery level, in percent
     * @param {string} options.mode - what the card shows first: picture, sticks, buttons or vibration
     * @param {object} options.checklist - the controller's Checklist, kept by the menu
     * @param {object} options.vibration - the vibration lab's values, kept by the menu
     * @param {boolean} options.finding - whether Find Controller is playing
     */
    _init(controller, battery, assets, {
        compact, lowBattery, mode = 'picture', checklist = null, vibration = null, finding = false,
    }) {
        super._init();

        const since = controller.since
            ? `Connected since ${formatTime(GLib.DateTime.new_from_unix_local(controller.since))}`
            : 'Connected';
        // With a nickname, the model's name goes underneath it.
        const head = header(assets.logo, controllerName(controller),
            controller.nickname ? [controller.name, since] : [since], true);
        this.add_child(head);
        this._nameEntry = null;
        if (canHaveNickname(controller))
            this._addRename(head, controller.nickname ?? '');

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
        // What each tab shows
        this._panes = new Map([['picture', this._view], ['sticks', this._check]]);
        if (checklist?.total) {
            this._panes.set('buttons', new ButtonCheck(assets.images, {
                eventNode: controller.eventNode,
                monitorScript: assets.monitorScript,
                checklist,
                height,
            }));
        }
        if (controller.rumble && vibration) {
            this._panes.set('vibration', new VibrationLab({
                values: vibration,
                onPlay: ({strong, weak, length}) => this.emit('play', strong, weak, length),
                height,
                compact,
            }));
        }
        const hero = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'padlight-hero',
        });
        for (const pane of this._panes.values())
            hero.add_child(pane);
        this.add_child(hero);

        const tabs = new St.BoxLayout({style_class: 'padlight-tabs', x_align: Clutter.ActorAlign.CENTER});
        this._tabs = new Map(MODES.filter(([name]) => this._panes.has(name)).map(([name, label]) => {
            const tab = new St.Button({label, style_class: 'padlight-tab', can_focus: true});
            tab.connect('clicked', () => this._show(name));
            tabs.add_child(tab);
            return [name, tab];
        }));
        this.add_child(tabs);
        this._open = false;
        this._mode = null;
        this._show(this._panes.has(mode) ? mode : 'picture');

        const all = facts(controller, battery, assets.usbIcon, lowBattery);
        this.add_child(grid(all.slice(0, TILES).map(tile)));

        // Linux has no firmware updater for these controllers
        if (controller.firmwareUpdate) {
            const update = new St.Label({
                text: `Firmware ${controller.firmwareUpdate} is available. Update the controller ` +
                    'in the Xbox Accessories app on Windows, or on an Xbox console.',
                style_class: 'padlight-footnote padlight-dim',
                x_align: Clutter.ActorAlign.CENTER,
            });
            update.clutter_text.line_wrap = true;
            update.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
            this.add_child(update);
        }

        const actions = [];
        if (controller.rumble) {
            const rumble = button('Test Vibration');
            rumble.connect('clicked', () => {
                this._view.shake();
                this.emit('rumble');
            });
            actions.push(rumble);
        }
        // Bursts of vibration, to find a wireless controller by feel or sound
        this._find = null;
        if (controller.rumble && controller.connection !== 'usb') {
            this._find = button('Find Controller');
            this._find.connect('clicked', () => this.emit('find'));
            actions.push(this._find);
            this.setFinding(finding);
        }
        if (controller.connection === 'bluetooth' && controller.address) {
            const disconnect = button('Disconnect');
            disconnect.connect('clicked', () => this.emit('disconnect'));
            actions.push(disconnect);
        }
        if (actions.length)
            this.add_child(grid(actions));

        // Filled in by setUsers() once Padlight has looked
        this._users = new St.Label({
            style_class: 'padlight-footnote padlight-dim',
            x_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });
        this._users.clutter_text.line_wrap = true;
        this._users.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        this.add_child(this._users);

        const rest = all.slice(TILES).map(fact => `${fact.caption} ${fact.value}`);
        if (rest.length && !compact) {
            this.add_child(new St.Label({
                text: rest.join('  ·  '),
                style_class: 'padlight-footnote padlight-dim',
                x_align: Clutter.ActorAlign.CENTER,
            }));
        }
    }

    /**
     * Shows whether Find Controller is playing; its button then stops it.
     *
     * @param {boolean} finding
     */
    setFinding(finding) {
        if (this._find)
            this._find.label = finding ? 'Stop Finding' : 'Find Controller';
    }

    start() {
        this._open = true;
        this._shown().start();
    }

    stop() {
        this._open = false;
        for (const pane of this._panes.values())
            pane.stop();
        // Closing the menu drops a nickname that was not kept.
        this._stopRenaming();
    }

    // The pencil beside the name, which swaps the name for a box to type a
    // nickname in. Enter or the tick keeps it; an empty box drops it.
    _addRename(head, nickname) {
        const [, text] = head.get_children();
        [this._title] = text.get_children();
        this._nickname = nickname;
        this._nameEntry = new St.Entry({
            hint_text: 'Nickname',
            style_class: 'padlight-name-entry',
            can_focus: true,
            x_expand: true,
            visible: false,
        });
        this._nameEntry.clutter_text.max_length = NICKNAME_LENGTH;
        this._nameEntry.clutter_text.connect('activate', () => this._rename());
        text.insert_child_above(this._nameEntry, this._title);

        this._renameIcon = new St.Icon({
            icon_name: 'document-edit-symbolic',
            style_class: 'padlight-rename-icon',
        });
        this._renameButton = new St.Button({
            child: this._renameIcon,
            style_class: 'padlight-rename',
            can_focus: true,
            accessible_name: 'Rename',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._renameButton.connect('clicked', () => {
            if (this._nameEntry.visible)
                this._rename();
            else
                this._startRenaming();
        });
        head.add_child(this._renameButton);
    }

    _startRenaming() {
        this._title.hide();
        this._nameEntry.text = this._nickname;
        this._nameEntry.show();
        this._nameEntry.grab_key_focus();
        this._nameEntry.clutter_text.set_selection(0, -1);
        this._renameIcon.icon_name = 'object-select-symbolic';
        this._renameButton.accessible_name = 'Keep the nickname';
    }

    _stopRenaming() {
        if (!this._nameEntry?.visible)
            return;
        this._nameEntry.hide();
        this._title.show();
        this._renameIcon.icon_name = 'document-edit-symbolic';
        this._renameButton.accessible_name = 'Rename';
    }

    _rename() {
        const nickname = cleanNickname(this._nameEntry.text);
        this._stopRenaming();
        this._renameButton.grab_key_focus();
        // Last: a new nickname rebuilds the menu, which replaces this card.
        if (nickname !== this._nickname)
            this.emit('rename', nickname);
    }

    _shown() {
        return this._panes.get(this._mode);
    }

    _show(mode) {
        if (mode === this._mode)
            return;
        if (this._open)
            this._shown().stop();
        this._mode = mode;
        for (const [name, pane] of this._panes)
            pane.visible = name === mode;
        for (const [name, tab] of this._tabs)
            tab.checked = name === mode;
        if (this._open)
            this._shown().start();
        this.emit('mode-changed', mode);
    }

    /**
     * Shows which programs have the controller open.
     *
     * @param {string[]} names - readable program names, none if nothing has it open
     */
    setUsers(names) {
        this._users.text = `In use by ${names.join(', ')}`;
        this._users.visible = names.length > 0;
    }
});

// Shown while no controller is connected.
export const EmptyCard = GObject.registerClass(
class EmptyCard extends Card {
    _init(assets) {
        super._init();

        this.add_child(header(assets.logo, 'Xbox Controller', ['Not connected'], false));

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
