# PC installation and recovery

Requirements: Python 3 and Node.js (standard libraries only). Start with Gezine's
loader waiting, or leave CivHomebrew's selector/terminal idle. From this repo:

```sh
python3 tools/install_homebrew.py 192.168.1.148
```

The command builds and verifies the compressed boot image, opens a temporary
installation service, downloads the existing trigger, verifies a PC backup,
creates/readbacks a device backup, stages the core and launcher in inactive slots,
and replaces only `save:/saves/Single/XSTRIG.Civ7Save`. It does not clear the Single
folder or use a bundled game-save template. Existing apps and settings remain.

After completion, close and reopen Civilization VII and open **Load Game**. Building
that list invokes the existing save trigger and starts CivHomebrew automatically;
no PC connection is needed. Installed mode hides both Exit labels and disables the
core terminal's + exit. − opens the terminal and B reloads the launcher. Hold −
while opening Load Game to start directly in the core terminal and bypass a pending
core trial. PC commands and component updates remain available in terminal mode.
PC `shutdown` explicitly stops the installed core and falls back to Gezine's
embedded loader for recovery; it does not uninstall the trigger.

The installer decodes the exact working Gezine source from the original trigger
backup and preserves its native initialization. It inserts a small file-loading
hook into the existing remote-loader function, which already owns direct eval.
The large bootstrap is stored separately as a protected, content-addressed file
under `save:/civhomebrew/boot-install/bootstrap-<checksum>.js` and is read only
after initialization. Its length and checksum are verified before direct eval
in that native lexical scope. Old bootstrap files remain available to old triggers. If startup throws
or the resident core is explicitly shut down, it enters Gezine recovery. Offline
startup does not require listeners to bind: the local UI starts and PC services
retry in the background. A native crash still requires restarting the game.

## Restore

At either loader or an idle CivHomebrew selector/terminal:

```sh
python3 tools/install_homebrew.py 192.168.1.148 --restore
```

This restores the **exact backed-up original bytes**. Restart Civ VII and open
Load Game again to use Gezine's original loader. It preserves CivHomebrew's apps,
settings and component slots for a later reinstall.

Default backups are in `backups/192.168.1.148/` (ignored by Git):

- `original-XSTRIG.Civ7Save`: the original trigger, never overwritten with a
  different file. `original-sha256.json` records its size and SHA-256.
- `installed-XSTRIG.Civ7Save`: the generated replacement for inspection.
- `restored-XSTRIG.Civ7Save`: the exact restore candidate after a restore command.

A second original copy is retained at
`save:/civhomebrew/boot-install/original.Civ7Save`, with the latest displaced trigger
at `previous.Civ7Save`. Every staged/backup/published file is committed and read
back. A failed publication attempts to restore the displaced trigger. The original
backup is never consumed by rollback. A different existing backup or a changed
active trigger causes the operation to stop rather than overwrite it.

The SDK exposes separate rename operations, so there is a brief power-loss window
between moving the old trigger and publishing the new one. If the trigger is
missing/corrupt and neither loader can start, use the save manager to restore the
PC `original-XSTRIG.Civ7Save` as `saves/Single/XSTRIG.Civ7Save`. Keep the PC backup
outside the console; the network restore command requires a working loader.

`--backup-dir DIR`, `--loader-port PORT` and `--installer-port PORT` override the
PC backup location and ports. The temporary installer uses port 9030 by default,
ends after completion and expires after two minutes without requests. Each raw
upload stays below 500 KiB; framed file transfers keep the 12 MiB bound.

## Moonlight pairing snapshots

Before changing the trigger, the installer now also copies any existing
`save:/moonlight-experiment/pairing-0.json` and `pairing-1.json` to immutable snapshots
under the PC backup directory's `moonlight-pairing/` folder. A manifest records
slot, size and SHA-256. These files include private keys and are created with
owner-only permissions; they are ignored by Git. Existing snapshots survive even
when a subsequent run finds no pairing files. No new identity is generated.

These snapshots cover only Moonlight pairing files. A pairing identity cannot be
recovered from the public certificate alone when its private key is missing.
