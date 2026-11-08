# Validation and hardware acceptance

Local tests do not prove Switch-native ABI behavior. Record actual runs below
with observed results, and keep user-visible behavior separate from log markers.

## Before replacing the original loader

- Header and 256×256 artwork render correctly; six-column navigation and scrolling work.
- A starts an app; a child's B closes that app and returns to the menu.
- Repeated launches do not duplicate input or leave the game/child frozen.
- B/Minus on the selector unload the launcher and FTP to the resident terminal.
- B in that terminal reloads the selector; + exits the regular core to Gezine's
  original loader and the bootstrap PC sender completes.
- Install/update from a second terminal while the menu is open; restart and load offline.
- Icons missing/corrupt, long titles and empty catalogs remain usable.
- Corrupt newest catalog recovers; both unreadable slots preserve files and disable installs.
- Interrupted uploads, disk-full/commit failure, malformed packages and network loss show errors.
- Cold launch, offline cold launch, recovery chord and restore of the original trigger work.

The cold-start/recovery/trigger-restore checks require the later separate installer. Do
not simulate a power cut or fill the actual game save as part of an initial smoke
test; use host fault-injection checks first and a backed-up environment later.

## Host verification · 2026-11-08

- Node package/storage/protocol checks, including corrupt slot recovery and failed writes.
- Python packer, upload staging and real fragmented localhost TCP checks.
- Chrome UI checks with explicit mock storage/native service, screenshot at 1280×720.

## Console smoke test · 2026-11-08

Target supplied by the user: `192.168.1.182`, original CivSwitch loader waiting.

- First finite install failed at icon decoding with `atob is not defined` before
  any app write. The loader caught the exception and closed the client cleanly.
- Replaced atob with a portable decoder and added a browser-global-free regression.
- Finite Hello install then logged `CIVHOME_BREW_INSTALLED` and `Executed successfully`.
- Regular menu launch logged `CIVHOME_BREW_READY`.
- A real companion `list` over native TCP 9027 returned the persisted Hello entry
  (`hello-civswitch`, 12,365 bytes).
- User confirmed the header, IP, Hello tile and turquoise logo look correct on
  the Switch. A opens Hello; B in Hello returns to the menu successfully.
- This confirms one user-visible child launch/return cycle. Repeated launches,
  full-grid scrolling remain unverified on hardware.
- The first menu session later ended with `Executed successfully`, confirming
  return to the original loader.
- After a report that A/B badge text was misaligned, replaced live badge text
  with embedded PNG glyphs and explicit footer line heights. Browser UI and
  companion checks pass. Relaunched the updated regular payload and received
  `CIVHOME_BREW_READY`; visual alignment confirmation on Switch is pending.

No boot-trigger changes were made. These smoke results do not establish cold-boot,
offline, interrupted-install or repeated-launch stability.


## OLED terminal / Gezine compatibility · 2026-11-08

- User selected Switch OLED at `192.168.1.148:9026` for this round. An initial
  mistyped `192.168.1.48` connection timed out before sending any bytes.
- Original unmodified Gezine sender and Hello payload completed against the
  original loader, then against the menu's borrowed TCP 9026 listener.
- User confirmed the on-device terminal shows the Hello output; B returns to the
  selector and Minus reopens the terminal on the actual OLED controller.
- Original `socket(AF_INET, SOCK_DGRAM, 0)` and `close(fd)` helpers created and
  closed an owned finite probe socket from the isolated evaluator. `sdk_base`
  and `call_rop` remained available. Marker: `CIV_ORIGINAL_SOCKET_HELPERS_OK`.
- Installed Hello via the framed TCP 9027 service and read back its persisted
  catalog entry (12,365 bytes).
- A >500 KiB JavaScript app was staged in seven bounded transactions through the
  raw listener. Every stage completed, then the final app reported
  `CIV_STAGED_COMPAT_OK` and `Executed successfully`.
