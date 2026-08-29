# Pocoy

A dwm-like dynamic tiling window manager for GNOME Shell.

Windows are tiled automatically and organised with dwm's tag system instead of
GNOME workspaces. A dwm-style bar replaces the top panel, showing the tags, the
layout symbol and the focused window title.

## Layouts

| Symbol | Layout   |
| ------ | -------- |
| `[]=`  | tile     |
| `><>`  | floating |
| `[M]`  | monocle  |
| `\|[]` | flow     |

`flow` is a modified [centeredmaster](https://dwm.suckless.org/patches/centeredmaster/).

## dwm patches

Pocoy carries the behaviour of these dwm patches:

- [pertag](https://dwm.suckless.org/patches/pertag/) — layout, `mfact` and
  `nmaster` are remembered per tag
- [pushstack](https://dwm.suckless.org/patches/push/) — move a window up and
  down the stack
- [centeredmaster](https://dwm.suckless.org/patches/centeredmaster/) — the
  `flow` layout
- [gaps](https://dwm.suckless.org/patches/uselessgap/) — `outergap` and
  `innergap` around tiled windows

## Keyboard shortcuts

`MODKEY` is <kbd>Alt</kbd> by default

| Shortcut                          | dwm binding                            | Action                                  |
| --------------------------------- | -------------------------------------- | --------------------------------------- |
| <kbd>Alt</kbd>+<kbd>Return</kbd>  | `MODKEY, XK_Return`                    | `zoom` — move window to the master area |
| <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>Return</kbd> | `MODKEY\|ShiftMask, XK_Return` | `spawn` — focus or launch the terminal |
| <kbd>Alt</kbd>+<kbd>j</kbd> / <kbd>k</kbd> | `MODKEY, XK_j` / `XK_k`       | `focusstack` — focus next/previous      |
| <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>j</kbd> / <kbd>k</kbd> | `MODKEY\|ShiftMask, XK_j` / `XK_k` | `pushstack` — move window in the stack |
| <kbd>Alt</kbd>+<kbd>t</kbd>       | `MODKEY, XK_t`                         | `setlayout` — tile                      |
| <kbd>Alt</kbd>+<kbd>m</kbd>       | `MODKEY, XK_m`                         | `setlayout` — monocle                   |
| <kbd>Alt</kbd>+<kbd>u</kbd>       | `MODKEY, XK_u` (centeredmaster patch)  | `setlayout` — flow                      |
| <kbd>Alt</kbd>+<kbd>1..9</kbd>    | `MODKEY, KEY`                          | `view` — show one tag                   |
| <kbd>Alt</kbd>+<kbd>Ctrl</kbd>+<kbd>1..9</kbd> | `MODKEY\|ControlMask, KEY` | `toggleview` — add/remove tag from view |
| <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>1..9</kbd> | `MODKEY\|ShiftMask, KEY`  | `tag` — move window to a tag            |
| <kbd>Alt</kbd>+<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>1..9</kbd> | `MODKEY\|ControlMask\|ShiftMask, KEY` | `toggletag` — add/remove tag on window |
| <kbd>Alt</kbd>+<kbd>0</kbd>       | `MODKEY, XK_0`                         | `view` — show every tag                 |
| <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>0</kbd> | `MODKEY\|ShiftMask, XK_0`   | `tag` — apply every tag to the window   |

`spawn` looks up Ptyxis, GNOME Console and GNOME Terminal in that order and
focuses the first one installed, where dwm runs `st`.

## Mouse

The bar follows dwm's `buttons[]` table:

| Click              | Button                | dwm binding                       | Action                     |
| ------------------ | --------------------- | --------------------------------- | -------------------------- |
| tag                | left                  | `ClkTagBar, 0, Button1`           | `view` — show that tag     |
| tag                | right                 | `ClkTagBar, 0, Button3`           | `toggleview`               |
| tag                | <kbd>Alt</kbd>+left   | `ClkTagBar, MODKEY, Button1`      | `tag`                      |
| tag                | <kbd>Alt</kbd>+right  | `ClkTagBar, MODKEY, Button3`      | `toggletag`                |
| layout symbol      | left                  | `ClkLtSymbol, 0, Button1`         | `setlayout` — last layout  |
| layout symbol      | right                 | `ClkLtSymbol, 0, Button3`         | `setlayout` — monocle      |
| window title       | middle                | `ClkWinTitle, 0, Button2`         | `zoom`                     |
| clock              | left                  | —                                 | open the notification list |

## Appearance

`stylesheet.css` is the **source of truth** for colors, font and border width.
dwm declares these in `config.def.h`; Pocoy keeps them in the stylesheet and
nowhere else, so there is a single place to edit and nothing to keep in sync:

| dwm `config.def.h`          | `stylesheet.css`                                |
| --------------------------- | ----------------------------------------------- |
| `colors[SchemeNorm]` fg, bg | `.normal-dwm-panel` `color`, `background-color`   |
| `colors[SchemeSel]` fg, bg  | `.selected-dwm-panel` `color`, `background-color` |
| `colors[SchemeNorm]` border | `.normal-border` `border`                         |
| `colors[SchemeSel]` border  | `.highlight-border` `border`                      |
| `fonts[]`                   | `.dwm-panel` `font-family`, `font-size`           |
| `borderpx`                  | `.highlight-border` border width                  |

Every shortcut is a GSettings key. To change one:

```sh
dconf write /org/gnome/shell/extensions/pocoy/modkey-xk-return "['<Super>Return']"
```

## Installing from source

```sh
./pocoy install     # copy into ~/.local/share/gnome-shell/extensions and enable
./pocoy uninstall   # disable and remove those files
./pocoy modifier alt/ctrl/super   # rebind every shortcut to another MODKEY
```

## What Pocoy does not do

**One monitor.** Everything is arranged on the primary monitor's work area.
There is a single `selmon`, dwm's `focusmon` and `tagmon` are not implemented,
and the `monitor` field of `rules[]` is ignored. Windows on other monitors are
left alone.

**One workspace.** Only windows on the first GNOME workspace are managed.

**Part of dwm's `keys[]` has no counterpart:** `incnmaster`, `setmfact`,
`killclient`, `togglefloating`, `focusmon` and `tagmon`.

## License

Pocoy is free software, distributed under the terms of the GNU General Public
License version 3 or later. See [LICENSE](LICENSE).

`extension.js` and `bar.js` are derived from [dwm](https://dwm.suckless.org),
copyright its authors, licensed under the MIT/X Consortium License. That notice
is reproduced in [LICENSE.dwm](LICENSE.dwm).

`borders.js` is derived from [Highlight Focus](https://github.com/mipmip/gnome-shell-extension-highlight-focus)
by Pim Snel, licensed GPL-3.0-only.
