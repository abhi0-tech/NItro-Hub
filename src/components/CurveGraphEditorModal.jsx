import React, { useEffect, useRef, useState } from 'react';
import { Gauge, Plus, RotateCcw, Trash2, X } from 'lucide-react';

const MIN_TEMP = 20;
const MAX_TEMP = 100;
const MAX_POINTS = 12;

const DEFAULT_CPU_CURVE = [
  { temperature: 88, percent: 0 },
  { temperature: 94, percent: 100 },
];
const DEFAULT_GPU_CURVE = [
  { temperature: 81, percent: 0 },
  { temperature: 87, percent: 100 },
];

const quantize10 = (v) => Math.round(Math.max(0, Math.min(100, Number(v) || 0)) / 10) * 10;

// Exact port of AcerCrate.Core.Control.FanCurve.Evaluate
function evaluateCurve(points, temp) {
  if (!points || points.length === 0) return 100;
  const sorted = [...points].sort((a, b) => a.temperature - b.temperature);
  if (temp <= sorted[0].temperature) return sorted[0].percent;
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if (temp > b.temperature) continue;
    if (b.temperature === a.temperature) return Math.max(a.percent, b.percent);
    const t = (temp - a.temperature) / (b.temperature - a.temperature);
    return quantize10(Math.round(a.percent + (b.percent - a.percent) * t));
  }
  return sorted[sorted.length - 1].percent;
}

