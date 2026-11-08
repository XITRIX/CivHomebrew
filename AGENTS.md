# Payload Menu

Use the `civswitch-development` skill for console/runtime changes. Keep the menu
as a regular payload until device testing establishes stability. Boot-trigger
replacement and removing B Exit belong to the separate later installation phase.

- App source: `app/`; PC packaging/deployment: `tools/`; generated output: `dist/`.
- `npm test` covers package/storage/companion behavior; `npm run test:ui` uses Chrome.
- Maintain `.civapp` v1 compatibility and ordered direct-eval semantics.
- Keep the final app lifetime promise as the bundle's completion value.
- Confine owned storage to `save:/civhomebrew/`. Never clear game saves.
- Native pointers are BigInt. Reuse verified SDK ABI; fail on missing symbols.
- Distinguish host mocks, actual console markers and user-visible confirmation.
