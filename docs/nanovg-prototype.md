# NanoVG / Vulkan launcher prototype

## Shared renderer source

Renderer sources and native dependencies now live in the versioned
`civapps-native-ui` library. See [current integration](shared-native-ui.md).
Paths and commands below describe the original qualification work.

This is an **opt-in, Switch 2 prototype**, separate from the normal launcher.
The existing launcher DOM and input state machines remain mounted. Its measured
layout becomes retained NanoVG commands; the actual upstream NanoVG C core runs
as plain JavaScript. Vulkan compute bins and rasterizes that geometry, samples
font/image atlases and composites the screen. A fullscreen graphics triangle
presents the cached RGBA output through an independently owned 1920×1080 display.
There is no PC renderer, WebGL dependency on console, Wasm, Worker, executable
injection, or software full-screen pixel painter in the console path.

## Build and preview

```sh
npm run build:nanovg
npm run preview
```

Open `http://127.0.0.1:8001/nanovg.html?demo=1`. This is a **browser preview**,
using WebGL2 to execute the shared pixel algorithm. The console backend instead
uses the generated SPIR-V and checked native Vulkan calls.

Build requirements: Python 3, Node 22+, Emscripten **3.1.74**, and
`glslangValidator`. The default SDK path reuses the existing sibling
`NS2-experiments/toolchains/emsdk`; set `CIV_EMSDK` for another activated copy.
NanoVG sources, fonts and license notices are vendored and SHA-256 pinned, so
builds do not download dependencies. The generated artifact manifest is
`build/nanovg/manifest.json`.

`dist/launcher-nanovg.civupdate` is the separate launcher component. The packager
checks every dependency path, reads back the exact fresh output and checks its
checksum, and leaves `app/app.js` last so evaluating the component returns the
launcher factory. `npm run build` continues to produce the normal components.
Prototype activation is captured per component evaluation, so a later normal
launcher does not accidentally inherit the flag.

For an explicitly chosen console trial, the existing companion accepts the
component through its established update path:

```sh
python3 tools/payload_menu.py update SWITCH_IP launcher \
  --source dist/launcher-nanovg.js --release 0.4.3-nanovg.1
```

The `.js` source and `.civupdate` are produced together. Console qualification
uses the separate RAM-only benchmark below. No prototype component was installed,
and the console test did not change the boot trigger or app/save files.

## CPU, GPU and retained work

* Gameface supplies element rectangles, scrolling, colors, clipping and text.
  Its text `Range` boxes preserve actual line breaks when available. A NanoVG
  measurement/wrapping fallback works without `document.createRange`.
* JavaScript performs input/state updates and snapshots only after invalidation,
  with one layout-settling recheck. A static scene submits no extra GPU work.
  Optional `MutationObserver` helps in browsers; explicit launcher/layout hooks
  also invalidate the UI without it. No full DOM polling interval is added.
* Text line geometry is cached by text node and layout/style signature in a
  `WeakMap`. Font measurements are bounded. Unchanged NanoVG commands reuse
  geometry in a 16 MiB / 2,048-entry LRU cache.
* Fonts, glyph pixels and PNG controller/app artwork persist. Retired font
  atlases remain valid for cached geometry within a bounded 16 MiB texture
  budget. RGBA packing happens only when texture generation changes, and native
  atlas bytes upload only on those changes. Stable GPU section addresses avoid
  relocating the atlas when draw counts change.
* `bin.comp` generates ordered 32×32 tile lists on the GPU. Each tile retains ordered draw records and only triangles whose bounds touch
  it (128 draws / 512 triangles per tile). Opaque solid interiors remove fully
  hidden earlier draws. An overflow is a hard error checked after completion
  and before publication, rather than silently truncated.
* `raster.comp` handles NanoVG fill winding (including holes), antialiased fringe
  geometry, bilinear font/image sampling, clip rectangles and source-over
  composition. JavaScript does not loop over screen pixels.
