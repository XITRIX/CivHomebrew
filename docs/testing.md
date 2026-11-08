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
