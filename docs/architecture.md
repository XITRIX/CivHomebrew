# Resident core and replaceable launcher

The application supports regular payload testing and an explicitly installed
boot trigger. The installer changes only the existing XSTRIG with PC/device backups. All layers share the game’s JavaScript runtime and
native privileges; these ownership boundaries provide cleanup and recovery, not
process isolation.

| Layer | Owns | Lifetime |
| --- | --- | --- |
| Stable boot/bridge | Loader-scope evaluator, verified native ABI adapter, package primitives, component slot loader and initial seeds | Entire bootstrap session |
| Resident core | Terminal/log ring, raw TCP 9026 receiver, framed TCP 9027 companion, app store/catalog, installer and update coordinator | Until explicit core shutdown |
| Launcher | Selector DOM, input handlers, artwork tasks, loading overlay and passive FTP on 5000 | While the selector is open; stays visible during file loading |
| Foreground app | Its DOM, input, timers and native resources | Until its returned lifetime promise settles and cleanup completes |

`app/boot.js` assembles the stable context. `app/core.js` owns resident resources;
`app/src/resident.js` coordinates lifecycle and installation. `app/app.js` and
`app/src/ftp.js` form the replaceable launcher component. See the script lists in
`tools/payload_menu.py` for the exact build boundary.

## Launcher rendering

`app/src/layout.js` converts the 1280×720 design measurements into rounded screen
pixels at the current viewport size. The stage is centered without a CSS scale
transform, so text is rendered at its final font size instead of enlarging a
720p text layer. Selector, options and progress overlays share this layout helper;
resizing reapplies geometry without resetting selection colours or progress.
The launcher uses the game's registered BodyFont family with language fallbacks
and Arial for browser previews. Button glyphs remain fixed image artwork.

X Menu opens the selected app's drawer on the right, mirroring Y Options.
`app/src/app-menu.js` owns the drawer, information dialog and delete confirmation;
`app/src/app-library.js` implements the app actions as part of the replaceable
launcher. X polling uses the boot context's existing read-only controller adapter
and is cleaned up with the launcher. The recovery shell is unchanged.

The launcher API includes one generic `appStore(async store => ...)` capability.
The core serializes it with installation and other mutations, waits for artwork
reads, and refreshes the selector on completion or failure. The transaction exposes
an `entries` snapshot, verified `manifest(id)`, mirrored `publish(entries)` and
app-scoped file operations: `read/write/remove/ensureDirectory(id, relativePath,
...args)`, `removeDirectory(id)` and `commit()`. Paths pass through `appPath`;
system slots, settings, mount roots and other saves are outside this capability.
The callback must await its operations; its handles expire on return. This is a
serialized mutation scope, not automatic rollback. Publication failure retains
the existing catalog uncertainty protection and blocks further mutation until
recovery. Future app actions belong in replaceable modules using this interface,
without adding action-specific recovery-core APIs or companion operations.

Information reads only the verified manifest, with a read-only file fallback for
older cores. Delete defaults to Cancel and verifies the selected catalog checksum
inside the transaction. The launcher action publishes both catalogs without that
entry, then recursively deletes only `apps/<id>`, commits and verifies manifest
absence. App-owned saves outside the installed folder remain untouched. If folder
cleanup fails after catalog retirement, files can remain unlisted; reinstalling
the app cleans that folder and restores the entry. An older core without
`appStore` displays an update-required error on confirmation. This interface
requires one core update; later launcher actions can use it independently.

## Foreground transitions

1. Startup loads the app catalog, selects the resident core and autoloads the
   launcher unless recovery was requested.
2. Minus or selector B stops FTP and unloads the launcher’s DOM, artwork tasks,
   timers and input subscriptions. Core terminal and PC listeners remain active.
   Terminal B reloads the launcher and restores selection by stable app ID.
3. Starting an app reserves the foreground transition immediately. The launcher
   stops FTP: incomplete transfers are cancelled; a package already accepted by
   the core finishes installation. The core waits for an existing accepted
   install before reading the selected app.
4. For a controller launch, the launcher displays byte-based loading progress
   while the core reads and verifies scripts. At completion, it unloads the
   launcher, evaluates the ordered scripts in the original loader’s lexical scope,
   and awaits the app’s final lifetime promise.
5. After completion or a caught exception, cooperative child cleanup finishes,
   then a fresh launcher and FTP server start. Raw PC launches instead leave the
   resident terminal visible when they finish.

