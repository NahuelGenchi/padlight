# SPDX-FileCopyrightText: 2026 Nahuel Genchi
# SPDX-License-Identifier: GPL-2.0-or-later
"""Tests for monitor.py and rumble.py, with the device calls replaced by fakes.
Run: python3 -m unittest discover -s tests"""
import os
import struct
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src'))
import monitor  # noqa: E402
import rumble  # noqa: E402

EV_KEY, EV_ABS, EV_FF = 0x01, 0x03, 0x15
ABS_X, ABS_Y, ABS_Z, ABS_RX, ABS_RY, ABS_RZ = 0, 1, 2, 3, 4, 5
ABS_GAS, ABS_BRAKE, ABS_HAT0X, ABS_HAT0Y = 9, 10, 16, 17
BTN_A, BTN_B, BTN_MODE, KEY_RECORD = 0x130, 0x131, 0x13c, 0xa7

HATS = {ABS_HAT0X: (0, -1, 1, 0), ABS_HAT0Y: (0, -1, 1, 0)}
# The xpad driver: signed sticks, triggers on Z and RZ
XPAD = {ABS_X: (0, -32768, 32767, 128), ABS_Y: (0, -32768, 32767, 128),
        ABS_RX: (0, -32768, 32767, 128), ABS_RY: (0, -32768, 32767, 128),
        ABS_Z: (0, 0, 1023, 0), ABS_RZ: (0, 0, 1023, 0), **HATS}
# A Series X|S controller over Bluetooth LE with hid-microsoft, as found in #3
BLUETOOTH = {ABS_X: (32768, 0, 65535, 4095), ABS_Y: (32768, 0, 65535, 4095),
             ABS_Z: (32768, 0, 65535, 4095), ABS_RZ: (32768, 0, 65535, 4095),
             ABS_GAS: (0, 0, 1023, 63), ABS_BRAKE: (0, 0, 1023, 63), **HATS}


