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
    }
}
