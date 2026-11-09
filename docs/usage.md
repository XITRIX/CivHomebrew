# NS2-CivHomebrew · Payload Menu

An on-device JavaScript payload library for CivSwitch, with a screenshot-inspired
six-column launcher and a Python PC companion. Run it as a regular CivSwitch
payload for testing, or install it in place of Gezine’s boot trigger with
backup/restore support.

The header shows **CivHomebrew** and the console IP. The focused tile has a
name label and turquoise border; D-pad/stick moves through the scrollable grid.
**A Start** launches the selected app; **X Menu** opens its actions on the right;
**Y Options → FTP** configures the server;
**− Terminal** opens the log screen.
**B** in the terminal reloads the selector; **B Exit** in the selector unloads
it to the resident terminal. **+** in that terminal exits this regular payload
and returns to Gezine’s original loader. Installed mode hides Exit and disables
terminal + shutdown; PC recovery commands remain available.
Optional **256×256 PNG** icons appear on the tiles; missing icons use a letter.
The browser screenshot uses demonstration entries, not preinstalled real apps.

X Menu → Information shows title, developer, version, app ID, installed size,
script count and description, with one Close button. Delete opens a confirmation
with Cancel selected by default; move right to Delete and press A to remove the
selected installation. App saves outside its installed folder are preserved.
Use X/Y, arrows, Enter and Escape in browser previews. Deletion needs the generic
app-store interface: update the core once and restart before updating the launcher
on an existing device. Information also works with the previous core.

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
is not a reason to blindly retry. The resident core serves the original Gezine protocol on **9026** and package
management on **9027** independently of the selector. Status/list remain available
during a child app; installs, updates and overlapping launches are rejected until
it finishes. The selector owns passive FTP on **5000**, which stops before an app
starts and restarts when the selector returns.

## Package and install an app

A `.civapp` is one inspectable UTF-8 JSON file containing ordered scripts,
metadata, and an optional embedded icon. See [the format](civapp-format.md).

```sh
python3 tools/package_payload.py --directory examples/hello --non-interactive -o dist/hello.civapp
python3 tools/package_payload.py --inspect dist/hello.civapp
```

CivHomebrew distributes **[tools/package_payload.py](../tools/package_payload.py)** as
a standalone, single-file tool. Copy it into another app repository or CI; it
requires only Python 3.10+ and its standard library. See the
[reuse and CI guide](packager.md). The companion's existing
`payload_menu.py pack` and `inspect` commands remain supported.

For an existing payload without a manifest, run the interactive packager:

```sh
python3 tools/package_payload.py
# Or preselect the source directory:
python3 tools/package_payload.py /path/to/payload
```

It asks for missing app name, stable ID, creator, version, optional description,
and ordered scripts (dependencies first, entry point last). It saves these to
`payload.json` in that directory for the next run. A missing icon produces a
warning and asks whether to continue. Continuing omits the artwork; the launcher
shows the app name's first letter as a UI placeholder. No image is generated.
An existing `icon.png` is detected automatically. Custom icon paths must be inside
the source directory and point to a 256×256 PNG.

Every setting is also available as a parameter for CI:

```sh
python3 tools/package_payload.py --directory /path/to/payload \
  --id my-app --name "My App" --creator "Your name" --version 1.0.0 \
  --description "What it does" --api 1 \
  --script lib/core.js --script app.js --icon icon.png \
  --non-interactive --no-save-metadata -o /path/to/artifacts/my-app.civapp
```

Use `--no-icon` instead of `--icon` to explicitly select the UI placeholder.
Repeat `--script` in execution order; supplied script flags replace the entire
saved list. Arguments override saved metadata. `--non-interactive` never prompts
and exits with a nonzero status for missing required settings. Nonterminal input
also disables prompting. `--no-save-metadata` keeps CI source files untouched;
otherwise the resolved settings are saved after validation. Without `-o`, output
is `PAYLOAD/dist/ID.civapp`. Packages are deterministic for unchanged inputs.
Run `python3 tools/package_payload.py --help` for aliases and all options.