class FakeController:
    """Answers monitor.py's ioctls like a controller with these axes and held keys."""

    def __init__(self, axes, held=()):
        self.axes = axes    # code: (value, minimum, maximum, flat)
        self.held = held

    def ioctl(self, _fd, request, buffer):
        number = request & 0xff
        if number == 0x20 + EV_ABS:     # EVIOCGBIT(EV_ABS): which axes exist
            for code in self.axes:
                buffer[code // 8] |= 1 << (code % 8)
        elif 0x40 <= number < 0x80:     # EVIOCGABS(code)
            value, low, high, flat = self.axes[number - 0x40]
            struct.pack_into('iiiiii', buffer, 0, value, low, high, 0, flat, 0)
        elif number == 0x18:            # EVIOCGKEY: keys held right now
            for code in self.held:
                buffer[code // 8] |= 1 << (code % 8)
        else:
            raise OSError(25, f'unexpected ioctl {request:#x}')
        return 0


def events(*changes):
    return b''.join(struct.pack('llHHi', 0, 0, kind, code, value) for kind, code, value in changes)


def controller(axes, held=()):
    with mock.patch.object(monitor.fcntl, 'ioctl', FakeController(axes, held).ioctl):
        return monitor.Controller(3)


RESTING = {'buttons': [], 'lx': 0, 'ly': 0, 'rx': 0, 'ry': 0, 'lt': 0, 'rt': 0}


class MonitorTest(unittest.TestCase):
    def test_xpad_layout(self):
        pad = controller(XPAD)
        self.assertEqual(pad.state(), RESTING)
        pad.feed(events((EV_KEY, BTN_A, 1), (EV_ABS, ABS_X, 32767), (EV_ABS, ABS_Y, -32768),
                        (EV_ABS, ABS_RX, -32768), (EV_ABS, ABS_Z, 1023), (EV_ABS, ABS_RZ, 512),
                        (EV_ABS, ABS_HAT0X, 1)))
        self.assertEqual(pad.state(), {'buttons': ['a', 'right'], 'lx': 1.0, 'ly': -1.0,
                                       'rx': -1.0, 'ry': 0, 'lt': 1.0, 'rt': 0.5})

    def test_bluetooth_layout(self):
        """Right stick on Z and RZ, LT on BRAKE and RT on GAS, as the real controller sent them in #3"""
        pad = controller(BLUETOOTH)
        self.assertEqual(pad.state(), RESTING)
        pad.feed(events((EV_ABS, ABS_Z, 65535), (EV_ABS, ABS_RZ, 0), (EV_ABS, ABS_BRAKE, 1023),
                        (EV_ABS, ABS_GAS, 0), (EV_ABS, ABS_HAT0Y, -1),
                        (EV_KEY, KEY_RECORD, 1), (EV_KEY, BTN_MODE, 1)))
        self.assertEqual(pad.state(), {'buttons': ['share', 'up', 'xbox'], 'lx': 0, 'ly': 0,
                                       'rx': 1.0, 'ry': -1.0, 'lt': 1.0, 'rt': 0})

    def test_dead_zone(self):
        pad = controller(XPAD)
        pad.feed(events((EV_ABS, ABS_X, 100), (EV_ABS, ABS_Y, 3277)))
        state = pad.state()
        self.assertEqual((state['lx'], state['ly']), (0, 0.1))

    def test_raw_keeps_the_dead_zone_and_finer_steps(self):
        """--raw, for the stick check: no dead zone, three decimals"""
        pad = controller(XPAD)
        pad.feed(events((EV_ABS, ABS_X, 100), (EV_ABS, ABS_Y, 3277), (EV_ABS, ABS_Z, 333)))
        plain, raw = pad.state(), pad.state(raw=True)
        self.assertEqual((plain['lx'], plain['ly'], plain['lt']), (0, 0.1, 0.33))
        self.assertEqual((raw['lx'], raw['ly'], raw['lt']), (0.003, 0.1, 0.326))

    def test_raw_bluetooth_rest(self):
        """A Bluetooth stick at rest sits half a step off the middle, which rounds to 0"""
        pad = controller(BLUETOOTH)
        self.assertEqual(pad.state(raw=True), RESTING)
        pad.feed(events((EV_ABS, ABS_X, 32768 + 1000), (EV_ABS, ABS_RZ, 32768 - 3000)))
        raw = pad.state(raw=True)
        self.assertEqual((raw['lx'], raw['ry']), (0.031, -0.092))
        self.assertEqual((pad.state()['lx'], pad.state()['ry']), (0, 0))

    def test_keys_held_at_start_and_released(self):
        pad = controller(XPAD, held=(BTN_B,))
        self.assertEqual(pad.state()['buttons'], ['b'])
        pad.feed(events((EV_KEY, BTN_B, 0)))
        self.assertEqual(pad.state()['buttons'], [])

    def test_missing_axes_read_as_resting(self):
        pad = controller({ABS_X: (0, -32768, 32767, 128), ABS_Y: (0, -32768, 32767, 128)})
        self.assertEqual(pad.state(), RESTING)


class RumbleTest(unittest.TestCase):
    @unittest.skipUnless(struct.calcsize('l') == 8, 'struct ff_effect is 48 bytes on 64-bit Linux')
    def test_ioctl_number(self):
        self.assertEqual(rumble.EVIOCSFF, 0x40304580)

    def play(self, call):
        """Runs call() with the device faked; returns the effect sent, its id
        written back, and the write and close mocks."""
        sent = {}

        def ioctl(_fd, request, effect):
            sent['request'], sent['effect'] = request, bytes(effect)
            struct.pack_into('h', effect, 2, 5)     # the kernel writes back the effect id

        with mock.patch.object(rumble.os, 'open', return_value=7), \
                mock.patch.object(rumble.fcntl, 'ioctl', ioctl), \
                mock.patch.object(rumble.os, 'write') as write, \
                mock.patch.object(rumble.os, 'close') as close, \
                mock.patch.object(rumble.time, 'sleep') as sleep:
            call()

        self.assertEqual(sent['request'], rumble.EVIOCSFF)
        effect_type, effect_id, _direction, _button, _interval, length, delay, strong, weak = \
            struct.unpack(rumble.FF_EFFECT, sent['effect'])
        self.assertEqual((effect_type, effect_id, delay), (0x50, -1, 0))
        write.assert_called_once_with(7, struct.pack('llHHi', 0, 0, EV_FF, 5, 1))
        close.assert_called_once_with(7)
        sleep.assert_called_once_with(length / 1000 + 0.1)
        return length, strong, weak

    def test_plays_one_rumble_and_closes(self):
        """Test Vibration: both motors at 75% (0xC000) for 0.4 s"""
        self.assertEqual(self.play(lambda: rumble.rumble('/dev/input/event0')), (400, 0xC000, 0xC000))
        self.assertEqual(self.play(lambda: rumble.main(['/dev/input/event0'])), (400, 0xC000, 0xC000))

    def test_vibration_lab_values(self):
        played = self.play(lambda: rumble.main(['--strong', '30', '--weak', '100', '--length', '1200',
                                                '/dev/input/event0']))
        self.assertEqual(played, (1200, rumble.magnitude(30), 0xFFFF))

    def test_values_are_brought_within_limits(self):
        played = self.play(lambda: rumble.main(['--strong', '150', '--weak', '-5', '--length', '60000',
                                                '/dev/input/event0']))
        self.assertEqual(played, (2000, 0xFFFF, 0))
        self.assertEqual(self.play(lambda: rumble.rumble('/dev/input/event0', length=1))[0], 50)

    def test_strengths_survive_scaling_back_to_percent(self):
        """hid-microsoft turns the magnitude back into 0-100 with magnitude * 100 / 0xFFFF"""
        for percent in range(101):
            self.assertEqual(rumble.magnitude(percent) * 100 // 0xFFFF, percent)
            self.assertLessEqual(rumble.magnitude(percent), 0xFFFF)


if __name__ == '__main__':
    unittest.main()
