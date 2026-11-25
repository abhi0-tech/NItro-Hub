import React from 'react';

const CircularGauge = ({ value, max = 100, size = 160, strokeWidth = 10, label, unit = '°C', sublabel = null }) => {
  const radius = (size - strokeWidth * 2) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const startDeg = 150;
  const fullSweep = 240;

  const isDash = value === '—' || value === null || value === undefined;
  const numeric = isDash ? 0 : Math.max(0, Number(value) || 0);
  const pct = Math.min(1, Math.max(0, numeric / (max || 100)));

  const toRad = (d) => (d * Math.PI) / 180;
  const s = toRad(startDeg);
  const e = toRad(startDeg + fullSweep);
  const x1 = cx + radius * Math.cos(s);
  const y1 = cy + radius * Math.sin(s);
  const x2 = cx + radius * Math.cos(e);
  const y2 = cy + radius * Math.sin(e);
  const fullArcPath = `M ${x1} ${y1} A ${radius} ${radius} 0 1 1 ${x2} ${y2}`;

  const getStrokeColor = (p) => {
    if (p > 0.88) return '#ff2244';
    if (p > 0.72) return '#f59e0b';
    return 'var(--accent)';
  };

  const strokeColor = getStrokeColor(pct);
  const dashOffset = 100 - pct * 100;
  const glowId = `gauge-glow-${String(label).replace(/\s+/g, '-')}-${size}`;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size, paddingTop: 6 }}>
        <svg width={size} height={size} className="absolute inset-0" style={{ overflow: 'visible' }}>
          <defs>
            <filter id={glowId}>
              <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background Track */}
          <path
            d={fullArcPath}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Smoothly Animated Progress Arc via strokeDashoffset */}
          <path
            d={fullArcPath}
            pathLength="100"
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray="100"
            strokeDashoffset={dashOffset}
            filter={`url(#${glowId})`}
            style={{
              opacity: pct > 0.005 ? 1 : 0,
              transition: 'stroke-dashoffset 550ms cubic-bezier(0.22, 1, 0.36, 1), stroke 350ms ease, opacity 250ms ease',
            }}
          />

          {/* Tick marks */}
          {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
            const angle = (startDeg + fullSweep * t) * (Math.PI / 180);
            const outerR = radius + strokeWidth * 0.72;
            const innerR = radius - strokeWidth * 0.55;
            return (
              <line
                key={i}
                x1={cx + innerR * Math.cos(angle)}
                y1={cy + innerR * Math.sin(angle)}
                x2={cx + outerR * Math.cos(angle)}
                y2={cy + outerR * Math.sin(angle)}
                stroke="rgba(var(--accent-rgb), 0.3)"
                strokeWidth="1.5"
              />
            );
          })}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-black text-white leading-none tabular-nums"
            style={{
              fontSize: size * 0.22,
              textShadow: `0 0 20px rgba(var(--accent-rgb), 0.45)`,
            }}
          >
            {value ?? '—'}
          </span>
          <span className="font-bold uppercase tracking-wider" style={{ color: 'var(--accent)', fontSize: size * 0.075, marginTop: 3 }}>
            {unit}
          </span>
        </div>
      </div>
      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">{label}</span>
      {sublabel && <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{sublabel}</span>}
    </div>
  );
};

export default CircularGauge;