* Managed selector states use a launcher-owned key including content revision,
  selection, scroll and viewport. This avoids Gameface's expensive `innerHTML`
  serialization on warm navigation. Dynamic overlays use a bounded DOM snapshot
  cache. Resize, scroll, image/font completion and explicit layout reset clear
  snapshots. New snapshots are deferred until computed display/focus styles
  agree with inline state; Gameface does not flush these on a rectangle read.
* A 64-entry / 8 MiB prepared-scene LRU holds immutable compact geometry. A
  reusable CPU packet arena retains packed atlases. Eight native slots retain
  geometry and GPU tile lists; warm switches write only the 64-byte header.
  Geometry over 512 KiB falls back to the uncached path. The input/atlas buffer
  is 32 MiB, output is 8,294,400 bytes, and eight tile-list slots occupy
  58,556,164 bytes: approximately 95.75 MiB combined, excluding driver objects,
  swapchain images, the 32 MiB compiled core and JavaScript caches.
* Native compute and graphics command buffers, descriptors, shaders, buffers,
  device and display are created once. Compute fences establish completion
  before buffer reuse. New bins and rasterization share one checked submission.
  Valid retained bins let full rasterization and graphics presentation share a
  submission, with queue completion before the next host write. There is no
  extra CPU fence on this warm path. Failures quarantine owners rather than freeing memory
  potentially still in use.

Rasterization is deliberately a correctness-oriented compute backend. A GPU
pixel can still examine several triangles; 120 FPS animation is **not** implied
by using compute. A future graphics/stencil backend may outperform this for
frequently changing scenes. Path tessellation, uncached glyph generation and
layout remain CPU/JavaScript work.

## Automated comparisons

```sh
npm run test:nanovg
# Generic core/native tests now run with npm test in CivHomebrew-SDK.
npm run test:nanovg:ui
npm run test:nanovg:vulkan
npm test
npm run test:ui
```

The finite console benchmark is built and inspected afresh before launch:

```sh
python3 tools/nanovg/device.py build
python3 tools/nanovg/device.py run SWITCH_IP
python3 tools/nanovg/device.py status SWITCH_IP
# Only after it finishes and the resident core is idle:
python3 tools/nanovg/device.py extract SWITCH_IP
```

It uses management `run-source`, without installation, to mount the actual
launcher with the installed catalog and read-only app data, plus neutral disabled
FTP settings. It shows original Gameface, measures cached presentation, full
redraw and navigation at 1080p60 and confirmed 1080p120, restores refresh, and
stops. Extraction transfers the bounded RAM record in short ASCII log chunks.
The display remains retained and requires a game restart to return visibly.

The UI suite saves DOM reference PNGs, NanoVG PNGs, visual difference images,
actual geometry/atlas packets, browser RGBA output and independent CPU tile lists
under `build/nanovg/visual/`. It covers selection, scrolling, Options, FTP,
app-menu/Information, 720p layout scaled to 1080p, missing text Range, missing
MutationObserver, unchanged-frame suppression and cleanup. Its guards bound both
the fraction of pixels differing by more than 32 levels and the mean maximum
channel error (2.5% of pixels above 32 levels, mean below 3/255), plus at least
95% expected-text ink recall within a two-pixel edge tolerance. These tolerate
font rasterizer edge differences; they do not assert pixel identity to Gameface.

The prototype explicitly loads the same bundled **Roboto** font into the DOM and
NanoVG for a controlled comparison. It does **not** contain Civ VII's BodyFont
or prove reproduction of its CJK/emoji fallback families. True BodyFont matching
needs usable original font bytes or an established shared rendered-text path.
CSS font loading and the fallback DOM APIs still need checking in Gameface.

