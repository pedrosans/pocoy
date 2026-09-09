/* pocoy - a dwm-like tiling window manager for GNOME Shell
 *
 * Copyright (C) 2026 Pedro Santos
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';

let css = null;

export function setup(path) {
    const file = Gio.File.new_for_path(GLib.build_filenamev([path, 'stylesheet.css']));
    const [ok, contents] = file.load_contents(null);
    if (!ok)
        throw new Error('Failed to load stylesheet.css');
    css = new TextDecoder().decode(contents).replace(/\/\*[\s\S]*?\*\//g, '');
}

export function cleanup() {
    css = null;
}

function rule(selector) {
    const block = new RegExp(`${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`).exec(css);
    const declarations = {};
    for (const [, property, value] of (block ? block[1] : '').matchAll(/([\w-]+)\s*:\s*([^;]+)/g))
        declarations[property] = value.trim();
    return declarations;
}

export function colors() {
    return ['.normal-dwm-panel', '.selected-dwm-panel']
        .map(rule)
        .map(declarations => [declarations['color'], declarations['background-color']]);
}

export function fonts() {
    const {'font-family': family, 'font-size': size} = rule('.dwm-panel');
    return Pango.FontDescription.from_string(`${family.replace(/["']/g, '').split(',')[0].trim()} ${size.replace(/pt$/, '')}`);
}

export function borderpx() {
    return parseInt(rule('.highlight-border')['border'] ?? '1px');
}
