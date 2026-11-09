# App updates

An application opts into **X Menu → Check app updates** through its source
`payload.json`. Repackage and reinstall the app after adding the declaration:

```json
{
  "id": "my-app",
  "name": "My App",
  "release": "1.2.0",
  "extensions": {
    "updates": {
      "schema": 1,
      "releasesUrl": "https://github.com/owner/repository/releases/latest",
      "asset": "my-app.civapp"
    }
  },
  "scripts": ["app.js"],
  "icon": null
}
```

`asset` is optional. Without it, the latest release must have exactly one uploaded
`.civapp` attachment. A named asset must match exactly. Public GitHub repositories
are supported; there are no account tokens, private-repository logins or background
polling. Missing or unsupported declarations leave the menu unchanged.

The installed version is `metadata.release`, never the distribution-format
`version: 1`. Both versions must be valid SemVer, with an optional lowercase `v`
prefix. Numeric components compare numerically; prerelease precedence and build
metadata follow [SemVer 2.0.0](https://semver.org/spec/v2.0.0.html). The provider
uses GitHub's stable `GET /repos/{owner}/{repo}/releases/latest` response and skips
drafts/prereleases. Release titles, dates and filenames do not determine versions.
Information and update dialogs display valid versions consistently with a `v`
prefix (`v1.2.0`), preserving any prerelease/build suffix. Stored versions are not
rewritten for presentation.

A verified newer release offers **Cancel / Update**, with Cancel selected. Equal,
older, unrecognized and failed release lookups display **Latest version installed**
as requested. The coordinator retains a separate result reason (`equal`, `older`,
`unverified`) and bounds diagnostic text. That message for an unverified result
does not establish that a successful online comparison occurred.

After confirmation, the launcher downloads the complete package into bounded
memory, checks its byte count and the asset's SHA-256 digest when supplied, then
validates `.civapp` structure, matching app ID, and package/release version agreement.
It rechecks the original catalog checksum immediately before synchronously entering
the existing serialized `api.submit` installer. A changed app or busy installer
rejects rather than replacing an unexpected version. Download/validation/install
failures after confirmation show **Update failed**. No downloaded app script is
evaluated by checking, validation or installation.

Cancel is available while checking/downloading. Closing the drawer cancels its
owned request; generation tokens prevent late results from opening stale dialogs.
Launcher unload cancels and awaits owned network cleanup. The app-store lock is
never held across networking. Once the existing core installer accepts the update,
it owns completion and the launcher shows the existing installation progress.
Cancelling UI cannot interrupt that accepted write.

## Module ownership

| Module | Responsibility |
| --- | --- |
| `app-metadata.js` | Generic bounded extension preservation, in the replaceable core |
| `versions.js` | Pure SemVer parsing/comparison |
| `http.js` | Shared bounded HTTP framing, HTTPS URLs, redirects and request lifetime |
| `dns.js` | Pure bounded DNS A query/response codec |
| `platform/https-native.js` | Native nonblocking DNS, TCP and verified TLS |
| `sha256.js` | Binary digest verification, yielding every 64 KiB |
| `github-releases.js` | GitHub declaration, release and asset resolution |
| `app-updates.js` | Check/confirm/install coordination through existing app APIs |
| `app-menu.js` | Conditional menu item and dialogs, using the working span labels |

The metadata codec accepts optional `metadata.extensions` objects up to 16 KiB,
eight nested levels and 2,048 values. It preserves unknown extensions while
rejecting unsupported value types and unsafe keys. JavaScript and the standalone
Python packager enforce matching limits. No GitHub policy lives in the codec,
resident coordinator or recovery shell.

The stable boot's old metadata normalizer remains its compatibility fallback.
The replaceable core loads `app-metadata.js` before storage and overrides that
normalizer as its authoritative app-format policy, just as storage already
installs its store primitives. The direct-loader installer also includes the
codec. Existing packages retain their previous shape when no extensions exist.
Old cores discard these optional fields, so existing consoles need one core
update and restart before repackaged apps can retain update declarations.
The boot trigger and stable native bridge do not need modification.

The regular `.civapp` v1 and companion protocol 1 remain unchanged. An update uses
the same validation and clean replacement behavior as a manual install. The old
folder is retired and removed before extraction; there is no automatic app rollback
after write failure or power loss. App-owned saves outside the installation folder
are untouched. This feature does not update CivHomebrew's own system components.

## Network contract and evidence

Only HTTPS on port 443 is accepted. GitHub downloads permit verified redirects
only through the provider's GitHub/API/release-CDN host list, up to five redirects.
The transport sends a User-Agent, requests identity encoding, supports bounded
Content-Length, chunked and close-delimited bodies, and rejects duplicate/conflicting
framing, truncated bodies and compressed responses. Metadata is capped at 1 MiB;
packages at 12 MiB. Requests have total deadlines, cancellation and event-loop yields.
The browser preview has its own streaming fetch backend; its CORS/redirect support
does not establish native behavior.

The native adapter reuses the verified 64-byte SSL context/connection ABI and
read/write/socket patterns. It sets the actual DNS hostname as both TLS hostname
and HTTP Host, explicitly enables and rereads PeerCa + HostName + DateCheck (mask
7), and uses the system CA trust. It does not import a Sunshine identity, pin a
public leaf, disable verification or weaken cipher policy.

DNS reads the console's configured resolvers through the verified SDK
`nn::nifm::GetCurrentIpConfigInfo(InAddr*, InAddr*, InAddr*, InAddr*, InAddr*)`
export. It uses nonblocking connected UDP with random transaction IDs, validates
the question and compressed records, and follows bounded aliases. It caches
successful addresses for at most 60 seconds. IPv4 is supported; truncated DNS
responses fail safely rather than entering a blocking resolver or TCP fallback.
No public DNS provider or PC proxy is configured by this feature.

ABI references: [libnx SSL declarations](https://github.com/switchbrew/libnx/blob/master/nx/include/switch/services/ssl.h),
[libnx network configuration declarations](https://github.com/switchbrew/libnx/blob/master/nx/include/switch/services/nifm.h).
The SDK export names were independently enumerated with a finite read-only console
probe. SSL object sizes and I/O signatures come from the existing verified native
network adapter. GitHub API/asset behavior follows its
[release API](https://docs.github.com/en/rest/releases/releases#get-the-latest-release)
and [asset download API](https://docs.github.com/en/rest/releases/assets#get-a-release-asset).

Host checks cover metadata round trips, SemVer, HTTP framing/redirects, DNS bounds,
independent SHA-256 vectors, cancellation, stale selection, and failed package
identity/version/size/digest checks before installation. Real FTP checks preserve
extensions through the existing installer. Chrome checks exercise opt-in visibility,
Cancel, pending-request cancellation, invalid packages, successful replacement,
and equal/unverifiable versions.

On `192.168.211.39`, finite read-only probes fetched GitHub release JSON and
downloaded the public jq `sha256sum.txt` asset through GitHub's redirect, verifying
2,302 bytes against digest `dc86824a41c165ece971ff691aff6e08bbfe6e1d1f531688b47ee78c283a85cd`.
Markers: `CIV_UPDATER_HTTPS_OK`, `CIV_UPDATE_DOWNLOAD_OK`,
`CIV_UPDATE_TLS_REJECTION_OK`, `CIV_UPDATE_CANCEL_OK`, each with clean payload
completion. A mismatched-host certificate was rejected and cancellation completed.
These probes installed no downloaded content and restored the launcher. Actual
app replacement through the new updater on a console remains separately untested.
