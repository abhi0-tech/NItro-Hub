import { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } from 'electron';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import { ServiceClient } from './main/hardware/service-client.js';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const service = new ServiceClient();
let mainWindow = null;
let tray = null;
let isQuitting = false;
let unsubscribeService = null;
let serviceConnected = false;
let lastServiceError = null;
let latestGpuMhz = 0;
let lastGpuPollAt = 0;
let latestSnapshot = null;
let latestOperatingMode = 'Balanced';
let startupModeApplied = false;
const debugLogs = [];

function addDebugLog(level, category, message) {
  const now = new Date();
  const timestamp = now.toTimeString().slice(0, 8) + '.' + String(now.getMilliseconds()).padStart(3, '0');
  const entry = { timestamp, level, category, message: String(message) };
  debugLogs.push(entry);
  if (debugLogs.length > 250) debugLogs.shift();
  sendToRenderer('nitro:log', entry);
}

const getHackbgrtDir = () => (app.isPackaged
  ? path.join(process.resourcesPath, 'hackbgrt')
  : path.join(__dirname, 'hackbgrt'));

function getHostMetrics() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const ramUsage = totalMem > 0 ? Math.round(((totalMem - freeMem) / totalMem) * 100) : 0;
  const cpus = os.cpus();
  const cpuMhz = cpus?.[0]?.speed || 0;
  return { ramUsage, cpuMhz, gpuMhz: latestGpuMhz };
}

async function pollGpuMhzIfAwake(gpuAsleep) {
  if (gpuAsleep) {
    latestGpuMhz = 0;
    return;
  }
  const now = Date.now();
  if (now - lastGpuPollAt < 2000) return;
  lastGpuPollAt = now;
  try {
    const { stdout } = await execFileAsync(
      'nvidia-smi',
      ['--query-gpu=clocks.gr', '--format=csv,noheader,nounits'],
      { windowsHide: true, timeout: 1500 }
    );
    const val = parseInt(String(stdout).trim().split(/\r?\n/)[0], 10);
    if (Number.isFinite(val)) latestGpuMhz = val;
  } catch {
    // nvidia-smi unavailable or GPU asleep
  }
}

