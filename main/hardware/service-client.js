import net from 'net';
import fs from 'fs';
import path from 'path';

const SERVICE_HOST = '127.0.0.1';
const SERVICE_PORT = 47631;
const TOKEN_PATH = path.join(process.env.ProgramData || 'C:\\ProgramData', 'NitroHub', 'bridge.token');

function readBridgeToken() {
  try {
    return fs.readFileSync(TOKEN_PATH, 'utf8').trim();
  } catch {
    return '';
  }
}

export class ServiceClient {
  constructor() {
    this._subSocket = null;
    this._subTimer = null;
    this._subStopped = false;
  }

  async request(payload, timeoutMs = 4000) {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: SERVICE_HOST, port: SERVICE_PORT });
      let buffer = '';
      let settled = false;
      const timer = setTimeout(() => finish(new Error('Nitro Hub service timed out')), timeoutMs);

      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        if (error) reject(error);
        else resolve(value);
      };

      socket.once('connect', () => {
        const token = readBridgeToken();
        socket.write(`${JSON.stringify({ ...payload, token })}\n`, 'utf8');
      });
      socket.on('data', data => {
        buffer += data.toString('utf8');
        const newline = buffer.indexOf('\n');
        if (newline < 0) return;
        try {
          finish(null, JSON.parse(buffer.slice(0, newline)));
        } catch (error) {
          finish(error);
        }
      });
      socket.once('error', error => finish(error));
      socket.once('end', () => {
        if (!settled) finish(new Error('Nitro Hub service closed the connection'));
      });
    });
  }

  subscribe(handlers = {}) {
    this._subStopped = false;
    const connect = () => {
      if (this._subStopped) return;
      const socket = net.createConnection({ host: SERVICE_HOST, port: SERVICE_PORT });
      this._subSocket = socket;
      let buffer = '';

      socket.once('connect', () => {
        const token = readBridgeToken();
        socket.write(`${JSON.stringify({ op: 'subscribe', token })}\n`, 'utf8');
        handlers.onConnected?.();
      });

      socket.on('data', chunk => {
        buffer += chunk.toString('utf8');
        let idx;
        while ((idx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.event === 'subscribed' && msg.snapshot) {
              if (Array.isArray(msg.logs)) handlers.onLogs?.(msg.logs);
              handlers.onSnapshot?.(msg.snapshot);
            } else if (msg.event === 'telemetry' && msg.data) {
              handlers.onTelemetry?.(msg.data);
            } else if (msg.event === 'log' && msg.data) {
              handlers.onLog?.(msg.data);
            } else if (msg.event === 'notice' && msg.data) {
              handlers.onNotice?.(msg.data);
            } else if (msg.event === 'rebuilt' && msg.data) {
              handlers.onRebuilt?.(msg.data);
            } else if (msg.event === 'settings' && msg.data) {
              handlers.onSettings?.(msg.data);
            }
          } catch {
            // ignore malformed line
          }
        }
      });

      const scheduleReconnect = () => {
        if (this._subSocket === socket) this._subSocket = null;
        handlers.onDisconnected?.();
        if (!this._subStopped && !this._subTimer) {
          this._subTimer = setTimeout(() => {
            this._subTimer = null;
            connect();
          }, 2000);
        }
      };

      socket.once('error', scheduleReconnect);
      socket.once('close', scheduleReconnect);
    };

    connect();
    return () => {
      this._subStopped = true;
      if (this._subTimer) {
        clearTimeout(this._subTimer);
        this._subTimer = null;
      }
      if (this._subSocket) {
        this._subSocket.destroy();
        this._subSocket = null;
      }
    };
  }

  ping() {
    return this.request({ op: 'ping' }, 1500);
  }

  getSnapshot() {
    return this.request({ op: 'snapshot' }, 5000);
  }

  getTelemetry() {
    return this.request({ op: 'telemetry' });
  }

  setProfile(profile) {
    return this.request({ op: 'set-profile', profile });
  }

  setLighting(lighting) {
    return this.request({ op: 'set-lighting', lighting });
  }

  setKeyboard(keyboard) {
    return this.request({ op: 'set-keyboard', keyboard });
  }

  setPower(power) {
    return this.request({ op: 'set-power', power });
  }

  setGpuMode(mode) {
    return this.request({ op: 'set-gpu-mode', mode });
  }

  startDustDefender() {
    return this.request({ op: 'start-dust-defender' });
  }

  readBatteryHealth() {
    return this.request({ op: 'read-battery-health' });
  }

  setOverrides(overrides) {
    return this.request({ op: 'set-overrides', overrides });
  }

  getDiagnostics() {
    return this.request({ op: 'get-diagnostics' }, 8000);
  }

  getHackbgrtStatus() {
    return this.request({ op: 'hackbgrt-status' }, 8000);
  }

  applyHackbgrtSplash(bmpBase64) {
    return this.request({ op: 'hackbgrt-apply', bmpBase64 }, 15000);
  }

  getSenseKeyOverride() {
    return this.request({ op: 'get-sense-key-override' });
  }

  setSenseKeyOverride(enabled, appPath) {
    return this.request({ op: 'set-sense-key-override', enabled: Boolean(enabled), appPath });
  }
}
