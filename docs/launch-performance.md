# App launch performance

## Corrected Switch startup: Launcher .11 / core sdk.7

The older installed bootstrap reader yields after EOF before closing its native
file handle. The deferred metadata introduced in `.10` could therefore overlap
status reads and acknowledgement writes through the shared bootstrap system
object. A controlled Switch reproduction using the original adapter and
isolated temporary state files failed with write error `0xe02`, then the
existing uncertain-state guard. The original startup exception was not retained;
this controlled reproduction identifies the concrete race and its consequence.

The replaceable core now serializes complete public component operations on the
original `boot.system` object. This covers the bootstrap's own `ready()` confirm
as well as Launcher status reads, without changing boot files or weakening slot,
checksum, commit/readback or uncertain-state checks. Launcher `.11` keeps metadata
synchronous on older cores without the `systemSerialized` API flag.

Before installation, the same native reproduction completed all 16 confirmations
alongside 431 forced native frames with the queue, no read/write/render errors
and complete temporary-file cleanup. The corrected component sources then
cold-started in RAM through the installed bootstrap, using real acknowledgement
I/O in a separate temporary directory. Both components acknowledged normally;
the actual installed active selections and pending flags were verified unchanged.
The user confirmed D-pad, Y, Minus and Terminal return on the RAM trials.

The exact tested pair is core `0.4.3-sdk.7` (`41b62e9d`) and Launcher
`0.4.3-nanovg.11` (`e7ea71f2`), SDK 1.3.3. Three native Terminal returns measured
238–265 ms. Two each Hello, Moonlight Hosts and Doom selector Start/A/B cycles
returned in 267–300 ms. Warm returns performed zero source selections. Native
update acknowledgement and rollback also passed; all retained device/swapchain
`279476695120:279477149312`, RPC/raw services and correct FTP ownership, with no
session errors. These are bounded native UI/load/lifetime checks, not streaming,
Doom gameplay, sustained FPS or a comparison against controlled cold-cache runs.

After those checks, the exact source-pinned packages were staged in the ordinary
inactive slots and read back; old active hashes were preserved. The RAM trial
ended successfully and removed all temporary state files. No backups or trigger
changes were made. After a full normal Civ VII restart, both components acknowledged
and their active sources matched the qualified hashes. The installed Launcher
passed two Terminal returns and two controller-driven Hello launch/action/close
cycles on owner `340801167440:340794994304`, with no native errors.
Evidence: `build/startup-trial/qualification.json`, `native-state-render.json`,
`native-state-render-fixed.json`, `fixed-cold-start.json`,
`optimized-roundtrips.json`, `qualified-staging.txt` and
`final-staging-verify.txt`, `installed-cold-start.json`,
`installed-terminal.json` and `installed-hello.json`. Whole sources were never aggregated for device backups.

## Installed app refresh

All five installed apps are rebuilt from local sources. Hello, Moonlight and
Doom pin SDK 1.3.3; SW2NES borrows that running SDK without starting another
renderer. Kit Checks 0.1.1 now borrows the same view, renders status/navigation
through it and closes the lease before its lifetime resolves. Its diagnostic
bridge is unchanged. The example source and licenses are retained under
`examples/civswitch-kit/`; `npm run pack:kit` produces its ordered package.
`npm run test:nanovg:kit` covers real browser SDK first-frame/status rendering,
direct controller activation, cooperative cancellation, selected Return, repeated
launch and pending-attach teardown with bridge I/O explicitly mocked. SW2NES's
real SDK browser test passed at 540p/720p/1080p with software rendering after
two GPU-enabled Chrome launches timed out. These host checks do not qualify
console diagnostics, NES gameplay or streaming.

On the actual Switch, all five refreshed apps completed two Start/A/navigation/
return cycles each, followed by normal Launcher/FTP ownership; two Terminal
returns also passed. The retained native owner was
`340801167440:340794994304`, with no renderer errors and zero Launcher source
selections across warm returns. App first frames: Hello 639–644 ms, Moonlight
Hosts 1875–1889 ms, Doom selector 8545–8632 ms, Kit Checks 171–190 ms, SW2NES
browser 741–1144 ms. Returns measured 283–435 ms (the SW2NES measurement includes
the synthetic key release). These are bounded UI checks; Doom's selector still
has a substantial initial load. SW2NES navigation/Confirm exit used its ordinary
keyboard-to-button path, not physical Npad samples. The first test assertion
incorrectly expected “Exit” after arming exit; the app correctly rendered
“Confirm exit”. The corrected test passed. No app repair or reinstallation was
needed for that test-only mismatch.

Every installed source (100 scripts), icon and metadata record was read back
and matched to the fresh package. Evidence lives in
`../NS2-experiments/build/sdk-performance-1.3.3/installed.json` and
`all-apps-result.json`; the bounded probe is
`../NS2-experiments/investigation/probes/installed-app-roundtrips.js`.


## Launcher and shared UI startup, 2026-11-12 (host validation)

Launcher `0.4.3-nanovg.10` / core `0.4.3-sdk.6` retain the acknowledged
Launcher factory between Terminal/app returns. Revalidation of the two small
state records still detects generation, slot, hash and pending-trial changes.
Updates, rollback, raw execution, direct FTP writes and failures invalidate the
cache. The normal cold/trial source verification and first-frame acknowledgement
remain intact. Eight update metadata reads move after the first native frame;
pending-core restart protection and update actions await those reads.