async function ensureWindowsService() {
  // Fast-path: if NitroHubService is already running, connect immediately without spawning sc.exe
  try {
    const ping = await service.ping();
    if (ping?.ok === true) {
      lastServiceError = null;
      addDebugLog('Information', 'Electron', `Service ping OK (engineState=${ping?.engineState})`);
      return { ok: true, engineState: ping?.engineState };
    }
  } catch {
    // Not yet reachable; fall through to SCM check/start
  }

  if (!app.isPackaged) {
    const devExe = path.join(__dirname, 'service-publish', 'NitroHubService.exe');
    if (!fs.existsSync(devExe)) {
      lastServiceError = 'Dev service not built. Run: npm run build-service';
      addDebugLog('Warning', 'Electron', lastServiceError);
      return { ok: false, error: lastServiceError };
    }
    try {
      await execFileAsync('sc.exe', ['query', 'NitroHubService'], { windowsHide: true });
    } catch {
      try {
        await execFileAsync('sc.exe', [
          'create', 'NitroHubService',
          'binPath=', `"${devExe}"`,
          'start=', 'auto',
          'DisplayName=', 'Nitro Hub Hardware Service',
          'obj=', 'LocalSystem',
          'type=', 'own',
        ], { windowsHide: true });
        addDebugLog('Information', 'Electron', 'Registered dev NitroHubService');
      } catch (err) {
        addDebugLog('Warning', 'Electron', `Dev sc create failed: ${err.message}`);
      }
    }
  } else {
    try {
      await execFileAsync('sc.exe', ['query', 'NitroHubService'], { windowsHide: true });
    } catch (err) {
      lastServiceError = 'NitroHubService is not installed in Windows SCM. Please reinstall with the setup wizard.';
      addDebugLog('Error', 'Electron', `${lastServiceError} (${err.message})`);
    }
  }

  await execFileAsync('sc.exe', ['start', 'NitroHubService'], { windowsHide: true }).catch(err => {
    const msg = String(err.message);
    if (!msg.includes('already been started') && !msg.includes('1056')) {
      addDebugLog('Warning', 'Electron', `sc start: ${msg}`);
    }
  });

  try {
    const ping = await service.ping();
    lastServiceError = null;
    addDebugLog('Information', 'Electron', `Service ping OK (engineState=${ping?.engineState})`);
    return { ok: ping?.ok === true, engineState: ping?.engineState };
  } catch (error) {
    lastServiceError = error.message;
    addDebugLog('Error', 'Electron', `Service unreachable: ${error.message}`);
    return { ok: false, error: error.message };
  }
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function startServiceSubscription() {
  if (unsubscribeService) unsubscribeService();
  unsubscribeService = service.subscribe({
    onConnected: () => {
      serviceConnected = true;
      lastServiceError = null;
      addDebugLog('Information', 'IPC', 'Connected to NitroHubService (127.0.0.1:47631)');
      sendToRenderer('nitro:service-status', { connected: true });
    },
    onDisconnected: () => {
      const wasConnected = serviceConnected;
      serviceConnected = false;
      if (wasConnected) addDebugLog('Warning', 'IPC', 'Disconnected from NitroHubService');
      sendToRenderer('nitro:service-status', { connected: false });
    },
    onLogs: (logs) => {
      for (const entry of logs) {
        debugLogs.push(entry);
        if (debugLogs.length > 250) debugLogs.shift();
      }
      sendToRenderer('nitro:logs-init', debugLogs);
    },
    onLog: (entry) => {
      debugLogs.push(entry);
      if (debugLogs.length > 250) debugLogs.shift();
      sendToRenderer('nitro:log', entry);
    },
    onSnapshot: (snapshot) => {
      latestSnapshot = snapshot;
      const mode = snapshot?.latest?.operatingMode || snapshot?.settings?.profile?.operatingMode;
      if (mode && mode !== latestOperatingMode) {
        latestOperatingMode = mode;
        updateTrayMenu();
      } else if (tray) {
        updateTrayMenu();
      }
      // On first connect after startup, re-apply the user's last saved operating mode if firmware/NitroSense reset it
      if (!startupModeApplied) {
        startupModeApplied = true;
        const prefs = readPrefs();
        const savedMode = prefs.savedOperatingMode;
        const supported = snapshot?.capabilities?.operatingModes || [];
        if (savedMode && supported.includes(savedMode) && mode !== savedMode) {
          const baseProfile = snapshot?.settings?.profile || { mode: 'Auto', operatingMode: savedMode };
          service.setProfile({ ...baseProfile, operatingMode: savedMode }).catch(() => {});
        }
      }
      sendToRenderer('nitro:snapshot-update', snapshot);
    },
    onTelemetry: (telemetry) => {
      pollGpuMhzIfAwake(telemetry?.gpuAsleep);
      if (telemetry?.operatingMode && telemetry.operatingMode !== latestOperatingMode) {
        latestOperatingMode = telemetry.operatingMode;
        updateTrayMenu();
      }
      sendToRenderer('nitro:telemetry', { ...telemetry, ...getHostMetrics() });
    },
    onNotice: (notice) => sendToRenderer('nitro:notice', notice),
    onRebuilt: (snapshot) => {
      latestSnapshot = snapshot;
      const mode = snapshot?.latest?.operatingMode || snapshot?.settings?.profile?.operatingMode;
      if (mode) {
        latestOperatingMode = mode;
        updateTrayMenu();
      }
      sendToRenderer('nitro:snapshot-update', snapshot);
    },
    onSettings: (settings) => {
      if (latestSnapshot && settings) {
        latestSnapshot = { ...latestSnapshot, settings };
        const mode = settings?.profile?.operatingMode;
        if (mode && mode !== latestOperatingMode) {
          latestOperatingMode = mode;
          updateTrayMenu();
        }
      }
      sendToRenderer('nitro:settings', settings);
    },
  });
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function getAssetOnDisk(filename) {
  if (app.isPackaged) {
    const resPath = path.join(process.resourcesPath, filename);
    if (fs.existsSync(resPath)) return resPath;
  }
  return path.join(__dirname, filename);
}

function updateTrayMenu() {
  if (!tray) return;
  const modes = latestSnapshot?.capabilities?.operatingModes?.length
    ? latestSnapshot.capabilities.operatingModes
    : ['Quiet', 'Balanced', 'Performance'];
  const currentMode = latestOperatingMode
    || latestSnapshot?.latest?.operatingMode
    || latestSnapshot?.settings?.profile?.operatingMode
    || 'Balanced';

  const modeSubmenu = modes.map((mode) => ({
    label: mode,
    type: 'radio',
    checked: currentMode === mode,
    click: async () => {
      latestOperatingMode = mode;
      updateTrayMenu();
      const prefs = readPrefs();
      writePrefs({ ...prefs, savedOperatingMode: mode });
      try {
        const curProfile = latestSnapshot?.settings?.profile || {
          mode: 'Auto',
          operatingMode: mode,
        };
        await service.setProfile({ ...curProfile, operatingMode: mode });
      } catch (err) {
        addDebugLog('Warning', 'Tray', `Failed to switch mode to ${mode}: ${err.message}`);
      }
    },
  }));

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Nitro Hub', click: showMainWindow },
    { type: 'separator' },
    {
      label: `Scenario Mode (${currentMode})`,
      submenu: modeSubmenu,
    },
    { type: 'separator' },
    { label: 'Quit Nitro Hub', click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(contextMenu);
}

const startedAtLogin = process.argv.includes('--startup');

function getPrefsPath() {
  return path.join(app.getPath('userData'), 'app-prefs.json');
}

function readPrefs() {
  try {
    return JSON.parse(fs.readFileSync(getPrefsPath(), 'utf8'));
  } catch {
    return {};
  }
}

function writePrefs(next) {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(getPrefsPath(), JSON.stringify(next, null, 2), 'utf8');
  } catch {}
}

async function ensureDefaultAutoStart() {
  const prefs = readPrefs();
  if (!prefs.autoStartInitialized) {
    if (app.isPackaged) {
      let hasTask = false;
      try {
        const { stdout } = await execFileAsync('schtasks.exe', ['/Query', '/TN', 'NitroHubAutoStart', '/FO', 'LIST'], { windowsHide: true });
        hasTask = /Status:\s*(Ready|Running)/i.test(stdout);
      } catch {}
      if (hasTask) {
        app.setLoginItemSettings({ openAtLogin: false, path: app.getPath('exe'), args: ['--startup'] });
      } else {
        app.setLoginItemSettings({ openAtLogin: true, path: app.getPath('exe'), args: ['--startup'] });
      }
    }
    writePrefs({ ...prefs, autoStartInitialized: true });
  }
}

function createTray() {
  if (tray) return;
  const icoPath = getAssetOnDisk('applogo.ico');
  const pngPath = getAssetOnDisk('applogo.png');
  const iconArg = fs.existsSync(icoPath)
    ? icoPath
    : nativeImage.createFromPath(pngPath).resize({ width: 32, height: 32 });
  tray = new Tray(iconArg);
  tray.setToolTip('Nitro Hub');
  updateTrayMenu();
  tray.on('click', showMainWindow);
  tray.on('double-click', showMainWindow);
}

function createWindow() {
  try { os.setPriority(os.constants.priority.PRIORITY_ABOVE_NORMAL); } catch {}
  ensureDefaultAutoStart();
  const win = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 1100,
    minHeight: 800,
    show: !startedAtLogin,
    backgroundColor: '#030508',
    icon: getAssetOnDisk('applogo.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
    resizable: true,
    frame: false,
    titleBarStyle: 'hidden',
  });

  mainWindow = win;
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    const allowed = app.isPackaged ? url.startsWith('file://') : url.startsWith('http://localhost:5173');
    if (!allowed) event.preventDefault();
  });
  if (!startedAtLogin) {
    win.maximize();
    win.show();
  }
  createTray();

  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      sendToRenderer('nitro:request-close', {});
    }
  });

  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, 'dist/index.html'));
  } else {
    win.loadURL('http://localhost:5173');
  }

  win.webContents.once('did-finish-load', async () => {
    console.log('[Main] UI Ready. Connecting to NitroHubService (HubEngine)...');
    await ensureWindowsService();
    startServiceSubscription();
  });
}