The host Vulkan suite executes the **actual bin and raster SPIR-V** on MoltenVK
(or a configured host Vulkan runtime), compares every output color channel with
the browser shader and compares GPU tile lists byte for byte with the independent
CPU bin oracle. It also compiles LP64 offset assertions against Khronos headers
for the manually encoded native structures. On macOS it uses the existing
Homebrew `vulkan-headers` and `molten-vk`; override `VULKAN_INCLUDE` and
`VULKAN_LIB` when needed.

This is host GPU/ABI evidence, not Switch driver, VI presentation, optical scanout
or console performance evidence. The native-call fixtures separately cover
six-argument limits, per-image presentation ownership, fence timeouts,
quarantine and bin-overflow rejection.

## Recorded local results, 2026-11-11

* Nine prototype unit/package/native-call tests passed, plus the actual core tests
  under Node `--jitless`, with Wasm, Workers and base64 browser helpers absent.
* All eleven font-controlled browser scenes passed. Worst mean maximum channel
  error was 2.45/255; at most 2.31% of pixels differed by more than 32 levels.
  Minimum text-ink recall was 96.64% with the documented two-pixel tolerance.
* Actual Vulkan bin/raster SPIR-V executed on Apple M1 Max via MoltenVK for all
  eleven scenes. All 91,238,400 output channels differed from the browser shader
  by at most one level; every GPU tile list matched the independent CPU oracle
  exactly. These values are correctness comparisons, not Switch timings.
* The existing 92 JavaScript tests, 60 Python tests (including real-client FTP),
  and standard Chrome launcher/lifecycle regression passed. Local sandbox socket
  restrictions required running the FTP/browser/GPU checks outside the sandbox.
* Fresh normal components and the separate NanoVG launcher component built and
  inspected successfully. These initial results preceded console qualification.

Skill reference links and evidence hashes also passed validation. The optional
full skill YAML validator was unavailable in system Python because PyYAML is not
installed; this does not affect the application build or runtime tests.

## Initial Switch 2 baseline, 2026-11-11

User-confirmed handheld, Boost off; Civ VII cartridge 1.0.0, resident 0.4.3,
nnCompat `cf649bbd`. The user confirmed the native UI appeared and looked close
to Gameface. This is visual confirmation, **not** a pixel-perfect console image
comparison: no Gameface framebuffer screenshot/export API was established.

The final RAM-only run completed in 36.861 seconds with no runtime/cleanup error.
The original Gameface viewport stayed 1280×720, while the owned native display
and compute framebuffer were 1920×1080. The measured results are:

| Check | Result | Evidence boundary |
| --- | --- | --- |
| Original Gameface animation callbacks | Mean 16.664 ms, approximately 60 callbacks/s | RAF cadence, not an optical presentation measurement |
| Original Gameface injected input + synchronous layout | Mean 0.581 ms; median 0.478 ms | CPU event/layout only; excludes Gameface GPU rendering and physical input latency |
| NanoVG cold initialization through first frame | 2,503.9 ms | Includes core/fonts, native setup, initial geometry and first frame |
| Cached native presentation, 60 Hz | 120 frames in 1,988.0 ms; 60.36 FPS | Reuses existing GPU output; no scene rebuild |
| Cached native presentation, confirmed 120 Hz | 240 frames in 1,995.6 ms; 120.26 FPS | Short presentation test, not a changing 120 FPS UI workload |
| Full GPU redraw at 60 Hz | Mean 22.25 ms; median 22.09 ms | Reuses prepared geometry but performs upload, binning, raster and presentation |
| Full GPU redraw at 120 Hz | Mean 19.29 ms; median 19.15 ms; p95 19.79 ms | Exceeds the 8.33 ms budget; approximately 52 full redraws/s by mean cost |
| Warm navigation at 120 Hz | Mean 29.93 ms; median 30.00 ms | Injected event, DOM snapshot, cached geometry, upload, GPU and presentation; not end-to-end physical input latency |
| First previously unseen selection at 60 Hz | 125.76 ms | One geometry cache miss; later selections reuse all 30 commands |

