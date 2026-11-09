# Provenance

Created 2026-11-08 as a sibling project of NS2-experiments, with its own Git repo.
Moved with Git history intact into the user-created `NS2-CivHomebrew/` folder.

- UI reference: user-supplied Homebrew menu screenshot; layout recreated in DOM.
  No app logos or screenshot raster content copied into the runtime UI.
  User-supplied console captures are included under `docs/images/` for the README.
- Native ABI and app lifetime/input patterns: existing NS2-experiments at
  `2a33e3796d92340e2fb6e0b41a61595430f612dc`, notably
  `app/src/platform/native-network.js` and `app/src/streaming/native-io.js`.
- Standalone starter and `tools/send_app.py`: local `civswitch-development` skill,
  captured 2026-11-08. The Hello example retains the starter's input/lifetime. The sender adds a leading
  newline before each separator so trailing line comments cannot swallow it.
- Original loader inspected locally at Gezine/CivSwitch
  `59e27b4894e91bc53ece58dd5e9add7335639ef3`, `core.js`. Its remote loader uses
  TCP 9026, raw JS until EOF, direct awaited eval, and a strict <500 KiB limit.
  `tools/send_js.py` is copied unmodified from that revision. The new terminal
  retains the original 37-row / 146-column wrapping; rendering and transport
  handling are implemented here using nonblocking sockets.
- New service and packaging are this project's implementation, not claimed
  upstream Gezine functionality. Native ABI remains build-specific.

Upstream license is retained in `third_party/CivSwitch-LICENSE.txt`. The separate boot installer now vendors the pinned `core.js` initialization and
modified inflate helper under `third_party/CivSwitch/`, retaining its MIT license.
It patches the existing device trigger rather than bundling a game save template.
The installed native initialization is taken byte-for-byte from the decoded
original trigger, not rebuilt from this reference source.