- Closed the menu from an idle state; its bootstrap sender received `Executed
  successfully`. Gezine's original loader then accepted Hello successfully,
  verifying the borrowed listener/logger handoff on this device.
- Relaunched the menu. An intentional exception returned the original `Error in
  payload:` prefix and a bounded stack, without a success marker. A subsequent
  normal raw app immediately succeeded, verifying error recovery.
- Final UI additionally repaints Start's enabled state after child completion;
  selector/terminal browser checks cover the final source. The OLED visual/B/Minus
  confirmation above predates only this footer enable-state adjustment.

All 25 host tests (17 Node, 8 Python) and Chrome UI checks passed. Hardware checks
establish the inspected transport/native-helper contract, not arbitrary payload
compatibility or safety of leaked resources/infinite loops. OLED game/build
identity was not independently fingerprinted. Boot-trigger installation, cold
boot/offline boot and power-loss fault tests remain separate work. No boot
trigger or unrelated game save was changed.


## Extracted-folder installation · 2026-11-08

- Installed layout is now `save:/civhomebrew/apps/<id>/manifest.json`, optional
  binary `icon.png`, and raw UTF-8 `scripts/<source-name>` files. Catalog schema
  is version 2; distribution `.civapp` and companion protocol remain version 1.
- All 33 host checks passed (24 Node, 9 Python). They cover path traversal and
  collisions, real PNG byte preservation, extraction/readback, replacement of
  obsolete/nested/unlisted files, quota accounting, failed replacement, catalog
  uncertainty, migration interruption, corruption, and legacy protocols.
- Chrome checks passed with extracted preview storage, child launch/return,
  terminal input and a raw installer followed by a companion install. The
  selector's icon path reads manifests/PNGs independently of script contents.
- On OLED `192.168.1.148`, the existing monolithic Hello app automatically
  migrated. Raw native inspection verified a plain manifest, one separate JS
  script, a 1,365-byte binary PNG, and retirement of known `package-1.json`.
  Marker: `CIV_FOLDER_LAYOUT_OK`.
- Installed a Hello revision with `scripts/old/nested/obsolete.js` and added an
  unlisted file in that old subdirectory. Reinstalling the original Hello package
  removed both files. Manifest/script checksums and PNG bytes were verified.
  Marker: `CIV_CLEAN_REINSTALL_OK`.
- Tested `install --via-loader` while the menu was open: the selector's catalog
  reported the new revision's 10,861 installed bytes. A following framed
  companion install restored the original clean Hello app (10,714 bytes).
- Loaded Hello from the extracted scripts, launched it, and invoked its owned
  close action after 1.2 seconds. It returned successfully with marker
  `CIV_INSTALLED_FILES_LAUNCH_RETURN_OK`. This was a programmatic lifecycle
  smoke check, not a new user-confirmed controller test.

The clean Hello app is restored and the updated menu remains running. No boot
trigger or unrelated game-save path was changed. Failed-write/power-loss cases
were tested with host fault injection, not destructive console interruption.


## PC packager and Moonlight package

`npm test` includes seven packager tests covering the field-by-field wizard,
missing-icon confirmation/decline, explicit CI omission, all settings as flags,
metadata reuse/overrides, read-only CI sources, path rejection and nonterminal
failure without waiting for input. No placeholder PNG is generated.

The Moonlight source project now has a reusable `payload.json` and the original
Moonlight-Switch icon (converted to 256×256 PNG, with pinned source and license).
Build the Moonlight runtime before packaging. Example from this repository:

```sh
python3 tools/package_payload.py --directory ../NS2-experiments \
  --non-interactive -o ../NS2-experiments/dist/moonlight.civapp
node tests/moonlight-package.cjs ../NS2-experiments/dist/moonlight.civapp
```

The real 1,853,904-byte package passed the host integration smoke on 2026-11-08:
24 scripts installed/extracted unchanged, PNG decoded to 256×256, generated
streaming factory registered, stale PC runtime upload cleared, Moonlight Hosts
screen visible, lifetime promise pending until close, and clean completion.
This is browser/in-memory storage evidence. The new Moonlight package has not
been installed or streamed on the OLED as part of this PC-tool test.