The stable ID matters for replacing the same installed app on updates. Keep app
save data outside its installed folder, because reinstalling deletes that folder.
A source URL and license are useful additional project metadata; `payload.json`
preserves extra fields, but version 1 distributes only the documented app fields.

With the resident core running in the selector or terminal, use a second terminal:

```sh
python3 tools/payload_menu.py install 192.168.1.148 dist/hello.civapp
python3 tools/payload_menu.py list 192.168.1.148
python3 tools/payload_menu.py start 192.168.1.148 hello-civswitch
```

Installation unpacks each app under `save:/civhomebrew/apps/<app-id>/`:

```text
save:/civhomebrew/apps/hello-civswitch/
├── manifest.json
├── icon.png
└── scripts/
    ├── library.js
    └── app.js
```

The folder uses the package's stable ID, such as `hello-civswitch`, rather than
its display title. Script names/order are preserved, including nested paths.
`icon.png` is an actual binary PNG and is omitted when no icon was supplied.
`manifest.json` contains metadata and file descriptors/checksums, with no script
source or base64 icon. The selector reads manifests/icons only; Start loads the
scripts separately. Files live in the current Civ VII user/save mount.

**Replacing an app deletes its entire existing folder before unpacking.** This
removes obsolete scripts, icons, nested folders and any data the app stored in
that folder. Validation and quota checks happen first. A failed replacement
requires reinstalling; no previous version is retained. Other app folders and
unrelated game saves are untouched. Installed files remain available without
the PC. Details: [installation and migration](installed-layout.md).

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
frame. The original bootstrap terminal receives only the ready marker and its final
completion when the resident core exits.

Use `--menu-port` and `--loader-port` for nondefault ports. In phase one the core
borrows the original listener while its outer eval is awaiting the core, then
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

Press **−** to unload the selector and its FTP server, revealing the resident
black-and-white monospace terminal; **B** reloads the selector at the same tile. On a keyboard use `-` and Escape. Raw PC launches open the
terminal automatically. The display keeps the last 37 wrapped rows, using the
original 146-column wrapping. Raw sender errors/completion are shown there too.
The core waits for a raw payload to complete before another foreground launch.
A child UI owns its input until it finishes; B does not cancel an arbitrary
running payload.

Evaluation is created directly in the original loader scope, outside the menu's
functions. This preserves SDK helpers and avoids shadowing helpers such as
`close(fd)` with the menu's close action. The core temporarily captures `log()`
and restores the original logger on shutdown. Compatibility covers the inspected
Gezine transport/helper contract; it cannot make arbitrary native code or
uncooperative infinite loops safe. Individual payload/build combinations still
need their own hardware validation.

## Resident core, FTP and self-update

The stable boot/bridge layer loads a replaceable resident core, which owns the
terminal, raw receiver, installer, catalog and app lifecycle. The replaceable
launcher owns the selector UI and FTP. See [architecture and recovery](architecture.md).

Press **Y Options**, then choose **FTP**. Configure Enable, Port (default **5000**),
Anonymous, User, Password and Protect CivHomebrew. A edits/toggles; B saves when
leaving FTP Options and restarts/stops the server as needed. Text editing opens the
Switch keyboard **blank**, without an extra text-field popup: confirmation replaces the current setting with the
new text; cancellation preserves it. Settings persist in
`save:/civhomebrew/ftp-settings.json`; password values are masked in the menu and
stored locally in plaintext. Unreadable settings preserve the file and disable FTP
until explicitly reconfigured. FTP startup failure leaves Options usable.

The server supports separate browsing/transfer connections, including FileZilla,
with up to four control sessions and one upload at a time.

Use passive mode and binary transfers. Anonymous login is enabled by default;
turning it off requires the configured username and password. FTP is unencrypted
and available only while the launcher is open. Its virtual root is:

```text
/
├── Install civapp/
│   └── drop civapp here
└── Root/
    └── actual mounted save files…
```

Upload a `.civapp` into **Install civapp**, or upload its contents onto the
**drop civapp here** placeholder, to install through the core. `.civupdate` files
in that folder still stage system updates. Uploads are consumed directly from
memory; distribution packages are never listed or downloadable and no extra
package copy is stored. Only extracted installed files or staged system slots
remain. Existing copies from older versions are cleaned up at core startup.
The placeholder always remains available.

