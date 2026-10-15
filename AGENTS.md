# Agent instructions

## The project

Padlight is a GNOME Shell extension for Xbox controllers. Its top-bar icon lights up green while a controller is connected, and its menu shows the battery, the connection, the model and firmware, and a picture of the controller that mirrors the buttons and sticks as they move; it can also pair a new controller over Bluetooth. It is plain JavaScript (ES modules) for GNOME Shell 50 with no build step, plus small Python 3 helpers, standard library only: two read the controller and make it vibrate through evdev, and one lists the programs that have it open. `README.md` describes the features.

It is an independent project, not affiliated with Microsoft. Xbox is a trademark of Microsoft.

Never describe something as working or complete unless a recorded check establishes it. A syntax check is not proof that the extension behaves, and a simulated controller is not proof that real hardware behaves.

## Layout

| Path | Contents |
| :--- | :--- |
| `src/metadata.json` | Extension ID (`padlight@nahuelgenchi.github.io`), name, supported GNOME Shell versions |
| `src/extension.js` | The top-bar button: finds controllers, keeps the menu current, starts the helpers |
| `src/controllers.js` | Finds Xbox controllers in sysfs: connection, model, firmware, driver, device nodes, and the USB serial number of a wired one |
| `src/battery.js` | Battery readings from UPower, matched to a controller, how low they are, and the lowest one for the top bar |
| `src/batteryAlerts.js` | When a low battery alert is due and what it says; the extension keeps it while the screen is locked, so unlocking repeats nothing |
| `src/connectionNotices.js` | Which controllers came and went between two scans, how a controller is told apart across reconnects, and what a connection notice says |
| `src/nicknames.js` | Nicknames: which controllers can keep one, the key each is kept under (an HMAC-SHA256 of the Bluetooth address or USB serial number with the `nickname-salt` setting), and how a typed one is tidied. A change to how the key is made loses every saved nickname; a test pins it |
| `src/notifications.js` | Padlight's source in the message tray; a notification replaces the last one sent with the same key |
| `src/firmware.js` | The newest firmware seen for each Bluetooth LE controller, and how the kernel's version number reads; the sources are in issue #30 |
| `src/pairing.js` | Pair a Controller: searches, pairs, trusts and connects through BlueZ over D-Bus, and its menu section |
| `src/controllerCard.js` | The menu card: header, live picture, stick check, button checklist or vibration lab and their tabs, information tiles, buttons, and the empty state |
| `src/controllerView.js` | The live picture; reads the controller through `inputMonitor.js` only while the menu is open |
| `src/controllerArt.js` | Draws the controller with cairo: pressed buttons, sticks, triggers and glow |
| `src/controllerCheck.js` | The stick check: raw stick positions, the triggers, where each stick rests |
| `src/buttonCheck.js` | The Buttons tab: the picture with the checklist's buttons lit, the count and Reset |
| `src/checklist.js` | The button checklist's bookkeeping: which buttons a controller has (from its modalias), which have been pressed |
| `src/inputMonitor.js` | Runs `monitor.py` between `start()` and `stop()` and hands over each state |
| `src/monitor.py` | Prints the controller's input state as JSON lines; `--raw` leaves the driver's dead zone in, for the stick check; `--activity` only says, at most every five seconds, that the controller is in use |
| `src/keepAwake.js` | Keep the screen awake: a `monitor.py --activity` reader per controller while the switch is on, and GNOME's idle inhibitor (`org.gnome.SessionManager.Inhibit`), let go ten seconds after the last input |
| `src/rumble.py` | Plays a vibration: Test Vibration's short buzz, or the strengths and length from the vibration lab, within its limits; `--find` plays Find Controller's bursts. Stopping it stops the controller, as closing the device removes the effect |
| `src/vibrationLab.js` | The Vibration tab: a slider for each motor and the length, and Play |
| `src/inuse.py` | Lists the programs that have a controller's device files open, from `/proc` |
| `src/stylesheet.css` | The card's look on dark and light menus |
| `src/prefs.js` | The settings window, opened from the menu and from the Extensions app |
| `src/schemas/` | The settings schema: each setting's name, default and range |
| `src/icons/` | Top-bar icon (the Xbox logo, Microsoft's trademark, outside the GPL), USB icon, controller artwork and its glow |
| `install.sh` | Installs, packs or removes the extension for the current user |
| `tests/` | `run.sh` and the tests it runs: detection on made-up sysfs trees (`fakesys.js`), the battery helpers and alerts, the connection notices, the nickname keys, the firmware table, the button checklist, and the Python helpers with fake devices and a made-up `/proc` |
| `.github/workflows/` | `checks.yml` runs `tests/run.sh` on every PR; `project-tracking.yml` keeps milestones and labels in order |
| `docs/` | Tracking guide and README images |

## Commands

- `./install.sh` installs or updates the extension for the current user and switches it on; `./install.sh --pack` only builds the package; `./install.sh --uninstall` removes it. A running Wayland session loads new extension code only at the next log-in.
- `tests/run.sh` runs the source checks (`node --check` on the JavaScript, `python3 -m py_compile` on the helpers, `glib-compile-schemas --strict` on the settings schema) and the tests in `tests/`. It needs gjs, Node.js, Python 3 and `glib-compile-schemas` but no GNOME session, and the Checks workflow runs it on every PR. A change to detection, battery matching or the helpers comes with a test. It keeps Python's compiled files out of `src/`; to compile a helper by hand, do the same with `PYTHONPYCACHEPREFIX="$(mktemp -d)" python3 -m py_compile src/monitor.py`.
- In a real session, `journalctl --user -b | grep -i padlight` shows the extension's errors.

## Working well here

- Start from the active issue, then read only the code involved.
- Never check a change in the owner's running GNOME Shell or with their settings. Use a separate, hidden shell with its own runtime folder, its own D-Bus and settings kept in memory (`GSETTINGS_BACKEND=memory` is what keeps the real settings untouched):

  ```sh
  mkdir -p -m 700 /tmp/padlight-test/run
  env -u WAYLAND_DISPLAY -u DISPLAY \
      XDG_RUNTIME_DIR=/tmp/padlight-test/run XDG_CONFIG_HOME=/tmp/padlight-test/config \
      XDG_DATA_HOME=/tmp/padlight-test/data GSETTINGS_BACKEND=memory \
      dbus-run-session -- ./my-check.sh
  ```

  where `my-check.sh` copies `src/` to `$XDG_DATA_HOME/gnome-shell/extensions/padlight@nahuelgenchi.github.io/`, starts `gnome-shell --headless --virtual-monitor 1920x1080 --unsafe-mode --no-x11 --wayland-display=padlight-test &`, waits until `Main.layoutManager._startingUp` is false, and drives it with `gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval '<JavaScript>'`: for example `Main.extensionManager.enableExtension('padlight@nahuelgenchi.github.io')`, then `Main.panel.statusArea['padlight@nahuelgenchi.github.io'].menu.open()`. Pictures come from `org.gnome.Shell.Screenshot.Screenshot` on `/org/gnome/Shell/Screenshot`. A virtual controller created through `/dev/uinput` exercises detection and the live picture without real hardware; a virtual pointer or keyboard from `Clutter.get_default_backend().get_default_seat().create_virtual_device()` exercises hover, clicks and keyboard focus.
- Before clicking or pressing keys in a test menu, point the test shell's `PATH` at a scratch folder that holds only links to `python3` and `bwrap`, or Disconnect and Bluetooth Settings run the real `bluetoothctl` and Settings. For example, `mkdir -p /tmp/padlight-test/bin && ln -s /usr/bin/python3 /usr/bin/bwrap /tmp/padlight-test/bin/`, then Eval `imports.gi.GLib.setenv('PATH', '/tmp/padlight-test/bin', true)`. Do not use a folder that does not exist:
  - Padlight's helpers need `python3`, or the live picture stays still and Test Vibration does nothing.
  - GNOME Shell saves screenshots through glycin, which starts `bwrap` from `PATH`. Without it, the Screenshot call still answers true but writes an empty file.
- To check `install.sh` and what happens at the next log-in, also point `HOME` and `XDG_CACHE_HOME` at the scratch folder and use `GSETTINGS_BACKEND=keyfile` instead, which keeps settings between commands in `$XDG_CONFIG_HOME/glib-2.0/settings/keyfile`. Run `./install.sh` first, then start the hidden shell: it should load Padlight by itself.
- Pair a Controller talks to BlueZ on the system bus, which a hidden shell shares with the real session. Before using it in a test menu, give the test shell a private system bus (`DBUS_SYSTEM_BUS_ADDRESS`), with a stand-in `org.bluez` on it to test pairing. Otherwise a search runs on the computer's real Bluetooth adapter, and choosing a controller pairs it.
- A notification banner in the hidden shell stays up until there is input, as GNOME keeps banners for an idle user, and later ones wait behind it. Clear them between checks, for example by destroying the notifications of each source in `Main.messageTray.getSources()`.
- The hidden shell has no gnome-session. To check Keep the screen awake, own `org.gnome.SessionManager` on its session bus with a stand-in that answers `Inhibit` and `Uninhibit` and keeps the `InhibitedActions` property. Mutter's idle clock follows that property and starts again when the inhibitor goes, which `global.backend.get_core_idle_monitor().get_idletime()` shows.
- Check the menu on a dark and a light menu (the `color-scheme` setting), and with at least one other shell theme than the default: the card picks its colors from the menu's own text color.
- Keep it dependency-free: no build step, no npm packages, no Python packages.
- When a newer controller firmware line appears, update `src/firmware.js` with a source, such as a kernel log of a controller running it. Only list versions that were seen, so a current controller is never called out of date.
- The helpers read input devices without grabbing them, so games keep working, and they only run while the menu is open. The one exception is `monitor.py --activity`, which runs while Keep the screen awake is on and a controller is connected. Keep all of that true.
- Record what a check covered and what it did not, in the PR: hidden shell or real session, simulated or real controller, which connection.

## Private data

Bluetooth addresses, serial numbers, personal paths, logs that contain them, and account credentials stay out of commits, issues and PRs. The settings never hold an address or serial number either: nicknames are kept under a salted hash of it. Pictures show simulated controllers or a real controller's non-identifying details (name, model, firmware), never a Bluetooth address.

## Tracking and delivery

Every change (code, bug fixes, enhancements, docs, research and repository operations) belongs to an issue with a milestone in `NahuelGenchi/padlight`, reused or created before editing. Every new feature, and every other work item, gets its own new branch created from the latest `origin/main` for that issue: `<type>/<issue>-<slug>` (`feat`, `fix`, `enh`, `docs`, `research`, `ops`). Never reuse a branch for a second feature, never mix two issues on one branch, and never push to `main`. Use `type: summary (#N)` commits. Delete the branch after its PR merges. PRs follow `.github/pull_request_template.md`: a standalone `Closes #N` line, the issue's milestone, and `Refs #N` for unfinished parent work. Decisions, exact changed paths and blockers go in the issue or PR. See `CONTRIBUTING.md` and `docs/TRACKING.md`.

## Final report

Report the issue, the PR and what changed. Keep these separate: source checks (exact commands and outcomes, or "none run"), live shell checks (the same), hardware checks (the same), and source/diff review scope.
