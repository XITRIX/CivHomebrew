# NS2-CivHomebrew · Payload Menu

An on-device JavaScript payload library for CivSwitch, with a screenshot-inspired
six-column launcher and a Python PC companion. This is a regular CivSwitch
payload for the first testing phase. It does not replace Gezine’s boot trigger.

The header shows **CivHomebrew** and the console IP. The focused tile has a
name label and turquoise border; D-pad/stick moves through the scrollable grid.
**A Start** launches the selected app; **− Terminal** opens the log screen.
**B** in the terminal returns to the selector; **B Exit** in the selector returns
to the original loader.
Optional **256×256 PNG** icons appear on the tiles; missing icons use a letter.
The browser screenshot uses demonstration entries, not preinstalled real apps.

## Requirements

- Existing CivSwitch loader in Civ VII, waiting on TCP 9026.
- Reference target: Switch 2, Switch 1 Civ VII cartridge 1.0.0, Gezine CivSwitch
  revision `59e27b4894e91bc53ece58dd5e9add7335639ef3`.
- Python 3.10+ for the companion. Node 22+ for checks; Chrome for UI checks.
- No npm dependencies, compiler toolchain, Wasm, or external Python packages.

## Start the menu

With the original loader waiting, from this repository:

```sh
python3 tools/payload_menu.py menu 192.168.1.148
```

Keep the terminal open. The menu keeps its direct-eval promise alive so CivSwitch
continues processing timers and input. Exit the running app/menu before another
upload that would overlap a running child app. A stopped sender or failed probe
is not a reason to blindly retry. The menu serves the original Gezine protocol
on **9026** while open, plus package management on **9027**. Package management
pauses while a child app runs and resumes when it finishes.

## Package and install an app

A `.civapp` is one inspectable UTF-8 JSON file containing ordered scripts,
metadata, and an optional embedded icon. See [the format](docs/civapp-format.md).

```sh
python3 tools/payload_menu.py pack examples/hello -o dist/hello.civapp
python3 tools/payload_menu.py inspect dist/hello.civapp
```

With the menu running, use a second terminal:

```sh
python3 tools/payload_menu.py install 192.168.1.148 dist/hello.civapp
python3 tools/payload_menu.py list 192.168.1.148
python3 tools/payload_menu.py start 192.168.1.148 hello-civswitch
```

Updates replace the app with the same ID while preserving the preceding catalog
and its package data for recovery. Installed apps work without the PC. Files
belong to the current Civ VII user/save mount under `save:/civhomebrew/`, not to
an independent title or the SD card. No game-save directories are cleared.

When only the original loader is running, install without launching the menu:

```sh
python3 tools/payload_menu.py install 192.168.1.148 dist/hello.civapp --via-loader
```

To run an app without installing it, send a `.civapp`, app directory, or loose JS:

```sh
# While the menu is running:
python3 tools/payload_menu.py run 192.168.1.148 examples/hello
# While the original loader is waiting:
python3 tools/payload_menu.py run 192.168.1.148 examples/hello --via-loader
# Loose development payload:
python3 tools/payload_menu.py run 192.168.1.148 my-app.js --via-loader
```

The raw-loader route preserves its log stream and waits for completion. It also
works while this menu is open. The package-menu route acknowledges acceptance;
this is not a completion result. Child `log()` output is captured in the on-device
terminal. During raw PC launches it is also streamed back to that raw sender.
For high-rate live apps, prefer bounded RAM diagnostics rather than logging each
frame. The original menu bootstrap terminal receives only the ready marker and
its final completion when the menu exits.

Use `--menu-port` and `--loader-port` for nondefault ports. In phase one the menu
borrows the original listener while its outer eval is awaiting the menu, then
restores the original socket flags on exit; it never closes that borrowed socket.
The companion makes no automatic retry or fallback that might overlap a running app. Version one shares CivSwitch's
trusted-LAN, arbitrary-JavaScript execution model; packages are not signed and
the menu service is not authenticated. Install/run packages you trust.

## Gezine-compatible terminal and raw launcher

Use the bundled **unmodified upstream** sender with the usual arguments:

```sh
python3 tools/send_js.py 192.168.1.148 payload.js
# Original optional port form also works:
python3 tools/send_js.py 192.168.1.148 9026 payload.js
```

Raw uploads use TCP 9026, UTF-8 JavaScript until a write-side half-close, streamed
`log()` output, then `Executed successfully` or `Error in payload: ...`. The strict
wire limit remains **less than 500 KiB**. The existing staged sender remains
available for larger JS bundles. Raw uploads work from the selector or terminal;
only one payload executes at a time. No `.civapp` wrapper is needed for raw JS.

