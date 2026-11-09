# .civapp packager

Turn a CivSwitch JavaScript app into one `.civapp` file containing its ordered
scripts, app information and optional icon. Share that file or install it through
CivHomebrew’s FTP server.

The packager is **[`tools/package_payload.py`](../tools/package_payload.py)**,
a standalone script requiring only **Python 3.10+** and its standard library.
Copy it into another project without installing npm or pip dependencies. Packaging
does not require Node.js, a connected console or network access.

## Quick start: interactive setup

1. Copy the script into your app’s project as `tools/package_payload.py`.
2. Open a terminal in your project folder and run:

   ```sh
   python3 tools/package_payload.py .
   ```

   The `.` means the current folder. You can also pass a different app folder,
   or run without arguments to be asked for its location.
3. Answer the prompts for the app name, stable ID, creator, version, optional
   description, optional GitHub releases URL/asset, and scripts. List script paths separated by commas, with
   dependencies first and the main app script last, for example
   `lib/helpers.js, app.js`.
4. Supply a **256×256 PNG** icon, or confirm that you want to continue without
   one. An existing `icon.png` is detected automatically. Without artwork,
   CivHomebrew displays the first letter of your app’s name.

The tool saves your answers in **`payload.json`** and creates
**`dist/APP-ID.civapp`** inside the app folder. Run the same command again to
rebuild using those saved settings; edit `payload.json` when files or metadata
change. Existing complete settings are reused without prompts.

To try the included Hello app from the CivHomebrew repository root:

```sh
python3 tools/package_payload.py --directory examples/hello --non-interactive -o dist/hello.civapp
python3 tools/package_payload.py --inspect dist/hello.civapp
```

## Configure payload.json

You can write the manifest yourself instead of using the prompts. For example:

```text
my-app/
├── tools/package_payload.py
├── payload.json
├── lib/helpers.js
├── app.js
└── icon.png
```

`payload.json`:

```json
{
  "id": "my-app",
  "name": "My App",
  "author": "Your name",
  "release": "1.0.0",
  "description": "A CivSwitch application.",
  "api": 1,
  "scripts": ["lib/helpers.js", "app.js"],
  "icon": "icon.png"
}
```

| Field | What to enter |
| --- | --- |
| `id` | A stable ID, 1–48 lowercase letters, digits or hyphens, starting with a letter or digit. Reuse it for updates. |
| `name` | The display name shown in CivHomebrew. |
| `author` | The app creator. |
| `release` | Your app’s version, such as `1.0.0`. |
| `description` | An optional short description. |
| `api` | `1`, the supported launcher API. |
| `scripts` | JavaScript file paths in execution order, dependencies first and entry script last. |
| `icon` | A path to a 256×256 PNG, or `null` to omit artwork. |
| `extensions.updates` | Optional schema 1 GitHub update declaration, or `null` to remember that updates are disabled. |

Paths are relative to the folder containing `payload.json`. Use forward slashes;
all inputs must stay inside that folder. List every required runtime script.
The packager does not discover dependencies, compile code or include arbitrary
assets. Build any generated JavaScript before packaging.

