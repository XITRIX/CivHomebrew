# Manual release workflow

After pushing `.github/workflows/release.yml` to the default branch, open the
repository's **Actions → Release CivHomebrew → Run workflow**. Choose the source
branch and enter a stable version such as `1.3.0` or `v1.3.0`. The workflow creates
tag `v1.3.0` at the selected run's exact commit and publishes a GitHub release.
No Switch connection or extra release secret is needed; it uses `GITHUB_TOKEN`
with `contents: write`. The workflow runs only on manual dispatch.

The entered version must exceed the current latest stable release. Prerelease
and build suffixes are rejected because app discovery uses GitHub's stable latest
release. Existing tags/releases are never overwritten. Concurrent release runs
are serialized, and a new latest release appearing during build/upload stops
publication. Source manifests and version constants are not committed or changed
by CI; versions are passed as build/package overrides.

## CivHomebrew artifacts and component versions

The workflow validates and downloads the previous latest release's complete
component snapshot. Unchanged component source retains its previous version;
changed source receives the new input version. For example, a `1.3.0` release can
retain core `1.2.0` while advancing the launcher to `1.3.0`. It always publishes
both target images, so users can update directly from `1.0.0` without installing
intermediate releases. On the first release, or when migrating a legacy release
without a component manifest, both components receive the input version. A
release that already declares a component snapshot must contain all three valid
files; corrupt/incomplete snapshots are rejected rather than silently discarded.

Release assets:

- `civhomebrew-release.json`: complete target versions and source checksums.
- `core.civupdate` and `launcher.civupdate`: matching component images.
- `payload-menu.js`: boot payload for PC-assisted installation.
- `hello.civapp`: sample app with version and update URL set for this release.
- `package_payload.py`: reusable standalone packager.
- `SHA256SUMS`: checksums for the files above.

Release 1.3.8 bundles the SDK in the finite PC installer so it starts directly
from Gezine's receiver. X-menu app updates avoid redundant package serialization;
the core and native Launcher drain the view before installation and restore it
afterward. Both components must be updated, followed by a full Civ VII restart.
The renderer SDK remains 1.3.6 and Moonlight 0.1.4 remains compatible. These fixes
are host/browser validated; physical-console update qualification is pending.

Release 1.3.7 corrects the 1.3.6 packaging regression: `launcher.civupdate`
and the launcher seed in `payload-menu.js` now both contain the persistent
native Launcher and pinned SDK renderer. The 1.3.6 workflow packaged the
DOM-only Launcher, which could pass package validation but could not launch
current native apps such as Moonlight. No Moonlight app update is needed for
this correction. The renderer SDK remains 1.3.6.

Normal builds, companion launches and installer seeds use the native Launcher.
The low-level `tools/payload_menu.py build --dom-launcher` command retains
the legacy DOM shell explicitly for recovery/testing.
Both release source comparison and final packaging select the native builder.
The updater artifact check evaluates the actual published Launcher, verifies
the sample app's native UI requirements and compares both boot seeds with
the component images. CI also runs its native browser lifecycle checks against
`dist/launcher.civupdate`.

The README's permanent installation builds a separate content-addressed
bootstrap. Its installer service and generated startup reader must also accept
the native bootstrap size (about 1.9 MiB, within the 4 MiB bound). Host tests use
the actual generated payload to cover both paths. These PC installer sources
are obtained by cloning/updating this repository; they are not replaced by a
Launcher-only on-console update.

The job builds the artifacts, passes them through the app's actual GitHub release
provider/package codecs, then runs host tests, real-client FTP tests and Chrome
lifecycle checks. It also retains a versioned workflow artifact archive.

The release job also downloads the checksum-pinned Moonlight release declared in
`tests/fixtures/moonlight-release.json`. `npm run test:moonlight -- PATH` stages
the actual permanent installer's component images, boots its native payload,
installs Moonlight through the FTP virtual-filesystem endpoint, verifies every
extracted script and runs two controller-equivalent Start/A → Hosts → B → Launcher
cycles each for a fresh installation and an upgrade from the 1.3.6 DOM Launcher.
The browser uses the SDK's software shader oracle and mocked file/network
adapters; this does not qualify physical installation, streaming or video/audio.

App browser tests share a launcher with complete DevTools port-file validation,
bounded startup waits, exit/signal/stderr diagnostics and drained process cleanup.
Linux CI opts into `CHROME_NO_SANDBOX=1` on its disposable runner; developer
machines retain the normal sandbox by default. The SDK's pinned helpers remain
unchanged. Locale regression tests also build identical UTF-8 component sources
with Python's UTF-8 mode and locale coercion disabled.

Publication creates a **draft** release, uploads every asset, verifies the remote
names, sizes and GitHub-provided digests, and only then publishes it as **Latest**.
If upload or verification fails, the draft remains unpublished and app discovery
cannot select the partial release. Inspect/delete that failed draft and its tag
if one exists before rerunning with the same version; the workflow does not
clobber existing releases.

See [system update behavior](system-updates.md) for installation, independent
component comparisons, automatic launcher reload and the core restart blocker.
The runtime and recovery core are unchanged by the CI work.

## Moonlight

The Moonlight repository has a matching **Release Moonlight** manual workflow.
It bootstraps the pinned Emscripten/dependency revisions, rebuilds the streaming
runtime, packages the entered app version, runs host/runtime/package/browser
checks and publishes `moonlight.civapp`, `package_payload.py` and `SHA256SUMS`.
Its update URL uses the workflow's repository, including forks. A normal release
is ready for **X Menu → Check app updates**; CivHomebrew itself uses
**Y Options → Check for updates**. Console discovery accesses public releases.

## Local verification

```sh
npm run test:release
```

The helper tests mock GitHub operations; they never create a release. The CI helper
is `tools/release_ci.py`, with `prepare`, `build` and `publish` commands. It is a
PC/CI tool, separate from the standalone `package_payload.py`. Do not call its
`publish` command as a local build check.

Workflow syntax is checked with [actionlint](https://github.com/rhysd/actionlint).
GitHub documents [manual dispatch inputs](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_dispatchinputs)
and the [release CLI](https://cli.github.com/manual/gh_release_create).