// --- NITRO HUB IPC HANDLERS ---

ipcMain.handle('nitro:snapshot', async () => {
  try {
    const res = await service.getSnapshot();
    if (res?.ok && res.snapshot) {
      return { ok: true, connected: true, snapshot: res.snapshot, host: getHostMetrics() };
    }
    return { ok: false, connected: serviceConnected, error: res?.error || 'Snapshot unavailable' };
  } catch (err) {
    return { ok: false, connected: false, error: err.message };
  }
});

ipcMain.handle('nitro:set-profile', async (_event, profile) => {
  if (!profile || typeof profile !== 'object') throw new Error('Invalid profile');
  if (profile.operatingMode) {
    latestOperatingMode = profile.operatingMode;
    updateTrayMenu();
    const prefs = readPrefs();
    writePrefs({ ...prefs, savedOperatingMode: profile.operatingMode });
  }
  return service.setProfile(profile);
});

ipcMain.handle('nitro:set-lighting', async (_event, lighting) => {
  if (!lighting || typeof lighting !== 'object') throw new Error('Invalid lighting');
  return service.setLighting(lighting);
});

ipcMain.handle('nitro:set-keyboard', async (_event, keyboard) => {
  if (!keyboard || typeof keyboard !== 'object') throw new Error('Invalid keyboard');
  return service.setKeyboard(keyboard);
});

