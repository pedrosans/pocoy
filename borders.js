/* Highlight Focus is Copyright (C) 2021-2024 Pim Snel
 *
 * Highlight Focus is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation
 *
 * Highlight Focus is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Highlight Focus.  If not, see <http://www.gnu.org/licenses/>.
 *
 * Adapted for Pocoy by Pedro Santos, 2026.
 *
 * SPDX-License-Identifier: GPL-3.0-only
 */

import St from 'gi://St';
import * as theme from './theme.js';

const borders = new Map();
let ISCLIENT = null;

function ISELIGIBLE(win) {
    return ISCLIENT(win) &&
        win.get_workspace().active &&
        win.showing_on_its_workspace() &&
        !win.get_maximized();
}

export function setup(isclient) {
    ISCLIENT = isclient;
    sync();
    global.display.connectObject(
        'notify::focus-window', () => {
            if (ISELIGIBLE(global.display.focus_window))
                sync();
        },
        'window-created', (_display, win) => {
            if (ISELIGIBLE(win))
                sync();
        },
        'restacked', () => borders.forEach(restack),
        borders);
    global.window_manager.connectObject(
        'size-changed', (_wm, actor) => {
            if (ISELIGIBLE(actor.meta_window))
                borders.forEach(move);
        },
        'switch-workspace', () => sync(),
        borders);
}

export function cleanup() {
    global.display.disconnectObject(borders);
    global.window_manager.disconnectObject(borders);
    for (const border of borders.values())
        remove(border);
    ISCLIENT = null;
}

function sync() {
    const windows = global.get_window_actors()
        .map(actor => actor.meta_window)
        .filter(ISELIGIBLE);

    for (const border of borders.values())
        if (!windows.includes(border.win))
            remove(border);

    for (const win of windows)
        if (!borders.has(win))
            add(win);

    for (const border of borders.values()) {
        move(border);
        style(border);
        restack(border);
    }
}

function add(win) {
    const overlay = new St.Bin({style_class: 'normal-border'});
    const underlay = new St.Bin({style_class: 'normal-background'});
    global.window_group.add_child(overlay);
    global.window_group.add_child(underlay);

    const border = {win, overlay, underlay};
    win.connectObject(
        'position-changed', () => move(border),
        'unmanaged', () => remove(border),
        'notify::minimized', () => sync(),
        border);
    borders.set(win, border);
}

function remove(border) {
    border.win.disconnectObject(border);
    border.overlay.destroy();
    border.underlay.destroy();
    borders.delete(border.win);
}

function move({win, overlay, underlay}) {
    const width = theme.borderpx();
    const rect = win.get_frame_rect();
    for (const actor of [overlay, underlay]) {
        actor.set_position(rect.x - width, rect.y - width);
        actor.set_size(rect.width + 2 * width, rect.height + 2 * width);
    }
}

function style({win, overlay}) {
    overlay.style_class = win === global.display.focus_window
        ? 'highlight-border'
        : 'normal-border';
}

function restack({win, overlay, underlay}) {
    const actor = win.get_compositor_private();
    global.window_group.set_child_above_sibling(overlay, actor);
    global.window_group.set_child_below_sibling(underlay, actor);
}
