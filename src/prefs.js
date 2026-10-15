// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class PadlightPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        // Kept on the window, so the settings live as long as the rows bound to them
        window._settings = this.getSettings();

        const page = new Adw.PreferencesPage();
        window.add(page);

        const battery = new Adw.PreferencesGroup({title: 'Battery'});
        page.add(battery);

        const lowLevel = new Adw.SpinRow({
            title: 'Low battery level',
            subtitle: 'The charge, in percent, at which the battery icon turns orange',
            adjustment: new Gtk.Adjustment({
                lower: 5,
                upper: 50,
                step_increment: 5,
                page_increment: 10,
            }),
        });
        window._settings.bind('low-battery-level', lowLevel, 'value',
            Gio.SettingsBindFlags.DEFAULT);
        battery.add(lowLevel);

        const alerts = new Adw.SwitchRow({
            title: 'Low battery alerts',
            subtitle: 'A notification when a controller reaches the low level, and again at 10%',
        });
        window._settings.bind('low-battery-alerts', alerts, 'active',
            Gio.SettingsBindFlags.DEFAULT);
        battery.add(alerts);

        const connections = new Adw.PreferencesGroup({title: 'Connections'});
        page.add(connections);

        const notices = new Adw.SwitchRow({
            title: 'Connection notices',
            subtitle: 'A notification when a controller connects or disconnects',
        });
        window._settings.bind('connection-notices', notices, 'active',
            Gio.SettingsBindFlags.DEFAULT);
        connections.add(notices);

        const topBar = new Adw.PreferencesGroup({title: 'Top bar'});
        page.add(topBar);

        for (const [key, title, subtitle] of [
            ['show-battery-level', 'Battery level beside the icon',
                'With several controllers, the lowest charge'],
            ['hide-when-disconnected', 'Hide the icon without a controller',
                'It comes back as soon as one connects'],
        ]) {
            const row = new Adw.SwitchRow({title, subtitle});
            window._settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            topBar.add(row);
        }

        const screen = new Adw.PreferencesGroup({title: 'Screen'});
        page.add(screen);

        const keepAwake = new Adw.SwitchRow({
            title: 'Keep the screen awake',
            subtitle: 'Controller input counts as activity, as keyboard and mouse input does. ' +
                'While this is on, Padlight reads connected controllers in the background',
        });
        window._settings.bind('keep-awake', keepAwake, 'active',
            Gio.SettingsBindFlags.DEFAULT);
        screen.add(keepAwake);
    }
}
