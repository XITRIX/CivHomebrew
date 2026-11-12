# Shared NanoVG terminal prototype

This is an opt-in RAM trial. It does not install a core or launcher component,
change the boot trigger, or replace the current terminal. Restarting Civ VII
returns to the installed configuration.

## Reused behavior and layout

The existing resident core owns `PayloadTerminal`, the 37-row / 146-column log
buffer, `terminal-output`, the footer, controller/keyboard return actions and
PC services. The prototype draws that same DOM with NanoVG. It does not add a
command interpreter, replace the logger, or maintain a second terminal model.

`CivNanoVGSession` owns one geometry/font cache and one renderer for the session.
Launcher mounts and the resident terminal borrow view leases. Closing a launcher
lease disconnects only its observers/timers; the device, swapchain, command
buffers, glyph atlas and retained geometry stay alive. A small resident-state
watcher binds the real terminal after launcher unload finishes. Returning through
its existing B/A action mounts the real launcher against the same owner. Only
session close restores refresh and closes the renderer, retaining native display
owners until process exit as before. Arbitrary Gameface child apps and visible
return to Gameface remain unsupported.

The trial supplies the native launcher through a temporary `system.choose`
function in RAM. It returns a non-trial component so `system.confirm` does not
stage or acknowledge a saved update. `stop()` restores the exact original lookup.
The normal launcher and terminal entry points are unchanged on disk and save.

## Text cache and font

