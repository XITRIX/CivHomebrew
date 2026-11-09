# Payload Menu

Use the `civswitch-development` skill for console/runtime changes. The user has
authorized the boot replacement phase. `tools/install_homebrew.py` installs/restores
only the existing XSTRIG trigger with verified PC/device backups; never clear a
save directory. Regular payload testing remains available. Installed mode retains
terminal/recovery access and hides Exit; selector B/Minus unload the launcher.

- App source: `app/`; PC packaging/deployment: `tools/`; generated output: `dist/`.
- `npm test` covers package/storage/companion behavior; `npm run test:ui` uses Chrome.
- Maintain `.civapp` v1 compatibility and ordered direct-eval semantics.
- Keep `tools/package_payload.py` distributable as one standalone Python 3.10+
  standard-library file; the companion imports its shared format functions.
- Keep the final app lifetime promise as the bundle's completion value.
- Install apps as plain files under `save:/civhomebrew/apps/<id>/`; validate
  first, then delete the previous app folder completely before replacement.
  Keep the selector independent of script reads and preserve `.civapp` v1.
- Confine app-owned storage to `save:/civhomebrew/`. User-requested FTP file
  operations use the separate `native.files` save-mount adapter and core-owned
  protection policy. Never remove the mount root or clear game saves.
- Native pointers are BigInt. Reuse verified SDK ABI; fail on missing symbols.
- Distinguish host mocks, actual console markers and user-visible confirmation.

- Boot/bridge: `app/boot.js` plus BOOT_SCRIPTS. Resident core: `app/core.js`,
  storage/terminal/legacy-loader/resident modules. Frontend: `app/app.js` + FTP.
- The core owns installation, catalog, foreground lifetime and component updates.
  FTP is launcher-owned: stop it before loading a child; accepted installs finish,
  incomplete uploads cancel. Terminal mode must retain core PC services.
- Launcher updates activate live; core updates activate only on next boot. Use
  verified two-slot state, mark trials before eval and acknowledge after startup.
  Do not overwrite existing slots from boot seeds; use explicit update commands.
- Include `tests/system.cjs`, `tests/resident.cjs`, real-client FTP and Chrome
  lifecycle checks for changes to those boundaries. Keep docs/architecture.md
  and the companion protocol documentation consistent with ownership changes.

- FTP defaults to port 5000. Keep settings core-owned, credentials out of logs,
  and protected paths read-only unless the explicit user setting disables it.
  Virtual roots are `Install civapp` and `Root`. Check both rename endpoints
  and normalized aliases. Preserve partial-upload cancellation and owned write
  completion across launcher unloads. Y opens Options. Settings open the native keyboard with an empty value.
  Replace the setting with the exact confirmed text; never append the old value.
  Cancel preserves the previous setting. Preserve native callback cleanup.