## Listener recovery and Moonlight installation · 2026-11-08

- User reported connection refusal with CivHomebrew open on OLED
  `192.168.1.148`. Its terminal still showed the earlier TCP 9026 awaiting line.
- Independent checks confirmed that both TCP 9027 and 9026 refused connections;
  no diagnostic payload or package was transmitted during those failed checks.
- After the user exited the menu with B, Gezine's original loader completed a
  finite diagnostic with `CIV_ORIGINAL_LISTENER_CHECK_OK` and its success marker.
- Relaunched the current regular menu through that loader. It reported
  `CIVHOME_BREW_READY`; a framed 9027 hello returned the expected app/protocol.
- Installed the real Moonlight package over TCP 9027. The companion reported
  `Installed Moonlight` after the store's extraction/readback/publication flow.
  A subsequent list returned `moonlight-civswitch`, Moonlight, 1,820,256 installed
  bytes, alongside the unchanged Hello entry (10,714 bytes).
- The menu remains running. Moonlight was installed but was not launched or
  streamed during this check. No boot trigger or unrelated save data was changed.

Relaunching restored the listeners. The trigger for the earlier loss of listening
sockets was not identified; this recovery is not proof of an automatic recovery
fix. The awaiting message alone does not establish current socket availability.


## Moonlight loading optimization · 2026-11-08

- On the idle OLED selector, a finite read-only probe loaded and verified the
  installed Moonlight's 24 scripts (1,757,482 UTF-8 bytes) using the old adapter:
  30,356 ms, marker `CIV_MOONLIGHT_READ_BASELINE`, explicit successful completion.
- Replaced native per-byte script/file/network copies with the guarded external
  typed-array/memcpy path adapted from Moonlight's verified native-io adapter.
  The scratch view owns a fixed 64 KiB ArrayBuffer, retained for synchronous
  copies; compressed base width, external range, first 32 bytes and final byte
  are verified before use. Copies and string-conversion argument lists are bounded.
- The OLED passed an exact 65,536-byte binary write/read round trip in owned
  temporary memory. The same installed-script read/checksum path took 6,834 ms;
  native PNG read/checksum also succeeded. Marker `CIV_MOONLIGHT_READ_BULK`.
- All 43 host checks passed (27 Node, 16 Python), including binary chunk bounds,
  layout/byte mismatch rejection before memcpy, range rejection, file integrity,
  package/storage/protocol and companion checks. Chrome UI checks also passed;
  a delayed script read verifies visible loading feedback and disabled Start.
- Cleanly closed the old menu after a finite request completed; its bootstrap
  returned `Executed successfully`. Rebuilt and launched the optimized regular
  menu, receiving `CIVHOME_BREW_READY`.
- A finite raw diagnostic used the new adapter to read the installed Moonlight
  files and directly evaluate their combined source, preserving native scope and
  awaiting the app lifetime. Reading/verifying took 6,585 ms; the Hosts DOM was
  visible after 7,153 ms total. Both `MOONLIGHT_HOSTS_SCREEN` and
  `MOONLIGHT_UI_READY` were logged. The diagnostic invoked Moonlight's normal
  close method after 1.2 seconds and awaited clean completion.
  Marker `CIV_MOONLIGHT_LAUNCH_BULK`, followed by `Executed successfully`.

This establishes the installed-file read/eval/lifetime path on the OLED. The
full-launch measurement used a programmatic probe rather than a fresh physical
A/B confirmation; streaming performance is unchanged and was not tested here.
The optimized menu remains running. No installed app files, boot trigger or
unrelated saves were modified by the performance probes.


## Centered loading progress overlay · 2026-11-08

- Installed-script reads expose optional byte progress. The native file adapter
  reports each completed chunk (at most 64 KiB). Storage aggregates UTF-8 bytes
  across all scripts and reports final completion only after checksum validation.
  Other storage adapters can fall back to per-file completion.