Press **−** to open the black-and-white monospace terminal; **B** returns to the
same selected tile. On a keyboard use `-` and Escape. Raw PC launches open the
terminal automatically. The display keeps the last 37 wrapped rows, using the
original 146-column wrapping. Raw sender errors/completion are shown there too.
B can hide the terminal during a pending log-only payload; it does not cancel
that payload or permit overlapping launches. A child UI that takes focus or
registers its app lifecycle owns its input until it finishes.

Evaluation is created directly in the original loader scope, outside the menu's
functions. This preserves SDK helpers and avoids shadowing helpers such as
`close(fd)` with the menu's close action. The menu temporarily captures `log()`
and restores the original logger on exit. Compatibility covers the inspected
Gezine transport/helper contract; it cannot make arbitrary native code or
uncooperative infinite loops safe. Individual payload/build combinations still
need their own hardware validation.

## App contract

App scripts execute **in order in one direct eval**, preserving CivSwitch’s
lexical native helpers. The last expression must return/await the app’s lifetime
promise. Remove owned DOM, input subscriptions, timers and native resources
before that promise settles. Register `window.__civswitchApp = {close, lifetime}`
for cooperative cleanup; the included Hello app demonstrates the contract.

The menu detaches its common app slot and package service before starting a
child. Installed UI apps receive input ownership; raw terminal-only payloads
retain terminal navigation while running. After a cooperative child finishes or throws, the menu returns. The menu
cannot interrupt a synchronous infinite loop or repair arbitrary leaked native
resources. Old payloads that return early while leaving a UI active need a
lifetime wrapper or source fix. NRO/ARM64 binaries are not supported.

## Storage and recovery

Installs write an immutable generation package, commit, and read it back before
publishing a checksummed catalog in alternating slots. The previous valid catalog
is retained. A failed catalog commit/readback disables further mutation until a
fresh load. Both unreadable slots produce an error and preserve existing files.
Package corruption is reported at launch; reinstall that package from the PC.
Checksums detect accidental corruption; they are not signatures.

Policy limits: 64 apps, 64 scripts/app, 8 MiB UTF-8 source/app, 512 KiB/icon,
12 MiB/frame or stored package, and a 32 MiB quota including recovery references.
These are policy limits, not measured free save space. Out-of-space errors are
surfaced. Old unreferenced packages from known catalog generations are collected
on subsequent installs. A failed write/cleanup can leave an orphan; automatic
filesystem enumeration/repair is deliberately not part of phase one. Keep your
`.civapp` files on the PC for reinstalling and use save backups before phase two.

## Preview, build, and check

```sh
npm run preview
# http://127.0.0.1:8001/         empty state
# http://127.0.0.1:8001/?demo=1  16 demonstration tiles
npm run build
npm run pack:hello
npm test
npm run test:ui
```

Footer A/B glyphs use fixed artwork to avoid game font alignment differences.
Regenerate the PNG assets with `python3 tools/generate_button_icons.py`; the
companion embeds them in the console bundle.

`dist/payload-menu.js` is the bundled regular payload. Preview data is in memory
and excluded from that bundle. The sender stages payloads above CivSwitch's
strict 500 KiB wire limit in bounded successful transactions. A `.civapp` file is
installed using the companion; do not send its JSON directly to the JS loader.

Tests cover corrupt/failed writes, catalog recovery, frame bounds/fragmentation,
Unicode, package paths, upload limits, real localhost TCP, native-style input
without `.click()`, duplicate input, scrolling, child lifetime, error return,
and cleanup. UI checks save `build/menu-preview.png` and `build/terminal-preview.png`.

## Phase two: boot replacement (not installed)

After hardware stability testing, create a separate installer that backs up the
existing trigger, installs the menu, provides a controller recovery/bypass into
PC loading, and can restore the original trigger without clearing game saves.
Only that boot-integrated mode should remove **B Exit**. Test cold start,
network-offline start, repeated child launches, interrupted install and rollback
before making it the default. See [hardware checks](docs/testing.md).

## Source and attribution

See [provenance](docs/provenance.md). Native file/socket patterns and input/lifetime
handling are adapted from the existing CivSwitch Moonlight experiment and the
`civswitch-development` skill; the transport sender is copied from that skill.
CivSwitch is by Gezine. No bundled game binaries, save files, credentials, or
third-party app icons are included.
