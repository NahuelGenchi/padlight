// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

import Cairo from 'cairo';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {batteryCharge, batteryFor, batteryIcon, batteryIsLow, listBatteries, lowestBattery} from './battery.js';
import {alertText, BatteryAlerts} from './batteryAlerts.js';
import {Checklist} from './checklist.js';
import {connectionChanges, noticeKey, noticeText} from './connectionNotices.js';
import {ControllerCard, EmptyCard} from './controllerCard.js';
import {scanControllers} from './controllers.js';
import {Notifier} from './notifications.js';
import {Pairing, PairingSection} from './pairing.js';
import {DEFAULT_VIBRATION} from './vibrationLab.js';

const DIMMED = 110;
// How long a connection notice waits for the controller's battery reading
const BATTERY_WAIT_MS = 2000;

function spawn(argv) {
    try {
        Gio.Subprocess.new(argv,
            Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE);
    } catch (e) {
        console.error(`padlight: ${e.message}`);
    }
}

// Runs a program and resolves to what it printed.
function output(argv, cancellable) {
    return new Promise((resolve, reject) => {
        const process = Gio.Subprocess.new(argv,
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
        process.communicate_utf8_async(null, cancellable, (_process, res) => {
            try {
                resolve(process.communicate_utf8_finish(res)[1]);
            } catch (e) {
                reject(e);
            }
        });
    });
}

// A readable name for a program that has a controller open: the app of its
// window, the app GNOME or Flatpak started it as, or else its process name.
function programName({pid, name, app}) {
    const windowed = Shell.WindowTracker.get_default().get_app_from_pid(pid);
    if (windowed)
        return windowed.get_name();
    const apps = Shell.AppSystem.get_default();
    const known = (app && apps.lookup_app(`${app}.desktop`)) || apps.lookup_heuristic_basename(name);
    return known?.get_name() ?? name;
}

const deviceNodes = c => [c.eventNode, c.jsNode, ...c.hidrawNodes].filter(Boolean);

// The icon and the battery level in the top bar. Like the card, it tells the
// stylesheet whether the bar is dark or light, for the low battery colour.
const TopBarBox = GObject.registerClass(
class TopBarBox extends St.BoxLayout {
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

const PadlightIndicator = GObject.registerClass(
class PadlightIndicator extends PanelMenu.Button {
    _init(extension, batteryAlerts) {
        super._init(0.5, 'Xbox Controller');

        this._cancellable = new Gio.Cancellable();
        this._controllers = [];
        this._batteries = [];
        this._batteryRequest = 0;
        this._shown = null;
        this._scanId = 0;
        // Whether the controllers there at start have been seen: they get no notice
        this._scanned = false;
        // Connection notices waiting for a battery reading, by device path
        this._waitingNotices = new Map();
        this._cards = [];
        // What each controller's card shows, how far its button checklist has
        // got and its vibration lab's values, kept while the menu is rebuilt
        this._modes = new Map();
        this._checklists = new Map();
        this._vibrations = new Map();
        this._cardsByPath = new Map();
        // Programs that have each controller open, by controller
        this._users = new Map();
        this._usersRequest = 0;
        this._extension = extension;
        this._rumbleScript = GLib.build_filenamev([extension.path, 'rumble.py']);
        this._inuseScript = GLib.build_filenamev([extension.path, 'inuse.py']);
        this._pairing = new Pairing();

        // A setting changes what the menu or the top bar shows, or which alerts are due.
        this._settings = extension.getSettings();
        this._settingsId = this._settings.connect('changed', () => this._sync());
        this._batteryAlerts = batteryAlerts;

        const icon = name => GLib.build_filenamev([extension.path, 'icons', name]);
        // What the cards in the menu are made of
        this._assets = {
            images: {
                art: Cairo.ImageSurface.createFromPNG(icon('controller.png')),
                glow: Cairo.ImageSurface.createFromPNG(icon('glow.png')),
            },
            logo: Gio.icon_new_for_string(icon('xbox-symbolic.svg')),
            usbIcon: Gio.icon_new_for_string(icon('usb-symbolic.svg')),
            monitorScript: GLib.build_filenamev([extension.path, 'monitor.py']),
        };

        this._icon = new St.Icon({gicon: this._assets.logo, style_class: 'system-status-icon'});
        this._level = new St.Label({
            style_class: 'padlight-level',
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });
        const box = new TopBarBox({style_class: 'panel-status-menu-box'});
        box.add_child(this._icon);
        box.add_child(this._level);
        this.add_child(box);
        this._notifier = new Notifier(this._assets.logo);

        // A controller shows up as new nodes in /dev/input, wired or not.
        this._monitor = Gio.File.new_for_path('/dev/input')
            .monitor_directory(Gio.FileMonitorFlags.NONE, null);
        this._monitorId = this._monitor.connect('changed', () => this._scanLater());

        // Any news from UPower may be a new battery reading.
        this._upowerId = Gio.DBus.system.signal_subscribe(
            'org.freedesktop.UPower', null, null, null, null, Gio.DBusSignalFlags.NONE, () => {
                if (this._controllers.length)
                    this._scanLater();
            });

        // The cards only read the controllers while the menu is showing.
        this.menu.connect('open-state-changed', (_menu, open) => {
            if (open) {
                this._scan();
                this._findUsers();
            } else {
                this._syncTopBar();
            }
            for (const card of this._cards) {
                if (open)
                    card.start();
                else
                    card.stop();
            }
            if (!open)
                this._pairing.menuClosed();
        });

        this._scan();
    }

    // --- State ---

    _scanLater() {
        if (this._scanId)
            return;
        // Lets the burst of node changes from one plug or unplug settle.
        this._scanId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            this._scanId = 0;
            this._scan();
            return GLib.SOURCE_REMOVE;
        });
    }

    _scan() {
        const before = this._controllers;
        this._controllers = scanControllers();
        if (this._scanned)
            this._noticeConnections(before);
        this._scanned = true;
        this._sync();
        this._refreshBatteries();
    }

    async _refreshBatteries() {
        const request = ++this._batteryRequest;
        let batteries = [];
        if (this._controllers.length) {
            try {
                batteries = await listBatteries(this._cancellable);
            } catch {
            }
        }
        if (request !== this._batteryRequest || this._cancellable.is_cancelled())
            return;
        this._batteries = batteries;
        this._sendWaitingNotices();
        this._sync();
    }

    // --- Connection notices ---

    _noticeConnections(before) {
        const {arrived, left} = connectionChanges(before, this._controllers);
        for (const controller of left) {
            // Gone before its notice went out: there is nothing to tell.
            if (this._waitingNotices.has(controller.path)) {
                GLib.source_remove(this._waitingNotices.get(controller.path));
                this._waitingNotices.delete(controller.path);
                continue;
            }
            this._notice(controller, null, false);
        }
        for (const controller of arrived) {
            // The battery reading can come a moment after the controller, and
            // on a cable there is none.
            const battery = batteryFor(controller, this._batteries);
            if (battery || controller.connection === 'usb') {
                this._notice(controller, battery, true);
                continue;
            }
            this._waitingNotices.set(controller.path,
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, BATTERY_WAIT_MS, () => {
                    this._waitingNotices.delete(controller.path);
                    this._notice(controller, null, true);
                    return GLib.SOURCE_REMOVE;
                }));
        }
    }

    // Sends the notices that were waiting for a battery reading, now that
    // there is one.
    _sendWaitingNotices() {
        for (const [path, id] of this._waitingNotices) {
            const controller = this._controllers.find(c => c.path === path);
            const battery = controller ? batteryFor(controller, this._batteries) : null;
            if (!battery)
                continue;
            GLib.source_remove(id);
            this._waitingNotices.delete(path);
            this._notice(controller, battery, true);
        }
    }

    _notice(controller, battery, connected) {
        if (!this._settings.get_boolean('connection-notices'))
            return;
        // The newest notice for a controller replaces the one before, so a
        // quick reconnect leaves one notice.
        this._notifier.notify(noticeKey(controller), {
            ...noticeText(controller, battery, connected),
            iconName: 'input-gaming-symbolic',
            // Feedback on turning a controller on or off, so it shows even
            // over a full-screen game. Once seen, it leaves the list.
            forFeedback: true,
            isTransient: true,
        });
    }

    // Looks, once each time the menu opens, at which of the user's own
    // programs have the controllers' device files open.
    async _findUsers() {
        const request = ++this._usersRequest;
        const controllers = this._controllers;
        const nodes = controllers.flatMap(deviceNodes);
        if (!nodes.length)
            return;
        let found;
        try {
            found = JSON.parse(await output(
                ['python3', this._inuseScript, '--skip', this._extension.path, ...nodes],
                this._cancellable));
        } catch (e) {
            if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                console.error(`padlight: ${e.message}`);
            return;
        }
        if (request !== this._usersRequest)
            return;
        for (const controller of controllers) {
            const names = new Set(deviceNodes(controller)
                .flatMap(node => found[node] ?? []).map(programName));
            this._users.set(controller.path, [...names].sort((a, b) => a.localeCompare(b)));
            this._cardsByPath.get(controller.path)?.setUsers(this._users.get(controller.path));
        }
    }

    _sync() {
        const connected = this._controllers.length > 0;
        this._icon.opacity = connected ? 255 : DIMMED;
        if (connected)
            this._icon.add_style_class_name('padlight-active');
        else
            this._icon.remove_style_class_name('padlight-active');

        this._syncTopBar();
        const lowBattery = this._settings.get_int('low-battery-level');
        this._alertBatteries(lowBattery);
        const shown = JSON.stringify([lowBattery,
            this._controllers.map(c => [c, batteryFor(c, this._batteries)])]);
        if (shown === this._shown)
            return;
        this._shown = shown;
        this._buildMenu(lowBattery);
    }

    // The options from the settings window: the lowest charge beside the
    // icon, and no icon while no controller is connected.
    _syncTopBar() {
        const battery = this._settings.get_boolean('show-battery-level')
            ? lowestBattery(this._controllers.map(c => batteryFor(c, this._batteries)))
            : null;
        this._level.visible = Boolean(battery);
        if (battery) {
            this._level.text = batteryCharge(battery);
            if (batteryIsLow(battery, this._settings.get_int('low-battery-level')))
                this._level.add_style_class_name('padlight-warning');
            else
                this._level.remove_style_class_name('padlight-warning');
        }
        // An open menu stays in place until it closes.
        this.visible = this._controllers.length > 0 || this.menu.isOpen ||
            !this._settings.get_boolean('hide-when-disconnected');
    }

    // Sends the low battery alerts that are due.
    _alertBatteries(lowBattery) {
        const readings = this._controllers.map(controller =>
            ({controller, battery: batteryFor(controller, this._batteries)}));
        const due = this._batteryAlerts.update(readings, lowBattery,
            this._settings.get_boolean('low-battery-alerts'));
        for (const {controller, battery, stage} of due) {
            this._notifier.notify(`battery ${controller.path}`, {
                ...alertText(controller.name, battery, stage),
                gicon: new Gio.ThemedIcon({name: batteryIcon(battery)}),
                // Shown even over a full-screen game, where the controller is
                // in use, and ahead of notifications waiting for the game to
                // end. Do Not Disturb still holds it back.
                urgency: MessageTray.Urgency.HIGH,
                forFeedback: true,
            });
        }
    }

    // --- Menu ---

    _buildMenu(lowBattery) {
        this.menu.removeAll();
        this._cards = [];
        this._cardsByPath.clear();
        for (const map of [this._modes, this._checklists, this._vibrations]) {
            for (const path of map.keys()) {
                if (!this._controllers.some(c => c.path === path))
                    map.delete(path);
            }
        }
        for (const path of this._users.keys()) {
            if (!this._controllers.some(c => c.path === path))
                this._users.delete(path);
        }

        if (!this._controllers.length) {
            this._addCard(new EmptyCard(this._assets));
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }

        const compact = this._controllers.length > 1;
        for (const controller of this._controllers) {
            if (!this._checklists.has(controller.path))
                this._checklists.set(controller.path, new Checklist(controller.buttons));
            if (!this._vibrations.has(controller.path))
                this._vibrations.set(controller.path, {...DEFAULT_VIBRATION});
            const card = new ControllerCard(controller,
                batteryFor(controller, this._batteries), this._assets, {
                    compact,
                    lowBattery,
                    mode: this._modes.get(controller.path),
                    checklist: this._checklists.get(controller.path),
                    vibration: this._vibrations.get(controller.path),
                });
            card.connect('mode-changed', (_card, mode) => this._modes.set(controller.path, mode));
            card.connect('rumble',
                () => spawn(['python3', this._rumbleScript, controller.eventNode]));
            card.connect('play', (_card, strong, weak, length) => spawn(['python3', this._rumbleScript,
                '--strong', `${strong}`, '--weak', `${weak}`, '--length', `${length}`, controller.eventNode]));
            card.connect('disconnect', () => {
                this.menu.close();
                spawn(['bluetoothctl', 'disconnect', controller.address]);
            });
            this._addCard(card);
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this._cardsByPath.set(controller.path, card);
            if (this._users.has(controller.path))
                card.setUsers(this._users.get(controller.path));

            this._cards.push(card);
            if (this.menu.isOpen)
                card.start();
        }

        this.menu.addMenuItem(new PairingSection(this._pairing));
        const bluetooth = new PopupMenu.PopupMenuItem('Bluetooth Settings');
        bluetooth.connect('activate', () => spawn(['gnome-control-center', 'bluetooth']));
        this.menu.addMenuItem(bluetooth);

        const preferences = new PopupMenu.PopupMenuItem('Padlight Settings');
        preferences.connect('activate', () => this._extension.openPreferences());
        this.menu.addMenuItem(preferences);
    }

    _addCard(card) {
        // Not reactive, or themes would highlight the whole card under the
        // pointer like an ordinary menu entry. The buttons inside still work.
        const item = new PopupMenu.PopupBaseMenuItem({
            reactive: false, can_focus: false, style_class: 'padlight-card-item',
        });
        item.add_child(card);
        this.menu.addMenuItem(item);
    }

    destroy() {
        this._cancellable.cancel();
        if (this._scanId)
            GLib.source_remove(this._scanId);
        this._scanId = 0;
        for (const id of this._waitingNotices.values())
            GLib.source_remove(id);
        this._waitingNotices.clear();
        this._monitor.disconnect(this._monitorId);
        this._monitor.cancel();
        this._monitor = null;
        Gio.DBus.system.signal_unsubscribe(this._upowerId);
        this._upowerId = 0;
        this._settings.disconnect(this._settingsId);
        this._settings = null;
        this._notifier.destroy();
        this._pairing.destroy();
        this._cards = [];
        this._cardsByPath.clear();
        super.destroy();
    }
});

export default class PadlightExtension extends Extension {
    enable() {
        // Kept while Padlight is off, as it is while the screen is locked, so
        // unlocking does not repeat an alert
        this._batteryAlerts ??= new BatteryAlerts();
        this._indicator = new PadlightIndicator(this, this._batteryAlerts);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
