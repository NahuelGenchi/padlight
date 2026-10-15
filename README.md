<div align="center">
  <img src="docs/images/logo.svg" width="96" height="96" alt="Padlight logo: a white game controller with a green light in its middle">
  <h1>Padlight</h1>
  <p><strong>Your Xbox controller, live in the GNOME top bar.</strong></p>
  <p>
    A small icon that lights up green when a controller connects.<br>
    Click it to see the battery, the connection, the model and firmware,<br>
    and a picture of the controller that mirrors every button and stick as you play.
  </p>
  <p>
    <img src="https://img.shields.io/badge/GNOME%20Shell-50-4a86cf?style=flat-square&logo=gnome&logoColor=white" alt="GNOME Shell 50">
    <img src="https://img.shields.io/badge/license-GPL--2.0--or--later-2f8f46?style=flat-square" alt="License: GPL-2.0-or-later">
    <img src="https://img.shields.io/badge/helpers-Python%203-2f55b5?style=flat-square&logo=python&logoColor=white" alt="Helpers in Python 3">
    <img src="https://img.shields.io/badge/build%20step-none-2e9e6b?style=flat-square" alt="No build step">
    <a href="https://github.com/NahuelGenchi/padlight/actions/workflows/checks.yml"><img src="https://img.shields.io/github/actions/workflow/status/NahuelGenchi/padlight/checks.yml?branch=main&style=flat-square&label=checks" alt="Checks on main"></a>
    <img src="https://img.shields.io/badge/status-early%20days-d9902f?style=flat-square" alt="Status: early days">
  </p>
  <p>
    <a href="#a-look-around">A look around</a> &nbsp;·&nbsp;
    <a href="#what-it-shows">What it shows</a> &nbsp;·&nbsp;
    <a href="#get-started">Get started</a> &nbsp;·&nbsp;
    <a href="#controllers">Controllers</a> &nbsp;·&nbsp;
    <a href="#how-it-works">How it works</a> &nbsp;·&nbsp;
    <a href="#roadmap">Roadmap</a>
  </p>
</div>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/hero-dark.webp">
    <img src="docs/images/hero-light.webp" width="630" alt="The GNOME top bar with the Padlight icon highlighted and its menu open: an Xbox Wireless Controller connected since 19:42, a picture of it with the A button lit green and the right trigger half pulled, tiles for battery 85%, Bluetooth, model 1914 and firmware 5.17, and the Test Vibration and Disconnect buttons">
  </picture>
</p>

<p align="center">
  <sub>Every picture on this page is Padlight itself, captured in a test session of GNOME Shell 50. The wired controller is real; the Bluetooth ones, their battery readings and the buttons being pressed are simulated.</sub>
</p>

> [!NOTE]
> Padlight is an independent project. It is not affiliated with, endorsed by or connected to Microsoft. Xbox is a trademark of Microsoft.

## A look around

### It moves when you do

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/live-dark.webp">
    <img src="docs/images/live-light.webp" width="498" alt="Animation of the controller picture: A, B, X and Y light up in turn, both sticks circle, both triggers fill, then the bumpers, the d-pad, the View and Menu buttons, the Xbox button, the Share button and a stick click">
  </picture>
</p>

While the menu is open, the picture follows the controller: buttons light up green, the sticks tilt and the triggers fill as you pull them. Close the menu and Padlight stops reading the controller.

### Every state at a glance

