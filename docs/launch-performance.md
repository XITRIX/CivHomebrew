# App launch performance

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
