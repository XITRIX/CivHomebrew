# CivSwitch Kit Checks

Optional CivHomebrew app for Switch 1 first bridge/native-copy qualification.
The diagnostic bridge is a bounded subset of civswitch-kit revision
`9a9589147e9852120e0c04e2847ea38b347fe7ab`; it permits owned-memory memcpy/memmove only.
The PC checker is not packaged here. Start a compatible checker before choosing Run.

```sh
# From the CivHomebrew repository root:
npm run pack:kit
python3 tools/package_payload.py --inspect dist/civswitch-kit-checks.civapp
```

The unconfigured package prompts for the PC address on console. The full
Switch 2 filesystem exploit is outside this diagnostic app's scope.

GPL-2.0; see `LICENSE`, `LICENSE-MIT-Gezine.txt` and the packaged `notices.js`.

Release 0.1.1 borrows the native Launcher session (SDK 1.3.3) without replacing its renderer. It keeps the DOM path for older Launchers. Controller navigation, status and app cleanup share the native view; diagnostic bridge behavior is unchanged.