`node --jitless investigation/probes/profile-launcher-startup-host.cjs` compares
normal source selection with the actual resident cache path using in-memory I/O
and a stubbed DOM/GPU mount. Five ordinary source selections read 1,552,514 bytes
and took 111–142 ms; five cached remount selections took 0.032–0.079 ms,
read only the two small state records, and performed no source hash/evaluation.
These are host CPU/control-flow measurements, not Switch startup-time estimates.
Results are saved to `build/launcher-startup-review-host.json`.

SDK 1.3.3 also removes an empty initial presentation from shared app attachment
and skips readiness checks below hidden inline `display:none` screens. A host
fixture with 1,000 stale hidden controls inspects only three visible/boundary
nodes, then correctly rejects stale styles when the hidden screen is shown.
The SDK tests assert the first shared frame uses content constructed after
`await attach()`, rather than an empty root. Source loading and integrity checks
for large apps such as Doom are unchanged; these UI changes do not remove WAD
loading or engine initialization time.

Validation includes system/resident corruption, trial, update/rollback and cache
invalidation tests; actual local FTP clients; Chrome live update/recovery; native
Launcher Terminal remounts with held metadata and cleanup; Hello Start/A returns;
Moonlight native screen/input/menu checks; and two Doom app/engine/framebuffer
roundtrips through the real resident implementation in Chrome. All consumer
packages are rebuilt with the same pinned SDK. The behavioral and timing
qualification above remains host-only.

The user subsequently requested installation without backups. Hello (2 scripts),
Moonlight (41 scripts) and Doom (47 scripts) were installed on Switch and every
source and icon was read back and checked against its fresh package. Core
`0.4.3-sdk.6` (`9c1bd5fa`) and Launcher `0.4.3-nanovg.10` (`d7489522`) were
staged through normal inactive slots, with source readback and the active hashes
preserved. No backups or trigger changes were made. Activation and console
startup/return qualification await a full Civ VII restart and Load Game.
Receipts are in NS2-experiments `build/sdk-performance-1.3.3/installed.json`,
`prepared.json` and the bounded installation/staging transfer logs.

**Cold activation failed on Switch.** The user reported an unresponsive Launcher
and Minus after restarting. A bounded raw-port diagnostic found no resident core
or boot context, no companion/FTP services, SDK 1.3.3 initialized and the native
owner retained after close. The displayed screen was a retained native frame,
not a running Launcher. Core had returned to acknowledged `sdk.4`; Launcher `.10`
remained an attempted, unacknowledged candidate. The exact initiating error was
not retained, so neither shared rendering change is established as its cause.
Browser results above do not qualify this pair for console deployment.

Recovery validated the existing `sdk.4` (`aa3676ac`) and Launcher `.8`
(`a5cbdb04`) sources, rejected only the failed Launcher trial, and verified both
working active selections with no pending components. No backups or trigger
changes were made. A full process restart is required to use those selected
components. The user restarted and confirmed physical controls work again.
Both failed package hashes
are blocked by the deployment helper. Bounded evidence is under
`build/startup-recovery/` in NS2-CivHomebrew.

## Earlier console app-source loading profile

On 2026-11-09, Switch 2 running Civ VII cartridge 1.0.0 and CivHomebrew 0.4.3
loaded the same installed Doom app (46 scripts, 25,935,101 UTF-8 source bytes):

| Measured stage | Before | After |
| --- | ---: | ---: |
| Complete finite source-loading profile | 13.151 s | 7.052 s |
| Native file reads, including decoding and yields | 7.649 s | 1.509 s |
| Existing FNV integrity checks | 4.598 s | 4.645 s |
| Script evaluation | 0.221 s | 0.218 s |

The overall profile is 46.4% shorter; reads are 80.3% shorter. Timings are single
runs on the same installation, with no storage-cache control. Codec timings are
nested in reads/validation and must not be added as independent stages.

The old native reader waited at least 10 ms after every 64 KiB, including EOF.
The updated reader retains that transfer size and native file API, but yields
with a zero-delay timer only between batches after 8 ms or four chunks. A chunk
cap bounds work even with a coarse/frozen clock. Progress, length limits, UTF-8
handling, file closure and allocation cleanup are preserved. Every script still
passes its existing size/FNV validation before evaluation; no verification cache
or new installed/package format is used. Native file writes are unchanged.

The replaceable core now carries native-buffer/native definitions and constructs
its adapter before starting services. Boot still carries a recovery bridge. This
lets the existing two-slot core updater retain the improvement without changing
the saved trigger. The candidate core was installed, started through the normal
boot payload, and its active checksum and cleared trial state verified on-device.

A separate normal launch through the resident manager reached Doom's WAD selector
in **7.647 s**, observed all three WAD buttons, awaited automatic close and returned
to CivHomebrew with FTP and both PC services running. It does not measure Doom's
subsequent WAD unpacking, gameplay or cold Civ VII/boot startup.

Validation: 92 JavaScript and 60 Python checks passed, including real local FTP
clients. Chrome lifecycle checks passed, including core updates, launcher rollback,
FTP ownership and cleanup. Fresh release artifacts were built. An additional
console FTP readback attempt could not authenticate with anonymous credentials;
no credentials/settings were changed. Console launch and core acknowledgement
probes completed with explicit markers and `Executed successfully`.

Evidence: [measurements](../investigation/app-launch-performance-2026-11-09.json).
Finite probes are `investigation/probes/profile-app-launch.js`,
`watch-app-launch.js` and `check-app-launch.js`. The profile validates all sources,
evaluates initializers in the real ordered loader, and omits the final UI lifetime.
The normal launch watcher is RAM-only and closes the selector after observing it.
