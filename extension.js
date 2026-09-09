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

import Meta from 'gi://Meta';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as borders from './borders.js';
import * as bar from './bar.js';
import Clutter from 'gi://Clutter';
import {ClkTagBar, ClkLtSymbol, ClkWinTitle, ClkStatusText} from './bar.js';
import * as theme from './theme.js';

function ISCLIENT(win) {
    return win &&
        !win.is_override_redirect() &&
        !win.is_skip_taskbar() &&
        win.get_workspace().index() === 0;
}

function ISTILED(c) {
    return !c.isfloating && !c.ismaximized && ISVISIBLE(c);
}

function ISVISIBLE(c) {
    return c.tags & c.mon.tagset[c.mon.seltags];
}

const [Button1, Button2, Button3] = [1, 2, 3];
const MAXIMIZED_NONE = 0;
const APPLY = 'apply';
const DRY_RUN = 'dry-run';
const CLEANMASK = Clutter.ModifierType.SHIFT_MASK | Clutter.ModifierType.CONTROL_MASK |
    Clutter.ModifierType.MOD1_MASK | Clutter.ModifierType.SUPER_MASK;

class Client {
    constructor(id) {
        this.id = id;
        this.isfloating = true;
        this.tags = 0;
        this.mon = selmon;
    }

    get win() {
        return global.get_window_actors()
            .find(a => a.meta_window.get_id() === this.id)?.meta_window;
    }

    get isfixed() {
        return !this.win.resizeable;
    }

    get ismaximized() {
        return this.win.get_maximized() !== MAXIMIZED_NONE;
    }

    get next() {
        const i = this.mon.clients.indexOf(this);
        return i === -1 ? null : this.mon.clients[i + 1] ?? null;
    }
}

class Layout {
    constructor(symbol, arrangefn) {
        this.symbol = symbol;
        this.arrange = arrangefn;
    }
}

class Rule {
    constructor(_class, instance, title, tags, isfloating, monitor) {
        this.class = _class;
        this.instance = instance;
        this.title = title;
        this.tags = tags;
        this.isfloating = isfloating;
        this.monitor = monitor;
    }
}

class Pertag {
    curtag;
    prevtag;
    sel = [];
    nmasters = [];
    mfacts = [];
    sellts = [];
    ltidxs = [];
}

class Monitor {
    mfact;
    nmaster;
    outergap;
    innergap;
    wx; wy; ww; wh;
    seltags;
    tagset;
    sellt;
    ltsymbol;
    lt;
    clients;
    sel;
    pertag;
}

class DryRunWindow {
    constructor(win) {
        this.win = win;
        this.destination = null;
    }

    get_frame_rect() {
        return this.win.get_frame_rect();
    }

    move_resize_frame(_ignore, x, y, w, h) {
        this.destination = [x, y, w, h];
    }

    is_tiled() {
        if (!this.destination)
            return false;
        const current = this.win.get_frame_rect();
        const [destX, destY, destW, destH] = this.destination;
        return Math.abs(current.x - destX) < tolerance &&
               Math.abs(current.y - destY) < tolerance &&
               Math.abs(current.width - destW) < tolerance &&
               Math.abs(current.height - destH) < tolerance;
    }
}

/* variables */
const statefile = GLib.build_filenamev([GLib.get_user_state_dir(), 'pocoy', 'pocoy-state.json']);
let extension = null;
let selmon = null;

const handler = [
    ['window-created',                  maprequest],
    ['workareas-changed',               configurenotify],
    ['notify::focus-window',            focusin],
];

const winhandler = [
    ['notify::maximized-horizontally',  maximizenotify],
    ['notify::maximized-vertically',    maximizenotify],
    ['unmanaged',                       unmanage],
];

