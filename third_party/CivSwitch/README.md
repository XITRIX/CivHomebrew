# Gezine / CivSwitch

Source: https://github.com/Gezine/CivSwitch
Revision: `59e27b4894e91bc53ece58dd5e9add7335639ef3` (MIT, see LICENSE).

`core.js` is the unmodified native initialization and remote loader from that
revision, SHA-256 `1fe1aaa68dc8c0534d79d65b1dd545f66c6b3fb3d547f01c967cdc5f70e7bdf4`.
It is retained as a reference and offline test fixture. The installer instead
decodes the exact working initialization from the device’s original trigger,
then inserts a compact file-loader hook into its existing remote-loader function.
The original loader remains as fallback; the large UI bootstrap is never inlined
into the save-list trigger.

`inflate-stage.js` adapts the decoder from
`installer-creator/compress_stage.js`; its UTF-8 conversion handles four-byte
characters and uses bounded argument lists. Compression uses Python zlib and
executes the actual decoder in an isolated Node VM for an exact round-trip check.
No game save template, game binary, credentials or save backup is bundled.