The terminal uses the bundled, pinned [Source Code Pro](https://github.com/adobe-fonts/source-code-pro)
regular face, with its OFL license included in generated package notices.
The other UI keeps its existing Roboto faces. The original terminal's line
wrapping, row count, clipping and positions remain authoritative.

Mono line geometry is retained at a local origin and translated on the GPU.
Moving a line to another row reuses its triangles and glyph pixels. Clip/bounds
and translation are draw metadata; JavaScript does not rewrite each vertex.
Fontstash's integer advance rounding accumulated visible drift across long mono
lines. SDK 1.3.6 extends the fix to every font: four uniquely anchored build
transformations store full floating-point advances and retain fractional glyph
and kerning accumulation in both measurement and drawing. This supersedes the
earlier mono-only nearest-tenth fix. Pinned upstream files remain unchanged;
the generated manifest records the transformation count. SDK tests compare long
`i`/`W`/digit/space runs against the TTF metrics and proportional labels against
Chrome, with Range disabled for intrinsic-label wrapping regressions.

Updates are driven by actual DOM mutations/input with a settling recheck. The
idle terminal submits no new GPU frames. The existing bounds on textures,
prepared scenes and native buffers apply; large terminal geometry uses the
uncached native upload path without creating another device.

## Build and tests

```sh
npm run build:nanovg
python3 tools/nanovg/terminal-device.py build
npm run test:nanovg
npm run test:nanovg:ui
npm run test:nanovg:terminal
npm run test:nanovg:vulkan
NANOVG_VISUAL_DIR=build/nanovg/terminal-visual npm run test:nanovg:vulkan
npm test
npm run test:ui
```

The separate browser preview is `app/nanovg-terminal.html?demo=1`.
The finite console activation package is `dist/nanovg-terminal-trial.civapp`,
with its matching staged-JS source. The builder validates every dependency,
packages the current sources, and reads back the fresh package before sending.
This package is sent through the existing raw receiver and is never installed.

```sh
# Start only from a fresh process with the existing resident launcher/terminal idle.
python3 tools/nanovg/terminal-device.py start SWITCH_IP
python3 tools/nanovg/terminal-device.py status SWITCH_IP
# After the six automatic roundtrips finish:
python3 tools/nanovg/terminal-device.py extract SWITCH_IP
# Optional explicit teardown; restart is still required for visible Gameface return.
python3 tools/nanovg/terminal-device.py stop SWITCH_IP
```

The activation promise is explicitly awaited before installing the switch checks.
An initial attempt omitted this sequencing: the checker ran before session setup
finished. Its completed error and recovery diagnostic are preserved; no second
display was created during recovery. A regression test evaluates the actual
concatenated activation/check scripts against a deliberately delayed initializer.

## Host comparison boundaries

The eleven launcher scenes retain their existing strict comparisons. The five
shared-view scenes exercise the actual resident terminal, incoming logs, full
row rollover, three additional input roundtrips, one output canvas and cleanup.
A 1280×720 CSS viewport at 1.5 pixel density compares physical 1920×1080 output.

Dense white terminal text exposes STB-versus-Chrome font coverage differences.
Raw errors are retained in `build/nanovg/terminal-visual/report.json`; the worst
mean error is about 3.77/255 and raw pixel mismatch above 32 levels about 2.82%.
Acceptance uses a two-pixel monochrome font-edge mask in both directions, less
than 0.25% error outside that mask, and **over 99%** text-ink recall/precision.
This checks layout, missing/extra text and backgrounds without claiming identical
font rasterization. Observed minimum recall is 99.984%, precision 100%, and maximum
error outside the edge mask 0.015%. The original launcher tolerances are unchanged.

Actual host Vulkan execution independently checks all eleven launcher scenes and
all five shared-view scenes plus their relocated-cache cases. Across the shared
scenes, all 49,766,400 channels differ from the WebGL oracle by at most one level;
live ordered draw/triangle bins agree with the independent CPU oracle. These are
host correctness checks, not Switch timing or Gameface framebuffer screenshots.

## Switch 2 qualification, 2026-11-11–12

The corrected activation completed from a fresh Civ VII process without recovery.
The same handheld Switch 2, Boost off, resident 0.4.3 and compatibility module
`cf649bbd` rendered at 1920×1080. Six automated real-core roundtrips passed,
followed by two more after a live text-layout correction. All eight kept exactly
the same Vulkan device and swapchain. Every cycle verified a teal launcher border
pixel, 22 white text-ink samples in a 64-point terminal glyph probe, newly logged
text, row/column bounds, stopped launcher/FTP in terminal mode and available RPC
and raw services. Two rollover checks retained exactly 37 rows and at most 146
columns. Initial cycles reused 38 geometry commands with one miss for a new log
line; the final repeated payloads reused all 39 commands with zero misses.

The user confirmed: “Both screens switch correctly; terminal is readable.”
The RAM prototype remains active for manual use: **B/A returns to Launcher;
Minus opens Terminal**. The current terminal, resident core and resident manager
source files are byte-identical to their original repository versions. No new
component was installed or boot file replaced. Restarting Civ VII restores the
installed configuration. Session close/lease cleanup is host-tested; this native
session was deliberately left active rather than attempting Gameface return.

Switch timings include resident transitions, source/layout preparation and the
25 ms watcher/polling checks; they are not frame-render or physical-input latency
measurements. Warm terminal returns were generally tens of milliseconds and warm
launcher mounts hundreds of milliseconds; the first unseen launcher scene took
about a second. This terminal trial preserves stock refresh and does not repeat
the earlier 120 Hz throughput qualification. No sustained log-flood throughput or
arbitrary Gameface child-app handoff is qualified.

The console FTP listener on port 5000 remained reachable and rejected anonymous
login under the user's existing authentication settings. No authenticated console
listing/transfer was attempted. Existing host FTP integration checks passed.

### Follow-up text-layout correction

The user reported right alignment, inconsistent detail-panel padding and early
truncation. A real-device probe recorded the actual inline/computed styles and
text commands across Launcher, Options and Menu. The fallback clipped text to the
full element rectangle and applied ellipsis after alignment. The corrected path:

- Uses the padded/bordered content box consistently for wrapping and clipping.
- Fits ellipsis before positioning right/centered text, with one CSS pixel of
  width allowance to avoid rounding-related premature shortening.
- Anchors a rightmost `space-between` value to its actual content edge.
- Converts `rem`/`em` font sizes and unitless line height using the actual computed
  root/element font sizes; long `break-word` content can wrap inside its box.

The measured Options description clip became `[732,174,1248,592.5]` inside its
`[690,150,1290,616.5]` outer rectangle: 42 native pixels on each horizontal side
for its 28 CSS pixel padding. The Menu description has the same horizontal inset.
The user then confirmed: “Alignment, padding and truncation look correct now.”
The browser no-Range text-ink recall improved to about 99.65%, with unchanged
launcher acceptance limits. The final two real-core roundtrips passed afterward.

Evidence is `investigation/evidence/nanovg-terminal-results.json` and its transfer
log, `nanovg-terminal-qualification.json`, clean activation markers/identity,
`nanovg-text-layout-before.json`, `nanovg-text-layout-after.json` and the live scene
correction identity. The clean activation used the recorded base package, and the
scene module was then updated in RAM without changing the native owner; the final
package contains that exact corrected scene module. The initial ordering failure,
recovery diagnostic and recovered-run report remain separate historical evidence.

All 19 prototype/core/native/package/session checks pass; 11 core/session checks
also pass under `--jitless`. The 11 launcher comparisons, five shared-view
comparisons, actual Vulkan comparisons, 92 existing JavaScript checks, 60 Python
checks (including real-client host FTP), and normal Chrome lifecycle checks pass.
Fresh normal/prototype/terminal-trial packages build and validate. These results
qualify the tested native launcher/terminal path, not every homebrew app or visible
return to Gameface, so the default terminal remains unchanged.

The later user-authorized [main component installation and Hello update](nanovg-main-install.md)
qualified persistent native startup and a cooperative child app separately from
this original RAM-only trial. It records the installed version and remaining
app-launch policy limits.

## Fractional proportional text update, 2026-11-13 (host validation)

Launcher 0.4.3-nanovg.14 and Hello pin SDK 1.3.6. The shared fractional-advance
fix above covers regular/bold labels as well as terminal text. Fallback wrapping
and horizontal text clips now share ellipsis's one-CSS-pixel edge tolerance.
The app-name bubble's explicit content cap also rises from 206px to 216px
(260px including padding): `Hello CivHomebrew` measures 211.76px in the bundled
24px Roboto face and exceeded the old cap even with correct font advances.
Longer names still ellipsize. The Hello browser regression checks that exact
selected title with DOM Range disabled, then exercises the real app handoff.

The SDK's host font checks compare against independent TTF metrics and Chrome.
Browser and host GPU results do not establish console appearance for this new
release. A matching Launcher installation plus Civ VII restart is required to
activate these renderer bytes; app bundles preserve the resident native owner.