**Root** maps to the SDK's `save:/` mount. It supports browsing, binary
upload/download, file/directory rename, mkdir, file deletion and empty-directory
removal. Files under `civhomebrew/` are readable but protected from FTP modification
by default, including core, launcher, catalogs, settings and installed apps. The
installer can still update apps normally. Turning protection off explicitly allows
direct modification of that namespace; malformed system files can prevent startup.
The mount root itself cannot be removed or renamed. Other save files are editable.
Transfers are currently bounded to **12 MiB per file**; larger files remain listed
but require a different transfer method. Active FTP, resume and recursive RMD are
not supported. See [architecture](architecture.md) for limits and recovery.

```sh
python3 tools/payload_menu.py status 192.168.1.148
python3 tools/payload_menu.py terminal 192.168.1.148
python3 tools/payload_menu.py launcher 192.168.1.148
# Build and send the current component from this checkout:
python3 tools/payload_menu.py update 192.168.1.148 launcher
python3 tools/payload_menu.py update 192.168.1.148 core
# Select a retained previous version:
python3 tools/payload_menu.py rollback 192.168.1.148 launcher
python3 tools/payload_menu.py rollback 192.168.1.148 core
```

Launcher updates reload immediately within the same core. Core updates take
effect on the **next start**; they do not replace code in the running core.
In regular-payload mode, run `shutdown HOST`, wait for the original sender’s
`Executed successfully`, then run `menu HOST` again. In installed mode, restart
Civ VII and open Load Game to activate a staged core. `--source FILE.js --release VERSION`
can supply a custom component; otherwise `update` builds it from this repository.
An update response acknowledges staging, not successful activation.

Both components use verified inactive slots and retain the active version while
staging. A candidate is marked attempted before evaluation and confirmed after
initialization. A failed launcher returns to the working launcher; an unconfirmed
core falls back on the next start. Hold **−** at startup, or launch with
`menu HOST --terminal`, to bypass pending core activation and open recovery without
autoloading the selector. Two slots retain at most one previous component; staging
another update can overwrite that older backup. Keep update artifacts on the PC.

Version 0.3.0 adds native save-directory access and a settings path to the stable
bridge. Upgrade an existing 0.2.0 session in this order: `update HOST core`,
`shutdown HOST`, `menu HOST` using this checkout, then `update HOST launcher`.
The new bootstrap is required for the new bridge; the new launcher requires the
new core. Leave a running foreground app before updating.

The bootstrap seeds components only on first installation. Sending a new boot
bundle does **not** overwrite an installed component: use `update` explicitly.
The native bridge, package utilities and slot loader remain part of the stable
boot bundle; changing those requires a new boot bundle. In installed mode, rerun
`install_homebrew.py HOST` to publish it. Component-update commands alone do not
rewrite the boot trigger.

## App contract

When Start reads an installed app, a centered overlay dims the selector and
shows `Loading APP…`, a turquoise progress bar and percentage. Progress follows
actual script bytes read, reaching 100% only after integrity verification. The
overlay clears for launch or an error; Start stays disabled during loading.
FTP and PC app installations use the same overlay with `Installing APP…`. Its
progress counts file writes/readback and finishes after catalog publication;
the selector becomes usable again on success or failure.
Uploads into `/Install civapp` show `Uploading FILE…` immediately, with received
KiB/MiB and an animated bar when the client provides no total size. A supplied
total enables percentage progress. The same overlay then switches to installation
progress and closes after completion or an error.
The inspected CivSwitch ABI uses a retained 64 KiB external typed-array
buffer and native `memcpy` for file and network transfers, with layout, known-byte
and range checks. This avoids calling the loader's memory primitive for each byte.
If those loader helpers are unavailable, the existing bytewise path remains;
a failed backing-store validation is an error rather than an unchecked copy.

App scripts execute **in order in one direct eval**, preserving CivSwitch’s
lexical native helpers. The last expression must return/await the app’s lifetime
promise. Remove owned DOM, input subscriptions, timers and native resources
before that promise settles. Register `window.__civswitchApp = {close, lifetime}`
for cooperative cleanup; the included Hello app demonstrates the contract.