<table>
  <tr>
    <td width="33%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/images/wired-dark.webp">
        <img src="docs/images/wired-light.webp" alt="Menu for an Xbox Series X|S controller on a USB cable: on USB power, wired, model 1914, firmware 5.9, a Test Vibration button, and the xpad driver and device underneath">
      </picture>
      <br><sub><b>On a cable.</b> The Series X|S controller over USB, running on USB power.</sub>
    </td>
    <td width="33%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/images/charging-dark.webp">
        <img src="docs/images/charging-light.webp" alt="Menu for a Bluetooth controller at 42% and charging, with Test Vibration and Disconnect buttons">
      </picture>
      <br><sub><b>Charging over Bluetooth.</b> The battery comes from UPower, and a Bluetooth controller gets a Disconnect button.</sub>
    </td>
    <td width="33%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/images/low-dark.webp">
        <img src="docs/images/low-light.webp" alt="Menu for a Bluetooth controller at 12%, with an orange battery icon">
      </picture>
      <br><sub><b>Running low.</b> At 20% and below, the battery icon turns orange.</sub>
    </td>
  </tr>
  <tr>
    <td valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/images/two-dark.webp">
        <img src="docs/images/two-light.webp" alt="Menu with two cards: the wired Series X|S controller above and a Bluetooth controller at 85% below">
      </picture>
      <br><sub><b>Two at once.</b> Every controller gets its own card, a little smaller so they all fit.</sub>
    </td>
    <td valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/images/empty-dark.webp">
        <img src="docs/images/empty-light.webp" alt="Menu with no controller: a dimmed outline of a controller and the hint Plug in a USB cable or connect over Bluetooth">
      </picture>
      <br><sub><b>Nothing connected.</b> A dimmed outline and a hint on how to connect.</sub>
    </td>
    <td valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/images/topbar-off-dark.webp">
        <img src="docs/images/topbar-off-light.webp" width="234" alt="The right end of the top bar with a grey Xbox icon">
      </picture>
      <br>
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/images/topbar-on-dark.webp">
        <img src="docs/images/topbar-on-light.webp" width="234" alt="The right end of the top bar with a green Xbox icon">
      </picture>
      <br><sub><b>In the top bar.</b> Grey while nothing is connected, green while a controller is.</sub>
    </td>
  </tr>
</table>

## What it shows

