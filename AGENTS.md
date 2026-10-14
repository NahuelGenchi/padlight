# Agent instructions

## The project

Padlight is a GNOME Shell extension for Xbox controllers. Its top-bar icon lights up green while a controller is connected, and its menu shows the battery, the connection, the model and firmware, and a picture of the controller that mirrors the buttons and sticks as they move. It is plain JavaScript (ES modules) for GNOME Shell 50 with no build step, plus small Python 3 helpers, standard library only: two read the controller and make it vibrate through evdev, and one lists the programs that have it open. `README.md` describes the features.

It is an independent project, not affiliated with Microsoft. Xbox is a trademark of Microsoft.

Never describe something as working or complete unless a recorded check establishes it. A syntax check is not proof that the extension behaves, and a simulated controller is not proof that real hardware behaves.

## Layout

| Path | Contents |
| :--- | :--- |
| `src/metadata.json` | Extension ID (`padlight@nahuelgenchi.github.io`), name, supported GNOME Shell versions |
| `src/extension.js` | The top-bar button: finds controllers, keeps the menu current, starts the helpers |
| `src/controllers.js` | Finds Xbox controllers in sysfs: connection, model, firmware, driver, device nodes |
| `src/battery.js` | Battery readings from UPower, matched to a controller |
| `src/controllerCard.js` | The menu card: header, live picture, information tiles, buttons, and the empty state |
| `src/controllerView.js` | The live picture; runs `monitor.py` only while the menu is open |
| `src/controllerArt.js` | Draws the controller with cairo: pressed buttons, sticks, triggers and glow |
| `src/monitor.py` | Prints the controller's input state as JSON lines |
| `src/rumble.py` | Plays a short vibration |
| `src/inuse.py` | Lists the programs that have a controller's device files open, from `/proc` |
| `src/stylesheet.css` | The card's look on dark and light menus |
| `src/icons/` | Top-bar icon (the Xbox logo, Microsoft's trademark, outside the GPL), USB icon, controller artwork and its glow |
| `install.sh` | Installs, packs or removes the extension for the current user |
| `docs/` | Tracking guide and README images |

## Commands

- `./install.sh` installs or updates the extension for the current user and switches it on; `./install.sh --pack` only builds the package; `./install.sh --uninstall` removes it. A running Wayland session loads new extension code only at the next log-in.
- `for f in src/*.js; do node --check "$f"; done` and `python3 -m py_compile src/monitor.py src/rumble.py src/inuse.py` are the source checks. There is no test suite yet.
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
- Before clicking or pressing keys in a test menu, set the test shell's `PATH` to a folder that does not exist (Eval `imports.gi.GLib.setenv('PATH', '/nonexistent', true)`), or Disconnect and Bluetooth Settings run the real `bluetoothctl` and Settings.
- To check `install.sh` and what happens at the next log-in, also point `HOME` and `XDG_CACHE_HOME` at the scratch folder and use `GSETTINGS_BACKEND=keyfile` instead, which keeps settings between commands in `$XDG_CONFIG_HOME/glib-2.0/settings/keyfile`. Run `./install.sh` first, then start the hidden shell: it should load Padlight by itself.
- Check the menu on a dark and a light menu (the `color-scheme` setting), and with at least one other shell theme than the default: the card picks its colors from the menu's own text color.
- Keep it dependency-free: no build step, no npm packages, no Python packages.
- The helpers read input devices without grabbing them, so games keep working, and they only run while the menu is open. Keep both true.
- Record what a check covered and what it did not, in the PR: hidden shell or real session, simulated or real controller, which connection.

## Private data

Bluetooth addresses, serial numbers, personal paths, logs that contain them, and account credentials stay out of commits, issues and PRs. Pictures show simulated controllers or a real controller's non-identifying details (name, model, firmware), never a Bluetooth address.

## Tracking and delivery

Every change (code, bug fixes, enhancements, docs, research and repository operations) belongs to an issue with a milestone in `NahuelGenchi/padlight`, reused or created before editing. Every new feature, and every other work item, gets its own new branch created from the latest `origin/main` for that issue: `<type>/<issue>-<slug>` (`feat`, `fix`, `enh`, `docs`, `research`, `ops`). Never reuse a branch for a second feature, never mix two issues on one branch, and never push to `main`. Use `type: summary (#N)` commits. Delete the branch after its PR merges. PRs follow `.github/pull_request_template.md`: a standalone `Closes #N` line, the issue's milestone, and `Refs #N` for unfinished parent work. Decisions, exact changed paths and blockers go in the issue or PR. See `CONTRIBUTING.md` and `docs/TRACKING.md`.

## Final report

Report the issue, the PR and what changed. Keep these separate: source checks (exact commands and outcomes, or "none run"), live shell checks (the same), hardware checks (the same), and source/diff review scope.