The common `window.__civswitchApp` slot belongs to the frontend or current child;
`window.__civhomebrewCore` has a separate lifetime. An app should expose its own
`close` method and clean resources before resolving its lifetime. Input polling
owned by the core pauses during foreground execution. Status/list requests remain
available; installs, updates, shutdown and overlapping launches reject while an
app or transition is active. A raw payload cannot be cancelled by pressing B.

Core TCP listeners retry fatal listener errors after a delay. Readiness waits for
both listeners to initialize rather than trusting an old awaiting log line.
The earlier long-running socket-loss cause has not been reproduced or identified;
startup retry tests do not establish arbitrary network-loss recovery.

## Installation and FTP

The **core** is the only owner of app validation, quota checks, old-folder deletion,
extraction, readback and catalog publication. A PC management request or an FTP
upload asks the same core-owned store to install; the frontend does not write app
folders itself. App layout and clean replacement rules are unchanged; see
[installed layout](installed-layout.md).

The core asks the mounted launcher to show its existing centered progress overlay
while installing an app from FTP or the PC companion. It appears as
`Installing APP…`, blocks launch/navigation and counts UTF-8/binary bytes written
and read back. Completion is reported only after both catalog copies are
published. Success and failure dismiss the overlay; errors also refresh the
visible catalog and show an actionable notice. Installation in terminal mode
works without a frontend or overlay.

The launcher also owns the upload phase for direct files under `/Install civapp`.
FTP reports received bytes after every data chunk, then hands the same modal to
the core installer. Each modal owner has a generation token so a late upload
completion cannot hide or change the newer installation modal. Unknown totals
show received KiB/MiB and an indeterminate bar; a valid per-session `ALLO` size
hint enables percentages and is consumed by one STOR. Root file transfers have
no package-upload overlay. Upload cancellation, validation failures and launcher
unload dismiss the upload modal and release its animation timer.

Y Options → FTP configures Enable, Port (5000 by default), Anonymous, User,
Password and Protect CivHomebrew. The core validates and persists settings in
`save:/civhomebrew/ftp-settings.json`; the launcher stops/restarts its server after
a confirmed settings save. Corrupt settings disable FTP and preserve the file,
while the UI remains available for repair. Listener startup failure is displayed
without making the launcher unusable. Passwords are masked in the UI, stored in
plaintext locally and never included in normal status/diagnostic output.

FTP serves up to four independent control sessions, so FileZilla can keep its
browsing connection open while opening transfer connections. Login, current
directory, rename state and passive data sockets belong to each session. Only
one upload/installation is buffered at a time; competing uploads get a temporary
450 response and may retry. All sessions close when the launcher unloads; an
already accepted installation still finishes before shutdown returns. FTP
supports anonymous or configured credential login, PASV/EPSV and UTF-8
commands/listings. The virtual root contains exactly two folders:

- `/Install civapp`: contains only the permanent `drop civapp here` instruction
  file. Package drops are transient write targets and never appear in LIST/NLST/
  MLSD or direct SIZE/MLST/RETR lookups, even during installation. Dropping a
  `.civapp`, or uploading its content onto the placeholder, invokes the core-owned
  installer. Named `.civupdate` uploads still stage updates.
- `/Root`: the actual current `save:/` SDK mount. It supports listing,
  upload/download, rename, mkdir, file deletion and empty-directory removal.

`app/src/ftp-files.js` owns virtual-path canonicalization and checks write protection
inside the core. The default protection covers the entire `civhomebrew` namespace,
including both component slots, state, settings, catalogs and installed apps.
Reads remain available; the installer still works. Both rename endpoints are
checked, including case and dot/dot-dot aliases. Turning protection off explicitly
permits direct modifications to these files. Save mount roots and virtual directories
cannot be removed or renamed; no recursive directory deletion command is exposed.
Direct edits with protection off can invalidate system state or app catalogs.

