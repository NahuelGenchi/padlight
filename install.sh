#!/bin/sh
# SPDX-FileCopyrightText: 2026 Nahuel Genchi
# SPDX-License-Identifier: GPL-2.0-or-later
#
# Installs Padlight for the current user.
#
#   ./install.sh              install or update it, and switch it on
#   ./install.sh --pack       only build the package, for extensions.gnome.org
#   ./install.sh --uninstall  remove it
#
# GNOME Shell on Wayland only loads new extension code when you log in, so
# log out and back in after installing or updating.
set -eu

UUID=padlight@nahuelgenchi.github.io
PACKAGE=$UUID.shell-extension.zip
EXTENSIONS=${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions

cd "$(dirname "$0")"

pack() {
    # metadata.json, extension.js, prefs.js, stylesheet.css and the settings
    # schema go in by default. Python's caches stay out: extensions.gnome.org
    # rejects binary files.
    set --
    for path in src/*; do
        name=${path#src/}
        case $name in
            metadata.json | extension.js | prefs.js | stylesheet.css | schemas) ;;
            __pycache__ | *.pyc) ;;
            *) set -- "$@" "--extra-source=$name" ;;
        esac
    done
    gnome-extensions pack src --force --out-dir=. "$@"
}

# Adds or removes the extension in one of org.gnome.shell's string lists.
edit_list() { # key add|remove
    list=$(gsettings get org.gnome.shell "$1")
    case $2 in
        add)
            case $list in
                *"'$UUID'"*) return ;;
                "@as []" | "[]") list="['$UUID']" ;;
                *) list="${list%]}, '$UUID']" ;;
            esac ;;
        remove)
            list=$(printf '%s' "$list" | sed -e "s/'$UUID', //g" -e "s/, '$UUID'//g" -e "s/'$UUID'//g") ;;
    esac
    gsettings set org.gnome.shell "$1" "$list"
}

install_extension() {
    shell=$(gnome-shell --version 2>/dev/null | sed -n 's/^GNOME Shell \([0-9]*\).*/\1/p')
    if [ "$shell" != 50 ]; then
        echo "Note: Padlight is made for GNOME Shell 50, and this is ${shell:-not GNOME Shell}." >&2
    fi
    command -v python3 >/dev/null || echo "Note: Padlight needs python3 for its live picture and vibration test." >&2

    pack
    # This also compiles the settings schema.
    gnome-extensions install --force "$PACKAGE"
    rm -f "$PACKAGE"

    # The running shell only knows about extensions it found when you logged
    # in, so a new one goes straight onto the list it reads at the next log-in.
    if ! gnome-extensions enable "$UUID" 2>/dev/null; then
        edit_list enabled-extensions add
        edit_list disabled-extensions remove
    fi
    echo "Padlight is installed. Log out and back in to start it."
}

uninstall_extension() {
    if ! gnome-extensions uninstall "$UUID" 2>/dev/null; then
        rm -rf "${EXTENSIONS:?}/$UUID"
    fi
    edit_list enabled-extensions remove
    echo "Padlight is removed."
}

case ${1:-} in
    "") install_extension ;;
    --pack) pack && echo "Built $PACKAGE" ;;
    --uninstall) uninstall_extension ;;
    *) echo "Usage: $0 [--pack | --uninstall]" >&2; exit 2 ;;
esac
