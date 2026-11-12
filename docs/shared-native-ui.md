# Versioned CivApps renderer

The native Launcher consumes **CivHomebrew-SDK 1.3.3** (`civapps-native-ui`,
native UI API 1).
`civapps-native-ui.lock.json` pins the runtime, notices and verification helper
by SHA-256. `tools/nanovg/build.py` and both native package builders verify those
files offline. Neither Moonlight nor the library checkout is needed to build
this application.

The library also owns NanoVG's complete C/shader/font build and standalone
geometry, native ABI, browser and host Vulkan tests. Its shared Chrome helper
and Vulkan C runner are pinned under `tools/civapps-native-ui/`. This app keeps
screen parity and resident integration tests; the generic renderer tests live
in the library.

Renderer, native bridge, fonts, geometry and shader sources have moved into the
[CivHomebrew-SDK repository](https://github.com/XITRIX/CivHomebrew-SDK). Its release tool installs the same artifact into
all app consumers. Do not edit `app/vendor/native-ui-runtime.js`.

`app/src/nanovg/resident-ui.js` is CivHomebrew's adapter. It owns terminal/core
monitoring, terminal and Launcher font selectors, bind diagnostics and cleanup
of that monitoring. `main-component.js` follows one shared session and waits
for its first frame. None of this app policy lives in the renderer library.

The public library entry point is `CivAppsNativeUI`; the current `CivNanoVG*`
globals remain compatibility exports. Apps that bundle the library declare
`nativeUi: {api:1, library:"civapps-native-ui", version:"1.3.3"}`. The bundled
version is provenance and a compatibility-major selector, not an exact pin on
the running Launcher. API and stable release major must match; compatible minor
and patch releases reuse the resident runtime in either direction. Optional
`minVersion` and `capabilities` restrict only apps that need newer implementations
or particular interfaces. For example, `minVersion:"1.3.0"` and
`capabilities:["native-ui","framebuffer"]` require that inclusive minimum and
both advertised interfaces. Capability names describe interfaces, not hardware
availability. API-only declarations remain supported for borrowing apps.

`PayloadCore.nativeUi` supplies the common frontend/resident preflight, before
scripts are read or services are stopped. It uses the SDK compatibility helper;
both runtime bundles independently enforce API/major compatibility before module
evaluation. Compatible loads retain factories, session and graphics ownership.
Exact version/hash locks still verify builds. See the SDK README for the full
requirements schema. Previously distributed exact-guard bundles need one SDK
refresh; this change cannot rewrite already installed app sources.

The current native package builders emit Launcher `0.4.3-nanovg.11` with SDK 1.3.3.
Build the core update with `--core-release 0.4.3-sdk.7`, install both components
through the normal update mechanism, then restart Civ VII. The compatibility
policy is host/browser tested. The corrected startup pair passed the Switch
qualification described in [launch performance](launch-performance.md).
This pair also caches the acknowledged Launcher factory and defers update
metadata until its first frame. SDK 1.3.3 schedules shared views' initial frame
after the app constructs its screen, and readiness walks skip hidden inline
`display:none` subtrees until shown. Launcher, Hello, Moonlight and Doom vendor
the same release. These changes preserve the existing native owner and loading
view handoff; large ordered app sources are still read and verified in full.
Core `sdk.7` serializes original-bootstrap component operations so deferred
metadata cannot race acknowledgement writes. Earlier `.10` / `sdk.6` startup
is rejected by the deployment helper after a real-console failure. Launcher
`.11` falls back to synchronous metadata initialization on an older core.

Core `0.4.3-sdk.4` and Launcher `0.4.3-nanovg.8` package SDK 1.3.0. Install
matching app releases together and restart Civ VII to activate the new owner.
Existing native owners must not be replaced live. All four consumers completed
console roundtrips; Moonlight exercised H.264/AV1 streaming and Doom entered
gameplay. The detailed qualification is maintained in Moonlight's
`docs/sdk-performance.md` and `docs/validation/sdk-1.3.0.json`.

Build and validate with `npm run build:nanovg`,
`npm run package:nanovg:main`, `npm run test:nanovg`, the native browser/terminal
suites and host Vulkan suite. Resident lifetime/FTP rules and system package
formats are unchanged. Library upgrades additionally require updating apps'
capability versions and running their package checks.

## All app consumers

Launcher boot/core use the lightweight `app/vendor/civhomebrew-sdk.js` before
native adapter construction. The native frontend loads the full renderer bundle.
The core builder permits an SDK upgrade only in its explicit bootstrap handoff,
before a UI backend or native graphics owner exists; ordinary apps reuse compatible releases and reject incompatible API/major versions. This preserves cold core upgrades without replacing a live display.

Hello CivHomebrew, Moonlight and Doom each declare native UI API 1 and the same
SDK version, pin identical release bytes and retain their final lifetime script.
Doom now draws both its selector and 320x200 framebuffer through that shared
owner. SDK source owns symbol resolution, native stacks/buffers/controllers,
graphics contexts/helpers, RGBA presentation and common packaging/build tools.
App-specific catalog, network protocols, save formats and game/stream behavior
stay in their adapters. The SDK installer updates compatible capability versions;
`--revision` pins its exact published commit as source provenance.

The Doom host integration runs two installed Launcher/app/game roundtrips,
compares displayed pixels with the actual compiled engine framebuffer, checks
one retained RGBA slot and verifies renderer/geometry identity after return.
These are browser/host GPU results, separate from the historical device runs.

## Test ownership and diagnostics

Generic renderer, buffer transfer, private stack, packager and sender tests live
in the SDK. This app keeps resident/FTP behavior, update formats, Hello and
Launcher handoffs, screen parity, terminal trials and companion integration.
`investigation/probes/nanovg/` contains optional device diagnostics, outside the
runtime source tree. Generated `app/nanovg*.html` previews are ignored and rebuilt
by `npm run package:nanovg`; the visual test commands build them automatically.
Raw console logs stay local under ignored `investigation/evidence/`.

## FTP settings keyboard

Launcher `0.4.3-nanovg.12` includes SDK 1.3.5's shared native keyboard image
adapter. `app/src/keyboard.js` acquires `CivAppsNativeUI.keyboard.open` against
the active Launcher root/view before activating the game's `fxs-textbox`. The
compatibility alias remains available for the verified in-memory trial. The game
continues to own IME input and confirmation/cancellation callbacks.

Port, Username and Password use the same adapter. The textbox is enabled and
receives its maximum length (5 for Port, 128 for credentials); Password retains
password type. Entry opens blank, confirmation replaces the draft with the exact
returned text, and cancellation preserves the previous draft. Deferred callback
cleanup releases the keyboard view on confirm, cancel, unload and activation
failure, then restores Launcher focus. Credentials are not included in logs.
FTP restarts only when the user saves/leaves FTP Options, as before.

Seven focused keyboard tests cover all three fields, callback/lease cleanup,
late failures, canceled imports and the public SDK entry point. Full host checks
include resident/system, real loopback FTP, browser editing and native Launcher
activation/remount. The `.12` component was staged with verified pending-slot
checksum `f09dde92`; activating its new native renderer requires a Civ VII restart.
Staging did not replace the active renderer or update the core/boot trigger.
Local receipt: `build/ftp-keyboard/staged.json`. On-console activation and human
keyboard verification remain separate from these host/staging results.
