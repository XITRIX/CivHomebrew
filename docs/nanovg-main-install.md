# Installed native main launcher and Hello

This historical record covers the earlier `.2`/Hello deployment. The latest
installed native Launcher is `.4`, with qualified Moonlight H.264/AV1 roundtrips
and the percentage line-height correction; see [native apps](native-apps.md).
Current installation receipts and reconstructed installed-source files track
that newer deployment. Earlier backup and cold/Hello evidence remain historical.

## Qualified console installation, 2026-11-11–12

The user authorized installing the tested UI-only native launcher while Moonlight
integration proceeds separately. The existing two-slot launcher update installed
`0.4.3-nanovg.2`, checksum `67db4842`, identity
`c4b60b01ef6e9bc47681c02375fe63d20e0a6ed2bb7a73a1c8988af3fa1489b0`.
The previous acknowledged launcher remains in slot 1 (`518cf118`). A verified PC
backup is under `build/nanovg/install-backups/20261111T232017Z/`.
The core state and boot trigger were not changed.

`tools/nanovg/install-main.py` backs up the active source/state before staging an
update, checks saved source bytes after acknowledgment, and can verify a cold
start against the installation receipt. It preserves a frozen reconstruction at
`dist/launcher-nanovg-main-installed.civupdate` and `.js`. These are the exact
installed bytes; rebuilding mutable development sources produces a different
artifact. The verifier pins the receipt rather than rebuilding another task's
in-progress changes.

The user fully restarted Civ VII and confirmed: “Restarted; native launcher
appeared automatically.” Readback verified the acknowledged source and a first
native mount without RAM trial globals. Two subsequent real-core terminal/main
roundtrips retained device/swapchain `207509946448:207513534080`, verified a teal
GPU output sample, and kept RPC/raw services available. FTP stopped in Terminal
and restarted with Launcher. This uses stock refresh; it is not another 120 Hz
performance measurement.

The component caches its launcher factory before dependency evaluation on repeat
mounts, restores the FTP export removed by resident unload, reuses the shared
native session, and waits for the first valid native frame before acknowledgment.
An untested different native implementation requires a fresh game process.

The installed `.2` source intentionally disables selection-based app launching,
as accepted by the user. Current `.3` development for cooperative Moonlight/apps
is separate; this installation does not qualify or deploy it. See
[native apps](native-apps.md) for that newer source interface.

## Hello CivSwitch 0.2.0

Hello retains its existing layout, action counter, controller navigation and
final lifetime promise. If a native session exists, it attaches a view to that
session, uses its font/cache pipeline, and closes only that view before returning
to resident Launcher. It creates no second native device or swapchain and bundles
no renderer copy. Without the session it retains its Gameface DOM UI.
Its manifest declares `extensions.nativeUi.api = 1` for the newer launch policy.

The previous installed Hello package/icon was backed up under
`build/nanovg/install-backups/20261111T234216Z/`. The new package was installed and
read back byte-for-byte; other app entries and both system-component states are
unchanged. The resident installer initially rejected “Invalid catalog entry.”
The same failure occurred in the existing raw-loader installer before writes.
An instrumented no-write check and a separate scope comparison isolated duplicate
entries after insertion into a filtered catalog array with native `splice`.
Simple literal-array insertion passed eight times, so this does not establish
that all `splice` calls fail. The underlying engine condition is unresolved.

Storage now constructs the ordered replacement list with an explicit loop and
push, preserving validation and every other entry. The corrected raw installer
completed, with full package/source/icon readback. This source fix is also in the
next core build; the currently installed core was not replaced. Host regression
coverage checks first/middle/last replacement, append and reload with `splice`
unavailable.

Two automated **PC-triggered installed-app** Switch roundtrips verified the Hello
background GPU pixel, rendered “Action ran 1 time.” text command, selection of
Close, B exit, Close action exit, complete DOM/lease cleanup and main remount.
Both retained the cold-start native owner and compiled module, with no native
session errors. These are console execution and GPU-output checks; Hello has no
separate user-visible confirmation. UI launch remains gated by the installed
`.2` component until the cooperative-app launcher update.

Run `npm run pack:hello`, inspect `dist/hello.civapp`, and run `npm run test:hello`
for browser fallback and two real resident native handoffs. Set
`CIV_HELLO_MAIN_PACKAGE=dist/launcher-nanovg-main-installed.civupdate` to pin a
frozen console component. The original `.2` deliberately fails the newer Start/A
regression below, even though its PC-triggered child handoffs passed.
`tools/nanovg/hello-device.py` provides explicit backup/
install, bounded recovery, test and extract commands; it never retries an
unacknowledged install automatically.

Evidence: `investigation/evidence/nanovg-main-installed.json`,
`nanovg-main-cold-verified.json`, `nanovg-main-roundtrips.json`,
`nanovg-hello-installed.json`, `nanovg-hello-roundtrips.json`, and their transfer
logs. Catalog diagnostics, failed validation and the initial test assertion are
retained separately. The initial Hello test incorrectly treated the remounted
launcher's `__civswitchApp` as leftover Hello; the corrected test checks its ID.

## Launcher Start/A regression

The user subsequently reported the expected blanket Start restriction when
trying Hello manually. The prior console tests used the PC run operation, so
their successful child handoffs did not qualify launcher selection-based launch.
`tests/nanovg/hello-chrome.cjs` now installs Hello, selects its tile, and dispatches
the launcher's controller accept action for both roundtrips. It also checks that
an undeclared app is rejected before its initializer runs and that the loading
overlay clears. This test reproduces the reported error against frozen `.2`
and passes against the cooperative `.3` source. The separate Moonlight chat owns
the ongoing console installation; the user asked this chat to let it finish
before performing the matching device Start/A check. Host evidence is
`investigation/evidence/nanovg-hello-launcher-start-host.json` and its old/new logs.
The new `hello-device.py test-launcher` / `extract-launcher` probe exercises real
launcher controller navigation and accept, without calling the PC run operation.

After the Moonlight installation and its shared percentage-line-height correction
returned the console to an idle launcher, two real Start/A roundtrips passed on
Switch. The probe navigated to Hello's tile and dispatched launcher accept; it
did not use `op:run`. Both cycles checked action text and a native GPU background
sample, then exited through B and Close respectively. Native owner
`371744211024:371749985920` and compiled modules stayed unchanged, the launcher
remounted, and the session reported no errors. The tested launcher was `0.4.3-nanovg.4`; its live component identity
was `1dea4827467bf899557233ffc3d8be4eea90d64cd9a4da88146aa9e69b56cb06`.
This resolves the Hello Start restriction in the updated installation; the older
`.2` receipt above remains historical. Evidence is
`investigation/evidence/nanovg-hello-launcher-start.json`, its activation and
transfer logs. These are automated console checks, without a separate human
Hello visual confirmation or a new 120 Hz performance claim.
