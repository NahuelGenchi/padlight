#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Nahuel Genchi
# SPDX-License-Identifier: GPL-2.0-or-later
"""Prints a controller's live input state, one JSON line per change:
monitor.py [--raw] /dev/input/eventN

Stick values run from -1 to 1 and trigger values from 0 to 1. The live
picture gets the sticks with the driver's dead zone taken out; --raw leaves it
in and gives finer steps, for the stick check.

monitor.py --activity /dev/input/eventN only says that the controller is in
use, as {"input":true}, at most every ACTIVITY_EVERY seconds, for keeping the
screen awake and for disconnecting an idle controller. A button counts, and so
does a stick or trigger moved at least MOVED of its way; a stick that drifts
less than that does not.

Reading does not take the device away from games; every reader gets its own
copy of the events. Ends when the controller goes away or nobody is listening.
"""
import fcntl
import json
import os
import select
import struct
import sys
import time

EV_KEY = 0x01
EV_ABS = 0x03

KEYS = {
    0x130: 'a', 0x131: 'b', 0x133: 'x', 0x134: 'y',
    0x136: 'lb', 0x137: 'rb',
    0x13a: 'view', 0x13b: 'menu', 0x13c: 'xbox', 0x0a7: 'share',
    0x13d: 'ls', 0x13e: 'rs',
    0x220: 'up', 0x221: 'down', 0x222: 'left', 0x223: 'right',
}

ABS_X, ABS_Y, ABS_Z, ABS_RX, ABS_RY, ABS_RZ = 0, 1, 2, 3, 4, 5
ABS_GAS, ABS_BRAKE, ABS_HAT0X, ABS_HAT0Y = 9, 10, 16, 17

INPUT_EVENT = struct.Struct('llHHi')
ABSINFO = struct.Struct('iiiiii')   # value, minimum, maximum, fuzz, flat, resolution
KEY_BYTES = 96
MAX_RATE = 60

# --activity: how often, at most, to say the controller is in use, how far a
# stick or trigger has to go to count, and how long to rest after events that
# did not count, such as a stick drifting by itself
ACTIVITY_EVERY = 5
MOVED = 0.25
QUIET_REST = 0.5


def ioc_read(nr, size):
    return (2 << 30) | (size << 16) | (ord('E') << 8) | nr


