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
 * Derived from dwm <https://dwm.suckless.org>, MIT/X Consortium License.
 * See LICENSE.dwm for dwm's copyright and permission notice.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import Cairo from 'gi://cairo';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import St from 'gi://St';
import GnomeDesktop from 'gi://GnomeDesktop';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as theme from './theme.js';

export const ClkTagBar = 0;
export const ClkLtSymbol = 1;
export const ClkStatusText = 2;
export const ClkWinTitle = 3;
export const ClkBar = 4;
const SchemeNorm = 0;
const SchemeSel = 1;
const ColFg = 0;
const ColBg = 1;

/* variables */
let stext = '';
let bh = 0;
let lrpad = 0;
let scheme = null;
let drw = null;
let barwin = null;
let statuswin = null;
let wallclock = null;

function TEXTW(text) {
    return drw_text(null, 0, 0, 0, 0, 0, text) + lrpad;
}

export function cleanup() {
    Main.panel.disconnectObject(barwin);
    wallclock.disconnectObject(barwin);
    Main.panel.remove_style_class_name(`h${bh}`);
    for (const actor of panelactors()) {
        actor.remove_style_class_name('dwm-panel');
        actor.remove_style_class_name('selected-dwm-panel');
        actor.remove_style_class_name('normal-dwm-panel');
    }
    Main.panel.statusArea.dateMenu?.show();
    Main.panel.statusArea.activities?.show();
    barwin.destroy();
    statuswin.destroy();
    barwin = statuswin = wallclock = drw = scheme = null;
}

function drawbar(m, tags) {
    const cr = barwin.get_context();
    const boxs = Math.trunc(drw.fonts.h / 9);
    const boxw = Math.trunc(drw.fonts.h / 6) + 2;
    let x, w, occ = 0;

    /* the panel gives its left box at most half the width minus the center box */
    const tw = m.ww - Math.trunc((m.ww - Main.panel._centerBox.width) / 2);

    for (const c of m.clients)
        occ |= c.tags;
    x = 0;
    for (let i = 0; i < tags.length; i++) {
        w = TEXTW(tags[i]);
        drw_setscheme(scheme[m.tagset[m.seltags] & 1 << i ? SchemeSel : SchemeNorm]);
        drw_text(cr, x, 0, w, bh, lrpad / 2, tags[i]);
        if (occ & 1 << i)
            drw_rect(cr, x + boxs, boxs, boxw, boxw, m.sel && m.sel.tags & 1 << i);
        x += w;
    }
    w = TEXTW(m.ltsymbol);
    drw_setscheme(scheme[SchemeNorm]);
    x = drw_text(cr, x, 0, w, bh, lrpad / 2, m.ltsymbol);

    if ((w = m.ww - tw - x) > bh && m.sel) {
        drw_setscheme(scheme[SchemeSel]);
        drw_text(cr, x, 0, w, bh, lrpad / 2, m.sel.win.get_title());
        if (m.sel.isfloating)
            drw_rect(cr, x + boxs, boxs, boxw, boxw, m.sel.isfixed);
        x += w;
    }
    barwin.width = x;
    barwin.height = bh;
}

export function drawbars() {
    barwin?.queue_repaint();
}

/* no dwm counterpart: dwm paints stext inside drawbar, here it is a second
 * actor in the panel's right box with its own repaint */
function drawstatus() {
    const cr = statuswin.get_context();
    const w = TEXTW(stext) + lrpad;

    drw_setscheme(scheme[SchemeNorm]);
    drw_text(cr, 0, 0, w, bh, lrpad * 3 / 2, stext);
    statuswin.width = w;
    statuswin.height = bh;
}

function drw_clr_create(clrname) {
    return [1, 3, 5].map(i => parseInt(clrname.slice(i, i + 2), 16) / 255);
}

function drw_rect(cr, x, y, w, h, filled) {
    cr.setSourceRGB(...drw.scheme[ColFg]);
    if (filled) {
        cr.rectangle(x, y, w, h);
        cr.fill();
    } else {
        cr.setLineWidth(1);
        cr.rectangle(x + 0.5, y + 0.5, w - 1, h - 1);
        cr.stroke();
    }
}