ipcMain.handle('nitro:set-power', async (_event, power) => {
  if (!power || typeof power !== 'object') throw new Error('Invalid power');
  return service.setPower(power);
});

ipcMain.handle('nitro:set-gpu-mode', async (_event, mode) => {
  if (!['Hybrid', 'Discrete', 'Automatic'].includes(mode)) throw new Error('Invalid GPU mode');
  return service.setGpuMode(mode);
});

ipcMain.handle('nitro:start-dust-defender', async () => service.startDustDefender());

ipcMain.handle('nitro:read-battery-health', async () => service.readBatteryHealth());

ipcMain.handle('nitro:set-overrides', async (_event, overrides) => {
  if (!overrides || typeof overrides !== 'object') throw new Error('Invalid overrides');
  return service.setOverrides(overrides);
});

ipcMain.handle('nitro:get-diagnostics', async () => service.getDiagnostics());

ipcMain.handle('nitro:retry-service', async () => {
  addDebugLog('Information', 'Electron', 'Retrying service connection...');
  const res = await ensureWindowsService();
  startServiceSubscription();
  return res;
});

ipcMain.handle('nitro:install-service', async () => {
  const exePath = app.isPackaged
    ? path.join(path.dirname(app.getPath('exe')), 'nitro-service', 'NitroHubService.exe')
    : path.join(__dirname, 'service-publish', 'NitroHubService.exe');
  if (!fs.existsSync(exePath)) {
    const msg = `Service binary not found at ${exePath}`;
    addDebugLog('Error', 'Electron', msg);
    return { ok: false, error: msg };
  }
  addDebugLog('Information', 'Electron', `Registering NitroHubService -> ${exePath}`);
  await execFileAsync('sc.exe', ['stop', 'NitroHubService'], { windowsHide: true }).catch(() => {});
  await execFileAsync('sc.exe', ['delete', 'NitroHubService'], { windowsHide: true }).catch(() => {});
  await new Promise(r => setTimeout(r, 1000));
  try {
    await execFileAsync('sc.exe', [
      'create', 'NitroHubService',
      'binPath=', exePath,
      'start=', 'auto',
      'DisplayName=', 'Nitro Hub Hardware Service',
      'obj=', 'LocalSystem',
      'type=', 'own',
    ], { windowsHide: true });
    await execFileAsync('sc.exe', ['start', 'NitroHubService'], { windowsHide: true });
    await new Promise(r => setTimeout(r, 1000));
    startServiceSubscription();
    addDebugLog('Information', 'Electron', 'NitroHubService registered and started.');
    return { ok: true };
  } catch (err) {
    addDebugLog('Error', 'Electron', `Service install failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('nitro:get-debug-info', async () => {
  let scmOutput = '';
  try {
    const { stdout } = await execFileAsync('sc.exe', ['query', 'NitroHubService'], { windowsHide: true });
    scmOutput = stdout.trim();
  } catch (err) {
    scmOutput = err.message;
  }
  return {
    connected: serviceConnected,
    lastError: lastServiceError,
    scmStatus: scmOutput,
    packaged: app.isPackaged,
    installDir: app.isPackaged ? path.dirname(app.getPath('exe')) : __dirname,
    logs: debugLogs,
  };
});

// --- WINDOW & SYSTEM UTILITIES ---

ipcMain.on('window-minimize', () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  }
});
ipcMain.on('window-close', () => { if (mainWindow) mainWindow.close(); });
ipcMain.on('window-close-tray', () => { if (mainWindow) mainWindow.hide(); });
ipcMain.on('app-quit', () => { isQuitting = true; app.quit(); });
ipcMain.on('open-external', (_event, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    shell.openExternal(url);
  }
});

ipcMain.on('open-windows-update', () => {
  shell.openExternal('ms-settings:windowsupdate');
});

ipcMain.on('launch-nvidia', () => {
  const candidates = [
    'C:\\Program Files\\NVIDIA Corporation\\NVIDIA app\\CEF\\NVIDIA app.exe',
    'C:\\Program Files\\NVIDIA Corporation\\Control Panel Client\\nvcplui.exe',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) { shell.openPath(p); return; }
  }
  shell.openExternal('https://www.nvidia.com/en-us/software/nvidia-app/');
});

ipcMain.handle('check-windows-updates', async () => {
  const script = `
    try {
      $sess = New-Object -ComObject Microsoft.Update.Session
      $searcher = $sess.CreateUpdateSearcher()
      $result = $searcher.Search("IsInstalled=0 and Type='Software' and IsHidden=0")
      $count = $result.Updates.Count
      $titles = @()
      for ($i = 0; $i -lt [Math]::Min($count, 8); $i++) {
        $titles += $result.Updates.Item($i).Title
      }
      @{ count = $count; updates = $titles; error = $null } | ConvertTo-Json -Compress
    } catch {
      @{ count = 0; updates = @(); error = $_.Exception.Message } | ConvertTo-Json -Compress
    }
  `;
  try {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const { stdout } = await execAsync(
      `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
      { windowsHide: true, timeout: 25000 }
    );
    return stdout ? JSON.parse(stdout) : { count: 0, updates: [], error: 'No response' };
  } catch (e) {
    return { count: 0, updates: [], error: e.message };
  }
});

