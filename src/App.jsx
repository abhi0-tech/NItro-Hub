import React, { useState, useEffect, useRef, useMemo } from 'react';
import imgPerformance from './assets/performance.png';
import imgBalanced from './assets/balanced.png';
import imgQuiet from './assets/quiet.png';
import imgLogo from './assets/logo.png';
import imgNvidia from './assets/nvidia.png';
import imgPortfolioFavicon from './assets/portfolio-favicon.png';
import CircularGauge from './components/CircularGauge';
import FilledSlider from './components/FilledSlider';
import KeyboardPreview, { computeEffectZoneColors, CUSTOM_SOFTWARE_EFFECTS, rgbToHex } from './components/KeyboardPreview';
import CurveGraphEditorModal from './components/CurveGraphEditorModal';
import NitroLogoSvg from './components/NitroLogoSvg';
import FanRotor from './components/FanRotor';
import {
  Zap, Wind, Activity, Settings, Keyboard,
  RefreshCw, Layers, Sparkles, X,
  Monitor, ChevronRight, Battery, Minus, Square,
  Upload, CheckCircle, AlertTriangle, Fan, LayoutDashboard, Copy, Shield, Palette,
  Leaf, Gauge, Flame, User, Cpu, Plus
} from 'lucide-react';

// --- CONSTANTS ---

const DEFAULT_CPU_CURVE = [
  { temperature: 88, percent: 0 },
  { temperature: 94, percent: 100 },
];
const DEFAULT_GPU_CURVE = [
  { temperature: 81, percent: 0 },
  { temperature: 87, percent: 100 },
];

const ACCENT_PRESETS = [
  { name: 'Cyan', hex: '#00e5ff' },
  { name: 'Nitro Orange', hex: '#ff5500' },
  { name: 'Emerald', hex: '#10b981' },
  { name: 'Crimson', hex: '#ff2244' },
  { name: 'Violet', hex: '#a855f7' },
  { name: 'Gold', hex: '#f59e0b' },
];

function hexToRgbTuple(hex) {
  const clean = String(hex || '#00e5ff').replace('#', '');
  if (clean.length !== 6) return '0, 229, 255';
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  return `${r}, ${g}, ${b}`;
}

const OPERATING_MODE_META = {
  Quiet: { label: 'Quiet', desc: 'Silent & Efficient', img: imgQuiet, glow: '#10b981', icon: Wind },
  Eco: { label: 'Eco', desc: 'Maximum Battery', img: imgQuiet, glow: '#22c55e', icon: Leaf },
  Balanced: { label: 'Balanced', desc: 'Balanced Performance', img: imgBalanced, glow: '#00e5ff', icon: Gauge },
  Performance: { label: 'Performance', desc: 'High Performance', img: imgPerformance, glow: '#ff2244', icon: Zap },
  Turbo: { label: 'Turbo', desc: 'Maximum Overclock', img: imgPerformance, glow: '#ff0055', icon: Flame },
};

const SINGLE_COLOR_EFFECTS = new Set([
  'Breathing', 'Shifting', 'Zoom', 'Meteor', 'Twinkling', 'DualPulse', 'DualComet',
]);

const POWER_LIMIT_TEXT = {
  Battery: 'On Battery — Performance/Turbo limited',
  LowBattery: 'Low Battery — Quiet/Balanced only',
  Adapter: 'Weak Adapter — Quiet/Balanced only',
};

const EFFECT_META = {
  Static: { name: 'Static', icon: Zap },
  Breathing: { name: 'Breathing', icon: Activity },
  Neon: { name: 'Neon', icon: Sparkles },
  Wave: { name: 'Wave', icon: Wind },
  Shifting: { name: 'Shifting', icon: Layers },
  Zoom: { name: 'Zoom', icon: Sparkles },
  Meteor: { name: 'Meteor', icon: Zap },
  Twinkling: { name: 'Twinkling', icon: Sparkles },
  Aurora: { name: 'Aurora', icon: Wind },
  DualPulse: { name: 'Dual Pulse', icon: Activity },
  SpectrumFlow: { name: 'Spectrum', icon: Sparkles },
  DualComet: { name: 'Dual Comet', icon: Zap },
};

const ToggleSwitch = ({ checked, disabled = false, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={Boolean(checked)}
    disabled={disabled}
    onClick={() => !disabled && onChange?.(!checked)}
    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-all duration-200 ${
      disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
    }`}
    style={{
      backgroundColor: checked ? 'var(--accent)' : 'rgba(255,255,255,0.10)',
      borderColor: checked ? 'var(--accent)' : 'rgba(255,255,255,0.18)',
      boxShadow: checked ? '0 0 14px rgba(var(--accent-rgb), 0.45)' : 'none',
    }}
  >
    <span
      className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200"
      style={{ transform: checked ? 'translateX(22px)' : 'translateX(3px)' }}
    />
  </button>
);

function formatCpuName(raw) {
  if (!raw) return '—';
  const s = String(raw)
    .replace(/\(R\)|\(TM\)|\(C\)|CPU|Processor|with Radeon Graphics/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const intelGen = /(\d+(?:st|nd|rd|th))\s+Gen\s+Intel\s+(Core(?:\s+Ultra)?\s+i?\d+)/i.exec(s);
  if (intelGen) return `${intelGen[2]} ${intelGen[1]} gen`;
  const intelCore = /Intel\s+(Core(?:\s+Ultra)?\s+i?\d+)[-\s](\d{4,5}[A-Z]*)/i.exec(s);
  if (intelCore) return `${intelCore[1]} ${intelCore[2]}`;
  const amd = /AMD\s+(Ryzen\s+\d+\s+\S+)/i.exec(s);
  if (amd) return amd[1];
  return s.replace(/^Intel\s+|^AMD\s+/i, '');
}

function formatGpuName(raw) {
  if (!raw) return '—';
  return String(raw)
    .replace(/\(R\)|\(TM\)|Laptop GPU|Max-Q/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^NVIDIA\s+GeForce\s+/i, 'Nvidia ')
    .replace(/^NVIDIA\s+/i, 'Nvidia ')
    .replace(/^AMD\s+Radeon\s+/i, 'Radeon ');
}

const quantize10 = (v) => Math.round(Math.max(0, Math.min(100, Number(v) || 0)) / 10) * 10;

// Match model name against catalog.json
function findModelArtwork(deviceName, catalog) {
  if (!Array.isArray(catalog) || catalog.length === 0) return null;
  const match = /\b((?:AN|PH|PT|NL)[A-Z0-9]*?\d{2,3}S?)[-\s]?(\d{2}[A-Z]?)\b/i.exec(deviceName || '');
  if (!match) return null;
  const code = `${match[1]}-${match[2]}`.toUpperCase();
  const exact = catalog.find(e => e.Models?.some(m => m.toUpperCase() === code));
  if (exact) return exact;
  let best = null;
  let bestLen = 0;
  for (const entry of catalog) {
    for (const prefix of entry.Prefixes || []) {
      if (code.startsWith(prefix.toUpperCase() + '-') && prefix.length > bestLen) {
        best = entry;
        bestLen = prefix.length;
      }
    }
  }
  return best;
}

// --- SMOOTH CURVE USAGE GRAPH ---
function buildSmoothSplinePath(pts) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  return d;
}

const MiniGraph = ({ data, color, height = 40, showGrid = false, showAxes = false }) => {
  if (!data || data.length < 2) {
    return <div className="w-full bg-black/40 rounded-lg" style={{ height }} />;
  }
  const w = 220;
  const h = height;
  const padT = 5;
  const padB = 5;
  const plotH = h - padT - padB;
  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * w,
    y: padT + (1 - Math.min(100, Math.max(0, v)) / 100) * plotH,
  }));
  const linePath = buildSmoothSplinePath(pts);
  const last = pts[pts.length - 1];
  const first = pts[0];
  const areaPath = `${linePath} L ${last.x.toFixed(2)},${h} L ${first.x.toFixed(2)},${h} Z`;
  const gradId = `cg-${String(color).replace(/[^a-zA-Z0-9]/g, '')}-${h}`;

  return (
    <div className="relative w-full overflow-hidden rounded-lg bg-black/35 border border-white/5" style={{ height }}>
      {showAxes && (
        <div className="pointer-events-none absolute inset-y-1 left-1.5 flex flex-col justify-between text-[8px] font-bold text-slate-500 z-10">
          <span>100%</span>
          <span>50%</span>
          <span>0%</span>
        </div>
      )}
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-full block">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.42" />
            <stop offset="75%" stopColor={color} stopOpacity="0.08" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {showGrid && [0.25, 0.5, 0.75].map((r, idx) => (
          <line
            key={idx}
            x1="0"
            y1={padT + r * plotH}
            x2={w}
            y2={padT + r * plotH}
            stroke="rgba(255,255,255,0.06)"
            strokeDasharray="3 3"
            strokeWidth="0.8"
          />
        ))}
        <path d={areaPath} fill={`url(#${gradId})`} />
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx={last.x} cy={last.y} r="5" fill={color} opacity="0.22" />
        <circle cx={last.x} cy={last.y} r="2.5" fill="#ffffff" stroke={color} strokeWidth="1.5" />
      </svg>
    </div>
  );
};

// --- MODAL TRANSITION HOOK (Enter + Exit animations) ---
function useModalTransition(isOpen, duration = 180) {
  const [mounted, setMounted] = useState(isOpen);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      setClosing(false);
    } else if (mounted) {
      setClosing(true);
      const t = setTimeout(() => { setMounted(false); setClosing(false); }, duration);
      return () => clearTimeout(t);
    }
  }, [isOpen, mounted, duration]);

  return { mounted, closing };
}

// --- CLOSE / TRAY CONFIRMATION MODAL ---
const CloseActionModal = ({ isOpen, onClose, onMinimizeToTray, onExitApp }) => {
  const { mounted, closing } = useModalTransition(isOpen, 180);
  if (!mounted) return null;
  return (
    <div className={`fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md ${closing ? 'modal-overlay-exit' : 'modal-overlay'}`} onClick={onClose}>
      <div className={`bg-[#070b12] border border-white/15 rounded-2xl p-7 max-w-md w-full shadow-[0_0_80px_rgba(var(--accent-rgb),0.18)] ${closing ? 'modal-card-exit' : 'modal-card'}`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-[rgba(var(--accent-rgb),0.12)] border border-[rgba(var(--accent-rgb),0.3)] flex items-center justify-center">
            <Monitor size={18} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <div className="text-base font-black text-white tracking-widest">Close Nitro Hub</div>
            <div className="text-[10px] tracking-widest mt-0.5" style={{ color: 'var(--accent)' }}>Choose Close Behavior</div>
          </div>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white"><X size={15} /></button>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed mb-3">
          Keeping <span className="text-white font-bold">Nitro Hub</span> running in the system tray makes it faster to reopen and keeps your custom fan curves and lighting active.
        </p>
        <p className="text-[11px] text-slate-400 leading-relaxed mb-6">
          You can change this preference anytime in <span className="text-white font-semibold">Settings</span>.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onMinimizeToTray}
            className="py-3 px-4 rounded-xl text-black text-[11px] font-black tracking-widest transition-all hover:brightness-110"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            Minimize to Tray
          </button>
          <button
            onClick={onExitApp}
            className="py-3 px-4 rounded-xl bg-white/5 border border-white/15 text-slate-200 text-[11px] font-black tracking-widest hover:border-red-500/60 hover:bg-red-950/30 hover:text-red-300 transition-all"
          >
            Exit on Close
          </button>
        </div>
      </div>
    </div>
  );
};