At 120 Hz the mean redraw breakdown was 1.71 ms upload, 2.23 ms bin submission/
fence, 12.04 ms raster submission/fence, and 3.30 ms presentation. These include
native bridge/wait overhead and are not pure GPU timestamp-query durations.
Full-screen compute rasterization is the largest measured redraw stage.

The first high-refresh batch was pending, at 58.03 FPS. Calling the verified
refresh controller's `measured()` read flag `0x2` and applied the layer interval
`1/120`; a second batch reached 121.01 FPS, then the main 240-frame batch reached
120.26 FPS. An accepted `set(120)` alone is insufficient. Teardown restored the
stock interval and flag `0x1`, with four confirming presents. The result's
`refreshStatus.reason` inherits the upstream helper's fallback text even on a
valid flag read; assess its non-null flag and Result 0 with the recorded events.

Two preceding attempts are retained: a completed JavaScript factory-export
failure before any Vulkan allocation, and a visible native run whose nominal
120 Hz label actually remained at 60 FPS because the confirmation call was
missing. They are not promoted as successful 120 Hz qualification.

Gameface reported `document.createRange` undefined, MutationObserver available,
and no `document.fonts.load`. The renderer therefore used its fallback text
layout. The native font-family declaration became visible in computed styles
after settling, but that does not prove the DOM loaded the exact bundled font.
NanoVG itself renders from the bundled TTF and the user confirmed appearance.

Baseline evidence: `investigation/evidence/nanovg-console-baseline.json` and matching
bounded transfer log, with `nanovg-console-baseline-qualification.json`; `nanovg-console-first-export-failure.*` and
`nanovg-console-first-native-pending120.*` preserve the earlier attempts.

## Optimized Switch 2 qualification, 2026-11-11

Revision 5 completed in 45.719 seconds with no runtime or cleanup errors, on the
same user-confirmed handheld Switch 2, Boost off, nnCompat `cf649bbd`, resident
0.4.3 and console catalog of four apps. The user explicitly confirmed that both
the teal border and name bubble moved correctly across the four tiles and back.

A finite diagnostic first established an important Gameface behavior: after
input, inline selection styles and counter text update immediately, while
`getComputedStyle()` and bubble visibility still describe the previous frame.
`getBoundingClientRect()` does **not** flush those styles. After a 100 ms yield,
computed styles and snapshot geometry match the new selection. Caching an
immediate snapshot had associated the first tile's border/name with the second
tile's counter. Revision 5 defers new snapshots until inline display/focus
styles and computed styles agree; valid warm scenes bypass this layout wait.

The corrected test slowly visited 0→1→2→3→2→1→0. All seven scenes matched the
selected app/name and tile rectangle. Mapped GPU output was sampled at each
border: every new border was `[0,239,207,255]`, while each previous border
returned to its tile's background color. These are actual native output-pixel
checks, not a framebuffer screenshot comparison with Gameface. Each timed warm
navigation also required a newly rendered scene with the correct selected ID.

| Corrected check | Result |
| --- | --- |
| Cached native presentation, confirmed 120 Hz | 240 frames; 120.26 FPS |
| Full-screen raster + presentation, prepared geometry | 120 frames; 119.86 FPS; mean 8.026 ms, p95 8.346 ms |
| Warm navigation, individual updates separated by idle time | Mean 5.687 ms, median 5.612 ms, p95 6.056 ms |
| Continuous warm changing-selection run | 120 frames; 118.59 FPS including periodic event-loop yields; mean update 7.942 ms, median 8.308 ms, p95 8.354 ms, maximum 9.380 ms |
| First visits to three unseen selections | 136.12, 131.69 and 137.22 ms, including layout readiness and geometry/atlas preparation |
| Native cold initialization | 2,553.56 ms |
| Original Gameface injected input + synchronous layout | Mean 0.579 ms; excludes its GPU rendering |

