// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

// Nicknames: which controllers can keep one, the key it is kept under, and
// how a typed nickname is tidied. Run: gjs -m tests/nicknames.test.js

import {canHaveNickname, cleanNickname, controllerName, NICKNAME_LENGTH, nicknameKey} from '../src/nicknames.js';
import {done, equal, test} from './harness.js';

// Documentation addresses (RFC 7042) and a made-up serial number
const ADDRESS = '00:00:5e:00:53:01';
const SALT = 'salt-123';
const bluetooth = (address = ADDRESS) => ({connection: 'bluetooth', address, serial: null, name: 'Xbox Wireless Controller'});
const wired = (serial = 'TEST0SERIAL01') => ({connection: 'usb', address: null, serial, name: 'Xbox Series S|X Controller'});

test('controllers that can keep a nickname', () => {
    equal(canHaveNickname(bluetooth()), true, 'Bluetooth, by address');
    equal(canHaveNickname(wired()), true, 'on a cable, by serial number');
    equal(canHaveNickname(wired(null)), false, 'on a cable without a serial number');
    equal(canHaveNickname({connection: 'adapter', address: null, serial: null}), false, 'nothing to tell it by');
});

test('the key is an HMAC-SHA256 of the address with the salt', () => {
    // Worked out apart from Padlight, with Python's hmac module. Saved
    // nicknames are lost if this ever changes.
    equal(nicknameKey(bluetooth(), SALT), '993745de2606c47246364ec0c9f33eab56376221dcb5e31799b9a3ac6e72c49a');
});

test('the key is 64 hex digits, without the address in it', () => {
    for (const key of [nicknameKey(bluetooth(), SALT), nicknameKey(wired(), SALT)])
        equal(/^[0-9a-f]{64}$/.test(key), true, `64 hex digits: ${key}`);
    equal(nicknameKey(bluetooth(), SALT).includes('00005e005301'), false, 'the address digits');
});

test('one key per controller, whatever the case of the address', () => {
    equal(nicknameKey(bluetooth(ADDRESS.toUpperCase()), SALT), nicknameKey(bluetooth(), SALT), 'upper case');
    equal(nicknameKey(bluetooth('00:00:5e:00:53:02'), SALT) === nicknameKey(bluetooth(), SALT), false,
        'another address');
    equal(nicknameKey(wired('TEST0SERIAL02'), SALT) === nicknameKey(wired(), SALT), false, 'another serial number');
    equal(nicknameKey(wired(ADDRESS), SALT) === nicknameKey(bluetooth(), SALT), false,
        'a serial number that reads like an address');
});

test('another computer, with another salt, has other keys', () => {
    equal(nicknameKey(bluetooth(), 'salt-456') === nicknameKey(bluetooth(), SALT), false);
});

test('no key without the salt, or for a controller that cannot keep a nickname', () => {
    equal(nicknameKey(bluetooth(), ''), null, 'no salt yet');
    equal(nicknameKey(wired(null), SALT), null, 'no serial number');
});

test('a typed nickname is tidied', () => {
    equal(cleanNickname('  Blue   pad '), 'Blue pad', 'spaces');
    equal(cleanNickname('   '), '', 'only spaces');
    equal(cleanNickname('x'.repeat(40)), 'x'.repeat(NICKNAME_LENGTH), 'too long');
    equal([...cleanNickname('🎮'.repeat(40))].length, NICKNAME_LENGTH, 'counted in characters');
    equal(cleanNickname(`${'a'.repeat(NICKNAME_LENGTH - 1)} b`), 'a'.repeat(NICKNAME_LENGTH - 1),
        'no space left at the end once cut');
});

test('a controller is called by its nickname, or else by its model', () => {
    equal(controllerName({...bluetooth(), nickname: 'Blue pad'}), 'Blue pad', 'nickname');
    equal(controllerName({...bluetooth(), nickname: null}), 'Xbox Wireless Controller', 'none');
    equal(controllerName(bluetooth()), 'Xbox Wireless Controller', 'not looked up');
});

done();