- Selector Start and companion start-by-ID show a centered modal with app title,
  turquoise progress bar and percentage over a dimmed menu. A verified load
  briefly shows Starting/100% before launch; failures dismiss the overlay and
  retain the actionable menu error. App names remain plain text.
- All 44 host checks passed (28 Node, 16 Python). Added progress checks cover
  unequal file sizes, UTF-8 byte counts, intermediate updates, monotonic progress
  and corrupted-final-file rejection before 100%.
- Chrome UI checks passed with a deliberately held script read: intermediate
  progress, panel center at (640,360) in a 1280×720 viewport, disabled Start,
  successful child return and cleanup after a read error. Visual inspection of
  `build/loading-preview.png` confirmed the centered panel and 50% turquoise bar.
- Rebuilt the regular payload. The previous menu session had again stopped
  accepting connections and its bootstrap ended without a success marker, so no
  update was sent to that stale session. The user returned to the original
  loader; the updated menu then reported `CIVHOME_BREW_READY` on the OLED.

The prior listener-loss trigger remains unidentified. Native user-visible
confirmation of the new overlay is tracked separately from host visual checks.


The user confirmed the overlay appeared during Moonlight loading, but reported
that its fill expanded from the center in Gameface. Corrected the track to a
positioned block and the fill to an explicitly left/top-anchored absolute block
with zero margin. Chrome checks now assert both the fill's left edge and its
percentage width. They passed, and the corrected regular menu was rebuilt and
reloaded after a clean successful menu exit. Fresh on-device direction
confirmation remains separate from the host geometry checks.


## Resident core, launcher updates and FTP · 2026-11-08

Host checks: 63 passing (42 Node, 21 Python), plus Chrome UI checks. The new
coverage includes accepted-install ownership across transitions, app/launcher
cleanup, corrupt/partial component writes, attempted-before-eval recovery,
explicit rollback, failed listener startup/retry and honest stopped FTP status.
Python ftplib tests use real localhost TCP against the actual FTP/core modules:
PASV/EPSV, upload/install, download/readback, inbox deletion, invalid/oversized
uploads, cancellation of incomplete uploads and the FTP-owning launcher's update.
Chrome checks cover terminal unload/reload, byte-based progress geometry, app
lifetime, raw logs/native helper scope, live launcher rollback, next-start core
activation, failed-core fallback and complete service cleanup.

OLED `192.168.1.148`, original Gezine loader supplied by the user:

- The regular resident build emitted `CIVHOME_BREW_READY`. Actual TCP 9027 status
  showed core raw/RPC services and launcher-owned FTP active.
- A real PC FTP client connected on 2121, uploaded/reinstalled the existing Hello
  package (11,543 distribution bytes), downloaded identical bytes, and deleted
  only its inbox copy. Moonlight remained listed alongside Hello.
- A terminal command unloaded the frontend. FTP then refused connections as
  expected while core status/list and a Hello install over 9027 still succeeded.
  Reopening the launcher restarted FTP.
- A good launcher update reloaded live. A subsequent deliberately throwing
  candidate recovered to the working selector/FTP with the core still responsive.
- A core update stayed pending with active slot 0 / pending slot 1. A finite raw
  payload verified that state and created/closed an owned UDP socket using original
  `socket`, `AF_INET`, `SOCK_DGRAM`, and `close` helpers.
  Markers: `CIV_CORE_STAGED`, `CIV_RESIDENT_NATIVE_HELPERS_OK`, followed by the
  exact `Executed successfully` completion.
- Core shutdown completed the original bootstrap sender cleanly. A new regular
  boot emitted its ready marker; a finite diagnostic verified acknowledged active
  core slot 1, previous slot 0, no pending candidate.
  Marker: `CIV_CORE_UPDATE_ACTIVATED`.
- The user physically tested Minus → terminal, B → selector, A → Moonlight and
  B → selector. All steps worked, including left-to-right loading-bar fill.
