// SPDX-FileCopyrightText: 2026 Nahuel Genchi
// SPDX-License-Identifier: GPL-2.0-or-later

// Draws the controller picture with the live input state on top.
// Every position below is in pixels of the full-size artwork (1444 x 1007).

const ART_WIDTH = 1444;
const ART_HEIGHT = 1007;
// Room around the artwork for its glow and, above it, for the trigger gauges,
// which the front view hides.
const MARGIN_SIDE = 130;
const MARGIN_TOP = 110;
const MARGIN_BOTTOM = 100;
// The glow picture is the artwork's outline, blurred, with this much around it.
const GLOW_MARGIN = 130;

const CENTER_X = 721.25;
const TAU = 2 * Math.PI;

const GREEN = [0.2, 0.86, 0.2];
const PRESSED_ALPHA = 0.82;
// Buttons the checklist has seen pressed, while they are up again
const SEEN_ALPHA = 0.36;

// Glow colour and strength on a dark menu and on a light one
const GLOW_ON_DARK = [...GREEN, 0.55];
const GLOW_ON_LIGHT = [0.06, 0.49, 0.06, 0.5];
const PLACEHOLDER_ALPHA = 0.16;

const ROUND_BUTTONS = {
    a: [1086.5, 370, 45.5],
    b: [1182.5, 277.5, 45.5],
    x: [988.5, 275.5, 45.5],
    y: [1082.5, 183, 44.5],
    view: [618, 277.5, 33.5],
    menu: [824.5, 277.5, 33.5],
    xbox: [721.5, 134, 53],
};

// x, y, width, height, corner radius
const BOX_BUTTONS = {
    share: [680, 328, 80, 50, 20],
    up: [499, 407, 71, 69, 12],
    down: [499, 546, 71, 63, 12],
    left: [433, 476, 66, 70, 12],
    right: [570, 476, 70, 70, 12],
};

const STICKS = {
    ls: {x: 358, y: 277.5, axes: ['lx', 'ly']},
    rs: {x: 906.5, y: 490.5, axes: ['rx', 'ry']},
};
const STICK_CAP_RADIUS = 80;
const STICK_WELL_RADIUS = 92.5;
const STICK_TRAVEL = 30;

// Left bumper: the lower edge follows the seam with the faceplate, the rest
// overshoots the outline and is trimmed by the artwork's own transparency.
const LEFT_BUMPER = [
    [200, 150], [212, 140], [228, 121], [260, 98], [300, 78], [340, 63], [380, 52],
    [420, 44], [460, 39], [500, 37], [506, 30], [506, -10], [200, -10],
];

const LEFT_TRIGGER = [300, -56, 170, 44, 14];

const mirror = x => 2 * CENTER_X - x;

function roundedBox(cr, x, y, w, h, r) {
    cr.newSubPath();
    cr.arc(x + w - r, y + r, r, -TAU / 4, 0);
    cr.arc(x + w - r, y + h - r, r, 0, TAU / 4);
    cr.arc(x + r, y + h - r, r, TAU / 4, TAU / 2);
    cr.arc(x + r, y + r, r, TAU / 2, TAU * 3 / 4);
    cr.closePath();
}

function paintArt(cr, image) {
    const fit = ART_WIDTH / image.getWidth();
    cr.save();
    cr.scale(fit, fit);
    cr.setSourceSurface(image, 0, 0);
    cr.paint();
    cr.restore();
}

// Flat shape of the controller in one colour
function paintSilhouette(cr, image, colour, alpha) {
    const fit = ART_WIDTH / image.getWidth();
    cr.save();
    cr.scale(fit, fit);
    cr.setSourceRGBA(...colour, alpha);
    cr.maskSurface(image, 0, 0);
    cr.restore();
}

function drawGlow(cr, glow, [r, g, b, alpha]) {
    const fit = (ART_WIDTH + 2 * GLOW_MARGIN) / glow.getWidth();
    cr.save();
    cr.translate(-GLOW_MARGIN, -GLOW_MARGIN);
    cr.scale(fit, fit);
    cr.setSourceRGBA(r, g, b, alpha);
    cr.maskSurface(glow, 0, 0);
    cr.restore();
}

function drawStick(cr, image, stick, state, alpha) {
    let dx = state[stick.axes[0]] ?? 0;
    let dy = state[stick.axes[1]] ?? 0;
    // A real stick moves in a circle; the raw corners reach past it.
    const reach = Math.hypot(dx, dy);
    if (reach > 1) {
        dx /= reach;
        dy /= reach;
    }

    // Empty well where the cap sits in the artwork
    cr.arc(stick.x, stick.y, STICK_WELL_RADIUS, 0, TAU);
    cr.setSourceRGB(0.03, 0.03, 0.03);
    cr.fill();

    // The cap itself, cut from the artwork and slid to where the stick is
    cr.save();
    cr.translate(dx * STICK_TRAVEL, dy * STICK_TRAVEL);
    cr.arc(stick.x, stick.y, STICK_CAP_RADIUS, 0, TAU);
    cr.clip();
    paintArt(cr, image);
    if (alpha) {
        cr.setSourceRGBA(...GREEN, alpha);
        cr.paint();
    }
    cr.restore();
}