<table>
  <tr>
    <td width="170" valign="top"><strong>Status at a glance</strong></td>
    <td>The icon in the top bar is green while a controller is connected and dimmed while none is.</td>
  </tr>
  <tr>
    <td width="170" valign="top"><strong>Top-bar options</strong></td>
    <td>Two switches in Padlight Settings, both off at first. One puts the battery level beside the icon: with several controllers, the lowest charge, as that controller needs charging first, in orange when it is low. The other hides the icon while no controller is connected, until one connects. While the icon is hidden its menu cannot be opened; Padlight Settings stays in the Extensions app.</td>
  </tr>
  <tr>
    <td width="170" valign="top"><strong>Battery</strong></td>
    <td>The charge, and whether it is charging, for controllers whose driver reports it to UPower. On a cable it reads <em>On USB power</em>. At 20% and below, the battery icon turns orange; the level can be changed in Padlight Settings.</td>
  </tr>
  <tr>
    <td width="170" valign="top"><strong>Low battery alert</strong></td>
    <td>A notification when a controller on batteries reaches the low level, and one more at 10%, with the controller's name and the charge left. Each comes once, until the battery charges back above the level, and a controller that connects with a low battery gets one straight away. None for a controller on a cable. The alert shows even over a full-screen game; during Do Not Disturb it waits in the notification list. It can be switched off in Padlight Settings.</td>
  </tr>
  <tr>
    <td width="170" valign="top"><strong>Connection</strong></td>
    <td>Wired (USB), Bluetooth or the Xbox Wireless Adapter, and the time the controller connected.</td>
  </tr>
  <tr>
    <td width="170" valign="top"><strong>Connection notices</strong></td>
    <td>A short notification when a controller connects, such as <em>Xbox Wireless Controller connected</em> with <em>Bluetooth · 70%</em> underneath, and one when it leaves, wired, over Bluetooth or through the adapter. Controllers already connected when Padlight starts get none. A controller's newest notice replaces the one before, so a quick reconnect leaves one, and a notice leaves the notification list once it has been seen. It shows even over a full-screen game, and can be switched off in Padlight Settings.</td>
  </tr>
  <tr>
    <td width="170" valign="top"><strong>Model and firmware</strong></td>
    <td>The model number on the controller's label, such as 1914 for the Series X|S controller, and the firmware version it reports. The driver and the device file are listed underneath. When a controller on Bluetooth runs older firmware than the newest Padlight knows of, the firmware icon turns orange and a line points to the Xbox Accessories app on Windows or an Xbox console, since Linux has no updater for it. That list of versions ships with Padlight, so it can fall behind until the next release, and firmware is not compared over USB yet.</td>
  </tr>
  <tr>
    <td width="170" valign="top"><strong>In use by</strong></td>
    <td>The programs that have the controller open, such as Steam or a game, worked out each time the menu opens. It helps when a game does not see the controller or sees it twice. Only your own programs are listed, and GNOME Shell itself is left out.</td>
  </tr>
  <tr>
    <td width="170" valign="top"><strong>Live picture</strong></td>
    <td>Buttons, sticks, triggers and the d-pad, mirrored as you press them while the menu is open.</td>
  </tr>
  <tr>
    <td width="170" valign="top"><strong>Stick check</strong></td>
    <td>The <em>Sticks</em> tab under the picture shows each stick's exact position, before any dead zone, how far each trigger is pulled, and where each stick rests once you let go. A stick that rests more than 10% of the way from the centre gets a warning: many games ignore about that much, so beyond it a worn stick can move a game by itself (drift).</td>
  </tr>
  <tr>
    <td width="170" valign="top"><strong>Button checklist</strong></td>
    <td>The <em>Buttons</em> tab: press every button, and each one stays lit on the picture once it has responded, with a count such as <em>12 of 18</em> and a Reset. The triggers count once pulled at least 90% of the way. Handy for checking a used controller. The count lasts while the controller stays connected, also when the menu closes.</td>
  </tr>
  <tr>
    <td width="170" valign="top"><strong>Test Vibration</strong></td>
    <td>A short rumble to check the motors, on controllers that can vibrate.</td>
  </tr>
  <tr>
    <td width="170" valign="top"><strong>Vibration lab</strong></td>
    <td>The <em>Vibration</em> tab, on controllers that can vibrate: how hard the strong motor on the left and the weak motor on the right run, from 0 to 100%, and for how long, from 0.1 to 2 seconds, then Play. The settings stay while the controller is connected. Linux drives only these two motors; the motors in the triggers are not part of it.</td>
  </tr>
  <tr>
    <td width="170" valign="top"><strong>Disconnect</strong></td>
    <td>Disconnects a Bluetooth controller from the computer, through <code>bluetoothctl</code>.</td>
  </tr>
  <tr>
    <td width="170" valign="top"><strong>Several controllers</strong></td>
    <td>One card each, made smaller when there is more than one.</td>
  </tr>
  <tr>
    <td width="170" valign="top"><strong>Bluetooth Settings</strong></td>
    <td>Opens the Bluetooth page of Settings, to pair a new controller.</td>
  </tr>
  <tr>
    <td width="170" valign="top"><strong>Padlight Settings</strong></td>
    <td>Opens Padlight's settings window, which the Extensions app also opens. It holds the battery level that counts as low, from 5% to 50%, the switches for the low battery alerts and for connection notices, and the top-bar options.</td>
  </tr>
  <tr>
    <td width="170" valign="top"><strong>Your theme</strong></td>
    <td>The card takes its colors from the menu around it, so it suits dark and light styles and other shell themes.</td>
  </tr>
</table>

## Get started

You need **GNOME Shell 50**; other versions refuse to load Padlight. You also need **Python 3**, which most distributions include: it runs the small helpers behind the live picture, the vibration test and the <em>In use by</em> line.

```sh
git clone https://github.com/NahuelGenchi/padlight.git
cd padlight
./install.sh
```

Then log out and back in, because GNOME Shell only loads a new extension when you log in. The controller icon appears on the right of the top bar.

| To | Run, from the `padlight` folder |
| :--- | :--- |
| Update | `git pull`, then `./install.sh` again, then log out and back in |
| Remove | `./install.sh --uninstall` |
| Build the package for extensions.gnome.org | `./install.sh --pack` |

<details>
<summary><strong>What the installer does</strong></summary>

<br>

`install.sh` packs `src/` with `gnome-extensions pack`, installs it in `~/.local/share/gnome-shell/extensions/padlight@nahuelgenchi.github.io/` with `gnome-extensions install`, and switches it on for your user. It needs no administrator rights and changes nothing outside your home folder. Once installed, Padlight also appears in the Extensions app, where you can switch it off and on and open its settings.

Padlight keeps its settings with your other GNOME settings, under `/org/gnome/shell/extensions/padlight/`. Removing Padlight leaves them in place; `dconf reset -f /org/gnome/shell/extensions/padlight/` clears them.