ipcMain.handle('get-auto-start', async () => {
  const settings = app.getLoginItemSettings({ path: app.getPath('exe'), args: ['--startup'] });
  let taskEnabled = false;
  try {
    const { stdout } = await execFileAsync('schtasks.exe', ['/Query', '/TN', 'NitroHubAutoStart', '/FO', 'LIST'], { windowsHide: true });
    taskEnabled = /Status:\s*(Ready|Running)/i.test(stdout);
  } catch {}
  return { openAtLogin: Boolean(settings.openAtLogin || taskEnabled) };
});

ipcMain.handle('set-auto-start', async (_event, enabled) => {
  const openAtLogin = Boolean(enabled);
  let taskConfigured = false;
  try {
    if (openAtLogin) {
      await execFileAsync('schtasks.exe', [
        '/Create', '/TN', 'NitroHubAutoStart',
        '/TR', `"${app.getPath('exe')}" --startup`,
        '/SC', 'ONLOGON', '/F',
      ], { windowsHide: true });
      taskConfigured = true;
    } else {
      await execFileAsync('schtasks.exe', ['/Delete', '/TN', 'NitroHubAutoStart', '/F'], { windowsHide: true }).catch(() => {});
    }
  } catch {}
  app.setLoginItemSettings({
    openAtLogin: openAtLogin && !taskConfigured,
    path: app.getPath('exe'),
    args: ['--startup'],
  });
  const prefs = readPrefs();
  writePrefs({ ...prefs, autoStartInitialized: true });
  return { ok: true, openAtLogin };
});

