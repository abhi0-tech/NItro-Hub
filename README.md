<p align="center">
  <img src="applogo.png" alt="Nitro Hub Logo" width="120" />
</p>

<h1 align="center">Nitro Hub</h1>

<p align="center">
  A lightweight, customizable hardware control center for <strong>Acer Nitro</strong> laptops on Windows, built with <strong>Electron</strong>, <strong>React</strong>, and a background <strong>Windows Service</strong> (<code>NitroHubService</code>).
</p>

<p align="center">
  <a href="https://github.com/abhi0-tech/NItro-Hub/stargazers">
    <img src="https://img.shields.io/github/stars/abhi0-tech/NItro-Hub?style=for-the-badge&color=00e5ff&labelColor=070b12" alt="GitHub Stars" />
  </a>
  <a href="https://github.com/abhi0-tech/NItro-Hub/releases">
    <img src="https://img.shields.io/github/downloads/abhi0-tech/NItro-Hub/total?style=for-the-badge&color=00e5ff&labelColor=070b12" alt="Total Downloads" />
  </a>
  <a href="https://github.com/abhi0-tech/NItro-Hub/releases/latest">
    <img src="https://img.shields.io/github/v/release/abhi0-tech/NItro-Hub?style=for-the-badge&color=00e5ff&labelColor=070b12" alt="Latest Release" />
  </a>
</p>

<p align="center">
  <a href="https://github.com/abhi0-tech/NItro-Hub/releases/latest">
    <img src="https://img.shields.io/badge/Download_Latest_Release-Windows_x64-00e5ff?style=for-the-badge&logo=windows&logoColor=000000" alt="Download Latest Release" />
  </a>
</p>

---

## Download

Get the latest Windows x64 installer directly from the [**Latest Release**](https://github.com/abhi0-tech/NItro-Hub/releases/latest) page.

---

## Screenshots
- Homepage

<img width="1919" height="1009" alt="image" src="https://github.com/user-attachments/assets/f049acc2-f011-428f-ae75-761d7d940550" />

---

## Features

- **Home Dashboard**:
  - **My Rig** overview displaying your system model, processor, graphics, memory, total storage, Windows version, and BIOS version.
  - Real-time **CPU / GPU / System** temperature gauges with live CPU and GPU frequency readouts.
  - Live CPU and GPU utilization curve graphs and quick **Windows Update** checker.
  - Mode-synced metallic Nitro logo and laptop model artwork.
- **Scenario & Fan Control**:
  - Switch between **Quiet**, **Eco**, **Balanced**, **Performance**, and **Turbo** operating modes (automatically respecting AC/battery power limits).
  - Large animated spinning **Cooling fans** with live RPM readouts and per-component temperatures.
  - **Auto**, **Max**, and **Custom** fan control with per-fan fixed boost sliders, **CoolBoost**, **EC Fan Table** selection, and **Dust Defender**.
  - Interactive **Fan Curve Graph Editor** to customize temperature-to-fan-boost curves.
- **Lighting (4-Zone Keyboard RGB & UI Accent)**:
  - Live interactive 4-zone ANSI keyboard preview.
  - **Static** mode with per-zone color pickers, zone toggles, Sync All, brightness control, and customizable add/delete color presets.
  - **Animated** mode with built-in and custom effects (*Breathing*, *Neon*, *Wave*, *Shifting*, *Zoom*, *Meteor*, *Twinkling*, *Aurora*, *Dual Pulse*, *Spectrum*, *Dual Comet*), per-effect speed memory, and direction controls.
  - **Backlight Auto-Off** and **Fn Lock** toggles.
  - Customizable **Interface Accent Color** presets and custom color picker.
- **Power & Boot**:
  - **Battery Charge Limit (80%)** synced with Acer firmware / BatteryControl.
  - **Power-off USB Charging** toggle.
  - **GPU MUX Mode** switching (*Hybrid*, *Discrete*, *Automatic*).
  - **Boot Logo** customization via **HackBGRT** with active EFI splash detection, automatic HackBGRT update checks, and guided Secure Boot MOKManager instructions.
- **Monitoring**:
  - Real-time CPU and GPU telemetry curve graphs with peak tracking, temperature gauges, RAM usage, and one-click hardware diagnostics export.
- **Settings & System Tray**:
  - **Start with Windows** (minimized to system tray by default) and configurable close behavior (*Minimize to Tray*, *Exit on Close*, or *Ask Every Time*).
  - System tray menu with quick **Scenario Mode** switching.
  - Runs without requiring UAC admin prompts on every launch (`NitroHubService` handles hardware access in the background).
  - Configurable **Debug Window** shortcut (`Shift+F12` by default) and optional toolbar toggle.

---

## Supported Models

Nitro Hub probes your laptop's firmware capabilities automatically and supports **Acer Nitro** and **Predator** series laptops on Windows 10 / 11, including:

### Acer Nitro
- **Nitro 5**: `AN515` (`AN515-45`, `AN515-58`), `AN517` (`AN517-41`)
- **Nitro 16 / 17 / 18**: `AN16` (`AN16-41`, `AN16-61`, `AN16-73`), `AN17` (`AN17-41`), `AN18` (`AN18-61`)
- **Nitro V 14 / 15 / 16 / 17**: `ANV14` (`ANV14-61`, `ANV14-62`), `ANV15` (`ANV15-42`, `ANV15-51`, `ANV15-52`), `ANV16` (`ANV16-61`, `ANV16-71`), `ANV16S` (`ANV16S-41`, `ANV16S-61`), `ANV17` (`ANV17-61`)
- **Nitro Lite 16**: `NL16` (`NL16-71`)

### Acer Predator
- **Helios**: `PH16` (`PH16-71`), `PH18` (`PH18-71`), `PH315` (`PH315-54`, `PH315-55S`), `PH517` (`PH517-52`), `PH3D15` (`PH3D15-71`)
- **Helios Neo**: `PHN14` (`PHN14-51`), `PHN16` (`PHN16-71`, `PHN16-72`, `PHN16-73`), `PHN16S` (`PHN16S-71`), `PHN18` (`PHN18-72`)
- **Triton**: `PT14` (`PT14-51`, `PT14-52T`), `PT16` (`PT16-51`), `PTX17` (`PTX17-71`), `PT314` (`PT314-52S`), `PT516` (`PT516-52S`), `PTN16` (`PTN16-51`)

*Other Acer gaming laptops with Acer WMI (`AcerGamingFunction`) firmware support also work automatically.*

## Building from Source

### Prerequisites
- **Node.js** (18+)
- **.NET 9 SDK** (for building `NitroHubService`)
- **Windows 10 / 11**

---

### Commands
```bash
# Install dependencies
npm install

# Build the .NET hardware service + React UI + Windows Installer
npm run dist
```

The installer will be generated in `dist_electron/`.

---

AI was used as coding assist for the app, testing and security is done to ensure security and functionality are in place.

## Credits

- **Acer Crate** ([`vergulesmatvey-oss/Acer-Crate`](https://github.com/vergulesmatvey-oss/Acer-Crate)) — For Acer hardware config files.
