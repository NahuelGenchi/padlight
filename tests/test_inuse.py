# SPDX-FileCopyrightText: 2026 Nahuel Genchi
# SPDX-License-Identifier: GPL-2.0-or-later
"""Tests for inuse.py, on a made-up /proc.
Run: python3 -m unittest discover -s tests"""
import io
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src'))
import inuse  # noqa: E402

EVENT, JS, HIDRAW, OTHER = '/dev/input/event20', '/dev/input/js0', '/dev/hidraw3', '/dev/input/event21'
EXTENSION = '/home/user/.local/share/gnome-shell/extensions/padlight@nahuelgenchi.github.io'
SCOPES = '0::/user.slice/user-1000.slice/user@1000.service/app.slice/'


class FakeProc:
    """Answers inuse.py's look at /proc. Each process has open files (fd: target,
    None for one that closed meanwhile; no fd at all for another user's process),
    a comm, a cmdline and a cgroup."""

    def __init__(self, processes, parent):
        self.processes = processes
        self.parent = parent

    def _process(self, path):
        return self.processes.get(int(path.split('/')[2]), {})

    def listdir(self, path):
        if path == '/proc':
            return [*map(str, self.processes), 'self', 'sys', 'meminfo']
        fds = self._process(path).get('fd')
        if fds is None:
            raise PermissionError(13, 'Permission denied', path)
        return [str(fd) for fd in fds]

    def readlink(self, path):
        target = self._process(path)['fd'][int(path.rsplit('/', 1)[1])]
        if target is None:
            raise FileNotFoundError(2, 'No such file or directory', path)
        return target

    def read(self, path):
        return self._process(path).get(path.rsplit('/', 1)[1], '')

    def patch(self):
        return [mock.patch.object(inuse.os, 'listdir', self.listdir),
                mock.patch.object(inuse.os, 'readlink', self.readlink),
                mock.patch.object(inuse.os, 'getppid', lambda: self.parent),
                mock.patch.object(inuse, 'read', self.read)]


PROCESSES = {
    # GNOME Shell, which started the helper, may hold a Bluetooth controller's keys.
    100: {'fd': {3: EVENT}, 'comm': 'gnome-shell\n', 'cmdline': 'gnome-shell\0'},
    # Steam, as a Flatpak, on the input and the raw HID node
    200: {'fd': {0: '/dev/null', 9: EVENT, 12: HIDRAW, 14: 'socket:[4242]'}, 'comm': 'steam\n',
          'cmdline': 'steam\0', 'cgroup': SCOPES + 'app-flatpak-com.valvesoftware.Steam-4242.scope\n'},
    # Padlight's own helper
    300: {'fd': {3: EVENT}, 'comm': 'python3\n',
          'cmdline': f'python3\0{EXTENSION}/monitor.py\0--raw\0{EVENT}\0'},
    # Started from GNOME; systemd writes a dash in the app's name as \x2d
    400: {'fd': {5: JS}, 'comm': 'retroarch\n', 'cmdline': 'retroarch\0',
          'cgroup': SCOPES + 'app-gnome-retroarch\\x2dnightly-5150.scope\n'},
    # Another user's process
    500: {'fd': None, 'comm': 'evtest\n'},
    # Started from a terminal: no app scope
    600: {'fd': {4: JS, 6: None}, 'comm': 'jstest\n', 'cmdline': 'jstest\0',
          'cgroup': SCOPES + 'vte-spawn-1234.scope\n'},
    # Holds nothing of the controller's
    700: {'fd': {0: '/dev/null', 1: OTHER + '-not'}, 'comm': 'bash\n'},
}


class InUseTest(unittest.TestCase):
    def holders(self, devices, skip=EXTENSION, processes=PROCESSES):
        fake = FakeProc(processes, parent=100)
        patches = fake.patch()
        for patch in patches:
            patch.start()
        try:
            return inuse.holders(devices, skip)
        finally:
            for patch in patches:
                patch.stop()

    def test_programs_holding_each_device(self):
        steam = {'pid': 200, 'name': 'steam', 'app': 'com.valvesoftware.Steam'}
        self.assertEqual(self.holders([EVENT, JS, HIDRAW, OTHER]), {
            EVENT: [steam],
            JS: [{'pid': 400, 'name': 'retroarch', 'app': 'retroarch-nightly'},
                 {'pid': 600, 'name': 'jstest', 'app': None}],
            HIDRAW: [steam],
            OTHER: [],
        })

    def test_the_shell_and_padlights_helpers_are_left_out(self):
        found = self.holders([EVENT])[EVENT]
        self.assertNotIn(100, [p['pid'] for p in found])
        self.assertNotIn(300, [p['pid'] for p in found])

    def test_without_skip_padlights_helpers_count(self):
        self.assertEqual([p['pid'] for p in self.holders([EVENT], skip=None)[EVENT]], [200, 300])

    def test_main_prints_one_compact_line(self):
        fake = FakeProc(PROCESSES, parent=100)
        patches = fake.patch()
        for patch in patches:
            patch.start()
        try:
            with mock.patch('sys.stdout', new_callable=io.StringIO) as out:
                inuse.main(['--skip', EXTENSION, HIDRAW, OTHER])
        finally:
            for patch in patches:
                patch.stop()
        self.assertEqual(out.getvalue(), '{"/dev/hidraw3":[{"pid":200,"name":"steam",'
                                         '"app":"com.valvesoftware.Steam"}],"/dev/input/event21":[]}\n')


if __name__ == '__main__':
    unittest.main()
