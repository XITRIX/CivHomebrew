# Standalone .civapp packager

Copy **[`tools/package_payload.py`](../tools/package_payload.py)** into any repository. It is a single-file tool using
only the **Python 3.10+ standard library**: no project imports, pip packages,
Node.js, CivHomebrew checkout or network access. It builds CivHomebrew `.civapp`
format version 1 and can validate existing packages.

## Reuse in another repository

Add the script and a `payload.json` at your project's root:

```json
{
  "id": "my-app",
  "name": "My App",
  "author": "Your name",
  "release": "1.0.0",
  "description": "A CivSwitch application.",
  "api": 1,
  "scripts": ["lib.js", "app.js"],
  "icon": null
}
```

Paths are relative to the manifest directory. Put dependencies first and the
entry script last. Use `null` for no icon, or a path to a 256×256 PNG. The tool
preserves order and validates paths, sources, metadata, artwork and size limits.
It does not build dependencies or discover scripts; generate all required files
before packaging.

Run without arguments for interactive setup, or use explicit flags in CI.

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

A manifest is optional when all settings are supplied explicitly:

```sh
python3 tools/package_payload.py --directory . --non-interactive \
  --no-save-metadata --id my-app --name "My App" --creator "Your name" \
  --version 1.0.0 --script lib.js --script app.js --no-icon \
  -o artifacts/my-app.civapp
```

Arguments override saved metadata. `--version RELEASE` changes the app release,
not the package format version. See `--help` for all options.

## Maintenance and checks

CivHomebrew maintains this distributable file at `tools/package_payload.py`.
Applications can vendor an unchanged copy. The companion imports these same
packaging/validation functions, so its `pack` and `inspect` commands retain the
same format and validation rules.

Run `python3 -B tests/test_packager.py` for generic packaging checks, including a
copy of the single script running in an unrelated directory under isolated Python.
These checks are also part of `npm test`. Packaging and validation are local checks;
they do not establish console compatibility.
