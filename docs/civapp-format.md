# `.civapp` package format · version 1

A single UTF-8 JSON distribution document. Ordered script
sources, metadata and an optional embedded PNG travel together. The extension is
`.civapp`; the suggested future MIME type is `application/vnd.civswitch.app+json`.
This is a project-local format, not an upstream CivSwitch standard.

```json
{
  "format": "civswitch-app",
  "version": 1,
  "id": "hello-civswitch",
  "name": "Hello CivSwitch",
  "metadata": {
    "author": "Your name",
    "release": "0.1.0",
    "description": "A small experiment.",
    "api": 1
  },
  "scripts": [
    {"name": "lib.js", "source": "var message = 'Hello';"},
    {"name": "app.js", "source": "(async function(){ /* own app lifecycle */ })();"}
  ],
  "icon": ""
}
```

`version` versions this file schema. `metadata.release` is the app's display
version; no semantic-version comparison or automatic update policy is applied.
`metadata.api` must be 1 (or omitted, defaulting to 1). It denotes the launcher
contract, not verified compatibility with every game/loader build.

IDs use 1–48 lowercase letters/digits/hyphens and begin with a letter or digit.
The name has 1–80 printable characters; author at most 80, release 32, and
description 500. `scripts` has 1–64 unique relative `.js` names with nonempty
source; combined UTF-8 source is at most 8 MiB. Names are canonical paths with
ASCII letters/digits/underscores/dots/slashes/hyphens: no absolute paths, empty
components, dot or dot-dot components. Installation extracts these validated paths beneath `apps/<app-id>/scripts/`;
launch reads and evaluates them in manifest order.

`icon` may be empty/omitted or `data:image/png;base64,...`. The PNG must have a
256×256 IHDR and be at most 512 KiB. The runtime checks the signature/header,
not every PNG chunk; image decoding may still fail for a corrupt image. Treat
the image as disposable. Metadata and names are displayed as text, never HTML.

The package contains executable JavaScript with the loader's full native access.
There is no sandbox, dependency manager, permission manifest, signature trust
store, or native executable support. Keep sources self-contained. A final app
promise must stay pending until cleanup finishes; asynchronous tasks started
without returning their lifetime do not satisfy the launch contract.

## Source folder manifest

`payload.json` stores metadata and an ordered list of source paths. `icon.png`
is used by convention if present; a declared icon must exist.

```json
{
  "id": "my-app",
  "name": "My App",
  "author": "Your name",
  "release": "1.0.0",
  "description": "What this app does.",
  "api": 1,
  "scripts": ["lib/core.js", "app.js"],
  "icon": "icon.png"
}
```

Run `python3 tools/payload_menu.py pack APP_FOLDER -o APP.civapp`. The packer
rejects traversal and symlinks escaping the folder. It preserves script order
and joins sources with `\n;\n` at launch. Files are JavaScript classic scripts,
not ES modules; importing via `import` would lose the native lexical context.
The packer validates package structure rather than proving runtime compatibility.

## Companion protocol 1

TCP 9027 uses one request and one response per connection. Each is a four-byte
unsigned big-endian UTF-8 JSON byte length followed by that many bytes (1–12 MiB).
No half-close is needed for this framed service. Requests have `protocol:1` and
`op`: `hello`, `list`, `install` (with `package`), `run` (with `id`), or `run-source`
(with `package`). Responses have `ok:true`, or `ok:false,error`. Run acknowledges
acceptance before handing off to the child; it does not assert successful launch
or completion. The menu also accepts the original TCP 9026 raw-JS/half-close protocol, with
streamed logs and exact original completion/error markers. It borrows the parent
listener in regular-payload mode and restores its flags on exit. The menu
serializes execution and suspends the package service during a child.


## Installation layout

`.civapp` stays a single distribution JSON file. Installation unpacks it into
`save:/civhomebrew/apps/<id>/manifest.json`, optional binary `icon.png`, and raw
`scripts/<source-name>` files. Nested source names preserve their directory
structure. Names are checked case-insensitively for duplicates and file/directory
collisions before any previous folder is deleted. A replacement removes the
entire old app folder first; omitted old files do not survive an update. See
[the installed layout](installed-layout.md) for commit and migration behavior.