ipcMain.handle('get-system-specs', async () => {
  const totalRamGb = Math.round(os.totalmem() / (1024 * 1024 * 1024));
  let totalStorageGb = null;
  let windowsName = `Windows ${os.release()}`;
  try {
    const script = `
      $os = (Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue).Caption
      $diskBytes = (Get-CimInstance Win32_DiskDrive -ErrorAction SilentlyContinue | Measure-Object -Property Size -Sum).Sum
      if (-not $diskBytes) {
        $diskBytes = (Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" -ErrorAction SilentlyContinue | Measure-Object -Property Size -Sum).Sum
      }
      @{ os = $os; diskBytes = $diskBytes } | ConvertTo-Json -Compress
    `;
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const { stdout } = await execAsync(
      `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
      { windowsHide: true, timeout: 8000 }
    );
    if (stdout) {
      const parsed = JSON.parse(stdout.trim());
      if (parsed.os) windowsName = String(parsed.os).replace(/^Microsoft\s+/i, '').trim();
      if (parsed.diskBytes > 0) totalStorageGb = Math.round(parsed.diskBytes / 1000000000);
    }
  } catch {}
  return { totalRamGb, totalStorageGb, windowsName };
});

ipcMain.handle('hackbgrt-check-update', async () => {
  let currentVersion = '2.6.0';
  try {
    const changelog = fs.readFileSync(path.join(getHackbgrtDir(), 'CHANGELOG.md'), 'utf8');
    const m = /^##\s+(\d+\.\d+\.\d+)/m.exec(changelog);
    if (m) currentVersion = m[1];
  } catch {}

  try {
    const res = await fetch('https://api.github.com/repos/Metabolix/HackBGRT/releases/latest', {
      headers: { 'User-Agent': 'Nitro-Hub', Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const latestVersion = String(data.tag_name || '').replace(/^v/i, '').trim();
    const cmp = (a, b) => {
      const pa = a.split('.').map(n => parseInt(n, 10) || 0);
      const pb = b.split('.').map(n => parseInt(n, 10) || 0);
      for (let i = 0; i < 3; i++) {
        if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
      }
      return 0;
    };
    const updateAvailable = Boolean(latestVersion && cmp(latestVersion, currentVersion) > 0);
    return {
      ok: true,
      currentVersion,
      latestVersion: latestVersion || currentVersion,
      updateAvailable,
      releaseUrl: data.html_url || 'https://github.com/Metabolix/HackBGRT/releases/latest',
    };
  } catch (err) {
    return { ok: false, currentVersion, error: err.message };
  }
});

ipcMain.handle('hackbgrt-status', async () => {
  // Prefer NitroHubService (runs as LocalSystem, reads EFI partition with zero UAC prompt)
  try {
    const svcRes = await service.getHackbgrtStatus();
    if (svcRes?.ok) {
      return {
        installed: Boolean(svcRes.installed),
        bgrtEntry: Boolean(svcRes.bgrtEntry),
        hasSplash: Boolean(svcRes.hasSplash),
        splashDataUrl: svcRes.splashBase64 ? `data:image/bmp;base64,${svcRes.splashBase64}` : null,
        error: svcRes.error || null,
      };
    }
  } catch {
    // Fallback to local check if service not yet connected
  }
  const workDir = 'C:\\ProgramData\\NitroHub';
  const tmpResult = path.join(workDir, 'hackbgrt_status.json');
  const script = `
$ErrorActionPreference = 'Stop'
$out = @{ installed = $false; hasSplash = $false; splashBase64 = $null; bgrtEntry = $false; error = $null }
try {
  $fw = & bcdedit /enum firmware 2>$null | Out-String
  if ($fw -match 'HackBGRT') { $out.bgrtEntry = $true }
  $used = (Get-PSDrive -PSProvider FileSystem | Select-Object -ExpandProperty Name)
  $letter = 'GHIJKLMNOPQRSTUVWXYZ'.ToCharArray() | Where-Object { $used -notcontains $_ } | Select-Object -First 1
  if ($letter) {
    mountvol "$($letter):" /S 2>&1 | Out-Null
    Start-Sleep -Milliseconds 350
    try {
      $hackDir = "$($letter):\\EFI\\HackBGRT"
      if (Test-Path $hackDir) {
        $out.installed = $true
        $splash = "$hackDir\\splash.bmp"
        if (Test-Path $splash) {
          $out.hasSplash = $true
          $out.splashBase64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($splash))
        }
      }
    } finally {
      mountvol "$($letter):" /D 2>&1 | Out-Null
    }
  }
} catch {
  $out.error = $_.Exception.Message
}
$out | ConvertTo-Json -Compress
`;
  try {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const { stdout } = await execAsync(
      `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
      { windowsHide: true, timeout: 15000 }
    );
    if (!stdout) return { installed: false, hasSplash: false, error: 'No response' };
    const parsed = JSON.parse(stdout.trim());
    return {
      installed: Boolean(parsed.installed),
      bgrtEntry: Boolean(parsed.bgrtEntry),
      hasSplash: Boolean(parsed.hasSplash),
      splashDataUrl: parsed.splashBase64 ? `data:image/bmp;base64,${parsed.splashBase64}` : null,
      error: parsed.error || null,
    };
  } catch (err) {
    return { installed: false, hasSplash: false, error: err.message };
  }
});