/*
 * Colors, font and border width are deliberately NOT here. dwm declares them in
 * config.def.h as colors[][], fonts[] and borderpx; in pocoy they live in
 * stylesheet.css, which is the source of truth for all three.
 *
 *   dwm config.def.h                  stylesheet.css
 *   colors[SchemeNorm] fg, bg         .normal-dwm-panel color, background-color
 *   colors[SchemeSel]  fg, bg         .selected-dwm-panel color, background-color
 *   colors[SchemeNorm] border         .normal-border border
 *   colors[SchemeSel]  border         .highlight-border border
 *   fonts[]                           .dwm-panel font-family, font-size
 *   borderpx                          .highlight-border border width
 */
const outergap = 0;                  /* gap between the tiled area and the screen edges */
const innergap = 1;                  /* gap around each tiled client */

/* tagging */
const tags = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const TAGMASK = (1 << tags.length) - 1;

const rules = [
    /* xprop(1):
     *   WM_CLASS(STRING) = instance, class
     *   WM_NAME(STRING) = title
     */
    /*       class      instance  title  tags mask  isfloating  monitor */
    new Rule('Gimp',    null,     null,  0,         true,       -1),
    new Rule('Firefox', null,     null,  1 << 8,    false,      -1),
];

/* layout(s) */
const mfact = 0.55;                  /* factor of master area size [0.05..0.95] */
const nmaster = 1;                   /* number of clients in master area */

/* how far, in pixels, a window may sit from the geometry
 * the layout asked for and still count as tiled. See DryRunWindow. */
const tolerance = 200;

const layouts = [
    /*         symbol  arrange function */
    new Layout('[]=',  tile),        /* first entry is default */
    new Layout('><>',  null),        /* no layout function means floating behavior */
    new Layout('[M]',  monocle),
    new Layout('|[]',  flow),
];

/* key definitions */
const MODMASKS = {
    alt: Clutter.ModifierType.MOD1_MASK,
    control: Clutter.ModifierType.CONTROL_MASK,
    super: Clutter.ModifierType.SUPER_MASK,
};

const MODKEY = () => MODMASKS[extension.getSettings().get_string('modkey')] ?? MODMASKS.alt;

const TAGKEYS = (KEY, TAG) => [
    /* modifier                            function    argument */
    [`modkey-${KEY}`,                       view,       1 << TAG],
    [`modkey-controlmask-${KEY}`,           toggleview, 1 << TAG],
    [`modkey-shiftmask-${KEY}`,             tag,        1 << TAG],
    [`modkey-controlmask-shiftmask-${KEY}`, toggletag,  1 << TAG],
];

/* commands */
const termcmd = ['org.gnome.Ptyxis.desktop', 'org.gnome.Console.desktop', 'org.gnome.Terminal.desktop'];

const keys = [
    /* modifier, key                function     argument */
    ['modkey-xk-return',            zoom,        null],
    ['modkey-shiftmask-xk-return',  spawn,       termcmd],
    ['modkey-xk-j',                 focusstack,  1],
    ['modkey-xk-k',                 focusstack,  -1],
    ['modkey-shiftmask-xk-j',       pushstack,   1],
    ['modkey-shiftmask-xk-k',       pushstack,   -1],
    ['modkey-xk-t',                 setlayout,   layouts[0]],
    ['modkey-xk-m',                 setlayout,   layouts[2]],
    ['modkey-xk-u',                 setlayout,   layouts[3]],
    ['modkey-xk-0',                 view,        ~0],
    ['modkey-shiftmask-xk-0',       tag,         ~0],
    ...TAGKEYS('xk-1', 0),
    ...TAGKEYS('xk-2', 1),
    ...TAGKEYS('xk-3', 2),
    ...TAGKEYS('xk-4', 3),
    ...TAGKEYS('xk-5', 4),
    ...TAGKEYS('xk-6', 5),
    ...TAGKEYS('xk-7', 6),
    ...TAGKEYS('xk-8', 7),
    ...TAGKEYS('xk-9', 8),
];