Full redraws always rerun the entire pixel shader; they reuse validated geometry,
atlases and tile lists. Warm navigation also rasterizes the selected scene; it
does not replay cached full-frame images. The results reach approximately the
120 Hz presentation limit for redraws and warm selection changes, with occasional
longer frames. They do **not** establish locked 120 FPS for cold selections,
new overlays, large catalogs, sustained stress, physical input latency or optical
scanout. First-seen layout/glyph/path preparation remains interpreted JavaScript.
The benchmark warms and validates the four tested selections before timing warm
navigation; the ordinary prototype builds missing states on demand.

The high-rate flag and 1/120 interval were confirmed before sampling. Stock 60 Hz
refresh was restored and cleanup completed afterward. Native display owners
remain retained until process exit; cross-app Gameface return is still unsolved.

The optimized output is byte-identical to the previous NanoVG shader across all
11 browser reference scenes. A warm navigation roundtrip preserves every output
channel. Actual Vulkan execution validates these scenes and an additional
relocated GPU-cache slot: 99,532,800 channels differ from the WebGL oracle by at
most 1/255. Live ordered draw/triangle lists match the independent CPU bin oracle;
unused bin tails are intentionally ignored after opaque occlusion. Fourteen
prototype/core/native/package checks pass, including stale computed-style
fixtures, immutable prepared packets, cache eviction and submission ownership.
The six core checks also pass under Node `--jitless`. All 92 existing JavaScript
and 60 Python checks, real FTP and standard Chrome lifecycle checks passed.
Fresh normal and prototype packages were built and inspected.

Current evidence is `investigation/evidence/nanovg-console-results.json`, its
bounded transfer log and `nanovg-console-qualification.json` (package/source/result
hashes and user-visible confirmation). The finite diagnostic source is
`investigation/probes/nanovg-selection.js`, with `nanovg-selection-probe.json` and
matching log. Intermediate `nanovg-console-triangle-bins.*`,
`nanovg-console-gpu-scenes.*` and `nanovg-console-stale-selection.*` retain the
optimization history. Their navigation timings are **not** promoted as correct
moving-selection qualification because they preceded the stale-style fix.

## Console boundaries

The copied live-import/module discovery, private native stack and function-byte
guards come from the verified Moonlight/Doom path. Attribution and original
source hashes are in `app/src/nanovg/PROVENANCE.json`; the imported display modules
have their own source manifest and notices in `third_party/civ-vulkan/`.
The display path targets the recorded Switch 2/Civ VII 1.0.0 compatibility build
(`nnCompat` hash `cf649bbd`), and rejects other builds. It is not OLED support.

Returning to visible Gameface is still unresolved. Closing the prototype stops
its owned UI work and waits for its queue, but **retains native presentation
owners until Civ VII exits**. A failed setup or submission likewise retains the
ownership chain. The standalone launcher prototype blocks launching a Gameface child or entering
the terminal and explains the required restart. The separate opt-in
[shared native terminal trial](nanovg-terminal.md) permits resident launcher/terminal
switches by retaining one display and rendering both views with NanoVG. Do not treat
this as an established persistent renderer across apps, a reusable display after
teardown, or a fix for Moonlight's handoff.

Ordinary launcher activation keeps the existing refresh configuration. The
benchmark explicitly requests 120 Hz through the checked controller and requires
measured confirmation before recording the high-rate results. Closing waits for
refresh restoration before releasing UI work; presentation owners remain retained.
The initial baseline qualified short cached 1080p120 presentation. It did not
qualify 120 FPS full UI redraw, cross-app display ownership or restart-free
Gameface return. No device test is
automatically launched by the build or host comparison commands.

Supported launcher styling includes solid backgrounds, rounded borders,
axis-aligned PNG images, text and rectangular scrolling/clipping. CSS transforms,
shadows, gradients, grouped opacity and complex stacking/rounded descendant clips
are not a complete browser implementation. Unsupported transforms/shadows are
reported. This is a NanoVG launcher prototype, not a general HTML renderer.