Developed on Ubuntu 26.04 with GNOME Shell 50.1 on Wayland. Other distributions have not been tried yet.

</details>

## Controllers

| Controller | Connection | Status |
| :--- | :--- | :--- |
| Xbox Series X\|S controller (model 1914) | USB cable, `xpad` driver | Tried on real hardware |
| Xbox Series X\|S controller (model 1914) | Bluetooth, the kernel's own `hid-microsoft` driver | Tried on real hardware ([#3](https://github.com/NahuelGenchi/padlight/issues/3)). The battery shows its charge, but not whether it is charging: over Bluetooth, the reading comes from BlueZ as a percentage only. |
| Xbox Series X\|S controller | Bluetooth, `xpadneo` driver | Not tried yet ([#13](https://github.com/NahuelGenchi/padlight/issues/13)) |
| Xbox controllers | Xbox Wireless Adapter | Not tried yet ([#14](https://github.com/NahuelGenchi/padlight/issues/14)) |
| Other Xbox and Xbox-compatible controllers | USB or Bluetooth | Recognized, not tried on hardware yet; the picture is always the Series X\|S controller ([#4](https://github.com/NahuelGenchi/padlight/issues/4)) |

Padlight recognizes a controller by Microsoft's vendor ID, by an Xbox name, or by the `xpad`, `xpadneo` or `xone` driver. It leaves out the virtual controllers that Steam Input and game streaming create, so each real controller appears once.

## How it works

```mermaid
flowchart TB
    kernel["<b>Linux</b><br/>/dev/input, sysfs"]
    upower["<b>UPower</b><br/>battery readings"]
    subgraph shell["GNOME Shell"]
        ext["<b>extension.js</b><br/>icon and menu"]
        card["<b>controllerCard.js</b><br/>card, live picture"]
    end
    subgraph helpers["Python helpers"]
        monitor["<b>monitor.py</b><br/>buttons, sticks"]
        rumble["<b>rumble.py</b><br/>vibration"]
    end
    kernel --> shell
    upower --> shell
    ext --> card
    kernel --> monitor
    monitor -->|"while the menu is open"| card
    card -->|"Test Vibration"| rumble
```

Padlight watches `/dev/input`, so a controller shows up about half a second after it connects, wired or not, and a notification says so; the notification waits up to two more seconds for the battery reading. For each one it reads what the kernel knows: the name, the vendor and product, the firmware version, the driver and the Bluetooth address. Battery readings come from UPower, and one that reaches the low level sends a notification. While the menu is open, `monitor.py` passes the controller's button and stick changes to the card, which redraws the picture, the stick check or the button checklist; when the menu closes, the helper stops. Each time the menu opens, `inuse.py` also looks through your own processes in `/proc` for the ones that have the controller's device files open, without reading from the controller.

- **Games keep every input.** The helpers read the controller without taking it over.
- **Nothing leaves your computer.** No network, no administrator rights, no background service. With the menu closed, Padlight only listens for controllers coming and going and for battery changes.

| Path | What is in it |
| :--- | :--- |
| `src/extension.js` | The top-bar button: finds controllers, keeps the menu current, starts the helpers |
| `src/controllers.js` | Finds Xbox controllers in sysfs: connection, model, firmware, driver, device |
| `src/battery.js` | Battery readings from UPower |
| `src/batteryAlerts.js` | When a low battery alert is due, and what it says |
| `src/connectionNotices.js` | Which controllers came and went, and what a connection notice says |
| `src/notifications.js` | Padlight's notifications in the message tray |
| `src/firmware.js` | The newest firmware known for each controller, for the update hint |
| `src/controllerCard.js` | The card: header, the picture, the stick check, the button checklist or the vibration lab and their tabs, tiles, buttons, and the empty state |
| `src/controllerView.js`, `src/controllerArt.js` | The live picture, drawn with cairo |
| `src/controllerCheck.js` | The stick check: the sticks before any dead zone, the triggers, where the sticks rest |
| `src/buttonCheck.js`, `src/checklist.js` | The button checklist: the picture with every pressed button lit, and the count |
| `src/inputMonitor.js` | Runs `monitor.py` for a card while the menu is open |
| `src/monitor.py`, `src/rumble.py` | The helpers: input changes as they happen, and a vibration of a set strength and length |
| `src/vibrationLab.js` | The vibration lab: the two motors' strengths, the length and Play |
| `src/inuse.py` | The helper that finds which programs have a controller open |
| `src/stylesheet.css` | The card's look on dark and light menus |
| `src/prefs.js`, `src/schemas/` | The settings window, and the settings it keeps |
| `src/icons/` | Top-bar icon, USB icon, the controller artwork and its glow |
| `install.sh` | Install, update, pack or remove |
| `tests/` | The checks every PR runs, all through `tests/run.sh`: detection, battery readings and alerts, connection notices and the helpers, on made-up data |

## Roadmap

Padlight is young. What is on this page works today. Next on the list:

- **An icon of its own** for the top bar, instead of the Xbox logo ([#5](https://github.com/NahuelGenchi/padlight/issues/5)).
- **The xpadneo driver and the Xbox Wireless Adapter**, tried on real hardware ([#13](https://github.com/NahuelGenchi/padlight/issues/13), [#14](https://github.com/NahuelGenchi/padlight/issues/14)).
- **Pictures of other controllers**, such as the Elite Series 2 and the Xbox One controller ([#4](https://github.com/NahuelGenchi/padlight/issues/4)).
- **extensions.gnome.org**, to install it with one click ([#6](https://github.com/NahuelGenchi/padlight/issues/6)).
- **Settings and alerts**, such as keeping the screen awake, nicknames, and disconnecting an idle controller ([M4](https://github.com/NahuelGenchi/padlight/milestone/5)).
- **Controller tools**, such as a stick and trigger check, a button checklist, a vibration lab and Find my controller ([M5](https://github.com/NahuelGenchi/padlight/milestone/6)).
- **Translations**, starting with Spanish, and **GNOME 46 to 49** ([#32](https://github.com/NahuelGenchi/padlight/issues/32), [#33](https://github.com/NahuelGenchi/padlight/issues/33)).

| Milestone | Outcome |
| :--- | :--- |
| [M0 — Project foundation](https://github.com/NahuelGenchi/padlight/milestone/1) | Repository, documentation and the way work is tracked |
| [M1 — Indicator and live view](https://github.com/NahuelGenchi/padlight/milestone/2) | The top-bar icon, the card and the live picture, and their fixes |
| [M2 — More controllers](https://github.com/NahuelGenchi/padlight/milestone/3) | Other Xbox models and their pictures, Bluetooth and the adapter on real hardware |
| [M3 — Release](https://github.com/NahuelGenchi/padlight/milestone/4) | Packaging, the extensions.gnome.org listing and versioned releases |
| [M4 — Settings and alerts](https://github.com/NahuelGenchi/padlight/milestone/5) | A settings window, notifications, top-bar options, keeping the screen awake, nicknames and idle disconnect |
| [M5 — Controller tools](https://github.com/NahuelGenchi/padlight/milestone/6) | Checks for the sticks, triggers, buttons and vibration; finding a controller, the apps using it, firmware hints and pairing |

## Contributing

Every change, however small, follows the same trail:

```mermaid
flowchart TB
    issue["<b>Issue</b><br/>goal, scope, milestone"] --> branch["<b>Branch</b><br/>type/issue-slug"] --> pr["<b>Pull request</b><br/>closes the issue,<br/>same milestone"] --> main["<b>main</b>"]
```

Found a bug or have an idea? [Open a work item](https://github.com/NahuelGenchi/padlight/issues/new/choose). Before sending code, read [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/TRACKING.md](docs/TRACKING.md); agents start with [AGENTS.md](AGENTS.md).

## Credits

- The **controller picture** is artwork by Nahuel Genchi.
- The **top-bar icon** is the Xbox logo, a trademark of Microsoft, used to name the controllers Padlight works with. An icon of Padlight's own is planned ([#5](https://github.com/NahuelGenchi/padlight/issues/5)).
- The **Padlight logo** was drawn for this project.

## License

Padlight is free software under the **GNU General Public License, version 2 or any later version** ([GPL-2.0-or-later](LICENSE)). You may use, share and change it; if you share a changed version, share its source under the same terms. The license covers the code, the controller artwork and the Padlight logo. It does not cover the Xbox logo in `src/icons/xbox-symbolic.svg`, which remains Microsoft's trademark.
