# Validation and hardware acceptance

Local tests do not prove Switch-native ABI behavior. Record actual runs below
with observed results, and keep user-visible behavior separate from log markers.

## Before replacing the original loader

- Header and 256×256 artwork render correctly; six-column navigation and scrolling work.
- A starts an app; a child's B closes that app and returns to the menu.
- Repeated launches do not duplicate input or leave the game/child frozen.
- B on the menu returns to the original PC loader; the PC sender completes.
- Install/update from a second terminal while the menu is open; restart and load offline.
- Icons missing/corrupt, long titles and empty catalogs remain usable.
- Corrupt newest catalog recovers; both unreadable slots preserve files and disable installs.
- Interrupted uploads, disk-full/commit failure, malformed packages and network loss show errors.
- Cold launch, offline cold launch, recovery chord and restore of the original trigger work.

The final three boot-specific checks require the later separate installer. Do
not simulate a power cut or fill the actual game save as part of an initial smoke
test; use host fault-injection checks first and a backed-up environment later.

## Host verification · 2026-11-08

- Node package/storage/protocol checks, including corrupt slot recovery and failed writes.
- Python packer, upload staging and real fragmented localhost TCP checks.
- Chrome UI checks with explicit mock storage/native service, screenshot at 1280×720.

## Console smoke test · 2026-11-08

Target supplied by the user: `192.168.1.182`, original CivSwitch loader waiting.

- First finite install failed at icon decoding with `atob is not defined` before
  any app write. The loader caught the exception and closed the client cleanly.
- Replaced atob with a portable decoder and added a browser-global-free regression.
- Finite Hello install then logged `CIVHOME_BREW_INSTALLED` and `Executed successfully`.
- Regular menu launch logged `CIVHOME_BREW_READY`.
- A real companion `list` over native TCP 9027 returned the persisted Hello entry
  (`hello-civswitch`, 12,365 bytes).
- User confirmed the header, IP, Hello tile and turquoise logo look correct on
  the Switch. A opens Hello; B in Hello returns to the menu successfully.
- This confirms one user-visible child launch/return cycle. Repeated launches,
  full-grid scrolling remain unverified on hardware.
- The first menu session later ended with `Executed successfully`, confirming
  return to the original loader.
- After a report that A/B badge text was misaligned, replaced live badge text
  with embedded PNG glyphs and explicit footer line heights. Browser UI and
  companion checks pass. Relaunched the updated regular payload and received
  `CIVHOME_BREW_READY`; visual alignment confirmation on Switch is pending.

No boot-trigger changes were made. These smoke results do not establish cold-boot,
offline, interrupted-install or repeated-launch stability.


## OLED terminal / Gezine compatibility · 2026-11-08

- User selected Switch OLED at `192.168.1.148:9026` for this round. An initial
  mistyped `192.168.1.48` connection timed out before sending any bytes.
- Original unmodified Gezine sender and Hello payload completed against the
  original loader, then against the menu's borrowed TCP 9026 listener.
- User confirmed the on-device terminal shows the Hello output; B returns to the
  selector and Minus reopens the terminal on the actual OLED controller.
- Original `socket(AF_INET, SOCK_DGRAM, 0)` and `close(fd)` helpers created and
  closed an owned finite probe socket from the isolated evaluator. `sdk_base`
  and `call_rop` remained available. Marker: `CIV_ORIGINAL_SOCKET_HELPERS_OK`.
- Installed Hello via the framed TCP 9027 service and read back its persisted
  catalog entry (12,365 bytes).
- A >500 KiB JavaScript app was staged in seven bounded transactions through the
  raw listener. Every stage completed, then the final app reported
  `CIV_STAGED_COMPAT_OK` and `Executed successfully`.
- Closed the menu from an idle state; its bootstrap sender received `Executed
  successfully`. Gezine's original loader then accepted Hello successfully,
  verifying the borrowed listener/logger handoff on this device.
- Relaunched the menu. An intentional exception returned the original `Error in
  payload:` prefix and a bounded stack, without a success marker. A subsequent
  normal raw app immediately succeeded, verifying error recovery.
- Final UI additionally repaints Start's enabled state after child completion;
  selector/terminal browser checks cover the final source. The OLED visual/B/Minus
  confirmation above predates only this footer enable-state adjustment.

All 25 host tests (17 Node, 8 Python) and Chrome UI checks passed. Hardware checks
establish the inspected transport/native-helper contract, not arbitrary payload
compatibility or safety of leaked resources/infinite loops. OLED game/build
identity was not independently fingerprinted. Boot-trigger installation, cold
boot/offline boot and power-loss fault tests remain separate work. No boot
trigger or unrelated game save was changed.
