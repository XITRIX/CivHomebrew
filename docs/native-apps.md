# Shared native Launcher and apps

The native Launcher component `0.4.3-nanovg.4` supports cooperative apps through
native UI API 1. Build it with `python3 tools/nanovg/package-main.py`; the artifact
is `dist/launcher-nanovg-main.civupdate`. Update the Launcher through the existing
component mechanism and start a fresh process when replacing an older native
owner implementation. This source change does not install a component or alter
the boot trigger.

Apps declare `metadata.extensions.nativeUi = {api:1}`. Every frontend checks
this against the verified installed manifest before invoking `api.launch`, even
before a native session exists. Apps without this capability stay installed and
selectable, but Start reports that the app needs an update for the native Launcher.
The resident rejects companion `run` and `run-source` requests before accepting
them and rechecks before reading or evaluating any app script. With a shared
session, both paths enforce library/API/major compatibility and optional `minVersion`
and `capabilities` requirements. Compatible minor and patch updates reuse the
resident implementation; bundled `version` records provenance. Exact hash/version
locks remain build checks. See [compatibility policy](shared-native-ui.md). Deploying
resident enforcement requires a core update and restart; a Launcher update alone
enforces frontend Start. Raw terminal/recovery payloads retain their existing path.

`CivNanoVGSession` API 1 owns the renderer, fonts, geometry and one retained native
display. `attach(root)` serializes view leases, disconnecting the previous view's
UI work. Closing a lease never closes the device or swapchain. Launcher closes
its view/FTP before the resident awaits the app's final lifetime promise. Apps
expose `window.__civswitchApp = {close,lifetime}` for cooperative cleanup. After
the app finishes, the resident remounts Launcher and restarts its FTP service.

Moonlight borrows the renderer's display/context and creates video pipelines on
that existing device. `renderer.bindSurface(publish)` gives an exclusive lease
that routes completed UI raster output to the video presenter. Both new and
retained geometry wait for compute completion before lending the mapped RGBA
buffer. Closing that surface lease restores the normal UI presentation route;
closing an older lease cannot detach a newer one. Output exports straight RGBA
with preserved transparency, so video remains visible through translucent UI.

Controls: A on Moonlight in Launcher opens Hosts. B from Hosts closes Moonlight
and returns to Launcher. During streaming, −/+ opens the drawer; Disconnect
returns to Moonlight Games, and B then returns through Hosts to Launcher. The
same native owner survives these transitions; no return to the game's original
renderer is involved. Terminal/Launcher switching keeps its existing controls.

Host coverage includes generated NanoVG geometry, browser raster parity, native
fence/presentation ordering, three resident app roundtrips, FTP stop/restart and
undeclared-app rejection. Moonlight also executes the packaged native SPIR-V on
host Vulkan to check straight-alpha output. Earlier device evidence qualified
Launcher/Terminal switches only. The tested cooperative Moonlight video flow is now device-qualified as recorded below.

## Moonlight device qualification, 2026-11-12

NS2-experiments installed the ordered 40-script Moonlight package and completed
four real installed-app Launcher → Moonlight → Sunshine/native stream →
Moonlight → Launcher roundtrips, H.264 and AV1 before and after a text correction.
Native device `371744211024` and swapchain `371749985920` stayed identical.
Zero C tasks, restored FTP, working resident services and teal Launcher GPU border
samples were checked after disconnect/return. The user confirmed picture/audio
and then corrected overlay spacing and vertically centered footer labels.

The console returns authored `line-height:1.4` as `140%`. Native snapshots must
resolve percentages against font size; interpreting it as 140px produced 210px
native line steps instead of 33.6px. The `.4` component contains this scene fix.
Its source delta was verified to contain only the scene module and release/
identity, then adopted into the existing session and acknowledged through normal
two-slot updates. No GPU owner was recreated. `.3` had separately passed a cold
start; `.4` cold start was not separately exercised in this run.

The older installed core's filtered-array/splice replacement again rejected a
valid package. Bounded no-write plan/catalog validation passed, and the existing
raw installer using explicit list construction completed the Moonlight update.
Core/boot and other apps stayed unchanged. The complete frozen receipts and
limits are in NS2-experiments `docs/native-rendering.md` and
`investigation/evidence/moonlight-native-roundtrip-qualification.json`.
Short Desktop streams and injected UI events do not establish locked 60 FPS,
sustained gameplay, physical controls or original game-renderer return.

## Native FTP keyboard, SDK 1.3.5

Launcher `0.4.3-nanovg.12` uses the shared SDK inline-keyboard image lease for
FTP Port, User and Password entry. It acquires against the whole active Launcher
view before activating the shipped textbox, and releases on confirm, cancel,
activation error or unload. A display failure leaves IME ownership intact until
normal completion. Blank entry, exact text replacement, cancel preservation and
credential-free diagnostics remain unchanged. The implementation uses no display
visibility setters and does not replace the running GPU owner.

The corresponding Moonlight pairing trial was user-confirmed visible and
functional on Switch 2 / Civ VII cartridge 1.0.0 on 2026-11-12. The user also confirmed the Launcher FTP keyboard working after permanent
installation and a Civ VII restart. Activation and visible evidence are maintained in NS2-experiments
`docs/native-keyboard.md` and `docs/validation/native-keyboard.json`.


## All apps aligned to SDK 1.3.5

On 2026-11-12, all five installed app manifests required SDK 1.3.5; all 100
app scripts and icons were read back against fresh packages. After a full
restart, core 0.4.3-sdk.8 and Launcher 0.4.3-nanovg.12 were acknowledged, both
live SDK versions were 1.3.5, and the shared native owner reported no errors.
SDK consumers pin commit `276347008772de88798f7771b36ccaa47642cecc`.

Doom's 27 MiB monolithic RPC crashed Civ VII; after restart the bounded PC
installer completed its 47 scripts and icon individually. The standard PC
`install` command now routes packages over 8 MiB through that path. This
qualifies the recorded per-file workload, not arbitrary large native frames.
Detailed source/readback evidence is in NS2-experiments
`docs/validation/sdk-1.3.5.json`. No recovery copies were made.
