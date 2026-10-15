// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

import Cairo from 'cairo';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
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
        this._cards = [];
        // What each controller's card shows, kept while the menu is rebuilt
        this._modes = new Map();
        this._extension = extension;
        this._rumbleScript = GLib.build_filenamev([extension.path, 'rumble.py']);

        // The cards show the low battery level, so a new one redraws them.
        this._settings = extension.getSettings();
        this._settingsId = this._settings.connect('changed::low-battery-level',
            () => this._sync());

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

        // The cards only read the controllers while the menu is showing.
        this.menu.connect('open-state-changed', (_menu, open) => {
            if (open)
                this._scan();
            for (const card of this._cards) {
                if (open)
                    card.start();
                else
                    card.stop();
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

    _sync() {
        const connected = this._controllers.length > 0;
        this._icon.opacity = connected ? 255 : DIMMED;
        if (connected)
            this._icon.add_style_class_name('padlight-active');
        else
            this._icon.remove_style_class_name('padlight-active');

        const lowBattery = this._settings.get_int('low-battery-level');
        const shown = JSON.stringify([lowBattery,
            this._controllers.map(c => [c, batteryFor(c, this._batteries)])]);
        if (shown === this._shown)
            return;
        this._shown = shown;
        this._buildMenu(lowBattery);
    }

    // --- Menu ---

    _buildMenu(lowBattery) {
        this.menu.removeAll();
        this._cards = [];
        for (const path of this._modes.keys()) {
            if (!this._controllers.some(c => c.path === path))
                this._modes.delete(path);
        }

        if (!this._controllers.length) {
            this._addCard(new EmptyCard(this._assets));
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }

        const compact = this._controllers.length > 1;
        for (const controller of this._controllers) {
            const card = new ControllerCard(controller,
                batteryFor(controller, this._batteries), this._assets,
                {compact, lowBattery, mode: this._modes.get(controller.path)});
            card.connect('mode-changed', (_card, mode) => this._modes.set(controller.path, mode));
            card.connect('rumble',
                () => spawn(['python3', this._rumbleScript, controller.eventNode]));
            card.connect('disconnect', () => {
                this.menu.close();
                spawn(['bluetoothctl', 'disconnect', controller.address]);
            });
            this._addCard(card);
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            this._cards.push(card);
            if (this.menu.isOpen)
                card.start();
        }

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
        this._monitor.disconnect(this._monitorId);
        this._monitor.cancel();
        this._monitor = null;
        Gio.DBus.system.signal_unsubscribe(this._upowerId);
        this._upowerId = 0;
        this._settings.disconnect(this._settingsId);
        this._settings = null;
        this._cards = [];
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