function drw_scm_create(clrnames) {
    return clrnames.map(drw_clr_create);
}

function drw_setscheme(scm) {
    drw.scheme = scm;
}

function drw_text(cr, x, y, w, h, lpad, text) {
    const render = x || y || w || h;

    drw.layout.set_text(text, -1);
    if (!render) {
        drw.layout.set_width(-1);
        return drw.layout.get_pixel_size()[0];
    }
    cr.setSourceRGB(...drw.scheme[ColBg]);
    cr.rectangle(x, y, w, h);
    cr.fill();
    if (w < lpad)
        return x + w;
    x += lpad;
    w -= lpad;

    PangoCairo.update_layout(cr, drw.layout);
    drw.layout.set_width(w * Pango.SCALE);
    cr.moveTo(x, y + (h - drw.fonts.h) / 2);
    cr.setSourceRGB(...drw.scheme[ColFg]);
    PangoCairo.show_layout(cr, drw.layout);
    return x + w;
}

function getclick(m, tags, event) {
    const [sx] = event.get_coords();
    const [bx] = barwin.get_transformed_position();
    const ex = sx - bx;
    let i = 0;
    let x = 0;

    do
        x += TEXTW(tags[i]);
    while (ex >= x && ++i < tags.length);
    if (i < tags.length)
        return [ClkTagBar, 1 << i];
    if (ex < x + TEXTW(m.ltsymbol))
        return [ClkLtSymbol, null];
    return [ClkWinTitle, null];
}

export function setup(m, tags, buttonpress) {
    const font = theme.fonts();
    const surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, 1, 1);
    const layout = PangoCairo.create_layout(new Cairo.Context(surface));
    layout.set_font_description(font);
    layout.set_ellipsize(Pango.EllipsizeMode.END);
    const metrics = layout.get_context().get_metrics(font, null);
    const h = Math.ceil(metrics.get_ascent() / Pango.SCALE) +
        Math.ceil(metrics.get_descent() / Pango.SCALE);

    drw = {layout, fonts: {h}, scheme: null};
    scheme = theme.colors().map(drw_scm_create);
    bh = drw.fonts.h + 2;
    lrpad = drw.fonts.h;
    Main.panel.add_style_class_name(`h${bh}`);
    for (const actor of panelactors()) {
        actor.add_style_class_name('dwm-panel');
        actor.add_style_class_name(actor === Main.panel ? 'selected-dwm-panel' : 'normal-dwm-panel');
    }

    barwin = new St.DrawingArea({reactive: true, width: 1, height: 1});
    statuswin = new St.DrawingArea({reactive: true, width: 1, height: 1});
    wallclock = new GnomeDesktop.WallClock();

    barwin.connect('repaint', () => drawbar(m, tags));
    barwin.connect('button-press-event', (_actor, event) => {
        return buttonpress(...getclick(m, tags, event), event)
            ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE;
    });
    statuswin.connect('repaint', drawstatus);
    statuswin.connect('button-press-event', (_actor, event) => {
        return buttonpress(ClkStatusText, null, event)
            ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE;
    });
    wallclock.connectObject('notify::clock', updatestatus, barwin);
    Main.panel.connectObject('button-press-event', (panel, event) => {
        if (event.get_source() !== null && event.get_source() !== panel)
            return Clutter.EVENT_PROPAGATE;
        return buttonpress(ClkBar, null, event)
            ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE;
    }, barwin);

    Main.panel._leftBox.insert_child_at_index(barwin, 0);
    Main.panel._rightBox.insert_child_at_index(statuswin, 0);
    Main.panel.statusArea.dateMenu?.hide();
    Main.panel.statusArea.activities?.hide();
    updatestatus();
}

function panelactors(actor = Main.panel) {
    if (actor instanceof St.DrawingArea)
        return [];
    return [actor, ...actor.get_children().flatMap(child => panelactors(child))]
        .filter(a => a instanceof St.Widget);
}

function updatestatus() {
    stext = (wallclock.clock || 'no clock')
        .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
        .replace(/\u2002/g, ' ')
        .replace(/\u2236/g, ':')
        .replace(/ (?=[^ ]*$)/, '  ');
    statuswin.queue_repaint();
}
