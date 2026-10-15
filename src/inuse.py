#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Nahuel Genchi
# SPDX-License-Identifier: GPL-2.0-or-later
"""Prints which programs have device files open, as one JSON object:
inuse.py [--skip TEXT] DEVICE...

For each device file, a list of {"pid", "name", "app"}: the process name and,
when GNOME or Flatpak started it, the app it belongs to. The program that
started this helper (GNOME Shell, which may read a controller's keys) and
processes whose command line contains TEXT are left out. Only the current
user's own processes can be seen; nothing is read from the devices themselves.
"""
import json
import os
import re
import sys

# The app a process belongs to, from the scope GNOME or Flatpak put it in
APP_SCOPE = re.compile(r'/app-(?:gnome|flatpak)-(.+?)-\d+\.scope')


def read(path):
    try:
        with open(path, 'rb') as f:
            return f.read().decode(errors='replace')
    except OSError:
        return ''


def holders(devices, skip=None):
    found = {device: [] for device in devices}
    parent = str(os.getppid())
    for entry in os.listdir('/proc'):
        if not entry.isdigit() or entry == parent:
            continue
        try:
            fds = os.listdir(f'/proc/{entry}/fd')
        except OSError:
            continue  # someone else's process, or gone
        held = set()
        for fd in fds:
            try:
                target = os.readlink(f'/proc/{entry}/fd/{fd}')
            except OSError:
                continue
            if target in found:
                held.add(target)
        if not held:
            continue
        if skip and skip in read(f'/proc/{entry}/cmdline').replace('\0', ' '):
            continue
        scope = APP_SCOPE.search(read(f'/proc/{entry}/cgroup'))
        holder = {
            'pid': int(entry),
            'name': read(f'/proc/{entry}/comm').strip(),
            'app': scope.group(1).replace('\\x2d', '-') if scope else None,
        }
        for device in sorted(held):
            found[device].append(holder)
    return found


def main(args):
    skip = None
    if args[:1] == ['--skip']:
        skip, args = args[1], args[2:]
    print(json.dumps(holders(args, skip), separators=(',', ':')))


if __name__ == '__main__':
    main(sys.argv[1:])
