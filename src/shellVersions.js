// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

// What differs between the GNOME Shell versions Padlight runs on, 46 to 50.

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

const hasProperty = (type, name) => GObject.Object.find_property.call(type, name) !== null;

// Stacks a box's children from top to bottom. Boxes have an orientation from
// GNOME Shell 48; 46 and 47 have only the vertical switch it replaced.
export const VERTICAL = hasProperty(St.BoxLayout, 'orientation')
    ? {orientation: Clutter.Orientation.VERTICAL}
    : {vertical: true};

// The stylesheet's -st-accent-color, for focus rings, comes with GNOME Shell
// 47's accent colours. On 46 it reads as black.
export const HAS_ACCENT_COLOR = hasProperty(St.Settings, 'accent-color');