The normal core storage adapter remains confined to `save:/civhomebrew/`. A separate
privileged `native.files` interface accepts canonical paths within `save:/` only,
with all allocations/handles owned and closed. It uses bounded 16-entry directory
batches and at most 4096 entries per listing. SDK directory layout/signatures were
cross-checked against the [Atmosphère declarations](https://github.com/Atmosphere-NX/Atmosphere/blob/master/libraries/libstratosphere/include/stratosphere/fs/fs_directory.hpp)
and verified with a read-only enumeration on the actual OLED before file mutations.

Limits: 48 MiB per upload/download,
30-second data inactivity/deadline, five-minute control idle timeout. Large save
files remain listed but transfers exceeding 48 MiB fail visibly. Partial upload
bytes are held in memory and discarded if the launcher closes before acceptance.
A complete accepted install/write stays core-owned during frontend shutdown.
Accepted packages are installed/staged directly from bounded memory without
writing a distribution copy. On startup, the core removes recognized legacy
`.civapp`/`.civupdate` copies and their old index under `save:/civhomebrew/inbox/`,
commits and verifies deletion. Filesystem enumeration also catches copies left
before index publication. Unrelated files are preserved; the retired internal
inbox is hidden behind all `/Root` aliases as well. Active FTP, resume and
recursive RMD are unsupported.

A successful FTP `226` means the app install or system staging completed. Launcher
activation is scheduled after that response, so replacing the FTP-owning frontend
does not deadlock its own upload. Component activation can still fail and roll back.
The services use CivSwitch’s existing trusted-LAN arbitrary-code model; checksums
are corruption checks, not authentication or signatures.

## Component updates

Options self-update discovery and saved availability labels live in replaceable
launcher modules. Every published release describes both target components with
independent versions, allowing users to skip releases. Only changed components
are downloaded; all validate before existing component staging begins. Launcher
changes reload live; core changes show a full-restart blocker. This feature adds
no boot, resident or native bridge changes. See [system updates](system-updates.md)
for the release manifest, publishing commands and persistence policy.

App release checking is implemented by replaceable launcher modules using the
existing generic store and installation APIs. The replaceable core's metadata
codec preserves bounded, provider-independent `extensions` objects. No GitHub
logic or new companion operation is added to the recovery shell. See
[app updates](app-updates.md) for the manifest schema, transport, cancellation,
validation and existing clean-replacement limits.

App packages remain `.civapp` v1. System updates use a distinct UTF-8 JSON document:

```json
{
  "format": "civswitch-system",
  "version": 1,
  "api": 1,
  "component": "launcher",
  "release": "0.2.0",
  "source": "/* complete component classic-script bundle */",
  "checksum": "01234567"
}
```

The example checksum is illustrative. Real checksums use the same 32-bit FNV-1a
hash over JavaScript UTF-16 code units as `PayloadCore.hash` / the Python companion.
Components are `core` or `launcher`, API must be 1, and source is at most 8 MiB
UTF-8. Release is a display label; no semantic-version ordering is enforced.
Launcher source must evaluate to `{api:1, mount:async function(api){...}}`, returning
an instance with asynchronous `close`. Core source awaits
`CivResidentEntry.start(window.__civhomebrewBoot)` or a compatible implementation,
acknowledges readiness through that context and retains its lifetime promise.

The replaceable core includes the native-buffer, native-worker and native bridge definitions.
Before it starts services, it creates a fresh adapter in the loader's native
lexical scope and updates `boot.native`. The boot adapter remains available for
recovery and the already-created system-slot reader; core updates can therefore
ship normal app I/O improvements without rewriting the boot trigger. No native
sockets or asynchronous jobs are started by adapter construction. Native file
reads transfer 64 KiB at a time and yield between batches after 8 ms or four
chunks, whichever comes first. The final chunk needs no extra timer. Per-script
UTF-8 size and existing FNV checks remain mandatory before evaluation.
See [launch performance](launch-performance.md) for Switch measurements.

## Native worker for parallel off-thread execution

CivHomebrew provides parallel background JavaScript execution through
`PayloadNativeWorker` and `native.worker`. Background jobs run inside an owned
V8 isolate executed by the GameCore GTS scheduler (`RunV8Task`) off-thread in
parallel with the main UI and graphics threads:

- `worker.load(source, { bytes })`: loads worker script into the isolated context
  and resolves the shared ArrayBuffer via `ArrayBufferSweeper`. Worker source pieces
  form one program in source order inside a fresh function scope for each load;
  declarations and the bound handler are discarded on retirement. Explicit writes
  to `globalThis` remain resident and should be avoided for app state.
- `worker.step(input)`: synchronous step on the page thread while idle.
- `worker.submit(input)`: non-blocking job submission dispatched off-thread via GTS.
- `worker.poll(timeoutMs, waitMs)`: sequence-checked poll copying the worker's
  output to the page buffer via native PLT `memcpy`.
- `worker.release()`: clears active app bindings while retaining the resident isolate.
  The released handle stays closed; the next `native.worker` or no-options
  `native.createWorker()` access creates a fresh handle.


```text
save:/civhomebrew/system/
├── core/
│   ├── slot-0.js
│   ├── slot-0.json
│   ├── slot-1.js
│   ├── slot-1.json
│   ├── state-0.json
│   └── state-1.json
└── launcher/
    └── same slot/state names
```

Slot metadata and generation-numbered state records are checksummed. State records
bind each slot to its expected source hash, preventing recovery of older metadata
from silently treating overwritten slot content as the old version.

1. Validate the complete update, write the inactive source and metadata, commit
   and verify readback, then publish a pending state. The active source is untouched.
2. Before evaluating a candidate, persist `attempted:true`. Confirm it as active
   only after successful initialization. Retain the old active slot as previous.
3. A failed launcher initialization rejects the candidate and reloads the active
   launcher in the same resident core. A core exception before readiness can fall
   back immediately; a crash/hang requires restarting the game/bootstrap. On that
   next start, an already attempted, unconfirmed candidate is skipped.
4. A launcher update activates live. A core update remains pending until the next
   boot invocation. In this regular phase, `shutdown` returns to Gezine’s loader,
   then `menu` starts the new core. A future boot-integrated mode will require a
   Civ VII restart to activate the staged core.

Explicit `rollback HOST COMPONENT` verifies and selects the previous slot. It
reloads the launcher immediately or selects the core for next start. Two slots
retain at most one previous version. Staging a later update can overwrite that
backup; failed state commits block further mutation until restart. Keep known-good
artifacts on the PC. Unreadable states preserve files; core boot can use the
bundled seed in terminal recovery without overwriting the damaged slots.

Hold Minus at startup or use `menu HOST --terminal` to bypass pending core
activation and open the terminal without loading a launcher. Existing installations
are never replaced just by sending a newer bootstrap: seeds initialize missing
component state only. Use the explicit update command or `.civupdate` FTP upload.
The stable boot/ABI layer itself requires a new boot bundle; it is outside the
replaceable core’s update boundary.

## Boot integration

`tools/install_homebrew.py` preserves the decoded original Gezine initialization
and inserts a compact file dispatcher in the existing remote-loader function.
The full bootstrap is a protected content-addressed file, loaded and verified
only after native initialization. The compressed stage is spliced into the existing trigger's
currentTurnDate record on the PC; no game template or save-directory clearing is
used. Inactive core/launcher slots are staged explicitly because bootstrap seeds
do not overwrite installed components. The new trigger is published only after
verified PC/device backups and candidate readback. Exact restore is available
through the same temporary service. See [boot installation](boot-installation.md).

The integrated core starts locally when PC listeners are unavailable and retries
them in the background. It hides Exit actions, retains Minus/B terminal access,
and reports `services.bootIntegrated:true`. An explicit PC shutdown or bootstrap
failure enters Gezine's retained legacy loader. Hold Minus at startup to bypass
pending core activation and enter the terminal; restart Civ VII to activate core
updates during normal installed operation.

Neither a UI timeout nor a JavaScript catch can interrupt an infinite loop or
repair arbitrary native corruption. An early readiness acknowledgement is not a
long-term health guarantee. Recovery protects component selection and owned files;
it does not sandbox app code or promise recovery from every native fault.

## Upgrade from 0.2.0

This release changes the stable native bridge and owned path allowlist as well
as both replaceable components. Stage the new core while the old core runs, shut
it down, relaunch `menu` from this checkout (new bridge), then update the launcher.
Sending a new bootstrap alone still does not replace existing active components.
The 0.3.0 launcher checks for the settings/files API and rejects an older core
rather than silently presenting nonfunctional options.


## Bundled-data app capacity — core 0.4.0

The replaceable `app-metadata.js` policy permits 32 MiB of ordered app source,
48 MiB companion/FTP frames and 128 MiB total installed manifests/scripts/icons.
This supports large self-contained v1 apps such as Doom with compressed WADs.
Package schema, path validation, script ordering, clean replacement and recursive
app deletion are unchanged. Bundled asset bytes in app scripts disappear with
that app; separately owned persistent data is outside replacement.

Boot recovery defaults retain the original 8/12/32 MiB bounds, and core/launcher
component source remains capped at 8 MiB independently of app capacity. Loading
core 0.4.0 applies the larger app limits through the existing shared capability
object; no trigger replacement is needed for this change. HTTP and SHA-256
download validation follow the current frame limit. Existing smaller packages
remain valid; larger apps must wait until the updated core activates on restart.

## Ordered initialization and bounded extraction — 0.4.3

An explicit `extensions.execution` opt-in permits one verified source at a time,
using a single loader-scope evaluator activation rather than building a combined
source string. The store script reader rejects corruption before evaluation and
never reads later files after a failure. Var bindings and the final awaited UI
lifetime remain live in that activation. Legacy v1 evaluation is unchanged.
Extracted files commit and pass exact readback individually before the next file;
the app remains unlisted and without an executable manifest until all verify.
