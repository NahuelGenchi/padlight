// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {IDLE_MINUTES, nearestChoice} from './idleDisconnect.js';
import {cleanNickname, NICKNAME_LENGTH} from './nicknames.js';

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

        const idle = new Adw.SwitchRow({
            title: 'Disconnect idle controllers',
            subtitle: 'A Bluetooth controller left without input is disconnected, to save its battery, ' +
                'and so is one idle for a minute when the screen locks or goes blank. ' +
                'While this is on, Padlight reads Bluetooth controllers in the background',
        });
        window._settings.bind('idle-disconnect', idle, 'active',
            Gio.SettingsBindFlags.DEFAULT);
        connections.add(idle);

        const idleTime = new Adw.ComboRow({
            title: 'Disconnect after',
            model: Gtk.StringList.new(IDLE_MINUTES.map(minutes => `${minutes} minutes`)),
        });
        window._settings.bind('idle-disconnect', idleTime, 'sensitive',
            Gio.SettingsBindFlags.GET);
        this._bindIdleTime(window._settings, idleTime);
        connections.add(idleTime);

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

        const nicknames = new Adw.PreferencesGroup({
            title: 'Nicknames',
            description: 'Give a controller a nickname with the pencil beside its name in the menu. ' +
                'Rename it here, or forget it.',
        });
        page.add(nicknames);
        this._fillNicknames(window._settings, nicknames);
    }

    // Shows the time before an idle controller is disconnected, or the
    // nearest one offered when it was set elsewhere, and keeps the one chosen.
    _bindIdleTime(settings, row) {
        let showing = false;
        const show = () => {
            showing = true;
            row.selected = nearestChoice(settings.get_int('idle-disconnect-minutes'));
            showing = false;
        };
        row.connect('notify::selected', () => {
            if (!showing)
                settings.set_int('idle-disconnect-minutes', IDLE_MINUTES[row.selected]);
        });
        // Connected before the first read, which GSettings needs to report changes
        const changedId = settings.connect('changed::idle-disconnect-minutes', show);
        row.connect('destroy', () => settings.disconnect(changedId));
        show();
    }

    // A row for each nickname, under the model's name: edit it and press
    // Enter to rename, or Forget. Filled again whenever the nicknames change.
    _fillNicknames(settings, group) {
        const rows = [];
        const save = nicknames => settings.set_value('nicknames', new GLib.Variant('a{s(ss)}', nicknames));
        const fill = () => {
            for (const row of rows.splice(0))
                group.remove(row);
            const nicknames = settings.get_value('nicknames').deepUnpack();
            const byName = Object.entries(nicknames).sort(([, [a]], [, [b]]) => a.localeCompare(b));
            for (const [key, [nickname, model]] of byName) {
                const row = new Adw.EntryRow({
                    title: model,
                    text: nickname,
                    show_apply_button: true,
                });
                // On the text field inside the row: the row's own max-length
                // comes with libadwaita 1.6, and GNOME Shell 46 has 1.5.
                row.get_delegate().max_length = NICKNAME_LENGTH;
                row.connect('apply', () => {
                    const renamed = cleanNickname(row.text);
                    if (renamed)
                        nicknames[key] = [renamed, model];
                    else
                        delete nicknames[key];
                    save(nicknames);
                });
                const forget = new Gtk.Button({
                    label: 'Forget',
                    valign: Gtk.Align.CENTER,
                    css_classes: ['flat'],
                });
                forget.connect('clicked', () => {
                    delete nicknames[key];
                    save(nicknames);
                });
                row.add_suffix(forget);
                group.add(row);
                rows.push(row);
            }
        };
        // Connected before the first read, which GSettings needs to report changes
        const changedId = settings.connect('changed::nicknames', fill);
        group.connect('destroy', () => settings.disconnect(changedId));
        fill();
    }
}
