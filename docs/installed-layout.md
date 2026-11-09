# Installed app layout

The resident core owns installation and catalog publication. Both the PC
companion and launcher-owned FTP use that installer. The SDK mount is `save:/`,
so installations use:

```text
save:/civhomebrew/
├── catalog-0.json
├── catalog-1.json
└── apps/
    └── hello-civswitch/
        ├── manifest.json
        ├── icon.png
        └── scripts/
            ├── library.js
            └── app.js
```

`<application-name>` is the stable package ID. Changing the display name updates
that same app; using a different ID installs a separate app. `icon.png` is omitted
for packages with no icon. A source named `lib/library.js` becomes
`scripts/lib/library.js`. Text files are UTF-8 and artwork contains original PNG
bytes. `.civapp` remains the unchanged single-file distribution format.

The installed manifest is ordinary, readable JSON. For example:

```json
{
  "format": "civswitch-installed-app",
  "version": 1,
  "id": "hello-civswitch",
  "name": "Hello CivSwitch",
  "metadata": {"author": "", "release": "0.1.0", "description": "", "api": 1},
  "scripts": [
    {"name": "library.js", "path": "scripts/library.js", "bytes": 42, "checksum": "01234567"},
    {"name": "app.js", "path": "scripts/app.js", "bytes": 128, "checksum": "89abcdef"}
  ],
  "icon": {"path": "icon.png", "bytes": 512, "checksum": "01234567"}
}
```

Sizes/checksums in that example are illustrative. Catalog entries hold ID, name,
total installed bytes and the manifest checksum. No scripts or base64 PNG data
are included in the installed manifest/catalog. The selector reads only manifests
and PNGs. Script contents are read and checked when the app starts, preserving
source order and the final lifetime promise. Runtime image delivery still uses a
transient PNG data URL because the verified Gameface image route accepts it;
the stored image is a binary file.

## Clean replacement

1. Fully validate the incoming package, paths, case-insensitive duplicates,
   file/directory conflicts, app count and resulting quota before deleting data.
2. For an existing app, remove its catalog entry from both slots and verify those
   commits. No folder deletion occurs if this publication fails.
3. Recursively delete exactly `apps/<id>/` and commit that deletion. The native
   adapter refuses recursive deletion of `apps/`, the launcher root or other saves.
4. Recreate the app folder and necessary script subdirectories. Write scripts
   and binary PNG, commit, and read every file back.
5. Write/commit/read back `manifest.json` last, then publish the verified app in
   both catalog slots. Only then report installation success.

This deliberately retains no previous app directory. Removed scripts, old icons,
obsolete subdirectories and any app-written data in that folder are deleted on
replacement. Data that needs to survive updates must live outside the app's
installation directory under a separately owned namespace.

If extraction fails after deletion, the app remains unlisted, partial files are
removed when possible, and the caller must reinstall. Incomplete folders are
never launchable. If a final catalog write has an uncertain outcome, verified
files are retained and further mutations are blocked until restart; reloading the
catalog determines whether the new installation was committed.

The two catalog slots protect current membership metadata, not old app versions.
Both slots describe the same live folders, so catalog recovery cannot resurrect a
deleted version. Checksums detect corruption but do not authenticate packages.

## Migration from monolithic packages

On first load the store accepts catalog version 1, validates each indexed legacy
`package-N.json`, and extracts it into the new layout. Original legacy packages
and catalogs remain usable until extraction of all apps and publication of both
version-2 catalog slots succeed. Known legacy blobs are then removed. An
interrupted catalog mirror is completed on the next load before cleanup.

A failed migration keeps the original package data intact and blocks new
installs in that session. Retry with the updated menu after fixing the underlying
storage error. Migration handles package blobs referenced by either valid old
catalog; unrelated/unindexed files are not swept or deleted.

Older menu builds cannot read the new version-2 catalog. The `.civapp` schema,
PC packing format and TCP 9026/9027 protocols are unchanged. After a raw
installer completes, the menu reloads catalog metadata and refreshes changed
entries so a subsequent companion install cannot overwrite a stale index.

System component slots live separately under `save:/civhomebrew/system/`; the
FTP installation inbox is virtual and contains only its instruction placeholder.
Package drops are consumed from memory and are never retained as distribution
files. Recognized old copies under `save:/civhomebrew/inbox/` are cleaned up on
core startup. Neither changes the app manifest schema or replacement rules. See [architecture](architecture.md).