Scripts run as classic JavaScript together in one evaluation, in the listed
order. The final expression must return the app’s lifetime promise, which should
settle only after the app cleans up. See the [app contract](usage.md#app-contract)
and [Hello example](../examples/hello/app.js).

## Build and inspect

With a complete manifest, run these from your app’s project root:

```sh
python3 tools/package_payload.py --directory . --non-interactive -o dist/my-app.civapp
python3 tools/package_payload.py --inspect dist/my-app.civapp
```

Inspection validates the package and prints its metadata, script order and icon
status. It does not execute the app or establish console compatibility.

Upload the resulting file into **`Install civapp`** over FTP; see
[Install apps over FTP](../README.md#install-apps-over-ftp). Do not send `.civapp`
JSON directly to Gezine’s JavaScript loader.

Uploading a package with the same ID replaces the installed app’s entire folder.
Keep app data that must survive updates outside that installation folder, and
retain the `.civapp` on your PC for reinstalling.

## Command-line options

Enable app updates without editing JSON manually:

```sh
python3 tools/package_payload.py --directory . --non-interactive \
  --releases-url https://github.com/OWNER/REPO/releases/latest \
  --update-asset my-app.civapp -o dist/my-app.civapp
```

This saves `extensions.updates` as
`{"schema":1,"releasesUrl":"https://github.com/OWNER/REPO/releases/latest","asset":"my-app.civapp"}`.
An interactive first build asks for the URL and optional asset. Leave the URL
blank to disable updates; the choice is saved as `null` so subsequent builds do
not ask again. Omit the asset to discover a single `.civapp` attachment, or use
`--update-asset ""` to clear a saved asset name. `--no-updates` disables the
declaration while preserving other extensions. Existing complete declarations
are reused without prompts. URLs and asset names are validated before any output
is published. The release tag and packaged app version should agree as SemVer;
see [app updates](app-updates.md).

Arguments override saved manifest values. Repeated `--script` flags replace the
entire saved script list and preserve the order you specify.

| Option | Purpose |
| --- | --- |
| `--directory PATH` | Choose the app folder; a positional folder argument also works. |
| `-o FILE` | Set the output path; otherwise it is `APP_FOLDER/dist/ID.civapp`. |
| `--id`, `--name` | Override the stable ID or display name. |
| `--creator`, `--version` | Set `author` and `release` in the manifest. |
| `--description TEXT`, `--api 1` | Set the description and launcher API. |
| `--releases-url URL` | Set the GitHub `https://github.com/OWNER/REPO/releases/latest` URL. |
| `--update-asset FILE` | Select the exact `.civapp` release asset; `""` clears a saved selection. |
| `--no-updates` | Disable updates and remember this choice. |
| `--script PATH` | Include a script; repeat for each script in launch order. |
| `--icon PATH` | Use a PNG inside the app folder. |
| `--no-icon` | Explicitly omit artwork. |
| `--non-interactive` | Never prompt; fail if required settings are missing. |
| `--no-save-metadata` | Build without creating or updating `payload.json`. |
| `--inspect FILE` | Validate an existing package; use separately from build options. |

Run `python3 tools/package_payload.py --help` for all options and aliases.

## CI usage

With a complete manifest, use this in any CI shell step:

```sh
python3 tools/package_payload.py --directory . --non-interactive \
  --no-save-metadata -o artifacts/my-app.civapp
python3 tools/package_payload.py --inspect artifacts/my-app.civapp
```

Upload `artifacts/my-app.civapp` using your CI provider's artifact step. The tool
requires no access to a Switch. Both commands exit nonzero on invalid input;
`--non-interactive` never prompts, and `--no-save-metadata` keeps sources unchanged.
Identical inputs produce identical package bytes; output is written atomically.

A manifest is optional when all required settings are supplied explicitly:

```sh
python3 tools/package_payload.py --directory . --non-interactive \
  --no-save-metadata --id my-app --name "My App" --creator "Your name" \
  --version 1.0.0 --script lib/helpers.js --script app.js --no-icon \
  -o artifacts/my-app.civapp
```

`--version` changes the app release; the distribution format remains version 1.

## Limits and common errors

- Include **1–64 scripts**, with at most **32 MiB** of combined UTF-8 source.
- Icons must be **256×256 PNGs**, at most **512 KiB**. The serialized package
  must fit within **48 MiB**.
- Missing icon: add the image, set `"icon": null`, or pass `--no-icon`.
- Missing settings in CI: provide a complete manifest or explicit flags. Prompts
  are also disabled when input is not a terminal.
- Invalid paths: use relative `.js` paths without `..` or backslashes. Duplicate
  names, including names that differ only in case, are rejected.

See the [package format reference](civapp-format.md) for exact schema and
validation rules.

## Maintenance and checks

CivHomebrew maintains this distributable file at `tools/package_payload.py`.
Applications can vendor an unchanged copy. The companion imports these same
packaging/validation functions, so its `pack` and `inspect` commands retain the
same format and validation rules.

Run `python3 -B tests/test_packager.py` for generic packaging checks, including a
copy of the single script running in an unrelated directory under isolated Python.
These checks are also part of `npm test`. Packaging and validation are local checks;
they do not establish console compatibility.

Distribution and companion JSON use ASCII Unicode escapes. This preserves the
exact source strings after JSON parsing and avoids promoting an entire large
package to a two-byte Gameface string for a few Unicode UI characters. Use the
0.4.1 bootstrap for its matching ASCII codec fast path and receive-buffer release.
