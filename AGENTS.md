# Payload Menu

Use the `civswitch-development` skill for console/runtime changes. Keep the menu
as a regular payload until device testing establishes stability. Boot-trigger
replacement and removing the core terminal’s + exit belong to the separate later
installation phase. Selector B/Minus unload the launcher to the resident terminal.

- App source: `app/`; PC packaging/deployment: `tools/`; generated output: `dist/`.
- `npm test` covers package/storage/companion behavior; `npm run test:ui` uses Chrome.
- Maintain `.civapp` v1 compatibility and ordered direct-eval semantics.
- Keep the final app lifetime promise as the bundle's completion value.
- Install apps as plain files under `save:/civhomebrew/apps/<id>/`; validate
  first, then delete the previous app folder completely before replacement.
  Keep the selector independent of script reads and preserve `.civapp` v1.
- Confine owned storage to `save:/civhomebrew/`. Never clear game saves.
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
