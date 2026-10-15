#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Nahuel Genchi
# SPDX-License-Identifier: GPL-2.0-or-later
"""Plays a rumble on a game controller:
rumble.py [--strong PERCENT] [--weak PERCENT] [--length MS] /dev/input/eventN

The strong motor is the left one, the weak motor the right one. Without
options it plays Test Vibration's short buzz. Strengths run from 0 to 100 and
the length from 50 ms to 2 s; values outside are brought within.
"""
import argparse
import fcntl
import math
import os
import struct
import time

EV_FF = 0x15
FF_RUMBLE = 0x50
DURATION_MS = 400
STRENGTH = 75
MIN_LENGTH_MS = 50
MAX_LENGTH_MS = 2000

# struct ff_effect (with the rumble member of its union) and struct input_event
FF_EFFECT = 'HhHHHHHxxHH28x'
INPUT_EVENT = 'llHHi'
EVIOCSFF = (1 << 30) | (struct.calcsize(FF_EFFECT) << 16) | (ord('E') << 8) | 0x80


def magnitude(percent):
    """A strength from 0 to 100 as the kernel's 16-bit magnitude. Rounded up,
    so drivers that scale it back to percent, such as hid-microsoft, get the
    same number."""
    return math.ceil(min(max(percent, 0), 100) * 0xFFFF / 100)


def rumble(path, strong=STRENGTH, weak=STRENGTH, length=DURATION_MS):
    length = round(min(max(length, MIN_LENGTH_MS), MAX_LENGTH_MS))
    fd = os.open(path, os.O_RDWR)
    try:
        # id -1 asks the kernel for a free effect slot; it writes the id back.
        effect = bytearray(struct.pack(
            FF_EFFECT, FF_RUMBLE, -1, 0, 0, 0, length, 0, magnitude(strong), magnitude(weak)))
        fcntl.ioctl(fd, EVIOCSFF, effect)
        effect_id = struct.unpack_from('h', effect, 2)[0]
        os.write(fd, struct.pack(INPUT_EVENT, 0, 0, EV_FF, effect_id, 1))
        time.sleep(length / 1000 + 0.1)
    finally:
        # Closing the device also removes the effect.
        os.close(fd)


def main(args=None):
    parser = argparse.ArgumentParser(description='Plays a rumble on a game controller.')
    parser.add_argument('--strong', type=float, default=STRENGTH, help='left motor, 0 to 100')
    parser.add_argument('--weak', type=float, default=STRENGTH, help='right motor, 0 to 100')
    parser.add_argument('--length', type=float, default=DURATION_MS, help='milliseconds, 50 to 2000')
    parser.add_argument('device')
    options = parser.parse_args(args)
    rumble(options.device, options.strong, options.weak, options.length)


if __name__ == '__main__':
    main()
