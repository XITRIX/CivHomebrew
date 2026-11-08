# Resident core and replaceable launcher

The application still runs as a regular payload inside Gezine’s loader. No boot
trigger has been replaced. All layers share the game’s JavaScript runtime and
native privileges; these ownership boundaries provide cleanup and recovery, not
process isolation.

| Layer | Owns | Lifetime |
| --- | --- | --- |
| Stable boot/bridge | Loader-scope evaluator, verified native ABI adapter, package primitives, component slot loader and initial seeds | Entire bootstrap session |
| Resident core | Terminal/log ring, raw TCP 9026 receiver, framed TCP 9027 companion, app store/catalog, installer, inbox and update coordinator | Until explicit core shutdown |
| Launcher | Selector DOM, input handlers, artwork tasks, loading overlay and passive FTP on 5000 | While the selector is open; stays visible during file loading |
| Foreground app | Its DOM, input, timers and native resources | Until its returned lifetime promise settles and cleanup completes |

`app/boot.js` assembles the stable context. `app/core.js` owns resident resources;
`app/src/resident.js` coordinates lifecycle and installation. `app/app.js` and
`app/src/ftp.js` form the replaceable launcher component. See the script lists in
`tools/payload_menu.py` for the exact build boundary.

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

Y Options → FTP configures Enable, Port (5000 by default), Anonymous, User,
Password and Protect CivHomebrew. The core validates and persists settings in
`save:/civhomebrew/ftp-settings.json`; the launcher stops/restarts its server after
a confirmed settings save. Corrupt settings disable FTP and preserve the file,
while the UI remains available for repair. Listener startup failure is displayed
without making the launcher unusable. Passwords are masked in the UI, stored in
plaintext locally and never included in normal status/diagnostic output.

FTP offers one control client at a time, anonymous or configured credential login,
PASV/EPSV and UTF-8 commands/listings. The virtual root contains exactly two folders:

- `/Install civapp`: a permanent `drop civapp here` instruction file plus retained
  inbox copies. Dropping a `.civapp`, or uploading its content onto the placeholder,
  invokes the core-owned installer. Named `.civupdate` uploads still stage updates.
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

Limits: 16 inbox entries, 12 MiB combined inbox bytes, 12 MiB per upload/download,
30-second data inactivity/deadline, five-minute control idle timeout. Large save
files remain listed but transfers exceeding 12 MiB fail visibly. Partial upload
bytes are held in memory and discarded if the launcher closes before acceptance.
A complete accepted install/write stays core-owned during frontend shutdown.
Inbox copies are stored with an index under `save:/civhomebrew/inbox/`; deleting
one does not uninstall its app or undo a staged system update. Active FTP, resume
and recursive RMD are unsupported.

A successful FTP `226` means the app install or system staging completed. Launcher
activation is scheduled after that response, so replacing the FTP-owning frontend
does not deadlock its own upload. Component activation can still fail and roll back.
The services use CivSwitch’s existing trusted-LAN arbitrary-code model; checksums
are corruption checks, not authentication or signatures.

## Component updates

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

## Remaining boot integration

No script currently installs this bootstrap over Gezine’s trigger. That later
step needs a backup/restore installer, a verified cold-start path, offline startup,
recovery input and game-restart tests. Only the regular testing mode offers
`+ Exit to Gezine`; resident boot-integrated mode should retain terminal access
but remove that outer exit.

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
