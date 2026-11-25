<p align="center">
  <img src="applogo.png" alt="Nitro Hub Logo" width="120" />
</p>

<h1 align="center">Nitro Hub</h1>

<p align="center">
  A lightweight, customizable hardware control center for <strong>Acer Nitro</strong> laptops on Windows, built with <strong>Electron</strong>, <strong>React</strong>, and a background <strong>Windows Service</strong> (<code>NitroHubService</code>).
</p>

<p align="center">
  <a href="https://github.com/abhi0-tech/NItro-Hub/stargazers">
    <img src="https://img.shields.io/github/stars/abhi0-tech/NItro-Hub?style=flat&color=52525b&labelColor=18181b" alt="GitHub Stars" />
  </a>
  <a href="https://github.com/abhi0-tech/NItro-Hub/releases">
    <img src="https://img.shields.io/github/downloads/abhi0-tech/NItro-Hub/total?style=flat&color=52525b&labelColor=18181b" alt="Total Downloads" />
  </a>
  <a href="https://github.com/abhi0-tech/NItro-Hub/releases/latest">
    <img src="https://img.shields.io/github/v/release/abhi0-tech/NItro-Hub?style=flat&color=52525b&labelColor=18181b" alt="Latest Release" />
  </a>
</p>

<p align="center">
  <a href="https://github.com/abhi0-tech/NItro-Hub/releases/latest/download/Nitro.Hub.1.0.0.x64.exe">
    <img src="https://img.shields.io/badge/Download_Latest_Release-Windows_x64-52525b?style=flat&logo=windows&logoColor=ffffff&labelColor=18181b" alt="Download Latest Release" />
  </a>
</p>

---

## Download

Get the latest Windows x64 installer directly from the [**Latest Release**](https://github.com/abhi0-tech/NItro-Hub/releases/latest) page.

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

## Building from Source

### Prerequisites
- **Node.js** (18+)
- **.NET 9 SDK** (for building `NitroHubService`)
- **Windows 10 / 11**

### Commands
```bash
# Install dependencies
npm install

# Build the .NET hardware service + React UI + Windows Installer
npm run dist
```

The installer will be generated in `dist_electron/`.

---

## Credits

- **Acer Crate** ([`vergulesmatvey-oss/Acer-Crate`](https://github.com/vergulesmatvey-oss/Acer-Crate)) — For Acer hardware config reference.