def has_bit(bits, n):
    return bool(bits[n // 8] & (1 << (n % 8)))


class Controller:
    def __init__(self, fd):
        self.fd = fd
        self.keys = set()
        self.axes = {}

        present = bytearray(8)
        fcntl.ioctl(fd, ioc_read(0x20 + EV_ABS, len(present)), present)
        # Over plain Bluetooth HID the right stick and the triggers arrive on
        # other axes than with the xpad and xpadneo drivers.
        if has_bit(present, ABS_GAS) and has_bit(present, ABS_BRAKE):
            self.sticks = {'lx': ABS_X, 'ly': ABS_Y, 'rx': ABS_Z, 'ry': ABS_RZ}
            self.triggers = {'lt': ABS_BRAKE, 'rt': ABS_GAS}
        else:
            self.sticks = {'lx': ABS_X, 'ly': ABS_Y, 'rx': ABS_RX, 'ry': ABS_RY}
            self.triggers = {'lt': ABS_Z, 'rt': ABS_RZ}

        self.info = {}
        for code in (*self.sticks.values(), *self.triggers.values(), ABS_HAT0X, ABS_HAT0Y):
            if not has_bit(present, code):
                continue
            raw = bytearray(ABSINFO.size)
            fcntl.ioctl(fd, ioc_read(0x40 + code, len(raw)), raw)
            value, low, high, _fuzz, flat, _resolution = ABSINFO.unpack(raw)
            self.info[code] = (low, high, flat)
            self.axes[code] = value

        held = bytearray(KEY_BYTES)
        fcntl.ioctl(fd, ioc_read(0x18, len(held)), held)
        self.keys = {code for code in KEYS if has_bit(held, code)}

    def refresh(self):
        """Reads again what is held right now, which also covers presses and
        releases missed while not reading."""
        for code in self.info:
            raw = bytearray(ABSINFO.size)
            fcntl.ioctl(self.fd, ioc_read(0x40 + code, len(raw)), raw)
            self.axes[code] = ABSINFO.unpack(raw)[0]
        held = bytearray(KEY_BYTES)
        fcntl.ioctl(self.fd, ioc_read(0x18, len(held)), held)
        self.keys = {code for code in KEYS if has_bit(held, code)}

    def _moved(self, code):
        """Whether an axis is away from rest: the d-pad pressed, or a stick or
        trigger at least MOVED of its way."""
        if code in (ABS_HAT0X, ABS_HAT0Y):
            return self.axes[code] != 0
        if code in self.triggers.values():
            return self._trigger(code, raw=True) >= MOVED
        return abs(self._stick(code, raw=True)) >= MOVED

    def in_use(self, data):
        """Whether these events show someone using the controller."""
        used = False
        for offset in range(0, len(data) - INPUT_EVENT.size + 1, INPUT_EVENT.size):
            _sec, _usec, kind, code, value = INPUT_EVENT.unpack_from(data, offset)
            if kind == EV_KEY and value == 1:
                used = True
            elif kind == EV_ABS and code in self.axes:
                self.axes[code] = value
                used = used or self._moved(code)
        return used

    def held(self):
        """Whether a button is held, or a stick or trigger is held away from rest."""
        return bool(self.keys) or any(self._moved(code) for code in self.axes)

    def feed(self, data):
        for offset in range(0, len(data) - INPUT_EVENT.size + 1, INPUT_EVENT.size):
            _sec, _usec, kind, code, value = INPUT_EVENT.unpack_from(data, offset)
            if kind == EV_KEY and code in KEYS:
                if value:
                    self.keys.add(code)
                else:
                    self.keys.discard(code)
            elif kind == EV_ABS and code in self.axes:
                self.axes[code] = value

    def _stick(self, code, raw):
        if code not in self.info:
            return 0
        low, high, flat = self.info[code]
        middle = (low + high) / 2
        offset = self.axes[code] - middle
        if high == low or (abs(offset) <= flat and not raw):
            return 0
        return round(max(-1, min(1, offset / ((high - low) / 2))), 3 if raw else 2)

    def _trigger(self, code, raw):
        if code not in self.info:
            return 0
        low, high, _flat = self.info[code]
        if high == low:
            return 0
        return round(max(0, min(1, (self.axes[code] - low) / (high - low))), 3 if raw else 2)

    def state(self, raw=False):
        buttons = {KEYS[code] for code in self.keys}
        hat_x, hat_y = self.axes.get(ABS_HAT0X, 0), self.axes.get(ABS_HAT0Y, 0)
        if hat_x:
            buttons.add('left' if hat_x < 0 else 'right')
        if hat_y:
            buttons.add('up' if hat_y < 0 else 'down')
        state = {'buttons': sorted(buttons)}
        state.update({name: self._stick(code, raw) for name, code in self.sticks.items()})
        state.update({name: self._trigger(code, raw) for name, code in self.triggers.items()})
        return state


def main(path, raw=False):
    fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK)
    controller = Controller(fd)

    poller = select.poll()
    poller.register(fd, select.POLLIN)
    # Reports only when the reading end of our output closes
    poller.register(sys.stdout.fileno(), 0)

    shown = None
    shown_at = 0.0
    pending = True
    while True:
        wait = None
        if pending:
            wait = max(0.0, shown_at + 1 / MAX_RATE - time.monotonic()) * 1000
        for ready, events in poller.poll(wait):
            if ready != fd or events & (select.POLLERR | select.POLLHUP):
                return
            controller.feed(os.read(fd, INPUT_EVENT.size * 64))
            pending = True

        if pending and time.monotonic() - shown_at >= 1 / MAX_RATE:
            pending = False
            state = controller.state(raw)
            if state != shown:
                shown = state
                shown_at = time.monotonic()
                print(json.dumps(state, separators=(',', ':')), flush=True)


def drain(fd):
    """Everything waiting to be read, without waiting for more."""
    chunks = []
    while True:
        try:
            data = os.read(fd, INPUT_EVENT.size * 64)
        except BlockingIOError:
            break
        if not data:
            break
        chunks.append(data)
    return b''.join(chunks)


def watch(path):
    """--activity: says when the controller is in use, and nothing else."""
    fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK)
    controller = Controller(fd)

    poller = select.poll()
    poller.register(fd, select.POLLIN)
    poller.register(sys.stdout.fileno(), 0)

    reported = False
    while True:
        # Waits for input, but not right after a report: a button still held
        # sends nothing new, and counts again now.
        for ready, events in poller.poll(0 if reported else None):
            if ready != fd or events & (select.POLLERR | select.POLLHUP):
                return
        used = controller.in_use(drain(fd))
        controller.refresh()
        reported = used or controller.held()
        if reported:
            print('{"input":true}', flush=True)
            # Events pile up meanwhile and are looked at in one go.
            time.sleep(ACTIVITY_EVERY)
        else:
            time.sleep(QUIET_REST)


if __name__ == '__main__':
    try:
        if '--activity' in sys.argv[1:-1]:
            watch(sys.argv[-1])
        else:
            main(sys.argv[-1], raw='--raw' in sys.argv[1:-1])
    except (OSError, KeyboardInterrupt):
        pass
