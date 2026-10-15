// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

// Padlight's notifications, under a source of its own in the message tray.
// The tray drops the source with its last notification, so it is made again
// when needed.
export class Notifier {
    /**
     * @param {Gio.Icon} icon - shown beside Padlight's name
     */
    constructor(icon) {
        this._icon = icon;
        this._source = null;
        // The notification last sent for each key
        this._sent = new Map();
    }

    /**
     * Sends a notification. One sent earlier with the same key goes away,
     * so a newer state of the same thing does not pile up beside the old.
     *
     * @param {string} key - what the notification is about
     * @param {object} params - for MessageTray.Notification: title, body,
     *   gicon, urgency, forFeedback...
     * @returns {MessageTray.Notification}
     */
    notify(key, params) {
        this._sent.get(key)?.destroy(MessageTray.NotificationDestroyedReason.REPLACED);

        if (!this._source) {
            this._source = new MessageTray.Source({title: 'Padlight', icon: this._icon});
            this._source.connect('destroy', () => (this._source = null));
            Main.messageTray.add(this._source);
        }
        const notification = new MessageTray.Notification({source: this._source, ...params});
        this._sent.set(key, notification);
        notification.connect('destroy', () => {
            if (this._sent.get(key) === notification)
                this._sent.delete(key);
        });
        this._source.addNotification(notification);
        return notification;
    }

    destroy() {
        this._source?.destroy(MessageTray.NotificationDestroyedReason.SOURCE_CLOSED);
        this._source = null;
        this._sent.clear();
    }
}