/* button definitions */
const buttons = [
    /* click                 event mask     button           function                 argument */
    {click: ClkLtSymbol,   mask: 0,      button: Button1, fn: setlayout,           arg: null},
    {click: ClkLtSymbol,   mask: 0,      button: Button3, fn: setlayout,           arg: layouts[2]},
    {click: ClkWinTitle,   mask: 0,      button: Button2, fn: zoom,                arg: null},
    {click: ClkTagBar,     mask: 0,      button: Button1, fn: view,                arg: null},
    {click: ClkTagBar,     mask: 0,      button: Button3, fn: toggleview,          arg: null},
    {click: ClkTagBar,     mask: MODKEY, button: Button1, fn: tag,                 arg: null},
    {click: ClkTagBar,     mask: MODKEY, button: Button3, fn: toggletag,           arg: null},
    {click: ClkStatusText, mask: 0,      button: Button1, fn: toggleNotifications, arg: null},
];

function applyrules(c) {
    const win = c.win;
    c.isfloating = false;
    c.mon = selmon;
    c.tags = 0;

    const _class = win.get_wm_class() ?? '';
    const instance = win.get_wm_class_instance() ?? '';

    for (const r of rules) {
        if ((!r.title || win.get_title().includes(r.title)) &&
            (!r.class || _class.includes(r.class)) &&
            (!r.instance || instance.includes(r.instance))) {
            c.isfloating = r.isfloating;
            c.tags |= r.tags;
            c.mon = selmon;
        }
    }
    c.tags = (c.tags & TAGMASK) || c.mon.tagset[c.mon.seltags];
}

function arrange(m) {
    m.clients.forEach(showhide);
    arrangemon(m);
    restack(m);
}

function arrangemon(m) {
    m.ltsymbol = m.lt[m.sellt].symbol;
    if (m.lt[m.sellt].arrange)
        m.lt[m.sellt].arrange(m);
}

function benedic(fn, ...bound) {
    return function (...args) {
        try {
            scan();
            fn(...bound, ...args);
            bar.drawbars();
        } catch (error) {
            console.error(`[pocoy] command failed: ${error.message}\n${error.stack}`);
        }
    };
}

function buttonpress(click, arg, event) {
    const held = event.get_state() & CLEANMASK;
    for (const b of buttons)
        if (click === b.click && held === (b.mask ? b.mask() : 0) && event.get_button() === b.button) {
            benedic(b.fn, b.arg ?? arg)();
            return true;
        }
    return false;
}

function cleanup() {
    if (!selmon)
        return;
    savestate();
    for (const c of selmon.clients)
        c.win?.unmake_above();
    global.display.disconnectObject(extension);
    for (const actor of global.get_window_actors())
        actor.meta_window.disconnectObject(extension);
    for (const [name] of keys)
        Main.wm.removeKeybinding(name);
    borders.cleanup();
    bar.cleanup();
    theme.cleanup();
    selmon = null;
}

function configurenotify() {
    if (updategeom())
        arrange(selmon);
}

function createmon() {
    const m = new Monitor();

    m.clients = [];
    m.seltags = 0;
    m.tagset = [1, 1];
    m.mfact = mfact;
    m.nmaster = nmaster;
    m.outergap = outergap;
    m.innergap = innergap;
    m.sellt = 0;
    m.lt = [layouts[0], layouts[1 % layouts.length]];
    m.ltsymbol = layouts[0].symbol;
    m.pertag = new Pertag();
    m.pertag.curtag = m.pertag.prevtag = 1;

    for (let i = 0; i <= tags.length; i += 1) {
        m.pertag.sel[i] = null;
        m.pertag.nmasters[i] = m.nmaster;
        m.pertag.mfacts[i] = m.mfact;

        m.pertag.ltidxs[i] = [m.lt[0], m.lt[1]];
        m.pertag.sellts[i] = m.sellt;
    }

    return m;
}

