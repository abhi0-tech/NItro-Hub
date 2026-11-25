const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);
const subscribe = (channel, cb) => {
  if (typeof cb !== 'function') return () => {};
  const handler = (_event, data) => cb(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('nitro', {
  getSnapshot: () => invoke('nitro:snapshot'),
  setProfile: (profile) => invoke('nitro:set-profile', profile),
  setLighting: (lighting) => invoke('nitro:set-lighting', lighting),
  setKeyboard: (keyboard) => invoke('nitro:set-keyboard', keyboard),
  setPower: (power) => invoke('nitro:set-power', power),
  setGpuMode: (mode) => invoke('nitro:set-gpu-mode', mode),
  startDustDefender: () => invoke('nitro:start-dust-defender'),
  readBatteryHealth: () => invoke('nitro:read-battery-health'),
  setOverrides: (overrides) => invoke('nitro:set-overrides', overrides),
  getDiagnostics: () => invoke('nitro:get-diagnostics'),
  retryService: () => invoke('nitro:retry-service'),
  installService: () => invoke('nitro:install-service'),
  getDebugInfo: () => invoke('nitro:get-debug-info'),

  onTelemetry: (cb) => subscribe('nitro:telemetry', cb),
  onNotice: (cb) => subscribe('nitro:notice', cb),
  onSnapshot: (cb) => subscribe('nitro:snapshot-update', cb),
  onSettings: (cb) => subscribe('nitro:settings', cb),
  onServiceStatus: (cb) => subscribe('nitro:service-status', cb),
  onLog: (cb) => subscribe('nitro:log', cb),
  onLogsInit: (cb) => subscribe('nitro:logs-init', cb),
});

contextBridge.exposeInMainWorld('electron', {
  send: (channel, data) => {
    const validChannels = new Set([
      'window-minimize', 'window-maximize', 'window-close',
      'window-close-tray', 'app-quit', 'open-external',
      'open-windows-update', 'launch-nvidia',
    ]);
    if (!validChannels.has(channel)) return;
    ipcRenderer.send(channel, data);
  },
  onRequestClose: (cb) => subscribe('nitro:request-close', cb),
  invoke: (channel, data) => {
    const validChannels = new Set([
      'check-windows-updates', 'hackbgrt-status', 'hackbgrt-apply',
      'install-hackbgrt', 'hackbgrt-check-update', 'get-system-specs',
      'get-auto-start', 'set-auto-start',
    ]);
    if (!validChannels.has(channel)) return Promise.reject(new Error('Unsupported IPC request'));
    return ipcRenderer.invoke(channel, data);
  },
});
