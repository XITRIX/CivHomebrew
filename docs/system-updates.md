# CivHomebrew updates

**Y Options → Check for updates** uses the same GitHub HTTPS transport, SemVer
comparison, Cancel-first confirmation and validation rules as app updates. After
a newer compatible set is found, Options displays **Update available**. Apps use
the same saved-label behavior in **X Menu**. Selecting either label always checks
the latest release again; saved status never authorizes an installation.

Availability hints are launcher-owned under
`save:/civhomebrew/update-status-{0,1}.json`, with checksummed alternating generations
and verified writes. App hints are bound to the installed manifest checksum;
CivHomebrew hints are bound to the current component versions, hashes and pending
state. A new installation or different component set invalidates the old label.
Verified equal/older targets clear it; failed or unverifiable checks preserve the
last known hint while showing **Latest version installed**, following the requested
lookup rules. There is no background polling. Corrupt status files are preserved
and do not block checking or installing updates.

## Publish a complete release snapshot

A GitHub tag identifies a product release, not a shared module version. Every
stable release in `XITRIX/CivHomebrew` must include these three assets:

- `civhomebrew-release.json`
- `core.civupdate`
- `launcher.civupdate`

The release manifest always declares **both** target components, including an
unchanged component. For example, release `1.3.0` can contain:

```json
{
  "format": "civhomebrew-release",
  "version": 1,
  "release": "1.3.0",
  "components": {
    "core": {
      "release": "1.2.0",
      "asset": "core.civupdate",
      "checksum": "12345678"
    },
    "launcher": {
      "release": "1.3.0",
      "asset": "launcher.civupdate",
      "checksum": "87654321"
    }
  }
}
```

The example checksums are illustrative; the builder calculates the real hashes.
A user on core/launcher `1.0.0` installs core `1.2.0` and launcher `1.3.0`. A user
on core/launcher `1.2.0` installs only launcher `1.3.0`. No intermediate release
lookup is needed. Missing, duplicate or inconsistent assets fail verification;
the updater never assumes an omitted core means the installed one is compatible.

Build a release with independently versioned components:

```sh
python3 -B tools/payload_menu.py build --release 1.3.0 \
  --core-release 1.2.0 --launcher-release 1.3.0
```

The overall version must agree with the GitHub release tag. Each `.civupdate` has
its own component version and source checksum, which must agree with the manifest.
Upload all three generated assets to that release. Keep an unchanged component's
source and version unchanged. Default `npm run build` uses the checkout's release
version for both components; explicit flags control publication versions.

## Installation and restart

Checking downloads bounded GitHub metadata and the release manifest (at most
64 KiB). Each target component is compared against the installed component's own
version and source checksum. Changed code requires a newer component version;
the updater does not downgrade a component or replace different code using the
same version. Unknown versions produce **Latest version installed**.

After confirmation, only changed components are downloaded. Every required asset
must pass HTTP status, exact byte count, optional GitHub SHA-256, `.civupdate`
structure, component identity, component version and manifest source-checksum
checks before any staging starts. The installed snapshot is checked again before
entering the existing serialized component installer. Checking/downloading is
cancellable; accepted staging owns completion.

A launcher-only update invokes the existing reload callback automatically. If core
code changes, core is staged first, then launcher; neither is activated live. A
blocking **Restart required** screen tells the user to close Civ VII completely,
restart it and open Load Game. The blocker also appears after a launcher remount
while an unattempted core is pending. Boot trials recognize their executing pending
slot, so a successful fresh start does not show a stale restart blocker.

The existing two-slot component store retains its trial/acknowledgement/rollback
behavior. Staging two components is sequential, not a cross-component atomic
transaction. If the core stages but a later component write fails, the blocker
reports the partial failure and requires a full restart; recovery/PC services stay
available. Power-loss and component-recovery behavior remains the existing store's
contract. The stable core's deliberate recovery controls remain accessible.

All new policy, saved status and UI live in replaceable launcher modules:
`update-status.js`, `system-updates.js` and `system-update-ui.js`, with shared GitHub
release resolution in `github-releases.js`. Component installation still goes
through `api.submit`; boot, resident core, native bridge and companion protocol
are unchanged by this feature.