function flow(m, mode = APPLY) {
    const wx = m.wx + m.outergap;
    const wy = m.wy + m.outergap;
    const ww = m.ww - m.outergap * 2;
    const wh = m.wh - m.outergap * 2;
    const padding = m.innergap;

    let wins = m.clients.filter(ISTILED).map(c => c.win);
    if (mode === DRY_RUN) wins = wins.map(win => new DryRunWindow(win));

    const n = wins.length;
    if (n === 0)
        return wins;
    if (n === 1) {
        resize(wins[0], wx + ww * 0.15, wy + wh * 0.1, ww * 0.7, wh * 0.86);
        return wins;
    }

    const mw = m.nmaster ? Math.trunc(ww * m.mfact) : 0;
    const mx = Math.trunc((ww - mw) / 2);
    const tw = ww - mw - mx;

    for (let i = 0, my = 0, oty = 0; i < n; i++)
        if (i < m.nmaster) {
            const h = (wh - my) / (Math.min(n, m.nmaster) - i);
            const {height} = resize(wins[i], wx + mx + padding, wy + my + padding, mw - padding * 2, h - padding * 2);
            if (my + height + padding * 2 < wh)
                my += height + padding * 2;
        } else if (i === m.nmaster) {
            resize(wins[i], wx + padding, wy + padding, mx - padding * 2, wh - padding * 2);
        } else {
            const h = (wh - oty) / (n - i);
            const {height} = resize(wins[i], wx + mx + mw + padding, wy + oty + padding, tw - padding * 2, h - padding * 2);
            if (oty + height + padding * 2 < wh)
                oty += height + padding * 2;
        }
    return wins;
}

function focus(c) {
    if (!c || !ISVISIBLE(c)) {
        c = global.display.get_tab_list(
            Meta.TabList.NORMAL_ALL,
            global.workspace_manager.get_active_workspace()
        )
        .map(wintoclient)
        .find(client => client && ISVISIBLE(client));
    }
    c?.win.activate(global.get_current_time());
    selmon.sel = c;
    selmon.pertag.sel[selmon.pertag.curtag] = c;
}

function focusin() {
    if (!wintoclient(global.display.focus_window))
        return;
    if (selmon.sel && !ISVISIBLE(selmon.sel)) {
        let i;
        for (i = 0; !(selmon.sel.tags & 1 << i); i++);
        selmon.pertag.sel[i + 1] = selmon.sel;
        view(selmon.sel.tags);
    }
}

function focusstack(direction) {
    if (!selmon.sel)
        return;

    let c = null;
    let i = null;

    if (direction > 0) {
        for (c = selmon.sel.next; c && !ISVISIBLE(c); c = c.next);
        if (!c)
            for (c = selmon.clients[0]; c && !ISVISIBLE(c); c = c.next);
    } else {
        for (i = selmon.clients[0]; i !== selmon.sel; i = i.next)
            if (ISVISIBLE(i))
                c = i;
        if (!c)
            for (; i; i = i.next)
                if (ISVISIBLE(i))
                    c = i;
    }
    if (c) focus(c);
}

function grabkeys() {
    for (const [name, fn, arg] of keys)
        Main.wm.addKeybinding(name, extension.getSettings(), Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW, benedic(fn, arg));
}

function loadstate() {
    let state;
    try {
        state = JSON.parse(new TextDecoder().decode(GLib.file_get_contents(statefile)[1]));
    } catch {
        return;
    }
    if (state.version !== 2)
        return;
    const ids = state.clients.map(c => c.id);
    Object.assign(selmon, {...state.monitor, lt: state.monitor.lt.map(i => layouts[i])});
    Object.assign(selmon.pertag, {...state.pertag, ltidxs: state.pertag.ltidxs.map(lts => lts.map(i => layouts[i]))});
    for (const c of selmon.clients)
        Object.assign(c, state.clients.find(saved => saved.id === c.id));
    selmon.clients.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
}

function main() {
    setup();
    scan();
    loadstate();
    arrange(selmon);
    run();
}

function manage(c) {
    const win = c.win;

    applyrules(c);

    win.disconnectObject(extension);
    win.connectObject('notify::title', () => bar.drawbars(), extension);
    for (const [signal, fn] of winhandler)
        win.connectObject(signal, benedic(fn), extension);

    updatewindowtype(c);
    if (!c.isfloating)
        c.isfloating = win.get_transient_for() !== null || c.isfixed;
    if (c.isfloating) {
        const rect = win.get_frame_rect();
        resize(win, selmon.wx + (selmon.ww - rect.width) / 2,
            selmon.wy + (selmon.wh - rect.height) / 2, rect.width, rect.height);
    }
}