function drawBumper(cr, image, right, alpha) {
    cr.save();
    LEFT_BUMPER.forEach(([x, y], i) => {
        if (i === 0)
            cr.moveTo(right ? mirror(x) : x, y);
        else
            cr.lineTo(right ? mirror(x) : x, y);
    });
    cr.closePath();
    cr.clip();
    paintSilhouette(cr, image, GREEN, alpha);
    cr.restore();
}

function drawTrigger(cr, value, right, foreground, seen) {
    const [x, y, w, h, r] = LEFT_TRIGGER;
    const left = right ? mirror(x + w) : x;

    roundedBox(cr, left, y, w, h, r);
    if (seen)
        cr.setSourceRGBA(...GREEN, SEEN_ALPHA);
    else
        cr.setSourceRGBA(...foreground, 0.18);
    cr.fill();

    const pulled = Math.min(Math.max(value ?? 0, 0), 1);
    if (pulled <= 0)
        return;
    // Fills from the outside in, so the two gauges mirror each other.
    cr.save();
    cr.rectangle(right ? left + w * (1 - pulled) : left, y, w * pulled, h);
    cr.clip();
    roundedBox(cr, left, y, w, h, r);
    cr.setSourceRGB(...GREEN);
    cr.fill();
    cr.restore();
}

/**
 * Draws a connected controller, as large as fits and centred.
 *
 * @param {object} cr - cairo context
 * @param {number} width - space to draw in
 * @param {number} height
 * @param {object} images - cairo surfaces: {art, glow}
 * @param {object} state - {buttons: string[], lx, ly, rx, ry, lt, rt}
 * @param {number[]} foreground - text colour of the surrounding UI, as [r, g, b]
 * @param {Set<string>} [seen] - buttons to keep lit, more faintly, while up
 */
export function drawController(cr, width, height, images, state, foreground, seen = new Set()) {
    const pressed = new Set(state.buttons ?? []);
    const image = images.art;
    // How strongly a button is lit: pressed, seen by the checklist, or not
    const alpha = (name, pressedAlpha = PRESSED_ALPHA) => {
        if (pressed.has(name))
            return pressedAlpha;
        return seen.has(name) ? SEEN_ALPHA : 0;
    };

    const fullWidth = ART_WIDTH + 2 * MARGIN_SIDE;
    const fullHeight = MARGIN_TOP + ART_HEIGHT + MARGIN_BOTTOM;
    const fit = Math.min(width / fullWidth, height / fullHeight);

    cr.save();
    cr.translate((width - fullWidth * fit) / 2, (height - fullHeight * fit) / 2);
    cr.scale(fit, fit);
    cr.translate(MARGIN_SIDE, MARGIN_TOP);

    // Light text means a dark menu.
    const [r, g, b] = foreground;
    const onDark = 0.299 * r + 0.587 * g + 0.114 * b > 0.5;
    drawGlow(cr, images.glow, onDark ? GLOW_ON_DARK : GLOW_ON_LIGHT);

    drawTrigger(cr, state.lt, false, foreground, seen.has('lt'));
    drawTrigger(cr, state.rt, true, foreground, seen.has('rt'));

    paintArt(cr, image);

    for (const [name, right] of [['lb', false], ['rb', true]]) {
        if (alpha(name))
            drawBumper(cr, image, right, alpha(name));
    }

    for (const [name, [x, y, radius]] of Object.entries(ROUND_BUTTONS)) {
        if (!alpha(name))
            continue;
        cr.setSourceRGBA(...GREEN, alpha(name));
        cr.arc(x, y, radius, 0, TAU);
        cr.fill();
    }
    for (const [name, box] of Object.entries(BOX_BUTTONS)) {
        if (!alpha(name))
            continue;
        cr.setSourceRGBA(...GREEN, alpha(name));
        roundedBox(cr, ...box);
        cr.fill();
    }

    for (const [name, stick] of Object.entries(STICKS))
        drawStick(cr, image, stick, state, alpha(name, 0.6));

    cr.restore();
}

/**
 * Draws the outline of a controller that is not there, as large as fits and
 * centred.
 *
 * @param {object} cr - cairo context
 * @param {number} width - space to draw in
 * @param {number} height
 * @param {object} image - cairo surface holding the controller artwork
 * @param {number[]} foreground - text colour of the surrounding UI, as [r, g, b]
 */
export function drawPlaceholder(cr, width, height, image, foreground) {
    const fit = Math.min(width / ART_WIDTH, height / ART_HEIGHT);
    cr.save();
    cr.translate((width - ART_WIDTH * fit) / 2, (height - ART_HEIGHT * fit) / 2);
    cr.scale(fit, fit);
    paintSilhouette(cr, image, foreground, PLACEHOLDER_ALPHA);
    cr.restore();
}
