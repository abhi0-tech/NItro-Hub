import React, { useEffect, useMemo, useRef, useState } from 'react';

const BLADES = 9;
const SWEEP = 0.6;
const THICKNESS = 0.13;
const VISUAL_SCALE = 0.013; // Prevents 9-blade (40 deg) stroboscopic backward aliasing at max RPM
const MIN_TURNS_PER_SEC = 0.12;
const FULL_SPEED_RPM = 5500;

function polar(cx, cy, r, angle) {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

function buildBladesPath(cx, cy, inner, outer, offset = 0) {
  let d = '';
  for (let i = 0; i < BLADES; i++) {
    const a = offset + (i * Math.PI * 2) / BLADES;
    const [x0, y0] = polar(cx, cy, inner, a);
    const [qx1, qy1] = polar(cx, cy, (inner + outer) * 0.52, a + SWEEP * 0.22);
    const [x1, y1] = polar(cx, cy, outer, a + SWEEP);
    const [x2, y2] = polar(cx, cy, outer, a + SWEEP + THICKNESS);
    const [qx2, qy2] = polar(cx, cy, (inner + outer) * 0.5, a + SWEEP * 0.22 + THICKNESS * 1.4);
    const [x3, y3] = polar(cx, cy, inner, a + THICKNESS);
    d += `M ${x0.toFixed(2)} ${y0.toFixed(2)} Q ${qx1.toFixed(2)} ${qy1.toFixed(2)} ${x1.toFixed(2)} ${y1.toFixed(2)} L ${x2.toFixed(2)} ${y2.toFixed(2)} Q ${qx2.toFixed(2)} ${qy2.toFixed(2)} ${x3.toFixed(2)} ${y3.toFixed(2)} Z `;
  }
  return d;
}

const FanRotor = ({ rpm = 0, boost = 0, size = 84 }) => {
  const rotorRef = useRef(null);
  const angleRef = useRef(0);
  const rafRef = useRef(null);
  const lastRef = useRef(performance.now());
  const rpmRef = useRef(rpm);
  rpmRef.current = Number(rpm) || 0;

  useEffect(() => {
    lastRef.current = performance.now();
    const tick = (now) => {
      if (!document.hidden) {
        const dt = Math.min(0.05, (now - lastRef.current) / 1000);
        lastRef.current = now;
        const currentRpm = rpmRef.current;
        if (currentRpm > 0) {
          const turnsPerSec = Math.max(MIN_TURNS_PER_SEC, (currentRpm / 60) * VISUAL_SCALE);
          angleRef.current = (angleRef.current + turnsPerSec * 360 * dt) % 360;
          if (rotorRef.current) {
            rotorRef.current.setAttribute('transform', `rotate(${angleRef.current.toFixed(1)} 50 50)`);
          }
        }
      } else {
        lastRef.current = now;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const cx = 50;
  const cy = 50;
  const ringR = 45;
  const impR = 35;
  const hubR = impR * 0.36;

  const numericRpm = Number(rpm) || 0;
  const turnsPerSec = numericRpm <= 0 ? 0 : Math.max(MIN_TURNS_PER_SEC, (numericRpm / 60) * VISUAL_SCALE);
  const smear = Math.min((Math.PI * 2) / BLADES * 0.45, turnsPerSec * Math.PI * 2 * 0.025);
  const copies = smear > 0.03 ? Math.min(4, Math.ceil(smear / 0.05) + 1) : 1;
  const level = Math.min(1, Math.max(0, numericRpm / FULL_SPEED_RPM));

  const bladePaths = useMemo(() => {
    const arr = [];
    for (let k = 0; k < copies; k++) {
      const offset = copies === 1 ? 0 : (-smear * k) / (copies - 1);
      arr.push({
        d: buildBladesPath(cx, cy, hubR * 0.96, impR, offset),
        opacity: k === 0 ? 0.88 : 0.45 / copies,
      });
    }
    return arr;
  }, [copies, smear]);

  const boostPct = Math.min(100, Math.max(0, Number(boost) || 0));
  const boostOffset = 100 - boostPct;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="w-full h-full">
        {/* Outer Ring Track */}
        <circle cx={cx} cy={cy} r={ringR} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3.2" />
        <circle cx={cx} cy={cy} r={ringR - 6} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />

        {/* Boost Ring Arc */}
        {boostPct > 0 && (
          <circle
            cx={cx}
            cy={cy}
            r={ringR}
            pathLength="100"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeDasharray="100"
            strokeDashoffset={boostOffset}
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{
              filter: 'drop-shadow(0 0 5px rgba(var(--accent-rgb), 0.7))',
              transition: 'stroke-dashoffset 400ms ease',
            }}
          />
        )}

        {/* Spinning Impeller */}
        <g ref={rotorRef} transform="rotate(0 50 50)">
          {level > 0 && (
            <circle cx={cx} cy={cy} r={impR} fill={`rgba(255,255,255,${Math.min(0.06, level * 0.07).toFixed(3)})`} />
          )}
          {bladePaths.map((b, i) => (
            <path key={i} d={b.d} fill={`rgba(226, 232, 240, ${b.opacity})`} />
          ))}
          <circle cx={cx} cy={cy} r={hubR} fill="#0b111a" stroke="rgba(255,255,255,0.22)" strokeWidth="1.2" />
          <circle cx={cx} cy={cy} r={hubR * 0.52} fill="var(--accent)" />
        </g>
      </svg>
    </div>
  );
};

export default FanRotor;