function maprequest(_display, win) {
    if (wintoclient(win))
        arrange(selmon);
}

function maximizenotify() {
    arrange(selmon);
}

function monocle(m, mode = APPLY) {
    const wx = m.wx + m.outergap + m.innergap;
    const wy = m.wy + m.outergap + m.innergap;
    const ww = m.ww - (m.outergap + m.innergap) * 2;
    const wh = m.wh - (m.outergap + m.innergap) * 2;

    let wins = m.clients.filter(ISTILED).map(c => c.win);
    if (mode === DRY_RUN) wins = wins.map(win => new DryRunWindow(win));

    const n = m.clients.filter(ISVISIBLE).length;
    if (n > 0) /* override layout symbol */
        m.ltsymbol = `[${n}]`;

    wins.forEach(win => resize(win, wx, wy, ww, wh));
    return wins;
}

function nexttiled(c) {
    for (; c && !ISTILED(c); c = c.next);
    return c;
}

function pushstack(direction) {
    const tiled = selmon.clients.filter(ISTILED);
    if (tiled.length < 2 || !tiled.includes(selmon.sel))
        return;

    let o = selmon.clients.indexOf(selmon.sel);
    let d = direction === -1 ? o + selmon.clients.length : o;

    for (let c = null; !c || !ISTILED(c); c = selmon.clients[d = (d + direction) % selmon.clients.length]) ;
    [selmon.clients[o], selmon.clients[d]] = [selmon.clients[d], selmon.clients[o]];

    arrange(selmon);
}

function resize(win, x, y, w, h) {
    win.move_resize_frame(false, Math.trunc(x), Math.trunc(y),
        Math.max(1, Math.trunc(w)), Math.max(1, Math.trunc(h)));
    return win.get_frame_rect();
}

function restack(m) {
    for (const c of m.clients) {
        if (c.isfloating)
            c.win.make_above();
        else
            c.win.unmake_above();
    }
}

function run() {
    for (const [signal, fn] of handler)
        global.display.connectObject(signal, benedic(fn), extension);
}

function savestate() {
    const state = {
        version: 2,
        monitor: {
            mfact: selmon.mfact, nmaster: selmon.nmaster, seltags: selmon.seltags, tagset: selmon.tagset,
            sellt: selmon.sellt, lt: selmon.lt.map(l => layouts.indexOf(l)),
        },
        clients: selmon.clients.map(c => ({id: c.id, tags: c.tags, isfloating: c.isfloating})),
        pertag: {...selmon.pertag, sel: undefined, ltidxs: selmon.pertag.ltidxs.map(lts => lts.map(l => layouts.indexOf(l)))},
    };
    try {
        GLib.mkdir_with_parents(GLib.path_get_dirname(statefile), 0o700);
        GLib.file_set_contents(statefile, JSON.stringify(state));
    } catch (error) {
        console.error(`[pocoy] failed to save state: ${error.message}`);
    }
}

function scan() {
    const ids = global.get_window_actors().map(actor => actor.meta_window).filter(ISCLIENT).map(w => w.get_id());
    const next = [];
    selmon.sel = null;

    selmon.clients.filter(c => ids.includes(c.id)).forEach(c => next.push(c));
    selmon.pertag.sel = selmon.pertag.sel.map(c => c && ids.includes(c.id) ? c : null);

    for (const id of ids) {
        let c = next.find(client => client.id === id);
        if (!c) {
            c = new Client(id);
            next.unshift(c);
            manage(c);
        }
        if (id === global.display.get_focus_window()?.get_id()) {
            selmon.sel = c;
            selmon.pertag.sel[selmon.pertag.curtag] = c;
        }
    }
    selmon.clients = next;
}