ipcMain.handle('install-hackbgrt', async () => {
  const srcDir = getHackbgrtDir();
  const setupExe = path.join(srcDir, 'setup.exe');
  if (!fs.existsSync(setupExe)) {
    return { ok: false, msg: 'HackBGRT setup files not found in the app bundle.' };
  }
  const workDir = path.join(app.getPath('temp'), 'nitro-hub-hackbgrt');
  try {
    if (fs.existsSync(workDir)) fs.rmSync(workDir, { recursive: true, force: true });
    fs.mkdirSync(workDir, { recursive: true });
    fs.cpSync(srcDir, workDir, { recursive: true });
    await execAsync(
      `powershell -NonInteractive -Command "Start-Process '${workDir}\\setup.exe' -Verb RunAs -Wait -WorkingDirectory '${workDir}'"`,
      { timeout: 120000 }
    );
    return { ok: true, msg: 'HackBGRT setup completed. Now try applying your boot logo.' };
  } catch (err) {
    if (err.message?.includes('canceled') || err.message?.includes('cancelled'))
      return { ok: false, msg: 'Setup was cancelled or UAC was denied.' };
    return { ok: false, msg: `Install error: ${err.message}` };
  }
});

function encodeNativeImageToBmp24(img) {
  const { width, height } = img.getSize();
  if (!width || !height || width > 4096 || height > 4096) {
    throw new Error('Invalid image dimensions.');
  }
  const bgra = img.toBitmap();
  const rowSize = Math.floor((width * 3 + 3) / 4) * 4;
  const pixelArraySize = rowSize * height;
  const fileSize = 54 + pixelArraySize;
  const buf = Buffer.alloc(fileSize);

  // BITMAPFILEHEADER (14 bytes)
  buf.write('BM', 0, 2, 'ascii');
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(54, 10);

  // BITMAPINFOHEADER (40 bytes)
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(pixelArraySize, 34);

  // Bottom-up BGR rows
  for (let y = 0; y < height; y++) {
    const srcRow = (height - 1 - y) * width * 4;
    const dstRow = 54 + y * rowSize;
    for (let x = 0; x < width; x++) {
      const s = srcRow + x * 4;
      const d = dstRow + x * 3;
      buf[d] = bgra[s];         // B
      buf[d + 1] = bgra[s + 1]; // G
      buf[d + 2] = bgra[s + 2]; // R
    }
  }
  return buf;
}