- The final launcher (including the input/fatal-status adjustments) was uploaded
  as `launcher.civupdate` over actual OLED FTP. The PC received `226 Package
  accepted by core`; the launcher restarted its own FTP server and the inbox copy
  was removed through a new FTP connection. The final core was staged and started
  after another clean regular-payload shutdown/relaunch.

These checks cover regular-payload startup and update activation, not a game cold
start or boot-trigger replacement. Hardware native/network fault injection and
power-loss tests were not performed. The earlier long-running listener-loss cause
remains unidentified; startup retry coverage is not proof of every network-loss
case. No Gezine trigger or unrelated save namespace was changed.

Final source verification used finite raw diagnostics to compare both active
component hashes against the PC build and require no pending candidate, with
`CIV_FINAL_CORE_VERIFIED` and `CIV_FINAL_LAUNCHER_VERIFIED`, each followed by a
clean raw completion. The final browser regression additionally checks that a
companion start displays the same loading overlay as a controller launch. The
selector is restored after those diagnostics; both installed apps are preserved.

## FTP Options and save hierarchy · 2026-11-08

Version 0.3.0 adds Y Options → FTP, persistent enable/port/login/protection settings,
a nearly opaque dark options panel and the virtual `Install civapp` / `Root/saves:`
tree. The placeholder accepts package contents; regular package drops use the same
core installer. The normal native storage allowlist remains app-owned; the separate
FTP save adapter is canonical-path checked and governed by core protection.

- All 70 automated checks pass (46 Node, 24 Python), plus Chrome UI checks.
  Real ftplib checks include the exact virtual roots, placeholder installation,
  Unicode command/listing round trips, save file/directory operations, login
  rejection and acceptance (including whitespace passwords), enable/disable,
  protection override, case/dot path aliases and both rename endpoints.
- Browser checks exercise Y and native Y-bit routing, one FTP entry, port validation,
  persistence across launcher reload, password masking, edit cancellation,
  disabling/enabling FTP and an occupied-port failure that stays repairable in
  Options. Screenshots: `build/options-preview.png`, `build/ftp-options-preview.png`.
  The darker menu background was visually inspected after the user's adjustment.
- Before calling new mutating SDK functions, a finite read-only OLED probe listed
  the actual mounted save root: `CIV_FTP_SAVE_ENUM_OK entries=3`, clean completion.
  Directory entry ABI/signatures follow the documented Atmosphère declarations;
  see architecture.md for attribution. This establishes this inspected device,
  not all game/SDK builds.
- A finite native probe created a unique temporary folder under CivHomebrew,
  verified binary read/write and size, renamed/deleted a file, renamed/removed an
  empty subdirectory, removed the temporary folder and committed. Marker:
  `CIV_FTP_SAVE_OPERATIONS_OK`, followed by `Executed successfully`.
- Staged both components through the idle original loader, retaining active slots,
  then launched the new boot bridge. Ready marker received; status reported core
  release 0.3.0 with the launcher and FTP active.
- Actual PC FTP to `192.168.1.148:5000` listed exactly `Install civapp` and `Root`.
  Uploading Hello's contents onto `drop civapp here` installed successfully.
  The save mount listed its three actual top-level entries. A write to a launcher
  slot was refused with the protection message before modifying the file.
- Via FTP, created a unique temporary folder outside the protected namespace,
  uploaded/downloaded identical 8192 binary bytes using filename `雪.bin`, renamed
  and deleted the file, then removed the empty test folder. Removed only the
  retained Hello inbox copy afterward; installed Hello and Moonlight remain.
  Marker from the PC check: `CIV_FTP_5000_TREE_INSTALL_SAVE_PROTECTION_OK`.

The server still unloads with the launcher. Transfers remain bounded to 12 MiB
per file; large-file streaming, active FTP and resume are not implemented.
No boot trigger or pre-existing unrelated save file was changed by these tests.
Native keyboard confirmation/cancellation and user-visible options acceptance
are recorded separately from host/browser evidence.