const CurveGraphEditorModal = ({ isOpen, onClose, curves, limits, currentCpuTemp, currentGpuTemp, onSave }) => {
  const [activeFan, setActiveFan] = useState('Cpu');
  const [localCurves, setLocalCurves] = useState({ Cpu: DEFAULT_CPU_CURVE, Gpu: DEFAULT_GPU_CURVE });
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [draggingIdx, setDraggingIdx] = useState(null);
  const svgRef = useRef(null);

  const [mounted, setMounted] = useState(isOpen);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      setClosing(false);
    } else if (mounted) {
      setClosing(true);
      const t = setTimeout(() => { setMounted(false); setClosing(false); }, 180);
      return () => clearTimeout(t);
    }
  }, [isOpen, mounted]);

  useEffect(() => {
    if (isOpen) {
      setLocalCurves({
        Cpu: JSON.parse(JSON.stringify(curves?.Cpu?.curve?.points || DEFAULT_CPU_CURVE)),
        Gpu: JSON.parse(JSON.stringify(curves?.Gpu?.curve?.points || DEFAULT_GPU_CURVE)),
      });
      setSelectedIdx(0);
      setDraggingIdx(null);
    }
  }, [curves, isOpen]);

  if (!mounted) return null;

  const points = [...(localCurves[activeFan] || [])].sort((a, b) => a.temperature - b.temperature);
  const liveTemp = activeFan === 'Cpu' ? (currentCpuTemp || 0) : (currentGpuTemp || 0);
  const liveBoost = evaluateCurve(points, liveTemp);

  // SVG plot area
  const W = 620;
  const H = 300;
  const padL = 48;
  const padR = 24;
  const padT = 20;
  const padB = 36;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const toX = (temp) => padL + ((temp - MIN_TEMP) / (MAX_TEMP - MIN_TEMP)) * plotW;
  const toY = (pct) => padT + ((100 - pct) / 100) * plotH;
  const fromClient = (clientX, clientY) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { temperature: 60, percent: 50 };
    const sx = ((clientX - rect.left) / rect.width) * W;
    const sy = ((clientY - rect.top) / rect.height) * H;
    const temp = Math.round(Math.max(MIN_TEMP, Math.min(MAX_TEMP, MIN_TEMP + ((sx - padL) / plotW) * (MAX_TEMP - MIN_TEMP))));
    const pct = quantize10(100 - ((sy - padT) / plotH) * 100);
    return { temperature: temp, percent: pct };
  };

  const setFanPoints = (nextPts) => {
    const sorted = [...nextPts].sort((a, b) => a.temperature - b.temperature);
    setLocalCurves(prev => ({ ...prev, [activeFan]: sorted }));
  };

  const handleSvgMouseMove = (e) => {
    if (draggingIdx === null) return;
    const { temperature, percent } = fromClient(e.clientX, e.clientY);
    const next = [...points];
    next[draggingIdx] = { temperature, percent };
    const moved = next[draggingIdx];
    const sorted = [...next].sort((a, b) => a.temperature - b.temperature);
    setLocalCurves(prev => ({ ...prev, [activeFan]: sorted }));
    const newIdx = sorted.indexOf(moved);
    if (newIdx >= 0) {
      setDraggingIdx(newIdx);
      setSelectedIdx(newIdx);
    }
  };

  const handleSvgClick = (e) => {
    if (draggingIdx !== null) return;
    if (e.target?.dataset?.point === '1') return;
    if (points.length >= MAX_POINTS) return;
    const pt = fromClient(e.clientX, e.clientY);
    const next = [...points, pt].sort((a, b) => a.temperature - b.temperature);
    setFanPoints(next);
    setSelectedIdx(next.indexOf(pt));
  };

  const removePoint = (idx) => {
    if (points.length <= 1) return;
    const next = points.filter((_, i) => i !== idx);
    setFanPoints(next);
    setSelectedIdx(Math.max(0, Math.min(selectedIdx, next.length - 1)));
  };

  const resetAntiThrottle = () => {
    const cpuLim = limits?.cpu || 100;
    const gpuLim = limits?.gpu || 87;
    setLocalCurves({
      Cpu: [
        { temperature: Math.max(MIN_TEMP, cpuLim - 12), percent: 0 },
        { temperature: Math.max(MIN_TEMP, cpuLim - 6), percent: 100 },
      ],
      Gpu: [
        { temperature: Math.max(MIN_TEMP, gpuLim - 6), percent: 0 },
        { temperature: Math.max(MIN_TEMP, gpuLim), percent: 100 },
      ],
    });
    setSelectedIdx(0);
  };

  // Build polyline path including flat extension at both ends (like FanCurve.Evaluate)
  const polyCoords = [
    `${toX(MIN_TEMP)},${toY(points[0]?.percent ?? 0)}`,
    ...points.map(p => `${toX(p.temperature)},${toY(p.percent)}`),
    `${toX(MAX_TEMP)},${toY(points[points.length - 1]?.percent ?? 100)}`,
  ];
  const areaPath = `M ${toX(MIN_TEMP)},${toY(0)} L ${polyCoords.join(' L ')} L ${toX(MAX_TEMP)},${toY(0)} Z`;
  const selectedPt = points[selectedIdx];

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/85 backdrop-blur-md ${closing ? 'modal-overlay-exit' : 'modal-overlay'}`}
      onMouseUp={() => setDraggingIdx(null)}
    >
      <div className={`bg-[#070b12] border border-white/10 w-full max-w-3xl rounded-2xl shadow-[0_0_80px_rgba(var(--accent-rgb),0.18)] flex flex-col max-h-[90vh] overflow-hidden ${closing ? 'modal-card-exit' : 'modal-card'}`}>
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex justify-between items-center">
          <div>
            <h3 className="text-lg font-black text-white tracking-wider flex items-center gap-2.5">
              <Gauge style={{ color: 'var(--accent)' }} size={20} /> Fan Curve Graph Editor
            </h3>
            <p className="text-[10px] text-slate-400 font-bold tracking-widest mt-1">
              Click grid to add · Drag nodes to adjust (10% boost steps, max {MAX_POINTS} points)
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg transition-all text-slate-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Fan selector + live readout */}
        <div className="px-6 pt-4 flex items-center justify-between">
          <div className="flex gap-2">
            {['Cpu', 'Gpu'].map(fan => (
              <button
                key={fan}
                onClick={() => { setActiveFan(fan); setSelectedIdx(0); }}
                className={`px-5 py-2 rounded-xl border text-[11px] font-black tracking-widest transition-all ${
                  activeFan === fan
                    ? 'text-white border-[var(--accent)] bg-[rgba(var(--accent-rgb),0.15)]'
                    : 'bg-black/40 border-white/10 text-slate-400 hover:border-white/25'
                }`}
              >
                {fan === 'Cpu' ? 'CPU Fan' : 'GPU Fan'}
              </button>
            ))}
          </div>
          <div className="text-[11px] font-bold text-slate-300 bg-black/40 border border-white/10 px-3 py-1.5 rounded-xl">
            Live: <span className="text-white font-black">{liveTemp}°C</span> → <span style={{ color: 'var(--accent)' }} className="font-black">{liveBoost}% Boost</span>
          </div>
        </div>

        {/* Interactive SVG Graph */}
        <div className="p-6 pb-3">
          <div className="bg-[#030508] border border-white/10 rounded-xl p-2 select-none">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              className="w-full h-auto cursor-crosshair"
              onMouseMove={handleSvgMouseMove}
              onMouseLeave={() => setDraggingIdx(null)}
              onClick={handleSvgClick}
            >
              <defs>
                <linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {/* Horizontal Grid Lines (0..100%) */}
              {[0, 20, 40, 60, 80, 100].map(pct => {
                const y = toY(pct);
                return (
                  <g key={pct}>
                    <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
                    <text x={padL - 8} y={y + 3} textAnchor="end" fill="#64748b" fontSize="10" fontWeight="700">{pct}%</text>
                  </g>
                );
              })}

              {/* Vertical Grid Lines (20..100°C) */}
              {[20, 30, 40, 50, 60, 70, 80, 90, 100].map(temp => {
                const x = toX(temp);
                return (
                  <g key={temp}>
                    <line x1={x} y1={padT} x2={x} y2={H - padB} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
                    <text x={x} y={H - padB + 16} textAnchor="middle" fill="#64748b" fontSize="10" fontWeight="700">{temp}°C</text>
                  </g>
                );
              })}

              {/* Live Temp Vertical Marker */}
              {liveTemp >= MIN_TEMP && liveTemp <= MAX_TEMP && (
                <g>
                  <line
                    x1={toX(liveTemp)} y1={padT}
                    x2={toX(liveTemp)} y2={H - padB}
                    stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 3"
                  />
                  <circle cx={toX(liveTemp)} cy={toY(liveBoost)} r="4" fill="#f59e0b" />
                </g>
              )}

              {/* Curve Area + Line */}
              <path d={areaPath} fill="url(#curveFill)" />
              <polyline
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2.5"
                strokeLinejoin="round"
                points={polyCoords.join(' ')}
              />

              {/* Draggable Nodes */}
              {points.map((pt, idx) => {
                const cx = toX(pt.temperature);
                const cy = toY(pt.percent);
                const isSel = idx === selectedIdx;
                return (
                  <g
                    key={idx}
                    data-point="1"
                    className="cursor-grab active:cursor-grabbing"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setSelectedIdx(idx);
                      setDraggingIdx(idx);
                    }}
                  >
                    <circle data-point="1" cx={cx} cy={cy} r={isSel ? 12 : 9} fill="rgba(var(--accent-rgb), 0.18)" />
                    <circle
                      data-point="1"
                      cx={cx}
                      cy={cy}
                      r={isSel ? 6 : 5}
                      fill={isSel ? '#ffffff' : 'var(--accent)'}
                      stroke="var(--accent)"
                      strokeWidth="2.5"
                    />
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Selected Node Bar */}
        <div className="px-6 pb-4 flex items-center gap-3 text-xs">
          {selectedPt ? (
            <div className="flex items-center gap-3 bg-black/40 border border-white/10 rounded-xl px-4 py-2 w-full">
              <span className="text-[10px] font-black tracking-widest text-slate-400">Point #{selectedIdx + 1}</span>
              <span className="text-white font-bold">{selectedPt.temperature}°C</span>
              <span className="text-slate-500">→</span>
              <span style={{ color: 'var(--accent)' }} className="font-black">{selectedPt.percent}% Boost</span>
              <div className="flex-1" />
              <button
                onClick={() => removePoint(selectedIdx)}
                disabled={points.length <= 1}
                className="flex items-center gap-1 text-[10px] font-black tracking-wider text-red-400 hover:text-red-300 disabled:opacity-30"
              >
                <Trash2 size={13} /> Delete Point
              </button>
            </div>
          ) : (
            <div className="text-[11px] text-slate-500">Select or click the graph to add a point ({points.length}/{MAX_POINTS}).</div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-white/10 flex items-center gap-3">
          <button
            onClick={resetAntiThrottle}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 text-slate-300 hover:text-white text-[10px] font-black tracking-widest transition-all border border-white/10"
          >
            <RotateCcw size={14} /> Anti-Throttle Default
          </button>
          <div className="flex-1" />
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl bg-white/5 text-[10px] font-black tracking-widest text-slate-400 hover:text-white transition-all">
            Discard
          </button>
          <button
            onClick={() => {
              onSave({
                Cpu: { curve: { points: [...localCurves.Cpu].sort((a, b) => a.temperature - b.temperature) } },
                Gpu: { curve: { points: [...localCurves.Gpu].sort((a, b) => a.temperature - b.temperature) } },
              });
              onClose();
            }}
            className="px-7 py-2.5 rounded-xl text-black text-[10px] font-black tracking-widest transition-all hover:brightness-110"
            style={{ backgroundColor: 'var(--accent)', boxShadow: '0 0 24px rgba(var(--accent-rgb), 0.35)' }}
          >
            Apply Curve
          </button>
        </div>
      </div>
    </div>
  );
};

export default CurveGraphEditorModal;