ipcMain.handle('hackbgrt-apply', async (_event, payload) => {
  try {
    let img = null;
    if (payload && typeof payload === 'object' && typeof payload.dataBase64 === 'string') {
      const rawBuf = Buffer.from(payload.dataBase64, 'base64');
      if (rawBuf.length === 0 || rawBuf.length > 25 * 1024 * 1024) {
        return { ok: false, msg: 'Invalid image file size.' };
      }
      // If already an uncompressed 24-bit BMP, send directly to service
      if (rawBuf.length >= 54 && rawBuf[0] === 0x42 && rawBuf[1] === 0x4d && rawBuf.readUInt16LE(28) === 24 && rawBuf.readUInt32LE(30) === 0) {
        const svcRes = await service.applyHackbgrtSplash(rawBuf.toString('base64'));
        return svcRes || { ok: false, msg: 'Hardware service did not respond.' };
      }
      img = nativeImage.createFromBuffer(rawBuf);
    } else if (typeof payload === 'string' && payload) {
      const resolved = path.resolve(payload);
      const ext = path.extname(resolved).toLowerCase();
      if (!['.png', '.jpg', '.jpeg', '.bmp'].includes(ext)) {
        return { ok: false, msg: 'Unsupported file type. Use PNG, JPG, or BMP.' };
      }
      const stat = fs.statSync(resolved);
      if (!stat.isFile() || stat.size <= 0 || stat.size > 25 * 1024 * 1024) {
        return { ok: false, msg: 'Invalid image file size.' };
      }
      img = nativeImage.createFromPath(resolved);
    } else {
      return { ok: false, msg: 'No image data provided.' };
    }

    if (!img || img.isEmpty()) {
      return { ok: false, msg: 'Could not decode image file.' };
    }
    const bmpBuf = encodeNativeImageToBmp24(img);
    const svcRes = await service.applyHackbgrtSplash(bmpBuf.toString('base64'));
    if (svcRes) return svcRes;
    return { ok: false, msg: 'Hardware service did not respond.' };
  } catch (err) {
    return { ok: false, msg: `Error: ${err.message}` };
  }
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    if (Array.isArray(commandLine) && commandLine.includes('--startup')) return;
    showMainWindow();
  });
  app.whenReady().then(createWindow);
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && isQuitting) app.quit();
});

app.on('before-quit', () => {
  isQuitting = true;
  if (unsubscribeService) unsubscribeService();
  if (tray) { tray.destroy(); tray = null; }
});
