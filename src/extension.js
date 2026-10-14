// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

import Cairo from 'cairo';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {batteryFor, listBatteries} from './battery.js';
import {ControllerCard, EmptyCard} from './controllerCard.js';
import {scanControllers} from './controllers.js';

const DIMMED = 110;

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

const PadlightIndicator = GObject.registerClass(
class PadlightIndicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.5, 'Xbox Controller');

        this._cancellable = new Gio.Cancellable();
        this._controllers = [];
        this._batteries = [];
        this._batteryRequest = 0;
        this._shown = null;
        this._scanId = 0;
        this._views = [];
        this._cardsByPath = new Map();
        // Programs that have each controller open, by controller
        this._users = new Map();
        this._usersRequest = 0;
        this._extensionPath = extension.path;
        this._rumbleScript = GLib.build_filenamev([extension.path, 'rumble.py']);
        this._inuseScript = GLib.build_filenamev([extension.path, 'inuse.py']);

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
        this.add_child(this._icon);

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

        // The controller pictures are only live while the menu is showing.
        this.menu.connect('open-state-changed', (_menu, open) => {
            if (open) {
                this._scan();
                this._findUsers();
            }
            for (const view of this._views) {
                if (open)
                    view.start();
                else
                    view.stop();
            }
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
        this._controllers = scanControllers();
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
        this._sync();
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
                ['python3', this._inuseScript, '--skip', this._extensionPath, ...nodes],
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

        const shown = JSON.stringify(
            this._controllers.map(c => [c, batteryFor(c, this._batteries)]));
        if (shown === this._shown)
            return;
        this._shown = shown;
        this._buildMenu();
    }

    // --- Menu ---

    _buildMenu() {
        this.menu.removeAll();
        this._views = [];
        this._cardsByPath.clear();
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
            const card = new ControllerCard(controller,
                batteryFor(controller, this._batteries), this._assets, compact);
            card.connect('rumble',
                () => spawn(['python3', this._rumbleScript, controller.eventNode]));
            card.connect('disconnect', () => {
                this.menu.close();
                spawn(['bluetoothctl', 'disconnect', controller.address]);
            });
            this._addCard(card);
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this._cardsByPath.set(controller.path, card);
            if (this._users.has(controller.path))
                card.setUsers(this._users.get(controller.path));

            this._views.push(card.view);
            if (this.menu.isOpen)
                card.view.start();
        }

        const settings = new PopupMenu.PopupMenuItem('Bluetooth Settings');
        settings.connect('activate', () => spawn(['gnome-control-center', 'bluetooth']));
        this.menu.addMenuItem(settings);
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
        this._monitor.disconnect(this._monitorId);
        this._monitor.cancel();
        this._monitor = null;
        Gio.DBus.system.signal_unsubscribe(this._upowerId);
        this._upowerId = 0;
        this._views = [];
        this._cardsByPath.clear();
        super.destroy();
    }
});

export default class PadlightExtension extends Extension {
    enable() {
        this._indicator = new PadlightIndicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