The user’s native keyboard checks found absent prefill, appended values and an
unsynchronized visible field. A bounded port-only capture showed the input and
component remaining at `5000` during editing, with the final callback returning
`12`. Attempts to synchronize the shipped textbox did not establish live text on
this OLED. A launcher-owned controller keypad passed browser checks but was rejected by the
user. It has been removed. At the user's request, the native keyboard now opens
with an empty value. Confirmation uses the exact GenericData result, including
whitespace, and assigns it to the component's Element-mode input before its
original completion callback runs. No previous value is supplied to the IME;
cancel leaves the options draft unchanged. The focused native input is editable,
rather than the read-only state observed in the failed prefill capture.

Native-lifecycle mocks cover blank activation, exact replacement even with stale
Element-mode text, whitespace passwords, repeated opens, cancellation and callback
cleanup on unload. Chrome continues to cover the browser editing path and menu /
FTP lifecycle. The user requested removal of the extra text-field popup after testing blank
entry. The native callback component is now fully offscreen; only the Switch
keyboard is displayed. The mock asserts that no visible native popup is created.

The FTP hierarchy was then flattened at the user's request: `/Root` itself maps
straight to `save:/`, with no synthetic `saves:` child. The updated real-client
check asserts save entries directly under Root; protection/rename checks and all
70 automated tests pass. The core update was staged, clean shutdown completed,
and the new regular-payload session emitted `CIVHOME_BREW_READY`. Port 5000 accepts
connections; an anonymous listing probe was refused by the user's configured
login, so this final device check did not inspect the new listing or change
credentials. Reconnect the FTP client after the core restart.

## Installed-app checksum optimization · 2026-11-09

The OLED at `192.168.1.148` was idle. Finite read-only profiles of the existing
Moonlight installation (24 scripts, 1,757,482 UTF-8 bytes) separated native reads
from checksum/encoding work:

| Stage | Before | Optimized |
| --- | ---: | ---: |
| Read + validate installed scripts | 6,865 ms | 1,984 ms |
| File reads (includes decode) | 1,152 ms | 1,208 ms |
| Checksums | 5,561 ms | 626 ms |
| UTF-8 length checks | 146 ms | 146 ms |

`C.hash` now caches `Math.imul` and string length and handles four UTF-16 code
units per loop. The original checksum algorithm and all persisted values are
unchanged. A finite 131,072-unit native microbenchmark produced the same hash
for the original, cached, shift-based and unrolled variants (419 / 56 / 124 /
49 ms). Native builtins were confirmed; no native ABI or storage changes were
needed. A mistaken initial benchmark filename returned a clean payload error;
the corrected probe selects the runtime path from the installed manifest.

All 71 automated checks (47 Node, 24 Python) and Chrome lifecycle checks pass.
The new regression compares against an independent BigInt FNV-1a reference at
loop/chunk boundaries, with NUL, Unicode, lone surrogates and a large input.
Existing corruption rejection and progress checks remain intact.

The checksum utility belongs to the stable boot bundle, so the old regular
session was shut down cleanly (`Executed successfully`) and the new bundle
launched (`CIVHOME_BREW_READY`); no installed app or component migration was
needed. A subsequent actual native read/eval smoke measured 2,001 ms to read and
validate and 2,567 ms until Moonlight's Hosts DOM and normal close handle existed.
Both `MOONLIGHT_HOSTS_SCREEN` and `MOONLIGHT_UI_READY` appeared. The probe closed
Moonlight normally after 1.2 seconds and awaited its full lifetime, recording
`closed:true` and `Executed successfully`. This is programmatic native evidence,
not a fresh user controller confirmation; streaming was not started. The launcher
was reopened afterward. Probes are in `investigation/probes/profile-app-loading.js`,
`benchmark-checksum.js` and `profile-app-start.js`.

## One-command boot installer · 2026-11-09