function setlayout(layout) {
    if (layout === selmon.lt[selmon.sellt])
        layout = selmon.lt[selmon.sellt ^ 1];
    if (!layout || layout !== selmon.lt[selmon.sellt])
        selmon.sellt = selmon.pertag.sellts[selmon.pertag.curtag] ^= 1;
    if (layout)
        selmon.lt[selmon.sellt] = selmon.pertag.ltidxs[selmon.pertag.curtag][selmon.sellt] = layout;
    selmon.ltsymbol = selmon.lt[selmon.sellt].symbol;
    if (selmon.sel)
        arrange(selmon);
}

function setup() {
    updategeom();
    updatebars();
    grabkeys();
}

function showhide(c) {
    if (!c)
        return;
    if (ISVISIBLE(c))
        c.win.unminimize();
    else
        c.win.minimize();
}

function spawn(cmd) {
    for (const id of cmd) {
        const app = Shell.AppSystem.get_default().lookup_app(id);
        if (!app)
            continue;
        app.activate_full(global.workspace_manager.get_active_workspace_index(), global.get_current_time());
        return;
    }
}

function tag(tagmask) {
    if (selmon.sel && tagmask & TAGMASK) {
        selmon.sel.tags = tagmask & TAGMASK;
        focus();
        arrange(selmon);
    }
}

function tile(m, mode = APPLY) {
    const wx = m.wx + m.outergap;
    const wy = m.wy + m.outergap;
    const ww = m.ww - m.outergap * 2;
    const wh = m.wh - m.outergap * 2;
    const padding = m.innergap;
    let mw;

    let wins = m.clients.filter(ISTILED).map(c => c.win);
    if (mode === DRY_RUN) wins = wins.map(win => new DryRunWindow(win));

    const n = wins.length;
    if (n === 0)
        return wins;

    if (n > m.nmaster)
        mw = m.nmaster ? ww * m.mfact : 0;
    else
        mw = ww;
    for (let i = 0, my = 0, ty = 0; i < n; i++)
        if (i < m.nmaster) {
            const h = (wh - my) / (Math.min(n, m.nmaster) - i);
            const {height} = resize(wins[i], wx + padding, wy + my + padding, mw - padding * 2, h - padding * 2);
            if (my + height + padding * 2 < wh)
                my += height + padding * 2;
        } else {
            const h = (wh - ty) / (n - i);
            const {height} = resize(wins[i], wx + mw + padding, wy + ty + padding, ww - mw - padding * 2, h - padding * 2);
            if (ty + height + padding * 2 < wh)
                ty += height + padding * 2;
        }
    return wins;
}

function toggleNotifications() {
    const menu = Main.panel.statusArea.dateMenu?.menu;
    if (!menu)
        return;
    menu.toggle();
    menu.actor.set_position(global.stage.width - menu.actor.width - 5, Main.panel.height);
}

function toggletag(tagmask) {
    if (!selmon.sel)
        return;
    const newtags = selmon.sel.tags ^ (tagmask & TAGMASK);
    if (newtags) {
        selmon.sel.tags = newtags;
        focus();
        arrange(selmon);
    }
}

function toggleview(tagmask) {
    const newtagset = selmon.tagset[selmon.seltags] ^ (tagmask & TAGMASK);
    let i = 0;
    if (newtagset) {
        selmon.tagset[selmon.seltags] = newtagset;

        if (newtagset === ~0) {
            selmon.pertag.prevtag = selmon.pertag.curtag;
            selmon.pertag.curtag = 0;
        }

        /* test if the user did not select the same tag */
        if (!(newtagset & 1 << (selmon.pertag.curtag - 1))) {
            selmon.pertag.prevtag = selmon.pertag.curtag;
            for (i = 0; !(newtagset & 1 << i); i++) ;
            selmon.pertag.curtag = i + 1;
        }

        /* apply settings for this view */
        selmon.nmaster = selmon.pertag.nmasters[selmon.pertag.curtag];
        selmon.mfact = selmon.pertag.mfacts[selmon.pertag.curtag];
        selmon.sellt = selmon.pertag.sellts[selmon.pertag.curtag];
        selmon.lt[selmon.sellt] = selmon.pertag.ltidxs[selmon.pertag.curtag][selmon.sellt];
        selmon.lt[selmon.sellt ^ 1] = selmon.pertag.ltidxs[selmon.pertag.curtag][selmon.sellt ^ 1];

        focus();
        arrange(selmon);
    }
}