// --- HACKBGRT SECURE BOOT INSTRUCTIONS MODAL ---
const BootLogoInstructionsModal = ({ isOpen, onClose, checked, onToggleChecked }) => {
  const { mounted, closing } = useModalTransition(isOpen, 180);
  if (!mounted) return null;
  return (
    <div className={`fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-black/85 backdrop-blur-md ${closing ? 'modal-overlay-exit' : 'modal-overlay'}`} onClick={onClose}>
      <div className={`bg-[#070b12] border border-white/15 w-full max-w-3xl rounded-2xl shadow-[0_0_80px_rgba(var(--accent-rgb),0.2)] flex flex-col max-h-[90vh] overflow-hidden ${closing ? 'modal-card-exit' : 'modal-card'}`} onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-500/15 border border-red-500/40 flex items-center justify-center text-red-400">
              <AlertTriangle size={18} />
            </div>
            <div>
              <h3 className="text-base font-black text-white tracking-wide">Secure Boot verification instructions</h3>
              <p className="text-xs text-red-300 font-semibold mt-0.5">
                If you get a "Secure Boot verification failed" error on restart, do this:
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg text-slate-300 hover:text-white"><X size={16} /></button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* Step 1 */}
            <div className="bg-black/50 border border-white/10 rounded-xl p-4 space-y-2.5">
              <div className="text-xs font-black text-white">1. Verification failed screen</div>
              <div className="bg-[#0b1324] border border-blue-400/30 rounded-lg p-3 font-mono text-[11px] text-slate-200 space-y-1">
                <div className="text-red-400 font-bold">Verification failed: (0x1A) Security Violation</div>
                <div className="inline-block px-2 py-0.5 bg-blue-600 text-white rounded text-[10px] font-bold">OK</div>
                <div className="text-slate-400 pt-1 border-t border-white/10">Press any key to perform MOK management (5s)</div>
              </div>
              <p className="text-xs text-slate-300">
                Press <span className="text-white font-bold">Enter</span> on <span className="text-white font-bold">OK</span>, then quickly press <span className="text-white font-bold">any key</span> within 5 seconds.
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-black/50 border border-white/10 rounded-xl p-4 space-y-2.5">
              <div className="text-xs font-black text-white">2. MOK management menu</div>
              <div className="bg-[#0b1324] border border-blue-400/30 rounded-lg p-3 font-mono text-[11px] space-y-1">
                <div className="text-slate-400">Perform MOK management</div>
                <div className="text-slate-400 pl-2">Continue to boot</div>
                <div className="text-slate-400 pl-2">Enroll key from disk</div>
                <div className="bg-blue-600 text-white px-2 py-0.5 rounded font-bold">&gt; Enroll hash from disk</div>
              </div>
              <p className="text-xs text-slate-300">
                Use arrow keys to highlight <span className="text-white font-bold">Enroll hash from disk</span> and press <span className="text-white font-bold">Enter</span>.
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-black/50 border border-white/10 rounded-xl p-4 space-y-2.5">
              <div className="text-xs font-black text-white">3. Select HackBGRT binary</div>
              <div className="bg-[#0b1324] border border-blue-400/30 rounded-lg p-3 font-mono text-[11px] space-y-1">
                <div className="text-slate-300">Your Disk &rarr; EFI/ &rarr; HackBGRT/</div>
                <div className="bg-blue-600 text-white px-2 py-0.5 rounded font-bold">&gt; grubx64.efi</div>
                <div className="text-slate-500 pl-2">splash.bmp · config.txt</div>
              </div>
              <p className="text-xs text-slate-300">
                Open your disk, then <span className="text-white font-bold">EFI/</span> &rarr; <span className="text-white font-bold">HackBGRT/</span> &rarr; select <span className="text-white font-bold">grubx64.efi</span>.
              </p>
            </div>

            {/* Step 4 */}
            <div className="bg-black/50 border border-white/10 rounded-xl p-4 space-y-2.5">
              <div className="text-xs font-black text-white">4. Confirm &amp; reboot</div>
              <div className="bg-[#0b1324] border border-blue-400/30 rounded-lg p-3 font-mono text-[11px] space-y-1">
                <div className="text-slate-300">[Enroll MOK] &rarr; <span className="bg-blue-600 text-white px-1.5 py-0.5 rounded font-bold">Continue</span></div>
                <div className="text-slate-300">Enroll the key(s)? &rarr; <span className="bg-blue-600 text-white px-1.5 py-0.5 rounded font-bold">Yes</span></div>
                <div className="text-slate-300">Finished &rarr; <span className="bg-blue-600 text-white px-1.5 py-0.5 rounded font-bold">Reboot</span></div>
              </div>
              <p className="text-xs text-slate-300">
                Select <span className="text-white font-bold">Continue</span>, then <span className="text-white font-bold">Yes</span>, then <span className="text-white font-bold">Reboot</span>.
              </p>
            </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-400/40 rounded-xl p-4 text-center space-y-1">
            <div className="text-base font-black text-amber-300">
              Take a picture of these instructions before restarting
            </div>
            <div className="text-xs font-bold text-slate-200">
              This only has to be done once.
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-white/10 flex flex-wrap items-center justify-between gap-4 bg-black/40">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => onToggleChecked(e.target.checked)}
              className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
            />
            <span className="text-xs font-bold text-white">I have read the instructions</span>
          </label>
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl text-black text-xs font-black tracking-wide transition-all hover:brightness-110"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            {checked ? 'Continue to apply' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- ABOUT / ENGINE INFO MODAL ---
const AboutModal = ({ isOpen, onClose, snapshot, serviceConnected }) => {
  const { mounted, closing } = useModalTransition(isOpen, 180);
  if (!mounted) return null;
  const caps = snapshot?.capabilities;
  return (
    <div className={`fixed inset-0 z-[9998] flex items-center justify-center bg-black/80 backdrop-blur-md ${closing ? 'modal-overlay-exit' : 'modal-overlay'}`} onClick={onClose}>
      <div className={`bg-[#070b12] border border-white/10 rounded-2xl p-8 max-w-lg w-full mx-4 shadow-[0_0_80px_rgba(var(--accent-rgb),0.15)] ${closing ? 'modal-card-exit' : 'modal-card'}`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-[rgba(var(--accent-rgb),0.1)] border border-[rgba(var(--accent-rgb),0.3)] flex items-center justify-center">
            <Shield size={18} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <div className="text-lg font-black text-white tracking-widest">System Information</div>
            <div className="text-[10px] tracking-widest mt-0.5" style={{ color: 'var(--accent)' }}>Hardware &amp; Firmware Details</div>
          </div>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white"><X size={15} /></button>
        </div>
        <div className="space-y-2.5 text-[12px] bg-black/40 border border-white/10 rounded-xl p-4 mb-5">
          <div className="flex justify-between"><span className="text-slate-400">Service</span><span className="font-bold text-white">{serviceConnected ? 'Connected (LocalSystem)' : 'Disconnected'}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Engine State</span><span className="font-bold" style={{ color: 'var(--accent)' }}>{snapshot?.state || 'Starting'}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Model</span><span className="font-bold text-white">{snapshot?.deviceName || 'Detecting...'}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">BIOS</span><span className="font-bold text-white">{snapshot?.biosVersion || '—'}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">CPU</span><span className="font-bold text-white truncate max-w-[240px]">{snapshot?.cpuName || '—'}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">GPU</span><span className="font-bold text-white truncate max-w-[240px]">{snapshot?.gpuName || '—'}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Detected Modes</span><span className="font-bold text-white">{caps?.operatingModes?.join(', ') || 'None'}</span></div>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed mb-5">
          Hardware control uses firmware capability probing. Not affiliated with Acer Inc. Fan percentages in Custom mode represent boost over the firmware Auto curve (0% = Auto, 100% = Max).
        </p>
        <button onClick={onClose} className="w-full py-3 rounded-xl text-black text-[12px] font-black tracking-widest transition-all hover:brightness-110"
          style={{ backgroundColor: 'var(--accent)' }}>
          Close
        </button>
      </div>
    </div>
  );
};

// --- DEBUG / DIAGNOSTICS WINDOW MODAL ---
const DebugModal = ({ isOpen, onClose, snapshot, serviceConnected, debugInfo, logs, onRefresh, onRetry, onInstallService }) => {
  const [copied, setCopied] = useState(false);
  const { mounted, closing } = useModalTransition(isOpen, 180);
  if (!mounted) return null;
  const caps = snapshot?.capabilities;

  const copyAll = async () => {
    const diagRes = await window.nitro?.getDiagnostics().catch(() => null);
    const report = [
      '=== NITRO HUB DEBUG REPORT ===',
      `Service Connected: ${serviceConnected}`,
      `Engine State: ${snapshot?.state || 'Unknown'}`,
      `Engine Error: ${snapshot?.error || 'None'}`,
      `Last IPC Error: ${debugInfo?.lastError || 'None'}`,
      `Packaged: ${debugInfo?.packaged}`,
      `Install Dir: ${debugInfo?.installDir || '—'}`,
      `Model: ${snapshot?.deviceName || '—'} | BIOS: ${snapshot?.biosVersion || '—'}`,
      `SCM Query:\n${debugInfo?.scmStatus || '—'}`,
      '\n=== LOGS ===',
      ...(logs || []).map(l => `[${l.timestamp}] [${l.level}] [${l.category}] ${l.message}`),
      diagRes?.diagnostics ? `\n=== FIRMWARE DIAGNOSTICS ===\n${diagRes.diagnostics}` : '',
    ].join('\n');
    await navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-black/85 backdrop-blur-md ${closing ? 'modal-overlay-exit' : 'modal-overlay'}`} onClick={onClose}>
      <div className={`bg-[#070b12] border border-white/15 w-full max-w-4xl rounded-2xl shadow-[0_0_80px_rgba(var(--accent-rgb),0.2)] flex flex-col max-h-[88vh] overflow-hidden ${closing ? 'modal-card-exit' : 'modal-card'}`} onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black text-white tracking-widest flex items-center gap-2">
              <Activity size={18} style={{ color: 'var(--accent)' }} /> Hardware &amp; Service Debugger
            </h3>
            <p className="text-[10px] text-slate-400 font-bold tracking-widest mt-0.5">
              Live SCM, Firmware Probe &amp; Service Logs
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white"><X size={16} /></button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-[11px]">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-black/40 border border-white/10 rounded-xl p-4 space-y-1.5">
              <div className="text-[10px] font-black tracking-widest mb-2" style={{ color: 'var(--accent)' }}>Service &amp; Engine</div>
              <div className="flex justify-between"><span className="text-slate-400">TCP Bridge (127.0.0.1:47631)</span><span className={`font-bold ${serviceConnected ? 'text-emerald-400' : 'text-red-400'}`}>{serviceConnected ? 'Connected' : 'Disconnected'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Engine State</span><span className="font-bold text-white">{snapshot?.state || 'Starting'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Packaged App</span><span className="font-bold text-white">{debugInfo?.packaged ? 'Yes' : 'Dev Mode'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Install Dir</span><span className="font-bold text-white truncate max-w-[210px]" title={debugInfo?.installDir}>{debugInfo?.installDir || '—'}</span></div>
              {(snapshot?.error || debugInfo?.lastError) && (
                <div className="mt-2 p-2 rounded bg-red-950/50 border border-red-700/40 text-red-300 text-[10px] break-all">
                  {snapshot?.error || debugInfo?.lastError}
                </div>
              )}
            </div>

            <div className="bg-black/40 border border-white/10 rounded-xl p-4 space-y-1.5">
              <div className="text-[10px] font-black tracking-widest mb-2" style={{ color: 'var(--accent)' }}>Firmware Probe</div>
              <div className="flex justify-between"><span className="text-slate-400">Firmware Present</span><span className="font-bold text-white">{caps ? String(caps.firmwarePresent) : '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Fans Detected</span><span className="font-bold text-white">{caps?.fans?.map(f => f.id).join(', ') || 'None'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Operating Modes</span><span className="font-bold text-white">{caps?.operatingModes?.join(', ') || 'None'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Sensors</span><span className="font-bold text-white truncate max-w-[210px]">{caps?.sensors?.length ?? 0} active</span></div>
              <div className="flex justify-between"><span className="text-slate-400">CoolBoost / MUX / Dust</span><span className="font-bold text-white">{caps ? `${caps.coolBoost}/${caps.gpuModeSwitch}/${caps.dustDefender}` : '—'}</span></div>
            </div>
          </div>

          <div className="bg-black/40 border border-white/10 rounded-xl p-4">
            <div className="text-[10px] font-black tracking-widest mb-1.5" style={{ color: 'var(--accent)' }}>Windows SCM Status (sc.exe query NitroHubService)</div>
            <pre className="text-[10px] text-slate-300 font-mono whitespace-pre-wrap">{debugInfo?.scmStatus || 'Querying...'}</pre>
          </div>

          <div className="bg-black/60 border border-white/10 rounded-xl p-4">
            <div className="text-[10px] font-black tracking-widest mb-2" style={{ color: 'var(--accent)' }}>Live Logs ({logs?.length || 0})</div>
            <div className="max-h-56 overflow-y-auto font-mono text-[10px] space-y-1">
              {(!logs || logs.length === 0) ? (
                <div className="text-slate-500">No logs captured yet.</div>
              ) : logs.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-slate-500 shrink-0">{l.timestamp}</span>
                  <span className={`shrink-0 font-bold ${l.level === 'Error' || l.level === 'Critical' ? 'text-red-400' : l.level === 'Warning' ? 'text-amber-400' : 'text-cyan-400'}`}>[{l.level}]</span>
                  <span className="text-slate-400 shrink-0">[{l.category}]</span>
                  <span className="text-white/90 break-all">{l.message}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-white/10 flex items-center gap-3">
          <button onClick={onInstallService} className="px-4 py-2 rounded-lg bg-[rgba(var(--accent-rgb),0.15)] border border-[var(--accent)] text-white text-[10px] font-black tracking-widest hover:brightness-110">
            Install / Repair Service
          </button>
          <button onClick={onRetry} className="px-4 py-2 rounded-lg bg-white/5 border border-white/15 text-slate-200 text-[10px] font-black tracking-widest hover:bg-white/10">
            Retry Service
          </button>
          <button onClick={onRefresh} className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-white text-[10px] font-black tracking-widest">
            Refresh
          </button>
          <button onClick={copyAll} className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-[10px] font-black tracking-widest flex items-center gap-1.5" style={{ color: 'var(--accent)' }}>
            <Copy size={12} /> {copied ? 'Copied!' : 'Copy Full Report'}
          </button>
          <div className="flex-1" />
          <button onClick={onClose} className="px-6 py-2 rounded-lg text-black text-[10px] font-black tracking-widest hover:brightness-110" style={{ backgroundColor: 'var(--accent)' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// --- NAV TAB ---
const NavTab = ({ id, label, activeTab, onSelect }) => (
  <button
    onClick={() => onSelect(id)}
    className={`px-4 py-4 text-[12px] font-bold tracking-wider transition-colors duration-150 relative whitespace-nowrap ${
      activeTab === id ? 'text-white' : 'text-slate-400 hover:text-slate-200'
    }`}
  >
    {label}
    <div
      className="absolute bottom-0 left-0 right-0 h-[2px] origin-left"
      style={{
        backgroundColor: 'var(--accent)',
        boxShadow: activeTab === id ? '0 0 12px var(--accent)' : 'none',
        transform: activeTab === id ? 'scaleX(1)' : 'scaleX(0)',
        transition: 'transform 180ms cubic-bezier(0.4,0,0.2,1)',
      }}
    />
  </button>
);

const DEFAULT_LIGHTING = {
  effect: 'Static',
  brightness: 100,
  speed: 5,
  direction: 'Right',
  effectColor: '#00e5ff',
  randomColor: false,
  zones: [
    { on: true, color: '#00e5ff' },
    { on: true, color: '#00e5ff' },
    { on: true, color: '#00e5ff' },
    { on: true, color: '#00e5ff' },
  ],
};

const ZONE_NAMES = ['Left', 'Center', 'Right', 'Numpad'];

const App = () => {
  const [splashVisible, setSplashVisible] = useState(true);
  const [splashFading, setSplashFading] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setSplashFading(true), 1700);
    const t2 = setTimeout(() => setSplashVisible(false), 2300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const [accentColor, setAccentColor] = useState(() => localStorage.getItem('nitro-accent-color') || '#00e5ff');
  const accentRgb = useMemo(() => hexToRgbTuple(accentColor), [accentColor]);

  const handleAccentChange = (hex) => {
    setAccentColor(hex);
    localStorage.setItem('nitro-accent-color', hex);
  };

  const [activeTab, setActiveTab] = useState('home');
  const [sidebarDrop, setSidebarDrop] = useState(null);
  const [isCurveEditorOpen, setIsCurveEditorOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [isClosePromptOpen, setIsClosePromptOpen] = useState(false);
  const [showDebugButton, setShowDebugButton] = useState(() => {
    try { return localStorage.getItem('nitro-show-debug-btn') === 'true'; } catch { return false; }
  });
  const [debugShortcut, setDebugShortcut] = useState(() => {
    try { return localStorage.getItem('nitro-debug-shortcut') || 'Shift+F12'; } catch { return 'Shift+F12'; }
  });
  const [recordingShortcut, setRecordingShortcut] = useState(false);
  const [closeBehavior, setCloseBehavior] = useState(() => {
    try { return localStorage.getItem('nitro-close-behavior') || 'ask'; } catch { return 'ask'; }
  });
  const [debugInfo, setDebugInfo] = useState(null);
  const [debugLogs, setDebugLogs] = useState([]);
  const [modelCatalog, setModelCatalog] = useState([]);

  // Hardware engine state
  const [serviceConnected, setServiceConnected] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [notice, setNotice] = useState(null);
  const [usageHistory, setUsageHistory] = useState({
    cpu: Array(30).fill(0),
    gpu: Array(30).fill(0),
  });
  const [diagnosticsCopied, setDiagnosticsCopied] = useState(false);

  const [profile, setProfile] = useState({
    mode: 'Auto',
    operatingMode: 'Balanced',
    batteryOperatingMode: null,
    coolBoost: null,
    fanTable: null,
    manual: {
      Cpu: { percent: 30, useCurve: false },
      Gpu: { percent: 30, useCurve: false },
    },
    curves: {
      Cpu: { curve: { points: DEFAULT_CPU_CURVE } },
      Gpu: { curve: { points: DEFAULT_GPU_CURVE } },
    },
  });
  const [lightingConfig, setLightingConfig] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('nitro-kb-lighting') || 'null');
      if (saved?.devices && Object.keys(saved.devices).length > 0) return saved;
    } catch {}
    return { devices: { Keyboard: DEFAULT_LIGHTING } };
  });
  const [speedByEffect, setSpeedByEffect] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('nitro-rgb-speeds') || '{}');
    } catch {
      return {};
    }
  });
  const [keyboardSettings, setKeyboardSettings] = useState({});
  const [powerSettings, setPowerSettings] = useState({});
  const [syncAll, setSyncAll] = useState(false);
  const [rgbPanelTab, setRgbPanelTab] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('nitro-kb-lighting') || 'null');
      const dev = saved?.devices ? Object.values(saved.devices)[0] : null;
      return dev?.effect && dev.effect !== 'Static' ? 'animated' : 'static';
    } catch {
      return 'static';
    }
  });
  const [lastAnimatedEffect, setLastAnimatedEffect] = useState(() => {
    try { return localStorage.getItem('nitro-last-animated-effect') || 'Wave'; } catch { return 'Wave'; }
  });
  const customEffectActiveRef = useRef((() => {
    try {
      const saved = JSON.parse(localStorage.getItem('nitro-kb-lighting') || 'null');
      const dev = saved?.devices ? Object.values(saved.devices)[0] : null;
      return Boolean(dev?.effect && CUSTOM_SOFTWARE_EFFECTS.has(dev.effect));
    } catch {
      return false;
    }
  })());
  const [autoStartEnabled, setAutoStartEnabled] = useState(true);
  const [systemSpecs, setSystemSpecs] = useState(null);

  // Windows Update & HackBGRT state
  const [wuStatus, setWuStatus] = useState('idle');
  const [wuResult, setWuResult] = useState(null);
  const [hackbgrtInfo, setHackbgrtInfo] = useState(null);
  const [hackbgrtUpdate, setHackbgrtUpdate] = useState({ checking: false, currentVersion: '2.6.0' });
  const [bootFile, setBootFile] = useState(null);
  const [bootPreview, setBootPreview] = useState(null);
  const [bootStatus, setBootStatus] = useState('idle');
  const [bootMsg, setBootMsg] = useState('');
  const [isBootInstructionsOpen, setIsBootInstructionsOpen] = useState(false);
  const [bootInstructionsRead, setBootInstructionsRead] = useState(false);
  const [bootRestartNotice, setBootRestartNotice] = useState(false);
  const bootInputRef = useRef(null);
  const [hackbgrtMissing, setHackbgrtMissing] = useState(false);
  const [hackbgrtInstallStatus, setHackbgrtInstallStatus] = useState('idle');
  const [hackbgrtInstallMsg, setHackbgrtInstallMsg] = useState('');

  const lightingDebounceRef = useRef(null);

  const refreshHackbgrtStatus = () => {
    window.electron?.invoke('hackbgrt-status')
      .then(res => { if (res) setHackbgrtInfo(res); })
      .catch(() => {});
  };

  const checkHackbgrtUpdate = async () => {
    setHackbgrtUpdate(prev => ({ ...prev, checking: true, error: null }));
    try {
      const res = await window.electron?.invoke('hackbgrt-check-update');
      if (res) setHackbgrtUpdate({ ...res, checking: false });
      else setHackbgrtUpdate(prev => ({ ...prev, checking: false }));
    } catch (err) {
      setHackbgrtUpdate(prev => ({ ...prev, checking: false, ok: false, error: err.message }));
    }
  };

  useEffect(() => {
    fetch('./models/catalog.json')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setModelCatalog(data); })
      .catch(() => {});
    refreshHackbgrtStatus();
    checkHackbgrtUpdate();
    window.electron?.invoke('get-system-specs')
      .then(res => { if (res) setSystemSpecs(res); })
      .catch(() => {});
    window.electron?.invoke('get-auto-start')
      .then(res => { if (res && typeof res.openAtLogin === 'boolean') setAutoStartEnabled(res.openAtLogin); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!bootRestartNotice) return undefined;
    const t = setTimeout(() => setBootRestartNotice(false), 7000);
    return () => clearTimeout(t);
  }, [bootRestartNotice]);

  useEffect(() => {
    if (serviceConnected) {
      refreshHackbgrtStatus();
    }
  }, [serviceConnected]);

  const applySnapshotToState = (snap) => {
    if (!snap) return;
    setSnapshot(snap);
    if (snap.latest) setTelemetry(prev => ({ ...prev, ...snap.latest }));
    if (snap.settings?.profile) {
      setProfile(prev => ({ ...prev, ...snap.settings.profile }));
    }
    if (!customEffectActiveRef.current) {
      const incoming = (snap.settings?.lighting?.devices && Object.keys(snap.settings.lighting.devices).length > 0)
        ? snap.settings.lighting
        : (snap.lighting && Object.keys(snap.lighting).length > 0 ? { devices: snap.lighting } : null);
      if (incoming) {
        setLightingConfig(incoming);
        const firstDev = Object.values(incoming.devices || {})[0];
        if (firstDev?.effect) {
          setRgbPanelTab(firstDev.effect === 'Static' ? 'static' : 'animated');
          if (firstDev.effect !== 'Static') setLastAnimatedEffect(firstDev.effect);
        }
      }
    }
    if (snap.settings?.keyboard) setKeyboardSettings(snap.settings.keyboard);
    if (snap.settings?.power) setPowerSettings(snap.settings.power);
  };

  useEffect(() => {
    const api = window.nitro;
    if (!api) return undefined;

    api.getSnapshot().then(res => {
      if (res?.ok && res.snapshot) {
        setServiceConnected(true);
        applySnapshotToState(res.snapshot);
      }
    }).catch(() => {});

    const unsubStatus = api.onServiceStatus(st => setServiceConnected(Boolean(st?.connected)));
    const unsubLogsInit = api.onLogsInit?.(logs => {
      if (Array.isArray(logs)) setDebugLogs(logs);
    });
    const unsubLog = api.onLog?.(entry => {
      if (entry) setDebugLogs(prev => [...prev, entry].slice(-250));
    });
    const unsubSnap = api.onSnapshot(snap => {
      setServiceConnected(true);
      applySnapshotToState(snap);
    });
    const unsubSettings = api.onSettings(settings => {
      if (settings?.profile) setProfile(prev => ({ ...prev, ...settings.profile }));
      if (settings?.lighting && !customEffectActiveRef.current) setLightingConfig(settings.lighting);
      if (settings?.keyboard) setKeyboardSettings(settings.keyboard);
      if (settings?.power) setPowerSettings(settings.power);
    });
    const unsubNotice = api.onNotice(n => {
      setNotice(n);
      setTimeout(() => setNotice(prev => (prev === n ? null : prev)), 5000);
    });
    const unsubTelemetry = api.onTelemetry(t => {
      if (!t) return;
      setServiceConnected(true);
      setTelemetry(t);
      setUsageHistory(prev => ({
        cpu: [...prev.cpu, Math.round(t.cpuLoad || 0)].slice(-30),
        gpu: [...prev.gpu, Math.round(t.gpuLoad || 0)].slice(-30),
      }));
    });

    return () => {
      unsubStatus?.();
      unsubLogsInit?.();
      unsubLog?.();
      unsubSnap?.();
      unsubSettings?.();
      unsubNotice?.();
      unsubTelemetry?.();
    };
  }, []);

  // --- Derived capabilities & telemetry ---
  const caps = snapshot?.capabilities;
  const supportedModes = caps?.operatingModes?.length
    ? caps.operatingModes
    : ['Quiet', 'Balanced', 'Performance'];

  const powerLimit = telemetry?.powerLimit || 'None';
  const allowedModes = useMemo(() => {
    if (powerLimit === 'None') return supportedModes;
    if (powerLimit === 'Battery') return supportedModes.filter(m => ['Eco', 'Quiet', 'Balanced'].includes(m));
    return supportedModes.filter(m => ['Quiet', 'Balanced'].includes(m));
  }, [supportedModes, powerLimit]);

  const activeOperatingMode = telemetry?.operatingMode || profile.operatingMode || 'Balanced';
  const activeModeMeta = OPERATING_MODE_META[activeOperatingMode] || OPERATING_MODE_META.Balanced;

  const fanMode = (telemetry?.effectiveMode || profile.mode || 'Auto').toLowerCase();
  const cpuFanTelemetry = telemetry?.fans?.find(f => f.id === 'Cpu');
  const gpuFanTelemetry = telemetry?.fans?.find(f => f.id === 'Gpu');
  const sysFanTelemetry = telemetry?.fans?.find(f => f.id === 'System');

  const cpuTemp = telemetry?.cpuTemperature != null ? Math.round(telemetry.cpuTemperature) : 0;
  const gpuTemp = telemetry?.gpuTemperature != null ? Math.round(telemetry.gpuTemperature) : 0;
  const sysTemp = telemetry?.systemTemperature != null ? Math.round(telemetry.systemTemperature) : 0;
  const cpuLimit = telemetry?.limits?.cpu || 100;
  const gpuLimit = telemetry?.limits?.gpu || 87;
  const cpuLoad = Math.round(telemetry?.cpuLoad || 0);
  const gpuLoad = Math.round(telemetry?.gpuLoad || 0);

  const matchedModel = useMemo(
    () => findModelArtwork(snapshot?.deviceName, modelCatalog),
    [snapshot?.deviceName, modelCatalog]
  );
  const modelImageSrc = matchedModel?.File ? `./models/${matchedModel.File}` : './models/AN515-58.png';

  const keyboardLightInfo = caps?.lights?.find(l => l.id === 'Keyboard') || caps?.lights?.[0];
  const lightId = keyboardLightInfo?.id || 'Keyboard';
  const kbLighting = lightingConfig?.devices?.[lightId]
    || Object.values(lightingConfig?.devices || {})[0]
    || DEFAULT_LIGHTING;
  const baseEffects = keyboardLightInfo?.effects?.length
    ? keyboardLightInfo.effects.map(e => e.effect)
    : ['Static', 'Breathing', 'Neon', 'Wave', 'Shifting', 'Zoom', 'Meteor', 'Twinkling'];
  const supportedEffects = [...baseEffects, ...CUSTOM_SOFTWARE_EFFECTS];

  // Drive custom software effects (Aurora, DualPulse, SpectrumFlow, DualComet) onto EC hardware as Static zone frames
  useEffect(() => {
    const isCustom = CUSTOM_SOFTWARE_EFFECTS.has(kbLighting.effect);
    customEffectActiveRef.current = isCustom;
    if (!isCustom) return undefined;
    const start = performance.now();
    const timer = setInterval(() => {
      const elapsedSec = (performance.now() - start) / 1000;
      const zoneColors = computeEffectZoneColors(kbLighting, elapsedSec);
      window.nitro?.setLighting({
        devices: {
          [lightId]: {
            ...kbLighting,
            effect: 'Static',
            zones: zoneColors.map(c => ({ on: true, color: rgbToHex(c) })),
          },
        },
      }).catch(() => {});
    }, 200);
    return () => clearInterval(timer);
  }, [kbLighting.effect, kbLighting.speed, kbLighting.brightness, kbLighting.effectColor, lightId]);

  // --- Mutators ---
  const pushProfile = (updater) => {
    setProfile(prev => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
      window.nitro?.setProfile(next).catch(() => {});
      return next;
    });
  };

  const handleOperatingModeChange = (mode) => {
    if (!allowedModes.includes(mode)) return;
    if (powerLimit === 'Battery') {
      pushProfile(p => ({ ...p, batteryOperatingMode: mode }));
    } else {
      pushProfile(p => ({ ...p, operatingMode: mode }));
    }
  };

  const handleFanModeChange = (m) => {
    const modePascal = m === 'max' ? 'Max' : m === 'custom' ? 'Custom' : 'Auto';
    pushProfile(p => ({ ...p, mode: modePascal }));
  };

  const handleFanPercentChange = (fanId, val) => {
    const q = quantize10(val);
    pushProfile(p => ({
      ...p,
      manual: {
        ...p.manual,
        [fanId]: { ...(p.manual?.[fanId] || {}), percent: q },
      },
    }));
  };

  const handleFanUseCurveToggle = (fanId) => {
    pushProfile(p => ({
      ...p,
      manual: {
        ...p.manual,
        [fanId]: { ...(p.manual?.[fanId] || {}), useCurve: !p.manual?.[fanId]?.useCurve },
      },
    }));
  };

  const handleSaveCurves = (newCurves) => {
    pushProfile(p => ({
      ...p,
      curves: { ...p.curves, ...newCurves },
    }));
  };

  const pushLighting = (nextDeviceLighting, immediate = false) => {
    const nextConfig = {
      devices: {
        ...(lightingConfig?.devices || {}),
        [lightId]: nextDeviceLighting,
      },
    };
    setLightingConfig(nextConfig);
    try { localStorage.setItem('nitro-kb-lighting', JSON.stringify(nextConfig)); } catch {}
    if (CUSTOM_SOFTWARE_EFFECTS.has(nextDeviceLighting.effect)) {
      return; // software driver effect handles hardware frames
    }
    if (lightingDebounceRef.current) clearTimeout(lightingDebounceRef.current);
    if (immediate) {
      window.nitro?.setLighting(nextConfig).catch(() => {});
    } else {
      lightingDebounceRef.current = setTimeout(() => {
        window.nitro?.setLighting(nextConfig).catch(() => {});
      }, 90);
    }
  };

  const selectLightingEffect = (eff) => {
    if (eff !== 'Static') {
      setLastAnimatedEffect(eff);
      try { localStorage.setItem('nitro-last-animated-effect', eff); } catch {}
    }
    const savedSpeed = speedByEffect[eff] ?? kbLighting.speed ?? 5;
    pushLighting({ ...kbLighting, effect: eff, speed: savedSpeed }, true);
  };

  const updateEffectSpeed = (newSpeed) => {
    const eff = kbLighting.effect || 'Static';
    const nextMap = { ...speedByEffect, [eff]: newSpeed };
    setSpeedByEffect(nextMap);
    try { localStorage.setItem('nitro-rgb-speeds', JSON.stringify(nextMap)); } catch {}
    pushLighting({ ...kbLighting, speed: newSpeed });
  };

  const updateZoneColor = (idx, color) => {
    const zones = (kbLighting.zones || DEFAULT_LIGHTING.zones).map((z, i) =>
      (syncAll || i === idx) ? { ...z, color } : z
    );
    pushLighting({ ...kbLighting, effectColor: color, zones }, false);
  };

  const toggleZoneOn = (idx) => {
    const zones = (kbLighting.zones || DEFAULT_LIGHTING.zones).map((z, i) =>
      i === idx ? { ...z, on: !z.on } : z
    );
    pushLighting({ ...kbLighting, zones }, true);
  };

  const updateKeyboardSetting = (key, value) => {
    const next = { ...keyboardSettings, [key]: value };
    setKeyboardSettings(next);
    window.nitro?.setKeyboard(next).catch(() => {});
  };

  const updatePowerSetting = (patch) => {
    const next = { ...powerSettings, ...patch };
    setPowerSettings(next);
    window.nitro?.setPower(next).catch(() => {});
  };

  const DEFAULT_RGB_PROFILES = [
    ['#00e5ff', '#00e5ff', '#00e5ff', '#00e5ff'],
    ['#ff3300', '#ff3300', '#ff3300', '#ff3300'],
    ['#10b981', '#10b981', '#10b981', '#10b981'],
    ['#a855f7', '#a855f7', '#a855f7', '#a855f7'],
    ['#ffffff', '#ffffff', '#ffffff', '#ffffff'],
  ];

  const [rgbProfiles, setRgbProfiles] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('nitro-rgb-presets') || 'null');
      if (Array.isArray(saved) && saved.length > 0) return saved;
    } catch {}
    return DEFAULT_RGB_PROFILES;
  });
  const [showAddPreset, setShowAddPreset] = useState(false);
  const [newPresetColor, setNewPresetColor] = useState('#00e5ff');

  const addRgbPreset = (hex) => {
    const next = [...rgbProfiles, [hex, hex, hex, hex]];
    setRgbProfiles(next);
    try { localStorage.setItem('nitro-rgb-presets', JSON.stringify(next)); } catch {}
    setShowAddPreset(false);
  };

  const deleteRgbPreset = (idx) => {
    if (rgbProfiles.length <= 1) return;
    const next = rgbProfiles.filter((_, i) => i !== idx);
    setRgbProfiles(next);
    try { localStorage.setItem('nitro-rgb-presets', JSON.stringify(next)); } catch {}
  };

  // HackBGRT handlers
  const handleBootFileChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setBootFile(f);
    if (bootPreview) URL.revokeObjectURL(bootPreview);
    setBootPreview(URL.createObjectURL(f));
    setBootStatus('idle');
    setBootMsg('');
    setBootInstructionsRead(false);
    setBootRestartNotice(false);
    setIsBootInstructionsOpen(true);
  };

  const handleBootApply = async () => {
    if (!bootFile || !bootInstructionsRead) return;
    setBootStatus('applying');
    setBootMsg('');
    setHackbgrtMissing(false);
    try {
      const buf = await bootFile.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const dataBase64 = btoa(binary);
      const res = await window.electron?.invoke('hackbgrt-apply', { dataBase64, name: bootFile.name });
      if (res?.ok) {
        setBootStatus('success');
        setBootMsg('Boot logo applied! Restart to apply changes.');
        setBootRestartNotice(true);
        refreshHackbgrtStatus();
      } else {
        setBootStatus('error');
        setBootMsg(res?.msg || 'Unknown error');
        if (res?.notInstalled) setHackbgrtMissing(true);
      }
    } catch (err) {
      setBootStatus('error'); setBootMsg(err.message);
    }
  };

  const handleHackbgrtInstall = async () => {
    setHackbgrtInstallStatus('installing');
    setHackbgrtInstallMsg('');
    try {
      const res = await window.electron?.invoke('install-hackbgrt');
      if (res?.ok) {
        setHackbgrtInstallStatus('done');
        setHackbgrtInstallMsg(res.msg);
        setHackbgrtMissing(false);
        refreshHackbgrtStatus();
      } else {
        setHackbgrtInstallStatus('error');
        setHackbgrtInstallMsg(res?.msg || 'Unknown error');
      }
    } catch (err) {
      setHackbgrtInstallStatus('error');
      setHackbgrtInstallMsg(err.message);
    }
  };

  const refreshDebugInfo = async () => {
    const info = await window.nitro?.getDebugInfo?.().catch(() => null);
    if (info) {
      setDebugInfo(info);
      if (Array.isArray(info.logs)) setDebugLogs(info.logs);
    }
  };

  const openDebugModal = () => {
    setIsDebugOpen(true);
    refreshDebugInfo();
  };

  const handleCloseAction = () => {
    if (closeBehavior === 'tray') {
      window.electron?.send('window-close-tray');
    } else if (closeBehavior === 'exit') {
      window.electron?.send('app-quit');
    } else {
      setIsClosePromptOpen(true);
    }
  };

  useEffect(() => {
    const unsubClose = window.electron?.onRequestClose?.(() => {
      handleCloseAction();
    });
    return () => { if (typeof unsubClose === 'function') unsubClose(); };
  });

  useEffect(() => {
    const formatCombo = (e) => {
      const parts = [];
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.shiftKey) parts.push('Shift');
      if (e.altKey) parts.push('Alt');
      if (e.metaKey) parts.push('Meta');
      const k = e.key;
      if (!['Control', 'Shift', 'Alt', 'Meta'].includes(k)) {
        parts.push(k.length === 1 ? k.toUpperCase() : k);
        return parts.join('+');
      }
      return null;
    };

    const onKeyDown = (e) => {
      if (recordingShortcut) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setRecordingShortcut(false);
          return;
        }
        const combo = formatCombo(e);
        if (combo) {
          e.preventDefault();
          setDebugShortcut(combo);
          try { localStorage.setItem('nitro-debug-shortcut', combo); } catch {}
          setRecordingShortcut(false);
        }
        return;
      }

      const combo = formatCombo(e);
      if (combo && combo.toLowerCase() === String(debugShortcut || 'Shift+F12').toLowerCase()) {
        e.preventDefault();
        setIsDebugOpen(prev => {
          const next = !prev;
          if (next) refreshDebugInfo();
          return next;
        });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [recordingShortcut, debugShortcut]);

  /* ======== TAB PANELS ======== */

  const homePanelJSX = (
    <div className="flex flex-1 overflow-hidden">
      {/* LEFT: My Rig + Usage graphs */}
      <div className="w-[280px] shrink-0 border-r border-white/10 p-5 flex flex-col gap-4 overflow-y-auto bg-black/30">
        <div className="bg-[#070b12]/80 rounded-xl p-4 border border-white/10 space-y-2.5">
          <div className="flex items-center gap-2 mb-1">
            <Cpu size={14} style={{ color: 'var(--accent)' }} />
            <span className="text-xs font-black text-white tracking-wide">My rig</span>
          </div>
          {[
            { label: 'System', value: matchedModel?.Title || snapshot?.deviceName || 'Detecting...' },
            { label: 'Processor', value: formatCpuName(snapshot?.cpuName) },
            { label: 'Graphics', value: formatGpuName(snapshot?.gpuName) },
            { label: 'Memory', value: systemSpecs?.totalRamGb ? `${systemSpecs.totalRamGb} GB RAM` : '—' },
            { label: 'Storage', value: systemSpecs?.totalStorageGb ? `${systemSpecs.totalStorageGb} GB Total` : '—' },
            { label: 'Windows', value: systemSpecs?.windowsName || 'Windows' },
            { label: 'BIOS', value: snapshot?.biosVersion || '—' },
          ].map((row, idx) => (
            <div key={idx} className="flex items-center justify-between gap-2 text-[11px] border-b border-white/5 pb-1.5 last:border-b-0 last:pb-0">
              <span className="text-slate-400 font-semibold shrink-0">{row.label}</span>
              <span className="text-white font-semibold text-right leading-tight">{row.value}</span>
            </div>
          ))}
        </div>

        <div className="space-y-3 mt-auto">
          <div className="bg-[#070b12]/80 rounded-xl p-4 border border-white/10 hover-card">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] font-bold text-slate-400 tracking-widest">GPU Usage</span>
              <span className="text-base font-black text-white tabular-nums">{gpuLoad}%</span>
            </div>
            <MiniGraph data={usageHistory.gpu} color={accentColor} height={44} showGrid />
          </div>
          <div className="bg-[#070b12]/80 rounded-xl p-4 border border-white/10 hover-card">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] font-bold text-slate-400 tracking-widest">CPU Usage</span>
              <span className="text-base font-black text-white tabular-nums">{cpuLoad}%</span>
            </div>
            <MiniGraph data={usageHistory.cpu} color="#38bdf8" height={44} showGrid />
          </div>
        </div>
      </div>

      {/* CENTER: System mode + Side-by-Side Nitro Logo (breathing glow) & Laptop Model Picture */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        <div className="text-center pt-5 relative z-10">
          <div className="text-[11px] font-bold text-slate-400 tracking-[0.4em]">System Mode</div>
          <div className="text-2xl font-black text-white tracking-wider mt-1">{activeModeMeta.label}</div>
          {POWER_LIMIT_TEXT[powerLimit] && (
            <div className="text-[10px] font-bold tracking-widest mt-1" style={{ color: 'var(--accent)' }}>
              {POWER_LIMIT_TEXT[powerLimit]}
            </div>
          )}
        </div>

        {/* Side-by-side Model Picture + Auto-Rescaling Nitro Logo */}
        <div className="flex-1 flex items-center justify-center gap-12 px-8 relative z-10">
          {/* Left: Laptop Model Picture */}
          <div className="flex flex-col items-center justify-center flex-1 max-w-[420px]">
            <div className="relative flex items-center justify-center">
              <div
                className="absolute rounded-full pointer-events-none"
                style={{
                  width: '85%',
                  height: '85%',
                  background: `radial-gradient(ellipse at 50% 55%, rgba(var(--accent-rgb), 0.22) 0%, transparent 70%)`,
                                  }}
              />
              <img
                src={modelImageSrc}
                alt={matchedModel?.Title || snapshot?.deviceName || 'Acer Nitro'}
                className="relative z-10 w-auto object-contain"
                style={{
                  maxHeight: 'clamp(210px, 38vh, 380px)',
                  filter: `drop-shadow(0 14px 30px rgba(0,0,0,0.88)) drop-shadow(0 0 20px rgba(var(--accent-rgb), 0.28))`,
                }}
              />
            </div>
            <div className="mt-3 text-center">
              <div className="text-xs font-black text-white tracking-[0.2em]">
                {matchedModel?.Title || snapshot?.deviceName || 'Acer Nitro'}
              </div>
              <div className="text-[9px] font-bold text-slate-500 tracking-widest mt-0.5">
                {snapshot?.deviceName || 'Detected Hardware'}
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="h-[34vh] min-h-[160px] max-h-[280px] w-px bg-gradient-to-b from-transparent via-white/15 to-transparent" />

          {/* Right: Auto-rescaling n.svg Logo with seamless moving gradient & edge glow */}
          <div className="flex flex-col items-center justify-center flex-1 max-w-[320px]">
            <NitroLogoSvg
              mode={activeOperatingMode}
              style={{ height: 'clamp(210px, 35vh, 360px)' }}
            />
          </div>
        </div>

        {/* Bottom-Center Branding */}
        <div className="pb-5 text-center relative z-10">
          <div className="text-[26px] leading-none tracking-[0.30em] font-extralight text-white">
            NITRO<span className="font-black" style={{ color: 'var(--accent)' }}>HUB</span>
          </div>
          <div className="text-[9px] font-bold text-slate-500 tracking-[0.42em] mt-1.5">
            PERFORMANCE CONTROL
          </div>
        </div>

        <div className="absolute right-0 top-0 bottom-0 w-7 flex items-center justify-center border-l border-white/10">
          <span className="text-[9px] font-black text-slate-600 tracking-[0.6em]"
            style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)' }}>
            Temperature
          </span>
        </div>
      </div>

      {/* RIGHT: Temperature gauges */}
      <div className="w-[200px] shrink-0 border-l border-white/10 flex flex-col items-center justify-around py-4 px-3 overflow-y-auto bg-black/30">
        <div className="flex flex-col items-center">
          <CircularGauge
            value={telemetry?.gpuAsleep ? '—' : gpuTemp}
            max={gpuLimit}
            size={155}
            strokeWidth={11}
            label="GPU"
            unit="°C"
            sublabel={`Limit ${gpuLimit}°C`}
          />
          <div className="text-[10px] font-bold text-slate-400 tabular-nums mt-1">
            {telemetry?.gpuAsleep ? 'Asleep' : `${telemetry?.gpuMhz || 0} MHz`}
          </div>
        </div>
        <div className="w-4/5 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="flex flex-col items-center">
          <CircularGauge
            value={cpuTemp}
            max={cpuLimit}
            size={155}
            strokeWidth={11}
            label="CPU"
            unit="°C"
            sublabel={`Limit ${cpuLimit}°C`}
          />
          <div className="text-[10px] font-bold text-slate-400 tabular-nums mt-1">
            {telemetry?.cpuMhz ? `${telemetry.cpuMhz} MHz` : '—'}
          </div>
        </div>
        <div className="w-4/5 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <CircularGauge value={sysTemp} max={100} size={155} strokeWidth={11} label="System" unit="°C" />
      </div>
    </div>
  );

  const scenarioPanelJSX = (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="w-full space-y-6">
        {notice && (
          <div className="bg-[rgba(var(--accent-rgb),0.1)] border border-[rgba(var(--accent-rgb),0.4)] rounded-xl p-4 flex items-center gap-3 text-xs font-bold text-white">
            <AlertTriangle size={16} style={{ color: 'var(--accent)' }} className="shrink-0" />
            <span>{notice.message || notice.title || String(notice)}</span>
          </div>
        )}

        {/* Operating Mode (Full Width) */}
        <div className="bg-[#070b12]/80 rounded-2xl border border-white/10 p-6 hover-panel">
          <div className="flex justify-between items-center mb-5">
            <div>
              <h3 className="text-sm font-black text-white tracking-widest flex items-center gap-2">
                <Zap size={16} style={{ color: 'var(--accent)' }} /> Operating Mode
              </h3>
              {POWER_LIMIT_TEXT[powerLimit] && (
                <p className="text-[10px] font-bold tracking-wider mt-1" style={{ color: 'var(--accent)' }}>{POWER_LIMIT_TEXT[powerLimit]}</p>
              )}
            </div>
            <span className="text-[11px] font-bold px-3.5 py-1.5 rounded-full border border-[rgba(var(--accent-rgb),0.3)] bg-[rgba(var(--accent-rgb),0.1)]" style={{ color: 'var(--accent)' }}>
              {activeModeMeta.label}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {supportedModes.map(modeKey => {
              const meta = OPERATING_MODE_META[modeKey] || { label: modeKey, desc: '', icon: Zap };
              const ModeIcon = meta.icon || Zap;
              const allowed = allowedModes.includes(modeKey);
              const active = activeOperatingMode === modeKey;
              return (
                <button key={modeKey} onClick={() => handleOperatingModeChange(modeKey)} disabled={!allowed}
                  className={`p-5 min-h-[116px] rounded-xl border-2 text-left flex flex-col justify-between gap-2 transition-all ${
                    active ? 'bg-[rgba(var(--accent-rgb),0.12)] border-[var(--accent)] shadow-[0_0_24px_rgba(var(--accent-rgb),0.18)]'
                      : allowed ? 'bg-black/40 border-white/10 hover:border-white/25'
                        : 'bg-black/20 border-white/5 opacity-40 cursor-not-allowed'
                  }`}>
                  <ModeIcon size={22} style={{ color: active ? 'var(--accent)' : '#64748b' }} />
                  <div>
                    <div className={`font-black text-sm ${active ? 'text-white' : 'text-slate-300'}`}>{meta.label}</div>
                    <div className={`text-[9px] font-bold tracking-widest mt-1 ${active ? 'text-slate-300' : 'text-slate-500'}`}>
                      {allowed ? meta.desc : 'Blocked by power limit'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Cooling Fans Widget (Big Spinning Fans with Readings Below & Temp in Top-Right) */}
        <div className="bg-[#070b12]/80 rounded-2xl border border-white/10 p-6">
          <h3 className="text-sm font-black text-white tracking-widest mb-5 flex items-center gap-2">
            <Fan size={16} style={{ color: 'var(--accent)' }} /> Cooling fans
          </h3>
          <div className={`grid gap-5 ${sysFanTelemetry ? 'grid-cols-3' : 'grid-cols-2'}`}>
            {[
              { label: 'CPU fan', rpm: cpuFanTelemetry?.rpm ?? 0, boost: cpuFanTelemetry?.boostPercent ?? 0, tempText: `${cpuTemp}°C` },
              { label: 'GPU fan', rpm: gpuFanTelemetry?.rpm ?? 0, boost: gpuFanTelemetry?.boostPercent ?? 0, tempText: telemetry?.gpuAsleep ? 'Asleep' : `${gpuTemp}°C` },
              ...(sysFanTelemetry ? [{ label: 'System fan', rpm: sysFanTelemetry.rpm ?? 0, boost: 0, tempText: `${sysTemp}°C` }] : []),
            ].map((fan, i) => (
              <div key={i} className="relative bg-black/40 rounded-xl p-6 border border-white/10 hover-card flex flex-col items-center justify-center gap-4">
                <div className="absolute top-3.5 right-4 flex items-baseline gap-1.5 text-xs">
                  <span className="text-slate-400 font-semibold">Temp</span>
                  <span className="font-black text-white tabular-nums">{fan.tempText}</span>
                </div>
                <FanRotor rpm={fan.rpm} boost={fan.boost} size={116} />
                <div className="text-center">
                  <div className="text-xs font-bold text-slate-300 tracking-wide mb-1">{fan.label}</div>
                  <div className="flex items-baseline justify-center gap-1.5">
                    <span className="text-3xl font-black tabular-nums" style={{ color: 'var(--accent)' }}>{fan.rpm}</span>
                    <span className="text-xs text-slate-400 font-bold">RPM</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Row: Fan Control + Thermal & Power Policy */}
        <div className="grid grid-cols-12 gap-6 items-stretch">
          <div className="col-span-8 bg-[#070b12]/80 rounded-2xl border border-white/10 p-6 min-h-[260px] flex flex-col justify-between">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-sm font-black text-white tracking-widest flex items-center gap-2">
                  <Wind size={16} style={{ color: 'var(--accent)' }} /> Fan Control
                </h3>
                {telemetry?.fanLock && (
                  <p className="text-[10px] font-bold tracking-wider mt-1" style={{ color: 'var(--accent)' }}>
                    Locked to Auto ({telemetry.fanLock})
                  </p>
                )}
                {telemetry?.failsafe && (
                  <p className="text-[10px] text-red-400 font-bold tracking-wider mt-1">
                    Failsafe Active — CPU temperature missing, fans restored to Auto
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setIsCurveEditorOpen(true)}
                  className="flex items-center gap-1.5 text-[10px] font-black tracking-widest px-3 py-1.5 rounded-lg border border-white/10 bg-black/40 text-slate-300 hover:text-white hover:border-[var(--accent)] transition-all">
                  <Settings size={12} /> Graph Curve Editor
                </button>
                <span className="text-[11px] font-bold px-3 py-1 rounded-full border border-[rgba(var(--accent-rgb),0.3)] bg-[rgba(var(--accent-rgb),0.1)]" style={{ color: 'var(--accent)' }}>
                  {fanMode}
                </span>
              </div>
            </div>

            <div className="flex gap-3 mb-4">
              {['auto', 'max', 'custom'].map(m => (
                <button key={m} onClick={() => handleFanModeChange(m)}
                  className={`flex-1 py-2.5 rounded-xl border font-black text-[10px] tracking-widest transition-all ${
                    fanMode === m
                      ? 'bg-[rgba(var(--accent-rgb),0.15)] border-[var(--accent)] text-white'
                      : 'bg-black/40 border-white/10 text-slate-400 hover:border-white/25 hover:text-slate-200'
                  }`}>
                  {m}
                </button>
              ))}
            </div>

            <div className={`grid grid-cols-2 gap-5 transition-all ${fanMode === 'custom' ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
              {[
                { id: 'Cpu', label: 'CPU Boost over Auto', rpm: cpuFanTelemetry?.rpm, liveBoost: cpuFanTelemetry?.boostPercent },
                { id: 'Gpu', label: 'GPU Boost over Auto', rpm: gpuFanTelemetry?.rpm, liveBoost: gpuFanTelemetry?.boostPercent },
              ].map(f => {
                const setting = profile.manual?.[f.id] || { percent: 30, useCurve: false };
                return (
                  <div key={f.id}>
                    <div className="flex justify-between items-center mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400 tracking-widest">{f.label}</span>
                        <button onClick={() => handleFanUseCurveToggle(f.id)}
                          className={`px-2 py-0.5 rounded text-[9px] font-black tracking-wider border transition-all ${
                            setting.useCurve
                              ? 'bg-[rgba(var(--accent-rgb),0.18)] border-[var(--accent)] text-white'
                              : 'bg-black/40 border-white/10 text-slate-400 hover:text-white'
                          }`}>
                          {setting.useCurve ? 'Curve' : 'Fixed'}
                        </button>
                      </div>
                      <span className="text-sm font-black" style={{ color: 'var(--accent)' }}>
                        {setting.useCurve ? `${f.liveBoost ?? 0}%` : `${setting.percent}%`}
                      </span>
                    </div>
                    <FilledSlider
                      min={0}
                      max={100}
                      step={10}
                      disabled={setting.useCurve}
                      value={setting.percent}
                      onChange={(e) => handleFanPercentChange(f.id, e.target.value)}
                    />
                  </div>
                );
              })}
            </div>

            {(caps?.coolBoost || caps?.fanTable || caps?.dustDefender) && (
              <div className="mt-5 pt-4 border-t border-white/10 flex flex-wrap gap-2.5 items-center">
                {caps?.coolBoost && (
                  <button onClick={() => pushProfile(p => ({ ...p, coolBoost: !(p.coolBoost ?? telemetry?.coolBoost) }))}
                    className={`px-3.5 py-2 rounded-xl border text-[10px] font-black tracking-widest transition-all ${
                      (profile.coolBoost ?? telemetry?.coolBoost)
                        ? 'bg-[rgba(var(--accent-rgb),0.15)] border-[var(--accent)] text-white'
                        : 'bg-black/40 border-white/10 text-slate-400'
                    }`}>
                    CoolBoost: {(profile.coolBoost ?? telemetry?.coolBoost) ? 'ON' : 'OFF'}
                  </button>
                )}
                {caps?.fanTable && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-slate-400 tracking-widest">EC Curve:</span>
                    {['Standard', 'Faster', 'Fastest'].map(t => (
                      <button key={t} onClick={() => pushProfile(p => ({ ...p, fanTable: t }))}
                        className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-black tracking-wider ${
                          profile.fanTable === t ? 'bg-[rgba(var(--accent-rgb),0.15)] border-[var(--accent)] text-white' : 'bg-black/40 border-white/10 text-slate-400'
                        }`}>
                        {t}
                      </button>
                    ))}
                  </div>
                )}
                {caps?.dustDefender && (
                  <button onClick={() => window.nitro?.startDustDefender()}
                    disabled={telemetry?.dustDefenderRunning}
                    className="ml-auto px-3.5 py-2 rounded-xl border border-white/10 bg-black/40 text-[10px] font-black tracking-widest text-slate-300 hover:border-[var(--accent)] disabled:opacity-50">
                    {telemetry?.dustDefenderRunning ? 'Dust Defender Running...' : 'Run Dust Defender'}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="col-span-4 bg-[#070b12]/80 rounded-2xl border border-white/10 p-6 space-y-3 min-h-[260px]">
            <h3 className="text-sm font-black text-white tracking-widest flex items-center gap-2 mb-3">
              <Shield size={16} style={{ color: 'var(--accent)' }} /> Power &amp; Status
            </h3>
            <div className="space-y-2 text-[11px]">
              <div className="flex justify-between bg-black/40 rounded-xl p-3 border border-white/10">
                <span className="text-slate-400">Power Source</span>
                <span className="font-bold text-white">{telemetry?.onAcPower === false ? 'Battery' : 'AC Adapter'}</span>
              </div>
              <div className="flex justify-between bg-black/40 rounded-xl p-3 border border-white/10">
                <span className="text-slate-400">Policy Limit</span>
                <span className="font-bold" style={{ color: 'var(--accent)' }}>{powerLimit}</span>
              </div>
              <div className="flex justify-between bg-black/40 rounded-xl p-3 border border-white/10">
                <span className="text-slate-400">Requested / Effective</span>
                <span className="font-bold text-white">{telemetry?.requestedMode || 'Auto'} / {telemetry?.effectiveMode || 'Auto'}</span>
              </div>
              <div className="flex justify-between bg-black/40 rounded-xl p-3 border border-white/10">
                <span className="text-slate-400">Firmware Sync</span>
                <span className={`font-bold ${telemetry?.controlConfirmed ? 'text-emerald-400' : 'text-slate-400'}`}>
                  {telemetry?.controlConfirmed ? 'Confirmed' : 'Pending'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const personalPanelJSX = (
    <div className="flex-1 p-5 overflow-y-auto">
      <div className="max-w-5xl mx-auto space-y-5">
        {/* 1. TOP-MOST: Big Live Keyboard Preview Widget */}
        <div className="bg-[#070b12]/80 rounded-2xl border border-white/10 p-5 flex flex-col gap-4 hover-panel">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-black text-white tracking-widest flex items-center gap-2">
              <Keyboard size={15} style={{ color: 'var(--accent)' }} /> Live Keyboard Preview
            </h3>
            <div className="flex items-center gap-2">
              {rgbPanelTab === 'static' && (
                <button onClick={() => setSyncAll(!syncAll)}
                  className={`flex items-center gap-1 text-[9px] font-black tracking-widest px-2.5 py-1 rounded-lg border transition-all ${syncAll ? 'bg-[rgba(var(--accent-rgb),0.15)] border-[var(--accent)] text-white' : 'border-white/10 text-slate-400 hover:border-white/25'}`}>
                  <Layers size={10} /> Sync All
                </button>
              )}
              <span className="text-[9px] font-bold tracking-widest px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-slate-300">
                {kbLighting.effect} · {kbLighting.brightness}%
              </span>
            </div>
          </div>

          <KeyboardPreview
            lighting={kbLighting}
            interactive={rgbPanelTab === 'static'}
            onZoneClick={(zoneIdx) => {
              if (rgbPanelTab === 'static' && kbLighting.effect === 'Static') {
                toggleZoneOn(zoneIdx);
              }
            }}
          />

          {/* Zonal RGB Color Changer — Static Page Only */}
          {rgbPanelTab === 'static' && (
            <div className="grid grid-cols-4 gap-3 pt-1">
              {(kbLighting.zones || DEFAULT_LIGHTING.zones).map((z, idx) => (
                <div key={idx} className="bg-black/40 rounded-xl px-3.5 py-2.5 border border-white/10 flex items-center justify-between">
                  <button onClick={() => toggleZoneOn(idx)} className={`text-[10px] font-bold ${z.on ? 'text-slate-200' : 'text-slate-600 line-through'}`}>
                    {ZONE_NAMES[idx] || `Z${idx + 1}`}
                  </button>
                  <label className="relative cursor-pointer">
                    <div className="w-6 h-6 rounded-lg border border-white/20" style={{ backgroundColor: z.color, opacity: z.on ? 1 : 0.3 }}>
                      <input type="color" value={z.color} onChange={(e) => updateZoneColor(idx, e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                    </div>
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 2. MIDDLE: Lighting Controls (Static vs Animated) */}
        <div className="bg-[#070b12]/80 rounded-2xl border border-white/10 p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex flex-1 bg-black/50 p-1 rounded-xl border border-white/10">
              {[
                { id: 'static', label: 'Static' },
                { id: 'animated', label: 'Animated' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setRgbPanelTab(tab.id);
                    if (tab.id === 'static' && kbLighting.effect !== 'Static') {
                      setLastAnimatedEffect(kbLighting.effect);
                      try { localStorage.setItem('nitro-last-animated-effect', kbLighting.effect); } catch {}
                      selectLightingEffect('Static');
                    } else if (tab.id === 'animated' && kbLighting.effect === 'Static') {
                      selectLightingEffect(lastAnimatedEffect || 'Wave');
                    }
                  }}
                  className={`flex-1 py-2 rounded-lg text-[10px] font-black tracking-widest transition-all ${
                    rgbPanelTab === tab.id ? 'text-black shadow' : 'text-slate-400 hover:text-white'
                  }`}
                  style={rgbPanelTab === tab.id ? { backgroundColor: 'var(--accent)' } : undefined}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <button onClick={() => { setRgbPanelTab('static'); pushLighting(DEFAULT_LIGHTING, true); }} title="Reset Lighting" className="p-2.5 hover:bg-white/5 rounded-lg border border-white/10" style={{ color: 'var(--accent)' }}>
              <RefreshCw size={14} />
            </button>
          </div>

          {rgbPanelTab === 'static' ? (
            /* ---- STATIC CONTROLS ---- */
            <div className="grid grid-cols-12 gap-5 items-center pt-1">
              <div className="col-span-6">
                <label className="text-[9px] font-black text-slate-400 tracking-widest block mb-2">Color presets</label>
                <div className="flex gap-2.5 flex-wrap items-center">
                  {rgbProfiles.map((p, idx) => (
                    <div key={idx} className="relative group">
                      <button
                        onClick={() => pushLighting({
                          ...kbLighting,
                          effect: 'Static',
                          effectColor: p[0],
                          zones: p.map(color => ({ on: true, color })),
                        }, true)}
                        className={`w-9 h-9 rounded-lg border-2 overflow-hidden flex flex-wrap transition-all hover:scale-110 ${(kbLighting.zones?.[0]?.color || '') === p[0] ? 'border-white scale-105' : 'border-transparent'}`}
                        style={{ boxShadow: `0 0 10px ${p[0]}40` }}
                      >
                        {p.map((c, i) => <div key={i} className="w-1/2 h-1/2" style={{ backgroundColor: c }} />)}
                      </button>
                      {rgbProfiles.length > 1 && (
                        <button
                          type="button"
                          title="Delete preset"
                          onClick={(e) => { e.stopPropagation(); deleteRgbPreset(idx); }}
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-black border border-white/30 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 hover:border-red-400"
                        >
                          <X size={9} />
                        </button>
                      )}
                    </div>
                  ))}

                  {showAddPreset ? (
                    <div className="flex items-center gap-1.5 bg-black/60 border border-white/15 rounded-lg px-2 py-1">
                      <input
                        type="color"
                        value={newPresetColor}
                        onChange={(e) => setNewPresetColor(e.target.value)}
                        className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0"
                      />
                      <button
                        type="button"
                        onClick={() => addRgbPreset(newPresetColor)}
                        className="px-2 py-1 rounded text-[10px] font-black text-black"
                        style={{ backgroundColor: 'var(--accent)' }}
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAddPreset(false)}
                        className="p-0.5 text-slate-400 hover:text-white"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      title="Add color preset"
                      onClick={() => setShowAddPreset(true)}
                      className="w-9 h-9 rounded-lg border border-dashed border-white/25 bg-black/40 hover:border-[var(--accent)] text-slate-300 hover:text-white flex items-center justify-center transition-all"
                    >
                      <Plus size={15} />
                    </button>
                  )}
                </div>
              </div>
              <div className="col-span-6">
                <div className="flex justify-between mb-2">
                  <label className="text-[9px] font-black text-slate-400 tracking-widest">Brightness</label>
                  <span className="text-xs font-black" style={{ color: 'var(--accent)' }}>{kbLighting.brightness}%</span>
                </div>
                <FilledSlider min={0} max={100} step={25} value={kbLighting.brightness} onChange={(e) => pushLighting({ ...kbLighting, effect: 'Static', brightness: parseInt(e.target.value, 10) })} />
              </div>
            </div>
          ) : (
            /* ---- ANIMATED CONTROLS ---- */
            <div className="space-y-4 pt-1">
              <div>
                <label className="text-[9px] font-black text-slate-400 tracking-widest block mb-2">Animation Effects</label>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {supportedEffects.filter(e => e !== 'Static').slice(0, 12).map(eff => {
                    const meta = EFFECT_META[eff] || { name: eff, icon: Sparkles };
                    const IconComp = meta.icon;
                    const active = kbLighting.effect === eff;
                    return (
                      <button key={eff} onClick={() => selectLightingEffect(eff)}
                        className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                          active ? 'bg-[rgba(var(--accent-rgb),0.15)] border-[var(--accent)] text-white' : 'bg-black/40 border-white/10 text-slate-400 hover:border-white/25'
                        }`}>
                        <IconComp size={15} style={{ color: active ? 'var(--accent)' : undefined }} />
                        <span className="text-[8px] font-black tracking-widest truncate w-full text-center">{meta.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-12 gap-5 items-center">
                <div className="col-span-5">
                  <div className="flex justify-between mb-1.5">
                    <label className="text-[9px] font-black text-slate-400 tracking-widest">
                      Speed ({EFFECT_META[kbLighting.effect]?.name || kbLighting.effect})
                    </label>
                    <span className="text-xs font-black" style={{ color: 'var(--accent)' }}>LVL {kbLighting.speed}</span>
                  </div>
                  <FilledSlider
                    min={1}
                    max={9}
                    step={1}
                    value={kbLighting.speed}
                    onChange={(e) => updateEffectSpeed(parseInt(e.target.value, 10))}
                  />
                </div>
                <div className="col-span-4">
                  <div className="flex justify-between mb-1.5">
                    <label className="text-[9px] font-black text-slate-400 tracking-widest">Brightness</label>
                    <span className="text-xs font-black" style={{ color: 'var(--accent)' }}>{kbLighting.brightness}%</span>
                  </div>
                  <FilledSlider min={0} max={100} step={25} value={kbLighting.brightness} onChange={(e) => pushLighting({ ...kbLighting, brightness: parseInt(e.target.value, 10) })} />
                </div>
                <div className="col-span-3 flex items-center justify-end gap-3">
                  {SINGLE_COLOR_EFFECTS.has(kbLighting.effect) && (
                    <div className="flex items-center gap-2">
                      <label className="text-[9px] font-black text-slate-400 tracking-widest">Color</label>
                      <label className="relative cursor-pointer">
                        <div className="w-7 h-7 rounded-lg border border-white/25" style={{ backgroundColor: kbLighting.effectColor || '#00e5ff' }}>
                          <input type="color" value={kbLighting.effectColor || '#00e5ff'} onChange={(e) => pushLighting({ ...kbLighting, effectColor: e.target.value }, false)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                        </div>
                      </label>
                    </div>
                  )}
                  {(kbLighting.effect === 'Wave' || kbLighting.effect === 'Shifting' || kbLighting.effect === 'Meteor') && (
                    <div className="flex items-center gap-1">
                      {['Left', 'Right'].map(dir => (
                        <button key={dir} onClick={() => pushLighting({ ...kbLighting, direction: dir }, true)}
                          className={`px-2 py-1 rounded-lg border text-[9px] font-black ${
                            kbLighting.direction === dir ? 'bg-[rgba(var(--accent-rgb),0.15)] border-[var(--accent)] text-white' : 'bg-black/40 border-white/10 text-slate-400'
                          }`}>
                          {dir}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {(caps?.keyboard?.backlightAutoOff || caps?.keyboard?.fnLock) && (
            <div className="pt-3 border-t border-white/10 grid grid-cols-2 gap-3">
              {caps?.keyboard?.backlightAutoOff && (
                <div className="flex items-center justify-between bg-black/40 rounded-xl px-4 py-2.5 border border-white/10">
                  <span className="text-[10px] font-bold text-slate-300 tracking-wider">Backlight Auto-Off</span>
                  <ToggleSwitch
                    checked={Boolean(keyboardSettings.backlightAutoOff ?? snapshot?.keyboard?.backlightAutoOff)}
                    onChange={(val) => updateKeyboardSetting('backlightAutoOff', val)}
                  />
                </div>
              )}
              {caps?.keyboard?.fnLock && (
                <div className="flex items-center justify-between bg-black/40 rounded-xl px-4 py-2.5 border border-white/10">
                  <span className="text-[10px] font-bold text-slate-300 tracking-wider">Fn Lock</span>
                  <ToggleSwitch
                    checked={Boolean(keyboardSettings.fnLock ?? snapshot?.keyboard?.fnLock)}
                    onChange={(val) => updateKeyboardSetting('fnLock', val)}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3. BOTTOM: Interface Accent Color */}
        <div className="bg-[#070b12]/80 rounded-2xl border border-white/10 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Palette size={16} style={{ color: 'var(--accent)' }} />
            <div>
              <h3 className="text-xs font-black text-white tracking-widest">Interface Accent Color</h3>
              <p className="text-[9px] text-slate-400 tracking-wider">Customize gauges, sliders, and ambient glow</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {ACCENT_PRESETS.map(p => (
              <button
                key={p.hex}
                title={p.name}
                onClick={() => handleAccentChange(p.hex)}
                className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${accentColor.toLowerCase() === p.hex.toLowerCase() ? 'border-white scale-110' : 'border-white/20'}`}
                style={{ backgroundColor: p.hex, boxShadow: accentColor.toLowerCase() === p.hex.toLowerCase() ? `0 0 10px ${p.hex}` : 'none' }}
              />
            ))}
            <label className="relative cursor-pointer ml-1" title="Custom Color">
              <div className="px-2.5 py-1 rounded-lg bg-black/40 border border-white/15 text-[9px] font-black tracking-wider text-white hover:border-white/40">
                Custom
              </div>
              <input type="color" value={accentColor} onChange={(e) => handleAccentChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
            </label>
          </div>
        </div>
      </div>
    </div>
  );

  const powerBootPanelJSX = (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-5">
        {/* Power & MUX Settings */}
        <div className="bg-[#070b12]/80 rounded-2xl border border-white/10 p-6 space-y-4 hover-panel">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-white tracking-widest flex items-center gap-2">
              <Battery size={16} style={{ color: 'var(--accent)' }} /> Power &amp; GPU Routing
            </h3>
            <span className="text-[10px] font-bold text-slate-400 tracking-widest">
              {telemetry?.onAcPower === false ? 'On Battery' : 'AC Connected'}
              {telemetry?.battery?.percent != null ? ` · ${telemetry.battery.percent}%` : ''}
            </span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between bg-black/40 rounded-xl p-4 border border-white/10">
              <div>
                <div className="text-xs font-bold text-white">Battery Charge Limit (80%)</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {caps?.battery?.chargeLimit
                    ? `Synced with Acer Care Center / BatteryControl (${(powerSettings.chargeLimit ?? snapshot?.firmware?.chargeLimit) ? 'Active' : 'Off'})`
                    : 'Not reported by current firmware probe'}
                </div>
              </div>
              <ToggleSwitch
                disabled={!caps?.battery?.chargeLimit}
                checked={Boolean(powerSettings.chargeLimit ?? snapshot?.firmware?.chargeLimit)}
                onChange={(val) => updatePowerSetting({ chargeLimit: val })}
              />
            </div>

            <div className="flex items-center justify-between bg-black/40 rounded-xl p-4 border border-white/10">
              <div>
                <div className="text-xs font-bold text-white">Power-off USB Charging</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {caps?.usbCharging
                    ? `Charge devices over USB while off (floor: ${(powerSettings.usbCharging ?? snapshot?.firmware?.usbCharging)?.floor || 30}%)`
                    : 'Not reported by current firmware probe'}
                </div>
              </div>
              <ToggleSwitch
                disabled={!caps?.usbCharging}
                checked={Boolean((powerSettings.usbCharging ?? snapshot?.firmware?.usbCharging)?.on)}
                onChange={(val) => updatePowerSetting({
                  usbCharging: {
                    on: val,
                    floor: (powerSettings.usbCharging ?? snapshot?.firmware?.usbCharging)?.floor || 30,
                  },
                })}
              />
            </div>

            <div className="flex items-center justify-between bg-black/40 rounded-xl p-4 border border-white/10">
              <div>
                <div className="text-xs font-bold text-white">GPU MUX Mode (Takes effect after reboot)</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {caps?.gpuModeSwitch ? 'Switch display routing between Hybrid and Discrete GPU' : 'MUX switch not detected on this model'}
                </div>
              </div>
              <div className="flex gap-1.5">
                {['Hybrid', 'Discrete', ...(caps?.gpuModeAutomatic ? ['Automatic'] : [])].map(m => (
                  <button
                    key={m}
                    disabled={!caps?.gpuModeSwitch}
                    onClick={() => window.nitro?.setGpuMode(m)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black border disabled:opacity-40 ${
                      snapshot?.firmware?.gpuMode === m ? 'bg-[rgba(var(--accent-rgb),0.2)] border-[var(--accent)] text-white' : 'border-white/10 text-slate-400'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* BOOT LOGO — HackBGRT */}
        <div className="bg-[#070b12]/80 rounded-2xl border border-white/10 p-6 hover-panel">
          <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-red-500/15 border border-red-500/45 flex items-center gap-2.5 text-red-300">
            <AlertTriangle size={15} className="shrink-0 text-red-400" />
            <span className="text-xs font-black tracking-wide">Advanced (proceed with caution)</span>
          </div>

          <div className="flex items-center gap-3 mb-2">
            <Monitor size={16} style={{ color: 'var(--accent)' }} />
            <h3 className="text-sm font-black text-white tracking-wide">Boot logo</h3>
            <span className={`ml-auto text-[10px] font-bold px-2.5 py-0.5 rounded-full tracking-wide border ${
              hackbgrtInfo?.installed
                ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                : 'bg-black/40 border-white/15 text-slate-200'
            }`}>
              {hackbgrtInfo?.installed
                ? (hackbgrtInfo.bgrtEntry ? 'HackBGRT installed · BGRT entry active' : 'HackBGRT found in EFI')
                : 'Requires HackBGRT'}
            </span>
          </div>
          <p className="text-xs text-slate-200 mb-5">
            Replace the UEFI boot screen splash image. Reads active boot logo from EFI partition when HackBGRT is installed.
          </p>

          <div className="flex gap-6 items-start">
            <div className="flex flex-col items-center gap-2 shrink-0">
              <div
                onClick={() => bootInputRef.current?.click()}
                className="w-52 h-40 rounded-xl border-2 border-dashed border-white/25 hover:border-[var(--accent)] hover:bg-black/40 transition-all cursor-pointer flex flex-col items-center justify-center relative overflow-hidden"
              >
                {(bootPreview || hackbgrtInfo?.splashDataUrl) ? (
                  <>
                    <img src={bootPreview || hackbgrtInfo.splashDataUrl} alt="Preview" className="w-full h-full object-contain" />
                    {!bootPreview && hackbgrtInfo?.splashDataUrl && (
                      <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-[9px] font-black tracking-wide bg-black/85 px-2 py-0.5 rounded text-emerald-300 border border-emerald-500/40 whitespace-nowrap">
                        Active EFI logo
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <Upload size={26} className="text-slate-300 mb-2" />
                    <span className="text-xs font-bold text-slate-200 text-center px-3">Select image</span>
                    <span className="text-[10px] text-slate-300 mt-1">PNG / JPG / BMP</span>
                  </>
                )}
                <input ref={bootInputRef} type="file" accept="image/png,image/jpeg,image/bmp" className="hidden" onChange={handleBootFileChange} />
              </div>
              <span className="text-[11px] font-semibold text-slate-200">Click on above to upload image</span>
            </div>

            <div className="flex flex-col gap-3 flex-1 justify-center pt-1">
              {bootFile ? (
                <div className="text-xs text-slate-200 flex items-center gap-2">
                  <span className="font-black text-white">{bootFile.name}</span>
                  <span className="text-slate-300">({Math.round(bootFile.size / 1024)} KB)</span>
                  <button
                    onClick={() => {
                      setBootFile(null);
                      setBootPreview(null);
                      setBootStatus('idle');
                      setBootMsg('');
                      setBootInstructionsRead(false);
                    }}
                    className="ml-auto text-slate-300 hover:text-red-400 transition-all"
                  >
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <div className="text-xs text-slate-300">No image uploaded yet</div>
              )}

              {bootStatus === 'success' && (
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                  <CheckCircle size={15} /> {bootMsg}
                </div>
              )}
              {bootStatus === 'error' && (
                <div className="text-xs font-bold text-red-400 leading-snug">{bootMsg}</div>
              )}

              <div className="flex items-center gap-2.5 flex-wrap">
                {bootFile && (
                  <>
                    <button
                      onClick={() => setIsBootInstructionsOpen(true)}
                      className="px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-xs font-bold text-white hover:border-[var(--accent)] transition-all"
                    >
                      {bootInstructionsRead ? 'Instructions read' : 'Read Secure Boot instructions'}
                    </button>
                    <button
                      onClick={handleBootApply}
                      disabled={!bootInstructionsRead || bootStatus === 'applying'}
                      className="px-6 py-2.5 rounded-xl text-black text-xs font-black tracking-wide hover:brightness-110 transition-all disabled:opacity-40 disabled:pointer-events-none"
                      style={{ backgroundColor: 'var(--accent)', boxShadow: '0 0 20px rgba(var(--accent-rgb), 0.3)' }}
                    >
                      {bootStatus === 'applying' ? 'Applying… (check UAC prompt)' : 'Apply boot logo'}
                    </button>
                  </>
                )}
                <button
                  onClick={checkHackbgrtUpdate}
                  disabled={hackbgrtUpdate.checking}
                  className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/20 text-xs font-bold text-slate-200 hover:border-[var(--accent)] transition-all disabled:opacity-50"
                >
                  {hackbgrtUpdate.checking ? 'Checking…' : 'Check for update'}
                </button>
              </div>

              {hackbgrtUpdate.ok === true && (
                <div className="text-xs font-semibold flex items-center gap-2">
                  {hackbgrtUpdate.updateAvailable ? (
                    <>
                      <span className="text-amber-300">
                        Update available: v{hackbgrtUpdate.latestVersion} (bundled v{hackbgrtUpdate.currentVersion})
                      </span>
                      <button
                        onClick={() => window.electron?.send('open-external', hackbgrtUpdate.releaseUrl)}
                        className="underline font-bold"
                        style={{ color: 'var(--accent)' }}
                      >
                        Download
                      </button>
                    </>
                  ) : (
                    <span className="text-emerald-300">
                      HackBGRT is up to date (v{hackbgrtUpdate.currentVersion})
                    </span>
                  )}
                </div>
              )}
              {hackbgrtUpdate.ok === false && hackbgrtUpdate.error && (
                <div className="text-xs text-slate-300">Update check skipped: {hackbgrtUpdate.error}</div>
              )}

              <p className="text-[11px] text-slate-300 leading-relaxed">
                Image is converted to 24-bit BMP and written to <span className="text-white font-semibold">\EFI\HackBGRT\splash.bmp</span> on the EFI partition.
              </p>

              {hackbgrtMissing && (
                <div className="mt-4 p-4 rounded-xl border border-[rgba(var(--accent-rgb),0.3)] bg-[rgba(var(--accent-rgb),0.06)]">
                  <div className="flex items-center gap-3 mb-2">
                    <AlertTriangle size={14} style={{ color: 'var(--accent)' }} />
                    <span className="text-[11px] font-black tracking-widest" style={{ color: 'var(--accent)' }}>HackBGRT Not Installed</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mb-3">HackBGRT was not found on your EFI partition. Click below to install it — a UAC prompt will appear to complete setup.</p>
                  {hackbgrtInstallStatus === 'done' && (
                    <div className="flex items-center gap-2 text-[11px] font-bold text-emerald-400 mb-2">
                      <CheckCircle size={14} /> {hackbgrtInstallMsg}
                    </div>
                  )}
                  {hackbgrtInstallStatus === 'error' && (
                    <div className="text-[11px] font-bold text-red-400 mb-2">{hackbgrtInstallMsg}</div>
                  )}
                  <button
                    onClick={handleHackbgrtInstall}
                    disabled={hackbgrtInstallStatus === 'installing'}
                    className="px-6 py-2.5 rounded-xl bg-black/50 border border-[var(--accent)] text-[11px] font-black tracking-widest hover:bg-white/10 transition-all disabled:opacity-40 disabled:pointer-events-none"
                    style={{ color: 'var(--accent)' }}
                  >
                    {hackbgrtInstallStatus === 'installing' ? '⏳ Running HackBGRT Setup… (check UAC)' : '⬇ Install HackBGRT'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const monitoringPanelJSX = (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="flex justify-between items-center">
          <div className="text-[11px] font-bold text-slate-400 tracking-widest">
            {telemetry?.onAcPower === false ? 'Running on Battery' : 'AC Power Connected'}
            {telemetry?.battery?.percent != null ? ` · Battery ${telemetry.battery.percent}%` : ''}
          </div>
          <button
            onClick={async () => {
              const res = await window.nitro?.getDiagnostics();
              if (res?.diagnostics) {
                await navigator.clipboard.writeText(res.diagnostics);
                setDiagnosticsCopied(true);
                setTimeout(() => setDiagnosticsCopied(false), 2500);
              }
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#070b12]/80 border border-white/10 hover:border-[var(--accent)] text-[10px] font-black tracking-widest transition-all"
            style={{ color: 'var(--accent)' }}
          >
            <Copy size={12} /> {diagnosticsCopied ? 'Copied Diagnostics!' : 'Copy Diagnostics'}
          </button>
        </div>
        <div className="grid grid-cols-3 gap-5">
          <div className="col-span-2 bg-[#070b12]/80 rounded-2xl border border-white/10 p-6 hover-panel">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-black text-white tracking-widest flex items-center gap-2">
                <Activity size={16} style={{ color: 'var(--accent)' }} /> Live Telemetry Curve
              </h3>
              <span className="text-[9px] font-bold tracking-widest px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-slate-400">
                Real-Time Load
              </span>
            </div>
            <div className="space-y-6">
              <div>
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-[11px] font-bold text-slate-400 tracking-widest">CPU Utilization</span>
                  <div className="flex items-baseline gap-3">
                    <span className="text-[10px] font-bold text-slate-500">
                      Peak {Math.max(...usageHistory.cpu, 0)}%
                    </span>
                    <span className="text-lg font-black text-white tabular-nums" style={{ color: 'var(--accent)' }}>{cpuLoad}%</span>
                  </div>
                </div>
                <MiniGraph data={usageHistory.cpu} color={accentColor} height={108} showGrid showAxes />
              </div>
              <div>
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-[11px] font-bold text-slate-400 tracking-widest">GPU Utilization</span>
                  <div className="flex items-baseline gap-3">
                    <span className="text-[10px] font-bold text-slate-500">
                      Peak {Math.max(...usageHistory.gpu, 0)}%
                    </span>
                    <span className="text-lg font-black text-sky-400 tabular-nums">{gpuLoad}%</span>
                  </div>
                </div>
                <MiniGraph data={usageHistory.gpu} color="#38bdf8" height={108} showGrid showAxes />
              </div>
            </div>
          </div>
          <div className="space-y-3">
            {[
              { label: 'GPU Load', value: gpuLoad, unit: '%' },
              { label: 'GPU Temp', value: telemetry?.gpuAsleep ? '—' : gpuTemp, unit: '°C' },
              { label: 'CPU Load', value: cpuLoad, unit: '%' },
              { label: 'CPU Temp', value: cpuTemp, unit: '°C' },
              { label: 'System', value: sysTemp, unit: '°C' },
              { label: 'RAM', value: telemetry?.ramUsage || 0, unit: '%' },
            ].map((item, i) => (
              <div key={i} className="bg-[#070b12]/80 rounded-xl border border-white/10 p-3.5 flex items-center justify-between hover-card">
                <span className="text-[10px] font-bold text-slate-400 tracking-widest">{item.label}</span>
                <div className="text-right tabular-nums">
                  <span className="text-lg font-black text-white">{item.value}</span>
                  <span className="text-[10px] font-bold ml-1" style={{ color: 'var(--accent)' }}>{item.unit}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[
            { value: telemetry?.gpuAsleep ? 0 : gpuTemp, max: gpuLimit, label: 'GPU', sub: `Limit ${gpuLimit}°C` },
            { value: cpuTemp, max: cpuLimit, label: 'CPU', sub: `Limit ${cpuLimit}°C` },
            { value: sysTemp, max: 100, label: 'System', sub: null },
          ].map((g, i) => (
            <div key={i} className="bg-[#070b12]/80 rounded-2xl border border-white/10 p-5 flex flex-col items-center">
              <CircularGauge value={g.value} max={g.max} size={130} strokeWidth={10} label={g.label} unit="°C" sublabel={g.sub} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const settingsPanelJSX = (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Window & System Tray Behavior */}
        <div className="bg-[#070b12]/90 rounded-2xl border border-white/10 p-6 space-y-4 hover-panel">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-white tracking-widest flex items-center gap-2">
              <Monitor size={16} style={{ color: 'var(--accent)' }} /> Window &amp; System Tray
            </h3>
            <span className="text-[10px] font-bold text-slate-400 tracking-widest">Close Behavior</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Choose what happens when you close Nitro Hub. Keeping it in the system tray allows instant reopening and keeps custom fan curves active.
          </p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: 'tray', label: 'Minimize to Tray', desc: 'Keep running in background' },
              { id: 'exit', label: 'Exit on Close', desc: 'Close app completely' },
              { id: 'ask', label: 'Ask Every Time', desc: 'Prompt when closing' },
            ].map(opt => {
              const active = closeBehavior === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => {
                    setCloseBehavior(opt.id);
                    try { localStorage.setItem('nitro-close-behavior', opt.id); } catch {}
                  }}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    active
                      ? 'bg-[rgba(var(--accent-rgb),0.12)] border-[var(--accent)] text-white'
                      : 'bg-black/40 border-white/10 text-slate-300 hover:border-white/25'
                  }`}
                >
                  <div className="text-xs font-black tracking-wider">{opt.label}</div>
                  <div className="text-[10px] text-slate-400 mt-1">{opt.desc}</div>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between bg-black/40 rounded-xl p-4 border border-white/10">
            <div>
              <div className="text-xs font-bold text-white">Start with Windows</div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Launch Nitro Hub minimized to the system tray when Windows starts.
              </div>
            </div>
            <ToggleSwitch
              checked={autoStartEnabled}
              onChange={async (val) => {
                setAutoStartEnabled(val);
                await window.electron?.invoke('set-auto-start', val).catch(() => {});
              }}
            />
          </div>
        </div>

        {/* Debug & Shortcut Settings */}
        <div className="bg-[#070b12]/90 rounded-2xl border border-white/10 p-6 space-y-4 hover-panel">
          <h3 className="text-sm font-black text-white tracking-widest flex items-center gap-2">
            <Activity size={16} style={{ color: 'var(--accent)' }} /> Debug Window &amp; Shortcuts
          </h3>

          <div className="flex items-center justify-between bg-black/40 rounded-xl p-4 border border-white/10">
            <div>
              <div className="text-xs font-bold text-white">Show Debug Button in Toolbar</div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                When disabled, use the keyboard shortcut to open the hardware &amp; service debugger.
              </div>
            </div>
            <ToggleSwitch
              checked={showDebugButton}
              onChange={(val) => {
                setShowDebugButton(val);
                try { localStorage.setItem('nitro-show-debug-btn', String(val)); } catch {}
              }}
            />
          </div>

          <div className="flex items-center justify-between bg-black/40 rounded-xl p-4 border border-white/10">
            <div>
              <div className="text-xs font-bold text-white">Debug Window Shortcut</div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Press this key combination anywhere in Nitro Hub to toggle the Debug window.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setRecordingShortcut(true)}
                className={`px-4 py-2 rounded-lg border text-[11px] font-black tracking-widest transition-all ${
                  recordingShortcut
                    ? 'bg-[rgba(var(--accent-rgb),0.18)] border-[var(--accent)] text-white animate-pulse'
                    : 'bg-white/5 border-white/15 text-white hover:border-[var(--accent)]'
                }`}
              >
                {recordingShortcut ? 'Press Keys... (Esc)' : debugShortcut}
              </button>
              <button
                onClick={() => {
                  setRecordingShortcut(false);
                  setDebugShortcut('Shift+F12');
                  try { localStorage.setItem('nitro-debug-shortcut', 'Shift+F12'); } catch {}
                }}
                className="px-3 py-2 rounded-lg border border-white/10 bg-black/40 text-[10px] font-bold tracking-wider text-slate-400 hover:text-white hover:border-white/25 transition-all"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* Contact Section */}
        <div className="bg-[#070b12]/90 rounded-2xl border border-white/10 p-6 space-y-4 hover-panel">
          <h3 className="text-sm font-black text-white tracking-widest flex items-center gap-2">
            <User size={16} style={{ color: 'var(--accent)' }} /> Contact
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <button
              onClick={() => window.electron?.send('open-external', 'https://github.com/abhi0-tech')}
              className="flex items-center justify-center gap-3 p-4 rounded-xl bg-black/40 border border-white/10 hover:border-white/30 hover:bg-white/[0.04] transition-all"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white shrink-0" aria-hidden="true">
                <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
              </svg>
              <span className="text-xs font-black text-white tracking-wider">GitHub</span>
            </button>

            <button
              onClick={() => window.electron?.send('open-external', 'https://discord.com/users/784003206492717086')}
              className="flex items-center justify-center gap-3 p-4 rounded-xl bg-black/40 border border-white/10 hover:border-white/30 hover:bg-white/[0.04] transition-all"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white shrink-0" aria-hidden="true">
                <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03ZM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z" />
              </svg>
              <span className="text-xs font-black text-white tracking-wider">Discord</span>
            </button>

            <button
              onClick={() => window.electron?.send('open-external', 'https://abhi0-tech.github.io/')}
              className="flex items-center justify-center gap-3 p-4 rounded-xl bg-black/40 border border-white/10 hover:border-white/30 hover:bg-white/[0.04] transition-all"
            >
              <img src={imgPortfolioFavicon} alt="Portfolio" className="w-5 h-5 object-contain rounded-sm shrink-0" />
              <span className="text-xs font-black text-white tracking-wider">Portfolio</span>
            </button>
          </div>

          <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-bold text-white">Credits</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Acer Crate — for Acer hardware config reference</div>
            </div>
            <button
              onClick={() => window.electron?.send('open-external', 'https://github.com/vergulesmatvey-oss/Acer-Crate')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 hover:border-white/30 hover:bg-white/[0.04] transition-all shrink-0"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white shrink-0" aria-hidden="true">
                <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
              </svg>
              <span className="text-xs font-black text-white tracking-wider">GitHub</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const tabContent = {
    home: homePanelJSX,
    scenario: scenarioPanelJSX,
    personal: personalPanelJSX,
    powerboot: powerBootPanelJSX,
    monitoring: monitoringPanelJSX,
    settings: settingsPanelJSX,
  };

  return (
    <div
      className="h-screen w-full bg-[#030508] text-white flex flex-col font-sans select-none overflow-hidden relative"
      style={{ '--accent': accentColor, '--accent-rgb': accentRgb }}
    >
      {/* FUTURISTIC AMBIENT BACKGROUND (zero-cost radial gradients, no heavy GPU blur) */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="bg-grid absolute inset-0 opacity-[0.06]" />
        <div
          className="orb-float-1 absolute rounded-full"
          style={{
            width: 560, height: 560, top: '-14%', left: '14%',
            background: `radial-gradient(circle, rgba(var(--accent-rgb), 0.14) 0%, transparent 65%)`,
          }}
        />
        <div
          className="orb-float-2 absolute rounded-full"
          style={{
            width: 500, height: 500, bottom: '-16%', right: '8%',
            background: `radial-gradient(circle, rgba(var(--accent-rgb), 0.12) 0%, transparent 65%)`,
          }}
        />
        <div
          className="orb-float-3 absolute rounded-full"
          style={{
            width: 400, height: 400, top: '36%', left: '46%',
            background: `radial-gradient(circle, rgba(56, 189, 248, 0.08) 0%, transparent 65%)`,
          }}
        />
      </div>

      {/* ── SPLASH SCREEN ── */}
      {splashVisible && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: '#030508',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          opacity: splashFading ? 0 : 1,
          transition: 'opacity 0.55s cubic-bezier(0.4, 0, 0.2, 1)',
          pointerEvents: splashFading ? 'none' : 'all',
        }}>
          <div className="bg-grid absolute inset-0 opacity-[0.06]" />
          <div className="relative z-10 flex flex-col items-center splash-reveal">
            <NitroLogoSvg mode="Balanced" style={{ height: 'clamp(140px, 24vh, 220px)' }} />
            <div className="mt-7 text-center">
              <div className="text-[36px] leading-none tracking-[0.34em] font-extralight text-white">
                NITRO<span className="font-black" style={{ color: 'var(--accent)' }}>HUB</span>
              </div>
              <div className="text-[10px] tracking-[0.46em] text-slate-400 mt-2 font-bold">
                PERFORMANCE CONTROL
              </div>
            </div>
            <div className="mt-7 w-48 h-1 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full splash-bar" style={{ backgroundColor: 'var(--accent)', boxShadow: '0 0 12px var(--accent)' }} />
            </div>
          </div>
        </div>
      )}

      <BootLogoInstructionsModal
        isOpen={isBootInstructionsOpen}
        onClose={() => setIsBootInstructionsOpen(false)}
        checked={bootInstructionsRead}
        onToggleChecked={setBootInstructionsRead}
      />
      {bootRestartNotice && (
        <div className="group fixed bottom-5 right-5 z-[9995] bg-[#070b12] border border-emerald-500/50 rounded-xl px-4 py-3 shadow-[0_0_30px_rgba(16,185,129,0.25)] flex items-center gap-3 modal-card">
          <CheckCircle size={16} className="text-emerald-400 shrink-0" />
          <span className="text-xs font-bold text-white">Restart to apply changes</span>
          <button
            onClick={() => setBootRestartNotice(false)}
            className="text-slate-400 hover:text-white ml-2 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X size={14} />
          </button>
        </div>
      )}
      <CloseActionModal
        isOpen={isClosePromptOpen}
        onClose={() => setIsClosePromptOpen(false)}
        onMinimizeToTray={() => {
          setCloseBehavior('tray');
          try { localStorage.setItem('nitro-close-behavior', 'tray'); } catch {}
          setIsClosePromptOpen(false);
          setTimeout(() => window.electron?.send('window-close-tray'), 180);
        }}
        onExitApp={() => {
          setCloseBehavior('exit');
          try { localStorage.setItem('nitro-close-behavior', 'exit'); } catch {}
          setIsClosePromptOpen(false);
          setTimeout(() => window.electron?.send('app-quit'), 180);
        }}
      />
      <AboutModal isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} snapshot={snapshot} serviceConnected={serviceConnected} />
      <DebugModal
        isOpen={isDebugOpen}
        onClose={() => setIsDebugOpen(false)}
        snapshot={snapshot}
        serviceConnected={serviceConnected}
        debugInfo={debugInfo}
        logs={debugLogs}
        onRefresh={refreshDebugInfo}
        onRetry={async () => {
          await window.nitro?.retryService?.();
          setTimeout(refreshDebugInfo, 800);
        }}
        onInstallService={async () => {
          await window.nitro?.installService?.();
          setTimeout(refreshDebugInfo, 1200);
        }}
      />
      <CurveGraphEditorModal
        isOpen={isCurveEditorOpen}
        onClose={() => setIsCurveEditorOpen(false)}
        curves={profile.curves}
        limits={telemetry?.limits}
        currentCpuTemp={cpuTemp}
        currentGpuTemp={gpuTemp}
        onSave={handleSaveCurves}
      />

      {/* TOP NAV / TITLE BAR */}
      <div className="relative z-10 bg-[#05080f]/90 border-b border-white/10 flex items-stretch shrink-0" style={{ minHeight: 50, WebkitAppRegion: 'drag' }}>
        <div className="flex items-center px-4 border-r border-white/10 shrink-0" style={{ WebkitAppRegion: 'no-drag' }}>
          <NitroLogoSvg mode={activeOperatingMode} height={28} animated={false} />
        </div>
        <nav className="flex items-stretch" style={{ WebkitAppRegion: 'no-drag' }}>
          {[
            { id: 'home', label: 'Home' },
            { id: 'scenario', label: 'Scenario' },
            { id: 'personal', label: 'Lighting' },
            { id: 'powerboot', label: 'Power & boot' },
            { id: 'monitoring', label: 'Monitoring' },
            { id: 'settings', label: 'Settings' },
          ].map(t => (
            <NavTab key={t.id} id={t.id} label={t.label} activeTab={activeTab} onSelect={setActiveTab} />
          ))}
          <div className="flex items-center gap-2 px-4 border-l border-white/10">
            <button onClick={() => window.electron?.send('launch-nvidia')} title="Open NVIDIA App"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-emerald-500/30 bg-emerald-950/30 hover:border-emerald-400/60 transition-all">
              <img src={imgNvidia} alt="NVIDIA App" className="h-4 w-auto object-contain" />
              <span className="text-[9px] font-black tracking-widest whitespace-nowrap text-emerald-400">NVIDIA App</span>
            </button>
            {showDebugButton && (
              <button onClick={openDebugModal} title="Open Hardware & Service Debugger"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/10 bg-white/5 hover:border-[var(--accent)] transition-all"
                style={{ color: 'var(--accent)' }}>
                <Activity size={12} />
                <span className="text-[9px] font-black tracking-widest whitespace-nowrap">Debug</span>
              </button>
            )}
          </div>
        </nav>
        <div className="ml-auto flex items-center gap-1.5 px-3 border-l border-white/10" style={{ WebkitAppRegion: 'no-drag' }}>
          <button onClick={() => window.electron?.send('window-minimize')} className="p-1.5 rounded-lg border border-white/10 bg-white/5 hover:border-[var(--accent)] transition-all text-slate-300 hover:text-white"><Minus size={13} /></button>
          <button onClick={() => window.electron?.send('window-maximize')} className="p-1.5 rounded-lg border border-white/10 bg-white/5 hover:border-[var(--accent)] transition-all text-slate-300 hover:text-white"><Square size={11} /></button>
          <button onClick={handleCloseAction} className="p-1.5 rounded-lg border border-red-900/50 bg-white/5 hover:border-red-500 hover:bg-red-700/30 transition-all text-red-400"><X size={13} /></button>
        </div>
      </div>

      {/* MAIN */}
      <div className="relative z-10 flex flex-1 overflow-hidden">
        <div key={activeTab} className="flex-1 flex overflow-hidden" style={{ animation: 'page-enter 180ms ease both' }}>
          {tabContent[activeTab] ?? homePanelJSX}
        </div>

        {/* RIGHT SIDEBAR */}
        <div className="w-[210px] shrink-0 border-l border-white/10 bg-[#05080f]/80 flex flex-col overflow-y-auto">
          {/* Mode dropdown */}
          <div className="border-b border-white/10">
            <button onClick={() => setSidebarDrop(v => v === 'mode' ? null : 'mode')}
              className="px-4 py-3 flex items-center justify-between w-full hover:bg-white/5 transition-all">
              <div className="flex items-center gap-2 text-[10px] font-bold text-white tracking-widest">
                <LayoutDashboard size={11} style={{ color: 'var(--accent)' }} /> Mode
              </div>
              <div className="flex items-center gap-1 text-[11px] font-bold" style={{ color: 'var(--accent)' }}>
                {activeModeMeta.label}
                <ChevronRight size={11} className={`transition-transform ${sidebarDrop === 'mode' ? 'rotate-90' : ''}`} />
              </div>
            </button>
            {sidebarDrop === 'mode' && (
              <div className="bg-black/60 border-t border-white/10 py-1">
                {supportedModes.map(m => {
                  const allowed = allowedModes.includes(m);
                  return (
                    <button key={m} disabled={!allowed} onClick={() => { handleOperatingModeChange(m); setSidebarDrop(null); }}
                      className={`w-full px-5 py-2 text-left text-[11px] font-bold tracking-widest transition-all flex items-center justify-between ${
                        activeOperatingMode === m ? 'text-white bg-[rgba(var(--accent-rgb),0.1)]'
                          : allowed ? 'text-slate-400 hover:text-white hover:bg-white/5'
                            : 'text-slate-700 cursor-not-allowed'
                      }`}>
                      {m}
                      {activeOperatingMode === m && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--accent)' }} />}
                    </button>
                  );
                })}
                <div className="border-t border-white/10 mt-1" />
                <button onClick={() => { setSidebarDrop(null); setActiveTab('scenario'); }}
                  className="w-full px-5 py-2 text-left text-[10px] font-bold text-slate-500 hover:text-white tracking-widest transition-all flex items-center gap-1.5">
                  <ChevronRight size={9} /> Full Settings
                </button>
              </div>
            )}
          </div>

          {/* Fan dropdown */}
          <div className="border-b border-white/10">
            <button onClick={() => setSidebarDrop(v => v === 'fan' ? null : 'fan')}
              className="px-4 py-3 flex items-center justify-between w-full hover:bg-white/5 transition-all">
              <div className="flex items-center gap-2 text-[10px] font-bold text-white tracking-widest">
                <Fan size={11} style={{ color: 'var(--accent)' }} /> Fan
              </div>
              <div className="flex items-center gap-1 text-[11px] font-bold capitalize" style={{ color: 'var(--accent)' }}>
                {fanMode}
                <ChevronRight size={11} className={`transition-transform ${sidebarDrop === 'fan' ? 'rotate-90' : ''}`} />
              </div>
            </button>
            {sidebarDrop === 'fan' && (
              <div className="bg-black/60 border-t border-white/10 py-1">
                {['auto', 'max', 'custom'].map(m => (
                  <button key={m} onClick={() => { handleFanModeChange(m); setSidebarDrop(null); }}
                    className={`w-full px-5 py-2 text-left text-[11px] font-bold tracking-widest transition-all flex items-center justify-between ${
                      fanMode === m ? 'text-white bg-[rgba(var(--accent-rgb),0.1)]' : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}>
                    {m}
                    {fanMode === m && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--accent)' }} />}
                  </button>
                ))}
                <div className="border-t border-white/10 mt-1" />
                <button onClick={() => { setSidebarDrop(null); setActiveTab('scenario'); }}
                  className="w-full px-5 py-2 text-left text-[10px] font-bold text-slate-500 hover:text-white tracking-widest transition-all flex items-center gap-1.5">
                  <ChevronRight size={9} /> Full Settings
                </button>
              </div>
            )}
          </div>

          {/* Monitoring mini stats */}
          <div className="border-b border-white/10 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-black text-white tracking-widest">Monitoring</span>
              <Settings size={11} className="text-slate-500" />
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-center">
              {[
                { label: 'GPU', value: gpuLoad, unit: '%' },
                { label: 'GPU', value: telemetry?.gpuAsleep ? '—' : gpuTemp, unit: '°C' },
                { label: 'CPU', value: cpuLoad, unit: '%' },
                { label: 'CPU', value: cpuTemp, unit: '°C' },
                { label: 'System', value: sysTemp, unit: '°C' },
                { label: 'RAM', value: telemetry?.ramUsage || 0, unit: '%' },
              ].map((item, i) => (
                <div key={i} className="bg-black/40 rounded-lg p-2 border border-white/10 hover-card">
                  <div className="text-[15px] font-black text-white leading-none">{item.value}</div>
                  <div className="text-[11px] font-bold mt-0.5" style={{ color: 'var(--accent)' }}>{item.unit}</div>
                  <div className="text-[10px] text-slate-400 mt-px whitespace-nowrap overflow-hidden">{item.label}</div>
                </div>
              ))}
            </div>
            <button onClick={() => setActiveTab('monitoring')} className="w-full mt-2 py-1 flex items-center justify-end text-[10px] text-slate-300 hover:text-white font-bold tracking-widest gap-1">
              Details <ChevronRight size={9} />
            </button>
          </div>

          {/* Windows Update */}
          <div className="border-b border-white/10 p-4">
            <div className="text-[11px] font-black text-white tracking-widest mb-3">Windows Update</div>
            {wuStatus === 'idle' && <div className="text-[10px] text-slate-400 font-bold text-center py-1">Press Check Now to scan</div>}
            {wuStatus === 'checking' && <div className="text-[10px] font-bold text-center py-1 animate-pulse" style={{ color: 'var(--accent)' }}>Scanning for updates…</div>}
            {wuStatus === 'done' && wuResult && (
              <div className="space-y-1.5 mb-2">
                {wuResult.error ? (
                  <div className="text-[9px] text-red-400 font-bold text-center py-1">{wuResult.error}</div>
                ) : wuResult.count === 0 ? (
                  <div className="flex items-center gap-1.5 justify-center py-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_#10b981]" />
                    <span className="text-[10px] text-emerald-400 font-bold">Up to date</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5 justify-center py-1">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--accent)' }} />
                      <span className="text-[10px] font-bold" style={{ color: 'var(--accent)' }}>{wuResult.count} update{wuResult.count !== 1 ? 's' : ''} available</span>
                    </div>
                    <div className="max-h-20 overflow-y-auto space-y-0.5">
                      {wuResult.updates.map((t, i) => (
                        <div key={i} className="text-[8px] text-slate-300 bg-black/40 rounded px-2 py-0.5 truncate border border-white/10" title={t}>{t}</div>
                      ))}
                    </div>
                    <button onClick={() => window.electron?.send('open-windows-update')}
                      className="w-full mt-1 py-1.5 rounded-lg bg-[rgba(var(--accent-rgb),0.15)] border border-[rgba(var(--accent-rgb),0.4)] text-[9px] font-black tracking-widest hover:brightness-110 transition-all"
                      style={{ color: 'var(--accent)' }}>
                      Open Windows Update
                    </button>
                  </>
                )}
              </div>
            )}
            <button
              onClick={async () => {
                setWuStatus('checking');
                setWuResult(null);
                try {
                  const res = await window.electron?.invoke('check-windows-updates');
                  setWuResult(res);
                } catch (e) {
                  setWuResult({ count: 0, updates: [], error: String(e) });
                } finally {
                  setWuStatus('done');
                }
              }}
              disabled={wuStatus === 'checking'}
              className="w-full mt-1 py-2 rounded-lg bg-white/5 border border-white/10 text-[10px] font-black text-white tracking-widest hover:border-[var(--accent)] transition-all disabled:opacity-50"
            >
              {wuStatus === 'checking' ? 'Checking…' : 'Check Now'}
            </button>
          </div>

          {/* Status */}
          <div className="mt-auto p-3 border-t border-white/10 w-full flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${serviceConnected ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-red-500'}`} />
              <span className="text-[8px] font-bold text-white tracking-widest">
                {serviceConnected ? 'Service Connected' : 'Service Offline'}
              </span>
            </div>
            {showDebugButton && (
              <button onClick={openDebugModal} className="text-[8px] font-black tracking-widest hover:underline" style={{ color: 'var(--accent)' }}>
                Debug
              </button>
            )}
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #030508; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--accent); }
        input[type="range"].nitro-slider { -webkit-appearance: none; height: 6px; border-radius: 999px; outline: none; }
        input[type="range"].nitro-slider::-webkit-slider-thumb {
          -webkit-appearance: none; height: 16px; width: 16px; border-radius: 50%;
          background: #ffffff; cursor: pointer; border: 2.5px solid var(--accent);
          box-shadow: 0 0 12px rgba(var(--accent-rgb), 0.85); transition: transform 0.15s ease;
        }
        input[type="range"].nitro-slider:active::-webkit-slider-thumb { transform: scale(1.22); }
        @keyframes nitro-breathe {
          0%, 100% { transform: scale(1); opacity: 0.94; }
          50% { transform: scale(1.04); opacity: 1; }
        }
        .nitro-logo-breathe { animation: nitro-breathe 3.8s ease-in-out infinite; will-change: transform, opacity; }
        @keyframes splash-reveal-kf {
          from { opacity: 0; transform: scale(0.92) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .splash-reveal { animation: splash-reveal-kf 650ms cubic-bezier(0.22, 1, 0.36, 1) both; }
        @keyframes splash-bar-kf {
          0% { width: 0%; }
          100% { width: 100%; }
        }
        .splash-bar { animation: splash-bar-kf 1.65s cubic-bezier(0.22, 1, 0.36, 1) both; }
        @keyframes orb-drift-1 {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          50% { transform: translate(60px, 40px) scale(1.12); }
        }
        @keyframes orb-drift-2 {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          50% { transform: translate(-55px, -35px) scale(1.15); }
        }
        @keyframes orb-drift-3 {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          50% { transform: translate(35px, -50px) scale(0.92); }
        }
        .orb-float-1 { animation: orb-drift-1 14s ease-in-out infinite; }
        .orb-float-2 { animation: orb-drift-2 18s ease-in-out infinite; }
        .orb-float-3 { animation: orb-drift-3 12s ease-in-out infinite; }
        .bg-grid {
          background-image: linear-gradient(rgba(var(--accent-rgb), 0.25) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(var(--accent-rgb), 0.25) 1px, transparent 1px);
          background-size: 48px 48px;
          mask-image: radial-gradient(ellipse at center, black 35%, transparent 85%);
        }
        @keyframes page-enter { from { opacity:0; transform:translateY(5px); } to { opacity:1; transform:translateY(0); } }
        .hover-card { transition: transform 200ms ease, border-color 200ms ease, box-shadow 200ms ease; }
        .hover-card:hover { transform: translateY(-2px); border-color: rgba(var(--accent-rgb), 0.45) !important; box-shadow: 0 8px 28px rgba(var(--accent-rgb), 0.12); }
        .hover-panel { transition: border-color 200ms ease, box-shadow 200ms ease; }
        .hover-panel:hover { border-color: rgba(var(--accent-rgb), 0.4) !important; box-shadow: 0 6px 24px rgba(var(--accent-rgb), 0.08); }
        @keyframes modal-enter { from { opacity:0; transform:scale(0.92) translateY(14px); } to { opacity:1; transform:scale(1) translateY(0); } }
        @keyframes modal-exit { from { opacity:1; transform:scale(1) translateY(0); } to { opacity:0; transform:scale(0.94) translateY(10px); } }
        @keyframes overlay-enter { from { opacity:0; } to { opacity:1; } }
        @keyframes overlay-exit { from { opacity:1; } to { opacity:0; } }
        .modal-overlay { animation: overlay-enter 180ms ease-out both; }
        .modal-overlay-exit { animation: overlay-exit 180ms ease-in both; pointer-events: none; }
        .modal-card { animation: modal-enter 240ms cubic-bezier(0.22, 1, 0.36, 1) both; }
        .modal-card-exit { animation: modal-exit 180ms cubic-bezier(0.4, 0, 1, 1) both; }
        button:not(:disabled):active { transform: scale(0.97) !important; transition: transform 60ms ease !important; }
      ` }} />
    </div>
  );
};
export default App;