`python3 tools/install_homebrew.py HOST` now builds and installs a boot-integrated
image; `--restore` restores the original trigger. It uses the existing device
XSTRIG as the binary base and never clears Single or ships a game-save template.
The current installer preserves the exact native initialization decoded from the
original device trigger and inserts a small dispatcher into its remote loader.
The initial inline implementation and its failed cold start are recorded below.

- All 81 automated checks pass (52 Node, 29 Python). New checks exercise exact
  restore, changed-trigger/backup rejection, failed publication/receipt rollback,
  uncertain-state mutation refusal, binary splice preservation, UTF-8 decoder
  round trips and source/transfer bounds.
- Chrome lifecycle checks pass, including installed-mode Exit hiding, no Plus
  shutdown, local startup with both core listeners unavailable, Minus recovery
  at boot and B returning to the launcher.
- A read-only OLED preflight exported the original 1,182,991-byte trigger to the
  PC and found one entry in Single. No device write was made during preflight.
- The actual one-command install succeeded, with PC/device backups and active
  trigger readback. The replacement is 1,299,389 bytes. Comparing real binary
  artifacts confirmed that all original bytes outside the selected field's
  length/value were preserved.
- The actual `--restore` command then completed on the OLED, verifying the active
  file equals the original byte-for-byte. The original PC backup stayed unchanged.
- A second actual install completed and verified successfully, leaving CivHomebrew
  installed for cold-start testing. Every temporary installer session returned
  its clean completion marker. No foreground application was launched by these
  file installation checks.

At this initial stage, cold-start, offline boot and controller recovery had not
yet been tested. Byte-verified installation alone did not establish that the
save-list boot entry executed successfully.

The first cold-start attempt froze before either listener opened. The user restored
Gezine using the save manager; its original loader became reachable again. The
large inline/rebuilt-initialization image is **not** a supported tested boot image.

The installer was revised to decode the exact original trigger source and insert a
small file loader inside its existing remote-loader function, after its original
network reset. It never adds direct eval to the native-initializer scope. The
full bootstrap is now a protected content-addressed file read only after native
initialization. The revised trigger's date field is about 27 KiB, compared with
23 KiB originally and 140 KiB for the failed image. This removes both major changes
in the failed attempt; it does not independently identify which caused the freeze.

The separate dispatcher was run through the restored actual OLED loader while the
original trigger was still intact. It emitted `CivHomebrew bootstrap verified.`
and `CIVHOME_BREW_READY`; both PC listeners and FTP were active and status reported
`bootIntegrated:true`. PC shutdown returned cleanly with `Executed successfully`.
The compact installer then completed with verified readback. Hello and a freshly
packaged Moonlight were restored after the save-manager rollback left the catalog
empty; Moonlight's separate packaged Chrome lifetime smoke passed.

At the user's request, a search for the old Moonlight pairing identity found no
PC copy, and a finite read-only OLED probe confirmed both pairing slots absent.
The installer now snapshots any existing pairing slots privately on the PC before
future trigger changes; absent slots never erase an earlier snapshot. The complete
automated suite passes: 82 checks (52 Node and 30 Python), including the new
pairing snapshot regression.
The user has no later backup and chose to pair Moonlight again; no new identity
was generated or credential restored by this work.

The user then closed/reopened Civ VII and opened Load Game without a PC payload,
confirming that the revised compact trigger starts CivHomebrew. A fresh TCP 9027
status check reported launcher mode, `bootIntegrated:true`, both raw/RPC services
and FTP active. The installed catalog still contains Hello (10,714 bytes) and
Moonlight (1,820,258 bytes). This confirms the normal online cold-start path.
The user also restarted Civ VII with Wi-Fi disabled, held Minus while opening
Load Game, reached the core terminal and used B to open the selector successfully.
After Wi-Fi was re-enabled, a fresh PC status request confirmed launcher mode,
both PC listeners and FTP active, with `bootIntegrated:true`. This completes the
online/offline cold-start and controller recovery acceptance for this OLED.
Power-loss behavior and other game/SDK builds remain outside this hardware test.
