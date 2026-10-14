#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Nahuel Genchi
# SPDX-License-Identifier: GPL-2.0-or-later
"""Plays a short rumble on a game controller: rumble.py /dev/input/eventN"""
import fcntl
import os
import struct
import sys
import time

EV_FF = 0x15
FF_RUMBLE = 0x50
DURATION_MS = 400
STRENGTH = 0xC000

# struct ff_effect (with the rumble member of its union) and struct input_event
FF_EFFECT = 'HhHHHHHxxHH28x'
INPUT_EVENT = 'llHHi'
EVIOCSFF = (1 << 30) | (struct.calcsize(FF_EFFECT) << 16) | (ord('E') << 8) | 0x80


def rumble(path):
    fd = os.open(path, os.O_RDWR)
    try:
        # id -1 asks the kernel for a free effect slot; it writes the id back.
        effect = bytearray(struct.pack(
            FF_EFFECT, FF_RUMBLE, -1, 0, 0, 0, DURATION_MS, 0, STRENGTH, STRENGTH))
        fcntl.ioctl(fd, EVIOCSFF, effect)
        effect_id = struct.unpack_from('h', effect, 2)[0]
        os.write(fd, struct.pack(INPUT_EVENT, 0, 0, EV_FF, effect_id, 1))
        time.sleep(DURATION_MS / 1000 + 0.1)
    finally:
        # Closing the device also removes the effect.
        os.close(fd)


if __name__ == '__main__':
    rumble(sys.argv[1])