function unmanage(win) {
    win.disconnectObject(extension);
    if (selmon.sel)
        arrange(selmon);
}

function updatebars() {
    theme.setup(extension.path);
    bar.setup(selmon, tags, buttonpress);
    borders.setup(ISCLIENT);
}

function updategeom() {
    let dirty = false;

    if (!selmon)
        selmon = createmon();

    const workArea = global.workspace_manager
        .get_active_workspace()
        .get_work_area_for_monitor(Main.layoutManager.primaryMonitor.index);

    if (selmon.wx !== workArea.x || selmon.wy !== workArea.y ||
        selmon.ww !== workArea.width || selmon.wh !== workArea.height) {
        dirty = true;
        selmon.wx = workArea.x;
        selmon.wy = workArea.y;
        selmon.ww = workArea.width;
        selmon.wh = workArea.height;
    }

    return dirty;
}

function updatewindowtype(c) {
    const wtype = c.win.get_window_type();

    if (wtype === Meta.WindowType.DIALOG || wtype === Meta.WindowType.MODAL_DIALOG)
        c.isfloating = true;
}

function view(tagmask) {
    let i = 0;
    let tmptag = 0;

    if ((tagmask & TAGMASK) === selmon.tagset[selmon.seltags])
        return;
    selmon.seltags ^= 1;
    if (tagmask & TAGMASK) {
        selmon.tagset[selmon.seltags] = tagmask & TAGMASK;
        selmon.pertag.prevtag = selmon.pertag.curtag;

        if (tagmask === ~0) {
            selmon.pertag.curtag = 0;
        } else {
            for (; !(tagmask & 1 << i); i++);
            selmon.pertag.curtag = i + 1;
        }
    } else {
        tmptag = selmon.pertag.prevtag;
        selmon.pertag.prevtag = selmon.pertag.curtag;
        selmon.pertag.curtag = tmptag;
    }
    selmon.nmaster = selmon.pertag.nmasters[selmon.pertag.curtag];
    selmon.mfact = selmon.pertag.mfacts[selmon.pertag.curtag];
    selmon.sellt = selmon.pertag.sellts[selmon.pertag.curtag];
    selmon.lt[selmon.sellt] = selmon.pertag.ltidxs[selmon.pertag.curtag][selmon.sellt];
    selmon.lt[selmon.sellt ^ 1] = selmon.pertag.ltidxs[selmon.pertag.curtag][selmon.sellt ^ 1];

    focus(selmon.pertag.sel[selmon.pertag.curtag]);
    arrange(selmon);
}

function wintoclient(win) {
    const id = win?.get_id();
    return selmon.clients.find(c => c.id === id) ?? null;
}

function zoom() {
    if (!selmon.lt[selmon.sellt].arrange || !selmon.sel || selmon.sel.isfloating)
        return;

    let c = selmon.sel;
    const istiled = selmon.lt[selmon.sellt].arrange(selmon, DRY_RUN).every(win => win.is_tiled());

    if (c === nexttiled(selmon.clients[0]) && selmon.clients.length > 1 && istiled && nexttiled(c.next))
        c = nexttiled(c.next);

    selmon.clients.splice(selmon.clients.indexOf(c), 1);
    selmon.clients.unshift(c);

    focus(c);
    arrange(c.mon);
}

export default class PocoyExtension extends Extension {
    enable() {
        extension = this;
        if (Main.layoutManager._startingUp)
            Main.layoutManager.connectObject('startup-complete', main, extension);
        else
            main();
    }

    disable() {
        Main.layoutManager.disconnectObject(extension);
        cleanup();
        extension = null;
    }
}