Before starting a child, the core stops the selector’s FTP server, waits for an
already accepted install to finish, cancels partial uploads, loads the scripts
with progress, then removes the selector’s DOM/input resources. The resident
terminal and PC services stay owned by the core. After a cooperative child
finishes or throws, the selector and FTP are loaded again. The menu
cannot interrupt a synchronous infinite loop or repair arbitrary leaked native
resources. Old payloads that return early while leaving a UI active need a
lifetime wrapper or source fix. NRO/ARM64 binaries are not supported.

## Storage and recovery

The two checksummed catalogs remain under `save:/civhomebrew/` and now index the
extracted app folders. They mirror current membership; they do not retain old
app versions. Replacement first removes the old entry from both catalogs,
commits deletion of the app folder, then writes/verifies scripts and binary
artwork. The plain manifest is written last. Only a completely verified app is
published to both catalogs, preventing launch of a partial installation.

A failure after deletion leaves the app unavailable until reinstalled. A failed
catalog commit/readback blocks further mutation until a fresh load resolves its
outcome. A valid backup catalog can recover membership if the other slot is
corrupt. Both unreadable slots preserve files and produce an error. Checksums
detect accidental corruption; they are not signatures.

Existing monolithic installations migrate automatically on first launch. Their
original package files are preserved until all extracted apps and both new
catalogs have been verified, then the indexed legacy blobs are removed. This
changes the installed catalog to version 2; keep using the updated launcher.
The distribution `.civapp` format and companion protocol remain version 1.

Policy limits: 64 apps, 64 scripts/app, 8 MiB UTF-8 source/app, 512 KiB/icon,
12 MiB/network frame and a 32 MiB quota for installed manifests/scripts/icons.
These are policy limits, not measured free save space. Keep `.civapp` files on
the PC for reinstalling.

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

The launcher renders text at native screen sizes using the game’s BodyFont family,
with rounded pixel geometry and no scaled text layer.

Footer A/B glyphs use fixed artwork to avoid game font alignment differences.
Regenerate the PNG assets with `python3 tools/generate_button_icons.py`; the
companion embeds them in the console bundle.

`dist/payload-menu.js` is the bundled regular boot payload. Build also writes
`dist/core.civupdate` and `dist/launcher.civupdate` for component updates. Preview data is in memory
and excluded from that bundle. The sender stages payloads above CivSwitch's
strict 500 KiB wire limit in bounded successful transactions. A `.civapp` file is
installed using the companion; do not send its JSON directly to the JS loader.

Installed apps are read and checksum-verified on every launch. The optimized
checksum path keeps existing packages compatible; the OLED Moonlight measurement
was about 2.0 seconds for read/validation and 2.6 seconds to its Hosts UI. See
[loading measurements](testing.md#installed-app-checksum-optimization--2026-11-09).

Tests cover corrupt/failed writes, catalog recovery, frame bounds/fragmentation,
Unicode, package paths, upload limits, real localhost TCP, native-style input
without `.click()`, duplicate input, scrolling, child lifetime, error return,
and cleanup. UI checks save `build/menu-preview.png` and `build/terminal-preview.png`.

## Boot installation

With Gezine's loader waiting, or CivHomebrew's selector/terminal idle:

```sh
python3 tools/install_homebrew.py 192.168.1.148
```

Restart Civ VII and open **Load Game** afterward. The launcher then starts without
a PC. Hold **−** while opening Load Game for the recovery terminal. To restore the
original trigger, run the same command with `--restore` and restart the game.
The installer backs up and changes only `XSTRIG.Civ7Save`; it preserves other saves,
apps and settings. Python 3 and Node.js are required, with no npm dependencies.
See [installation, backups and recovery](boot-installation.md) for details.

## Source and attribution

See [provenance](provenance.md). Native file/socket patterns and input/lifetime
handling are adapted from the existing CivSwitch Moonlight experiment and the
`civswitch-development` skill; the transport sender is copied from that skill.
CivSwitch is by Gezine. No bundled game binaries, save files, credentials, or
standalone third-party app icon assets are included. Documentation screenshots
show apps installed separately on the console.
